-- ================= HQ360 restructure: fix a real 24h-gate bypass =================
-- A class with zero items is trivially complete (§13 gotcha, is_class_complete)
-- -- correct. But task_step_completion derived its completedAt only from
-- actual item-completion signals, so a trivially-complete empty class
-- reports is_complete=true with completed_at=null. get_my_task_flow (0121)
-- treats a null prev_completed_at as "no gate yet, available immediately"
-- (correct for a genuine first step) -- but the same null meant an empty
-- class step silently skipped the 24h wait for the step after it too.
-- Found by reasoning through the empty-class case while building the
-- Tasks frontend, before it was ever hit with real content.
--
-- Fix: any step reporting complete with no derivable timestamp falls back
-- to the step's own creation time -- a deterministic stand-in for "this
-- trivial step has counted as done since it was added to the sequence."
-- CREATE OR REPLACE, 0114's body plus that one fallback -- never edit the
-- old migration file.
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

  if is_complete and completed_at is null then
    completed_at := v_step.created_at;
  end if;
end;
$$;
