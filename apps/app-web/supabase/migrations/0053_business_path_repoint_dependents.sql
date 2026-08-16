-- Business Path rebuild, part 4 of 7: repoint dependents. These functions
-- keep their existing names (CREATE OR REPLACE, same signatures, same
-- grants per 0030's precedent) -- only their bodies change, to read the new
-- business_path_* tables instead of member_journey/stages/tracks/ranks.
--
-- Also repoints handle_new_user (0036) -- not explicitly listed in the plan's
-- "Repoint dependents" section, but it directly INSERTs into member_journey
-- to auto-assign a member's first stage on signup. Left unrepointed, this
-- trigger would start throwing "relation does not exist" on every single
-- signup the moment 0055 drops member_journey/stages -- a real, live outage,
-- not a hypothetical, so it's included here alongside the functions the
-- plan does name.

-- ---------- direct downline (1-hop), with a training-journey signal per member ----------
-- Mirrors get_personally_sponsored (0030's final body). overdueTaskCount now
-- sums two independent counts -- individual content_assignments (untouched)
-- plus business_path_placements for the member's current stage -- instead of
-- one query spanning both scopes of a single table.
create or replace function public.get_personally_sponsored(p_uid uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if p_uid <> auth.uid() and coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id,
      'displayName', p.display_name,
      'status', p.status,
      'photoUrl', p.photo_url,
      'joinedAt', p.created_at,
      'stageTitle', s.title,
      'overdueTaskCount', (
        select count(*)
        from public.content_assignments ca
        where ca.scope = 'individual' and ca.assigned_to_uid = p.id and ca.is_required = true
          and ca.due_date is not null and ca.due_date < now()
          and not public.is_content_assignment_done(ca.id, p.id)
      ) + (
        select count(*)
        from public.business_path_placements bp
        where bp.stage_id = mbs.current_stage_id and bp.is_required = true
          and bp.due_date is not null and bp.due_date < now()
          and not public.is_business_path_placement_done(bp.id, p.id)
      )
    ) order by p.created_at desc)
    from public.sponsor_relationships sr
    join public.profiles p on p.id = sr.member_uid
    left join public.member_business_path_stage mbs on mbs.uid = p.id
    left join public.business_path_stages s on s.id = mbs.current_stage_id
    where sr.sponsor_uid = p_uid and sr.active = true
  ), '[]'::jsonb);
end;
$$;

