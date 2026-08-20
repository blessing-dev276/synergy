-- Rank advancement now gets a real member->admin handoff, same shape as
-- the old (dropped, 0058) stage_promotion_requests (0025) but rebuilt for
-- the current free-form ranks system and fully automatic rather than
-- member-initiated: the moment every learning path attached to a
-- member's current rank is 100% complete, a request is filed and every
-- admin is notified, no button for the member to press.
--
-- "100% complete" means every path in rank_learning_paths for their rank
-- is fully done -- Mind Training paths via the existing
-- is_mind_training_path_complete (0078), everything else (skill_set/
-- nm_business) via a new sibling below that extracts the exact same
-- check evaluate_rank_task_proxies' path_complete branch already used
-- inline (0080) into its own function, so both call one source of truth
-- instead of drifting apart.
--
-- Auto-fire reuses every trigger evaluate_rank_task_proxies already runs
-- on (lesson_progress, prospects, mind_training_*_progress,
-- course_progress, 0065/0078/0080) by calling evaluate_rank_advancement
-- from the end of that same function -- no new triggers needed.

-- ================= is_regular_path_complete: skill_set/nm_business path completion =================
create or replace function public.is_regular_path_complete(p_uid uuid, p_path_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select count(*) from public.courses c
       where c.path_id = p_path_id and c.published = true
         and (c.resource_type <> 'course' or c.lesson_count > 0)) > 0
    and
    (select count(*) from public.courses c
       where c.path_id = p_path_id and c.published = true
         and (
           (c.resource_type = 'course' and c.lesson_count > 0 and c.lesson_count > (
             select count(*) from public.lesson_progress lp
             where lp.uid = p_uid and lp.course_id = c.id and lp.status = 'completed'
           ))
           or (c.resource_type <> 'course' and not exists (
             select 1 from public.course_progress cp where cp.uid = p_uid and cp.course_id = c.id
           ))
         )) = 0,
    false
  );
$$;

revoke execute on function public.is_regular_path_complete(uuid, uuid) from public, anon, authenticated;

-- evaluate_rank_task_proxies' path_complete branch now just calls the
-- function above instead of embedding the same CTE inline -- identical
-- behavior, one source of truth. (Full function body needed since
-- CREATE OR REPLACE replaces the whole thing; every other branch is
-- unchanged from 0080, plus the new evaluate_rank_advancement call at
-- the very end.)
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
      v_qualifies := public.is_regular_path_complete(p_uid, v_task.proxy_path_id);

    elsif v_task.proxy_type = 'prospects_count' then
      select count(*) into v_count
        from public.prospects
        where owner_uid = p_uid and created_at::date = v_task_date;
      v_qualifies := v_count >= v_task.proxy_threshold;

    elsif v_task.proxy_type = 'mind_training_modules_count' then
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

-- ================= rank_advancement_requests =================
create table public.rank_advancement_requests (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references public.profiles(id) on delete cascade,
  from_rank_id uuid references public.ranks(id),
  to_rank_id uuid not null references public.ranks(id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text default ''
);
-- One open request at a time per member, same pattern as
-- stage_promotion_requests (0025) / sponsor_requests (0018).
create unique index rank_advancement_requests_uid_pending_uidx on public.rank_advancement_requests (uid) where (status = 'pending');
create index rank_advancement_requests_status_idx on public.rank_advancement_requests (status, requested_at desc);

alter table public.rank_advancement_requests enable row level security;
grant select on public.rank_advancement_requests to authenticated;
create policy rank_advancement_requests_select on public.rank_advancement_requests for select
  using (uid = auth.uid() or public.current_role() = 'admin');
-- No client insert/update grant -- written only by evaluate_rank_advancement
-- (auto, below) and review_rank_advancement_request (admin decision, below).

-- ================= evaluate_rank_advancement: the auto-fire itself =================
create or replace function public.evaluate_rank_advancement(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rank_id uuid;
  v_rank_order int;
  v_to_rank_id uuid;
  v_to_rank_title text;
  v_total_paths int;
  v_incomplete_paths int;
  v_display_name text;
  v_admin record;
begin
  select rank_id into v_rank_id from public.profiles where id = p_uid;
  if v_rank_id is null then
    return;
  end if;

  if exists (select 1 from public.rank_advancement_requests where uid = p_uid and status = 'pending') then
    return;
  end if;

  select order_index into v_rank_order from public.ranks where id = v_rank_id;

  select id, title into v_to_rank_id, v_to_rank_title
    from public.ranks where order_index > v_rank_order
    order by order_index limit 1;
  if v_to_rank_id is null then
    return;
  end if;

  select count(*) into v_total_paths from public.rank_learning_paths where rank_id = v_rank_id;
  if v_total_paths = 0 then
    return;
  end if;

  select count(*) into v_incomplete_paths
    from public.rank_learning_paths rlp
    join public.learning_paths lp on lp.id = rlp.learning_path_id
    where rlp.rank_id = v_rank_id
      and not (
        case when lp.section = 'mind_training'
          then public.is_mind_training_path_complete(p_uid, lp.id)
          else public.is_regular_path_complete(p_uid, lp.id)
        end
      );
  if v_incomplete_paths > 0 then
    return;
  end if;

  insert into public.rank_advancement_requests (uid, from_rank_id, to_rank_id, status)
  values (p_uid, v_rank_id, v_to_rank_id, 'pending');

  select display_name into v_display_name from public.profiles where id = p_uid;

  for v_admin in select id from public.profiles where role = 'admin' loop
    insert into public.notifications (uid, type, title, body, link_to)
    values (
      v_admin.id, 'rank_advancement_requested', 'Rank advancement request',
      coalesce(nullif(v_display_name, ''), 'A member') || ' finished every learning path for their rank and is ready for: ' || v_to_rank_title,
      '/admin/submissions'
    );
  end loop;

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (p_uid, 'rank_advancement_requested', 'profile', p_uid::text, jsonb_build_object('toRankId', v_to_rank_id));
end;
$$;

revoke execute on function public.evaluate_rank_advancement(uuid) from public, anon, authenticated;

-- ================= admin: approve or reject a pending request =================
create or replace function public.review_rank_advancement_request(p_request_id uuid, p_decision text, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_to_rank_id uuid;
  v_status text;
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'invalid decision: %', p_decision;
  end if;

  select uid, to_rank_id, status into v_uid, v_to_rank_id, v_status
    from public.rank_advancement_requests where id = p_request_id;
  if v_uid is null then
    raise exception 'advancement request not found';
  end if;
  if v_status <> 'pending' then
    raise exception 'this request has already been reviewed';
  end if;

  update public.rank_advancement_requests
    set status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(), review_note = coalesce(p_note, '')
    where id = p_request_id;

  if p_decision = 'approved' then
    -- Composes admin_set_member_rank (0060) so its own notification/
    -- activity-log behavior stays the single source of truth for "your
    -- rank changed," not duplicated here.
    perform public.admin_set_member_rank(v_uid, v_to_rank_id);
  else
    insert into public.notifications (uid, type, title, body, link_to)
    values (
      v_uid, 'rank_advancement_rejected', 'Rank advancement declined',
      coalesce(nullif(p_note, ''), 'An admin reviewed your request and asked you to keep working on your current rank.'),
      '/dashboard'
    );
  end if;

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'rank_advancement_reviewed', 'rank_advancement_request', p_request_id::text, jsonb_build_object('decision', p_decision));
end;
$$;

revoke execute on function public.review_rank_advancement_request(uuid, text, text) from public, anon;
grant execute on function public.review_rank_advancement_request(uuid, text, text) to authenticated;
