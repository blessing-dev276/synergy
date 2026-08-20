-- Mind Training restructure, part 2 of 4: member-facing RPCs. Read RPCs
-- return one nested jsonb blob each (same convention as get_my_rank_tasks/
-- get_leaderboards) so the member UI is a single round trip per screen.
-- Completion writes go through RPCs, not direct table writes (mirrors
-- mark_lesson_complete/submit_quiz_attempt exactly) -- RLS on the progress/
-- attempts tables (0066) has no member insert/update grant at all, so these
-- are the only way progress gets recorded.

-- ---------- get_my_mind_training_paths: the Mind Training tab's path list ----------
create or replace function public.get_my_mind_training_paths()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rank_id uuid;
begin
  select rank_id into v_rank_id from public.profiles where id = v_uid;

  return coalesce((
    with visible_paths as (
      select lp.id, lp.title, lp.description, lp.order_index
      from public.learning_paths lp
      where lp.section = 'mind_training' and lp.published = true
        and exists (select 1 from public.rank_learning_paths rlp where rlp.learning_path_id = lp.id and rlp.rank_id = v_rank_id)
    ),
    items as (
      select lv.path_id, l.id as item_id
      from public.mind_training_lessons l
      join public.mind_training_modules m on m.id = l.module_id and m.published = true
      join public.mind_training_levels lv on lv.id = l.level_id and lv.published = true
      where l.published = true
      union all
      select lv.path_id, a.id
      from public.mind_training_activities a
      join public.mind_training_modules m on m.id = a.module_id and m.published = true
      join public.mind_training_levels lv on lv.id = m.level_id and lv.published = true
      where a.published = true
      union all
      select lv.path_id, asm.id
      from public.mind_training_assessments asm
      join public.mind_training_modules m on m.id = asm.module_id and m.published = true
      join public.mind_training_levels lv on lv.id = m.level_id and lv.published = true
    ),
    done as (
      select l.path_id, lpr.lesson_id as item_id
      from public.mind_training_lesson_progress lpr
      join public.mind_training_lessons l on l.id = lpr.lesson_id
      where lpr.uid = v_uid
      union all
      select lv.path_id, apr.activity_id
      from public.mind_training_activity_progress apr
      join public.mind_training_activities a on a.id = apr.activity_id
      join public.mind_training_modules m on m.id = a.module_id
      join public.mind_training_levels lv on lv.id = m.level_id
      where apr.uid = v_uid
      union all
      select lv.path_id, att.assessment_id as item_id
      from public.mind_training_assessment_attempts att
      join public.mind_training_assessments asm on asm.id = att.assessment_id
      join public.mind_training_modules m on m.id = asm.module_id
      join public.mind_training_levels lv on lv.id = m.level_id
      where att.uid = v_uid and att.passed = true
    ),
    counts as (
      select path_id, count(*) as total from items group by path_id
    ),
    completed as (
      select path_id, count(distinct item_id) as done_count from done group by path_id
    )
    select jsonb_agg(jsonb_build_object(
      'id', vp.id,
      'title', vp.title,
      'description', vp.description,
      'totalItems', coalesce(c.total, 0),
      'completedItems', coalesce(d.done_count, 0),
      'percent', case when coalesce(c.total, 0) = 0 then 0 else round((coalesce(d.done_count, 0)::numeric / c.total) * 100) end
    ) order by vp.order_index)
    from visible_paths vp
    left join counts c on c.path_id = vp.id
    left join completed d on d.path_id = vp.id
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.get_my_mind_training_paths() from public, anon;
grant execute on function public.get_my_mind_training_paths() to authenticated;

-- ---------- get_my_mind_training_path: one path's full level/module/lesson tree ----------
-- recommendedResources is filled in as an empty object here and re-defined
-- (CREATE OR REPLACE, same function name/signature) by 0068 once
-- pd_resources exists -- same "redefine as the schema grows" convention
-- this codebase already uses repeatedly (get_learning_paths, 5 revisions).
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
            'done', exists (select 1 from public.mind_training_lesson_progress lpr where lpr.lesson_id = l.id and lpr.uid = v_uid)
          ) order by l.order_index), '[]'::jsonb)
          from public.mind_training_lessons l where l.module_id = m.id and l.published = true
        ),
        'activities', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', a.id,
            'title', a.title,
            'done', exists (select 1 from public.mind_training_activity_progress apr where apr.activity_id = a.id and apr.uid = v_uid)
          ) order by a.order_index), '[]'::jsonb)
          from public.mind_training_activities a where a.module_id = m.id and a.published = true
        ),
        'assessment', (
          select jsonb_build_object(
            'id', asm.id,
            'title', asm.title,
            'passScorePercent', asm.pass_score_percent,
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

  return jsonb_build_object(
    'id', v_path.id,
    'title', v_path.title,
    'description', v_path.description,
    'levels', v_levels,
    'recommendedResources', '{}'::jsonb
  );
end;
$$;

revoke execute on function public.get_my_mind_training_path(uuid) from public, anon;
grant execute on function public.get_my_mind_training_path(uuid) to authenticated;

-- ---------- completion writes ----------
create or replace function public.mark_mind_training_lesson_complete(p_lesson_id uuid)
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

  insert into public.mind_training_lesson_progress (uid, lesson_id, module_id, level_id, path_id, completed_at)
  values (auth.uid(), v_lesson.id, v_lesson.module_id, v_lesson.level_id, v_lesson.path_id, now())
  on conflict (uid, lesson_id) do update set completed_at = now();
end;
$$;

revoke execute on function public.mark_mind_training_lesson_complete(uuid) from public, anon;
grant execute on function public.mark_mind_training_lesson_complete(uuid) to authenticated;

create or replace function public.mark_mind_training_activity_complete(p_activity_id uuid)
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

  insert into public.mind_training_activity_progress (uid, activity_id, module_id, completed_at)
  values (auth.uid(), v_activity.id, v_activity.module_id, now())
  on conflict (uid, activity_id) do update set completed_at = now();
end;
$$;

revoke execute on function public.mark_mind_training_activity_complete(uuid) from public, anon;
grant execute on function public.mark_mind_training_activity_complete(uuid) to authenticated;

-- ---------- assessments: same shape as get_quiz_for_attempt/submit_quiz_attempt ----------
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

revoke execute on function public.get_mind_training_assessment_for_attempt(uuid) from public, anon;
grant execute on function public.get_mind_training_assessment_for_attempt(uuid) to authenticated;

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
begin
  select pass_score_percent into v_pass_score from public.mind_training_assessments where id = p_assessment_id;
  if v_pass_score is null then
    raise exception 'assessment not found';
  end if;

  select count(*) into v_total from public.mind_training_assessment_questions where assessment_id = p_assessment_id;

  for v_question in select id from public.mind_training_assessment_questions where assessment_id = p_assessment_id loop
    select (elem->>'optionId')::uuid into v_given_option
      from jsonb_array_elements(p_answers) elem
      where (elem->>'questionId')::uuid = v_question.id
      limit 1;

    if v_given_option is not null and exists (
      select 1 from public.mind_training_assessment_options where id = v_given_option and question_id = v_question.id and is_correct = true
    ) then
      v_correct := v_correct + 1;
    end if;
  end loop;

  v_score := case when v_total > 0 then round((v_correct::numeric / v_total) * 100) else 0 end;
  v_passed := v_score >= coalesce(v_pass_score, 70);

  select count(*) + 1 into v_attempt_number from public.mind_training_assessment_attempts where assessment_id = p_assessment_id and uid = auth.uid();

  insert into public.mind_training_assessment_attempts (assessment_id, uid, answers, score, passed, attempt_number, submitted_at)
  values (p_assessment_id, auth.uid(), p_answers, v_score, v_passed, v_attempt_number, now());

  return jsonb_build_object('score', v_score, 'passed', v_passed);
end;
$$;

revoke execute on function public.submit_mind_training_assessment_attempt(uuid, jsonb) from public, anon;
grant execute on function public.submit_mind_training_assessment_attempt(uuid, jsonb) to authenticated;
