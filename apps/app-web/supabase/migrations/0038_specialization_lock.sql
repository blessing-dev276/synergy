-- Product decision: a member only has access to the ONE skill specialization
-- they choose (within the 'skill' track), locked in permanently once picked
-- (self-service can't switch it -- admin can, via the new override RPC
-- below). Graphics Design is the compulsory newbie-stage skill: every
-- member sees/can progress its content while their current stage's rank is
-- 'newbie' (0032/0037), regardless of what they've chosen -- same as
-- untagged content already works today, just conditional on rank instead of
-- unconditional. The other specializations (gohighlevel_crm, flutterflow)
-- stay locked until chosen.
--
-- is_specialization_unlocked centralizes this so every place that already
-- filters content_assignments by specialization_id (compute_track_progress,
-- compute_rank_progress, get_next_best_action, get_my_content_assignments,
-- get_admin_progression_overview, check_member_milestones) can delegate to
-- one definition of "unlocked" instead of re-deriving it six times, mirroring
-- how is_task_done/task_unlocked/can_view_journey are already shared helpers.

create or replace function public.is_specialization_unlocked(p_uid uuid, p_specialization_id uuid)
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
  v_rank_key text;
begin
  if p_specialization_id is null then
    return true;
  end if;

  select track_id, key into v_track_id, v_key
    from public.track_specializations where id = p_specialization_id;

  select specialization_id into v_chosen_id
    from public.member_track_specializations
    where uid = p_uid and track_id = v_track_id;

  if v_chosen_id = p_specialization_id then
    return true;
  end if;

  if v_key = 'graphics_design' then
    select r.key into v_rank_key
      from public.member_journey mj
      join public.stages s on s.id = mj.current_stage_id
      join public.ranks r on r.id = s.rank_id
      where mj.uid = p_uid;

    if v_rank_key = 'newbie' then
      return true;
    end if;
  end if;

  return false;
end;
$$;

revoke execute on function public.is_specialization_unlocked(uuid, uuid) from public, anon;
grant execute on function public.is_specialization_unlocked(uuid, uuid) to authenticated;

-- ================= set_member_specialization: one-time self-select =================

create or replace function public.set_member_specialization(p_track_id uuid, p_specialization_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_track_id uuid;
begin
  if exists (
    select 1 from public.member_track_specializations
    where uid = auth.uid() and track_id = p_track_id
  ) then
    raise exception 'you''ve already chosen a skill for this track -- ask an admin to change it';
  end if;

  select track_id into v_track_id from public.track_specializations
    where id = p_specialization_id and published = true;
  if v_track_id is null or v_track_id <> p_track_id then
    raise exception 'invalid specialization for this track';
  end if;

  insert into public.member_track_specializations (uid, track_id, specialization_id, selected_at)
  values (auth.uid(), p_track_id, p_specialization_id, now());

  insert into public.activity_log (actor_uid, action, target_type, target_id)
  values (auth.uid(), 'specialization_selected', 'track_specialization', p_specialization_id::text);
end;
$$;

-- ================= admin_set_member_specialization: admin override =================
-- Mirrors set_member_official_rank's admin-only shape (0035): the only way
-- a member's locked-in specialization changes after the fact.

create or replace function public.admin_set_member_specialization(p_uid uuid, p_track_id uuid, p_specialization_id uuid)
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

  select track_id into v_track_id from public.track_specializations
    where id = p_specialization_id and published = true;
  if v_track_id is null or v_track_id <> p_track_id then
    raise exception 'invalid specialization for this track';
  end if;

  insert into public.member_track_specializations (uid, track_id, specialization_id, selected_at)
  values (p_uid, p_track_id, p_specialization_id, now())
  on conflict (uid, track_id) do update set specialization_id = excluded.specialization_id, selected_at = now();

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'specialization_reassigned', 'track_specialization', p_specialization_id::text, jsonb_build_object('member_uid', p_uid));
end;
$$;

revoke execute on function public.admin_set_member_specialization(uuid, uuid, uuid) from public, anon;
grant execute on function public.admin_set_member_specialization(uuid, uuid, uuid) to authenticated;

-- ================= repoint every specialization filter at the shared gate =================

