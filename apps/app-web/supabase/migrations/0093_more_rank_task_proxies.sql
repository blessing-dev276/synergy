-- Four more auto-tracked rank task proxy types, alongside the existing
-- 'modules_count'/'path_complete'/'prospects_count'/
-- 'mind_training_modules_count'/'mind_training_path_complete' (0065/0078):
--
--   goals_submitted             -- member has ever submitted their monthly
--                                   goals (monthly_goals.status reaching
--                                   'submitted'/'approved', any period --
--                                   monthly_goals' own /goals page already
--                                   re-nudges every period; this rank task
--                                   is "did you ever engage with it", a
--                                   one-time habit milestone, not re-armed
--                                   month to month)
--   referral_count              -- N people personally sponsored, lifetime
--                                   (sponsor_relationships.sponsor_uid,
--                                   same count get_personally_sponsored/
--                                   get_network_overview already surface as
--                                   personallySponsoredCount)
--   profile_completion_percent  -- profile setup reaches N% -- the exact
--                                   3-item rule lib/profileHealth.js already
--                                   computes client-side, mirrored here in
--                                   SQL (basics/whys/goals -- keep both in
--                                   sync if that rule ever changes)
--   earnings_amount             -- verified earnings_logs total reaches $N,
--                                   lifetime
--
-- None of the four take a learning path (proxy_path_id stays null for all
-- of them), and only three take a threshold -- goals_submitted is a plain
-- yes/no, same shape as path_complete. None are recurrence-gated
-- ("daily" vs "once" doesn't change what they check) -- same posture
-- path_complete/mind_training_path_complete already take, since none of
-- these four have a sensible "reset every day" reading. 'manual' tasks are
-- still untouched.

-- ================= schema: widen proxy_type + its shape rule =================
alter table public.rank_tasks drop constraint rank_tasks_proxy_type_check;
alter table public.rank_tasks add constraint rank_tasks_proxy_type_check
  check (proxy_type in (
    'manual', 'modules_count', 'path_complete', 'prospects_count',
    'mind_training_modules_count', 'mind_training_path_complete',
    'goals_submitted', 'referral_count', 'profile_completion_percent', 'earnings_amount'
  ));

alter table public.rank_tasks drop constraint rank_tasks_proxy_shape;
alter table public.rank_tasks add constraint rank_tasks_proxy_shape check (
  (proxy_type = 'manual' and proxy_path_id is null and proxy_threshold is null)
  or (proxy_type = 'modules_count' and proxy_path_id is not null and proxy_threshold is not null and proxy_threshold > 0)
  or (proxy_type = 'path_complete' and proxy_path_id is not null and proxy_threshold is null)
  or (proxy_type = 'prospects_count' and proxy_path_id is null and proxy_threshold is not null and proxy_threshold > 0)
  or (proxy_type = 'mind_training_modules_count' and proxy_path_id is not null and proxy_threshold is not null and proxy_threshold > 0)
  or (proxy_type = 'mind_training_path_complete' and proxy_path_id is not null and proxy_threshold is null)
  or (proxy_type = 'goals_submitted' and proxy_path_id is null and proxy_threshold is null)
  or (proxy_type = 'referral_count' and proxy_path_id is null and proxy_threshold is not null and proxy_threshold > 0)
  or (proxy_type = 'profile_completion_percent' and proxy_path_id is null and proxy_threshold is not null and proxy_threshold between 1 and 100)
  or (proxy_type = 'earnings_amount' and proxy_path_id is null and proxy_threshold is not null and proxy_threshold > 0)
);

-- ================= helpers: one qualifying check per new proxy =================
-- Same posture as count_prospects_added_today/count_modules_completed
-- (0089): no grant to authenticated. They take an arbitrary p_uid with no
-- "is this actually you (or an admin)" check, so they must only ever be
-- called from another already-privileged SECURITY DEFINER function.

create or replace function public.has_ever_submitted_goals(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.monthly_goals where uid = p_uid and status in ('submitted', 'approved')
  );
$$;

revoke execute on function public.has_ever_submitted_goals(uuid) from public, anon, authenticated;

-- Mirrors get_personally_sponsored/get_network_overview's own
-- v_personal_count query (0060) exactly, so this proxy's threshold always
-- agrees with what a member sees on their My Network card.
create or replace function public.count_personally_sponsored(p_uid uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.sponsor_relationships where sponsor_uid = p_uid and active = true;
$$;

revoke execute on function public.count_personally_sponsored(uuid) from public, anon, authenticated;

-- Mirrors lib/profileHealth.js's computeProfileHealth exactly (3 equally-
-- weighted items: onboarding basics, at least one Why, and a fully-filled
-- member_goals row) -- keep both in sync if that rule ever changes.
create or replace function public.compute_profile_health_percent(p_uid uuid)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_basics_done boolean;
  v_whys_done boolean;
  v_goals_done boolean;
  v_done_count int := 0;
begin
  select coalesce((onboarding->>'completed')::boolean, false) into v_basics_done
    from public.profiles where id = p_uid;

  select exists(select 1 from public.member_whys where uid = p_uid) into v_whys_done;

  select coalesce(monthly_income_goal, 0) > 0 and coalesce(team_size_goal, 0) > 0 and target_rank_id is not null
    into v_goals_done
    from public.member_goals where uid = p_uid;

  if v_basics_done then v_done_count := v_done_count + 1; end if;
  if v_whys_done then v_done_count := v_done_count + 1; end if;
  if coalesce(v_goals_done, false) then v_done_count := v_done_count + 1; end if;

  return round(v_done_count::numeric / 3 * 100);
end;
$$;

revoke execute on function public.compute_profile_health_percent(uuid) from public, anon, authenticated;

-- Same "verified" filter AdminDashboard.jsx's own earnings card sums.
create or replace function public.sum_verified_earnings(p_uid uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(amount), 0) from public.earnings_logs where uid = p_uid and status = 'verified';
$$;

revoke execute on function public.sum_verified_earnings(uuid) from public, anon, authenticated;

-- ================= the detector: four more branches =================
create or replace function public.evaluate_rank_task_proxies(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rank_id uuid;
  v_task record;
  v_task_date date := current_date;
  v_existing_id uuid;
  v_count int;
  v_qualifies boolean;
begin
  select rank_id into v_rank_id from public.profiles where id = p_uid;
  if v_rank_id is null then
    return;
  end if;

  for v_task in
    select id, title, recurrence, proxy_type, proxy_path_id, proxy_threshold
    from public.rank_tasks
    where rank_id = v_rank_id and proxy_type <> 'manual'
  loop
    select id into v_existing_id
      from public.rank_task_submissions
      where rank_task_id = v_task.id and uid = p_uid
        and (v_task.recurrence = 'once' or task_date = v_task_date)
      limit 1;
    if v_existing_id is not null then
      continue;
    end if;

    v_qualifies := false;

    if v_task.proxy_type = 'modules_count' then
      v_count := public.count_modules_completed(p_uid, v_task.proxy_path_id, v_task.recurrence = 'daily');
      v_qualifies := v_count >= v_task.proxy_threshold;

    elsif v_task.proxy_type = 'path_complete' then
      v_qualifies := public.is_regular_path_complete(p_uid, v_task.proxy_path_id);

    elsif v_task.proxy_type = 'prospects_count' then
      v_count := public.count_prospects_added_today(p_uid);
      v_qualifies := v_count >= v_task.proxy_threshold;

    elsif v_task.proxy_type = 'mind_training_modules_count' then
      v_count := public.count_mind_training_modules_completed(p_uid, v_task.proxy_path_id, v_task.recurrence = 'daily');
      v_qualifies := v_count >= v_task.proxy_threshold;

    elsif v_task.proxy_type = 'mind_training_path_complete' then
      v_qualifies := public.is_mind_training_path_complete(p_uid, v_task.proxy_path_id);

    elsif v_task.proxy_type = 'goals_submitted' then
      v_qualifies := public.has_ever_submitted_goals(p_uid);

    elsif v_task.proxy_type = 'referral_count' then
      v_count := public.count_personally_sponsored(p_uid);
      v_qualifies := v_count >= v_task.proxy_threshold;

    elsif v_task.proxy_type = 'profile_completion_percent' then
      v_count := public.compute_profile_health_percent(p_uid);
      v_qualifies := v_count >= v_task.proxy_threshold;

    elsif v_task.proxy_type = 'earnings_amount' then
      v_qualifies := public.sum_verified_earnings(p_uid) >= v_task.proxy_threshold;
    end if;

    if not v_qualifies then
      continue;
    end if;

    insert into public.rank_task_submissions (rank_task_id, uid, task_date, status, submitted_at, reviewed_at, review_note)
    values (v_task.id, p_uid, v_task_date, 'approved', now(), now(), 'Tracked automatically from your progress.')
    on conflict (rank_task_id, uid, task_date) do nothing;

    insert into public.notifications (uid, type, title, body, link_to)
    values (
      p_uid, 'rank_task_reviewed', 'Task completed 🎉',
      '"' || v_task.title || '" was completed automatically, based on your progress.',
      '/tasks'
    );

    insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
    values (p_uid, 'rank_task_auto_approved', 'rank_task_submission', v_task.id::text, jsonb_build_object('rank_task_id', v_task.id));
  end loop;

  perform public.evaluate_rank_advancement(p_uid);
end;
$$;
-- CREATE OR REPLACE on evaluate_rank_task_proxies preserves its existing
-- grants (same name, same signature) -- no new revoke/grant needed for it.

-- ================= triggers: the four new progress sources =================

-- Monthly goals: fires the moment a member's goals for any period reach
-- 'submitted' (also covers 'approved', reached only via review_member_goals'
-- own update, which always passes through 'submitted' first -- but the
-- WHEN clause covers both so a direct jump would still be caught).
create or replace function public.trg_check_rank_task_proxies_goals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.evaluate_rank_task_proxies(new.uid);
  return new;
end;
$$;

create trigger on_monthly_goals_check_rank_tasks
  after insert or update on public.monthly_goals
  for each row when (new.status in ('submitted', 'approved'))
  execute function public.trg_check_rank_task_proxies_goals();

-- Sponsor relationships: fires on whoever just became someone's active
-- sponsor -- covers every insert path (signup auto-assign, admin assign/
-- reassign, sponsor-request resolution -- six call sites across several
-- migrations, all of which insert into this one table) plus the rarer case
-- of a previously-inactive row being reactivated.
create or replace function public.trg_check_rank_task_proxies_sponsor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.evaluate_rank_task_proxies(new.sponsor_uid);
  return new;
end;
$$;

create trigger on_sponsor_relationship_check_rank_tasks
  after insert or update of active on public.sponsor_relationships
  for each row when (new.active = true)
  execute function public.trg_check_rank_task_proxies_sponsor();

-- Earnings: fires the moment a log reaches 'verified', whether that's a
-- fresh admin-logged verified entry or a pending one getting reviewed.
create or replace function public.trg_check_rank_task_proxies_earnings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.evaluate_rank_task_proxies(new.uid);
  return new;
end;
$$;

create trigger on_earnings_log_check_rank_tasks
  after insert or update on public.earnings_logs
  for each row when (new.status = 'verified')
  execute function public.trg_check_rank_task_proxies_earnings();

-- Profile completion: three source signals, matching
-- compute_profile_health_percent's three inputs above.
create or replace function public.trg_check_rank_task_proxies_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.evaluate_rank_task_proxies(new.id);
  return new;
end;
$$;

create trigger on_profile_onboarding_check_rank_tasks
  after update of onboarding on public.profiles
  for each row execute function public.trg_check_rank_task_proxies_profile();

create or replace function public.trg_check_rank_task_proxies_whys()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.evaluate_rank_task_proxies(new.uid);
  return new;
end;
$$;

create trigger on_member_whys_check_rank_tasks
  after insert on public.member_whys
  for each row execute function public.trg_check_rank_task_proxies_whys();

create or replace function public.trg_check_rank_task_proxies_member_goals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.evaluate_rank_task_proxies(new.uid);
  return new;
end;
$$;

create trigger on_member_goals_check_rank_tasks
  after insert or update on public.member_goals
  for each row execute function public.trg_check_rank_task_proxies_member_goals();

-- ================= get_my_rank_tasks: expose the three new counters =================
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
      'proxyType', proxy_type, 'proxyPathId', proxy_path_id, 'submission', submission,
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

-- ================= admin CRUD: widen validation to the new types =================
create or replace function public.admin_create_rank_task(
  p_rank_id uuid, p_title text, p_description text, p_recurrence text,
  p_proxy_type text, p_proxy_path_id uuid, p_proxy_threshold int
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_next_order int;
  v_member record;
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'a task needs a title';
  end if;
  if p_recurrence not in ('once', 'daily') then
    raise exception 'invalid recurrence: %', p_recurrence;
  end if;
  if not exists (select 1 from public.ranks where id = p_rank_id) then
    raise exception 'rank not found';
  end if;

  p_proxy_type := coalesce(p_proxy_type, 'manual');
  if p_proxy_type not in (
    'manual', 'modules_count', 'path_complete', 'prospects_count',
    'mind_training_modules_count', 'mind_training_path_complete',
    'goals_submitted', 'referral_count', 'profile_completion_percent', 'earnings_amount'
  ) then
    raise exception 'invalid proxy type: %', p_proxy_type;
  end if;
  if p_proxy_type in ('modules_count', 'path_complete', 'mind_training_modules_count', 'mind_training_path_complete') and p_proxy_path_id is null then
    raise exception 'pick a learning path to track';
  end if;
  if p_proxy_type in ('modules_count', 'mind_training_modules_count') and coalesce(p_proxy_threshold, 0) < 1 then
    raise exception 'enter how many modules must be completed';
  end if;
  if p_proxy_type = 'prospects_count' and coalesce(p_proxy_threshold, 0) < 1 then
    raise exception 'enter how many prospects must be added';
  end if;
  if p_proxy_type = 'referral_count' and coalesce(p_proxy_threshold, 0) < 1 then
    raise exception 'enter how many people must be personally sponsored';
  end if;
  if p_proxy_type = 'profile_completion_percent' and (coalesce(p_proxy_threshold, 0) < 1 or p_proxy_threshold > 100) then
    raise exception 'enter a profile completion percent between 1 and 100';
  end if;
  if p_proxy_type = 'earnings_amount' and coalesce(p_proxy_threshold, 0) < 1 then
    raise exception 'enter a minimum verified earnings amount';
  end if;
  if p_proxy_type not in (
    'modules_count', 'mind_training_modules_count', 'prospects_count',
    'referral_count', 'profile_completion_percent', 'earnings_amount'
  ) then
    p_proxy_threshold := null;
  end if;
  if p_proxy_type not in ('modules_count', 'path_complete', 'mind_training_modules_count', 'mind_training_path_complete') then
    p_proxy_path_id := null;
  end if;
  if p_proxy_path_id is not null and not exists (select 1 from public.learning_paths where id = p_proxy_path_id) then
    raise exception 'learning path not found';
  end if;

  select coalesce(max(order_index), 0) + 1 into v_next_order from public.rank_tasks where rank_id = p_rank_id;

  insert into public.rank_tasks (rank_id, title, description, recurrence, order_index, created_by, proxy_type, proxy_path_id, proxy_threshold)
  values (p_rank_id, trim(p_title), coalesce(p_description, ''), p_recurrence, v_next_order, auth.uid(), p_proxy_type, p_proxy_path_id, p_proxy_threshold)
  returning id into v_id;

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'rank_task_created', 'rank_task', v_id::text, jsonb_build_object('rank_id', p_rank_id));

  -- Retroactive check: a member already sitting on enough progress when
  -- this task is created shouldn't have to wait for their next qualifying
  -- action to see it land.
  if p_proxy_type <> 'manual' then
    for v_member in select id from public.profiles where rank_id = p_rank_id loop
      perform public.evaluate_rank_task_proxies(v_member.id);
    end loop;
  end if;

  return v_id;
end;
$$;

create or replace function public.admin_update_rank_task(
  p_id uuid, p_title text, p_description text, p_recurrence text, p_order_index int,
  p_proxy_type text, p_proxy_path_id uuid, p_proxy_threshold int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rank_id uuid;
  v_member record;
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'a task needs a title';
  end if;
  if p_recurrence not in ('once', 'daily') then
    raise exception 'invalid recurrence: %', p_recurrence;
  end if;
  select rank_id into v_rank_id from public.rank_tasks where id = p_id;
  if v_rank_id is null then
    raise exception 'task not found';
  end if;

  p_proxy_type := coalesce(p_proxy_type, 'manual');
  if p_proxy_type not in (
    'manual', 'modules_count', 'path_complete', 'prospects_count',
    'mind_training_modules_count', 'mind_training_path_complete',
    'goals_submitted', 'referral_count', 'profile_completion_percent', 'earnings_amount'
  ) then
    raise exception 'invalid proxy type: %', p_proxy_type;
  end if;
  if p_proxy_type in ('modules_count', 'path_complete', 'mind_training_modules_count', 'mind_training_path_complete') and p_proxy_path_id is null then
    raise exception 'pick a learning path to track';
  end if;
  if p_proxy_type in ('modules_count', 'mind_training_modules_count') and coalesce(p_proxy_threshold, 0) < 1 then
    raise exception 'enter how many modules must be completed';
  end if;
  if p_proxy_type = 'prospects_count' and coalesce(p_proxy_threshold, 0) < 1 then
    raise exception 'enter how many prospects must be added';
  end if;
  if p_proxy_type = 'referral_count' and coalesce(p_proxy_threshold, 0) < 1 then
    raise exception 'enter how many people must be personally sponsored';
  end if;
  if p_proxy_type = 'profile_completion_percent' and (coalesce(p_proxy_threshold, 0) < 1 or p_proxy_threshold > 100) then
    raise exception 'enter a profile completion percent between 1 and 100';
  end if;
  if p_proxy_type = 'earnings_amount' and coalesce(p_proxy_threshold, 0) < 1 then
    raise exception 'enter a minimum verified earnings amount';
  end if;
  if p_proxy_type not in (
    'modules_count', 'mind_training_modules_count', 'prospects_count',
    'referral_count', 'profile_completion_percent', 'earnings_amount'
  ) then
    p_proxy_threshold := null;
  end if;
  if p_proxy_type not in ('modules_count', 'path_complete', 'mind_training_modules_count', 'mind_training_path_complete') then
    p_proxy_path_id := null;
  end if;
  if p_proxy_path_id is not null and not exists (select 1 from public.learning_paths where id = p_proxy_path_id) then
    raise exception 'learning path not found';
  end if;

  update public.rank_tasks
    set title = trim(p_title),
        description = coalesce(p_description, ''),
        recurrence = p_recurrence,
        order_index = coalesce(p_order_index, order_index),
        proxy_type = p_proxy_type,
        proxy_path_id = p_proxy_path_id,
        proxy_threshold = p_proxy_threshold,
        updated_at = now()
    where id = p_id;

  if p_proxy_type <> 'manual' then
    for v_member in select id from public.profiles where rank_id = v_rank_id loop
      perform public.evaluate_rank_task_proxies(v_member.id);
    end loop;
  end if;
end;
$$;
-- CREATE OR REPLACE on admin_create_rank_task/admin_update_rank_task
-- preserves their existing grants (same names, same signatures).
