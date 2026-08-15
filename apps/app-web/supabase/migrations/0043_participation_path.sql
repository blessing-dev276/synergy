-- Participation path: some members already have a reliable income source and
-- choose to focus on Network Marketing only, rather than Skill+Freelancing+NM.
-- Product decision: this is admin-controlled, not member self-service — a
-- member can ask, but only an admin's decision actually changes what content
-- they see (prevents self-exempting from freelancing work). Mirrors
-- sponsor_requests/stage_promotion_requests' "member requests, admin
-- resolves" shape (0018/0025).
--
-- The business track ('business' = Network Marketing) is never excluded --
-- it's core to every member regardless of path. Only 'skill'/'freelancing'
-- are conditionally hidden.
--
-- Every function below that touches content_assignments is rebuilt on top of
-- 0038's specialization-lock rewrite (is_specialization_unlocked as the one
-- shared gate, 'locked' field on each specialization) -- this file only adds
-- the participation_path filter alongside it, it does not revert 0038.

alter table public.profiles add column participation_path text not null default 'full'
  check (participation_path in ('full', 'network_marketing_only'));

create table public.participation_path_requests (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references public.profiles(id) on delete cascade,
  requested_path text not null check (requested_path in ('full', 'network_marketing_only')),
  reason text default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text default '',
  created_at timestamptz not null default now()
);
create unique index participation_path_requests_uid_pending_uidx on public.participation_path_requests (uid) where (status = 'pending');
create index participation_path_requests_status_idx on public.participation_path_requests (status, created_at desc);

alter table public.participation_path_requests enable row level security;
grant select on public.participation_path_requests to authenticated;
create policy participation_path_requests_select on public.participation_path_requests for select
  using (uid = auth.uid() or public.current_role() = 'admin');
-- no client insert/update grant: written only by request_participation_path /
-- review_participation_path_request / admin_set_participation_path below.

-- ---------- member: ask to switch path ----------
create or replace function public.request_participation_path(p_requested_path text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_current text;
begin
  if p_requested_path not in ('full', 'network_marketing_only') then
    raise exception 'invalid participation path: %', p_requested_path;
  end if;

  select participation_path into v_current from public.profiles where id = v_uid;
  if v_current = p_requested_path then
    raise exception 'you are already on that path';
  end if;

  if exists (select 1 from public.participation_path_requests where uid = v_uid and status = 'pending') then
    raise exception 'you already have a pending request';
  end if;

  insert into public.participation_path_requests (uid, requested_path, reason, status)
  values (v_uid, p_requested_path, coalesce(p_reason, ''), 'pending');

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (v_uid, 'participation_path_requested', 'profile', v_uid::text, jsonb_build_object('requestedPath', p_requested_path));
end;
$$;

revoke execute on function public.request_participation_path(text, text) from public, anon;
grant execute on function public.request_participation_path(text, text) to authenticated;

-- ---------- admin: set a member's path directly (with or without a pending request) ----------
create or replace function public.admin_set_participation_path(p_uid uuid, p_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;
  if p_path not in ('full', 'network_marketing_only') then
    raise exception 'invalid participation path: %', p_path;
  end if;
  if not exists (select 1 from public.profiles where id = p_uid) then
    raise exception 'member not found';
  end if;

  update public.profiles set participation_path = p_path where id = p_uid;

  insert into public.notifications (uid, type, title, body, link_to)
  values (
    p_uid, 'participation_path_changed', 'Your focus was updated',
    case when p_path = 'network_marketing_only'
      then 'An admin set your focus to Network Marketing only.'
      else 'An admin set your focus back to Skill + Freelancing + Network Marketing.'
    end,
    '/dashboard'
  );

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'participation_path_set', 'profile', p_uid::text, jsonb_build_object('path', p_path));
end;
$$;

revoke execute on function public.admin_set_participation_path(uuid, text) from public, anon;
grant execute on function public.admin_set_participation_path(uuid, text) to authenticated;

-- ---------- admin: approve or reject a pending request ----------
create or replace function public.review_participation_path_request(p_request_id uuid, p_decision text, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_requested_path text;
  v_status text;
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'invalid decision: %', p_decision;
  end if;

  select uid, requested_path, status into v_uid, v_requested_path, v_status
    from public.participation_path_requests where id = p_request_id;
  if v_uid is null then
    raise exception 'request not found';
  end if;
  if v_status <> 'pending' then
    raise exception 'this request has already been reviewed';
  end if;

  update public.participation_path_requests
    set status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(), review_note = coalesce(p_note, '')
    where id = p_request_id;

  if p_decision = 'approved' then
    perform public.admin_set_participation_path(v_uid, v_requested_path);
  else
    insert into public.notifications (uid, type, title, body, link_to)
    values (
      v_uid, 'participation_path_rejected', 'Focus change declined',
      coalesce(nullif(p_note, ''), 'An admin reviewed your request and kept your current focus as-is.'),
      '/profile'
    );
  end if;

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'participation_path_request_reviewed', 'participation_path_request', p_request_id::text, jsonb_build_object('decision', p_decision));
end;
$$;

revoke execute on function public.review_participation_path_request(uuid, text, text) from public, anon;
grant execute on function public.review_participation_path_request(uuid, text, text) to authenticated;

-- ================= filter skill/freelancing out for network_marketing_only members =================
-- Each function below is 0038's version (is_specialization_unlocked as the
-- shared gate) with the participation_path filter layered on top -- no other
-- behavior changes.

