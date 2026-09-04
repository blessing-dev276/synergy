-- ================= HQ360 restructure: fix a real ambiguous-column bug =================
-- task_step_completion (0114) has an OUT parameter named completed_at, and
-- its 'class' branch selected an unqualified `completed_at` from
-- class_item_progress cip -- Postgres can't tell that apart from the OUT
-- variable of the same name, so any class-type step that actually reached
-- is_complete=true threw 42702 "column reference completed_at is
-- ambiguous" and get_my_task_flow (0121) 400'd outright. Live since 0114;
-- never triggered until a real class-type Tasks step with progress
-- against it was tested just now. Same bug could not have shown up in
-- 0122's fallback either, since the fallback only runs after this branch
-- already failed to execute.
--
-- Fix: qualify cip.completed_at (the other two UNION branches were already
-- qualified: a.submitted_at, cs.reviewed_at). CREATE OR REPLACE, 0122's
-- body plus that one qualifier -- never edit the old migration file.
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
        select cip.completed_at as t from public.class_item_progress cip
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

  if is_complete and completed_at is null then
    completed_at := v_step.created_at;
  end if;
end;
$$;
