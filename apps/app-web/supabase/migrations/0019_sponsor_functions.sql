-- Sponsor/network restructuring, part 2 of 3 (RPCs + updated signup trigger).
-- Builds on 0018's schema. Deploy this, then the frontend build that uses
-- it, then 0020 last (see 0018's header comment for the full sequencing
-- rationale).

-- ---------- signup: capture sponsor_uid (matched) or claimed_sponsor_name (unmatched) ----------
-- Exactly one of the two is ever set by the client at signup: either the
-- member picked a real match from SponsorPicker (sponsor_uid), or typed a
-- name nothing matched (claimed_sponsor_name) — never both, and the
-- claimed name is never silently discarded. Carries forward 0016's
-- orientation-screening behavior (new signups start 'pending', not
-- 'active', until they pass orientation and an admin approves them) —
-- only the invited_by_uid -> sponsor_uid/claimed_sponsor_name capture
-- changes here, the status behavior is unchanged.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sponsor_uid uuid;
  v_claimed_name text;
begin
  begin
    v_sponsor_uid := nullif(new.raw_user_meta_data->>'sponsor_uid', '')::uuid;
  exception when others then
    v_sponsor_uid := null;
  end;

  if v_sponsor_uid is not null and not exists (
    select 1 from public.profiles where id = v_sponsor_uid and status = 'active'
  ) then
    v_sponsor_uid := null;
  end if;

  v_claimed_name := nullif(trim(new.raw_user_meta_data->>'claimed_sponsor_name'), '');

  insert into public.profiles (id, display_name, email, sponsor_uid, status)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', ''), new.email, v_sponsor_uid, 'pending')
  on conflict (id) do nothing;

  if v_sponsor_uid is not null then
    insert into public.sponsor_relationships (member_uid, sponsor_uid, source, active, assigned_at)
    values (new.id, v_sponsor_uid, 'signup', true, now());
  elsif v_claimed_name is not null then
    insert into public.sponsor_requests (member_uid, claimed_sponsor_name, status)
    values (new.id, v_claimed_name, 'pending');
  end if;

  return new;
end;
$$;
-- Trigger on_auth_user_created (0003) already points at this function by
-- name; CREATE OR REPLACE is enough, no need to redeclare the trigger.

-- ---------- live sponsor search (anon-callable, pre-auth signup) ----------
-- Replaces list_inviters (0012). Name-only, no email/role/photo exposed;
-- min 2 chars and a result cap so an empty/short query can't be used to
-- scrape the full member list.
create or replace function public.search_sponsors(p_query text)
returns table (id uuid, display_name text)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.display_name
  from public.profiles p
  where p.status = 'active'
    and coalesce(p.display_name, '') <> ''
    and length(trim(coalesce(p_query, ''))) >= 2
    and position(lower(trim(p_query)) in lower(p.display_name)) > 0
  order by p.display_name
  limit 20;
$$;

revoke execute on function public.search_sponsors(text) from public;
grant execute on function public.search_sponsors(text) to anon, authenticated;

-- ---------- a member's own sponsor (mirrors get_my_mentor's shape) ----------
create or replace function public.get_my_sponsor()
returns table (id uuid, display_name text, email text, photo_url text)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.display_name, p.email, p.photo_url
  from public.profiles p
  join public.profiles me on me.sponsor_uid = p.id
  where me.id = auth.uid();
$$;

revoke execute on function public.get_my_sponsor() from public, anon;
grant execute on function public.get_my_sponsor() to authenticated;

