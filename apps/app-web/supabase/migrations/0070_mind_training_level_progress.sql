-- Mind Training: response capture, activity categories, informational XP,
-- and a per-level milestone -- everything Level 1 (Mindset Foundation)
-- needs, built so Levels 2-10 can reuse the exact same shape later.
--
-- XP: mirrors content_assignments.xp_reward exactly (0027) -- a per-item
-- point value shown to the member, nothing more. There's no accumulating
-- XP wallet or member level anywhere in this codebase to extend (checked:
-- xp_reward is never summed into a profiles total anywhere), and building
-- one from scratch here would be exactly the "unnecessarily complicated
-- gamification system" this feature's brief says to avoid. So this reuses
-- the existing convention at the same scope it already has, no more.
--
-- Milestone: the old milestones/member_milestones system (0033) was already
-- torn down in 0055 -- nothing left to reuse. Rather than resurrect a
-- separate awards table, a level's milestone is just three descriptive
-- columns on mind_training_levels (key/title/icon/description) plus a
-- "did they meet every requirement" check computed live inside
-- get_my_mind_training_path from data that already exists (lessons done,
-- required tasks/challenge-days done, assessment passed). Nothing to keep
-- in sync, nothing to backfill if a level's requirements change later.

alter table public.mind_training_lessons add column xp_reward int not null default 0;

alter table public.mind_training_activities
  add column xp_reward int not null default 0,
  -- Practical Application tasks and 7-Day Challenge days are both
  -- "activities" structurally, but Level 1's completion requirement
  -- ("all lessons + practical tasks submitted + challenge complete +
  -- quiz passed") treats them as three distinct tracked buckets, not one
  -- generic pile -- category is what get_my_mind_training_path groups by
  -- to compute each bucket's own total/done count.
  add column category text not null default 'activity'
    check (category in ('activity', 'practical_task', 'challenge_day')),
  -- Mirrors content_assignments.is_required (0027) -- lets a future
  -- level mark some activities optional without changing the completion-
  -- gating logic, which only counts required ones.
  add column is_required boolean not null default true,
  -- Structured member input (Lesson 5's "enter 5 beliefs", each 7-Day
  -- Challenge day's "Input field", the Complaint -> Action Converter,
  -- etc.) -- an ordered array of {key, label, type} field definitions;
  -- type is 'text' or 'textarea'. Empty array = a plain read-instructions-
  -- then-mark-complete activity, same as before this migration.
  add column input_fields jsonb not null default '[]'::jsonb;

alter table public.mind_training_assessments add column xp_reward int not null default 0;

alter table public.mind_training_levels
  add column milestone_key text,
  add column milestone_title text,
  add column milestone_icon text default '🏆',
  add column milestone_description text default '';

-- Member's written answers -- to a lesson's reflection_questions (array,
-- same order/length) or an activity's input_fields (object keyed by each
-- field's `key`). Nullable: most rows (and any activity with no
-- input_fields) have nothing to store here.
alter table public.mind_training_lesson_progress add column response jsonb;
alter table public.mind_training_activity_progress add column response jsonb;

-- ================= completion writes: now accept an optional response =================
-- Signature changed (new parameter), so the old single-arg overload has to
-- be dropped explicitly first -- CREATE OR REPLACE only replaces a function
-- with the exact same parameter *types*; adding a parameter (even
-- defaulted) would otherwise leave both overloads in place and make calls
-- ambiguous.
drop function if exists public.mark_mind_training_lesson_complete(uuid);

create or replace function public.mark_mind_training_lesson_complete(p_lesson_id uuid, p_response jsonb default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lesson record;
begin
  if not public.is_active() then
    raise exception 'your account is suspended and can''t record progress';
  end if;

  select id, module_id, level_id, path_id into v_lesson
    from public.mind_training_lessons where id = p_lesson_id and published = true;
  if v_lesson.id is null then
    raise exception 'lesson not found';
  end if;
  if not public.can_view_mind_training_path(v_lesson.path_id) then
    raise exception 'this lesson is not available to you';
  end if;

  insert into public.mind_training_lesson_progress (uid, lesson_id, module_id, level_id, path_id, response, completed_at)
  values (auth.uid(), v_lesson.id, v_lesson.module_id, v_lesson.level_id, v_lesson.path_id, p_response, now())
  on conflict (uid, lesson_id) do update set response = coalesce(p_response, public.mind_training_lesson_progress.response), completed_at = now();
end;
$$;

revoke execute on function public.mark_mind_training_lesson_complete(uuid, jsonb) from public, anon;
grant execute on function public.mark_mind_training_lesson_complete(uuid, jsonb) to authenticated;

drop function if exists public.mark_mind_training_activity_complete(uuid);

create or replace function public.mark_mind_training_activity_complete(p_activity_id uuid, p_response jsonb default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activity record;
  v_path_id uuid;
begin
  if not public.is_active() then
    raise exception 'your account is suspended and can''t record progress';
  end if;

  select a.id, a.module_id into v_activity from public.mind_training_activities a where a.id = p_activity_id and a.published = true;
  if v_activity.id is null then
    raise exception 'activity not found';
  end if;

  select lv.path_id into v_path_id
    from public.mind_training_modules m join public.mind_training_levels lv on lv.id = m.level_id
    where m.id = v_activity.module_id;
  if not public.can_view_mind_training_path(v_path_id) then
    raise exception 'this activity is not available to you';
  end if;

  insert into public.mind_training_activity_progress (uid, activity_id, module_id, response, completed_at)
  values (auth.uid(), v_activity.id, v_activity.module_id, p_response, now())
  on conflict (uid, activity_id) do update set response = coalesce(p_response, public.mind_training_activity_progress.response), completed_at = now();
end;
$$;

revoke execute on function public.mark_mind_training_activity_complete(uuid, jsonb) from public, anon;
grant execute on function public.mark_mind_training_activity_complete(uuid, jsonb) to authenticated;

-- ================= assessment: return a per-question breakdown =================
-- Same scoring logic as before, plus a `results` array so a failed attempt
-- can show what was right/wrong and the correct answer -- required for
-- Level 1's "if the member fails: show their score, explain incorrect
-- answers" requirement, which the plain {score,passed} shape couldn't
-- support at all.
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
  v_is_correct boolean;
  v_correct_option record;
  v_results jsonb := '[]'::jsonb;
begin
  select pass_score_percent into v_pass_score from public.mind_training_assessments where id = p_assessment_id;
  if v_pass_score is null then
    raise exception 'assessment not found';
  end if;

  select count(*) into v_total from public.mind_training_assessment_questions where assessment_id = p_assessment_id;

  for v_question in
    select id, prompt from public.mind_training_assessment_questions where assessment_id = p_assessment_id order by order_index
  loop
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
      'correct', coalesce(v_is_correct, false),
      'selectedOptionId', v_given_option,
      'correctOptionId', v_correct_option.id,
      'correctText', v_correct_option.text
    );
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

-- ================= get_my_mind_training_path: milestone + per-level summary =================
-- Same name/signature as 0068's version (CREATE OR REPLACE) -- adds
-- `milestone` (null unless the level defines one) and `summary` (lessons/
-- tasks/challenge-days/assessment bucketed counts, per Level 1's required
-- progress display) to each level object, and `category`/`isRequired`/
-- `xpReward` to activity items so the member UI can group and label them.
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

revoke execute on function public.get_my_mind_training_path(uuid) from public, anon;
grant execute on function public.get_my_mind_training_path(uuid) to authenticated;
