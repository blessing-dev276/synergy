-- Weekly leaderboard: three independent, live-computed rankings (not one
-- blended score, by product decision) --
--   tasks:      % of that member's required tasks due this week that are done
--   prospects:  new members who signed up with them as sponsor this week
--   earnings:   admin-verified earnings they logged this week
-- "This week" = Mon 00:00 through the following Mon 00:00 (date_trunc('week', ...)
-- is Monday-based in Postgres), computed live off existing data -- no stored
-- weekly counters to reset, so the ranking is always current and naturally
-- starts over the moment a new week begins.
--
-- Prospects and earnings had no data source at all before this: prospects
-- reuses sponsor_relationships (0018) rather than adding a new leads table,
-- per product decision that a "prospect" here means an actual signup, not a
-- logged lead. Earnings has no source anywhere in the app (no payments/
-- commission system exists), so this adds a minimal self-report+admin-verify
-- log -- verification matters because a real weekly incentive is riding on
-- the number, mirrors grade_assignment/review_stage_promotion's decision
-- pattern.
--
-- There's no scheduler (no pg_cron) in this project, so the "pick the #1 and
-- celebrate" moment can't run on a timer. Instead it finalizes lazily: the
-- first time anyone loads the leaderboard after a week has closed,
-- finalize_last_week_winners() computes and freezes that week's #1 per
-- category (idempotent via the unique index, so concurrent callers can't
-- double-write) -- same lazy-init idiom as member_journey's auto-start in
-- get_journey_overview (0009).

