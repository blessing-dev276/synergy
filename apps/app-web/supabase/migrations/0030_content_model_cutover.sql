-- Content/Journey model refactor, part 4 of 5: cutover. Deployed only after
-- 0029's data migration is verified (row-count/mapping checks run manually
-- against the live DB, see the plan doc -- confirmed clean before this
-- file was written). Repoints every function that read `tasks` at its
-- content_assignments-based _v2 body under the SAME final name clients
-- already call, so no frontend change is required for this step alone.
-- CREATE OR REPLACE preserves the existing grants from 0009/0019/0026 --
-- no new revoke/grant statements needed here.

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
  v_specialization_id uuid;
begin
  if not public.can_view_journey(p_uid) then
    raise exception 'permission denied';
  end if;

  select specialization_id into v_specialization_id
    from public.member_track_specializations
    where uid = p_uid and track_id = p_track_id;

  select count(*) into v_total from public.content_assignments
    where scope = 'stage_track' and stage_id = p_stage_id and track_id = p_track_id and is_required = true
      and (specialization_id is null or specialization_id = v_specialization_id);

  if v_total = 0 then
    return 0;
  end if;

  for v_ca in
    select id from public.content_assignments
      where scope = 'stage_track' and stage_id = p_stage_id and track_id = p_track_id and is_required = true
        and (specialization_id is null or specialization_id = v_specialization_id)
  loop
    if public.is_content_assignment_done(v_ca.id, p_uid) then
      v_done := v_done + 1;
    end if;
  end loop;

  return round((v_done::numeric / v_total) * 100);
end;
$$;

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
    return jsonb_build_object('stage', null, 'tracks', '[]'::jsonb);
  end if;

  select id, key, title, description, order_index into v_stage from public.stages where id = v_stage_id;

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
          jsonb_build_object('id', ts.id, 'key', ts.key, 'label', ts.label, 'icon', ts.icon)
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

  return jsonb_build_object(
    'stage', jsonb_build_object('id', v_stage.id, 'key', v_stage.key, 'title', v_stage.title, 'description', v_stage.description),
    'tracks', v_tracks
  );
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
    if v_ca.specialization_id is not null and not exists (
      select 1 from public.member_track_specializations mts
      where mts.uid = p_uid and mts.track_id = v_ca.track_id and mts.specialization_id = v_ca.specialization_id
    ) then
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
        select count(*)
        from public.content_assignments ca
        join public.content_items ci on ci.id = ca.content_item_id
        where ca.is_required = true and ca.due_date is not null and ca.due_date < now()
          and (
            (ca.scope = 'individual' and ca.assigned_to_uid = p.id)
            or (ca.scope = 'stage_track' and ca.stage_id = mj.current_stage_id)
          )
          and not public.is_content_assignment_done(ca.id, p.id)
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
        select 1
        from public.content_assignments ca
        join public.content_items ci on ci.id = ca.content_item_id
        where ca.is_required = true and ca.due_date is not null and ca.due_date < now()
          and (
            (ca.scope = 'individual' and ca.assigned_to_uid = p.id)
            or (ca.scope = 'stage_track' and ca.stage_id = mj.current_stage_id)
          )
          and not public.is_content_assignment_done(ca.id, p.id)
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
    with weekly_assignments as (
      select ca.assigned_to_uid as uid, ca.id
      from public.content_assignments ca
      where ca.scope = 'individual' and ca.is_required = true
        and ca.due_date >= p_week_start and ca.due_date < v_week_end
      union all
      select mj.uid, ca.id
      from public.content_assignments ca
      join public.member_journey mj on mj.current_stage_id = ca.stage_id
      where ca.scope = 'stage_track' and ca.is_required = true
        and ca.due_date >= p_week_start and ca.due_date < v_week_end
    ),
    scored as (
      select uid,
        count(*) as tasks_total,
        count(*) filter (where public.is_content_assignment_done(id, uid)) as tasks_done
      from weekly_assignments
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

-- ---------- retire the temporary _v2 stand-ins ----------
drop function if exists public.compute_track_progress_v2(uuid, uuid, uuid);
drop function if exists public.get_journey_overview_v2(uuid);
drop function if exists public.get_next_best_action_v2(uuid);
drop function if exists public.get_personally_sponsored_v2(uuid);
drop function if exists public.get_network_overview_v2(uuid);
drop function if exists public.compute_task_leaderboard_v2(timestamptz);
