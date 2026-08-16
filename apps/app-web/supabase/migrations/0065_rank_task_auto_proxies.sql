-- Rank tasks: auto-tracked completion (0063_rank_tasks.sql gave every task
-- a plain self-report checkbox + admin review; this adds an alternative --
-- an admin can instead point a task at real learning-progress data, and the
-- system files (and, since there's nothing to weigh a claim against, also
-- approves) the submission itself the moment the member actually hits it.
-- 'manual' tasks are untouched -- still checkbox + admin review, same as
-- before. This also closes the "approved one-time task should never come
-- back" gap: get_my_rank_tasks now drops those from the list entirely
-- rather than leaving a permanent "Approved" row in place.

alter table public.rank_tasks
  add column proxy_type text not null default 'manual'
    check (proxy_type in ('manual', 'modules_count', 'path_complete')),
  add column proxy_path_id uuid references public.learning_paths(id) on delete set null,
  add column proxy_threshold int;

alter table public.rank_tasks add constraint rank_tasks_proxy_shape check (
  (proxy_type = 'manual' and proxy_path_id is null and proxy_threshold is null)
  or (proxy_type = 'modules_count' and proxy_path_id is not null and proxy_threshold is not null and proxy_threshold > 0)
  or (proxy_type = 'path_complete' and proxy_path_id is not null and proxy_threshold is null)
);

-- ================= the detector =================

-- Checks every non-manual task in p_uid's rank against their real progress
-- and auto-files (as 'approved') any that now qualify and don't already
-- have a submission for the current period ('once': ever: 'daily': today).
-- Internal only -- no grant to authenticated, on purpose: it's invoked from
-- the lesson_progress trigger below (where p_uid is always auth.uid(), the
-- member whose own progress just changed) and from the admin rank-task
-- RPCs further down (a retroactive check after an admin creates/edits an
-- auto task, so it isn't blind to progress a member already made before
-- the task existed). Nothing else needs to call it, so unlike the CRUD
-- RPCs in this file there's no permission check inside -- callers already
-- control who p_uid can be.
--
-- Only resource_type='course' entries in a learning path have any
-- completion tracking (0057_course_resource_types.sql -- a 'video'/'book'/
-- 'podcast'/'link'/'pdf' entry is just an outbound link, no lesson rows
-- ever get created for it), so both checks below only ever look at course
-- entries and silently ignore the rest of the path.
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
      '"' || v_task.title || '" was completed automatically, based on your learning progress.',
      '/tasks'
    );

    insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
    values (p_uid, 'rank_task_auto_approved', 'rank_task_submission', v_task.id::text, jsonb_build_object('rank_task_id', v_task.id));
  end loop;
end;
$$;

create or replace function public.trg_check_rank_task_proxies()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    perform public.evaluate_rank_task_proxies(new.uid);
  end if;
  return new;
end;
$$;

create trigger on_lesson_progress_check_rank_tasks
  after insert or update on public.lesson_progress
  for each row execute function public.trg_check_rank_task_proxies();

-- ================= admin: rank task CRUD (now proxy-aware) =================

drop function if exists public.admin_create_rank_task(uuid, text, text, text);

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
  if coalesce(p_proxy_type, 'manual') not in ('manual', 'modules_count', 'path_complete') then
    raise exception 'invalid proxy type: %', p_proxy_type;
  end if;
  if p_proxy_type in ('modules_count', 'path_complete') and p_proxy_path_id is null then
    raise exception 'pick a learning path to track';
  end if;
  if p_proxy_type = 'modules_count' and coalesce(p_proxy_threshold, 0) < 1 then
    raise exception 'enter how many modules must be completed';
  end if;
  if p_proxy_type <> 'modules_count' then
    p_proxy_threshold := null;
  end if;
  if p_proxy_type <> 'manual' and p_proxy_path_id is not null and not exists (select 1 from public.learning_paths where id = p_proxy_path_id) then
    raise exception 'learning path not found';
  end if;
  if coalesce(p_proxy_type, 'manual') = 'manual' then
    p_proxy_path_id := null;
    p_proxy_threshold := null;
  end if;

  select coalesce(max(order_index), 0) + 1 into v_next_order from public.rank_tasks where rank_id = p_rank_id;

  insert into public.rank_tasks (rank_id, title, description, recurrence, order_index, created_by, proxy_type, proxy_path_id, proxy_threshold)
  values (p_rank_id, trim(p_title), coalesce(p_description, ''), p_recurrence, v_next_order, auth.uid(), coalesce(p_proxy_type, 'manual'), p_proxy_path_id, p_proxy_threshold)
  returning id into v_id;

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'rank_task_created', 'rank_task', v_id::text, jsonb_build_object('rank_id', p_rank_id));

  -- Retroactive check: a member already sitting on enough progress when
  -- this task is created shouldn't have to wait for their next lesson
  -- completion to see it land.
  if coalesce(p_proxy_type, 'manual') <> 'manual' then
    for v_member in select id from public.profiles where rank_id = p_rank_id loop
      perform public.evaluate_rank_task_proxies(v_member.id);
    end loop;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.admin_create_rank_task(uuid, text, text, text, text, uuid, int) from public, anon;
grant execute on function public.admin_create_rank_task(uuid, text, text, text, text, uuid, int) to authenticated;

