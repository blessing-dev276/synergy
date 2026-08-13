-- Notifications were previously created in exactly one place (grading an
-- assignment). This adds the other member-facing events from the original
-- spec's notification list: a new individual task/activity assigned, a
-- journey stage change, a course completed, and a quiz result. Deliberately
-- NOT notifying on every lesson completion (spec calls out "course is
-- completed", not each lesson — that would be noisy).

-- ---------- task/activity assigned ----------
create or replace function public.notify_task_assigned()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assigned_to_uid is not null then
    insert into public.notifications (uid, type, title, body, link_to)
    values (
      new.assigned_to_uid,
      'task_assigned',
      'New activity assigned',
      new.title,
      '/tasks'
    );
  end if;
  return new;
end;
$$;

revoke execute on function public.notify_task_assigned() from public, anon, authenticated;

create trigger on_task_assigned
  after insert on public.tasks
  for each row execute function public.notify_task_assigned();

-- ---------- journey stage changed ----------
create or replace function public.set_member_stage(p_uid uuid, p_stage_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_role text;
  v_stage_title text;
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;

  select role into v_member_role from public.profiles where id = p_uid;
  if v_member_role is distinct from 'member' then
    raise exception 'target % is not a member', p_uid;
  end if;

  if p_stage_id is not null then
    select title into v_stage_title from public.stages where id = p_stage_id;
    if v_stage_title is null then
      raise exception 'stage not found';
    end if;
  end if;

  insert into public.member_journey (uid, current_stage_id, started_at, updated_at)
  values (p_uid, p_stage_id, now(), now())
  on conflict (uid) do update set current_stage_id = p_stage_id, updated_at = now();

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'member_stage_set', 'member_journey', p_uid::text, jsonb_build_object('stage_id', p_stage_id));

  if v_stage_title is not null then
    insert into public.notifications (uid, type, title, body, link_to)
    values (p_uid, 'stage_changed', 'Your journey moved forward', 'You''re now on: ' || v_stage_title, '/dashboard');
  end if;
end;
$$;

revoke execute on function public.set_member_stage(uuid, uuid) from public, anon;
grant execute on function public.set_member_stage(uuid, uuid) to authenticated;

-- ---------- course completed ----------
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
  v_prev_enrollment_status text;
begin
  select count(*) into v_completed_count from public.lesson_progress
    where uid = new.uid and course_id = new.course_id and status = 'completed';

  select title, path_id, lesson_count into v_course_title, v_path_id, v_total_count
    from public.courses where id = new.course_id;

  select status into v_prev_enrollment_status from public.enrollments
    where uid = new.uid and course_id = new.course_id;

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

  if v_status = 'completed' and v_prev_enrollment_status is distinct from 'completed' then
    insert into public.notifications (uid, type, title, body, link_to)
    values (new.uid, 'course_completed', 'Course completed! 🎉', v_course_title, '/learning');
  end if;

  return new;
end;
$$;

-- ---------- quiz result ----------
create or replace function public.submit_quiz_attempt(p_quiz_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pass_score int;
  v_quiz_title text;
  v_total int;
  v_correct int := 0;
  v_score int;
  v_passed boolean;
  v_attempt_number int;
  v_question record;
  v_given_option uuid;
begin
  select pass_score_percent, title into v_pass_score, v_quiz_title from public.quizzes where id = p_quiz_id;
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

  insert into public.notifications (uid, type, title, body, link_to)
  values (
    auth.uid(),
    'quiz_result',
    case when v_passed then 'Quiz passed! 🎉' else 'Quiz result' end,
    v_quiz_title || ' — ' || v_score || '%' || case when v_passed then '' else ', try again when ready.' end,
    '/learning'
  );

  return jsonb_build_object('score', v_score, 'passed', v_passed);
end;
$$;

revoke execute on function public.submit_quiz_attempt(uuid, jsonb) from public, anon;
grant execute on function public.submit_quiz_attempt(uuid, jsonb) to authenticated;
