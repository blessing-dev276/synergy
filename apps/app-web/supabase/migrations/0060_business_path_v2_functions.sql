-- Business Path v2, part 3 of 3: the new admin RPCs, plus repointing every
-- dependent that used to read the now-dropped stage/rank-ladder machinery.
-- Builds on 0059's schema (ranks/rank_learning_paths/profiles.rank_id/
-- learning_paths.is_skill).
--
-- New, admin-only (mirror the current_role() = 'admin' guard style used
-- throughout this codebase, e.g. review_earning 0026): admin_list_ranks,
-- admin_create_rank, admin_update_rank, admin_delete_rank,
-- admin_set_rank_learning_paths, admin_set_member_rank,
-- admin_get_members_by_rank.
--
-- Rewritten (same name, new body): get_learning_paths (rank-visibility +
-- skill-hiding, no more `locked`), get_personally_sponsored/get_network/
-- get_network_overview (stageTitle now sourced from profiles.rank_id ->
-- ranks.title directly), compute_task_leaderboard (tasks category repointed
-- at individual content_assignments only -- see judgment call #1 below).
--
-- Untouched, not referenced anywhere in this file: get_my_content_assignments,
-- complete_content_assignment, submit_content_evidence, review_content_evidence,
-- is_content_assignment_done, content_assignment_unlocked -- the individual-
-- task feature, already fully isolated by 0054.

-- ================= admin: rank CRUD =================

-- ---------- admin: roster for the builder page's accordion list ----------
create or replace function public.admin_list_ranks()
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
      'id', r.id,
      'title', r.title,
      'orderIndex', r.order_index,
      'memberCount', (select count(*) from public.profiles p where p.rank_id = r.id),
      'pathCount', (select count(*) from public.rank_learning_paths rlp where rlp.rank_id = r.id)
    ) order by r.order_index)
    from public.ranks r
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.admin_list_ranks() from public, anon;
grant execute on function public.admin_list_ranks() to authenticated;

-- ---------- admin: create a rank (free text, appended to the end of the order) ----------
create or replace function public.admin_create_rank(p_title text)
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
    raise exception 'a rank needs a title';
  end if;

  select coalesce(max(order_index), 0) + 1 into v_next_order from public.ranks;

  insert into public.ranks (title, order_index, created_by)
  values (trim(p_title), v_next_order, auth.uid())
  returning id into v_id;

  insert into public.activity_log (actor_uid, action, target_type, target_id)
  values (auth.uid(), 'rank_created', 'rank', v_id::text);

  return v_id;
end;
$$;

revoke execute on function public.admin_create_rank(text) from public, anon;
grant execute on function public.admin_create_rank(text) to authenticated;

-- ---------- admin: rename / reorder a rank ----------
create or replace function public.admin_update_rank(p_id uuid, p_title text, p_order_index int)
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
    raise exception 'a rank needs a title';
  end if;
  if not exists (select 1 from public.ranks where id = p_id) then
    raise exception 'rank not found';
  end if;

  update public.ranks
    set title = trim(p_title), order_index = coalesce(p_order_index, order_index), updated_at = now()
    where id = p_id;

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'rank_updated', 'rank', p_id::text, jsonb_build_object('title', p_title, 'order_index', p_order_index));
end;
$$;

revoke execute on function public.admin_update_rank(uuid, text, int) from public, anon;
grant execute on function public.admin_update_rank(uuid, text, int) to authenticated;

