-- Levels must be completed in order: Mindset Foundation before
-- Self-Awareness & Self-Mastery before Goals, Vision & Ambition, and so on
-- for future levels. Each "Level" is its own learning_paths row (section=
-- mind_training), ordered by order_index -- same shape as the sequential
-- lesson lock (0073), one level up: a path is locked if any earlier-ordered
-- path visible to this member isn't yet complete. Frontend-enforced only
-- (the hub list hides the link, MindTrainingPathDetail shows a locked state
-- for a direct URL), matching the exact posture of modules.sequential
-- (0062) and 0073's lesson lock -- guided progression, not a hard
-- server-side security boundary.
--
-- "Complete" here reuses get_my_mind_training_path's summary definition
-- exactly (0070/0073): every lesson done, every *required* practical_task/
-- challenge_day activity done (optional/bonus ones don't block), and the
-- assessment passed if one exists.
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
      select lv.path_id, l.id as item_id, 'lesson'::text as item_type, false as is_required,
        exists (select 1 from public.mind_training_lesson_progress lpr where lpr.lesson_id = l.id and lpr.uid = v_uid) as done
      from public.mind_training_lessons l
      join public.mind_training_modules m on m.id = l.module_id and m.published = true
      join public.mind_training_levels lv on lv.id = l.level_id and lv.published = true
      where l.published = true
      union all
      select lv.path_id, a.id, case when a.category in ('practical_task', 'challenge_day') then a.category else 'activity' end, a.is_required,
        exists (select 1 from public.mind_training_activity_progress apr where apr.activity_id = a.id and apr.uid = v_uid)
      from public.mind_training_activities a
      join public.mind_training_modules m on m.id = a.module_id and m.published = true
      join public.mind_training_levels lv on lv.id = m.level_id and lv.published = true
      where a.published = true
      union all
      select lv.path_id, asm.id, 'assessment', true,
        exists (select 1 from public.mind_training_assessment_attempts att where att.assessment_id = asm.id and att.uid = v_uid and att.passed = true)
      from public.mind_training_assessments asm
      join public.mind_training_modules m on m.id = asm.module_id and m.published = true
      join public.mind_training_levels lv on lv.id = m.level_id and lv.published = true
    ),
    summary as (
      select
        path_id,
        count(*) filter (where item_type = 'lesson') as lessons_total,
        count(*) filter (where item_type = 'lesson' and done) as lessons_done,
        count(*) filter (where item_type = 'practical_task' and is_required) as tasks_total,
        count(*) filter (where item_type = 'practical_task' and is_required and done) as tasks_done,
        count(*) filter (where item_type = 'challenge_day' and is_required) as challenge_total,
        count(*) filter (where item_type = 'challenge_day' and is_required and done) as challenge_done,
        bool_or(item_type = 'assessment') as assessment_exists,
        coalesce(bool_or(item_type = 'assessment' and done), false) as assessment_passed,
        count(*) as total_items,
        count(*) filter (where done) as completed_items
      from items
      group by path_id
    ),
    completion as (
      select
        vp.id as path_id,
        coalesce(s.lessons_total, 0) > 0
          and coalesce(s.lessons_done, 0) = coalesce(s.lessons_total, 0)
          and coalesce(s.tasks_done, 0) = coalesce(s.tasks_total, 0)
          and coalesce(s.challenge_done, 0) = coalesce(s.challenge_total, 0)
          and (not coalesce(s.assessment_exists, false) or coalesce(s.assessment_passed, false))
          as is_complete
      from visible_paths vp
      left join summary s on s.path_id = vp.id
    )
    select jsonb_agg(jsonb_build_object(
      'id', vp.id,
      'title', vp.title,
      'description', vp.description,
      'totalItems', coalesce(s.total_items, 0),
      'completedItems', coalesce(s.completed_items, 0),
      'percent', case when coalesce(s.total_items, 0) = 0 then 0 else round((coalesce(s.completed_items, 0)::numeric / s.total_items) * 100) end,
      'complete', coalesce(cm.is_complete, false),
      'locked', exists (
        select 1
        from completion cm2
        join visible_paths vp2 on vp2.id = cm2.path_id
        where vp2.order_index < vp.order_index and not cm2.is_complete
      )
    ) order by vp.order_index)
    from visible_paths vp
    left join summary s on s.path_id = vp.id
    left join completion cm on cm.path_id = vp.id
  ), '[]'::jsonb);
end;
$$;
-- CREATE OR REPLACE preserves the existing grants (same name, same
-- signature) -- no new revoke/grant statements needed.
