-- Admin Evaluation Center — the new central admin workspace for observing,
-- evaluating, and following up on member performance/activity (replaces
-- "Reports" as the sidebar's primary destination; the report-review queues
-- themselves are untouched, just re-homed at /admin/evaluation/reports as
-- evidence inside this new IA -- see Submissions.jsx, unchanged).
--
-- Three pieces:
--   1. member_evaluations -- an append-only history of admin evaluations
--      per member (status + optional note + optional category). Nothing
--      here replaces daily_reports/rank_task_submissions/etc -- those stay
--      exactly what they are (member-submitted evidence); this is the
--      admin's own assessment layered on top.
--   2. admin_save_evaluation -- the one write path. Same shape as
--      review_daily_report (0094): permission check -> insert -> optional
--      member notification (generic copy, never the raw note) -> activity
--      log entry.
--   3. Two reads: a member's full evaluation history, and one bulk,
--      real-data-only row per active member (status/rank/report/
--      rank-requirement/last-evaluation signals) that backs the Evaluation
--      Center's overview tiles, attention queue, and members directory in
--      a single query -- same complexity class as compute_task_leaderboard/
--      get_admin_goal_overview, not a new category of cost.

-- ================= table =================

create table public.member_evaluations (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('on_track', 'needs_attention', 'at_risk')),
  category text check (category is null or category in (
    'tasks', 'learning', 'network', 'freelancing', 'personal_development', 'rank', 'reports', 'team'
  )),
  note text not null default '',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index member_evaluations_uid_idx on public.member_evaluations (uid, created_at desc);

alter table public.member_evaluations enable row level security;
grant select on public.member_evaluations to authenticated;
create policy member_evaluations_select on public.member_evaluations
  for select using (coalesce(public.current_role(), '') = 'admin');
-- No insert/update/delete grants -- every write goes through
-- admin_save_evaluation below (security definer, its own permission check).

-- ================= write =================

create or replace function public.admin_save_evaluation(
  p_uid uuid,
  p_status text,
  p_note text,
  p_category text default null,
  p_notify boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.member_evaluations;
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;
  if p_status not in ('on_track', 'needs_attention', 'at_risk') then
    raise exception 'invalid status: %', p_status;
  end if;
  if p_category is not null and p_category not in (
    'tasks', 'learning', 'network', 'freelancing', 'personal_development', 'rank', 'reports', 'team'
  ) then
    raise exception 'invalid category: %', p_category;
  end if;
  if not exists (select 1 from public.profiles where id = p_uid) then
    raise exception 'member not found';
  end if;

  insert into public.member_evaluations (uid, status, category, note, created_by)
  values (p_uid, p_status, p_category, coalesce(p_note, ''), auth.uid())
  returning * into v_row;

  -- Generic, non-private copy only -- the note itself stays admin-only
  -- (no member-facing evaluation view exists yet, see the request's own
  -- "don't expose private admin notes to members" constraint).
  if p_notify then
    insert into public.notifications (uid, type, title, body, link_to)
    values (
      p_uid,
      'evaluation_followup',
      'Your admin would like to follow up',
      'An admin reviewed your recent activity and progress and would like to check in with you.',
      '/dashboard'
    );
  end if;

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (
    auth.uid(), 'member_evaluated', 'profile', p_uid::text,
    jsonb_build_object('status', p_status, 'category', p_category, 'notified', p_notify)
  );

  return jsonb_build_object(
    'id', v_row.id,
    'uid', v_row.uid,
    'status', v_row.status,
    'category', v_row.category,
    'note', v_row.note,
    'createdBy', v_row.created_by,
    'createdAt', v_row.created_at
  );
end;
$$;

revoke execute on function public.admin_save_evaluation(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.admin_save_evaluation(uuid, text, text, text, boolean) to authenticated;

-- ================= reads =================

create or replace function public.get_member_evaluation_history(p_uid uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id,
      'status', e.status,
      'category', e.category,
      'note', e.note,
      'createdAt', e.created_at,
      'reviewedBy', coalesce(p.display_name, p.email)
    ) order by e.created_at desc)
    from public.member_evaluations e
    join public.profiles p on p.id = e.created_by
    where e.uid = p_uid
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.get_member_evaluation_history(uuid) from public, anon;
grant execute on function public.get_member_evaluation_history(uuid) to authenticated;

-- One row per active member (role='member', not removed) -- every field is
-- either a plain column or a real, bulk-computable count/exists against
-- existing tables. No blended scores, no fabricated percentages.
create or replace function public.get_admin_members_evaluation()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id,
      'displayName', p.display_name,
      'email', p.email,
      'photoUrl', p.photo_url,
      'status', p.status,
      'lastActiveAt', p.last_active_at,
      'createdAt', p.created_at,
      'rankId', p.rank_id,
      'rankTitle', r.title,
      'reportsPendingCount', dr.pending_count,
      'flaggedReportsCount', dr.flagged_count,
      'lastReportDate', dr.last_report_date,
      'rankReqDone', rt.req_done,
      'rankReqTotal', rt.req_total,
      'hasPendingRankAdvancement', coalesce(adv.has_pending, false),
      'lastEvaluationStatus', ev.status,
      'lastEvaluationAt', ev.created_at,
      'lastEvaluationBy', coalesce(evp.display_name, evp.email)
    ) order by p.display_name)
    from public.profiles p
    left join public.ranks r on r.id = p.rank_id
    left join lateral (
      select
        count(*) filter (where d.status in ('submitted', 'auto_generated')) as pending_count,
        count(*) filter (where d.status = 'needs_attention') as flagged_count,
        max(d.report_date) as last_report_date
      from public.daily_reports d
      where d.uid = p.id
    ) dr on true
    left join lateral (
      select
        count(*) filter (where exists (
          select 1 from public.rank_task_submissions s
          where s.rank_task_id = t.id and s.uid = p.id and s.status = 'approved'
        )) as req_done,
        count(*) as req_total
      from public.rank_tasks t
      where t.rank_id = p.rank_id and t.recurrence = 'once'
    ) rt on true
    left join lateral (
      select true as has_pending
      from public.rank_advancement_requests a
      where a.uid = p.id and a.status = 'pending'
      limit 1
    ) adv on true
    left join lateral (
      select e.status, e.created_at, e.created_by
      from public.member_evaluations e
      where e.uid = p.id and e.category is null
      order by e.created_at desc
      limit 1
    ) ev on true
    left join public.profiles evp on evp.id = ev.created_by
    where p.role = 'member' and p.status <> 'removed'
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.get_admin_members_evaluation() from public, anon;
grant execute on function public.get_admin_members_evaluation() to authenticated;