drop function if exists public.admin_update_rank_task(uuid, text, text, text, int);

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
  if coalesce(p_proxy_type, 'manual') not in ('manual', 'modules_count', 'path_complete') then
    raise exception 'invalid proxy type: %', p_proxy_type;
  end if;
  if p_proxy_type in ('modules_count', 'path_complete') and p_proxy_path_id is null then
    raise exception 'pick a learning path to track';
  end if;
  if p_proxy_type = 'modules_count' and coalesce(p_proxy_threshold, 0) < 1 then
    raise exception 'enter how many modules must be completed';
  end if;
  if p_proxy_type <> 'modules_count' then
    p_proxy_threshold := null;
  end if;
  if p_proxy_type <> 'manual' and p_proxy_path_id is not null and not exists (select 1 from public.learning_paths where id = p_proxy_path_id) then
    raise exception 'learning path not found';
  end if;
  if coalesce(p_proxy_type, 'manual') = 'manual' then
    p_proxy_path_id := null;
    p_proxy_threshold := null;
  end if;

  update public.rank_tasks
    set title = trim(p_title),
        description = coalesce(p_description, ''),
        recurrence = p_recurrence,
        order_index = coalesce(p_order_index, order_index),
        proxy_type = coalesce(p_proxy_type, 'manual'),
        proxy_path_id = p_proxy_path_id,
        proxy_threshold = p_proxy_threshold,
        updated_at = now()
    where id = p_id;

  if coalesce(p_proxy_type, 'manual') <> 'manual' then
    for v_member in select id from public.profiles where rank_id = v_rank_id loop
      perform public.evaluate_rank_task_proxies(v_member.id);
    end loop;
  end if;
end;
$$;

revoke execute on function public.admin_update_rank_task(uuid, text, text, text, int, text, uuid, int) from public, anon;
grant execute on function public.admin_update_rank_task(uuid, text, text, text, int, text, uuid, int) to authenticated;

-- ================= member: view + submit rank tasks (proxy-aware) =================

-- Same shape as before plus `proxyType` (so the frontend can hide the
-- manual "Mark done" control for auto-tracked tasks), and a completed
-- 'once' task now drops out of the list entirely instead of sticking
-- around forever with an "Approved" badge -- it's done, there's nothing
-- left to look at.
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
        t.id, t.title, t.description, t.recurrence, t.proxy_type, t.order_index,
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
      'proxyType', proxy_type, 'submission', submission
    ) order by order_index)
    from my_tasks
    where not (recurrence = 'once' and submission->>'status' = 'approved')
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.get_my_rank_tasks() from public, anon;
grant execute on function public.get_my_rank_tasks() to authenticated;

create or replace function public.submit_rank_task(p_rank_task_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rank_id uuid;
  v_task_rank_id uuid;
  v_recurrence text;
  v_title text;
  v_proxy_type text;
  v_display_name text;
  v_existing_id uuid;
  v_existing_status text;
  v_id uuid;
  v_admin record;
begin
  select rank_id into v_rank_id from public.profiles where id = v_uid;

  select rank_id, recurrence, title, proxy_type into v_task_rank_id, v_recurrence, v_title, v_proxy_type
    from public.rank_tasks where id = p_rank_task_id;

  if v_task_rank_id is null then
    raise exception 'task not found';
  end if;
  if v_rank_id is null or v_rank_id <> v_task_rank_id then
    raise exception 'this task is not assigned to your rank';
  end if;
  if v_proxy_type <> 'manual' then
    raise exception 'this task is tracked automatically from your learning progress — there''s nothing to submit';
  end if;

  -- 'once' tasks look at any row ever; 'daily' tasks only look at today's
  -- row. Either way, a prior 'rejected' row is reused (reset back to
  -- pending) rather than blocking or inserting a second row for the same
  -- day -- the latter would violate rank_task_submissions_unique_per_day,
  -- and a member should always be able to try again after a rejection.
  select id, status into v_existing_id, v_existing_status
    from public.rank_task_submissions
    where rank_task_id = p_rank_task_id and uid = v_uid
      and (v_recurrence = 'once' or task_date = current_date)
    order by submitted_at desc
    limit 1;

  if v_existing_id is not null and v_existing_status <> 'rejected' then
    raise exception 'you have already submitted this task%', case when v_recurrence = 'daily' then ' today' else '' end;
  end if;

  if v_existing_id is not null then
    update public.rank_task_submissions
      set status = 'pending', submitted_at = now(), task_date = current_date,
          reviewed_by = null, reviewed_at = null, review_note = ''
      where id = v_existing_id
      returning id into v_id;
  else
    insert into public.rank_task_submissions (rank_task_id, uid, task_date, status, submitted_at)
    values (p_rank_task_id, v_uid, current_date, 'pending', now())
    returning id into v_id;
  end if;

  select display_name into v_display_name from public.profiles where id = v_uid;

  for v_admin in select id from public.profiles where role = 'admin' loop
    insert into public.notifications (uid, type, title, body, link_to)
    values (
      v_admin.id, 'rank_task_submitted', 'Task submitted for review',
      coalesce(nullif(v_display_name, ''), 'A member') || ' marked "' || v_title || '" done — review their profile to validate.',
      '/admin/members/' || v_uid::text
    );
  end loop;

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (v_uid, 'rank_task_submitted', 'rank_task_submission', v_id::text, jsonb_build_object('rank_task_id', p_rank_task_id));
end;
$$;

revoke execute on function public.submit_rank_task(uuid) from public, anon;
grant execute on function public.submit_rank_task(uuid) to authenticated;