create or replace function public.compute_track_progress(p_uid uuid, p_stage_id uuid, p_track_id uuid)
returns int
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_total int;
  v_done int := 0;
  v_ca record;
begin
  if not public.can_view_journey(p_uid) then
    raise exception 'permission denied';
  end if;

  select count(*) into v_total from public.content_assignments
    where scope = 'stage_track' and stage_id = p_stage_id and track_id = p_track_id and is_required = true
      and (specialization_id is null or public.is_specialization_unlocked(p_uid, specialization_id));

  if v_total = 0 then
    return 0;
  end if;

  for v_ca in
    select id from public.content_assignments
      where scope = 'stage_track' and stage_id = p_stage_id and track_id = p_track_id and is_required = true
        and (specialization_id is null or public.is_specialization_unlocked(p_uid, specialization_id))
  loop
    if public.is_content_assignment_done(v_ca.id, p_uid) then
      v_done := v_done + 1;
    end if;
  end loop;

  return round((v_done::numeric / v_total) * 100);
end;
$$;

-- Note: parameter kept as p_level_id (not renamed to p_rank_id) because
-- Postgres's CREATE OR REPLACE FUNCTION disallows renaming an existing
-- function's input parameters -- this is a rename of stages.level_id to
-- stages.rank_id (0037), not of this function's own signature.
create or replace function public.compute_rank_progress(p_uid uuid, p_level_id uuid)
returns int
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_total int;
  v_done int;
begin
  with rank_reqs as (
    select ca.id, ca.track_id
    from public.content_assignments ca
    join public.stages s on s.id = ca.stage_id
    where s.rank_id = p_level_id and ca.scope = 'stage_track' and ca.is_required = true
      and (
        ca.specialization_id is null
        or public.is_specialization_unlocked(p_uid, ca.specialization_id)
      )
  )
  select count(*), count(*) filter (where public.is_content_assignment_done(id, p_uid))
    into v_total, v_done
  from rank_reqs;

  if v_total = 0 then
    return 0;
  end if;
  return round((v_done::numeric / v_total) * 100);
end;
$$;

create or replace function public.get_next_best_action(p_uid uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stage_id uuid;
  v_ca record;
begin
  if not public.can_view_journey(p_uid) then
    raise exception 'permission denied';
  end if;

  select current_stage_id into v_stage_id from public.member_journey where uid = p_uid;
  if v_stage_id is null then
    return null;
  end if;

  for v_ca in
    select ca.id, coalesce(ci.title, c.title, a.title) as title,
           coalesce(ci.description, c.description, a.instructions, '') as description,
           ca.due_date, ca.order_index, ca.specialization_id,
           tr.id as track_id, tr.key as track_key, tr.label as track_label, tr.icon as track_icon
      from public.content_assignments ca
      join public.content_items ci on ci.id = ca.content_item_id
      left join public.courses c on c.id = ci.course_id
      left join public.assignments a on a.id = ci.assignment_id
      join public.tracks tr on tr.id = ca.track_id
      where ca.scope = 'stage_track' and ca.stage_id = v_stage_id and ca.is_required = true
      order by ca.due_date nulls last, ca.order_index
  loop
    if v_ca.specialization_id is not null and not public.is_specialization_unlocked(p_uid, v_ca.specialization_id) then
      continue;
    end if;

    if not public.is_content_assignment_done(v_ca.id, p_uid) and public.content_assignment_unlocked(v_ca.id, p_uid) then
      return jsonb_build_object(
        'taskId', v_ca.id,
        'title', v_ca.title,
        'description', v_ca.description,
        'dueDate', v_ca.due_date,
        'trackKey', v_ca.track_key,
        'trackLabel', v_ca.track_label,
        'trackIcon', v_ca.track_icon
      );
    end if;
  end loop;

  return null;
end;
$$;

create or replace function public.get_my_content_assignments(p_uid uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_stage_id uuid;
begin
  if p_uid <> auth.uid() and coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied';
  end if;

  select current_stage_id into v_stage_id from public.member_journey where uid = p_uid;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', ca.id,
      'title', coalesce(ci.title, c.title, a.title),
      'description', coalesce(ci.description, c.description, a.instructions, ''),
      'taskType', ca.task_type,
      'xpReward', ca.xp_reward,
      'isRequired', ca.is_required,
      'dueDate', ca.due_date,
      'scope', ca.scope,
      'contentType', ci.content_type,
      'isDone', public.is_content_assignment_done(ca.id, p_uid)
    ) order by ca.due_date nulls last, ca.order_index)
    from public.content_assignments ca
    join public.content_items ci on ci.id = ca.content_item_id
    left join public.courses c on c.id = ci.course_id
    left join public.assignments a on a.id = ci.assignment_id
    where
      (ca.scope = 'individual' and ca.assigned_to_uid = p_uid)
      or (
        ca.scope = 'stage_track' and ca.stage_id = v_stage_id
        and (ca.specialization_id is null or public.is_specialization_unlocked(p_uid, ca.specialization_id))
      )
  ), '[]'::jsonb);
