-- Mind Training paths never got the "past rank stays visible, marked
-- completed" treatment get_learning_paths() already has for regular
-- learning paths (0072): can_view_mind_training_path (0066) requires an
-- EXACT rank_id match, so the moment a member's rank moves past a Mind
-- Training level's attached rank, that level vanishes from the hub
-- entirely instead of staying visible with a "Completed" badge. Same
-- product rule as 0072, applied here: a rank a member has moved past stays
-- visible (so they can revisit/retake it) and is marked completed; a
-- rank still ahead of the member stays hidden, unchanged.
--
-- can_view_mind_training_path backs the RLS select policy on every
-- mind_training_* table (mind_training_levels_select and friends, 0066),
-- so fixing it here also fixes direct table reads and
-- get_my_mind_training_path(p_path_id) (which calls it directly) --  not
-- just the hub list below.
create or replace function public.can_view_mind_training_path(p_path_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.current_role() = 'admin' or exists (
    select 1
    from public.learning_paths lp
    join public.profiles p on p.id = auth.uid()
    left join public.ranks mr on mr.id = p.rank_id
    where lp.id = p_path_id and lp.published = true
      and (
        not exists (select 1 from public.rank_learning_paths rlp where rlp.learning_path_id = lp.id)
        or exists (
          select 1
          from public.rank_learning_paths rlp
          join public.ranks r on r.id = rlp.rank_id
          where rlp.learning_path_id = lp.id
            and mr.order_index is not null
            and r.order_index <= mr.order_index
        )
      )
  );
$$;

-- ================= get_my_mind_training_paths: past-rank visibility + completed =================
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
  v_rank_order int;
begin
  select rank_id into v_rank_id from public.profiles where id = v_uid;
  select order_index into v_rank_order from public.ranks where id = v_rank_id;

  return coalesce((
    with visible_paths as (
      select lp.id, lp.title, lp.description, lp.order_index
      from public.learning_paths lp
      where lp.section = 'mind_training' and lp.published = true
        and (
          not exists (select 1 from public.rank_learning_paths rlp where rlp.learning_path_id = lp.id)
          or exists (
            select 1
            from public.rank_learning_paths rlp
            join public.ranks r on r.id = rlp.rank_id
            where rlp.learning_path_id = lp.id
              and v_rank_order is not null
              and r.order_index <= v_rank_order
          )
        )
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
      ),
      'pastRank', coalesce((
        select min(r.order_index) < v_rank_order
        from public.rank_learning_paths rlp
        join public.ranks r on r.id = rlp.rank_id
        where rlp.learning_path_id = vp.id
      ), false)
    ) order by vp.order_index)
    from visible_paths vp
    left join summary s on s.path_id = vp.id
    left join completion cm on cm.path_id = vp.id
  ), '[]'::jsonb);
end;
$$;
-- CREATE OR REPLACE on both functions preserves existing grants (same
-- name, same signature) -- no new revoke/grant statements needed.
