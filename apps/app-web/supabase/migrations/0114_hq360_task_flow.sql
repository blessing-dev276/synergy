-- ================= HQ360 restructure: Tasks — daily-unlock flow (§10) =================
-- One office-wide ordered sequence, each step a thin pointer at existing
-- Learning Center content; no progress table, completion is derived.
--
-- NAMING NOTE for the next phase: Synergy already has a member-facing
-- "Tasks" page at /tasks (content assignments + rank tasks, see
-- useTodayTasks.js) -- a different, pre-existing feature. This table is
-- named task_flow_steps (not "tasks") specifically to avoid colliding with
-- it at the schema level, but the ROUTING collision (HQ360 also wants a
-- top-level /tasks) is a real decision the frontend phase has to make --
-- not resolved here. Schema + derivation RPCs land now; TasksAdmin/TasksMember
-- frontend is deferred with the rest of the non-Onboarding/PD stages.

create table public.task_flow_steps (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id),
  title text not null,
  description text,
  order_index int not null default 0,
  type text not null check (type in ('class', 'exam', 'assignment')),
  class_id uuid references public.classes(id) on delete cascade,
  exam_id uuid references public.exams(id) on delete cascade,
  coursework_assignment_id uuid references public.coursework_assignments(id) on delete cascade,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (
    (type = 'class' and class_id is not null and exam_id is null and coursework_assignment_id is null)
    or (type = 'exam' and exam_id is not null and class_id is null and coursework_assignment_id is null)
    or (type = 'assignment' and coursework_assignment_id is not null and class_id is null and exam_id is null)
  )
);
create index task_flow_steps_org_order_idx on public.task_flow_steps (org_id, order_index);

alter table public.task_flow_steps enable row level security;
grant select on public.task_flow_steps to authenticated;
create policy task_flow_steps_select on public.task_flow_steps for select using (auth.uid() is not null);

