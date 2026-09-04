-- Auto-generated Daily Reports: if a member doesn't submit their own
-- Daily Report for a day, the system files one on their behalf so the
-- admin still sees what actually happened instead of a silent gap.
--
-- No scheduler exists in this project (confirmed repeatedly across this
-- migration history -- 0026's weekly-winner finalization and 0099's
-- points system both note it and both solve it the same way), so this
-- can't run at midnight on a timer. It uses the exact same lazy-finalize
-- idiom get_leaderboards/finalize_last_week_winners (0026) already
-- established: the first time any admin loads the page that needs the
-- answer, finalize_missing_daily_reports() checks *yesterday* (today
-- isn't over yet, so it's never auto-filed) and files anything missing,
-- guarded per-member by a plain NOT EXISTS check -- calling it again the
-- same day is a cheap no-op. Scope is deliberately "yesterday only", same
-- as finalize_last_week_winners only ever looks at "last week" and
-- doesn't backfill an open-ended history of gaps either -- if admins go
-- more than a day without loading an admin page, older gaps stay
-- unfilled. That's an accepted, precedented limit here, not an oversight.
--
-- The auto-filed numbers are real, not invented: computed from the exact
-- same tables the manual flow (submit_daily_report, 0094) is itself built
-- on -- member_progress for Learning Hub tasks due that day,
-- rank_task_submissions.task_date for that rank's daily activities. A
-- member who was genuinely idle that day gets an honest 0/0 report, not a
-- fabricated one.

-- ================= per-day activity, for a date that's already over =================
-- Deliberately narrower than get_my_content_assignments/get_my_rank_tasks
-- (both "what does today look like right now" views) -- this asks "what
-- was actually completed, for this one exact past day", which only needs
-- two real signals: individual Learning Hub tasks due that day
-- (content_assignments.due_date, scope='individual' -- the only content_
-- assignments a daily report ever counted, per useTodayTasks.js), checked
-- against member_progress the same way is_content_assignment_done's
-- 'bare' branch does (the dominant real case -- 'bare' is also the only
-- content_type complete_content_assignment/submit_content_evidence will
-- ever write into member_progress for); and that rank's daily rank_tasks,
-- checked against rank_task_submissions.task_date, which is already
-- exactly day-indexed.
create or replace function public.compute_daily_activity_for_date(p_uid uuid, p_date date)
returns table(tasks_completed int, tasks_total int, activities_completed int, activities_total int)
language sql
stable
security definer
set search_path = public
as $$
  select
    (
      select count(*)::int
      from public.content_assignments ca
      where ca.scope = 'individual' and ca.assigned_to_uid = p_uid and ca.due_date::date = p_date
        and exists (
          select 1 from public.member_progress mp
          where mp.content_assignment_id = ca.id and mp.uid = p_uid and mp.completed_at::date <= p_date
        )
    ) as tasks_completed,
    (
      select count(*)::int
      from public.content_assignments ca
      where ca.scope = 'individual' and ca.assigned_to_uid = p_uid and ca.due_date::date = p_date
    ) as tasks_total,
    (
      select count(*)::int
      from public.rank_task_submissions rts
      where rts.uid = p_uid and rts.task_date = p_date and rts.status = 'approved'
    ) as activities_completed,
    (
      select count(*)::int
      from public.rank_tasks rt
      where rt.rank_id = (select p.rank_id from public.profiles p where p.id = p_uid) and rt.recurrence = 'daily'
    ) as activities_total;
$$;

revoke execute on function public.compute_daily_activity_for_date(uuid, date) from public, anon, authenticated;

-- ================= widen status to mark these distinctly =================
-- Kept in the same table/column as real reports (not a parallel table) --
-- everywhere that already reads daily_reports (MyReports.jsx,
-- Submissions.jsx, the Tasks page) keeps working, just needs to render
-- this fourth status distinctly, which is a UI-only concern.
alter table public.daily_reports drop constraint daily_reports_status_check;
alter table public.daily_reports add constraint daily_reports_status_check
  check (status in ('submitted', 'reviewed', 'needs_attention', 'auto_generated'));

-- ================= the lazy finalizer =================
create or replace function public.finalize_missing_daily_reports()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yesterday date := current_date - 1;
  v_member record;
  v_activity record;
  v_count int := 0;
  v_admin record;
begin
  for v_member in
    select p.id, p.display_name
    from public.profiles p
    where p.role = 'member' and p.status = 'active' and p.created_at::date <= v_yesterday
      and not exists (
        select 1 from public.daily_reports dr where dr.uid = p.id and dr.report_date = v_yesterday
      )
  loop
    select * into v_activity from public.compute_daily_activity_for_date(v_member.id, v_yesterday);

    insert into public.daily_reports (
      uid, report_date, tasks_completed, tasks_total, activities_completed, activities_total, summary, status
    )
    values (
      v_member.id, v_yesterday,
      coalesce(v_activity.tasks_completed, 0), coalesce(v_activity.tasks_total, 0),
      coalesce(v_activity.activities_completed, 0), coalesce(v_activity.activities_total, 0),
      'No report submitted for this day -- generated automatically from activity records.',
      'auto_generated'
    )
    on conflict (uid, report_date) do nothing;

    v_count := v_count + 1;
  end loop;

  -- One digest notification, not one per member -- an admin with 40
  -- members who all forgot doesn't need 40 separate rows in their bell.
  if v_count > 0 then
    for v_admin in select id from public.profiles where role = 'admin' loop
      insert into public.notifications (uid, type, title, body, link_to)
      values (
        v_admin.id, 'daily_reports_auto_generated', 'Missed daily reports',
        v_count || ' member' || (case when v_count = 1 then '' else 's' end)
          || ' didn''t submit a Daily Report for ' || to_char(v_yesterday, 'FMMonth DD') || ' -- filed automatically from their activity.',
        '/admin/submissions?section=daily-reports'
      );
    end loop;
  end if;
end;
$$;

revoke execute on function public.finalize_missing_daily_reports() from public, anon, authenticated;

-- ================= admin: the Daily Reports queue, now via one RPC =================
-- Was a plain `supabase.from("daily_reports").select(...)` in
-- Submissions.jsx -- moved behind an RPC for exactly one reason: something
-- has to actually call finalize_missing_daily_reports() before the queue
-- is read, same "perform the lazy finalize, then return the real read"
-- shape get_leaderboards already uses for finalize_last_week_winners.
create or replace function public.get_pending_daily_reports()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;

  perform public.finalize_missing_daily_reports();

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', dr.id, 'uid', dr.uid,
      'displayName', p.display_name, 'email', p.email,
      'reportDate', dr.report_date,
      'tasksCompleted', dr.tasks_completed, 'tasksTotal', dr.tasks_total,
      'activitiesCompleted', dr.activities_completed, 'activitiesTotal', dr.activities_total,
      'summary', dr.summary, 'status', dr.status, 'createdAt', dr.created_at
    ) order by dr.created_at asc)
    from public.daily_reports dr
    join public.profiles p on p.id = dr.uid
    where dr.status in ('submitted', 'auto_generated')
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.get_pending_daily_reports() from public, anon;
grant execute on function public.get_pending_daily_reports() to authenticated;