-- ---------- admin: assign/reassign a member's sponsor, with cycle prevention ----------
-- Cycle guard: walk UP p_sponsor_uid's ancestor chain. If p_member_uid shows
-- up there, p_sponsor_uid is currently a descendant of p_member_uid, so
-- pointing p_member_uid at p_sponsor_uid would close a loop. Signup-created
-- edges never need this check (a brand-new account can't be anyone's
-- ancestor yet) — only this admin-reassignment path can create a cycle.
create or replace function public.assign_sponsor(p_member_uid uuid, p_sponsor_uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_role text;
  v_sponsor_status text;
  v_creates_cycle boolean;
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;
  if p_member_uid = p_sponsor_uid then
    raise exception 'a member cannot sponsor themselves';
  end if;

  select role into v_member_role from public.profiles where id = p_member_uid;
  if v_member_role is null then
    raise exception 'member not found';
  end if;

  select status into v_sponsor_status from public.profiles where id = p_sponsor_uid;
  if v_sponsor_status is null then
    raise exception 'sponsor not found';
  end if;

  with recursive ancestors as (
    select sponsor_uid, 1 as depth from public.sponsor_relationships
      where member_uid = p_sponsor_uid and active = true
    union all
    select sr.sponsor_uid, a.depth + 1
      from public.sponsor_relationships sr
      join ancestors a on sr.member_uid = a.sponsor_uid
      where sr.active = true and a.depth < 500
  )
  select exists (select 1 from ancestors where sponsor_uid = p_member_uid) into v_creates_cycle;

  if v_creates_cycle then
    raise exception 'this would create a cycle: % is already downline of %', p_sponsor_uid, p_member_uid;
  end if;

  update public.sponsor_relationships set active = false, deactivated_at = now()
    where member_uid = p_member_uid and active = true;

  insert into public.sponsor_relationships (member_uid, sponsor_uid, assigned_by, source, active, assigned_at)
  values (p_member_uid, p_sponsor_uid, auth.uid(), 'admin_reassigned', true, now());

  update public.profiles set sponsor_uid = p_sponsor_uid where id = p_member_uid;

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'sponsor_assigned', 'sponsor_relationship', p_member_uid::text || '_' || p_sponsor_uid::text, jsonb_build_object('sponsorUid', p_sponsor_uid));
end;
$$;

revoke execute on function public.assign_sponsor(uuid, uuid) from public, anon;
grant execute on function public.assign_sponsor(uuid, uuid) to authenticated;

-- ---------- admin: resolve a pending sponsor_request by linking the real account ----------
-- Composes assign_sponsor rather than duplicating its logic (same
-- composition style as get_journey_overview calling compute_track_progress,
-- 0009) — the inner admin check still sees the real caller since SECURITY
-- DEFINER nesting doesn't change auth.uid().
create or replace function public.resolve_sponsor_request(p_request_id uuid, p_sponsor_uid uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_uid uuid;
  v_status text;
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;

  select member_uid, status into v_member_uid, v_status from public.sponsor_requests where id = p_request_id;
  if v_member_uid is null then
    raise exception 'sponsor request not found';
  end if;
  if v_status <> 'pending' then
    raise exception 'this request has already been resolved';
  end if;

  perform public.assign_sponsor(v_member_uid, p_sponsor_uid);

  update public.sponsor_requests
    set status = 'resolved', resolved_sponsor_uid = p_sponsor_uid, resolved_by = auth.uid(),
        resolved_at = now(), resolution_note = coalesce(p_note, '')
    where id = p_request_id;

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'sponsor_request_resolved', 'sponsor_request', p_request_id::text, jsonb_build_object('sponsorUid', p_sponsor_uid));
end;
$$;

create or replace function public.reject_sponsor_request(p_request_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;

  select status into v_status from public.sponsor_requests where id = p_request_id;
  if v_status is null then
    raise exception 'sponsor request not found';
  end if;
  if v_status <> 'pending' then
    raise exception 'this request has already been resolved';
  end if;

  update public.sponsor_requests
    set status = 'rejected', resolved_by = auth.uid(), resolved_at = now(), resolution_note = coalesce(p_note, '')
    where id = p_request_id;

  insert into public.activity_log (actor_uid, action, target_type, target_id)
  values (auth.uid(), 'sponsor_request_rejected', 'sponsor_request', p_request_id::text);
end;
$$;

revoke execute on function public.resolve_sponsor_request(uuid, uuid, text) from public, anon;
grant execute on function public.resolve_sponsor_request(uuid, uuid, text) to authenticated;
revoke execute on function public.reject_sponsor_request(uuid, text) from public, anon;
grant execute on function public.reject_sponsor_request(uuid, text) to authenticated;

-- ---------- direct downline (1-hop), with a training-journey signal per member ----------
-- The overdueTaskCount is the network<->training connection point: uses
-- the existing is_task_done/tasks.due_date signal (0008/0009), nothing new
-- invented here.
create or replace function public.get_personally_sponsored(p_uid uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if p_uid <> auth.uid() and coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id,
      'displayName', p.display_name,
      'status', p.status,
      'photoUrl', p.photo_url,
      'joinedAt', p.created_at,
      'stageTitle', s.title,
      'overdueTaskCount', (
        select count(*) from public.tasks tk
        where tk.assigned_to_uid = p.id and tk.is_required = true
          and tk.due_date is not null and tk.due_date < now()
          and not public.is_task_done(tk.id, p.id)
      )
    ) order by p.created_at desc)
    from public.sponsor_relationships sr
    join public.profiles p on p.id = sr.member_uid
    left join public.member_journey mj on mj.uid = p.id
    left join public.stages s on s.id = mj.current_stage_id
    where sr.sponsor_uid = p_uid and sr.active = true
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.get_personally_sponsored(uuid) from public, anon;
grant execute on function public.get_personally_sponsored(uuid) to authenticated;

