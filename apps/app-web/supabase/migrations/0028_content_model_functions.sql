-- Content/Journey model refactor, part 2 of 5 (RPCs). Builds on 0027's
-- schema. New RPCs ship under their final names. Functions that read
-- `tasks` today (compute_track_progress, get_journey_overview,
-- get_next_best_action, get_personally_sponsored, get_network_overview,
-- compute_task_leaderboard) are rewritten under temporary `_v2` suffixes,
-- deployed ALONGSIDE the untouched originals, so they're parity-testable
-- against real data before 0030 repoints the real names at them.

-- ---------- auto-create content_items for new courses/assignments ----------
-- Keeps ContentBuilder.jsx/CourseEditor.jsx's existing authoring flow
-- completely untouched -- no manual "wrap as content" step.
create or replace function public.auto_create_content_item_for_course()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.content_items (content_type, course_id, created_by, created_at)
  values ('course', new.id, new.created_by, now())
  on conflict (course_id) where course_id is not null do nothing;
  return new;
end;
$$;

revoke execute on function public.auto_create_content_item_for_course() from public, anon, authenticated;

create trigger on_course_created_content_item
  after insert on public.courses
  for each row execute function public.auto_create_content_item_for_course();

create or replace function public.auto_create_content_item_for_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- assignments has no created_by column (0001) -- content_items.created_by stays null for these.
  insert into public.content_items (content_type, assignment_id, created_by, created_at)
  values ('assignment', new.id, null, now())
  on conflict (assignment_id) where assignment_id is not null do nothing;
  return new;
end;
$$;

revoke execute on function public.auto_create_content_item_for_assignment() from public, anon, authenticated;

create trigger on_assignment_created_content_item
  after insert on public.assignments
  for each row execute function public.auto_create_content_item_for_assignment();

-- ---------- is a content assignment "done" for a given member? ----------
-- Replaces is_task_done -- same polymorphic dispatch, keyed by the stable
-- content_assignment id instead of a per-member duplicated task row.
create or replace function public.is_content_assignment_done(p_content_assignment_id uuid, p_uid uuid)
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
    from public.content_assignments ca
    join public.content_items ci on ci.id = ca.content_item_id
    where ca.id = p_content_assignment_id;

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
    select 1 from public.member_progress
    where uid = p_uid and content_assignment_id = p_content_assignment_id
  );
end;
$$;

revoke execute on function public.is_content_assignment_done(uuid, uuid) from public, anon;
grant execute on function public.is_content_assignment_done(uuid, uuid) to authenticated;

-- ---------- is a content assignment unlocked (all its dependencies done)? ----------
create or replace function public.content_assignment_unlocked(p_content_assignment_id uuid, p_uid uuid)
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
    select 1 from public.content_assignment_dependencies d
    where d.content_assignment_id = p_content_assignment_id
      and not public.is_content_assignment_done(d.depends_on_content_assignment_id, p_uid)
  ) into v_blocked;
  return not v_blocked;
end;
$$;

revoke execute on function public.content_assignment_unlocked(uuid, uuid) from public, anon;
grant execute on function public.content_assignment_unlocked(uuid, uuid) to authenticated;

-- ---------- self-attested completion (bare content only) ----------
create or replace function public.complete_content_assignment(p_content_assignment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_content_type text;
begin
  if not public.is_active() then
    raise exception 'your account is suspended and can''t complete tasks';
  end if;

  select ci.content_type into v_content_type
    from public.content_assignments ca
    join public.content_items ci on ci.id = ca.content_item_id
    where ca.id = p_content_assignment_id;

  if v_content_type is null then
    raise exception 'content assignment not found';
  end if;
  if v_content_type <> 'bare' then
    raise exception 'this task completes automatically once its linked training/assignment is done';
  end if;

  if not public.content_assignment_unlocked(p_content_assignment_id, auth.uid()) then
    raise exception 'complete the prerequisite tasks first';
  end if;

  insert into public.member_progress (uid, content_assignment_id, completed_at)
  values (auth.uid(), p_content_assignment_id, now())
  on conflict (uid, content_assignment_id) do nothing;

  insert into public.activity_log (actor_uid, action, target_type, target_id)
  values (auth.uid(), 'content_assignment_completed', 'content_assignment', p_content_assignment_id::text);
end;
$$;

revoke execute on function public.complete_content_assignment(uuid) from public, anon;
grant execute on function public.complete_content_assignment(uuid) to authenticated;

-- ---------- member-facing: current-stage + individual placements, with status ----------
-- Powers TaskList.jsx/Dashboard.jsx, replacing their direct `tasks` table
-- queries. Stage_track placements are scoped to the member's CURRENT stage
-- only (matches get_next_best_action's existing philosophy); individual
-- placements are never stage-gated -- ad-hoc notes should always show.
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
        and (
          ca.specialization_id is null
          or ca.specialization_id = (
            select specialization_id from public.member_track_specializations
            where uid = p_uid and track_id = ca.track_id
          )
        )
      )
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.get_my_content_assignments(uuid) from public, anon;
grant execute on function public.get_my_content_assignments(uuid) to authenticated;

-- ---------- admin: search reusable content when placing it (Journey/MemberDetail pickers) ----------
create or replace function public.search_content_items(p_query text)
returns table (id uuid, content_type text, label text)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;

  return query
    select ci.id, ci.content_type, coalesce(ci.title, c.title, a.title) as label
    from public.content_items ci
    left join public.courses c on c.id = ci.course_id
    left join public.assignments a on a.id = ci.assignment_id
    where length(trim(coalesce(p_query, ''))) >= 1
      and position(lower(trim(p_query)) in lower(coalesce(ci.title, c.title, a.title, ''))) > 0
    order by coalesce(ci.title, c.title, a.title)
    limit 30;
end;
$$;

revoke execute on function public.search_content_items(text) from public, anon;
grant execute on function public.search_content_items(text) to authenticated;

-- ================= _v2: rewrites of every function that reads `tasks` today =================
-- Deployed alongside the untouched originals for parity testing (see 0029's
-- verification queries). 0030 repoints the real names at these bodies.

create or replace function public.compute_track_progress_v2(p_uid uuid, p_stage_id uuid, p_track_id uuid)
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

create or replace function public.get_journey_overview_v2(p_uid uuid)
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
      'progressPercent', public.compute_track_progress_v2(p_uid, v_stage_id, t.id),
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

create or replace function public.get_next_best_action_v2(p_uid uuid)
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

-- ---------- sponsor/network dashboard (0019): overdueTaskCount rewritten ----------
create or replace function public.get_personally_sponsored_v2(p_uid uuid)
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

create or replace function public.get_network_overview_v2(p_uid uuid)
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

-- ---------- weekly leaderboard (0026): tasks category rewritten ----------
-- Stage_track placements now correctly apply to whoever currently sits in
-- that stage (via member_journey), not a single fanned-out assigned_to_uid
-- row -- fixes a real accuracy gap in the old version (a member who moved
-- stages kept being scored against stale placements from a stage they'd
-- already left).
create or replace function public.compute_task_leaderboard_v2(p_week_start timestamptz)
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
