-- Leaderboard rebuild: a real points system instead of the three separate
-- "board per metric" leaderboard (0026/0060, still used by Dashboard.jsx's
-- "This Week's Leaders" preview and left completely untouched below --
-- nothing here drops or redefines get_leaderboards/compute_*_leaderboard).
--
-- Design, in one paragraph: every point a member earns is a row in
-- leaderboard_point_events, written ONLY by a small set of triggers on
-- tables that already record the real underlying action (member_progress,
-- lesson_progress, rank_task_submissions, daily_reports, prospects,
-- prospect_activities) -- never by the frontend, never by a client insert
-- grant. A trigger is a deliberate departure from this codebase's usual
-- "inline logic inside the SECURITY DEFINER RPC" convention, chosen here
-- specifically because several of those tables already have more than one
-- write path to the same completion state (manual rank task approval vs.
-- evaluate_rank_task_proxies' auto-approval; complete_content_assignment
-- vs. review_content_evidence's approval branch) -- a trigger on the
-- shared table catches all of them at once, today and for any future call
-- site, without editing any of those existing functions' bodies at all.
-- Point values live in one admin-editable config table
-- (leaderboard_point_rules), never hardcoded in a trigger or the frontend.
--
-- Anti-gaming: most event types are naturally ungameable by construction
-- (a lesson_id/content_assignment_id can each only ever complete once per
-- member; a daily report is one upsert per calendar day; a rank task is
-- reviewed by an admin or threshold-gated). The two truly self-serve,
-- repeatable actions -- adding a prospect, logging a contact -- get a
-- small admin-adjustable daily_cap in leaderboard_point_rules so "add 500
-- fake prospects" cannot buy #1, while a normal day's real prospecting
-- still earns fully.
--
-- Categories are computed once, at the moment each event is recorded, and
-- stored directly on the row -- never recomputed at leaderboard-read time.
-- They collapse to the three the Leaderboard page's category filter needs
-- (Learning / Work / Network); "Overall" sums all three, and "Consistency"
-- is a different axis entirely (streak, not points -- compute_streak_
-- leaderboard below), matching the product decision that consistency is
-- rewarded on its own terms, not folded into the points race.
--
-- Deliberately NOT wired here: "complete a monthly goal" (also listed in
-- leaderboard_point_rules as a config placeholder, but not seeded --
-- an untriggered rule with a real point value sitting on the "How Points
-- Work" panel would be a promise the page doesn't keep). monthly_goals
-- (0039/0096/0097) stores every goal as one entry inside a per-member,
-- per-period JSONB blob column, not as its own row -- there's no single
-- table+status-column transition to hang an AFTER INSERT/UPDATE trigger
-- off safely. Wiring it needs update_goal_progress (0097) itself to call
-- award_points at its own already-computed v_now_done and not v_was_done
-- check -- a one-line, low-risk addition, but a deliberate follow-up
-- rather than something to reach into that function for right now.

-- ================= leaderboard_point_rules: admin-editable config =================
create table public.leaderboard_point_rules (
  key text primary key,
  label text not null,
  points int not null default 0 check (points >= 0),
  daily_cap int check (daily_cap is null or daily_cap > 0),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

alter table public.leaderboard_point_rules enable row level security;
grant select on public.leaderboard_point_rules to authenticated;
create policy leaderboard_point_rules_select on public.leaderboard_point_rules for select
  using (auth.uid() is not null);
-- no client insert/update grant: only admin_update_point_rule (below)
-- writes. Keys are fixed by the trigger code below, not admin-extensible --
-- a new point-earning action is a code change (a new trigger), not a
-- config change, same reasoning compensation_ranks' fixed 17-title ladder
-- gives for why it's update-only, never insert, for an admin (0035).
grant update (points, daily_cap, updated_by, updated_at) on public.leaderboard_point_rules to authenticated;
create policy leaderboard_point_rules_admin_update on public.leaderboard_point_rules for update
  using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

insert into public.leaderboard_point_rules (key, label, points, daily_cap) values
  ('content_task_completed', 'Complete a Learning Hub task', 10, null),
  ('lesson_completed', 'Complete a lesson', 3, null),
  ('rank_task_completed', 'Complete a Business Path task', 15, null),
  ('daily_report_submitted', 'Submit a Daily Report', 10, null),
  ('prospect_added', 'Add a prospect', 5, 5),
  ('prospect_activity_logged', 'Log a follow-up / contact', 5, 5);

-- ================= leaderboard_point_events: the ledger =================
create table public.leaderboard_point_events (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references public.profiles(id) on delete cascade,
  event_key text not null references public.leaderboard_point_rules(key),
  category text not null check (category in ('Learning', 'Work', 'Network')),
  points int not null,
  source_type text not null,
  source_id uuid,
  occurred_at timestamptz not null default now()
);
create index leaderboard_point_events_uid_occurred_idx on public.leaderboard_point_events (uid, occurred_at desc);
create index leaderboard_point_events_category_occurred_idx on public.leaderboard_point_events (category, occurred_at);
create index leaderboard_point_events_cap_lookup_idx on public.leaderboard_point_events (uid, event_key, occurred_at);

alter table public.leaderboard_point_events enable row level security;
grant select on public.leaderboard_point_events to authenticated;
create policy leaderboard_point_events_select on public.leaderboard_point_events for select
  using (uid = auth.uid() or public.current_role() = 'admin');
-- no client insert/update/delete grant: written only by award_points, itself
-- only ever called from the triggers below -- never directly by a client.

-- ================= award_points: the one place points get written =================
create or replace function public.award_points(
  p_uid uuid, p_event_key text, p_category text, p_source_type text, p_source_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_points int;
  v_daily_cap int;
  v_today_count int;
begin
  select points, daily_cap into v_points, v_daily_cap
    from public.leaderboard_point_rules where key = p_event_key;

  -- Missing/zeroed-out rule -- an admin can turn an event type off entirely
  -- by setting its points to 0, no trigger code changes needed.
  if v_points is null or v_points <= 0 then
    return;
  end if;

  if v_daily_cap is not null then
    select count(*) into v_today_count
      from public.leaderboard_point_events
      where uid = p_uid and event_key = p_event_key and occurred_at::date = current_date;
    if v_today_count >= v_daily_cap then
      return;
    end if;
  end if;

  insert into public.leaderboard_point_events (uid, event_key, category, points, source_type, source_id)
  values (p_uid, p_event_key, p_category, v_points, p_source_type, p_source_id);
end;
$$;

revoke execute on function public.award_points(uuid, text, text, text, uuid) from public, anon, authenticated;

-- ================= admin: edit a point rule =================
create or replace function public.admin_update_point_rule(p_key text, p_points int, p_daily_cap int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;
  if not exists (select 1 from public.leaderboard_point_rules where key = p_key) then
    raise exception 'unknown point rule: %', p_key;
  end if;
  if p_points is null or p_points < 0 then
    raise exception 'points must be zero or greater';
  end if;
  if p_daily_cap is not null and p_daily_cap <= 0 then
    raise exception 'daily cap must be greater than zero, or left blank for no cap';
  end if;

  update public.leaderboard_point_rules
    set points = p_points, daily_cap = p_daily_cap, updated_by = auth.uid(), updated_at = now()
    where key = p_key;

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'leaderboard_point_rule_updated', 'leaderboard_point_rule', p_key,
    jsonb_build_object('points', p_points, 'dailyCap', p_daily_cap));
end;
$$;

revoke execute on function public.admin_update_point_rule(text, int, int) from public, anon;
grant execute on function public.admin_update_point_rule(text, int, int) to authenticated;

-- ================= rank task -> leaderboard category =================
-- Same priority order as useTodayTasks.js's categorizeRankTask (src/lib/
-- useTodayTasks.js, 0094) -- proxyPathSection first, then proxy-type
-- semantics, then a title keyword match -- collapsed from that hook's five
-- Tasks-page buckets down to the three this ledger uses: Network Marketing
-- and Team both mean relationship-building here (Network); Freelancing and
-- Personal Development are both skill-building (Learning); a task that
-- matches nothing falls to Work, a completed task with no clearer signal.
create or replace function public.categorize_rank_task_for_leaderboard(p_rank_task_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_title text;
  v_proxy_type text;
  v_proxy_path_id uuid;
  v_section text;
begin
  select title, proxy_type, proxy_path_id into v_title, v_proxy_type, v_proxy_path_id
    from public.rank_tasks where id = p_rank_task_id;

  if v_proxy_path_id is not null then
    select section into v_section from public.learning_paths where id = v_proxy_path_id;
    if v_section = 'nm_business' then
      return 'Network';
    elsif v_section in ('skill_set', 'mind_training') then
      return 'Learning';
    end if;
  end if;

  if v_proxy_type in ('prospects_count', 'referral_count', 'earnings_amount') then
    return 'Network';
  elsif v_proxy_type in ('profile_completion_percent', 'goals_submitted') then
    return 'Learning';
  end if;

  if v_title ~* '(network marketing|network varsity|business explanation|prospect|follow[-\s]?up|customer|business activity|team|sponsor|mentor)' then
    return 'Network';
  elsif v_title ~* '(skill set|digital skill|portfolio|fiverr|upwork|freelanc|proposal|client|mind training|mindset|reflect|personal development|journal|self-awareness|lesson|course|module|training|learn)' then
    return 'Learning';
  end if;

  return 'Work';
end;
$$;

revoke execute on function public.categorize_rank_task_for_leaderboard(uuid) from public, anon, authenticated;

-- ================= triggers: award points where the real action already lands =================

-- 1. content_assignments (bare, due-dated Learning Hub tasks) -- fires from
-- both complete_content_assignment and review_content_evidence's approval
-- branch, since both write the same member_progress row (0055).
create or replace function public.tg_award_points_content_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.award_points(new.uid, 'content_task_completed', 'Learning', 'content_assignment', new.content_assignment_id);
  return new;
end;
$$;

drop trigger if exists award_points_content_task on public.member_progress;
create trigger award_points_content_task
  after insert on public.member_progress
  for each row execute function public.tg_award_points_content_task();

-- 2. lesson_progress -- ordinary Learning Hub lesson completions (the most
-- common everyday learning signal in the app, mark_lesson_complete,
-- 0014). unique(uid, lesson_id) already makes this ungameable -- each
-- lesson can only ever complete once per member -- so no daily_cap needed.
-- Split into an INSERT and an UPDATE trigger (Postgres doesn't allow a WHEN
-- clause to reference OLD on a trigger that also fires for INSERT) --
-- same split submit_rank_task's manual-approval path uses below.
create or replace function public.tg_award_points_lesson()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category text := 'Learning';
  v_section text;
begin
  if new.path_id is not null then
    select section into v_section from public.learning_paths where id = new.path_id;
    if v_section = 'nm_business' then
      v_category := 'Network';
    end if;
  end if;
  perform public.award_points(new.uid, 'lesson_completed', v_category, 'lesson_progress', new.id);
  return new;
end;
$$;

drop trigger if exists award_points_lesson_insert on public.lesson_progress;
create trigger award_points_lesson_insert
  after insert on public.lesson_progress
  for each row when (new.status = 'completed')
  execute function public.tg_award_points_lesson();

drop trigger if exists award_points_lesson_update on public.lesson_progress;
create trigger award_points_lesson_update
  after update on public.lesson_progress
  for each row when (new.status = 'completed' and old.status is distinct from 'completed')
  execute function public.tg_award_points_lesson();

-- 3. rank_task_submissions -- fires whether a task was approved by an admin
-- (review_rank_task_submission) or auto-approved from real progress
-- (evaluate_rank_task_proxies, 0065) -- both paths land on the same
-- status='approved' row, and a submission can only ever reach 'approved'
-- once in its lifetime (submit_rank_task blocks resubmitting anything but
-- a 'rejected' row), so this can't double-count a single completion.
create or replace function public.tg_award_points_rank_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category text;
begin
  v_category := public.categorize_rank_task_for_leaderboard(new.rank_task_id);
  perform public.award_points(new.uid, 'rank_task_completed', v_category, 'rank_task_submission', new.id);
  return new;
end;
$$;

drop trigger if exists award_points_rank_task_insert on public.rank_task_submissions;
create trigger award_points_rank_task_insert
  after insert on public.rank_task_submissions
  for each row when (new.status = 'approved')
  execute function public.tg_award_points_rank_task();

drop trigger if exists award_points_rank_task_update on public.rank_task_submissions;
create trigger award_points_rank_task_update
  after update on public.rank_task_submissions
  for each row when (new.status = 'approved' and old.status is distinct from 'approved')
  execute function public.tg_award_points_rank_task();

-- 4. daily_reports -- submit_daily_report (0094) upserts on (uid,
-- report_date); this AFTER INSERT trigger only fires on that first
-- same-day insert, never on the ON CONFLICT DO UPDATE path a same-day
-- resubmission takes, so editing an already-submitted report can't re-earn
-- the same day's points.
create or replace function public.tg_award_points_daily_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.award_points(new.uid, 'daily_report_submitted', 'Work', 'daily_report', new.id);
  return new;
end;
$$;

drop trigger if exists award_points_daily_report on public.daily_reports;
create trigger award_points_daily_report
  after insert on public.daily_reports
  for each row execute function public.tg_award_points_daily_report();

-- 5. prospects -- capped (leaderboard_point_rules.daily_cap) so a spam of
-- fake prospects can't buy the top of Network on its own.
create or replace function public.tg_award_points_prospect_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.award_points(new.owner_uid, 'prospect_added', 'Network', 'prospect', new.id);
  return new;
end;
$$;

drop trigger if exists award_points_prospect_added on public.prospects;
create trigger award_points_prospect_added
  after insert on public.prospects
  for each row execute function public.tg_award_points_prospect_added();

-- 6. prospect_activities -- only real contact types (call/message/meeting/
-- presentation/follow_up); 'note' and the system-generated 'status_change'
-- rows don't earn points -- both are too cheap to log to responsibly
-- reward. Also capped.
create or replace function public.tg_award_points_prospect_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.award_points(new.uid, 'prospect_activity_logged', 'Network', 'prospect_activity', new.id);
  return new;
end;
$$;

drop trigger if exists award_points_prospect_activity on public.prospect_activities;
create trigger award_points_prospect_activity
  after insert on public.prospect_activities
  for each row when (new.activity_type in ('call', 'message', 'meeting', 'presentation', 'follow_up'))
  execute function public.tg_award_points_prospect_activity();

-- ================= consistency: streak for every member, not just the caller =================
-- Same gaps-and-islands logic as get_my_streak (0090), just grouped by uid
-- instead of filtered to auth.uid() -- one shared definition of "streak"
-- would be nicer than two copies, but get_my_streak's grant/signature is
-- unrelated (member-facing, no p_uid param) and out of scope to touch here.
create or replace function public.compute_streak_leaderboard()
returns table(uid uuid, streak int)
language sql
stable
security definer
set search_path = public
as $$
  with days as (
    select ces.uid as uid, ces.submitted_at::date as d from public.content_evidence_submissions ces
    union
    select aas.uid, aas.submitted_at::date from public.assignment_submissions aas
    union
    select rts.uid, rts.submitted_at::date from public.rank_task_submissions rts
  ),
  distinct_days as (
    select distinct uid, d from days
  ),
  runs as (
    select uid, d, (d - (row_number() over (partition by uid order by d))::int) as grp
    from distinct_days
  ),
  run_lengths as (
    select uid, grp, count(*) as run_len, max(d) as run_end
    from runs
    group by uid, grp
  ),
  best_current_run as (
    select distinct on (run_lengths.uid) run_lengths.uid, run_len
    from run_lengths
    where run_end >= current_date - 1
    order by run_lengths.uid, run_end desc
  )
  select p.id as uid, coalesce(bcr.run_len, 0) as streak
  from public.profiles p
  left join best_current_run bcr on bcr.uid = p.id
  where p.status = 'active';
$$;

revoke execute on function public.compute_streak_leaderboard() from public, anon, authenticated;

-- ================= the page's one main call: ranked list + "you are here" =================
create or replace function public.get_leaderboard(p_period text, p_category text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_start timestamptz;
  v_entries jsonb;
  v_total int;
  v_me jsonb;
  v_me_rank int;
  v_prev jsonb;
begin
  if p_period not in ('week', 'month', 'all') then
    raise exception 'invalid period: %', p_period;
  end if;
  if p_category not in ('overall', 'learning', 'work', 'network', 'consistency') then
    raise exception 'invalid category: %', p_category;
  end if;

  v_start := case p_period
    when 'week' then date_trunc('week', now())
    when 'month' then date_trunc('month', now())
    else '-infinity'::timestamptz
  end;

  if p_category = 'consistency' then
    -- Streak, not points -- a single current number, so the week/month/
    -- all-time period selector doesn't apply to it (the frontend hides the
    -- period pills for this category rather than pretend they do anything).
    with ranked as (
      select
        p.id as uid, p.display_name as display_name, p.photo_url as photo_url,
        r.title as level_title, csl.streak as streak,
        row_number() over (order by csl.streak desc, p.display_name) as rn
      from public.compute_streak_leaderboard() csl
      join public.profiles p on p.id = csl.uid
      left join public.ranks r on r.id = p.rank_id
      where csl.streak > 0
    )
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'uid', uid, 'displayName', display_name, 'photoUrl', photo_url, 'levelTitle', level_title,
        'points', null, 'streak', streak, 'rank', rn
      ) order by rn), '[]'::jsonb),
      count(*)
    into v_entries, v_total
    from ranked;
  else
    with scored as (
      select e.uid, sum(e.points)::int as points
      from public.leaderboard_point_events e
      where e.occurred_at >= v_start
        and (p_category = 'overall' or e.category = initcap(p_category))
      group by e.uid
      having sum(e.points) > 0
    ),
    ranked as (
      select
        p.id as uid, p.display_name as display_name, p.photo_url as photo_url,
        r.title as level_title, s.points as points, coalesce(csl.streak, 0) as streak,
        row_number() over (order by s.points desc, coalesce(csl.streak, 0) desc, p.display_name) as rn
      from scored s
      join public.profiles p on p.id = s.uid and p.status = 'active'
      left join public.ranks r on r.id = p.rank_id
      left join public.compute_streak_leaderboard() csl on csl.uid = p.id
    )
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'uid', uid, 'displayName', display_name, 'photoUrl', photo_url, 'levelTitle', level_title,
        'points', points, 'streak', streak, 'rank', rn
      ) order by rn), '[]'::jsonb),
      count(*)
    into v_entries, v_total
    from ranked;
  end if;

  -- "me" is read back out of the entries this call already computed --
  -- never a second independent aggregate -- so it can never disagree with
  -- what the list above actually shows.
  select e into v_me from jsonb_array_elements(v_entries) e where (e ->> 'uid')::uuid = v_uid limit 1;

  if v_me is not null then
    v_me_rank := (v_me ->> 'rank')::int;
    if v_me_rank > 1 and v_me ->> 'points' is not null then
      select e into v_prev from jsonb_array_elements(v_entries) e where (e ->> 'rank')::int = v_me_rank - 1 limit 1;
      if v_prev is not null then
        v_me := v_me || jsonb_build_object('pointsToNextRank', (v_prev ->> 'points')::int - (v_me ->> 'points')::int);
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'period', p_period, 'category', p_category, 'generatedAt', now(),
    'entries', v_entries, 'totalRanked', coalesce(v_total, 0), 'me', v_me
  );