-- ---------- full downline tree (recursive CTE), depth-capped ----------
-- Mirrors get_network (0019 -- its only-ever definition; never redefined by
-- the 0027-0030 content-model cutover, confirmed via grep).
create or replace function public.get_network(p_uid uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if p_uid <> auth.uid() and coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied';
  end if;

  return coalesce((
    with recursive downline as (
      select sr.member_uid, sr.sponsor_uid, 1 as depth
        from public.sponsor_relationships sr
        where sr.sponsor_uid = p_uid and sr.active = true
      union all
      select sr.member_uid, sr.sponsor_uid, d.depth + 1
        from public.sponsor_relationships sr
        join downline d on sr.sponsor_uid = d.member_uid
        where sr.active = true and d.depth < 25
    )
    select jsonb_agg(jsonb_build_object(
      'id', p.id,
      'displayName', p.display_name,
      'status', p.status,
      'sponsorUid', d.sponsor_uid,
      'depth', d.depth,
      'stageTitle', s.title,
      'joinedAt', p.created_at
    ) order by d.depth, p.created_at)
    from downline d
    join public.profiles p on p.id = d.member_uid
    left join public.member_business_path_stage mbs on mbs.uid = p.id
    left join public.business_path_stages s on s.id = mbs.current_stage_id
  ), '[]'::jsonb);
end;
$$;

-- ---------- network-wide aggregate stats for the member Network dashboard ----------
-- Mirrors get_network_overview (0030's final body). rank/rankStatus/
-- milestones stay explicit placeholders, exactly as before -- no
-- compensation plan exists, this was never wired to Journey/Business Path.
create or replace function public.get_network_overview(p_uid uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_personal_count int;
  v_result jsonb;
begin
  if p_uid <> auth.uid() and coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied';
  end if;

  select count(*) into v_personal_count
    from public.sponsor_relationships where sponsor_uid = p_uid and active = true;

  with recursive downline as (
    select sr.member_uid, 1 as depth from public.sponsor_relationships sr
      where sr.sponsor_uid = p_uid and sr.active = true
    union all
    select sr.member_uid, d.depth + 1
      from public.sponsor_relationships sr
      join downline d on sr.sponsor_uid = d.member_uid
      where sr.active = true and d.depth < 25
  ),
  final_stage as (
    select id from public.business_path_stages where published = true order by order_index desc limit 1
  ),
  enriched as (
    select p.id, p.status, mbs.current_stage_id,
      (
        exists (
          select 1 from public.content_assignments ca
          where ca.scope = 'individual' and ca.assigned_to_uid = p.id and ca.is_required = true
            and ca.due_date is not null and ca.due_date < now()
            and not public.is_content_assignment_done(ca.id, p.id)
        )
        or exists (
          select 1 from public.business_path_placements bp
          where bp.stage_id = mbs.current_stage_id and bp.is_required = true
            and bp.due_date is not null and bp.due_date < now()
            and not public.is_business_path_placement_done(bp.id, p.id)
        )
      ) as has_overdue
    from downline d
    join public.profiles p on p.id = d.member_uid
    left join public.member_business_path_stage mbs on mbs.uid = p.id
  )
  select jsonb_build_object(
    'personallySponsoredCount', v_personal_count,
    'networkSize', count(*),
    'activeCount', count(*) filter (where status = 'active'),
    'inactiveCount', count(*) filter (where status <> 'active'),
    'inTrainingCount', count(*) filter (where current_stage_id is not null and current_stage_id is distinct from (select id from final_stage)),
    'completedTrainingCount', count(*) filter (where current_stage_id is not null and current_stage_id = (select id from final_stage)),
    'membersWithOverdueTasks', count(*) filter (where has_overdue),
    'rank', null,
    'rankStatus', 'not_configured',
    'milestones', '[]'::jsonb
  ) into v_result
  from enriched;

  return coalesce(v_result, jsonb_build_object(
    'personallySponsoredCount', v_personal_count, 'networkSize', 0, 'activeCount', 0,
    'inactiveCount', 0, 'inTrainingCount', 0, 'completedTrainingCount', 0,
    'membersWithOverdueTasks', 0, 'rank', null, 'rankStatus', 'not_configured', 'milestones', '[]'::jsonb
  ));
end;
$$;

-- ---------- weekly leaderboard (0026): tasks category, repointed ----------
-- Mirrors compute_task_leaderboard (0030's final body). Combines the
-- individual and business-path pools via a 'source' discriminator column so
-- a single `scored` CTE can still dispatch to the right "done" check per
-- row, same shape as the original single-table union.
create or replace function public.compute_task_leaderboard(p_week_start timestamptz)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_week_end timestamptz := p_week_start + interval '7 days';
begin
  return coalesce((
    with weekly_placements as (
      select ca.assigned_to_uid as uid, ca.id, 'individual'::text as source
      from public.content_assignments ca
      where ca.scope = 'individual' and ca.is_required = true
        and ca.due_date >= p_week_start and ca.due_date < v_week_end
      union all
      select mbs.uid, bp.id, 'business_path'::text as source
      from public.business_path_placements bp
      join public.member_business_path_stage mbs on mbs.current_stage_id = bp.stage_id
      where bp.is_required = true
        and bp.due_date >= p_week_start and bp.due_date < v_week_end
    ),
    scored as (
      select uid,
        count(*) as tasks_total,
        count(*) filter (
          where (source = 'individual' and public.is_content_assignment_done(id, uid))
             or (source = 'business_path' and public.is_business_path_placement_done(id, uid))
        ) as tasks_done
      from weekly_placements
      group by uid
    )
    select jsonb_agg(jsonb_build_object(
      'uid', p.id,
      'displayName', p.display_name,
      'photoUrl', p.photo_url,
      'tasksTotal', s.tasks_total,
      'tasksDone', s.tasks_done,
      'completionPercent', round((s.tasks_done::numeric / s.tasks_total) * 100)
    ) order by (s.tasks_done::numeric / s.tasks_total) desc, s.tasks_done desc, p.display_name)
    from scored s
    join public.profiles p on p.id = s.uid
    where s.tasks_total > 0
  ), '[]'::jsonb);
end;
$$;

-- ---------- Learning catalog: lock computed against the new specialization gate ----------
-- Mirrors get_learning_paths (0047), repointed to is_business_path_specialization_unlocked.
create or replace function public.get_learning_paths()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', lp.id,
      'title', lp.title,
      'description', lp.description,
      'courseCount', lp.course_count,
      'specializationId', lp.specialization_id,
      'locked', lp.specialization_id is not null and not public.is_business_path_specialization_unlocked(auth.uid(), lp.specialization_id)
    ) order by lp.order_index)
    from public.learning_paths lp
    where lp.published = true
  ), '[]'::jsonb);