-- get_journey_overview: adds 'participationPath'; track loop excludes
-- skill/freelancing tracks for NM-only members. The per-specialization
-- 'locked' field (0038) is untouched.
create or replace function public.get_journey_overview(p_uid uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stage_id uuid;
  v_stage record;
  v_tracks jsonb;
  v_rank_id uuid;
  v_rank record;
  v_next_rank_id uuid;
  v_next_rank_key text;
  v_next_rank_label text;
  v_rank_percent int;
  v_path text;
begin
  if not public.can_view_journey(p_uid) then
    raise exception 'permission denied';
  end if;

  select coalesce(participation_path, 'full') into v_path from public.profiles where id = p_uid;

  select current_stage_id into v_stage_id from public.member_journey where uid = p_uid;

  if v_stage_id is null and p_uid = auth.uid() then
    select id into v_stage_id from public.stages where published = true order by order_index limit 1;
    if v_stage_id is not null then
      insert into public.member_journey (uid, current_stage_id, started_at, updated_at)
      values (p_uid, v_stage_id, now(), now())
      on conflict (uid) do nothing;
    end if;
  end if;

  if v_stage_id is null then
    return jsonb_build_object('stage', null, 'tracks', '[]'::jsonb, 'rank', null, 'rankProgressPercent', 0, 'nextRank', null, 'participationPath', v_path);
  end if;

  select id, key, title, description, order_index, rank_id into v_stage from public.stages where id = v_stage_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'trackId', t.id,
      'key', t.key,
      'label', t.label,
      'icon', t.icon,
      'colorToken', t.color_token,
      'progressPercent', public.compute_track_progress(p_uid, v_stage_id, t.id),
      'specializations', (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'id', ts.id, 'key', ts.key, 'label', ts.label, 'icon', ts.icon,
            'locked', not public.is_specialization_unlocked(p_uid, ts.id)
          )
          order by ts.order_index
        ), '[]'::jsonb)
        from public.track_specializations ts
        where ts.track_id = t.id and ts.published = true
      ),
      'selectedSpecializationId', (
        select mts.specialization_id from public.member_track_specializations mts
        where mts.uid = p_uid and mts.track_id = t.id
      )
    ) order by t.key
  ), '[]'::jsonb) into v_tracks
  from public.stage_tracks st
  join public.tracks t on t.id = st.track_id
  where st.stage_id = v_stage_id
    and (v_path = 'full' or t.key not in ('skill', 'freelancing'));

  v_rank_id := v_stage.rank_id;

  if v_rank_id is null then
    return jsonb_build_object(
      'stage', jsonb_build_object('id', v_stage.id, 'key', v_stage.key, 'title', v_stage.title, 'description', v_stage.description),
      'tracks', v_tracks,
      'rank', null,
      'rankProgressPercent', 0,
      'nextRank', null,
      'participationPath', v_path
    );
  end if;

  select id, key, label, purpose, outcome, order_index into v_rank from public.ranks where id = v_rank_id;
  v_rank_percent := public.compute_rank_progress(p_uid, v_rank_id);

  select id, key, label into v_next_rank_id, v_next_rank_key, v_next_rank_label
    from public.ranks where order_index > v_rank.order_index order by order_index limit 1;

  return jsonb_build_object(
    'stage', jsonb_build_object('id', v_stage.id, 'key', v_stage.key, 'title', v_stage.title, 'description', v_stage.description),
    'tracks', v_tracks,
    'rank', jsonb_build_object('id', v_rank.id, 'key', v_rank.key, 'label', v_rank.label, 'purpose', v_rank.purpose, 'outcome', v_rank.outcome, 'orderIndex', v_rank.order_index),
    'rankProgressPercent', v_rank_percent,
    'nextRank', case when v_next_rank_id is null then null else jsonb_build_object('id', v_next_rank_id, 'key', v_next_rank_key, 'label', v_next_rank_label) end,
    'participationPath', v_path
  );
