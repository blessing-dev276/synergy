-- ================= HQ360 restructure: Exam Manager (§4.2) =================
-- 0109 laid the exam/CBT schema down read-only. Building the actual manager
-- + take-exam flow surfaced a real gap in that first pass worth fixing here
-- rather than carrying forward: `questions_select` / `question_options_select`
-- let ANY authenticated member read a published exam's full question bank
-- directly from the table -- including `question_options.is_correct`. That's
-- an answer-key leak (trivial to cheat: just query the table instead of
-- taking the exam). Nothing has used these tables yet (no manager existed
-- to create real content), so this is a zero-impact fix right now and a
-- serious one later if left. Members now only ever see question/option
-- content through start_exam_attempt below, which never includes
-- is_correct.

drop policy if exists questions_select on public.questions;
create policy questions_select on public.questions for select
  using (public.current_role() in ('admin', 'mentor'));

drop policy if exists question_options_select on public.question_options;
create policy question_options_select on public.question_options for select
  using (public.current_role() in ('admin', 'mentor'));

-- ================= admin: exam CRUD =================
create or replace function public.create_exam(p_title text, p_description text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'an exam needs a title';
  end if;

  insert into public.exams (title, description, created_by)
  values (trim(p_title), nullif(trim(p_description), ''), auth.uid())
  returning id into v_id;

  -- every exam gets a settings row immediately so the take-exam flow never
  -- has to handle a missing-settings case.
  insert into public.exam_settings (exam_id) values (v_id);

  return v_id;
end;
$$;

revoke execute on function public.create_exam(text, text) from public, anon;
grant execute on function public.create_exam(text, text) to authenticated;

create or replace function public.update_exam_details(p_id uuid, p_title text, p_description text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'an exam needs a title';
  end if;
  update public.exams set title = trim(p_title), description = nullif(trim(p_description), ''), updated_at = now() where id = p_id;
end;
$$;

revoke execute on function public.update_exam_details(uuid, text, text) from public, anon;
grant execute on function public.update_exam_details(uuid, text, text) to authenticated;

create or replace function public.upsert_exam_settings(
  p_exam_id uuid, p_num_questions int, p_time_limit_minutes int, p_pass_mark_percent int,
  p_max_attempts int, p_shuffle_questions boolean, p_shuffle_options boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;
  if p_num_questions is null or p_num_questions <= 0 then
    raise exception 'number of questions must be greater than zero';
  end if;
  if p_time_limit_minutes is null or p_time_limit_minutes <= 0 then
    raise exception 'time limit must be greater than zero';
  end if;
  if p_pass_mark_percent is null or p_pass_mark_percent < 0 or p_pass_mark_percent > 100 then
    raise exception 'pass mark must be between 0 and 100';
  end if;

  update public.exam_settings
    set num_questions = p_num_questions, time_limit_minutes = p_time_limit_minutes,
        pass_mark_percent = p_pass_mark_percent, max_attempts = p_max_attempts,
        shuffle_questions = coalesce(p_shuffle_questions, true), shuffle_options = coalesce(p_shuffle_options, true)
    where exam_id = p_exam_id;
end;
$$;

revoke execute on function public.upsert_exam_settings(uuid, int, int, int, int, boolean, boolean) from public, anon;
grant execute on function public.upsert_exam_settings(uuid, int, int, int, int, boolean, boolean) to authenticated;

create or replace function public.set_exam_public_link(p_exam_id uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;
  update public.exams set public_link_enabled = p_enabled, updated_at = now() where id = p_exam_id;
end;
$$;

revoke execute on function public.set_exam_public_link(uuid, boolean) from public, anon;
grant execute on function public.set_exam_public_link(uuid, boolean) to authenticated;

-- Publish is blocked unless every question has >= 1 correct option marked
-- (single_choice/true_false: exactly one; multi_select: at least one) --
-- an exam nobody can possibly pass is worse than one that isn't live yet.
create or replace function public.publish_exam(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_question_count int;
  v_bad_question record;
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;

  select count(*) into v_question_count from public.questions where exam_id = p_id;
  if v_question_count = 0 then
    raise exception 'add at least one question before publishing';
  end if;

  select q.id, q.prompt into v_bad_question
    from public.questions q
    where q.exam_id = p_id
      and not exists (select 1 from public.question_options o where o.question_id = q.id and o.is_correct = true)
    limit 1;
  if v_bad_question.id is not null then
    raise exception 'question "%" has no correct answer marked', v_bad_question.prompt;
  end if;

  update public.exams set status = 'published', updated_at = now() where id = p_id;
end;
$$;

revoke execute on function public.publish_exam(uuid) from public, anon;
grant execute on function public.publish_exam(uuid) to authenticated;

create or replace function public.unpublish_exam(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;
  update public.exams set status = 'draft', updated_at = now() where id = p_id;
end;
$$;

revoke execute on function public.unpublish_exam(uuid) from public, anon;
grant execute on function public.unpublish_exam(uuid) to authenticated;

create or replace function public.archive_exam(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;
  update public.exams set status = 'archived', updated_at = now() where id = p_id;
end;
$$;

revoke execute on function public.archive_exam(uuid) from public, anon;
grant execute on function public.archive_exam(uuid) to authenticated;

create or replace function public.delete_exam(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;
  -- cascades settings, questions, options, attempts, attempt_answers.
  delete from public.exams where id = p_id;
end;
$$;

revoke execute on function public.delete_exam(uuid) from public, anon;
grant execute on function public.delete_exam(uuid) to authenticated;

-- ================= admin: questions + options =================
create or replace function public.add_question(p_exam_id uuid, p_type text, p_prompt text, p_points numeric)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_next_order int;
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;
  if p_type not in ('single_choice', 'multi_select', 'true_false') then
    raise exception 'invalid question type: %', p_type;
  end if;
  if coalesce(trim(p_prompt), '') = '' then
    raise exception 'a question needs a prompt';
  end if;

  select coalesce(max(order_index), 0) + 1 into v_next_order from public.questions where exam_id = p_exam_id;

  insert into public.questions (exam_id, type, prompt, points, order_index)
  values (p_exam_id, p_type, trim(p_prompt), coalesce(p_points, 1), v_next_order)
  returning id into v_id;

  if p_type = 'true_false' then
    insert into public.question_options (question_id, label, order_index) values (v_id, 'True', 1), (v_id, 'False', 2);
  end if;

  return v_id;
end;
$$;

revoke execute on function public.add_question(uuid, text, text, numeric) from public, anon;
grant execute on function public.add_question(uuid, text, text, numeric) to authenticated;

create or replace function public.update_question(p_id uuid, p_prompt text, p_points numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;
  if coalesce(trim(p_prompt), '') = '' then
    raise exception 'a question needs a prompt';
  end if;
  update public.questions set prompt = trim(p_prompt), points = coalesce(p_points, 1) where id = p_id;
end;
$$;

revoke execute on function public.update_question(uuid, text, numeric) from public, anon;
grant execute on function public.update_question(uuid, text, numeric) to authenticated;

create or replace function public.delete_question(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;
  delete from public.questions where id = p_id;
end;
$$;

revoke execute on function public.delete_question(uuid) from public, anon;
grant execute on function public.delete_question(uuid) to authenticated;

-- single_choice/true_false behave like a radio: marking one option correct
-- un-marks every other option on that question. multi_select allows any
-- number of correct options.
create or replace function public.add_question_option(p_question_id uuid, p_label text, p_is_correct boolean)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_type text;
  v_next_order int;
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;
  if coalesce(trim(p_label), '') = '' then
    raise exception 'an option needs a label';
  end if;

  select type into v_type from public.questions where id = p_question_id;
  select coalesce(max(order_index), 0) + 1 into v_next_order from public.question_options where question_id = p_question_id;

  if coalesce(p_is_correct, false) and v_type in ('single_choice', 'true_false') then
    update public.question_options set is_correct = false where question_id = p_question_id;
  end if;

  insert into public.question_options (question_id, label, is_correct, order_index)
  values (p_question_id, trim(p_label), coalesce(p_is_correct, false), v_next_order)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.add_question_option(uuid, text, boolean) from public, anon;
grant execute on function public.add_question_option(uuid, text, boolean) to authenticated;

create or replace function public.update_question_option(p_id uuid, p_label text, p_is_correct boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_question_id uuid;
  v_type text;
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;
  if coalesce(trim(p_label), '') = '' then
    raise exception 'an option needs a label';
  end if;

  select question_id into v_question_id from public.question_options where id = p_id;
  select type into v_type from public.questions where id = v_question_id;

  if coalesce(p_is_correct, false) and v_type in ('single_choice', 'true_false') then
    update public.question_options set is_correct = false where question_id = v_question_id and id <> p_id;
  end if;

  update public.question_options set label = trim(p_label), is_correct = coalesce(p_is_correct, false) where id = p_id;
end;
$$;

revoke execute on function public.update_question_option(uuid, text, boolean) from public, anon;
grant execute on function public.update_question_option(uuid, text, boolean) to authenticated;

create or replace function public.delete_question_option(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;
  delete from public.question_options where id = p_id;
end;
$$;

revoke execute on function public.delete_question_option(uuid) from public, anon;
grant execute on function public.delete_question_option(uuid) to authenticated;

-- Simple per-exam attempt history for the manager.
create or replace function public.get_exam_attempts_admin(p_exam_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'displayName', p.display_name, 'attemptNumber', a.attempt_number,
      'status', a.status, 'scorePercent', a.score_percent, 'passed', a.passed,
      'submittedAt', a.submitted_at
    ) order by a.submitted_at desc nulls last, a.started_at desc)
    from public.attempts a join public.profiles p on p.id = a.user_id
    where a.exam_id = p_exam_id
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.get_exam_attempts_admin(uuid) from public, anon;
grant execute on function public.get_exam_attempts_admin(uuid) to authenticated;

-- ================= member: take an exam via its public link =================
-- "Public" here means any authenticated member with the link, not a truly
-- anonymous/unauthenticated visitor -- attempts are tied to a real
-- profiles.id, and this app has no anonymous-write surface anywhere else.
-- A genuinely public (logged-out) take-link would need its own, separately
-- hardened path; not built here.
create or replace function public.start_exam_attempt(p_public_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exam record;
  v_settings record;
  v_uid uuid := auth.uid();
  v_attempt_id uuid;
  v_existing_attempts int;
  v_questions jsonb := '[]'::jsonb;
  v_q record;
  v_options jsonb;
begin
  select * into v_exam from public.exams where public_token = p_public_token;
  if v_exam is null then
    raise exception 'exam not found';
  end if;
  if v_exam.status <> 'published' or not v_exam.public_link_enabled then
    raise exception 'this exam is not open right now';
  end if;

  select * into v_settings from public.exam_settings where exam_id = v_exam.id;
  if v_settings is null then
    raise exception 'this exam has not been configured yet';
  end if;

  select count(*) into v_existing_attempts from public.attempts where exam_id = v_exam.id and user_id = v_uid;
  if v_settings.max_attempts is not null and v_existing_attempts >= v_settings.max_attempts then
    raise exception 'you have used all % of your attempts for this exam', v_settings.max_attempts;
  end if;
  if exists (select 1 from public.attempts where exam_id = v_exam.id and user_id = v_uid and status = 'in_progress') then
    raise exception 'you already have an attempt in progress for this exam';
  end if;

  insert into public.attempts (org_id, exam_id, user_id, attempt_number, status)
  values (v_exam.org_id, v_exam.id, v_uid, v_existing_attempts + 1, 'in_progress')
  returning id into v_attempt_id;

  for v_q in
    select * from public.questions
    where exam_id = v_exam.id
    order by case when v_settings.shuffle_questions then random() else null end, order_index
    limit v_settings.num_questions
  loop
    select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label)
      order by case when v_settings.shuffle_options then random() else null end, o.order_index), '[]'::jsonb)
      into v_options
      from public.question_options o where o.question_id = v_q.id;

    v_questions := v_questions || jsonb_build_object(
      'id', v_q.id, 'type', v_q.type, 'prompt', v_q.prompt, 'points', v_q.points, 'options', v_options
    );
  end loop;

  return jsonb_build_object(
    'attemptId', v_attempt_id, 'examTitle', v_exam.title,
    'timeLimitMinutes', v_settings.time_limit_minutes, 'passMarkPercent', v_settings.pass_mark_percent,
    'questions', v_questions
  );
end;
$$;

revoke execute on function public.start_exam_attempt(uuid) from public, anon;
grant execute on function public.start_exam_attempt(uuid) to authenticated;

-- Grades server-side so a client can never fabricate its own score.
-- p_answers: [{ "questionId": uuid, "selectedOptionIds": [uuid, ...] }, ...]
create or replace function public.submit_exam_attempt(p_attempt_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt record;
  v_uid uuid := auth.uid();
  v_pass_mark int;
  v_answer jsonb;
  v_question_id uuid;
  v_selected uuid[];
  v_qtype text;
  v_points numeric;
  v_correct_ids uuid[];
  v_is_correct boolean;
  v_total_points numeric := 0;
  v_earned_points numeric := 0;
  v_score numeric;
  v_passed boolean;
begin
  select * into v_attempt from public.attempts where id = p_attempt_id;
  if v_attempt is null or v_attempt.user_id <> v_uid then
    raise exception 'attempt not found';
  end if;
  if v_attempt.status <> 'in_progress' then
    raise exception 'this attempt has already been submitted';
  end if;

  select pass_mark_percent into v_pass_mark from public.exam_settings where exam_id = v_attempt.exam_id;

  for v_answer in select * from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb))
  loop
    v_question_id := (v_answer->>'questionId')::uuid;
    select coalesce(array_agg(x::uuid), '{}') into v_selected
      from jsonb_array_elements_text(coalesce(v_answer->'selectedOptionIds', '[]'::jsonb)) x;

    select type, points into v_qtype, v_points from public.questions where id = v_question_id and exam_id = v_attempt.exam_id;
    if v_qtype is null then
      continue;
    end if;

    select array_agg(id) into v_correct_ids from public.question_options where question_id = v_question_id and is_correct = true;

    v_is_correct := (
      (select array_agg(x order by x) from unnest(coalesce(v_selected, '{}')) x)
      is not distinct from
      (select array_agg(x order by x) from unnest(coalesce(v_correct_ids, '{}')) x)
    );

    v_total_points := v_total_points + coalesce(v_points, 0);
    if v_is_correct then
      v_earned_points := v_earned_points + coalesce(v_points, 0);
    end if;

    insert into public.attempt_answers (org_id, attempt_id, question_id, selected_option_ids, is_correct)
    values (v_attempt.org_id, p_attempt_id, v_question_id, coalesce(v_selected, '{}'), v_is_correct)
    on conflict (attempt_id, question_id) do update
      set selected_option_ids = excluded.selected_option_ids, is_correct = excluded.is_correct;
  end loop;

  v_score := case when v_total_points > 0 then round((v_earned_points / v_total_points) * 100, 2) else 0 end;
  v_passed := v_score >= coalesce(v_pass_mark, 70);

  update public.attempts
    set status = 'submitted', submitted_at = now(), score_percent = v_score, passed = v_passed,
        time_spent_seconds = extract(epoch from (now() - started_at))::int
    where id = p_attempt_id;

  return jsonb_build_object('scorePercent', v_score, 'passed', v_passed);
end;
$$;

revoke execute on function public.submit_exam_attempt(uuid, jsonb) from public, anon;
grant execute on function public.submit_exam_attempt(uuid, jsonb) to authenticated;
