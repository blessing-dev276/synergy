-- Product decision: Development Level and Official Rank are merged into a
-- single concept, "Rank" -- Newbie, Pro, Distributor, Manager, Senior
-- Manager, Executive Manager, Director. This is what categorizes members
-- and what training/tasks are assigned according to, replacing both the
-- old "Development Level" (training-driven) and the separate NeoLife-
-- ladder "Official Rank" (admin-set by hand, 0035) as two parallel fields.
--
-- `levels` becomes `ranks` (rename, not recreate -- keeps every row, FK,
-- and the whole Stage/Track/Task tree hanging off it intact). Everywhere
-- else that said "level" now says "rank" to match.
--
-- compensation_ranks / member_rank_status / set_member_official_rank
-- (0035, the real NeoLife 17-title ladder) are deliberately NOT dropped --
-- that's real data sourced from the actual compensation plan and may be
-- useful reference later. They're just fully disconnected here: no longer
-- read by get_journey_overview or get_admin_progression_overview, and the
-- admin UI for setting one by hand is being removed. If they turn out to
-- be genuinely unneeded, dropping them is a separate, deliberate call.

alter table public.levels rename to ranks;
alter index levels_pkey rename to ranks_pkey;
alter index levels_key_key rename to ranks_key_key;
alter index levels_order_idx rename to ranks_order_idx;
alter policy levels_select on public.ranks rename to ranks_select;
alter policy levels_admin_update on public.ranks rename to ranks_admin_update;

alter table public.stages rename column level_id to rank_id;
alter index stages_level_idx rename to stages_rank_idx;

alter table public.milestones rename column level_id to rank_id;
alter index milestones_level_idx rename to milestones_rank_idx;
update public.milestones set trigger_type = 'rank_completed' where trigger_type = 'level_completed';
alter table public.milestones drop constraint milestones_trigger_type_check;
alter table public.milestones add constraint milestones_trigger_type_check
  check (trigger_type in ('content_assignment_completed', 'stage_completed', 'rank_completed', 'manual'));

update public.progression_rules set scope_type = 'rank' where scope_type = 'level';
alter table public.progression_rules drop constraint progression_rules_scope_type_check;
alter table public.progression_rules add constraint progression_rules_scope_type_check
  check (scope_type in ('stage', 'rank'));

alter function public.compute_level_progress(uuid, uuid) rename to compute_rank_progress;

-- check_member_milestones, redefined only for the rank_completed rename
-- (was level_completed) and the compute_rank_progress rename above.
create or replace function public.check_member_milestones(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m record;
  v_earned boolean;
begin
  for v_m in
    select * from public.milestones
    where published = true
      and trigger_type in ('content_assignment_completed', 'stage_completed', 'rank_completed')
      and not exists (select 1 from public.member_milestones mm where mm.uid = p_uid and mm.milestone_id = milestones.id)
  loop
    v_earned := false;

    if v_m.trigger_type = 'content_assignment_completed' then
      v_earned := v_m.trigger_ref_id is not null and public.is_content_assignment_done(v_m.trigger_ref_id, p_uid);

    elsif v_m.trigger_type = 'stage_completed' then
      v_earned := v_m.trigger_ref_id is not null
        and exists (
          select 1 from public.content_assignments ca2
          where ca2.stage_id = v_m.trigger_ref_id and ca2.scope = 'stage_track' and ca2.is_required = true
        )
        and not exists (
          select 1 from public.content_assignments ca
          where ca.stage_id = v_m.trigger_ref_id and ca.scope = 'stage_track' and ca.is_required = true
            and (
              ca.specialization_id is null
              or ca.specialization_id = (
                select mts.specialization_id from public.member_track_specializations mts
                where mts.uid = p_uid and mts.track_id = ca.track_id
              )
            )
            and not public.is_content_assignment_done(ca.id, p_uid)
        );

    elsif v_m.trigger_type = 'rank_completed' then
      v_earned := v_m.trigger_ref_id is not null and public.compute_rank_progress(p_uid, v_m.trigger_ref_id) >= 100;
    end if;

    if v_earned then
      insert into public.member_milestones (uid, milestone_id, achieved_at)
      values (p_uid, v_m.id, now())
      on conflict (uid, milestone_id) do nothing;

      insert into public.notifications (uid, type, title, body, link_to)
      values (p_uid, 'milestone_achieved', 'Milestone achieved: ' || v_m.title, coalesce(nullif(v_m.description, ''), 'Nice work.'), '/dashboard');

      insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
      values (p_uid, 'milestone_achieved', 'milestone', v_m.id::text, jsonb_build_object('key', v_m.key));
    end if;
  end loop;
end;
$$;

-- get_journey_overview, redefined to say 'rank'/'rankProgressPercent'/
-- 'nextRank' instead of 'level'/'levelProgressPercent'/'nextLevel', and to
-- drop the separate 'officialRank' lookup entirely -- Rank is now the one
-- and only categorization field.
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
begin
  if not public.can_view_journey(p_uid) then
    raise exception 'permission denied';
  end if;

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
    return jsonb_build_object('stage', null, 'tracks', '[]'::jsonb, 'rank', null, 'rankProgressPercent', 0, 'nextRank', null);
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
          jsonb_build_object('id', ts.id, 'key', ts.key, 'label', ts.label, 'icon', ts.icon)
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
  where st.stage_id = v_stage_id;

  v_rank_id := v_stage.rank_id;

  if v_rank_id is null then
    return jsonb_build_object(
      'stage', jsonb_build_object('id', v_stage.id, 'key', v_stage.key, 'title', v_stage.title, 'description', v_stage.description),
      'tracks', v_tracks,
      'rank', null,
      'rankProgressPercent', 0,
      'nextRank', null
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
    'nextRank', case when v_next_rank_id is null then null else jsonb_build_object('id', v_next_rank_id, 'key', v_next_rank_key, 'label', v_next_rank_label) end
  );
end;
$$;

-- get_admin_progression_overview, redefined for the same 'rank' renames
-- and to drop the 'officialRank' field entirely.
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
      'rank', case when r.id is null then null else jsonb_build_object('id', r.id, 'label', r.label) end,
      'rankProgressPercent', public.compute_rank_progress(p.id, r.id),
      'stage', case when s.id is null then null else jsonb_build_object('id', s.id, 'title', s.title) end,
      'trackProgress', (
        select coalesce(jsonb_object_agg(t.key, public.compute_track_progress(p.id, s.id, t.id)), '{}'::jsonb)
        from public.stage_tracks st
        join public.tracks t on t.id = st.track_id
        where st.stage_id = s.id
      ),
      'overdueCount', (
        select count(*) from public.content_assignments ca
        where ca.is_required = true and ca.due_date is not null and ca.due_date < now()
          and not public.is_content_assignment_done(ca.id, p.id)
          and (
            (ca.scope = 'individual' and ca.assigned_to_uid = p.id)
            or (
              ca.scope = 'stage_track' and ca.stage_id = s.id
              and (
                ca.specialization_id is null
                or ca.specialization_id = (
                  select specialization_id from public.member_track_specializations
                  where uid = p.id and track_id = ca.track_id
                )
              )
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
