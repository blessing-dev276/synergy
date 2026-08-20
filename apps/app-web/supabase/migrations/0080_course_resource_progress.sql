-- Every rank task using proxy_type = 'path_complete' against a path made
-- entirely of standalone resources (video/book/podcast/link/pdf --
-- ContentBuilder.jsx's RESOURCE_TYPES, 0057ish) could never fire: the
-- proxy only ever checked structured courses (resource_type = 'course')
-- against lesson_progress, and there was no completion signal of any kind
-- for a standalone resource -- opening one just opens a modal or a new
-- tab, nothing written anywhere. Confirmed live: 5 of Prospect rank's
-- tasks track paths built entirely from 'video' resources and can never
-- auto-approve for any member.
--
-- Fix: a lightweight per-member "viewed" record for standalone resources
-- (course_progress, RPC-only writes, same posture as lesson_progress/
-- mind_training_*_progress), fired the moment a member opens one
-- (PathDetail.jsx) -- self-attested, same trust level as every other
-- proxy and manual task in this app, not a watch-duration/read-receipt
-- system. path_complete's "is this path done" check now requires every
-- published resource in the path to be done, whichever kind it is.

-- ================= course_progress: standalone-resource "viewed" record =================
create table public.course_progress (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  unique (uid, course_id)
);
create index course_progress_uid_idx on public.course_progress (uid);

alter table public.course_progress enable row level security;
grant select on public.course_progress to authenticated;
create policy course_progress_select on public.course_progress for select
  using (uid = auth.uid() or public.current_role() = 'admin');
-- No insert/update/delete grant at all -- mark_course_resource_viewed below
-- is the only way a row lands here, same as mind_training_lesson_progress.

create or replace function public.mark_course_resource_viewed(p_course_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resource_type text;
  v_published boolean;
begin
  if not public.is_active() then
    raise exception 'your account is suspended and can''t record progress';
  end if;

  select resource_type, published into v_resource_type, v_published
    from public.courses where id = p_course_id;
  if v_resource_type is null then
    raise exception 'resource not found';
  end if;
  if v_resource_type = 'course' then
    raise exception 'structured courses are tracked through their lessons, not this';
  end if;
  if not v_published then
    raise exception 'this resource is not published';
  end if;

  insert into public.course_progress (uid, course_id, viewed_at)
  values (auth.uid(), p_course_id, now())
  on conflict (uid, course_id) do nothing;
end;
$$;

revoke execute on function public.mark_course_resource_viewed(uuid) from public, anon;
grant execute on function public.mark_course_resource_viewed(uuid) to authenticated;

create or replace function public.trg_check_rank_task_proxies_course_progress()
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

create trigger on_course_progress_check_rank_tasks
  after insert on public.course_progress
  for each row execute function public.trg_check_rank_task_proxies_course_progress();

-- ================= evaluate_rank_task_proxies: path_complete covers standalone resources too =================
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
  v_total_resources int;
  v_incomplete_resources int;
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
      -- A resource counts toward the total if it's something that can
      -- actually be completed: a structured course with at least one
      -- lesson (an empty course-in-progress never blocks completion, same
      -- exclusion as before this migration), or any standalone resource
      -- (video/book/podcast/link/pdf).
      select count(*) into v_total_resources
        from public.courses c
        where c.path_id = v_task.proxy_path_id and c.published = true
          and (c.resource_type <> 'course' or c.lesson_count > 0);
      if v_total_resources > 0 then
        select count(*) into v_incomplete_resources
          from public.courses c
          where c.path_id = v_task.proxy_path_id and c.published = true
            and (
              (c.resource_type = 'course' and c.lesson_count > 0 and c.lesson_count > (
                select count(*) from public.lesson_progress lp
                where lp.uid = p_uid and lp.course_id = c.id and lp.status = 'completed'
              ))
              or (c.resource_type <> 'course' and not exists (
                select 1 from public.course_progress cp where cp.uid = p_uid and cp.course_id = c.id
              ))
            );
        v_qualifies := v_incomplete_resources = 0;
      end if;

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
end;
$$;
-- CREATE OR REPLACE on evaluate_rank_task_proxies preserves its existing
-- grants (same name, same signature) -- no new revoke/grant needed for it.
