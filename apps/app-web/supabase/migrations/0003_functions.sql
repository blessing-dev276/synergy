-- Server-authoritative RPC functions + triggers. Replaces what would have
-- been a Cloud Functions deploy — everything here is SECURITY DEFINER
-- (bypasses RLS/grants internally, re-validates the caller's role itself)
-- and ships as an ordinary SQL migration, no separate deploy pipeline.

-- ---------- new user -> profile row ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', ''), new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- role changes: admin only ----------
create or replace function public.set_user_role(target_uid uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;
  if new_role not in ('member', 'mentor', 'admin') then
    raise exception 'invalid role: %', new_role;
  end if;

  update public.profiles set role = new_role where id = target_uid;

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'role_changed', 'user', target_uid::text, jsonb_build_object('role', new_role));
end;
$$;

revoke execute on function public.set_user_role(uuid, text) from public, anon;
grant execute on function public.set_user_role(uuid, text) to authenticated;

-- ---------- mentor assignment: admin only ----------
create or replace function public.assign_mentor(p_mentor_uid uuid, p_member_uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mentor_role text;
  v_member_role text;
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;

  select role into v_mentor_role from public.profiles where id = p_mentor_uid;
  select role into v_member_role from public.profiles where id = p_member_uid;

  if v_mentor_role is distinct from 'mentor' then
    raise exception 'target % is not a mentor', p_mentor_uid;
  end if;
  if v_member_role is distinct from 'member' then
    raise exception 'target % is not a member', p_member_uid;
  end if;

  insert into public.mentor_assignments (mentor_uid, member_uid, assigned_by, active, assigned_at)
  values (p_mentor_uid, p_member_uid, auth.uid(), true, now())
  on conflict (mentor_uid, member_uid) do update
    set active = true, assigned_by = excluded.assigned_by, assigned_at = now();

  update public.profiles set mentor_uid = p_mentor_uid where id = p_member_uid;

  insert into public.activity_log (actor_uid, action, target_type, target_id)
  values (auth.uid(), 'mentor_assigned', 'mentor_assignment', p_mentor_uid::text || '_' || p_member_uid::text);
end;
$$;

create or replace function public.unassign_mentor(p_mentor_uid uuid, p_member_uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;

  update public.mentor_assignments set active = false
    where mentor_uid = p_mentor_uid and member_uid = p_member_uid;

  update public.profiles set mentor_uid = null where id = p_member_uid and mentor_uid = p_mentor_uid;

  insert into public.activity_log (actor_uid, action, target_type, target_id)
  values (auth.uid(), 'mentor_unassigned', 'mentor_assignment', p_mentor_uid::text || '_' || p_member_uid::text);
end;
$$;

revoke execute on function public.assign_mentor(uuid, uuid) from public, anon;
grant execute on function public.assign_mentor(uuid, uuid) to authenticated;
revoke execute on function public.unassign_mentor(uuid, uuid) from public, anon;
grant execute on function public.unassign_mentor(uuid, uuid) to authenticated;

-- ---------- lesson completion ----------
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

revoke execute on function public.mark_lesson_complete(uuid, uuid, uuid) from public, anon;
grant execute on function public.mark_lesson_complete(uuid, uuid, uuid) to authenticated;

-- ---------- quizzes: sanitized read + server-side grading ----------
create or replace function public.get_quiz_for_attempt(p_lesson_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_quiz record;
  v_questions jsonb;
begin
  select * into v_quiz from public.quizzes where lesson_id = p_lesson_id limit 1;
  if v_quiz.id is null then
    raise exception 'no quiz is set up for this lesson yet';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'prompt', q.prompt,
      'type', q.type,
      'options', (
        select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'text', o.text) order by o.order_index), '[]'::jsonb)
        from public.quiz_options o where o.question_id = q.id
      )
    ) order by q.order_index
  ), '[]'::jsonb) into v_questions
  from public.quiz_questions q where q.quiz_id = v_quiz.id;

  return jsonb_build_object(
    'id', v_quiz.id,
    'title', v_quiz.title,
    'passScorePercent', v_quiz.pass_score_percent,
    'timeLimitMinutes', v_quiz.time_limit_minutes,
    'questions', v_questions
  );
end;
$$;

revoke execute on function public.get_quiz_for_attempt(uuid) from public, anon;
grant execute on function public.get_quiz_for_attempt(uuid) to authenticated;

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

revoke execute on function public.submit_quiz_attempt(uuid, jsonb) from public, anon;
grant execute on function public.submit_quiz_attempt(uuid, jsonb) to authenticated;