end;
$$;

-- ---------- signup trigger: auto-assign first Business Path stage ----------
-- Mirrors handle_new_user (0036's final body), repointed at
-- member_business_path_stage/business_path_stages. See this file's header
-- for why this repoint is included even though the plan's "Repoint
-- dependents" list doesn't name it explicitly.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sponsor_uid uuid;
  v_claimed_name text;
  v_first_stage_id uuid;
begin
  begin
    v_sponsor_uid := nullif(new.raw_user_meta_data->>'sponsor_uid', '')::uuid;
  exception when others then
    v_sponsor_uid := null;
  end;

  if v_sponsor_uid is not null and not exists (
    select 1 from public.profiles where id = v_sponsor_uid and status = 'active'
  ) then
    v_sponsor_uid := null;
  end if;

  v_claimed_name := nullif(trim(new.raw_user_meta_data->>'claimed_sponsor_name'), '');

  insert into public.profiles (id, display_name, email, sponsor_uid, whatsapp_number, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', ''),
    new.email,
    v_sponsor_uid,
    coalesce(new.raw_user_meta_data->>'whatsapp_number', ''),
    'pending'
  )
  on conflict (id) do nothing;

  if v_sponsor_uid is not null then
    insert into public.sponsor_relationships (member_uid, sponsor_uid, source, active, assigned_at)
    values (new.id, v_sponsor_uid, 'signup', true, now());
  elsif v_claimed_name is not null then
    insert into public.sponsor_requests (member_uid, claimed_sponsor_name, status)
    values (new.id, v_claimed_name, 'pending');
  end if;

  select id into v_first_stage_id from public.business_path_stages where published = true order by order_index limit 1;
  if v_first_stage_id is not null then
    insert into public.member_business_path_stage (uid, current_stage_id, started_at, updated_at)
    values (new.id, v_first_stage_id, now(), now())
    on conflict (uid) do nothing;
  end if;

  return new;
end;
$$;
-- Trigger on_auth_user_created (0003) already points at this function by
-- name; CREATE OR REPLACE is enough, no need to redeclare the trigger.
-- CREATE OR REPLACE preserves every grant above (same names, same
-- signatures throughout this file) -- no new revoke/grant statements needed.

-- ================= repoint FKs at the new tables =================
-- Default constraint names (neither was explicitly named when created),
-- confirmed by reading how each was declared originally. The new tables
-- start empty, but the old columns aren't guaranteed to be -- e.g. an admin
-- had already set a specialization requirement on a real learning_paths row.
-- Null out anything that would violate the new FK rather than assume a
-- clean slate, matching the SET NULL semantics this repoint already intends.

update public.member_goals mg
  set target_rank_id = null
  where mg.target_rank_id is not null
    and not exists (select 1 from public.business_path_levels l where l.id = mg.target_rank_id);

alter table public.member_goals drop constraint member_goals_target_rank_id_fkey;
alter table public.member_goals add constraint member_goals_target_rank_id_fkey
  foreign key (target_rank_id) references public.business_path_levels(id);

update public.learning_paths lp
  set specialization_id = null
  where lp.specialization_id is not null
    and not exists (select 1 from public.business_path_specializations s where s.id = lp.specialization_id);

alter table public.learning_paths drop constraint learning_paths_specialization_id_fkey;
alter table public.learning_paths add constraint learning_paths_specialization_id_fkey
  foreign key (specialization_id) references public.business_path_specializations(id);