-- The one place that decides when a step counts as "done" and what
-- timestamp to unlock the next step from -- per type, per §10.3/§11.
create or replace function public.task_step_completion(p_step_id uuid, p_user_id uuid, out is_complete boolean, out completed_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_step record;
begin
  select * into v_step from public.task_flow_steps where id = p_step_id;
  is_complete := false;
  completed_at := null;
  if v_step is null then
    return;
  end if;

  if v_step.type = 'class' then
    is_complete := public.is_class_complete(v_step.class_id, p_user_id);
    if is_complete then
      select max(t) into completed_at from (
        select completed_at as t from public.class_item_progress cip
          join public.class_module_items cmi on cmi.id = cip.item_id
          join public.class_modules cm on cm.id = cmi.module_id
          where cm.class_id = v_step.class_id and cip.user_id = p_user_id and cip.status = 'completed'
        union all
        select a.submitted_at as t from public.attempts a
          join public.class_module_items cmi on cmi.exam_id = a.exam_id
          join public.class_modules cm on cm.id = cmi.module_id
          where cm.class_id = v_step.class_id and a.user_id = p_user_id and a.status = 'submitted' and a.passed = true
        union all
        select cs.reviewed_at as t from public.coursework_submissions cs
          join public.class_module_items cmi on cmi.coursework_assignment_id = cs.assignment_id
          join public.class_modules cm on cm.id = cmi.module_id
          where cm.class_id = v_step.class_id and cs.user_id = p_user_id and cs.status = 'approved'
      ) all_completions;
    end if;
  elsif v_step.type = 'exam' then
    select min(submitted_at) into completed_at from public.attempts
      where exam_id = v_step.exam_id and user_id = p_user_id and status = 'submitted' and passed = true;
    is_complete := completed_at is not null;
  elsif v_step.type = 'assignment' then
    select reviewed_at into completed_at from public.coursework_submissions
      where assignment_id = v_step.coursework_assignment_id and user_id = p_user_id and status = 'approved';
    is_complete := completed_at is not null;
  end if;
end;
$$;

grant execute on function public.task_step_completion(uuid, uuid) to authenticated;

-- Full ordered flow for the current member, with the 24h unlock rule (§10.3)
-- and "current step" highlighting applied.
create or replace function public.get_my_task_flow()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_step record;
  v_prev_complete boolean := true;
  v_prev_completed_at timestamptz := null;
  v_is_complete boolean;
  v_completed_at timestamptz;
  v_unlocks_at timestamptz;
  v_available boolean;
  v_found_current boolean := false;
  v_out jsonb := '[]'::jsonb;
begin
  for v_step in
    select * from public.task_flow_steps where org_id = public.current_org_id() order by order_index
  loop
    select is_complete, completed_at into v_is_complete, v_completed_at
      from public.task_step_completion(v_step.id, v_uid);

    if v_prev_complete then
      if v_prev_completed_at is null then
        v_available := true;
        v_unlocks_at := null;
      else
        v_unlocks_at := v_prev_completed_at + interval '24 hours';
        v_available := now() >= v_unlocks_at;
      end if;
    else
      v_available := false;
      v_unlocks_at := null;
    end if;

    v_out := v_out || jsonb_build_object(
      'id', v_step.id, 'title', v_step.title, 'description', v_step.description,
      'type', v_step.type, 'classId', v_step.class_id, 'examId', v_step.exam_id,
      'courseworkAssignmentId', v_step.coursework_assignment_id,
      'isComplete', v_is_complete, 'completedAt', v_completed_at,
      'available', v_available, 'unlocksAt', v_unlocks_at,
      'isCurrent', (not v_is_complete) and v_available and not v_found_current
    );

    if (not v_is_complete) and v_available then
      v_found_current := true;
    end if;

    v_prev_complete := v_is_complete;
    v_prev_completed_at := v_completed_at;
  end loop;

  return v_out;
end;
$$;

revoke execute on function public.get_my_task_flow() from public, anon;
grant execute on function public.get_my_task_flow() to authenticated;

-- ================= admin: build the flow =================
create or replace function public.admin_add_task_step(
  p_title text, p_description text, p_type text,
  p_class_id uuid, p_exam_id uuid, p_coursework_assignment_id uuid
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
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'a step needs a title';
  end if;
  if p_type not in ('class', 'exam', 'assignment') then
    raise exception 'invalid step type: %', p_type;
  end if;
  if p_type = 'class' then
    if p_class_id is null or p_exam_id is not null or p_coursework_assignment_id is not null then
      raise exception 'a class step needs exactly a class';
    end if;
    if not exists (select 1 from public.classes where id = p_class_id and status = 'published') then
      raise exception 'pick a published class';
    end if;
  elsif p_type = 'exam' then
    if p_exam_id is null or p_class_id is not null or p_coursework_assignment_id is not null then
      raise exception 'an exam step needs exactly an exam';
    end if;
    if not exists (select 1 from public.exams where id = p_exam_id and status = 'published') then
      raise exception 'pick a published exam';
    end if;
  elsif p_type = 'assignment' then
    if p_coursework_assignment_id is null or p_class_id is not null or p_exam_id is not null then
      raise exception 'an assignment step needs exactly an assignment';
    end if;
    if not exists (select 1 from public.coursework_assignments where id = p_coursework_assignment_id) then
      raise exception 'assignment not found';
    end if;
  end if;

  select coalesce(max(order_index), 0) + 1 into v_next_order
    from public.task_flow_steps where org_id = public.current_org_id();

  insert into public.task_flow_steps (title, description, order_index, type, class_id, exam_id, coursework_assignment_id, created_by)
  values (trim(p_title), nullif(trim(p_description), ''), v_next_order, p_type, p_class_id, p_exam_id, p_coursework_assignment_id, auth.uid())
  returning id into v_id;

  -- Assignment steps backfill targets for active members not already
  -- targeted, per §10.2 -- class/exam steps need no backfill.
  if p_type = 'assignment' then
    for v_member in select id from public.profiles where role = 'member' and status = 'active' loop
      insert into public.coursework_targets (assignment_id, assigned_to_user)
      values (p_coursework_assignment_id, v_member.id)
      on conflict (assignment_id, assigned_to_user) do nothing;
    end loop;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.admin_add_task_step(text, text, text, uuid, uuid, uuid) from public, anon;
grant execute on function public.admin_add_task_step(text, text, text, uuid, uuid, uuid) to authenticated;

create or replace function public.admin_remove_task_step(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;
  -- No progress table to worry about losing -- completion is derived (§10.2).
  delete from public.task_flow_steps where id = p_id;
end;
$$;

revoke execute on function public.admin_remove_task_step(uuid) from public, anon;
grant execute on function public.admin_remove_task_step(uuid) to authenticated;

create or replace function public.admin_move_task_step(p_id uuid, p_direction text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_org_id();
  v_this record;
  v_other record;
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;
  if p_direction not in ('up', 'down') then
    raise exception 'invalid direction: %', p_direction;
  end if;

  select * into v_this from public.task_flow_steps where id = p_id and org_id = v_org;
  if v_this is null then
    raise exception 'step not found';
  end if;

  if p_direction = 'up' then
    select * into v_other from public.task_flow_steps
      where org_id = v_org and order_index < v_this.order_index order by order_index desc limit 1;
  else
    select * into v_other from public.task_flow_steps
      where org_id = v_org and order_index > v_this.order_index order by order_index asc limit 1;
  end if;

  if v_other is null then
    return;
  end if;

  update public.task_flow_steps set order_index = v_other.order_index where id = v_this.id;
  update public.task_flow_steps set order_index = v_this.order_index where id = v_other.id;
end;
$$;

revoke execute on function public.admin_move_task_step(uuid, text) from public, anon;
grant execute on function public.admin_move_task_step(uuid, text) to authenticated;