end;
$$;

-- compute_rank_progress: excludes skill/freelancing placements from the
-- denominator for NM-only members. Also restores the can_view_journey
-- permission check that 0038's rewrite dropped (0037 had it; the direct
-- grant to `authenticated` on this function means it's callable standalone,
-- not just through get_journey_overview/get_admin_progression_overview, so
-- it needs its own gate) -- callers that already checked (get_journey_overview,
-- get_admin_progression_overview, check_member_milestones) are unaffected
-- since they invoke it for auth.uid() or while current_role() = 'admin'.
-- Note: parameter kept as p_level_id, same reason as 0038's version --
-- CREATE OR REPLACE FUNCTION can't rename an existing parameter.
create or replace function public.compute_rank_progress(p_uid uuid, p_level_id uuid)
returns int
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_path text;
  v_total int;
  v_done int;
begin
  if not public.can_view_journey(p_uid) then
    raise exception 'permission denied';
  end if;

  select coalesce(participation_path, 'full') into v_path from public.profiles where id = p_uid;

  with rank_reqs as (
    select ca.id
    from public.content_assignments ca
    join public.stages s on s.id = ca.stage_id
    join public.tracks t on t.id = ca.track_id
    where s.rank_id = p_level_id and ca.scope = 'stage_track' and ca.is_required = true
      and (v_path = 'full' or t.key not in ('skill', 'freelancing'))
      and (
        ca.specialization_id is null
        or public.is_specialization_unlocked(p_uid, ca.specialization_id)
      )
  )
  select count(*), count(*) filter (where public.is_content_assignment_done(id, p_uid))
    into v_total, v_done
  from rank_reqs;

  if v_total = 0 then
    return 0;
  end if;
  return round((v_done::numeric / v_total) * 100);
end;
$$;