-- ---------- earnings_logs: self-reported, admin-verified ----------
create table public.earnings_logs (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references public.profiles(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  note text default '',
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text default '',
  earned_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index earnings_logs_uid_idx on public.earnings_logs (uid, earned_at desc);
create index earnings_logs_status_idx on public.earnings_logs (status, earned_at desc);

alter table public.earnings_logs enable row level security;
grant select on public.earnings_logs to authenticated;
create policy earnings_logs_select on public.earnings_logs for select
  using (uid = auth.uid() or public.current_role() = 'admin');
-- no client insert/update grant: written only by log_earning / review_earning below.

-- ---------- weekly_leaderboard_winners: frozen #1 per category per week ----------
create table public.weekly_leaderboard_winners (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  category text not null check (category in ('tasks', 'prospects', 'earnings')),
  uid uuid references public.profiles(id),
  display_name text not null,
  score numeric not null,
  decided_at timestamptz not null default now(),
  unique (week_start, category)
);

alter table public.weekly_leaderboard_winners enable row level security;
grant select on public.weekly_leaderboard_winners to authenticated;
create policy weekly_leaderboard_winners_select on public.weekly_leaderboard_winners for select using (auth.uid() is not null);
-- no client insert/update grant: written only by finalize_last_week_winners below.

-- ================= member: log / admin: review an earning =================

create or replace function public.log_earning(p_amount numeric, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_display_name text;
  v_admin record;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be greater than zero';
  end if;

  insert into public.earnings_logs (uid, amount, note, status, earned_at)
  values (auth.uid(), p_amount, coalesce(p_note, ''), 'pending', now())
  returning id into v_id;

  select display_name into v_display_name from public.profiles where id = auth.uid();

  for v_admin in select id from public.profiles where role = 'admin' loop
    insert into public.notifications (uid, type, title, body, link_to)
    values (
      v_admin.id, 'earning_submitted', 'Earning submitted for review',
      coalesce(nullif(v_display_name, ''), 'A member') || ' logged $' || p_amount || ' — needs verification',
      '/admin/earnings'
    );
  end loop;

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'earning_logged', 'earnings_log', v_id::text, jsonb_build_object('amount', p_amount));
end;
$$;

revoke execute on function public.log_earning(numeric, text) from public, anon;
grant execute on function public.log_earning(numeric, text) to authenticated;

create or replace function public.review_earning(p_id uuid, p_decision text, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_amount numeric;
  v_status text;
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;
  if p_decision not in ('verified', 'rejected') then
    raise exception 'invalid decision: %', p_decision;
  end if;

  select uid, amount, status into v_uid, v_amount, v_status from public.earnings_logs where id = p_id;
  if v_uid is null then
    raise exception 'earnings log not found';
  end if;
  if v_status <> 'pending' then
    raise exception 'this entry has already been reviewed';
  end if;

  update public.earnings_logs
    set status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(), review_note = coalesce(p_note, '')
    where id = p_id;

  insert into public.notifications (uid, type, title, body, link_to)
  values (
    v_uid, 'earning_reviewed',
    case when p_decision = 'verified' then 'Earning verified 🎉' else 'Earning not verified' end,
    case when p_decision = 'verified'
      then '$' || v_amount || ' confirmed and counted toward this week''s leaderboard.'
      else coalesce(nullif(p_note, ''), 'An admin could not verify this entry.')
    end,
    '/leaderboard'
  );

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'earning_reviewed', 'earnings_log', p_id::text, jsonb_build_object('decision', p_decision));
end;
$$;

revoke execute on function public.review_earning(uuid, text, text) from public, anon;
grant execute on function public.review_earning(uuid, text, text) to authenticated;

-- ================= per-category leaderboard math (internal building blocks) =================

create or replace function public.compute_task_leaderboard(p_week_start timestamptz)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_week_end timestamptz := p_week_start + interval '7 days';
begin
  return coalesce((
    with weekly_tasks as (
      select tk.assigned_to_uid as uid, tk.id
      from public.tasks tk
      where tk.assigned_to_uid is not null and tk.is_required = true
        and tk.due_date >= p_week_start and tk.due_date < v_week_end
    ),
    scored as (
      select uid,
        count(*) as tasks_total,
        count(*) filter (where public.is_task_done(id, uid)) as tasks_done
      from weekly_tasks
      group by uid
    )
    select jsonb_agg(jsonb_build_object(
      'uid', p.id,
      'displayName', p.display_name,
      'photoUrl', p.photo_url,
      'tasksTotal', s.tasks_total,
      'tasksDone', s.tasks_done,
      'completionPercent', round((s.tasks_done::numeric / s.tasks_total) * 100)
    ) order by (s.tasks_done::numeric / s.tasks_total) desc, s.tasks_done desc, p.display_name)
    from scored s
    join public.profiles p on p.id = s.uid
    where s.tasks_total > 0
  ), '[]'::jsonb);
end;
$$;

create or replace function public.compute_prospect_leaderboard(p_week_start timestamptz)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_week_end timestamptz := p_week_start + interval '7 days';
begin
  return coalesce((
    with weekly_prospects as (
      select sponsor_uid as uid, count(*) as prospect_count
      from public.sponsor_relationships
      where assigned_at >= p_week_start and assigned_at < v_week_end
      group by sponsor_uid
    )
    select jsonb_agg(jsonb_build_object(
      'uid', p.id,
      'displayName', p.display_name,
      'photoUrl', p.photo_url,
      'prospectCount', wp.prospect_count
    ) order by wp.prospect_count desc, p.display_name)
    from weekly_prospects wp
    join public.profiles p on p.id = wp.uid
  ), '[]'::jsonb);
end;
$$;

create or replace function public.compute_earnings_leaderboard(p_week_start timestamptz)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_week_end timestamptz := p_week_start + interval '7 days';
begin
  return coalesce((
    with weekly_earnings as (
      select uid, sum(amount) as total_amount
      from public.earnings_logs
      where status = 'verified' and earned_at >= p_week_start and earned_at < v_week_end
      group by uid
    )
    select jsonb_agg(jsonb_build_object(
      'uid', p.id,
      'displayName', p.display_name,
      'photoUrl', p.photo_url,
      'totalAmount', we.total_amount
    ) order by we.total_amount desc, p.display_name)
    from weekly_earnings we
    join public.profiles p on p.id = we.uid
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.compute_task_leaderboard(timestamptz) from public, anon;
grant execute on function public.compute_task_leaderboard(timestamptz) to authenticated;
revoke execute on function public.compute_prospect_leaderboard(timestamptz) from public, anon;
grant execute on function public.compute_prospect_leaderboard(timestamptz) to authenticated;
revoke execute on function public.compute_earnings_leaderboard(timestamptz) from public, anon;
grant execute on function public.compute_earnings_leaderboard(timestamptz) to authenticated;

-- ================= lazy weekly finalization =================

create or replace function public.finalize_last_week_winners()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last_week_start timestamptz := date_trunc('week', now()) - interval '7 days';
  v_tasks jsonb;
  v_prospects jsonb;
  v_earnings jsonb;
begin
  if exists (select 1 from public.weekly_leaderboard_winners where week_start = v_last_week_start::date) then
    return;
  end if;

  v_tasks := public.compute_task_leaderboard(v_last_week_start);
  v_prospects := public.compute_prospect_leaderboard(v_last_week_start);
  v_earnings := public.compute_earnings_leaderboard(v_last_week_start);

  if jsonb_array_length(v_tasks) > 0 then
    insert into public.weekly_leaderboard_winners (week_start, category, uid, display_name, score)
    values (v_last_week_start::date, 'tasks', (v_tasks->0->>'uid')::uuid, v_tasks->0->>'displayName', (v_tasks->0->>'completionPercent')::numeric)
    on conflict (week_start, category) do nothing;
  end if;

  if jsonb_array_length(v_prospects) > 0 then
    insert into public.weekly_leaderboard_winners (week_start, category, uid, display_name, score)
    values (v_last_week_start::date, 'prospects', (v_prospects->0->>'uid')::uuid, v_prospects->0->>'displayName', (v_prospects->0->>'prospectCount')::numeric)
    on conflict (week_start, category) do nothing;
  end if;

  if jsonb_array_length(v_earnings) > 0 then
    insert into public.weekly_leaderboard_winners (week_start, category, uid, display_name, score)
    values (v_last_week_start::date, 'earnings', (v_earnings->0->>'uid')::uuid, v_earnings->0->>'displayName', (v_earnings->0->>'totalAmount')::numeric)
    on conflict (week_start, category) do nothing;
  end if;

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (
    null, 'weekly_leaderboard_finalized', 'weekly_leaderboard_winners', v_last_week_start::date::text,
    jsonb_build_object('tasksWinner', v_tasks->0, 'prospectsWinner', v_prospects->0, 'earningsWinner', v_earnings->0)
  );
end;
$$;

revoke execute on function public.finalize_last_week_winners() from public, anon, authenticated;

-- ================= public: everything the leaderboard page needs, in one call =================

create or replace function public.get_leaderboards()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week_start timestamptz := date_trunc('week', now());
begin
  perform public.finalize_last_week_winners();

  return jsonb_build_object(
    'weekStart', v_week_start,
    'weekEnd', v_week_start + interval '7 days',
    'tasks', public.compute_task_leaderboard(v_week_start),
    'prospects', public.compute_prospect_leaderboard(v_week_start),
    'earnings', public.compute_earnings_leaderboard(v_week_start),
    'lastWeekWinners', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'category', w.category, 'uid', w.uid, 'displayName', w.display_name, 'score', w.score
      )), '[]'::jsonb)
      from public.weekly_leaderboard_winners w
      where w.week_start = (v_week_start - interval '7 days')::date
    )
  );
end;
$$;

revoke execute on function public.get_leaderboards() from public, anon;
grant execute on function public.get_leaderboards() to authenticated;