-- ---------- full downline tree (recursive CTE), depth-capped ----------
create or replace function public.get_network(p_uid uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if p_uid <> auth.uid() and coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied';
  end if;

  return coalesce((
    with recursive downline as (
      select sr.member_uid, sr.sponsor_uid, 1 as depth
        from public.sponsor_relationships sr
        where sr.sponsor_uid = p_uid and sr.active = true
      union all
      select sr.member_uid, sr.sponsor_uid, d.depth + 1
        from public.sponsor_relationships sr
        join downline d on sr.sponsor_uid = d.member_uid
        where sr.active = true and d.depth < 25
    )
    select jsonb_agg(jsonb_build_object(
      'id', p.id,
      'displayName', p.display_name,
      'status', p.status,
      'sponsorUid', d.sponsor_uid,
      'depth', d.depth,
      'stageTitle', s.title,
      'joinedAt', p.created_at
    ) order by d.depth, p.created_at)
    from downline d
    join public.profiles p on p.id = d.member_uid
    left join public.member_journey mj on mj.uid = p.id
    left join public.stages s on s.id = mj.current_stage_id
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.get_network(uuid) from public, anon;
grant execute on function public.get_network(uuid) to authenticated;

-- ---------- network-wide aggregate stats for the member Network dashboard ----------
-- rank/rankStatus/milestones are explicit placeholders — no compensation
-- plan exists yet, so no qualification/rank rule is invented here.
-- "in training" / "completed training" are derived from the existing
-- journey system's stage-ordering signal (not a new comp-plan rule):
-- "completed" = currently at the last published stage.
create or replace function public.get_network_overview(p_uid uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_personal_count int;
  v_result jsonb;
begin
  if p_uid <> auth.uid() and coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied';
  end if;

  select count(*) into v_personal_count
    from public.sponsor_relationships where sponsor_uid = p_uid and active = true;

  with recursive downline as (
    select sr.member_uid, 1 as depth from public.sponsor_relationships sr
      where sr.sponsor_uid = p_uid and sr.active = true
    union all
    select sr.member_uid, d.depth + 1
      from public.sponsor_relationships sr
      join downline d on sr.sponsor_uid = d.member_uid
      where sr.active = true and d.depth < 25
  ),
  final_stage as (
    select id from public.stages where published = true order by order_index desc limit 1
  ),
  enriched as (
    select p.id, p.status, mj.current_stage_id,
      exists (
        select 1 from public.tasks tk
        where tk.assigned_to_uid = p.id and tk.is_required = true
          and tk.due_date is not null and tk.due_date < now()
          and not public.is_task_done(tk.id, p.id)
      ) as has_overdue
    from downline d
    join public.profiles p on p.id = d.member_uid
    left join public.member_journey mj on mj.uid = p.id
  )
  select jsonb_build_object(
    'personallySponsoredCount', v_personal_count,
    'networkSize', count(*),
    'activeCount', count(*) filter (where status = 'active'),
    'inactiveCount', count(*) filter (where status <> 'active'),
    'inTrainingCount', count(*) filter (where current_stage_id is not null and current_stage_id is distinct from (select id from final_stage)),
    'completedTrainingCount', count(*) filter (where current_stage_id is not null and current_stage_id = (select id from final_stage)),
    'membersWithOverdueTasks', count(*) filter (where has_overdue),
    'rank', null,
    'rankStatus', 'not_configured',
    'milestones', '[]'::jsonb
  ) into v_result
  from enriched;

  return coalesce(v_result, jsonb_build_object(
    'personallySponsoredCount', v_personal_count, 'networkSize', 0, 'activeCount', 0,
    'inactiveCount', 0, 'inTrainingCount', 0, 'completedTrainingCount', 0,
    'membersWithOverdueTasks', 0, 'rank', null, 'rankStatus', 'not_configured', 'milestones', '[]'::jsonb
  ));
end;
$$;

revoke execute on function public.get_network_overview(uuid) from public, anon;
grant execute on function public.get_network_overview(uuid) to authenticated;
