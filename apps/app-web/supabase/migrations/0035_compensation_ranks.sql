-- Phase 4 of the development-level architecture: Official Rank, modeled
-- against NeoLife's real Africa compensation plan (17 titles, Distributor
-- through 5 Diamond Director). Deliberately NOT a qualification engine --
-- product/order/PV data lives in NeoLife's own back office (ShopNeoLife.com),
-- not in Synergy, so QPV/GPV cannot be computed here without inventing
-- numbers. Per explicit product decision: an admin looks a member's real
-- status up in the NeoLife back office and sets it by hand. qualification_
-- note is reference text only (shown next to each rank in the admin
-- picker) -- never evaluated or enforced by any function in this file.
--
-- Kept structurally independent of `levels` (Development Level) exactly as
-- the architecture proposal specified: no foreign key between the two,
-- nothing here reads member_journey/stages, nothing in the Level/Stage/
-- Task engine reads this table. They're joined only by uid, at display
-- time, in get_journey_overview and get_admin_progression_overview below.

create table public.compensation_ranks (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  order_index int not null default 0,
  qualification_note text not null default '',
  created_at timestamptz not null default now()
);
create index compensation_ranks_order_idx on public.compensation_ranks (order_index);

alter table public.compensation_ranks enable row level security;
grant select on public.compensation_ranks to authenticated;
create policy compensation_ranks_select on public.compensation_ranks for select using (auth.uid() is not null);
-- update only (no insert/delete): the ladder matches the real plan; an
-- admin may only refresh qualification_note copy if NeoLife revises it.
grant update on public.compensation_ranks to authenticated;
create policy compensation_ranks_admin_update on public.compensation_ranks for update
  using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

insert into public.compensation_ranks (key, label, order_index, qualification_note) values
  ('distributor', 'Distributor', 1, 'Base title. 250 QPV earns 3% Sales Volume Bonus.'),
  ('manager', 'Manager', 2, '500 QPV + 100 PPV in one month. 5% SVB.'),
  ('senior_manager', 'Senior Manager', 3, '1,000 QPV + 100 PPV in one month. 10% SVB.'),
  ('executive_manager', 'Executive Manager', 4, '2,000 QPV + 100 PPV in one month. 15-20% SVB.'),
  ('director', 'Director', 5, 'Qualified Exec Manager (2,000+ QPV) + Active, then 4,000 QPV the following month -- OR -- Qualified Senior Manager + Active, 10,000 QPV over 6 months (100+ PPV each month, 4,000+ QPV in the final month). 25% SVB.'),
  ('emerald_director', 'Emerald Director', 6, 'Qualified Director (4,000 QPV + 100 PPV) for 3 consecutive months.'),
  ('sapphire_director', 'Sapphire Director', 7, '1 First-Level Qualified Director Leg + 10,000 GPV, achieved 3 of 6 months.'),
  ('1_ruby_director', '1 Ruby Director', 8, '3 Director Legs + 20,000 GPV, achieved 3 of 6 months.'),
  ('2_ruby_director', '2 Ruby Director', 9, '4 Director Legs + 30,000 GPV, achieved 3 of 6 months.'),
  ('3_ruby_director', '3 Ruby Director', 10, '5 Director Legs + 50,000 GPV, achieved 3 of 6 months.'),
  ('4_ruby_director', '4 Ruby Director', 11, '6 Director Legs + 100,000 GPV, achieved 3 of 6 months.'),
  ('5_ruby_director', '5 Ruby Director', 12, '8 Director Legs + 150,000 GPV, achieved 3 of 6 months.'),
  ('1_diamond_director', '1 Diamond Director', 13, '10 Director Legs + 200,000 GPV, achieved 3 of 6 months.'),
  ('2_diamond_director', '2 Diamond Director', 14, '12 Director Legs + 250,000 GPV, achieved 3 of 6 months.'),
  ('3_diamond_director', '3 Diamond Director', 15, '14 Director Legs + 300,000 GPV, achieved 3 of 6 months.'),
  ('4_diamond_director', '4 Diamond Director', 16, '16 Director Legs + 400,000 GPV, achieved 3 of 6 months.'),
  ('5_diamond_director', '5 Diamond Director', 17, '18 Director Legs + 500,000 GPV, achieved 3 of 6 months.');

-- Current status only (not a history table) -- mirrors the "current value +
-- activity_log audit trail" pattern already used by set_member_stage /
-- assign_sponsor, rather than introducing a new history-table shape here.
create table public.member_rank_status (
  uid uuid primary key references public.profiles(id) on delete cascade,
  rank_id uuid references public.compensation_ranks(id),
  set_by uuid references public.profiles(id),
  set_at timestamptz not null default now(),
  note text default ''
);

alter table public.member_rank_status enable row level security;
grant select on public.member_rank_status to authenticated;
create policy member_rank_status_select on public.member_rank_status for select
  using (uid = auth.uid() or public.current_role() = 'admin');
