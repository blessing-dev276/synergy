-- Level 3 (Goals, Vision & Ambition) needs two things Level 1 didn't:
-- lessons that unlock sequentially, and an assessment with a written/
-- practical section alongside multiple choice. Both extend proven,
-- already-shipped patterns instead of inventing new ones.

-- ---------- sequential lesson unlock ----------
-- Exact same opt-in-per-module convention as modules.sequential (0062,
-- courses/lessons): defaults false so every existing Mind Training module
-- is unaffected; an admin (or a seed script) turns it on per module. The
-- lock itself is enforced in the frontend (MindTrainingPathDetail's list +
-- MindTrainingLessonViewer's direct-link guard), same as 0062.
alter table public.mind_training_modules add column sequential boolean not null default false;

-- ---------- written/practical assessment questions ----------
-- Everything before this was single-choice-only (mind_training_assessment_
-- options, is_correct). Level 3's assessment needs practical questions
-- ("write one SMART goal", "define your daily actions") that are recorded
-- and reviewable but not auto-graded right/wrong. question_type is the
-- smallest change that supports that: 'written' questions have no options
-- row at all, and scoring/pass-percent below only ever counts
-- 'multiple_choice' questions.
alter table public.mind_training_assessment_questions
  add column question_type text not null default 'multiple_choice'
  check (question_type in ('multiple_choice', 'written'));

-- ================= get_my_mind_training_path: + module.sequential =================
create or replace function public.get_my_mind_training_path(p_path_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_path record;
  v_levels jsonb;
  v_resources jsonb;
begin
  if not public.can_view_mind_training_path(p_path_id) then
    raise exception 'this path is not available to you';
  end if;

  select id, title, description into v_path from public.learning_paths where id = p_path_id and section = 'mind_training';
  if v_path.id is null then
    raise exception 'mind training path not found';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', lv.id,
    'title', lv.title,
    'description', lv.description,
    'milestone', case when lv.milestone_title is not null then jsonb_build_object(
      'key', lv.milestone_key,
      'title', lv.milestone_title,
      'icon', coalesce(lv.milestone_icon, '🏆'),
      'description', lv.milestone_description
    ) else null end,
    'summary', (
      select jsonb_build_object(
        'lessonsTotal', count(*) filter (where item_type = 'lesson'),
        'lessonsDone', count(*) filter (where item_type = 'lesson' and done),
        'tasksTotal', count(*) filter (where item_type = 'practical_task' and is_required),
        'tasksDone', count(*) filter (where item_type = 'practical_task' and is_required and done),
        'challengeTotal', count(*) filter (where item_type = 'challenge_day' and is_required),
        'challengeDone', count(*) filter (where item_type = 'challenge_day' and is_required and done),
        'assessmentExists', bool_or(item_type = 'assessment'),
        'assessmentPassed', coalesce(bool_or(item_type = 'assessment' and done), false)
      )
      from (
        select 'lesson'::text as item_type, false as is_required,
          exists (select 1 from public.mind_training_lesson_progress lpr where lpr.lesson_id = l.id and lpr.uid = v_uid) as done
        from public.mind_training_lessons l
        join public.mind_training_modules m on m.id = l.module_id and m.published = true
        where l.level_id = lv.id and l.published = true
        union all
        select case when a.category in ('practical_task', 'challenge_day') then a.category else 'activity' end,
          a.is_required,
          exists (select 1 from public.mind_training_activity_progress apr where apr.activity_id = a.id and apr.uid = v_uid)
        from public.mind_training_activities a
        join public.mind_training_modules m on m.id = a.module_id and m.published = true
        where m.level_id = lv.id and a.published = true
        union all
        select 'assessment', true,
          exists (select 1 from public.mind_training_assessment_attempts att where att.assessment_id = asm.id and att.uid = v_uid and att.passed = true)
        from public.mind_training_assessments asm
        join public.mind_training_modules m on m.id = asm.module_id and m.published = true
        where m.level_id = lv.id
      ) items
    ),
    'modules', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id,
        'title', m.title,
        'description', m.description,
        'sequential', m.sequential,
        'lessons', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', l.id,
            'title', l.title,
            'estimatedMinutes', l.estimated_minutes,
            'hasPdf', l.pdf_path is not null,
            'xpReward', l.xp_reward,
            'done', exists (select 1 from public.mind_training_lesson_progress lpr where lpr.lesson_id = l.id and lpr.uid = v_uid)
          ) order by l.order_index), '[]'::jsonb)
          from public.mind_training_lessons l where l.module_id = m.id and l.published = true
        ),
        'activities', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', a.id,
            'title', a.title,
            'category', a.category,
            'isRequired', a.is_required,
            'xpReward', a.xp_reward,
            'done', exists (select 1 from public.mind_training_activity_progress apr where apr.activity_id = a.id and apr.uid = v_uid)
          ) order by a.order_index), '[]'::jsonb)
          from public.mind_training_activities a where a.module_id = m.id and a.published = true
        ),
        'assessment', (
          select jsonb_build_object(
            'id', asm.id,
            'title', asm.title,
            'passScorePercent', asm.pass_score_percent,
            'xpReward', asm.xp_reward,
            'questionCount', (select count(*) from public.mind_training_assessment_questions q where q.assessment_id = asm.id),
            'passed', exists (select 1 from public.mind_training_assessment_attempts att where att.assessment_id = asm.id and att.uid = v_uid and att.passed = true)
          )
          from public.mind_training_assessments asm where asm.module_id = m.id
        )
      ) order by m.order_index), '[]'::jsonb)
      from public.mind_training_modules m where m.level_id = lv.id and m.published = true
    )
  ) order by lv.order_index), '[]'::jsonb) into v_levels
  from public.mind_training_levels lv where lv.path_id = p_path_id and lv.published = true;

  select coalesce(jsonb_object_agg(rt.resource_type, rt.items), '{}'::jsonb) into v_resources
  from (
    select r.resource_type,
      jsonb_agg(jsonb_build_object(
        'id', r.id,
        'title', r.title,
        'author', r.author,
        'thumbnailUrl', r.thumbnail_url,
        'description', r.description,
        'resourceType', r.resource_type
      ) order by r.order_index) as items
    from public.pd_resources r
    join public.pd_resource_learning_paths rlp on rlp.resource_id = r.id
    where rlp.learning_path_id = p_path_id and r.published = true
    group by r.resource_type
  ) rt;

  return jsonb_build_object(
    'id', v_path.id,
    'title', v_path.title,
    'description', v_path.description,
    'levels', v_levels,
    'recommendedResources', v_resources
  );
