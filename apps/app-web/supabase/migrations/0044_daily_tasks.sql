-- Daily task engine. There's no scheduler (no pg_cron) in this project (see
-- 0026's header) so "today's tasks" can't be a cron-populated table. Instead:
-- generate-on-first-visit-per-day, persisted in daily_task_selections, so
-- the list is stable for the rest of that day (members see the same tasks
-- all day, checking them off) rather than being randomly recomputed on
-- every page load. Completion status is still read live off
-- is_content_assignment_done, so "done" reflects reality immediately.
--
-- Selection pulls from the same eligible pool as get_my_content_assignments
-- (0043's participation_path-aware version, itself built on 0038's
-- is_specialization_unlocked gate): all outstanding individual placements
-- (capped), plus up to a few per active track in the member's current stage
-- -- mirroring the spec's worked example of a mixed
-- Skill/Freelancing/Network-Marketing daily list.

create table public.daily_task_selections (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references public.profiles(id) on delete cascade,
  task_date date not null,
  content_assignment_id uuid not null references public.content_assignments(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (uid, task_date, content_assignment_id)
);
create index daily_task_selections_uid_date_idx on public.daily_task_selections (uid, task_date);

alter table public.daily_task_selections enable row level security;
grant select on public.daily_task_selections to authenticated;
create policy daily_task_selections_select on public.daily_task_selections for select
  using (uid = auth.uid() or public.current_role() = 'admin');
-- no client insert/update/delete grant: written only by get_or_generate_daily_tasks.

create or replace function public.get_or_generate_daily_tasks(p_uid uuid, p_date date default current_date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stage_id uuid;
  v_path text;
  v_already_generated boolean;
  v_track record;
  v_ca record;
  v_picked int;
  v_per_track_cap constant int := 3;
  v_individual_cap constant int := 5;
begin
  if p_uid <> auth.uid() and coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied';
  end if;

  select exists(select 1 from public.daily_task_selections where uid = p_uid and task_date = p_date)
    into v_already_generated;

  if not v_already_generated then
    select current_stage_id into v_stage_id from public.member_journey where uid = p_uid;
    select coalesce(participation_path, 'full') into v_path from public.profiles where id = p_uid;

    v_picked := 0;
    for v_ca in
      select ca.id from public.content_assignments ca
      where ca.scope = 'individual' and ca.assigned_to_uid = p_uid
      order by ca.due_date nulls last, ca.order_index
    loop
      exit when v_picked >= v_individual_cap;
      if not public.is_content_assignment_done(v_ca.id, p_uid) and public.content_assignment_unlocked(v_ca.id, p_uid) then
        insert into public.daily_task_selections (uid, task_date, content_assignment_id)
        values (p_uid, p_date, v_ca.id)
        on conflict (uid, task_date, content_assignment_id) do nothing;
        v_picked := v_picked + 1;
      end if;
    end loop;

    if v_stage_id is not null then
      for v_track in
        select t.id, t.key from public.stage_tracks st
        join public.tracks t on t.id = st.track_id
        where st.stage_id = v_stage_id and (v_path = 'full' or t.key not in ('skill', 'freelancing'))
      loop
        v_picked := 0;
        for v_ca in
          select ca.id from public.content_assignments ca
          where ca.scope = 'stage_track' and ca.stage_id = v_stage_id and ca.track_id = v_track.id
            and (ca.specialization_id is null or public.is_specialization_unlocked(p_uid, ca.specialization_id))
          order by ca.due_date nulls last, ca.order_index
        loop
          exit when v_picked >= v_per_track_cap;
          if not public.is_content_assignment_done(v_ca.id, p_uid) and public.content_assignment_unlocked(v_ca.id, p_uid) then
            insert into public.daily_task_selections (uid, task_date, content_assignment_id)
            values (p_uid, p_date, v_ca.id)
            on conflict (uid, task_date, content_assignment_id) do nothing;
            v_picked := v_picked + 1;
          end if;
        end loop;
      end loop;
    end if;

    insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
    values (p_uid, 'daily_tasks_generated', 'daily_task_selections', p_uid::text, jsonb_build_object('date', p_date));
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', ca.id,
      'title', coalesce(ci.title, c.title, a.title),
      'description', coalesce(ci.description, c.description, a.instructions, ''),
      'taskType', ca.task_type,
      'xpReward', ca.xp_reward,
      'isRequired', ca.is_required,
      'scope', ca.scope,
      'contentType', ci.content_type,
      'requiresAdminApproval', ca.requires_admin_approval,
      'evidenceStatus', (
        select ces.status from public.content_evidence_submissions ces
        where ces.content_assignment_id = ca.id and ces.uid = p_uid
      ),
      'dueDate', ca.due_date,
      'trackKey', tr.key,
      'trackLabel', tr.label,
      'trackIcon', tr.icon,
      'isDone', public.is_content_assignment_done(ca.id, p_uid)
    ) order by tr.key nulls last, ca.due_date nulls last, ca.order_index)
    from public.daily_task_selections dts
    join public.content_assignments ca on ca.id = dts.content_assignment_id
    join public.content_items ci on ci.id = ca.content_item_id
    left join public.courses c on c.id = ci.course_id
    left join public.assignments a on a.id = ci.assignment_id
    left join public.tracks tr on tr.id = ca.track_id
    where dts.uid = p_uid and dts.task_date = p_date
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.get_or_generate_daily_tasks(uuid, date) from public, anon;
grant execute on function public.get_or_generate_daily_tasks(uuid, date) to authenticated;

