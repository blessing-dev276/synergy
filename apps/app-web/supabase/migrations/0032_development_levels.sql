-- Development Level layer, sitting above Stage (see the architecture
-- proposal reviewed with the product owner). A Level is the big, visible
-- container members always see ("Manager", "Director"...); Stages nest
-- under one via stages.level_id, unchanged otherwise. Deliberately separate
-- from Official Rank / the compensation plan (not implemented anywhere in
-- this migration) -- get_network_overview() already stubs that out as a
-- placeholder (0019) and this doesn't touch it.
--
-- The 7 levels are seeded as fixed rows (admins can edit label/purpose/
-- outcome copy and reorder, but not add/remove) -- narrower than Stage,
-- which stays fully admin CRUD. stages.level_id is nullable: existing
-- stages start unassigned rather than being force-mapped onto a guessed
-- level, so an admin explicitly places each one via Stage Builder.

create table public.levels (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  purpose text not null default '',
  outcome text not null default '',
  order_index int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index levels_order_idx on public.levels (order_index);

alter table public.levels enable row level security;
grant select on public.levels to authenticated;
create policy levels_select on public.levels for select using (auth.uid() is not null);
-- update only (no insert/delete): the 7 rows are fixed, admins edit copy/order in place.
grant update on public.levels to authenticated;
create policy levels_admin_update on public.levels for update
  using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

insert into public.levels (key, label, purpose, outcome, order_index) values
  ('newbie', 'Newbie', 'Orientation and foundation.', 'I understand the Synergy journey and know what I am building.', 1),
  ('pro', 'Pro', 'Become competent and begin creating value.', 'I have a useful skill and understand how to create opportunities.', 2),
  ('distributor', 'Distributor', 'Turn learning into practical work and market preparation.', 'I can perform my skill and begin taking it to the market.', 3),
  ('manager', 'Manager', 'Produce results and begin developing people.', 'I can produce results and help others develop.', 4),
  ('senior_manager', 'Senior Manager', 'Develop people and create repeatable growth.', 'I can develop people and build a productive team.', 5),
  ('executive_manager', 'Executive Manager', 'Build systems and scale.', 'I can build systems that produce results beyond my personal effort.', 6),
  ('director', 'Director', 'Leadership mastery and organization building.', 'I can build and develop an organization.', 7);

alter table public.stages add column level_id uuid references public.levels(id) on delete set null;
create index stages_level_idx on public.stages (level_id);

-- ---------- roll Level info into the existing journey RPC ----------
-- Same jsonb-returning function clients already call (compute_track_progress
-- untouched) -- adds 'level', 'levelProgressPercent', 'nextLevel' alongside
-- the existing 'stage'/'tracks' keys. Level progress = required content
-- placements completed across every stage in the member's current level,
-- not just their current stage, mirroring compute_track_progress_v2's own
-- specialization-scoping so a member's chosen skill path is respected here
-- too.
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
  v_level_total int;
  v_level_done int;
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
    return jsonb_build_object('stage', null, 'tracks', '[]'::jsonb, 'level', null, 'levelProgressPercent', 0, 'nextLevel', null);
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
      'nextLevel', null
    );
  end if;

  select id, key, label, purpose, outcome, order_index into v_level from public.levels where id = v_level_id;

  with level_reqs as (
    select ca.id, ca.track_id
    from public.content_assignments ca
    join public.stages s on s.id = ca.stage_id
    where s.level_id = v_level_id and ca.scope = 'stage_track' and ca.is_required = true
      and (
        ca.specialization_id is null
        or ca.specialization_id = (
          select mts.specialization_id from public.member_track_specializations mts
          where mts.uid = p_uid and mts.track_id = ca.track_id
        )
      )
  )
  select count(*), count(*) filter (where public.is_content_assignment_done(id, p_uid))
    into v_level_total, v_level_done
  from level_reqs;

  select id, key, label into v_next_level_id, v_next_level_key, v_next_level_label
    from public.levels where order_index > v_level.order_index order by order_index limit 1;

  return jsonb_build_object(
    'stage', jsonb_build_object('id', v_stage.id, 'key', v_stage.key, 'title', v_stage.title, 'description', v_stage.description),
    'tracks', v_tracks,
    'level', jsonb_build_object('id', v_level.id, 'key', v_level.key, 'label', v_level.label, 'purpose', v_level.purpose, 'outcome', v_level.outcome, 'orderIndex', v_level.order_index),
    'levelProgressPercent', case when v_level_total = 0 then 0 else round((v_level_done::numeric / v_level_total) * 100) end,
    'nextLevel', case when v_next_level_id is null then null else jsonb_build_object('id', v_next_level_id, 'key', v_next_level_key, 'label', v_next_level_label) end
  );
end;
$$;
