-- Three new auto-tracked rank task proxy types, alongside the existing
-- 'modules_count'/'path_complete' (0065, scoped to courses/lesson_progress
-- only -- Mind Training's own module/lesson tables were never wired in):
--
--   prospects_count            -- N prospects added on the day being
--                                  checked (no path -- prospects aren't
--                                  attached to a learning path)
--   mind_training_modules_count -- N Mind Training modules completed in a
--                                  path (mirrors modules_count, against
--                                  mind_training_lesson_progress/
--                                  mind_training_activity_progress instead
--                                  of lesson_progress)
--   mind_training_path_complete -- a whole Mind Training path completed
--                                  (mirrors path_complete; reuses 0075/
--                                  0076's exact "is this path done" rule --
--                                  every lesson, every *required* practical_
--                                  task/challenge_day activity, and the
--                                  assessment if one exists -- via a new
--                                  standalone helper so it doesn't have to
--                                  duplicate that whole CTE inline)
--
-- 'manual' tasks are still untouched.

-- ================= schema: widen proxy_type + its shape rule =================
alter table public.rank_tasks drop constraint rank_tasks_proxy_type_check;
alter table public.rank_tasks add constraint rank_tasks_proxy_type_check
  check (proxy_type in (
    'manual', 'modules_count', 'path_complete',
    'prospects_count', 'mind_training_modules_count', 'mind_training_path_complete'
  ));

alter table public.rank_tasks drop constraint rank_tasks_proxy_shape;
alter table public.rank_tasks add constraint rank_tasks_proxy_shape check (
  (proxy_type = 'manual' and proxy_path_id is null and proxy_threshold is null)
  or (proxy_type = 'modules_count' and proxy_path_id is not null and proxy_threshold is not null and proxy_threshold > 0)
  or (proxy_type = 'path_complete' and proxy_path_id is not null and proxy_threshold is null)
  or (proxy_type = 'prospects_count' and proxy_path_id is null and proxy_threshold is not null and proxy_threshold > 0)
  or (proxy_type = 'mind_training_modules_count' and proxy_path_id is not null and proxy_threshold is not null and proxy_threshold > 0)
  or (proxy_type = 'mind_training_path_complete' and proxy_path_id is not null and proxy_threshold is null)
);

-- ================= helper: "is this whole Mind Training path done" =================
-- Same completion rule as get_my_mind_training_paths' `complete` field
-- (0075/0076), narrowed to one member/one path instead of the whole hub
-- list -- kept as its own function so evaluate_rank_task_proxies below
-- doesn't have to re-embed that CTE. SECURITY DEFINER + no grant to
-- authenticated (mirrors evaluate_rank_task_proxies' own posture, and for
-- the same reason: it takes an arbitrary p_uid, so it must only ever be
-- called from another already-privileged function, never directly).
create or replace function public.is_mind_training_path_complete(p_uid uuid, p_path_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with items as (
    select l.id as item_id, 'lesson'::text as item_type, false as is_required,
      exists (select 1 from public.mind_training_lesson_progress lpr where lpr.lesson_id = l.id and lpr.uid = p_uid) as done
    from public.mind_training_lessons l
    join public.mind_training_modules m on m.id = l.module_id and m.published = true
    join public.mind_training_levels lv on lv.id = l.level_id and lv.published = true
    where l.published = true and lv.path_id = p_path_id
    union all
    select a.id, case when a.category in ('practical_task', 'challenge_day') then a.category else 'activity' end, a.is_required,
      exists (select 1 from public.mind_training_activity_progress apr where apr.activity_id = a.id and apr.uid = p_uid)
    from public.mind_training_activities a
    join public.mind_training_modules m on m.id = a.module_id and m.published = true
    join public.mind_training_levels lv on lv.id = m.level_id and lv.published = true
    where a.published = true and lv.path_id = p_path_id
    union all
    select asm.id, 'assessment', true,
      exists (select 1 from public.mind_training_assessment_attempts att where att.assessment_id = asm.id and att.uid = p_uid and att.passed = true)
    from public.mind_training_assessments asm
    join public.mind_training_modules m on m.id = asm.module_id and m.published = true
    join public.mind_training_levels lv on lv.id = m.level_id and lv.published = true
    where lv.path_id = p_path_id
  )
  select
    count(*) filter (where item_type = 'lesson') > 0
    and count(*) filter (where item_type = 'lesson' and not done) = 0
    and count(*) filter (where item_type = 'practical_task' and is_required and not done) = 0
    and count(*) filter (where item_type = 'challenge_day' and is_required and not done) = 0
    and count(*) filter (where item_type = 'assessment' and not done) = 0
  from items;
$$;

revoke execute on function public.is_mind_training_path_complete(uuid, uuid) from public, anon, authenticated;

-- ================= the detector: three more branches =================
create or replace function public.evaluate_rank_task_proxies(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rank_id uuid;
  v_task record;
  v_task_date date := current_date;
  v_existing_id uuid;
  v_count int;
  v_course_type_count int;
  v_incomplete_courses int;
  v_qualifies boolean;
begin
  select rank_id into v_rank_id from public.profiles where id = p_uid;
  if v_rank_id is null then
    return;
  end if;

  for v_task in
    select id, title, recurrence, proxy_type, proxy_path_id, proxy_threshold
    from public.rank_tasks
    where rank_id = v_rank_id and proxy_type <> 'manual'
  loop
    select id into v_existing_id
      from public.rank_task_submissions
      where rank_task_id = v_task.id and uid = p_uid
        and (v_task.recurrence = 'once' or task_date = v_task_date)
      limit 1;
    if v_existing_id is not null then
      continue;
    end if;

    v_qualifies := false;

    if v_task.proxy_type = 'modules_count' then
      -- A module counts once every one of its lessons is completed; daily
      -- tasks only count lessons the member completed *today*, same
      -- "resets every day" semantics as the manual daily flow.
      select count(*) into v_count
        from public.modules m
        join public.courses c on c.id = m.course_id
        where c.path_id = v_task.proxy_path_id and c.resource_type = 'course' and m.lesson_count > 0
          and m.lesson_count <= (
            select count(*) from public.lesson_progress lp
            where lp.uid = p_uid and lp.module_id = m.id and lp.status = 'completed'
              and (v_task.recurrence <> 'daily' or lp.completed_at::date = v_task_date)
          );
      v_qualifies := v_count >= v_task.proxy_threshold;

    elsif v_task.proxy_type = 'path_complete' then
      select count(*) into v_course_type_count
        from public.courses where path_id = v_task.proxy_path_id and resource_type = 'course' and lesson_count > 0;
      if v_course_type_count > 0 then
        select count(*) into v_incomplete_courses
          from public.courses c
          where c.path_id = v_task.proxy_path_id and c.resource_type = 'course' and c.lesson_count > 0
            and c.lesson_count > (
              select count(*) from public.lesson_progress lp
              where lp.uid = p_uid and lp.course_id = c.id and lp.status = 'completed'
            );
        v_qualifies := v_incomplete_courses = 0;
      end if;

    elsif v_task.proxy_type = 'prospects_count' then
      -- Deliberately not recurrence-gated the way modules_count is above --
      -- "added that day" is the whole point of this proxy regardless of
      -- whether the task itself resets daily or is a one-time "hit N in a
      -- single day" achievement.
      select count(*) into v_count
        from public.prospects
        where owner_uid = p_uid and created_at::date = v_task_date;
      v_qualifies := v_count >= v_task.proxy_threshold;

    elsif v_task.proxy_type = 'mind_training_modules_count' then
      -- A Mind Training module counts once every published lesson in it is
      -- done, every *required* activity in it is done, and its assessment
      -- (if any) is passed -- same per-module bar get_my_mind_training_
      -- paths' path-level `complete` field applies path-wide (0075/0076),
      -- just narrowed to one module. Empty modules (no lessons) never
      -- count. Daily tasks only count progress logged *today*, mirroring
      -- modules_count above.
      select count(*) into v_count
        from public.mind_training_modules m
        join public.mind_training_levels lv on lv.id = m.level_id and lv.published = true
        where lv.path_id = v_task.proxy_path_id and m.published = true
          and exists (select 1 from public.mind_training_lessons l2 where l2.module_id = m.id and l2.published = true)
          and not exists (
            select 1 from public.mind_training_lessons l
            where l.module_id = m.id and l.published = true
              and not exists (
                select 1 from public.mind_training_lesson_progress lpr
                where lpr.lesson_id = l.id and lpr.uid = p_uid
                  and (v_task.recurrence <> 'daily' or lpr.completed_at::date = v_task_date)
              )
          )
          and not exists (
            select 1 from public.mind_training_activities a
            where a.module_id = m.id and a.published = true and a.is_required
              and not exists (
                select 1 from public.mind_training_activity_progress apr
                where apr.activity_id = a.id and apr.uid = p_uid
                  and (v_task.recurrence <> 'daily' or apr.completed_at::date = v_task_date)
              )
          )
          and not exists (
            select 1 from public.mind_training_assessments asm
            where asm.module_id = m.id
              and not exists (
                select 1 from public.mind_training_assessment_attempts att
                where att.assessment_id = asm.id and att.uid = p_uid and att.passed = true
                  and (v_task.recurrence <> 'daily' or att.submitted_at::date = v_task_date)
              )
          );
      v_qualifies := v_count >= v_task.proxy_threshold;

    elsif v_task.proxy_type = 'mind_training_path_complete' then
      -- Lifetime completion, not recurrence-gated -- same as path_complete
      -- above (a finished path doesn't "un-finish" at midnight).
      v_qualifies := public.is_mind_training_path_complete(p_uid, v_task.proxy_path_id);
    end if;

    if not v_qualifies then
      continue;
    end if;

    insert into public.rank_task_submissions (rank_task_id, uid, task_date, status, submitted_at, reviewed_at, review_note)
    values (v_task.id, p_uid, v_task_date, 'approved', now(), now(), 'Tracked automatically from learning progress.')
    on conflict (rank_task_id, uid, task_date) do nothing;

    insert into public.notifications (uid, type, title, body, link_to)
    values (
      p_uid, 'rank_task_reviewed', 'Task completed 🎉',
      '"' || v_task.title || '" was completed automatically, based on your progress.',
      '/tasks'
    );

    insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
    values (p_uid, 'rank_task_auto_approved', 'rank_task_submission', v_task.id::text, jsonb_build_object('rank_task_id', v_task.id));
  end loop;
end;
$$;

-- ================= triggers: the new progress sources =================

-- Prospects: written only by add_prospect (0046) -- an insert is always a
-- brand-new prospect for its owner, so this fires unconditionally.
create or replace function public.trg_check_rank_task_proxies_prospect()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.evaluate_rank_task_proxies(new.owner_uid);
  return new;
end;
$$;

create trigger on_prospect_insert_check_rank_tasks
  after insert on public.prospects
  for each row execute function public.trg_check_rank_task_proxies_prospect();

-- Mind Training progress: all three tables are insert-only per member/item
-- (unique(uid, lesson_id) / unique(uid, activity_id), and every assessment
-- attempt is its own new row, 0066) -- unlike lesson_progress there's no
-- in-place status update to also watch, so a plain AFTER INSERT covers
-- every case. One shared function since all three tables carry `uid`
-- directly; the assessment-attempts trigger only fires when the attempt
-- actually passed, matching mind_training_path_complete's own "passed"
-- requirement above.
create or replace function public.trg_check_rank_task_proxies_mind_training()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.evaluate_rank_task_proxies(new.uid);
  return new;
end;
$$;

create trigger on_mind_training_lesson_progress_check_rank_tasks
  after insert on public.mind_training_lesson_progress
  for each row execute function public.trg_check_rank_task_proxies_mind_training();

create trigger on_mind_training_activity_progress_check_rank_tasks
  after insert on public.mind_training_activity_progress
  for each row execute function public.trg_check_rank_task_proxies_mind_training();

create trigger on_mind_training_assessment_attempt_check_rank_tasks
  after insert on public.mind_training_assessment_attempts
  for each row when (new.passed = true)
  execute function public.trg_check_rank_task_proxies_mind_training();

-- ================= admin CRUD: widen validation to the new types =================
create or replace function public.admin_create_rank_task(
  p_rank_id uuid, p_title text, p_description text, p_recurrence text,
  p_proxy_type text, p_proxy_path_id uuid, p_proxy_threshold int
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_next_order int;
  v_member record;
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'a task needs a title';
  end if;
  if p_recurrence not in ('once', 'daily') then
    raise exception 'invalid recurrence: %', p_recurrence;
  end if;
  if not exists (select 1 from public.ranks where id = p_rank_id) then
    raise exception 'rank not found';
  end if;

  p_proxy_type := coalesce(p_proxy_type, 'manual');
  if p_proxy_type not in ('manual', 'modules_count', 'path_complete', 'prospects_count', 'mind_training_modules_count', 'mind_training_path_complete') then
    raise exception 'invalid proxy type: %', p_proxy_type;
  end if;
  if p_proxy_type in ('modules_count', 'path_complete', 'mind_training_modules_count', 'mind_training_path_complete') and p_proxy_path_id is null then
    raise exception 'pick a learning path to track';
  end if;
  if p_proxy_type in ('modules_count', 'mind_training_modules_count') and coalesce(p_proxy_threshold, 0) < 1 then
    raise exception 'enter how many modules must be completed';
  end if;
  if p_proxy_type = 'prospects_count' and coalesce(p_proxy_threshold, 0) < 1 then
    raise exception 'enter how many prospects must be added';
  end if;
  if p_proxy_type not in ('modules_count', 'mind_training_modules_count', 'prospects_count') then
    p_proxy_threshold := null;
  end if;
  if p_proxy_type not in ('modules_count', 'path_complete', 'mind_training_modules_count', 'mind_training_path_complete') then
    p_proxy_path_id := null;
  end if;
  if p_proxy_path_id is not null and not exists (select 1 from public.learning_paths where id = p_proxy_path_id) then
    raise exception 'learning path not found';
  end if;

  select coalesce(max(order_index), 0) + 1 into v_next_order from public.rank_tasks where rank_id = p_rank_id;

  insert into public.rank_tasks (rank_id, title, description, recurrence, order_index, created_by, proxy_type, proxy_path_id, proxy_threshold)
  values (p_rank_id, trim(p_title), coalesce(p_description, ''), p_recurrence, v_next_order, auth.uid(), p_proxy_type, p_proxy_path_id, p_proxy_threshold)
  returning id into v_id;

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'rank_task_created', 'rank_task', v_id::text, jsonb_build_object('rank_id', p_rank_id));

  -- Retroactive check: a member already sitting on enough progress when
  -- this task is created shouldn't have to wait for their next lesson
  -- completion (or prospect, or Mind Training item) to see it land.
  if p_proxy_type <> 'manual' then
    for v_member in select id from public.profiles where rank_id = p_rank_id loop
      perform public.evaluate_rank_task_proxies(v_member.id);
    end loop;
  end if;

  return v_id;
end;
$$;

create or replace function public.admin_update_rank_task(
  p_id uuid, p_title text, p_description text, p_recurrence text, p_order_index int,
  p_proxy_type text, p_proxy_path_id uuid, p_proxy_threshold int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rank_id uuid;
  v_member record;
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'a task needs a title';
  end if;
  if p_recurrence not in ('once', 'daily') then
    raise exception 'invalid recurrence: %', p_recurrence;
  end if;
  select rank_id into v_rank_id from public.rank_tasks where id = p_id;
  if v_rank_id is null then
    raise exception 'task not found';
  end if;

  p_proxy_type := coalesce(p_proxy_type, 'manual');
  if p_proxy_type not in ('manual', 'modules_count', 'path_complete', 'prospects_count', 'mind_training_modules_count', 'mind_training_path_complete') then
    raise exception 'invalid proxy type: %', p_proxy_type;
  end if;
  if p_proxy_type in ('modules_count', 'path_complete', 'mind_training_modules_count', 'mind_training_path_complete') and p_proxy_path_id is null then
    raise exception 'pick a learning path to track';
  end if;
  if p_proxy_type in ('modules_count', 'mind_training_modules_count') and coalesce(p_proxy_threshold, 0) < 1 then
    raise exception 'enter how many modules must be completed';
  end if;
  if p_proxy_type = 'prospects_count' and coalesce(p_proxy_threshold, 0) < 1 then
    raise exception 'enter how many prospects must be added';
  end if;
  if p_proxy_type not in ('modules_count', 'mind_training_modules_count', 'prospects_count') then
    p_proxy_threshold := null;
  end if;
  if p_proxy_type not in ('modules_count', 'path_complete', 'mind_training_modules_count', 'mind_training_path_complete') then
    p_proxy_path_id := null;
  end if;
  if p_proxy_path_id is not null and not exists (select 1 from public.learning_paths where id = p_proxy_path_id) then
    raise exception 'learning path not found';
  end if;

  update public.rank_tasks
    set title = trim(p_title),
        description = coalesce(p_description, ''),
        recurrence = p_recurrence,
        order_index = coalesce(p_order_index, order_index),
        proxy_type = p_proxy_type,
        proxy_path_id = p_proxy_path_id,
        proxy_threshold = p_proxy_threshold,
        updated_at = now()
    where id = p_id;

  if p_proxy_type <> 'manual' then
    for v_member in select id from public.profiles where rank_id = v_rank_id loop
      perform public.evaluate_rank_task_proxies(v_member.id);
    end loop;
  end if;
end;
$$;
-- CREATE OR REPLACE on evaluate_rank_task_proxies/admin_create_rank_task/
-- admin_update_rank_task preserves their existing grants (same names, same
-- signatures) -- no new revoke/grant statements needed for those three.
