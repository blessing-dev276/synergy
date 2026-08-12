-- Journey engine RPCs: dependency-aware task completion, per-track progress,
-- and the "Next Best Action" the member dashboard leads with. Builds on the
-- stage/track schema in 0008 and reuses existing completion signals
-- (lesson/enrollment completion, assignment approval, task_completions)
-- rather than introducing a parallel bookkeeping system.

-- ---------- is a task "done" for a given member? ----------
-- A task's completion source depends on what it's linked to:
--   - linked to a course  -> done when that course's enrollment is completed
--   - linked to an assignment -> done when that submission is approved
--   - otherwise -> self-attested via task_completions (set by complete_task)
create or replace function public.is_task_done(p_task_id uuid, p_uid uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_course_id uuid;
  v_assignment_id uuid;
begin
  select linked_course_id, linked_assignment_id into v_course_id, v_assignment_id
    from public.tasks where id = p_task_id;

  if v_course_id is not null then
    return exists (
      select 1 from public.enrollments
      where uid = p_uid and course_id = v_course_id and status = 'completed'
    );
  end if;

  if v_assignment_id is not null then
    return exists (
      select 1 from public.assignment_submissions
      where uid = p_uid and assignment_id = v_assignment_id and status = 'approved'
    );
  end if;

  return exists (
    select 1 from public.task_completions
    where uid = p_uid and task_id = p_task_id and completed = true
  );
end;
$$;

revoke execute on function public.is_task_done(uuid, uuid) from public, anon;
grant execute on function public.is_task_done(uuid, uuid) to authenticated;

-- ---------- is a task unlocked (all its dependencies done)? ----------
create or replace function public.task_unlocked(p_task_id uuid, p_uid uuid)
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
    select 1 from public.task_dependencies d
    where d.task_id = p_task_id and not public.is_task_done(d.depends_on_task_id, p_uid)
  ) into v_blocked;
  return not v_blocked;
end;
$$;

revoke execute on function public.task_unlocked(uuid, uuid) from public, anon;
grant execute on function public.task_unlocked(uuid, uuid) to authenticated;

-- ---------- self-attested task completion (learning/business/freelancing/
-- reflection/attendance tasks with no linked course or assignment) ----------
create or replace function public.complete_task(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task record;
begin
  select * into v_task from public.tasks where id = p_task_id;
  if v_task.id is null then
    raise exception 'task not found';
  end if;

  if v_task.linked_course_id is not null or v_task.linked_assignment_id is not null then
    raise exception 'this task completes automatically once its linked training/assignment is done';
  end if;

  if not public.task_unlocked(p_task_id, auth.uid()) then
    raise exception 'complete the prerequisite tasks first';
  end if;

  insert into public.task_completions (uid, task_id, completed, completed_at)
  values (auth.uid(), p_task_id, true, now())
  on conflict (uid, task_id) do update set completed = true, completed_at = now();

  insert into public.activity_log (actor_uid, action, target_type, target_id)
  values (auth.uid(), 'task_completed', 'task', p_task_id::text);
end;
$$;

revoke execute on function public.complete_task(uuid) from public, anon;
grant execute on function public.complete_task(uuid) to authenticated;

-- ---------- permission helper: caller may view p_uid's journey data ----------
create or replace function public.can_view_journey(p_uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select p_uid = auth.uid() or public.current_role() = 'admin' or public.is_assigned_mentor_of(p_uid);
$$;

-- ---------- per-track progress within a stage ----------
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
  v_task record;
begin
  if not public.can_view_journey(p_uid) then
    raise exception 'permission denied';
  end if;

  select count(*) into v_total from public.tasks
    where stage_id = p_stage_id and track_id = p_track_id and is_required = true;

  if v_total = 0 then
    return 0;
  end if;

  for v_task in
    select id from public.tasks
      where stage_id = p_stage_id and track_id = p_track_id and is_required = true
  loop
    if public.is_task_done(v_task.id, p_uid) then
      v_done := v_done + 1;
    end if;
  end loop;

  return round((v_done::numeric / v_total) * 100);
end;
$$;

revoke execute on function public.compute_track_progress(uuid, uuid, uuid) from public, anon;
grant execute on function public.compute_track_progress(uuid, uuid, uuid) to authenticated;

-- ---------- full journey overview for the member dashboard ----------
-- Ensures a member_journey row exists (defaulting to the earliest published
-- stage) the first time a member views their own overview; never auto-starts
-- a journey on someone else's behalf when a mentor/admin is just viewing it.
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
      'progressPercent', public.compute_track_progress(p_uid, v_stage_id, t.id)
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

revoke execute on function public.get_journey_overview(uuid) from public, anon;
grant execute on function public.get_journey_overview(uuid) to authenticated;

-- ---------- next best action ----------
-- Highest-priority incomplete, unlocked, required task across the member's
-- current stage (any track), earliest due date first.
create or replace function public.get_next_best_action(p_uid uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stage_id uuid;
  v_task record;
begin
  if not public.can_view_journey(p_uid) then
    raise exception 'permission denied';
  end if;

  select current_stage_id into v_stage_id from public.member_journey where uid = p_uid;
  if v_stage_id is null then
    return null;
  end if;

  for v_task in
    select tk.id, tk.title, tk.description, tk.due_date, tr.key as track_key, tr.label as track_label, tr.icon as track_icon
      from public.tasks tk
      join public.tracks tr on tr.id = tk.track_id
      where tk.stage_id = v_stage_id and tk.is_required = true
      order by tk.due_date nulls last
  loop
    if not public.is_task_done(v_task.id, p_uid) and public.task_unlocked(v_task.id, p_uid) then
      return jsonb_build_object(
        'taskId', v_task.id,
        'title', v_task.title,
        'description', v_task.description,
        'dueDate', v_task.due_date,
        'trackKey', v_task.track_key,
        'trackLabel', v_task.track_label,
        'trackIcon', v_task.track_icon
      );
    end if;
  end loop;

  return null;
end;
$$;

revoke execute on function public.get_next_best_action(uuid) from public, anon;
grant execute on function public.get_next_best_action(uuid) to authenticated;
