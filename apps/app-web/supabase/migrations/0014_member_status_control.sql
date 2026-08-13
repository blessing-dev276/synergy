-- Member status control: suspend / remove (archive) / reinstate members.
-- `profiles.status` has existed since 0001 as a free-form default-'active'
-- column with nothing reading or writing it. This migration constrains it
-- to a known set and wires it up as a real choke point, following the same
-- RPC + RLS pattern as set_user_role (0003) and set_member_stage (0011):
--   - 'active'    normal member, full participation
--   - 'suspended' can still log in and see their history, but can't write
--                 new progress (enrollments/lessons/assignments/tasks)
--   - 'removed'   soft-delete/archive: same participation block as
--                 suspended, plus hidden from the default member list.
--                 Data is retained, never hard-deleted, per product
--                 decision to keep history for compliance/record-keeping.

alter table public.profiles
  add constraint profiles_status_check check (status in ('active', 'suspended', 'removed'));

-- ---------- is_active(): true only for the signed-in caller's own row ----------
create or replace function public.is_active()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select status = 'active' from public.profiles where id = auth.uid()), false);
$$;

-- ---------- admin-only status changes ----------
create or replace function public.set_member_status(p_uid uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_role text;
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;
  if p_status not in ('active', 'suspended', 'removed') then
    raise exception 'invalid status: %', p_status;
  end if;
  if p_uid = auth.uid() then
    raise exception 'you cannot change your own status';
  end if;

  select role into v_target_role from public.profiles where id = p_uid;
  if v_target_role is null then
    raise exception 'member not found';
  end if;
  if v_target_role = 'admin' then
    raise exception 'cannot change another admin''s status';
  end if;

  update public.profiles set status = p_status where id = p_uid;

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'member_status_changed', 'profile', p_uid::text, jsonb_build_object('status', p_status));
end;
$$;

revoke execute on function public.set_member_status(uuid, text) from public, anon;
grant execute on function public.set_member_status(uuid, text) to authenticated;

-- ---------- gate direct-table participation writes on is_active() ----------
-- Read (select) policies are untouched — suspended/removed members keep
-- seeing their own history. Existing rows are never modified or deleted.

drop policy enrollments_insert on public.enrollments;
create policy enrollments_insert on public.enrollments for insert
  with check (uid = auth.uid() and public.is_active());

drop policy enrollments_update on public.enrollments;
create policy enrollments_update on public.enrollments for update
  using (uid = auth.uid())
  with check (uid = auth.uid() and public.is_active());

drop policy lesson_progress_insert on public.lesson_progress;
create policy lesson_progress_insert on public.lesson_progress for insert
  with check (uid = auth.uid() and status <> 'completed' and public.is_active());

drop policy lesson_progress_update on public.lesson_progress;
create policy lesson_progress_update on public.lesson_progress for update
  using (uid = auth.uid())
  with check (uid = auth.uid() and status <> 'completed' and public.is_active());

drop policy assignment_submissions_insert on public.assignment_submissions;
create policy assignment_submissions_insert on public.assignment_submissions for insert
  with check (uid = auth.uid() and status = 'submitted' and public.is_active());

drop policy assignment_submissions_update on public.assignment_submissions;
create policy assignment_submissions_update on public.assignment_submissions for update
  using (uid = auth.uid())
  with check (uid = auth.uid() and status = 'submitted' and public.is_active());

drop policy task_completions_insert on public.task_completions;
create policy task_completions_insert on public.task_completions for insert
  with check (uid = auth.uid() and public.is_active());

drop policy task_completions_update on public.task_completions;
create policy task_completions_update on public.task_completions for update
  using (uid = auth.uid())
  with check (uid = auth.uid() and public.is_active());

-- ---------- gate RPC-mediated participation writes too ----------
-- (quiz_attempts/lesson completion/self-attested tasks bypass RLS grants
-- entirely, being SECURITY DEFINER, so the same check has to live here too.)

create or replace function public.mark_lesson_complete(p_course_id uuid, p_module_id uuid, p_lesson_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_completion_rule text;
  v_path_id uuid;
  v_quiz_id uuid;
  v_has_pass boolean;
begin
  if not public.is_active() then
    raise exception 'your account is suspended and can''t record progress';
  end if;

  select completion_rule into v_completion_rule from public.lessons
    where id = p_lesson_id and course_id = p_course_id and module_id = p_module_id;
  if v_completion_rule is null then
    raise exception 'lesson not found';
  end if;

  select path_id into v_path_id from public.courses where id = p_course_id;

  if v_completion_rule = 'quiz_pass' then
    select id into v_quiz_id from public.quizzes where lesson_id = p_lesson_id;
    if v_quiz_id is null then
      raise exception 'this lesson''s quiz is not set up yet';
    end if;

    select exists(
      select 1 from public.quiz_attempts where uid = auth.uid() and quiz_id = v_quiz_id and passed = true
    ) into v_has_pass;
    if not v_has_pass then
      raise exception 'you need to pass the quiz before this lesson is complete';
    end if;
  end if;

  insert into public.lesson_progress (uid, lesson_id, module_id, course_id, path_id, status, completed_at, updated_at)
  values (auth.uid(), p_lesson_id, p_module_id, p_course_id, v_path_id, 'completed', now(), now())
  on conflict (uid, lesson_id) do update
    set status = 'completed', completed_at = now(), updated_at = now();
end;
$$;

create or replace function public.submit_quiz_attempt(p_quiz_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pass_score int;
  v_total int;
  v_correct int := 0;
  v_score int;
  v_passed boolean;
  v_attempt_number int;
  v_question record;
  v_given_option uuid;
begin
  if not public.is_active() then
    raise exception 'your account is suspended and can''t take quizzes';
  end if;

  select pass_score_percent into v_pass_score from public.quizzes where id = p_quiz_id;
  if v_pass_score is null then
    raise exception 'quiz not found';
  end if;

  select count(*) into v_total from public.quiz_questions where quiz_id = p_quiz_id;

  for v_question in select id from public.quiz_questions where quiz_id = p_quiz_id loop
    select (elem->>'optionId')::uuid into v_given_option
      from jsonb_array_elements(p_answers) elem
      where (elem->>'questionId')::uuid = v_question.id
      limit 1;

    if v_given_option is not null and exists (
      select 1 from public.quiz_options where id = v_given_option and question_id = v_question.id and is_correct = true
    ) then
      v_correct := v_correct + 1;
    end if;
  end loop;

  v_score := case when v_total > 0 then round((v_correct::numeric / v_total) * 100) else 0 end;
  v_passed := v_score >= coalesce(v_pass_score, 70);

  select count(*) + 1 into v_attempt_number from public.quiz_attempts where quiz_id = p_quiz_id and uid = auth.uid();

  insert into public.quiz_attempts (quiz_id, uid, answers, score, passed, attempt_number, submitted_at)
  values (p_quiz_id, auth.uid(), p_answers, v_score, v_passed, v_attempt_number, now());

  return jsonb_build_object('score', v_score, 'passed', v_passed);
end;
$$;

create or replace function public.complete_task(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task record;
begin
  if not public.is_active() then
    raise exception 'your account is suspended and can''t complete tasks';
  end if;

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