end;
$$;

create or replace function public.get_admin_progression_overview()
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
      'rank', case when r.id is null then null else jsonb_build_object('id', r.id, 'label', r.label) end,
      'rankProgressPercent', public.compute_rank_progress(p.id, r.id),
      'stage', case when s.id is null then null else jsonb_build_object('id', s.id, 'title', s.title) end,
      'trackProgress', (
        select coalesce(jsonb_object_agg(t.key, public.compute_track_progress(p.id, s.id, t.id)), '{}'::jsonb)
        from public.stage_tracks st
        join public.tracks t on t.id = st.track_id
        where st.stage_id = s.id
      ),
      'overdueCount', (
        select count(*) from public.content_assignments ca
        where ca.is_required = true and ca.due_date is not null and ca.due_date < now()
          and not public.is_content_assignment_done(ca.id, p.id)
          and (
            (ca.scope = 'individual' and ca.assigned_to_uid = p.id)
            or (
              ca.scope = 'stage_track' and ca.stage_id = s.id
              and (ca.specialization_id is null or public.is_specialization_unlocked(p.id, ca.specialization_id))
            )
          )
      ),
      'pendingReviewCount',
        (select count(*) from public.assignment_submissions where uid = p.id and status = 'submitted')
        + (select count(*) from public.content_evidence_submissions where uid = p.id and status = 'submitted'),
      'sponsoredCount', (select count(*) from public.sponsor_relationships where sponsor_uid = p.id and active = true)
    ) order by p.display_name)
    from public.profiles p
    left join public.member_journey mj on mj.uid = p.id
    left join public.stages s on s.id = mj.current_stage_id
    left join public.ranks r on r.id = s.rank_id
    where p.role = 'member' and p.status = 'active'
  ), '[]'::jsonb);
end;
$$;