-- no client insert/update grant: written only by set_member_official_rank below.

create or replace function public.set_member_official_rank(p_uid uuid, p_rank_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rank_label text;
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;
  if p_rank_id is not null and not exists (select 1 from public.compensation_ranks where id = p_rank_id) then
    raise exception 'unknown rank';
  end if;

  insert into public.member_rank_status (uid, rank_id, set_by, set_at, note)
  values (p_uid, p_rank_id, auth.uid(), now(), coalesce(p_note, ''))
  on conflict (uid) do update
    set rank_id = excluded.rank_id, set_by = excluded.set_by, set_at = excluded.set_at, note = excluded.note;

  select label into v_rank_label from public.compensation_ranks where id = p_rank_id;

  insert into public.notifications (uid, type, title, body, link_to)
  values (
    p_uid, 'official_rank_set',
    case when v_rank_label is null then 'Official rank cleared' else 'Official rank updated: ' || v_rank_label end,
    coalesce(nullif(p_note, ''), 'Reflects your current NeoLife back office status.'),
    '/dashboard'
  );

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'official_rank_set', 'profile', p_uid::text, jsonb_build_object('rankId', p_rank_id));
end;
$$;

revoke execute on function public.set_member_official_rank(uuid, uuid, text) from public, anon;
grant execute on function public.set_member_official_rank(uuid, uuid, text) to authenticated;

-- get_journey_overview, redefined only to add 'officialRank' -- read
-- independently of the stage/level lookups above it, so it's present even
-- for a member who hasn't started their development journey yet.
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
  v_level_id uuid;
  v_level record;
  v_next_level_id uuid;
  v_next_level_key text;
  v_next_level_label text;
  v_level_percent int;
  v_official_rank jsonb;
begin
  if not public.can_view_journey(p_uid) then
    raise exception 'permission denied';
  end if;

  select jsonb_build_object('id', cr.id, 'key', cr.key, 'label', cr.label)
    into v_official_rank
    from public.member_rank_status mrs
    join public.compensation_ranks cr on cr.id = mrs.rank_id
    where mrs.uid = p_uid;

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
    return jsonb_build_object('stage', null, 'tracks', '[]'::jsonb, 'level', null, 'levelProgressPercent', 0, 'nextLevel', null, 'officialRank', v_official_rank);
  end if;

  select id, key, title, description, order_index, level_id into v_stage from public.stages where id = v_stage_id;

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

  v_level_id := v_stage.level_id;

  if v_level_id is null then
    return jsonb_build_object(
      'stage', jsonb_build_object('id', v_stage.id, 'key', v_stage.key, 'title', v_stage.title, 'description', v_stage.description),
      'tracks', v_tracks,
      'level', null,
      'levelProgressPercent', 0,
      'nextLevel', null,
      'officialRank', v_official_rank
    );
  end if;

  select id, key, label, purpose, outcome, order_index into v_level from public.levels where id = v_level_id;
  v_level_percent := public.compute_level_progress(p_uid, v_level_id);

  select id, key, label into v_next_level_id, v_next_level_key, v_next_level_label
    from public.levels where order_index > v_level.order_index order by order_index limit 1;

  return jsonb_build_object(
    'stage', jsonb_build_object('id', v_stage.id, 'key', v_stage.key, 'title', v_stage.title, 'description', v_stage.description),
    'tracks', v_tracks,
    'level', jsonb_build_object('id', v_level.id, 'key', v_level.key, 'label', v_level.label, 'purpose', v_level.purpose, 'outcome', v_level.outcome, 'orderIndex', v_level.order_index),
    'levelProgressPercent', v_level_percent,
    'nextLevel', case when v_next_level_id is null then null else jsonb_build_object('id', v_next_level_id, 'key', v_next_level_key, 'label', v_next_level_label) end,
    'officialRank', v_official_rank
  );
end;
$$;

-- get_admin_progression_overview, redefined only to replace the
-- 'officialRank', null placeholder with the real value.
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
      'level', case when l.id is null then null else jsonb_build_object('id', l.id, 'label', l.label) end,
      'levelProgressPercent', public.compute_level_progress(p.id, l.id),
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
      'sponsoredCount', (select count(*) from public.sponsor_relationships where sponsor_uid = p.id and active = true),
      'officialRank', (
        select cr.label from public.member_rank_status mrs
        join public.compensation_ranks cr on cr.id = mrs.rank_id
        where mrs.uid = p.id
      )
    ) order by p.display_name)
    from public.profiles p
    left join public.member_journey mj on mj.uid = p.id
    left join public.stages s on s.id = mj.current_stage_id
    left join public.levels l on l.id = s.level_id
    where p.role = 'member' and p.status = 'active'
  ), '[]'::jsonb);
end;
$$;