-- get_admin_progression_overview: add today's task engagement so an admin
-- can answer "who completed today's tasks" without opening every profile.
-- Deliberately does NOT call get_or_generate_daily_tasks (that would
-- generate a list on a member's behalf just because an admin looked) --
-- 0/0 for a member who hasn't opened the app today is itself a real signal.
create or replace function public.get_admin_progression_overview()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'uid', p.id,
      'displayName', p.display_name,
      'photoUrl', p.photo_url,
      'participationPath', p.participation_path,
      'rank', case when r.id is null then null else jsonb_build_object('id', r.id, 'label', r.label) end,
      'rankProgressPercent', public.compute_rank_progress(p.id, r.id),
      'stage', case when s.id is null then null else jsonb_build_object('id', s.id, 'title', s.title) end,
      'trackProgress', (
        select coalesce(jsonb_object_agg(t.key, public.compute_track_progress(p.id, s.id, t.id)), '{}'::jsonb)
        from public.stage_tracks st
        join public.tracks t on t.id = st.track_id
        where st.stage_id = s.id
          and (p.participation_path = 'full' or t.key not in ('skill', 'freelancing'))
      ),
      'overdueCount', (
        select count(*) from public.content_assignments ca
        join public.tracks tr on tr.id = ca.track_id
        where ca.is_required = true and ca.due_date is not null and ca.due_date < now()
          and not public.is_content_assignment_done(ca.id, p.id)
          and (
            (ca.scope = 'individual' and ca.assigned_to_uid = p.id)
            or (
              ca.scope = 'stage_track' and ca.stage_id = s.id
              and (p.participation_path = 'full' or tr.key not in ('skill', 'freelancing'))
              and (ca.specialization_id is null or public.is_specialization_unlocked(p.id, ca.specialization_id))
            )
          )
      ),
      'pendingReviewCount',
        (select count(*) from public.assignment_submissions where uid = p.id and status = 'submitted')
        + (select count(*) from public.content_evidence_submissions where uid = p.id and status = 'submitted'),
      'sponsoredCount', (select count(*) from public.sponsor_relationships where sponsor_uid = p.id and active = true),
      'todayTasksTotal', (select count(*) from public.daily_task_selections where uid = p.id and task_date = current_date),
      'todayTasksDone', (
        select count(*) from public.daily_task_selections dts
        where dts.uid = p.id and dts.task_date = current_date
          and public.is_content_assignment_done(dts.content_assignment_id, p.id)
      )
    ) order by p.display_name)
    from public.profiles p
    left join public.member_journey mj on mj.uid = p.id
    left join public.stages s on s.id = mj.current_stage_id
    left join public.ranks r on r.id = s.rank_id
    where p.role = 'member' and p.status = 'active'
  ), '[]'::jsonb);
end;
$$;