end;
$$;

revoke execute on function public.get_leaderboard(text, text) from public, anon;
grant execute on function public.get_leaderboard(text, text) to authenticated;

-- ================= this week's highlights (fixed to the current week, regardless of the page's own filter) =================
create or replace function public.get_weekly_highlights()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_week_start timestamptz := date_trunc('week', now());
  v_consistency jsonb;
  v_learning jsonb;
  v_work jsonb;
  v_network jsonb;
begin
  select jsonb_build_object('uid', p.id, 'displayName', p.display_name, 'photoUrl', p.photo_url, 'value', csl.streak)
    into v_consistency
    from public.compute_streak_leaderboard() csl
    join public.profiles p on p.id = csl.uid
    where csl.streak > 0
    order by csl.streak desc, p.display_name
    limit 1;

  select jsonb_build_object('uid', p.id, 'displayName', p.display_name, 'photoUrl', p.photo_url, 'value', s.points)
    into v_learning
    from (
      select uid, sum(points)::int as points from public.leaderboard_point_events
      where occurred_at >= v_week_start and category = 'Learning'
      group by uid having sum(points) > 0
    ) s
    join public.profiles p on p.id = s.uid
    order by s.points desc, p.display_name
    limit 1;

  select jsonb_build_object('uid', p.id, 'displayName', p.display_name, 'photoUrl', p.photo_url, 'value', s.points)
    into v_work
    from (
      select uid, sum(points)::int as points from public.leaderboard_point_events
      where occurred_at >= v_week_start and category = 'Work'
      group by uid having sum(points) > 0
    ) s
    join public.profiles p on p.id = s.uid
    order by s.points desc, p.display_name
    limit 1;

  select jsonb_build_object('uid', p.id, 'displayName', p.display_name, 'photoUrl', p.photo_url, 'value', s.points)
    into v_network
    from (
      select uid, sum(points)::int as points from public.leaderboard_point_events
      where occurred_at >= v_week_start and category = 'Network'
      group by uid having sum(points) > 0
    ) s
    join public.profiles p on p.id = s.uid
    order by s.points desc, p.display_name
    limit 1;

  return jsonb_build_object(
    'consistency', v_consistency, 'learning', v_learning, 'work', v_work, 'network', v_network
  );
end;
$$;

revoke execute on function public.get_weekly_highlights() from public, anon;
grant execute on function public.get_weekly_highlights() to authenticated;