-- ---------- admin: delete a rank ----------
-- rank_learning_paths rows cascade (0059); profiles.rank_id for anyone
-- holding this rank goes to null (0059's ON DELETE SET NULL). member_goals.
-- target_rank_id has no ON DELETE action (matches the original ranks/
-- business_path_levels FK, re-pointed below) -- deleting a rank someone has
-- set as their monthly goal target fails loudly with a real FK violation
-- rather than silently orphaning the goal, same as it always has.
create or replace function public.admin_delete_rank(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;
  if not exists (select 1 from public.ranks where id = p_id) then
    raise exception 'rank not found';
  end if;

  delete from public.ranks where id = p_id;

  insert into public.activity_log (actor_uid, action, target_type, target_id)
  values (auth.uid(), 'rank_deleted', 'rank', p_id::text);
end;
$$;

revoke execute on function public.admin_delete_rank(uuid) from public, anon;
grant execute on function public.admin_delete_rank(uuid) to authenticated;

-- ---------- admin: replace-all-in-one-call attach list for a rank ----------
-- Simplest shape for a checkbox-list UI: delete whatever's no longer
-- checked, insert whatever's newly checked, leave the rest alone. An empty/
-- null array clears every attachment for this rank (the `<> all` check is
-- vacuously true against an empty array, so every existing row is deleted).
create or replace function public.admin_set_rank_learning_paths(p_rank_id uuid, p_learning_path_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;
  if not exists (select 1 from public.ranks where id = p_rank_id) then
    raise exception 'rank not found';
  end if;

  delete from public.rank_learning_paths
    where rank_id = p_rank_id
      and learning_path_id <> all (coalesce(p_learning_path_ids, '{}'::uuid[]));

  insert into public.rank_learning_paths (rank_id, learning_path_id)
  select p_rank_id, lp_id
  from unnest(coalesce(p_learning_path_ids, '{}'::uuid[])) as lp_id
  on conflict (rank_id, learning_path_id) do nothing;

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'rank_learning_paths_set', 'rank', p_rank_id::text, jsonb_build_object('learning_path_ids', p_learning_path_ids));
end;
$$;

revoke execute on function public.admin_set_rank_learning_paths(uuid, uuid[]) from public, anon;
grant execute on function public.admin_set_rank_learning_paths(uuid, uuid[]) to authenticated;

-- ---------- admin: set a member's rank directly ----------
-- No member-initiated request/approval step (already the case today). Mirrors
-- set_member_stage's (0011/0013, now-dropped) notification-insert shape --
-- same public.notifications columns, only notified when the new rank
-- actually resolves to a title (i.e. p_rank_id is non-null and valid).
create or replace function public.admin_set_member_rank(p_uid uuid, p_rank_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_role text;
  v_rank_title text;
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;

  select role into v_member_role from public.profiles where id = p_uid;
  if v_member_role is distinct from 'member' then
    raise exception 'target % is not a member', p_uid;
  end if;

  if p_rank_id is not null then
    select title into v_rank_title from public.ranks where id = p_rank_id;
    if v_rank_title is null then
      raise exception 'rank not found';
    end if;
  end if;

  update public.profiles set rank_id = p_rank_id where id = p_uid;

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'member_rank_set', 'profile', p_uid::text, jsonb_build_object('rank_id', p_rank_id));

  if v_rank_title is not null then
    insert into public.notifications (uid, type, title, body, link_to)
    values (p_uid, 'rank_changed', 'Your rank was updated', 'You''re now: ' || v_rank_title, '/dashboard');
  end if;
end;
$$;

revoke execute on function public.admin_set_member_rank(uuid, uuid) from public, anon;
grant execute on function public.admin_set_member_rank(uuid, uuid) to authenticated;

-- ---------- admin: flat member roster with rank, for the "members in this rank" panel ----------
-- No filter param -- the plan's builder page filters this list client-side
-- per expanded rank.
create or replace function public.admin_get_members_by_rank()
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
      'email', p.email,
      'rankId', p.rank_id,
      'rankTitle', r.title
    ) order by p.display_name)
    from public.profiles p
    left join public.ranks r on r.id = p.rank_id
    where p.role = 'member' and p.status = 'active'
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.admin_get_members_by_rank() from public, anon;
grant execute on function public.admin_get_members_by_rank() to authenticated;

-- ================= rewritten: get_learning_paths =================

-- ---------- member-facing catalog: rank-attached paths + always-unattached ones ----------
-- A path is included if it has zero rows in rank_learning_paths (unattached,
-- visible to everyone -- 0047's convention, reused) or one of its rows
-- matches the caller's own rank_id. NM-only members additionally lose any
-- included path where is_skill = true. `locked` is gone entirely -- a path
-- is either in the list or it isn't, never shown-but-locked.
--
-- Also restores the `section` field: 0049 added it to this function's return
-- shape (PathList.jsx's tab filter reads p.section), but 0053's business-path
-- repoint of this same function was written against 0047's pre-0049 body and
-- silently dropped it -- a real, already-live regression (every learning-path
-- tab has been filtering against `undefined` since 0053 shipped) that has
-- nothing to do with this rebuild but is trivial to fix while this exact
-- function is already being rewritten, so it's restored here rather than
-- carried forward.
create or replace function public.get_learning_paths()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rank_id uuid;
  v_path text;
begin
  select rank_id, coalesce(participation_path, 'full') into v_rank_id, v_path
    from public.profiles where id = v_uid;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', lp.id,
      'title', lp.title,
      'description', lp.description,
      'courseCount', lp.course_count,
      'section', lp.section
    ) order by lp.order_index)
    from public.learning_paths lp
    where lp.published = true
      and (v_path <> 'network_marketing_only' or not lp.is_skill)
      and (
        not exists (select 1 from public.rank_learning_paths rlp where rlp.learning_path_id = lp.id)
        or exists (
          select 1 from public.rank_learning_paths rlp
          where rlp.learning_path_id = lp.id and rlp.rank_id = v_rank_id
        )
      )
  ), '[]'::jsonb);
end;
$$;
-- CREATE OR REPLACE preserves the existing grants from 0047 (same name, same
-- signature) -- no new revoke/grant statements needed.

-- ================= repointed dependents: stageTitle -> ranks.title =================

