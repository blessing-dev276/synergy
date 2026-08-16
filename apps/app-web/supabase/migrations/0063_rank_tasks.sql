-- Rank Tasks: an admin defines tasks per rank -- some one-time, some daily-
-- recurring -- and every member currently in that rank sees them. A member
-- marks one done with a plain checkbox (product decision: no evidence text/
-- file, unlike the individual per-member task feature's submit_content_
-- evidence). The checkbox alone doesn't auto-count though -- an admin still
-- approves or rejects each submission, since nothing stops a member from
-- checking a box they didn't actually do. The notification every admin gets
-- on submission links straight at that member's full profile
-- (MemberDetail.jsx, /admin/members/:uid) so there's something concrete to
-- weigh the claim against while deciding.

-- ---------- rank_tasks: what an admin assigns to a rank ----------
create table public.rank_tasks (
  id uuid primary key default gen_random_uuid(),
  rank_id uuid not null references public.ranks(id) on delete cascade,
  title text not null,
  description text default '',
  recurrence text not null check (recurrence in ('once', 'daily')),
  order_index int not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index rank_tasks_rank_idx on public.rank_tasks (rank_id, order_index);

alter table public.rank_tasks enable row level security;
grant select on public.rank_tasks to authenticated;
create policy rank_tasks_select on public.rank_tasks for select using (auth.uid() is not null);
-- no client insert/update/delete grant -- SECURITY DEFINER RPCs only, same
-- no-client-write convention ranks/rank_learning_paths use (0059).

-- ---------- rank_task_submissions: a member's checkbox + admin's verdict ----------
create table public.rank_task_submissions (
  id uuid primary key default gen_random_uuid(),
  rank_task_id uuid not null references public.rank_tasks(id) on delete cascade,
  uid uuid not null references public.profiles(id) on delete cascade,
  task_date date not null default current_date,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text default ''
);
-- Same-day double-submit safety net under concurrent clicks -- the real
-- "can't resubmit a 'once' task ever" rule is enforced in submit_rank_task
-- below (it can't be a plain constraint since it depends on the task's
-- recurrence, a different table's column); this index just backstops the
-- 'daily' case, which a bare uniqueness rule *can* express directly.
create unique index rank_task_submissions_unique_per_day on public.rank_task_submissions (rank_task_id, uid, task_date);
create index rank_task_submissions_status_idx on public.rank_task_submissions (status, submitted_at);

alter table public.rank_task_submissions enable row level security;
grant select on public.rank_task_submissions to authenticated;
create policy rank_task_submissions_select on public.rank_task_submissions for select
  using (uid = auth.uid() or public.current_role() = 'admin');
-- no client insert/update grant -- written only by submit_rank_task /
-- review_rank_task_submission below.

-- ================= admin: rank task CRUD =================

create or replace function public.admin_create_rank_task(p_rank_id uuid, p_title text, p_description text, p_recurrence text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_next_order int;
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

  select coalesce(max(order_index), 0) + 1 into v_next_order from public.rank_tasks where rank_id = p_rank_id;

  insert into public.rank_tasks (rank_id, title, description, recurrence, order_index, created_by)
  values (p_rank_id, trim(p_title), coalesce(p_description, ''), p_recurrence, v_next_order, auth.uid())
  returning id into v_id;

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'rank_task_created', 'rank_task', v_id::text, jsonb_build_object('rank_id', p_rank_id));

  return v_id;
end;
$$;

revoke execute on function public.admin_create_rank_task(uuid, text, text, text) from public, anon;
grant execute on function public.admin_create_rank_task(uuid, text, text, text) to authenticated;

create or replace function public.admin_update_rank_task(p_id uuid, p_title text, p_description text, p_recurrence text, p_order_index int)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
  if not exists (select 1 from public.rank_tasks where id = p_id) then
    raise exception 'task not found';
  end if;

  update public.rank_tasks
    set title = trim(p_title),
        description = coalesce(p_description, ''),
        recurrence = p_recurrence,
        order_index = coalesce(p_order_index, order_index),
        updated_at = now()
    where id = p_id;
end;
$$;

revoke execute on function public.admin_update_rank_task(uuid, text, text, text, int) from public, anon;
grant execute on function public.admin_update_rank_task(uuid, text, text, text, int) to authenticated;

create or replace function public.admin_delete_rank_task(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;
  delete from public.rank_tasks where id = p_id;
end;
$$;

revoke execute on function public.admin_delete_rank_task(uuid) from public, anon;
grant execute on function public.admin_delete_rank_task(uuid) to authenticated;

-- ================= member: view + submit rank tasks =================

-- For a 'once' task, `submission` is whatever the member's one-ever row is
-- (there can only be one, enforced below). For a 'daily' task, `submission`
-- only reflects *today's* row, so a task submitted yesterday reads as
-- unsubmitted again today -- that's the actual "resets daily" behavior.
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
    select jsonb_agg(jsonb_build_object(
      'id', t.id,
      'title', t.title,
      'description', t.description,
      'recurrence', t.recurrence,
      'submission', (
        select jsonb_build_object('id', s.id, 'status', s.status, 'submittedAt', s.submitted_at, 'reviewNote', s.review_note)
        from public.rank_task_submissions s
        where s.rank_task_id = t.id and s.uid = v_uid
          and (t.recurrence = 'once' or s.task_date = current_date)
        order by s.submitted_at desc
        limit 1
      )
    ) order by t.order_index)
    from public.rank_tasks t
    where t.rank_id = v_rank_id
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
  v_display_name text;
  v_existing_id uuid;
  v_existing_status text;
  v_id uuid;
  v_admin record;
begin
  select rank_id into v_rank_id from public.profiles where id = v_uid;

  select rank_id, recurrence, title into v_task_rank_id, v_recurrence, v_title
    from public.rank_tasks where id = p_rank_task_id;

  if v_task_rank_id is null then
    raise exception 'task not found';
  end if;
  if v_rank_id is null or v_rank_id <> v_task_rank_id then
    raise exception 'this task is not assigned to your rank';
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

-- ================= admin: review a submission =================

create or replace function public.review_rank_task_submission(p_submission_id uuid, p_decision text, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_status text;
  v_title text;
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'invalid decision: %', p_decision;
  end if;

  select s.uid, s.status, t.title into v_uid, v_status, v_title
    from public.rank_task_submissions s
    join public.rank_tasks t on t.id = s.rank_task_id
    where s.id = p_submission_id;

  if v_uid is null then
    raise exception 'submission not found';
  end if;
  if v_status <> 'pending' then
    raise exception 'this submission has already been reviewed';
  end if;

  update public.rank_task_submissions
    set status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(), review_note = coalesce(p_note, '')
    where id = p_submission_id;

  insert into public.notifications (uid, type, title, body, link_to)
  values (
    v_uid, 'rank_task_reviewed',
    case when p_decision = 'approved' then 'Task approved 🎉' else 'Task not approved' end,
    case when p_decision = 'approved'
      then '"' || v_title || '" was approved.'
      else coalesce(nullif(p_note, ''), 'An admin could not validate this submission.')
    end,
    '/tasks'
  );

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'rank_task_reviewed', 'rank_task_submission', p_submission_id::text, jsonb_build_object('decision', p_decision));
end;
$$;

revoke execute on function public.review_rank_task_submission(uuid, text, text) from public, anon;
grant execute on function public.review_rank_task_submission(uuid, text, text) to authenticated;
