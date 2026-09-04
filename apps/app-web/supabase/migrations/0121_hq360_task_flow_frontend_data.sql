-- ================= HQ360 restructure: Tasks daily-unlock frontend =================
-- get_my_task_flow (0114) had everything the derivation logic needed but
-- not quite everything the frontend needs to render a CTA per step type:
-- an exam step needs its public_token for the /take/<token> link, and an
-- assignment step needs the assignment's own fields (+ this member's own
-- submission, if any) to show/submit inline without a second round trip.
-- CREATE OR REPLACE, 0114's body plus those additions -- never edit the
-- old migration file.
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
  v_exam_token uuid;
  v_assignment record;
  v_submission record;
  v_extra jsonb;
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

    v_extra := '{}'::jsonb;
    if v_step.type = 'exam' then
      select public_token into v_exam_token from public.exams where id = v_step.exam_id;
      v_extra := jsonb_build_object('examToken', v_exam_token);
    elsif v_step.type = 'assignment' then
      select * into v_assignment from public.coursework_assignments where id = v_step.coursework_assignment_id;
      select * into v_submission from public.coursework_submissions
        where assignment_id = v_step.coursework_assignment_id and user_id = v_uid;
      v_extra := jsonb_build_object(
        'assignment', jsonb_build_object(
          'id', v_assignment.id, 'title', v_assignment.title, 'instructions', v_assignment.instructions,
          'referenceLink', v_assignment.reference_link, 'requireNote', v_assignment.require_note,
          'requireLink', v_assignment.require_link
        ),
        'mySubmission', case when v_submission.id is null then null else jsonb_build_object(
          'status', v_submission.status, 'note', v_submission.note, 'link', v_submission.link,
          'reviewNote', v_submission.review_note
        ) end
      );
    end if;

    v_out := v_out || (jsonb_build_object(
      'id', v_step.id, 'title', v_step.title, 'description', v_step.description,
      'type', v_step.type, 'classId', v_step.class_id, 'examId', v_step.exam_id,
      'courseworkAssignmentId', v_step.coursework_assignment_id,
      'isComplete', v_is_complete, 'completedAt', v_completed_at,
      'available', v_available, 'unlocksAt', v_unlocks_at,
      'isCurrent', (not v_is_complete) and v_available and not v_found_current
    ) || v_extra);

    if (not v_is_complete) and v_available then
      v_found_current := true;
    end if;

    v_prev_complete := v_is_complete;
    v_prev_completed_at := v_completed_at;
  end loop;

  return v_out;
end;
$$;
