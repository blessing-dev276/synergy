-- Two additive pieces for the Member Tasks rework + admin Reports rename:
--
-- 1. get_my_rank_tasks: + proxyPathSection, so the frontend can bucket a
--    rank task into a real category (Network Marketing / Freelancing /
--    Personal Development) off the actual learning_paths.section its
--    proxy_path_id points at, instead of the old two-way Learning/Network
--    Marketing split (Dashboard.jsx's TASK_KIND_CATEGORY) that lumped
--    every rank task into "Network Marketing" regardless of what it
--    actually tracked.
--
-- 2. daily_reports -- genuinely new (grepped the whole repo for anything
--    report-shaped; nothing exists). A member's own daily wrap-up:
--    tasks_completed/activities_completed are snapshotted from their real
--    Today's Tasks counts at submit time (not re-typed by hand), plus an
--    optional free-text summary. One per member per day (upsert on
--    resubmit). Statuses match the brief exactly: submitted / reviewed /
--    needs_attention.
create or replace function public.get_my_rank_tasks()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rank_id uuid;
begin
  select rank_id into v_rank_id from public.profiles where id = v_uid;
  if v_rank_id is null then
    return '[]'::jsonb;
  end if;

  return coalesce((
    with my_tasks as (
      select
        t.id, t.title, t.description, t.recurrence, t.proxy_type, t.proxy_path_id, t.proxy_threshold, t.order_index,
        (select lp.section from public.learning_paths lp where lp.id = t.proxy_path_id) as proxy_path_section,
        (
          select jsonb_build_object('id', s.id, 'status', s.status, 'submittedAt', s.submitted_at, 'reviewNote', s.review_note)
          from public.rank_task_submissions s
          where s.rank_task_id = t.id and s.uid = v_uid
            and (t.recurrence = 'once' or s.task_date = current_date)
          order by s.submitted_at desc
          limit 1
        ) as submission
      from public.rank_tasks t
      where t.rank_id = v_rank_id
    )
    select jsonb_agg(jsonb_build_object(
      'id', id, 'title', title, 'description', description, 'recurrence', recurrence,
      'proxyType', proxy_type, 'proxyPathId', proxy_path_id, 'proxyPathSection', proxy_path_section, 'submission', submission,
      'proxyThreshold', case when proxy_type in (
        'modules_count', 'prospects_count', 'mind_training_modules_count',
        'referral_count', 'profile_completion_percent', 'earnings_amount'
      ) then proxy_threshold end,
      'progress', case proxy_type
        when 'modules_count' then public.count_modules_completed(v_uid, proxy_path_id, recurrence = 'daily')
        when 'prospects_count' then public.count_prospects_added_today(v_uid)
        when 'mind_training_modules_count' then public.count_mind_training_modules_completed(v_uid, proxy_path_id, recurrence = 'daily')
        when 'referral_count' then public.count_personally_sponsored(v_uid)
        when 'profile_completion_percent' then public.compute_profile_health_percent(v_uid)
        when 'earnings_amount' then floor(public.sum_verified_earnings(v_uid))::int
        else null
      end
    ) order by order_index)
    from my_tasks
    where not (recurrence = 'once' and coalesce(submission->>'status', '') = 'approved')
  ), '[]'::jsonb);
end;
$$;
-- CREATE OR REPLACE preserves existing grants (same name, same signature).

-- ---------- daily_reports ----------
create table public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references public.profiles(id) on delete cascade,
  report_date date not null default current_date,
  tasks_completed int not null default 0,
  tasks_total int not null default 0,
  activities_completed int not null default 0,
  activities_total int not null default 0,
  summary text not null default '',
  status text not null default 'submitted' check (status in ('submitted', 'reviewed', 'needs_attention')),
  review_note text default '',
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One report per member per day -- resubmitting the same day upserts
-- (submit_daily_report below) rather than piling up duplicates.
create unique index daily_reports_uid_date_uidx on public.daily_reports (uid, report_date);
create index daily_reports_status_idx on public.daily_reports (status, created_at desc);

alter table public.daily_reports enable row level security;
grant select on public.daily_reports to authenticated;
create policy daily_reports_select on public.daily_reports for select
  using (uid = auth.uid() or public.current_role() = 'admin');
-- no client insert/update grant: written only by submit_daily_report /
-- review_daily_report below.

-- ---------- member: submit (or update) today's report ----------
-- tasks_completed/tasks_total/activities_completed/activities_total are
-- passed in already-computed by the client from the same Today's Tasks
-- data the page itself displays (content_assignments -> tasks,
-- rank_tasks -> activities) -- not re-derived server-side, since "how the
-- member's own work is currently bucketed" is a display-layer question,
-- the same real numbers the member is looking at when they click Create
-- Daily Report. Resubmitting the same day re-opens review (status reset
-- to 'submitted', prior review cleared) rather than silently keeping a
-- stale admin decision on edited content.
create or replace function public.submit_daily_report(
  p_tasks_completed int, p_tasks_total int, p_activities_completed int, p_activities_total int, p_summary text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_display_name text;
  v_admin record;
begin
  insert into public.daily_reports (uid, report_date, tasks_completed, tasks_total, activities_completed, activities_total, summary)
  values (v_uid, current_date, coalesce(p_tasks_completed, 0), coalesce(p_tasks_total, 0), coalesce(p_activities_completed, 0), coalesce(p_activities_total, 0), coalesce(p_summary, ''))
  on conflict (uid, report_date) do update
    set tasks_completed = excluded.tasks_completed, tasks_total = excluded.tasks_total,
        activities_completed = excluded.activities_completed, activities_total = excluded.activities_total,
        summary = excluded.summary, status = 'submitted', review_note = '', reviewed_by = null, reviewed_at = null,
        updated_at = now()
  returning id into v_id;

  select display_name into v_display_name from public.profiles where id = v_uid;

  for v_admin in select id from public.profiles where role = 'admin' loop
    insert into public.notifications (uid, type, title, body, link_to)
    values (
      v_admin.id, 'daily_report_submitted', 'Daily report submitted',
      coalesce(nullif(v_display_name, ''), 'A member') || ' submitted their daily report.',
      '/admin/submissions'
    );
  end loop;

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (v_uid, 'daily_report_submitted', 'daily_report', v_id::text, jsonb_build_object('date', current_date));

  return v_id;
end;
$$;

revoke execute on function public.submit_daily_report(int, int, int, int, text) from public, anon;
grant execute on function public.submit_daily_report(int, int, int, int, text) to authenticated;

-- ---------- admin: review a daily report ----------
create or replace function public.review_daily_report(p_id uuid, p_decision text, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;
  if p_decision not in ('reviewed', 'needs_attention') then
    raise exception 'invalid decision: %', p_decision;
  end if;

  select uid into v_uid from public.daily_reports where id = p_id;
  if v_uid is null then
    raise exception 'report not found';
  end if;

  update public.daily_reports
    set status = p_decision, review_note = coalesce(p_note, ''), reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
    where id = p_id;

  insert into public.notifications (uid, type, title, body, link_to)
  values (
    v_uid,
    'daily_report_reviewed',
    case when p_decision = 'reviewed' then 'Daily report reviewed' else 'Daily report needs attention' end,
    coalesce(nullif(p_note, ''), case when p_decision = 'reviewed' then 'An admin reviewed your daily report.' else 'An admin flagged your daily report — check the details.' end),
    '/tasks'
  );

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'daily_report_reviewed', 'daily_report', p_id::text, jsonb_build_object('decision', p_decision));
end;
$$;

revoke execute on function public.review_daily_report(uuid, text, text) from public, anon;
grant execute on function public.review_daily_report(uuid, text, text) to authenticated;
