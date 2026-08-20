-- Level 2 (Self-Awareness & Self-Mastery) needs a Final Assessment made
-- entirely of 'written' questions (0073) -- no multiple choice at all,
-- per spec: "Do NOT make the final assessment only multiple-choice
-- questions." submit_mind_training_assessment_attempt (0073) computes its
-- score only over multiple_choice questions -- for an assessment with zero
-- of those, v_total stays 0 and the member could never pass, no matter what
-- they write. This closes that one gap without touching 0073's actual,
-- intentional behavior for a mixed assessment (Level 3's case): when at
-- least one multiple_choice question exists, scoring is untouched, written
-- answers are still recorded but never counted. Only when an assessment is
-- 100% written does scoring fall back to substance instead of correctness --
-- a written answer "counts" once it's a real attempt (>= 20 trimmed
-- characters, not a shrug), and the pass bar is the same pass_score_percent
-- field every assessment already has (Level 2 seeds 70, matching spec).
create or replace function public.submit_mind_training_assessment_attempt(p_assessment_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pass_score int;
  v_total int;
  v_mc_total int;
  v_correct int := 0;
  v_score int;
  v_passed boolean;
  v_attempt_number int;
  v_question record;
  v_given_option uuid;
  v_written_text text;
  v_is_correct boolean;
  v_correct_option record;
  v_results jsonb := '[]'::jsonb;
begin
  select pass_score_percent into v_pass_score from public.mind_training_assessments where id = p_assessment_id;
  if v_pass_score is null then
    raise exception 'assessment not found';
  end if;

  select count(*) into v_mc_total
    from public.mind_training_assessment_questions
    where assessment_id = p_assessment_id and question_type = 'multiple_choice';

  -- Only an all-written assessment switches the denominator to every
  -- question (scored by substance); a mixed or all-MCQ assessment keeps
  -- 0073's exact behavior (denominator = multiple_choice count only).
  select case when v_mc_total > 0 then v_mc_total else count(*) end into v_total
    from public.mind_training_assessment_questions
    where assessment_id = p_assessment_id;

  for v_question in
    select id, prompt, question_type from public.mind_training_assessment_questions where assessment_id = p_assessment_id order by order_index
  loop
    if v_question.question_type = 'written' then
      select elem->>'text' into v_written_text
        from jsonb_array_elements(p_answers) elem
        where (elem->>'questionId')::uuid = v_question.id
        limit 1;

      if v_mc_total = 0 and length(trim(coalesce(v_written_text, ''))) >= 20 then
        v_correct := v_correct + 1;
      end if;

      v_results := v_results || jsonb_build_object(
        'questionId', v_question.id,
        'prompt', v_question.prompt,
        'questionType', 'written',
        'writtenResponse', v_written_text
      );
    else
      select (elem->>'optionId')::uuid into v_given_option
        from jsonb_array_elements(p_answers) elem
        where (elem->>'questionId')::uuid = v_question.id
        limit 1;

      select id, text into v_correct_option
        from public.mind_training_assessment_options where question_id = v_question.id and is_correct = true limit 1;

      v_is_correct := v_given_option is not null and v_given_option = v_correct_option.id;
      if v_is_correct then
        v_correct := v_correct + 1;
      end if;

      v_results := v_results || jsonb_build_object(
        'questionId', v_question.id,
        'prompt', v_question.prompt,
        'questionType', 'multiple_choice',
        'correct', coalesce(v_is_correct, false),
        'selectedOptionId', v_given_option,
        'correctOptionId', v_correct_option.id,
        'correctText', v_correct_option.text
      );
    end if;
  end loop;

  v_score := case when v_total > 0 then round((v_correct::numeric / v_total) * 100) else 0 end;
  v_passed := v_score >= coalesce(v_pass_score, 70);

  select count(*) + 1 into v_attempt_number from public.mind_training_assessment_attempts where assessment_id = p_assessment_id and uid = auth.uid();

  insert into public.mind_training_assessment_attempts (assessment_id, uid, answers, score, passed, attempt_number, submitted_at)
  values (p_assessment_id, auth.uid(), p_answers, v_score, v_passed, v_attempt_number, now());

  return jsonb_build_object('score', v_score, 'passed', v_passed, 'results', v_results);
end;
$$;

revoke execute on function public.submit_mind_training_assessment_attempt(uuid, jsonb) from public, anon;
grant execute on function public.submit_mind_training_assessment_attempt(uuid, jsonb) to authenticated;
