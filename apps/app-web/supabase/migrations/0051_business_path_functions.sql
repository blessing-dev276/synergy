-- Business Path rebuild, part 2 of 7 (RPCs). Builds on 0050's schema.
-- Bodies reproduce today's Journey-engine logic (0009/0017/0020/0038/0043
-- are the exact source bodies ported here) against the new business_path_*
-- tables, including the participation-path filter that's woven into
-- get_journey_overview/compute_rank_progress/get_my_content_assignments/
-- get_next_best_action/get_admin_progression_overview today (0043).
--
-- Deliberately DROPPED, not ported: the milestones system and the
-- member-initiated promotion-request workflow (request_stage_promotion,
-- review_stage_promotion, check_member_milestones, award_milestone_manual)
-- -- confirmed product decision, no replacement.
--
-- This file is purely additive: every function here is a NEW name
-- (business_path_-prefixed), and none of the OLD-named functions being
-- superseded (get_journey_overview, get_next_best_action, can_view_journey,
-- compute_track_progress, compute_rank_progress, is_specialization_unlocked,
-- set_member_stage, set_member_specialization, admin_set_member_specialization,
-- get_admin_progression_overview) are dropped in this file, even though
-- they're being renamed. That old-name cleanup is deliberately deferred to
-- 0055, not done here -- tracing the call graph shows why it can't happen
-- yet: complete_content_assignment/review_content_evidence (the individual-
-- task functions that must stay untouched through this whole rebuild) still
-- call check_member_milestones, which still calls compute_rank_progress,
-- which still calls can_view_journey and is_specialization_unlocked. Also,
-- request_stage_promotion still calls compute_track_progress, and
-- review_stage_promotion still calls set_member_stage. Dropping any of
-- those four old-named helpers here would break the individual-task
-- completion flow -- the exact class of bug the plan's landmine #2
-- (check_member_milestones) calls out -- for the entire window between this
-- migration and 0055, when the milestone call is finally stripped and the
-- old functions are retired together, in the only order that's safe.