-- get_my_content_assignments: excludes stage_track placements on
-- skill/freelancing tracks for NM-only members. Individual placements are
-- never excluded -- they were deliberately assigned to this specific member.
-- Also restores requiresAdminApproval/evidenceStatus (0033) which 0038's
-- specialization-lock rewrite of this function accidentally dropped --
-- TaskList.jsx's submit/pending/needs-revision evidence UI depends on them.
create or replace function public.get_my_content_assignments(p_uid uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_stage_id uuid;
  v_path text;
begin
  if p_uid <> auth.uid() and coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied';
  end if;

  select current_stage_id into v_stage_id from public.member_journey where uid = p_uid;
  select coalesce(participation_path, 'full') into v_path from public.profiles where id = p_uid;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', ca.id,
      'title', coalesce(ci.title, c.title, a.title),
      'description', coalesce(ci.description, c.description, a.instructions, ''),
      'taskType', ca.task_type,
      'xpReward', ca.xp_reward,
      'isRequired', ca.is_required,
      'dueDate', ca.due_date,
      'scope', ca.scope,
      'contentType', ci.content_type,
      'requiresAdminApproval', ca.requires_admin_approval,
      'evidenceStatus', (
        select ces.status from public.content_evidence_submissions ces
        where ces.content_assignment_id = ca.id and ces.uid = p_uid
      ),
      'isDone', public.is_content_assignment_done(ca.id, p_uid)
    ) order by ca.due_date nulls last, ca.order_index)
    from public.content_assignments ca
    join public.content_items ci on ci.id = ca.content_item_id
    left join public.courses c on c.id = ci.course_id
    left join public.assignments a on a.id = ci.assignment_id
    left join public.tracks tr on tr.id = ca.track_id
    where
      (ca.scope = 'individual' and ca.assigned_to_uid = p_uid)
      or (
        ca.scope = 'stage_track' and ca.stage_id = v_stage_id
        and (v_path = 'full' or tr.key not in ('skill', 'freelancing'))
        and (ca.specialization_id is null or public.is_specialization_unlocked(p_uid, ca.specialization_id))
      )
  ), '[]'::jsonb);
end;
$$;

-- get_next_best_action: same track exclusion.
create or replace function public.get_next_best_action(p_uid uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stage_id uuid;
  v_path text;
  v_ca record;
begin
  if not public.can_view_journey(p_uid) then
    raise exception 'permission denied';
  end if;

  select current_stage_id into v_stage_id from public.member_journey where uid = p_uid;
  if v_stage_id is null then
    return null;
  end if;
  select coalesce(participation_path, 'full') into v_path from public.profiles where id = p_uid;

  for v_ca in
    select ca.id, coalesce(ci.title, c.title, a.title) as title,
           coalesce(ci.description, c.description, a.instructions, '') as description,
           ca.due_date, ca.order_index, ca.specialization_id,
           tr.id as track_id, tr.key as track_key, tr.label as track_label, tr.icon as track_icon
      from public.content_assignments ca
      join public.content_items ci on ci.id = ca.content_item_id
      left join public.courses c on c.id = ci.course_id
      left join public.assignments a on a.id = ci.assignment_id
      join public.tracks tr on tr.id = ca.track_id
      where ca.scope = 'stage_track' and ca.stage_id = v_stage_id and ca.is_required = true
        and (v_path = 'full' or tr.key not in ('skill', 'freelancing'))
      order by ca.due_date nulls last, ca.order_index
  loop
    if v_ca.specialization_id is not null and not public.is_specialization_unlocked(p_uid, v_ca.specialization_id) then
      continue;
    end if;

    if not public.is_content_assignment_done(v_ca.id, p_uid) and public.content_assignment_unlocked(v_ca.id, p_uid) then
      return jsonb_build_object(
        'taskId', v_ca.id,
        'title', v_ca.title,
        'description', v_ca.description,
        'dueDate', v_ca.due_date,
        'trackKey', v_ca.track_key,
        'trackLabel', v_ca.track_label,
        'trackIcon', v_ca.track_icon
      );
    end if;
  end loop;

  return null;
end;
$$;

-- get_admin_progression_overview: surface participationPath so admins can
-- see who's on which path at a glance, and exclude skill/freelancing from
-- an NM-only member's trackProgress/overdueCount.
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
      'sponsoredCount', (select count(*) from public.sponsor_relationships where sponsor_uid = p.id and active = true)
    ) order by p.display_name)
    from public.profiles p
    left join public.member_journey mj on mj.uid = p.id
    left join public.stages s on s.id = mj.current_stage_id
    left join public.ranks r on r.id = s.rank_id
    where p.role = 'member' and p.status = 'active'
  ), '[]'::jsonb);
end;
$$;
