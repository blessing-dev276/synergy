-- Threshold-based auto-tracked tasks (modules_count/prospects_count/
-- mind_training_modules_count) were purely binary to a member: nothing
-- showed where they actually stood against the threshold (e.g. "2 of 3
-- prospects added"), even though evaluate_rank_task_proxies recomputes
-- the real count on every qualifying action -- that count just never left
-- the function. Extracting each proxy type's count into its own reusable
-- function so evaluate_rank_task_proxies' pass/fail check and
-- get_my_rank_tasks' progress display both read the same number instead
-- of two copies of the same SQL drifting apart.

-- ================= count_prospects_added_today =================
-- Deliberately not recurrence-gated (mirrors the inline query it
-- replaces, 0080's comment on prospects_count): "added today" is the
-- whole point of this proxy regardless of whether the task itself resets
-- daily or is a one-time "hit N in a single day" achievement.
create or replace function public.count_prospects_added_today(p_uid uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.prospects where owner_uid = p_uid and created_at::date = current_date;
$$;

revoke execute on function public.count_prospects_added_today(uuid) from public, anon, authenticated;

-- ================= count_modules_completed =================
-- p_daily_only mirrors modules_count's own "daily tasks only count
-- lessons completed *today*" rule (0065) -- true for a daily task, false
-- (lifetime) for a one-time one.
create or replace function public.count_modules_completed(p_uid uuid, p_path_id uuid, p_daily_only boolean)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
    from public.modules m
    join public.courses c on c.id = m.course_id
    where c.path_id = p_path_id and c.resource_type = 'course' and m.lesson_count > 0
      and m.lesson_count <= (
        select count(*) from public.lesson_progress lp
        where lp.uid = p_uid and lp.module_id = m.id and lp.status = 'completed'
          and (not p_daily_only or lp.completed_at::date = current_date)
      );
$$;

revoke execute on function public.count_modules_completed(uuid, uuid, boolean) from public, anon, authenticated;

-- ================= count_mind_training_modules_completed =================
create or replace function public.count_mind_training_modules_completed(p_uid uuid, p_path_id uuid, p_daily_only boolean)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
    from public.mind_training_modules m
    join public.mind_training_levels lv on lv.id = m.level_id and lv.published = true
    where lv.path_id = p_path_id and m.published = true
      and exists (select 1 from public.mind_training_lessons l2 where l2.module_id = m.id and l2.published = true)
      and not exists (
        select 1 from public.mind_training_lessons l
        where l.module_id = m.id and l.published = true
          and not exists (
            select 1 from public.mind_training_lesson_progress lpr
            where lpr.lesson_id = l.id and lpr.uid = p_uid
              and (not p_daily_only or lpr.completed_at::date = current_date)
          )
      )
      and not exists (
        select 1 from public.mind_training_activities a
        where a.module_id = m.id and a.published = true and a.is_required
          and not exists (
            select 1 from public.mind_training_activity_progress apr
            where apr.activity_id = a.id and apr.uid = p_uid
              and (not p_daily_only or apr.completed_at::date = current_date)
          )
      )
      and not exists (
        select 1 from public.mind_training_assessments asm
        where asm.module_id = m.id
          and not exists (
            select 1 from public.mind_training_assessment_attempts att
            where att.assessment_id = asm.id and att.uid = p_uid and att.passed = true
              and (not p_daily_only or att.submitted_at::date = current_date)
          )
      );
$$;

revoke execute on function public.count_mind_training_modules_completed(uuid, uuid, boolean) from public, anon, authenticated;

-- ================= evaluate_rank_task_proxies: use the shared counters =================
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
      v_count := public.count_modules_completed(p_uid, v_task.proxy_path_id, v_task.recurrence = 'daily');
      v_qualifies := v_count >= v_task.proxy_threshold;

    elsif v_task.proxy_type = 'path_complete' then
      v_qualifies := public.is_regular_path_complete(p_uid, v_task.proxy_path_id);

    elsif v_task.proxy_type = 'prospects_count' then
      v_count := public.count_prospects_added_today(p_uid);
      v_qualifies := v_count >= v_task.proxy_threshold;

    elsif v_task.proxy_type = 'mind_training_modules_count' then
      v_count := public.count_mind_training_modules_completed(p_uid, v_task.proxy_path_id, v_task.recurrence = 'daily');
      v_qualifies := v_count >= v_task.proxy_threshold;

    elsif v_task.proxy_type = 'mind_training_path_complete' then
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

  perform public.evaluate_rank_advancement(p_uid);
end;
$$;
-- CREATE OR REPLACE on evaluate_rank_task_proxies preserves its existing
-- grants (same name, same signature) -- no new revoke/grant needed for it.

-- ================= get_my_rank_tasks: + threshold progress =================
-- proxyThreshold/progress are only meaningful (non-null) for the three
-- threshold proxy types -- path_complete/mind_training_path_complete stay
-- null, same as manual, since "is this whole path done" has no partial
-- count to show.
create or replace function public.get_my_rank_tasks()
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
  if v_rank_id is null then
    return '[]'::jsonb;
  end if;

  return coalesce((
    with my_tasks as (
      select
        t.id, t.title, t.description, t.recurrence, t.proxy_type, t.proxy_path_id, t.proxy_threshold, t.order_index,
        (
          select jsonb_build_object('id', s.id, 'status', s.status, 'submittedAt', s.submitted_at, 'reviewNote', s.review_note)
          from public.rank_task_submissions s
          where s.rank_task_id = t.id and s.uid = v_uid
            and (t.recurrence = 'once' or s.task_date = current_date)
          order by s.submitted_at desc
          limit 1
        ) as submission
      from public.rank_tasks t
      where t.rank_id = v_rank_id
    )
    select jsonb_agg(jsonb_build_object(
      'id', id, 'title', title, 'description', description, 'recurrence', recurrence,
      'proxyType', proxy_type, 'proxyPathId', proxy_path_id, 'submission', submission,
      'proxyThreshold', case when proxy_type in ('modules_count', 'prospects_count', 'mind_training_modules_count') then proxy_threshold end,
      'progress', case proxy_type
        when 'modules_count' then public.count_modules_completed(v_uid, proxy_path_id, recurrence = 'daily')
        when 'prospects_count' then public.count_prospects_added_today(v_uid)
        when 'mind_training_modules_count' then public.count_mind_training_modules_completed(v_uid, proxy_path_id, recurrence = 'daily')
        else null
      end
    ) order by order_index)
    from my_tasks
    where not (recurrence = 'once' and coalesce(submission->>'status', '') = 'approved')
  ), '[]'::jsonb);
end;
$$;
-- CREATE OR REPLACE preserves existing grants (same name, same signature).