create or replace function public.check_member_milestones(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m record;
  v_earned boolean;
begin
  for v_m in
    select * from public.milestones
    where published = true
      and trigger_type in ('content_assignment_completed', 'stage_completed', 'rank_completed')
      and not exists (select 1 from public.member_milestones mm where mm.uid = p_uid and mm.milestone_id = milestones.id)
  loop
    v_earned := false;

    if v_m.trigger_type = 'content_assignment_completed' then
      v_earned := v_m.trigger_ref_id is not null and public.is_content_assignment_done(v_m.trigger_ref_id, p_uid);

    elsif v_m.trigger_type = 'stage_completed' then
      v_earned := v_m.trigger_ref_id is not null
        and exists (
          select 1 from public.content_assignments ca2
          where ca2.stage_id = v_m.trigger_ref_id and ca2.scope = 'stage_track' and ca2.is_required = true
        )
        and not exists (
          select 1 from public.content_assignments ca
          where ca.stage_id = v_m.trigger_ref_id and ca.scope = 'stage_track' and ca.is_required = true
            and (ca.specialization_id is null or public.is_specialization_unlocked(p_uid, ca.specialization_id))
            and not public.is_content_assignment_done(ca.id, p_uid)
        );

    elsif v_m.trigger_type = 'rank_completed' then
      v_earned := v_m.trigger_ref_id is not null and public.compute_rank_progress(p_uid, v_m.trigger_ref_id) >= 100;
    end if;

    if v_earned then
      insert into public.member_milestones (uid, milestone_id, achieved_at)
      values (p_uid, v_m.id, now())
      on conflict (uid, milestone_id) do nothing;

      insert into public.notifications (uid, type, title, body, link_to)
      values (p_uid, 'milestone_achieved', 'Milestone achieved: ' || v_m.title, coalesce(nullif(v_m.description, ''), 'Nice work.'), '/dashboard');

      insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
      values (p_uid, 'milestone_achieved', 'milestone', v_m.id::text, jsonb_build_object('key', v_m.key));
    end if;
  end loop;
end;
$$;

-- get_journey_overview: adds 'locked' (content-access) alongside each
-- specialization so the UI can grey out/lock-icon the ones the member can't
-- open, without needing a second round trip.
create or replace function public.get_journey_overview(p_uid uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stage_id uuid;
  v_stage record;
  v_tracks jsonb;
  v_rank_id uuid;
  v_rank record;
  v_next_rank_id uuid;
  v_next_rank_key text;
  v_next_rank_label text;
  v_rank_percent int;
begin
  if not public.can_view_journey(p_uid) then
    raise exception 'permission denied';
  end if;

  select current_stage_id into v_stage_id from public.member_journey where uid = p_uid;

  if v_stage_id is null and p_uid = auth.uid() then
    select id into v_stage_id from public.stages where published = true order by order_index limit 1;
    if v_stage_id is not null then
      insert into public.member_journey (uid, current_stage_id, started_at, updated_at)
      values (p_uid, v_stage_id, now(), now())
      on conflict (uid) do nothing;
    end if;
  end if;

  if v_stage_id is null then
    return jsonb_build_object('stage', null, 'tracks', '[]'::jsonb, 'rank', null, 'rankProgressPercent', 0, 'nextRank', null);
  end if;

  select id, key, title, description, order_index, rank_id into v_stage from public.stages where id = v_stage_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'trackId', t.id,
      'key', t.key,
      'label', t.label,
      'icon', t.icon,
      'colorToken', t.color_token,
      'progressPercent', public.compute_track_progress(p_uid, v_stage_id, t.id),
      'specializations', (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'id', ts.id, 'key', ts.key, 'label', ts.label, 'icon', ts.icon,
            'locked', not public.is_specialization_unlocked(p_uid, ts.id)
          )
          order by ts.order_index
        ), '[]'::jsonb)
        from public.track_specializations ts
        where ts.track_id = t.id and ts.published = true
      ),
      'selectedSpecializationId', (
        select mts.specialization_id from public.member_track_specializations mts
        where mts.uid = p_uid and mts.track_id = t.id
      )
    ) order by t.key
  ), '[]'::jsonb) into v_tracks
  from public.stage_tracks st
  join public.tracks t on t.id = st.track_id
  where st.stage_id = v_stage_id;

  v_rank_id := v_stage.rank_id;

  if v_rank_id is null then
    return jsonb_build_object(
      'stage', jsonb_build_object('id', v_stage.id, 'key', v_stage.key, 'title', v_stage.title, 'description', v_stage.description),
      'tracks', v_tracks,
      'rank', null,
      'rankProgressPercent', 0,
      'nextRank', null
    );
  end if;

  select id, key, label, purpose, outcome, order_index into v_rank from public.ranks where id = v_rank_id;
  v_rank_percent := public.compute_rank_progress(p_uid, v_rank_id);

  select id, key, label into v_next_rank_id, v_next_rank_key, v_next_rank_label
    from public.ranks where order_index > v_rank.order_index order by order_index limit 1;

  return jsonb_build_object(
    'stage', jsonb_build_object('id', v_stage.id, 'key', v_stage.key, 'title', v_stage.title, 'description', v_stage.description),
    'tracks', v_tracks,
    'rank', jsonb_build_object('id', v_rank.id, 'key', v_rank.key, 'label', v_rank.label, 'purpose', v_rank.purpose, 'outcome', v_rank.outcome, 'orderIndex', v_rank.order_index),
    'rankProgressPercent', v_rank_percent,
    'nextRank', case when v_next_rank_id is null then null else jsonb_build_object('id', v_next_rank_id, 'key', v_next_rank_key, 'label', v_next_rank_label) end
  );
end;
$$;