end;
$$;

-- ================= get_mind_training_assessment_for_attempt: + questionType =================
create or replace function public.get_mind_training_assessment_for_attempt(p_module_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_assessment record;
  v_questions jsonb;
begin
  select * into v_assessment from public.mind_training_assessments where module_id = p_module_id limit 1;
  if v_assessment.id is null then
    raise exception 'no assessment is set up for this module yet';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'prompt', q.prompt,
      'questionType', q.question_type,
      'options', (
        select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'text', o.text) order by o.order_index), '[]'::jsonb)
        from public.mind_training_assessment_options o where o.question_id = q.id
      )
    ) order by q.order_index
  ), '[]'::jsonb) into v_questions
  from public.mind_training_assessment_questions q where q.assessment_id = v_assessment.id;

  return jsonb_build_object(
    'id', v_assessment.id,
    'title', v_assessment.title,
    'passScorePercent', v_assessment.pass_score_percent,
    'questions', v_questions
  );
end;
$$;

-- ================= submit_mind_training_assessment_attempt: written questions =================
-- Written questions are stored (in `answers`, unchanged) and returned in
-- `results` for review, but never counted in v_total/v_correct -- the pass
-- percentage is computed only over multiple_choice questions, same as
-- before this migration for an assessment with no written questions at all.
create or replace function public.submit_mind_training_assessment_attempt(p_assessment_id uuid, p_answers jsonb)
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
  v_written_text text;
  v_is_correct boolean;
  v_correct_option record;
  v_results jsonb := '[]'::jsonb;
begin
  select pass_score_percent into v_pass_score from public.mind_training_assessments where id = p_assessment_id;
  if v_pass_score is null then
    raise exception 'assessment not found';
  end if;

  select count(*) into v_total
    from public.mind_training_assessment_questions
    where assessment_id = p_assessment_id and question_type = 'multiple_choice';

  for v_question in
    select id, prompt, question_type from public.mind_training_assessment_questions where assessment_id = p_assessment_id order by order_index
  loop
    if v_question.question_type = 'written' then
      select elem->>'text' into v_written_text
        from jsonb_array_elements(p_answers) elem
        where (elem->>'questionId')::uuid = v_question.id
        limit 1;

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
-- CREATE OR REPLACE on all three functions preserves existing grants (same
-- name, same signature) -- no new revoke/grant statements needed.