-- ---------- direct downline (1-hop), with an overdue-task signal per member ----------
-- Mirrors 0053's final body. `stageTitle` keeps its JSON key name (per the
-- plan -- nothing on the frontend needs to change for this field) but now
-- reads straight off profiles.rank_id -> ranks.title, no intermediate
-- "current stage" table. overdueTaskCount collapses to the individual pool
-- only -- ranks + attached paths carry no due dates or "required" concept
-- (judgment call #1, see compute_task_leaderboard below for the fuller
-- version of this same note).
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
      'stageTitle', r.title,
      'overdueTaskCount', (
        select count(*)
        from public.content_assignments ca
        where ca.scope = 'individual' and ca.assigned_to_uid = p.id and ca.is_required = true
          and ca.due_date is not null and ca.due_date < now()
          and not public.is_content_assignment_done(ca.id, p.id)
      )
    ) order by p.created_at desc)
    from public.sponsor_relationships sr
    join public.profiles p on p.id = sr.member_uid
    left join public.ranks r on r.id = p.rank_id
    where sr.sponsor_uid = p_uid and sr.active = true
  ), '[]'::jsonb);
end;
$$;

-- ---------- full downline tree (recursive CTE), depth-capped ----------
-- Mirrors 0053's final body (itself get_network's only-ever definition since
-- 0019). Same stageTitle repoint as above.
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
      'stageTitle', r.title,
      'joinedAt', p.created_at
    ) order by d.depth, p.created_at)
    from downline d
    join public.profiles p on p.id = d.member_uid
    left join public.ranks r on r.id = p.rank_id
  ), '[]'::jsonb);
end;
$$;

-- ---------- network-wide aggregate stats for the member Network dashboard ----------
-- Mirrors 0053's final body. rank/rankStatus/milestones stay explicit
-- placeholders, exactly as before -- no compensation plan exists, this was
-- never wired to Journey/Business Path.
--
-- inTrainingCount/completedTrainingCount are NOT named in the plan's 0060
-- section (only "their stageTitle display join changes" is) -- the plan
-- text is scoped to that one field, but this function's "final stage"
-- concept (in v1: last published business_path_stage by order_index) has
-- the same shape problem judgment call #1 flags for compute_task_leaderboard:
-- ranks carry no fixed ladder or "final rung" concept anymore, admins can
-- create/reorder them freely. This mechanically repoints the same query
-- shape at ranks.order_index (highest order_index = "top rank", same as the
-- old "last published stage" pick) rather than dropping the fields --
-- flagged here for reconsideration same as judgment call #1, since a rank
-- ladder's "top rank" is a much looser stand-in for "training complete"
-- than a designed stage sequence was.
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
  final_rank as (
    select id from public.ranks order by order_index desc limit 1
  ),
  enriched as (
    select p.id, p.status, p.rank_id,
      exists (
        select 1 from public.content_assignments ca
        where ca.scope = 'individual' and ca.assigned_to_uid = p.id and ca.is_required = true
          and ca.due_date is not null and ca.due_date < now()
          and not public.is_content_assignment_done(ca.id, p.id)
      ) as has_overdue
    from downline d
    join public.profiles p on p.id = d.member_uid
  )
  select jsonb_build_object(
    'personallySponsoredCount', v_personal_count,
    'networkSize', count(*),
    'activeCount', count(*) filter (where status = 'active'),
    'inactiveCount', count(*) filter (where status <> 'active'),
    'inTrainingCount', count(*) filter (where rank_id is not null and rank_id is distinct from (select id from final_rank)),
    'completedTrainingCount', count(*) filter (where rank_id is not null and rank_id = (select id from final_rank)),
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

-- ---------- weekly leaderboard (0026): tasks category, repointed a 2nd time ----------
-- Judgment call #1 (plan): the Task Completion category's old data source
-- (business_path_placements/member_business_path_stage, due-dated stage
-- curriculum) is gone entirely -- ranks + attached paths carry no due dates
-- or "required" concept at all. The only remaining data source with due
-- dates is the individual per-member task-assignment feature (content_
-- assignments where scope='individual', kept untouched throughout), so this
-- repoints the category to score against that instead of removing it
-- outright. Flag for reconsideration if that's not the right call -- this is
-- byte-for-byte 0028's compute_task_leaderboard_v2 body (the last version
-- that scored individual assignments only, before 0051 added the business-
-- path pool).
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
    with weekly_assignments as (
      select ca.assigned_to_uid as uid, ca.id
      from public.content_assignments ca
      where ca.scope = 'individual' and ca.is_required = true
        and ca.due_date >= p_week_start and ca.due_date < v_week_end
    ),
    scored as (
      select uid,
        count(*) as tasks_total,
        count(*) filter (where public.is_content_assignment_done(id, uid)) as tasks_done
      from weekly_assignments
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
-- CREATE OR REPLACE preserves the existing grants from 0026 (same name, same
-- signature) -- no new revoke/grant statements needed for any of the 4
-- repointed functions above (get_personally_sponsored/get_network/
-- get_network_overview/compute_task_leaderboard), same as 0053's own choice.

-- ================= member_goals.target_rank_id: re-point at the new ranks =================

-- Still a meaningful "goal: reach rank X" reference, just against free-form
-- admin ranks instead of a fixed ladder. No ON DELETE action, matching the
-- column's original definition (0039) and its 0053 repoint -- deleting a
-- rank someone has set as their goal target fails loudly rather than
-- silently orphaning the goal.
alter table public.member_goals add constraint member_goals_target_rank_id_fkey
  foreign key (target_rank_id) references public.ranks(id);