-- ---------- permission helper: caller may view p_uid's Business Path data ----------
-- Mirrors can_view_journey (0020) exactly, including the lack of an explicit
-- revoke/grant -- it's never called directly by a client, only from within
-- other SECURITY DEFINER functions below.
create or replace function public.can_view_business_path(p_uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select p_uid = auth.uid() or public.current_role() = 'admin';
$$;

-- ---------- is a specialization unlocked for this member? ----------
-- Mirrors is_specialization_unlocked (0038): a member always sees the one
-- specialization they've chosen; graphics_design is the compulsory newbie-
-- level skill (unlocked for everyone while their current stage's level is
-- 'newbie'), regardless of what they've chosen; everything else stays
-- locked until picked.
create or replace function public.is_business_path_specialization_unlocked(p_uid uuid, p_specialization_id uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_track_id uuid;
  v_key text;
  v_chosen_id uuid;
  v_level_key text;
begin
  if p_specialization_id is null then
    return true;
  end if;

  select track_id, key into v_track_id, v_key
    from public.business_path_specializations where id = p_specialization_id;

  select specialization_id into v_chosen_id
    from public.member_business_path_specializations
    where uid = p_uid and track_id = v_track_id;

  if v_chosen_id = p_specialization_id then
    return true;
  end if;

  if v_key = 'graphics_design' then
    select l.key into v_level_key
      from public.member_business_path_stage mbs
      join public.business_path_stages s on s.id = mbs.current_stage_id
      join public.business_path_levels l on l.id = s.path_level_id
      where mbs.uid = p_uid;

    if v_level_key = 'newbie' then
      return true;
    end if;
  end if;

  return false;
end;
$$;

revoke execute on function public.is_business_path_specialization_unlocked(uuid, uuid) from public, anon;
grant execute on function public.is_business_path_specialization_unlocked(uuid, uuid) to authenticated;

-- ---------- per-track progress within a stage ----------
-- Mirrors compute_track_progress (0038's specialization-lock rewrite),
-- reading business_path_placements (always stage/track-scoped, no `scope`
-- column to filter by).
create or replace function public.compute_business_path_track_progress(p_uid uuid, p_stage_id uuid, p_track_id uuid)
returns int
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_total int;
  v_done int := 0;
  v_bp record;
begin
  if not public.can_view_business_path(p_uid) then
    raise exception 'permission denied';
  end if;

  select count(*) into v_total from public.business_path_placements
    where stage_id = p_stage_id and track_id = p_track_id and is_required = true
      and (specialization_id is null or public.is_business_path_specialization_unlocked(p_uid, specialization_id));

  if v_total = 0 then
    return 0;
  end if;

  for v_bp in
    select id from public.business_path_placements
      where stage_id = p_stage_id and track_id = p_track_id and is_required = true
        and (specialization_id is null or public.is_business_path_specialization_unlocked(p_uid, specialization_id))
  loop
    if public.is_business_path_placement_done(v_bp.id, p_uid) then
      v_done := v_done + 1;
    end if;
  end loop;

  return round((v_done::numeric / v_total) * 100);
end;
$$;

revoke execute on function public.compute_business_path_track_progress(uuid, uuid, uuid) from public, anon;
grant execute on function public.compute_business_path_track_progress(uuid, uuid, uuid) to authenticated;

-- ---------- Path Level progress: required placements across every stage in the member's level ----------
-- Mirrors compute_rank_progress (0043's participation-path-aware version).
-- Unlike the old function (which kept its parameter named p_level_id only
-- because CREATE OR REPLACE can't rename an existing parameter across the
-- levels->ranks rename), this is a brand-new function so the name is clean.
create or replace function public.compute_business_path_level_progress(p_uid uuid, p_level_id uuid)
returns int
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_path text;
  v_total int;
  v_done int;
begin
  if not public.can_view_business_path(p_uid) then
    raise exception 'permission denied';
  end if;

  select coalesce(participation_path, 'full') into v_path from public.profiles where id = p_uid;

  with level_reqs as (
    select bp.id
    from public.business_path_placements bp
    join public.business_path_stages s on s.id = bp.stage_id
    join public.business_path_tracks t on t.id = bp.track_id
    where s.path_level_id = p_level_id and bp.is_required = true
      and (v_path = 'full' or t.key not in ('skill', 'freelancing'))
      and (
        bp.specialization_id is null
        or public.is_business_path_specialization_unlocked(p_uid, bp.specialization_id)
      )
  )
  select count(*), count(*) filter (where public.is_business_path_placement_done(id, p_uid))
    into v_total, v_done
  from level_reqs;

  if v_total = 0 then
    return 0;
  end if;
  return round((v_done::numeric / v_total) * 100);
end;
$$;

revoke execute on function public.compute_business_path_level_progress(uuid, uuid) from public, anon;
grant execute on function public.compute_business_path_level_progress(uuid, uuid) to authenticated;

-- ---------- is a placement "done" for a given member? ----------
-- Mirrors is_content_assignment_done (0030) -- same polymorphic dispatch,
-- keyed by business_path_placements/member_business_path_progress instead.
create or replace function public.is_business_path_placement_done(p_placement_id uuid, p_uid uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_content_type text;
  v_course_id uuid;
  v_assignment_id uuid;
begin
  select ci.content_type, ci.course_id, ci.assignment_id
    into v_content_type, v_course_id, v_assignment_id
    from public.business_path_placements bp
    join public.content_items ci on ci.id = bp.content_item_id
    where bp.id = p_placement_id;

  if v_content_type = 'course' then
    return exists (
      select 1 from public.enrollments
      where uid = p_uid and course_id = v_course_id and status = 'completed'
    );
  end if;

  if v_content_type = 'assignment' then
    return exists (
      select 1 from public.assignment_submissions
      where uid = p_uid and assignment_id = v_assignment_id and status = 'approved'
    );
  end if;

  return exists (
    select 1 from public.member_business_path_progress
    where uid = p_uid and business_path_placement_id = p_placement_id
  );
end;
$$;

revoke execute on function public.is_business_path_placement_done(uuid, uuid) from public, anon;
grant execute on function public.is_business_path_placement_done(uuid, uuid) to authenticated;

-- ---------- is a placement unlocked (all its dependencies done)? ----------
create or replace function public.business_path_placement_unlocked(p_placement_id uuid, p_uid uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_blocked boolean;
begin
  select exists (
    select 1 from public.business_path_placement_dependencies d
    where d.business_path_placement_id = p_placement_id
      and not public.is_business_path_placement_done(d.depends_on_business_path_placement_id, p_uid)
  ) into v_blocked;
  return not v_blocked;
end;
$$;

revoke execute on function public.business_path_placement_unlocked(uuid, uuid) from public, anon;
grant execute on function public.business_path_placement_unlocked(uuid, uuid) to authenticated;

-- ---------- full Business Path overview for the member dashboard ----------
-- Mirrors get_journey_overview (0043's final body -- rank/level +
-- participation-path aware). Ensures a member_business_path_stage row
-- exists (defaulting to the earliest published stage) the first time a
-- member views their own overview; never auto-starts on someone else's
-- behalf when an admin is just viewing it. Uses 'level'/'levelProgressPercent'/
-- 'nextLevel' (not 'rank') to match the business_path_levels table name and
-- the "Path Level" branding this ladder now carries.
create or replace function public.get_business_path_overview(p_uid uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stage_id uuid;
  v_stage record;
  v_tracks jsonb;
  v_level_id uuid;
  v_level record;
  v_next_level_id uuid;
  v_next_level_key text;
  v_next_level_label text;
  v_level_percent int;
  v_path text;
begin
  if not public.can_view_business_path(p_uid) then
    raise exception 'permission denied';
  end if;

  select coalesce(participation_path, 'full') into v_path from public.profiles where id = p_uid;

  select current_stage_id into v_stage_id from public.member_business_path_stage where uid = p_uid;

  if v_stage_id is null and p_uid = auth.uid() then
    select id into v_stage_id from public.business_path_stages where published = true order by order_index limit 1;
    if v_stage_id is not null then
      insert into public.member_business_path_stage (uid, current_stage_id, started_at, updated_at)
      values (p_uid, v_stage_id, now(), now())
      on conflict (uid) do nothing;
    end if;
  end if;

  if v_stage_id is null then
    return jsonb_build_object('stage', null, 'tracks', '[]'::jsonb, 'level', null, 'levelProgressPercent', 0, 'nextLevel', null, 'participationPath', v_path);
  end if;

  select id, key, title, description, order_index, path_level_id into v_stage from public.business_path_stages where id = v_stage_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'trackId', t.id,
      'key', t.key,
      'label', t.label,
      'icon', t.icon,
      'colorToken', t.color_token,
      'progressPercent', public.compute_business_path_track_progress(p_uid, v_stage_id, t.id),
      'specializations', (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'id', ts.id, 'key', ts.key, 'label', ts.label, 'icon', ts.icon,
            'locked', not public.is_business_path_specialization_unlocked(p_uid, ts.id)
          )
          order by ts.order_index
        ), '[]'::jsonb)
        from public.business_path_specializations ts
        where ts.track_id = t.id and ts.published = true
      ),
      'selectedSpecializationId', (
        select mbs.specialization_id from public.member_business_path_specializations mbs
        where mbs.uid = p_uid and mbs.track_id = t.id
      )
    ) order by t.key
  ), '[]'::jsonb) into v_tracks
  from public.business_path_stage_tracks st
  join public.business_path_tracks t on t.id = st.track_id
  where st.stage_id = v_stage_id
    and (v_path = 'full' or t.key not in ('skill', 'freelancing'));

  v_level_id := v_stage.path_level_id;

  if v_level_id is null then
    return jsonb_build_object(
      'stage', jsonb_build_object('id', v_stage.id, 'key', v_stage.key, 'title', v_stage.title, 'description', v_stage.description),
      'tracks', v_tracks,
      'level', null,
      'levelProgressPercent', 0,
      'nextLevel', null,
      'participationPath', v_path
    );
  end if;

  select id, key, label, purpose, outcome, order_index into v_level from public.business_path_levels where id = v_level_id;
  v_level_percent := public.compute_business_path_level_progress(p_uid, v_level_id);

  select id, key, label into v_next_level_id, v_next_level_key, v_next_level_label
    from public.business_path_levels where order_index > v_level.order_index order by order_index limit 1;

  return jsonb_build_object(
    'stage', jsonb_build_object('id', v_stage.id, 'key', v_stage.key, 'title', v_stage.title, 'description', v_stage.description),
    'tracks', v_tracks,
    'level', jsonb_build_object('id', v_level.id, 'key', v_level.key, 'label', v_level.label, 'purpose', v_level.purpose, 'outcome', v_level.outcome, 'orderIndex', v_level.order_index),
    'levelProgressPercent', v_level_percent,
    'nextLevel', case when v_next_level_id is null then null else jsonb_build_object('id', v_next_level_id, 'key', v_next_level_key, 'label', v_next_level_label) end,
    'participationPath', v_path
  );
end;
$$;

revoke execute on function public.get_business_path_overview(uuid) from public, anon;
grant execute on function public.get_business_path_overview(uuid) to authenticated;

-- ---------- next best action ----------
-- Mirrors get_next_best_action (0043's participation-path-aware version).
create or replace function public.get_next_business_path_action(p_uid uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stage_id uuid;
  v_path text;
  v_bp record;
begin
  if not public.can_view_business_path(p_uid) then
    raise exception 'permission denied';
  end if;

  select current_stage_id into v_stage_id from public.member_business_path_stage where uid = p_uid;
  if v_stage_id is null then
    return null;
  end if;
  select coalesce(participation_path, 'full') into v_path from public.profiles where id = p_uid;

  for v_bp in
    select bp.id, coalesce(ci.title, c.title, a.title) as title,
           coalesce(ci.description, c.description, a.instructions, '') as description,
           bp.due_date, bp.order_index, bp.specialization_id,
           tr.id as track_id, tr.key as track_key, tr.label as track_label, tr.icon as track_icon
      from public.business_path_placements bp
      join public.content_items ci on ci.id = bp.content_item_id
      left join public.courses c on c.id = ci.course_id
      left join public.assignments a on a.id = ci.assignment_id
      join public.business_path_tracks tr on tr.id = bp.track_id
      where bp.stage_id = v_stage_id and bp.is_required = true
        and (v_path = 'full' or tr.key not in ('skill', 'freelancing'))
      order by bp.due_date nulls last, bp.order_index
  loop
    if v_bp.specialization_id is not null and not public.is_business_path_specialization_unlocked(p_uid, v_bp.specialization_id) then
      continue;
    end if;

    if not public.is_business_path_placement_done(v_bp.id, p_uid) and public.business_path_placement_unlocked(v_bp.id, p_uid) then
      return jsonb_build_object(
        'taskId', v_bp.id,
        'title', v_bp.title,
        'description', v_bp.description,
        'dueDate', v_bp.due_date,
        'trackKey', v_bp.track_key,
        'trackLabel', v_bp.track_label,
        'trackIcon', v_bp.track_icon
      );
    end if;
  end loop;

  return null;
end;
$$;

revoke execute on function public.get_next_business_path_action(uuid) from public, anon;
grant execute on function public.get_next_business_path_action(uuid) to authenticated;

-- ---------- admin: directly set/advance a member's current Business Path stage ----------
-- Mirrors set_member_stage (0013, notification-inclusive version). This is
-- the entire replacement for the old promotion-request workflow -- admins
-- move a member's stage directly, no member-initiated request/approval loop.
create or replace function public.set_member_business_path_stage(p_uid uuid, p_stage_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_role text;
  v_stage_title text;
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;

  select role into v_member_role from public.profiles where id = p_uid;
  if v_member_role is distinct from 'member' then
    raise exception 'target % is not a member', p_uid;
  end if;

  if p_stage_id is not null then
    select title into v_stage_title from public.business_path_stages where id = p_stage_id;
    if v_stage_title is null then
      raise exception 'stage not found';
    end if;
  end if;

  insert into public.member_business_path_stage (uid, current_stage_id, started_at, updated_at)
  values (p_uid, p_stage_id, now(), now())
  on conflict (uid) do update set current_stage_id = p_stage_id, updated_at = now();

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'member_business_path_stage_set', 'member_business_path_stage', p_uid::text, jsonb_build_object('stage_id', p_stage_id));

  if v_stage_title is not null then
    insert into public.notifications (uid, type, title, body, link_to)
    values (p_uid, 'business_path_stage_changed', 'Your Business Path moved forward', 'You''re now on: ' || v_stage_title, '/dashboard');
  end if;
end;
$$;

revoke execute on function public.set_member_business_path_stage(uuid, uuid) from public, anon;
grant execute on function public.set_member_business_path_stage(uuid, uuid) to authenticated;

-- ---------- member: one-time self-select of a track specialization ----------
-- Mirrors set_member_specialization (0039's locked version -- self-service
-- can't switch it once chosen; only the admin override below can).
create or replace function public.set_my_business_path_specialization(p_track_id uuid, p_specialization_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_track_id uuid;
begin
  if exists (
    select 1 from public.member_business_path_specializations
    where uid = auth.uid() and track_id = p_track_id
  ) then
    raise exception 'you''ve already chosen a specialization for this track -- ask an admin to change it';
  end if;

  select track_id into v_track_id from public.business_path_specializations
    where id = p_specialization_id and published = true;
  if v_track_id is null or v_track_id <> p_track_id then
    raise exception 'invalid specialization for this track';
  end if;

  insert into public.member_business_path_specializations (uid, track_id, specialization_id, selected_at)
  values (auth.uid(), p_track_id, p_specialization_id, now());

  insert into public.activity_log (actor_uid, action, target_type, target_id)
  values (auth.uid(), 'business_path_specialization_selected', 'business_path_specialization', p_specialization_id::text);
end;
$$;

revoke execute on function public.set_my_business_path_specialization(uuid, uuid) from public, anon;
grant execute on function public.set_my_business_path_specialization(uuid, uuid) to authenticated;

-- ---------- admin: override a member's locked-in specialization ----------
-- Mirrors admin_set_member_specialization (0039).
create or replace function public.admin_set_member_business_path_specialization(p_uid uuid, p_track_id uuid, p_specialization_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_track_id uuid;
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;

  select track_id into v_track_id from public.business_path_specializations
    where id = p_specialization_id and published = true;
  if v_track_id is null or v_track_id <> p_track_id then
    raise exception 'invalid specialization for this track';
  end if;

  insert into public.member_business_path_specializations (uid, track_id, specialization_id, selected_at)
  values (p_uid, p_track_id, p_specialization_id, now())
  on conflict (uid, track_id) do update set specialization_id = excluded.specialization_id, selected_at = now();

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'business_path_specialization_reassigned', 'business_path_specialization', p_specialization_id::text, jsonb_build_object('member_uid', p_uid));
end;
$$;

revoke execute on function public.admin_set_member_business_path_specialization(uuid, uuid, uuid) from public, anon;
grant execute on function public.admin_set_member_business_path_specialization(uuid, uuid, uuid) to authenticated;

-- ---------- admin progression triage view ----------
-- Mirrors get_admin_progression_overview (0044's final body -- the one with
-- todayTasksTotal/todayTasksDone; participationPath; level terminology).
-- Drops milestone/promotion-derived fields per the plan -- in practice the
-- live 0044 body already carried none (those only ever existed as a
-- placeholder stub in get_network_overview, never here), so there's nothing
-- to actually strip; this note is here so that's not mistaken for an
-- oversight. overdueCount/pendingReviewCount are repointed to Business-Path-
-- only sources (business_path_placements, business_path_evidence_submissions)
-- since individual-task overdue/review tracking has its own home in
-- MemberDetail.jsx's Activities panel and stays out of this view.
create or replace function public.get_admin_business_path_overview()
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
      'uid', p.id,
      'displayName', p.display_name,
      'photoUrl', p.photo_url,
      'participationPath', p.participation_path,
      'level', case when l.id is null then null else jsonb_build_object('id', l.id, 'label', l.label) end,
      'levelProgressPercent', public.compute_business_path_level_progress(p.id, l.id),
      'stage', case when s.id is null then null else jsonb_build_object('id', s.id, 'title', s.title) end,
      'trackProgress', (
        select coalesce(jsonb_object_agg(t.key, public.compute_business_path_track_progress(p.id, s.id, t.id)), '{}'::jsonb)
        from public.business_path_stage_tracks st
        join public.business_path_tracks t on t.id = st.track_id
        where st.stage_id = s.id
          and (p.participation_path = 'full' or t.key not in ('skill', 'freelancing'))
      ),
      'overdueCount', (
        select count(*) from public.business_path_placements bp
        join public.business_path_tracks tr on tr.id = bp.track_id
        where bp.is_required = true and bp.due_date is not null and bp.due_date < now()
          and bp.stage_id = s.id
          and (p.participation_path = 'full' or tr.key not in ('skill', 'freelancing'))
          and (bp.specialization_id is null or public.is_business_path_specialization_unlocked(p.id, bp.specialization_id))
          and not public.is_business_path_placement_done(bp.id, p.id)
      ),
      'pendingReviewCount',
        (select count(*) from public.assignment_submissions where uid = p.id and status = 'submitted')
        + (select count(*) from public.business_path_evidence_submissions where uid = p.id and status = 'submitted'),
      'sponsoredCount', (select count(*) from public.sponsor_relationships where sponsor_uid = p.id and active = true),
      'todayTasksTotal', (select count(*) from public.daily_task_selections where uid = p.id and task_date = current_date),
      'todayTasksDone', (
        select count(*) from public.daily_task_selections dts
        where dts.uid = p.id and dts.task_date = current_date
          and (
            (dts.content_assignment_id is not null and public.is_content_assignment_done(dts.content_assignment_id, p.id))
            or (dts.business_path_placement_id is not null and public.is_business_path_placement_done(dts.business_path_placement_id, p.id))
          )
      )
    ) order by p.display_name)
    from public.profiles p
    left join public.member_business_path_stage mbs on mbs.uid = p.id
    left join public.business_path_stages s on s.id = mbs.current_stage_id
    left join public.business_path_levels l on l.id = s.path_level_id
    where p.role = 'member' and p.status = 'active'
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.get_admin_business_path_overview() from public, anon;
grant execute on function public.get_admin_business_path_overview() to authenticated;

-- ---------- self-attested completion (bare content only) ----------
-- Mirrors complete_content_assignment (0033's requires_admin_approval-
-- enforcing version) -- minus the perform check_member_milestones(...) call
-- at the end, since milestones don't exist in Business Path at all (this
-- is a brand-new function, not an edit, so there's no dead call to strip).
create or replace function public.complete_business_path_placement(p_placement_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_content_type text;
  v_requires_approval boolean;
begin
  if not public.is_active() then
    raise exception 'your account is suspended and can''t complete tasks';
  end if;

  select ci.content_type, bp.requires_admin_approval into v_content_type, v_requires_approval
    from public.business_path_placements bp
    join public.content_items ci on ci.id = bp.content_item_id
    where bp.id = p_placement_id;

  if v_content_type is null then
    raise exception 'placement not found';
  end if;
  if v_content_type <> 'bare' then
    raise exception 'this task completes automatically once its linked training/assignment is done';
  end if;
  if coalesce(v_requires_approval, false) then
    raise exception 'this task needs submitted evidence -- use submit_business_path_evidence instead';
  end if;

  if not public.business_path_placement_unlocked(p_placement_id, auth.uid()) then
    raise exception 'complete the prerequisite tasks first';
  end if;

  insert into public.member_business_path_progress (uid, business_path_placement_id, completed_at)
  values (auth.uid(), p_placement_id, now())
  on conflict (uid, business_path_placement_id) do nothing;

  insert into public.activity_log (actor_uid, action, target_type, target_id)
  values (auth.uid(), 'business_path_placement_completed', 'business_path_placement', p_placement_id::text);
end;
$$;

revoke execute on function public.complete_business_path_placement(uuid) from public, anon;
grant execute on function public.complete_business_path_placement(uuid) to authenticated;

-- ---------- member: submit evidence for a placement that requires admin approval ----------
-- Mirrors submit_content_evidence (0033).
create or replace function public.submit_business_path_evidence(p_placement_id uuid, p_text_response text, p_file_urls text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_content_type text;
  v_requires_approval boolean;
  v_uid uuid := auth.uid();
  v_admin record;
  v_display_name text;
  v_title text;
begin
  if not public.is_active() then
    raise exception 'your account is suspended and can''t submit evidence';
  end if;

  select ci.content_type, bp.requires_admin_approval, coalesce(ci.title, c.title, a.title)
    into v_content_type, v_requires_approval, v_title
    from public.business_path_placements bp
    join public.content_items ci on ci.id = bp.content_item_id
    left join public.courses c on c.id = ci.course_id
    left join public.assignments a on a.id = ci.assignment_id
    where bp.id = p_placement_id;

  if v_content_type is null then
    raise exception 'placement not found';
  end if;
  if v_content_type <> 'bare' or not coalesce(v_requires_approval, false) then
    raise exception 'this task doesn''t need submitted evidence -- use complete_business_path_placement instead';
  end if;
  if not public.business_path_placement_unlocked(p_placement_id, v_uid) then
    raise exception 'complete the prerequisite tasks first';
  end if;

  insert into public.business_path_evidence_submissions (business_path_placement_id, uid, text_response, file_urls, status, submitted_at)
  values (p_placement_id, v_uid, coalesce(p_text_response, ''), coalesce(p_file_urls, '{}'), 'submitted', now())
  on conflict (business_path_placement_id, uid) do update
    set text_response = excluded.text_response, file_urls = excluded.file_urls,
        status = 'submitted', feedback = '', reviewed_by = null, reviewed_at = null, submitted_at = now();

  select display_name into v_display_name from public.profiles where id = v_uid;

  for v_admin in select id from public.profiles where role = 'admin' loop
    insert into public.notifications (uid, type, title, body, link_to)
    values (
      v_admin.id, 'business_path_evidence_submitted', 'Evidence submitted for review',
      coalesce(nullif(v_display_name, ''), 'A member') || ' submitted evidence for: ' || coalesce(v_title, 'a task'),
      '/admin/reviews'
    );
  end loop;

  insert into public.activity_log (actor_uid, action, target_type, target_id)
  values (v_uid, 'business_path_evidence_submitted', 'business_path_placement', p_placement_id::text);
end;
$$;

revoke execute on function public.submit_business_path_evidence(uuid, text, text[]) from public, anon;
grant execute on function public.submit_business_path_evidence(uuid, text, text[]) to authenticated;

-- ---------- admin: approve/reject submitted evidence ----------
-- Mirrors review_content_evidence (0033) -- minus the perform
-- check_member_milestones(...) call, same reasoning as complete_business_path_placement.
create or replace function public.review_business_path_evidence(p_submission_id uuid, p_decision text, p_feedback text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_placement_id uuid;
  v_status text;
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;
  if p_decision not in ('approved', 'needs_revision') then
    raise exception 'invalid decision: %', p_decision;
  end if;

  select uid, business_path_placement_id, status into v_uid, v_placement_id, v_status
    from public.business_path_evidence_submissions where id = p_submission_id;
  if v_uid is null then
    raise exception 'submission not found';
  end if;
  if v_status <> 'submitted' then
    raise exception 'this submission has already been reviewed';
  end if;

  update public.business_path_evidence_submissions
    set status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(), feedback = coalesce(p_feedback, '')
    where id = p_submission_id;

  if p_decision = 'approved' then
    -- the same member_business_path_progress row complete_business_path_placement
    -- would have written -- is_business_path_placement_done()'s 'bare' branch
    -- already reads this table.
    insert into public.member_business_path_progress (uid, business_path_placement_id, completed_at)
    values (v_uid, v_placement_id, now())
    on conflict (uid, business_path_placement_id) do nothing;
  end if;

  insert into public.notifications (uid, type, title, body, link_to)
  values (
    v_uid, 'business_path_evidence_reviewed',
    case when p_decision = 'approved' then 'Evidence approved' else 'Needs another look' end,
    coalesce(nullif(p_feedback, ''), case when p_decision = 'approved' then 'Your submission was approved.' else 'An admin asked for a revision.' end),
    '/tasks'
  );

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'business_path_evidence_reviewed', 'business_path_evidence_submission', p_submission_id::text, jsonb_build_object('decision', p_decision));
end;
$$;

revoke execute on function public.review_business_path_evidence(uuid, text, text) from public, anon;
grant execute on function public.review_business_path_evidence(uuid, text, text) to authenticated;

-- ---------- member-facing: current-stage Business Path placements, with status ----------
-- Mirrors the stage_track branch of get_my_content_assignments (0043's
-- final body) -- always scoped to the member's current stage (business_path_
-- placements has no individual scope to also union in).
create or replace function public.get_my_business_path_placements(p_uid uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_stage_id uuid;
  v_path text;
begin
  if p_uid <> auth.uid() and coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied';
  end if;

  select current_stage_id into v_stage_id from public.member_business_path_stage where uid = p_uid;
  select coalesce(participation_path, 'full') into v_path from public.profiles where id = p_uid;

  if v_stage_id is null then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', bp.id,
      'title', coalesce(ci.title, c.title, a.title),
      'description', coalesce(ci.description, c.description, a.instructions, ''),
      'taskType', bp.task_type,
      'xpReward', bp.xp_reward,
      'isRequired', bp.is_required,
      'dueDate', bp.due_date,
      'contentType', ci.content_type,
      'requiresAdminApproval', bp.requires_admin_approval,
      'evidenceStatus', (
        select bes.status from public.business_path_evidence_submissions bes
        where bes.business_path_placement_id = bp.id and bes.uid = p_uid
      ),
      'isDone', public.is_business_path_placement_done(bp.id, p_uid)
    ) order by bp.due_date nulls last, bp.order_index)
    from public.business_path_placements bp
    join public.content_items ci on ci.id = bp.content_item_id
    left join public.courses c on c.id = ci.course_id
    left join public.assignments a on a.id = ci.assignment_id
    join public.business_path_tracks tr on tr.id = bp.track_id
    where bp.stage_id = v_stage_id
      and (v_path = 'full' or tr.key not in ('skill', 'freelancing'))
      and (bp.specialization_id is null or public.is_business_path_specialization_unlocked(p_uid, bp.specialization_id))
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.get_my_business_path_placements(uuid) from public, anon;
grant execute on function public.get_my_business_path_placements(uuid) to authenticated;