-- ---------- assignment grading: mentor (of that member) or admin only ----------
create or replace function public.grade_assignment(p_submission_id uuid, p_decision text, p_grade int, p_feedback text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_submission_uid uuid;
  v_assignment_id uuid;
begin
  v_role := coalesce(public.current_role(), '');
  if v_role not in ('mentor', 'admin') then
    raise exception 'permission denied: mentor or admin role required';
  end if;
  if p_decision not in ('approved', 'needs_revision') then
    raise exception 'invalid decision: %', p_decision;
  end if;

  select uid, assignment_id into v_submission_uid, v_assignment_id
    from public.assignment_submissions where id = p_submission_id;
  if v_submission_uid is null then
    raise exception 'submission not found';
  end if;

  if v_role = 'mentor' and not public.is_assigned_mentor_of(v_submission_uid) then
    raise exception 'you can only grade your assigned members'' work';
  end if;

  update public.assignment_submissions
    set status = p_decision, grade = p_grade, feedback = coalesce(p_feedback, ''), graded_by = auth.uid(), graded_at = now()
    where id = p_submission_id;

  insert into public.notifications (uid, type, title, body, link_to)
  values (
    v_submission_uid,
    'assignment_graded',
    case when p_decision = 'approved' then 'Assignment approved' else 'Assignment needs revision' end,
    coalesce(nullif(p_feedback, ''), case when p_decision = 'approved' then 'Your assignment was approved.' else 'Your mentor left feedback for you.' end),
    '/assignments/' || v_assignment_id::text
  );

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'assignment_graded', 'assignment_submission', p_submission_id::text, jsonb_build_object('decision', p_decision));
end;
$$;

revoke execute on function public.grade_assignment(uuid, text, int, text) from public, anon;
grant execute on function public.grade_assignment(uuid, text, int, text) to authenticated;

-- ---------- progress recompute trigger (replaces onLessonProgressWrite) ----------
create or replace function public.recompute_enrollment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_completed_count int;
  v_total_count int;
  v_progress_percent int;
  v_status text;
  v_course_title text;
  v_path_id uuid;
  v_just_completed boolean;
begin
  select count(*) into v_completed_count from public.lesson_progress
    where uid = new.uid and course_id = new.course_id and status = 'completed';

  select title, path_id, lesson_count into v_course_title, v_path_id, v_total_count
    from public.courses where id = new.course_id;

  v_progress_percent := case when v_total_count > 0 then round((v_completed_count::numeric / v_total_count) * 100) else 0 end;
  v_status := case when v_total_count > 0 and v_completed_count >= v_total_count then 'completed' else 'in_progress' end;

  insert into public.enrollments (
    uid, course_id, path_id, course_title, status,
    completed_lessons_count, total_lessons_count, progress_percent,
    last_accessed_lesson_id, last_accessed_at, enrolled_at
  )
  values (
    new.uid, new.course_id, coalesce(new.path_id, v_path_id), v_course_title, v_status,
    v_completed_count, v_total_count, v_progress_percent,
    new.lesson_id, now(), now()
  )
  on conflict (uid, course_id) do update set
    path_id = coalesce(excluded.path_id, public.enrollments.path_id),
    course_title = excluded.course_title,
    status = excluded.status,
    completed_lessons_count = excluded.completed_lessons_count,
    total_lessons_count = excluded.total_lessons_count,
    progress_percent = excluded.progress_percent,
    last_accessed_lesson_id = excluded.last_accessed_lesson_id,
    last_accessed_at = now();

  v_just_completed := new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from 'completed');
  if v_just_completed then
    update public.profiles
      set stats = jsonb_set(stats, '{completedLessonsCount}', to_jsonb(coalesce((stats->>'completedLessonsCount')::int, 0) + 1))
      where id = new.uid;
  end if;

  return new;
end;
$$;

create trigger on_lesson_progress_write
  after insert or update on public.lesson_progress
  for each row execute function public.recompute_enrollment();

-- ---------- denormalized count maintenance (path.course_count,
-- course.module_count/lesson_count, module.lesson_count) — these feed the
-- progress-percent math above, so they're kept accurate by triggers rather
-- than left to the admin UI to remember to update. ----------
create or replace function public.maintain_lesson_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_module_id uuid;
  v_course_id uuid;
begin
  v_module_id := coalesce(new.module_id, old.module_id);
  v_course_id := coalesce(new.course_id, old.course_id);

  update public.modules set lesson_count = (select count(*) from public.lessons where module_id = v_module_id) where id = v_module_id;
  update public.courses set lesson_count = (select count(*) from public.lessons where course_id = v_course_id) where id = v_course_id;

  return coalesce(new, old);
end;
$$;

create trigger on_lessons_change
  after insert or delete on public.lessons
  for each row execute function public.maintain_lesson_counts();

create or replace function public.maintain_module_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course_id uuid;
begin
  v_course_id := coalesce(new.course_id, old.course_id);
  update public.courses set module_count = (select count(*) from public.modules where course_id = v_course_id) where id = v_course_id;
  return coalesce(new, old);
end;
$$;

create trigger on_modules_change
  after insert or delete on public.modules
  for each row execute function public.maintain_module_counts();

create or replace function public.maintain_course_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_path_id uuid;
begin
  v_path_id := coalesce(new.path_id, old.path_id);
  update public.learning_paths set course_count = (select count(*) from public.courses where path_id = v_path_id) where id = v_path_id;
  return coalesce(new, old);
end;
$$;

create trigger on_courses_change
  after insert or delete on public.courses
  for each row execute function public.maintain_course_counts();
