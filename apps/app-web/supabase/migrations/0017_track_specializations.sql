-- Track specializations: lets a track branch into member-selectable
-- sub-paths (e.g. Skill -> Graphics Design / GoHighLevel CRM / FlutterFlow),
-- each with its own tasks, on top of the stage/track model from 0008.
-- Business and Freelancing stay unbranched by simply having no
-- specializations defined for their track_id -- nothing else changes for
-- them. Per-track/per-stage task counts already vary freely (0008 tags
-- tasks with stage_id + track_id independently), so no change is needed
-- for that part -- this migration only adds the missing branch-within-a-
-- track dimension.

-- ---------- track_specializations (admin-configurable, ordered per track) ----------
create table public.track_specializations (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.tracks(id) on delete cascade,
  key text not null,
  label text not null,
  icon text default '',
  order_index int not null default 0,
  published boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (track_id, key)
);
create index track_specializations_track_idx on public.track_specializations (track_id, order_index);

-- ---------- tag tasks with an optional specialization ----------
-- null = applies to everyone in the track (unchanged 0008 behavior);
-- set = only applies to members who selected that specialization.
alter table public.tasks add column specialization_id uuid references public.track_specializations(id);
create index tasks_specialization_idx on public.tasks (specialization_id);

-- a task's specialization (if any) must belong to the same track as the task
create or replace function public.check_task_specialization_track()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_track_id uuid;
begin
  if new.specialization_id is null then
    return new;
  end if;
  select track_id into v_track_id from public.track_specializations where id = new.specialization_id;
  if v_track_id is null or v_track_id <> new.track_id then
    raise exception 'specialization does not belong to this task''s track';
  end if;
  return new;
end;
$$;

create trigger tasks_specialization_track_check
  before insert or update of specialization_id, track_id on public.tasks
  for each row execute function public.check_task_specialization_track();

-- ---------- member_track_specializations: one chosen path per track ----------
create table public.member_track_specializations (
  uid uuid not null references public.profiles(id) on delete cascade,
  track_id uuid not null references public.tracks(id) on delete cascade,
  specialization_id uuid not null references public.track_specializations(id),
  selected_at timestamptz not null default now(),
  primary key (uid, track_id)
);

-- ================= RLS =================

alter table public.track_specializations enable row level security;
grant select, insert, update, delete on public.track_specializations to authenticated;
create policy track_specializations_select on public.track_specializations for select using (auth.uid() is not null);
create policy track_specializations_admin_insert on public.track_specializations for insert with check (public.current_role() = 'admin');
create policy track_specializations_admin_update on public.track_specializations for update using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
create policy track_specializations_admin_delete on public.track_specializations for delete using (public.current_role() = 'admin');

alter table public.member_track_specializations enable row level security;
grant select on public.member_track_specializations to authenticated;
create policy member_track_specializations_select on public.member_track_specializations for select
  using (uid = auth.uid() or public.current_role() = 'admin' or public.is_assigned_mentor_of(uid));
-- no client insert/update grant: rows are written by set_member_specialization (below), SECURITY DEFINER.

-- ================= RPC: member picks/changes their specialization =================

create or replace function public.set_member_specialization(p_track_id uuid, p_specialization_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_track_id uuid;
begin
  select track_id into v_track_id from public.track_specializations
    where id = p_specialization_id and published = true;
  if v_track_id is null or v_track_id <> p_track_id then
    raise exception 'invalid specialization for this track';
  end if;

  insert into public.member_track_specializations (uid, track_id, specialization_id, selected_at)
  values (auth.uid(), p_track_id, p_specialization_id, now())
  on conflict (uid, track_id) do update set specialization_id = excluded.specialization_id, selected_at = now();

  insert into public.activity_log (actor_uid, action, target_type, target_id)
  values (auth.uid(), 'specialization_selected', 'track_specialization', p_specialization_id::text);
end;
$$;

revoke execute on function public.set_member_specialization(uuid, uuid) from public, anon;
grant execute on function public.set_member_specialization(uuid, uuid) to authenticated;

-- ================= journey engine: respect specialization =================

-- compute_track_progress: a specialization-tagged task only counts toward
-- p_uid's progress if it matches the specialization they've selected for
-- this track; untagged tasks still count for everyone, same as 0009.
create or replace function public.compute_track_progress(p_uid uuid, p_stage_id uuid, p_track_id uuid)
returns int
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_total int;
  v_done int := 0;
  v_task record;
  v_specialization_id uuid;
begin
  if not public.can_view_journey(p_uid) then
    raise exception 'permission denied';
  end if;

  select specialization_id into v_specialization_id
    from public.member_track_specializations
    where uid = p_uid and track_id = p_track_id;

  select count(*) into v_total from public.tasks
    where stage_id = p_stage_id and track_id = p_track_id and is_required = true
      and (specialization_id is null or specialization_id = v_specialization_id);

  if v_total = 0 then
    return 0;
  end if;

  for v_task in
    select id from public.tasks
      where stage_id = p_stage_id and track_id = p_track_id and is_required = true
        and (specialization_id is null or specialization_id = v_specialization_id)
  loop
    if public.is_task_done(v_task.id, p_uid) then
      v_done := v_done + 1;
    end if;
  end loop;

  return round((v_done::numeric / v_total) * 100);
end;
$$;

revoke execute on function public.compute_track_progress(uuid, uuid, uuid) from public, anon;
grant execute on function public.compute_track_progress(uuid, uuid, uuid) to authenticated;

-- get_journey_overview: same stage/tracks shape as 0009, plus each track now
-- reports its available specializations (if any) and the member's chosen one,
-- so the UI can prompt a selection where the track branches.
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
    return jsonb_build_object('stage', null, 'tracks', '[]'::jsonb);
  end if;

  select id, key, title, description, order_index into v_stage from public.stages where id = v_stage_id;

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

  return jsonb_build_object(
    'stage', jsonb_build_object('id', v_stage.id, 'key', v_stage.key, 'title', v_stage.title, 'description', v_stage.description),
    'tracks', v_tracks
  );
end;
$$;

revoke execute on function public.get_journey_overview(uuid) from public, anon;
grant execute on function public.get_journey_overview(uuid) to authenticated;

-- get_next_best_action: skip specialization-gated tasks that aren't the
-- member's chosen path for that task's track.
create or replace function public.get_next_best_action(p_uid uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stage_id uuid;
  v_task record;
begin
  if not public.can_view_journey(p_uid) then
    raise exception 'permission denied';
  end if;

  select current_stage_id into v_stage_id from public.member_journey where uid = p_uid;
  if v_stage_id is null then
    return null;
  end if;

  for v_task in
    select tk.id, tk.title, tk.description, tk.due_date, tk.specialization_id,
           tr.id as track_id, tr.key as track_key, tr.label as track_label, tr.icon as track_icon
      from public.tasks tk
      join public.tracks tr on tr.id = tk.track_id
      where tk.stage_id = v_stage_id and tk.is_required = true
      order by tk.due_date nulls last
  loop
    if v_task.specialization_id is not null and not exists (
      select 1 from public.member_track_specializations mts
      where mts.uid = p_uid and mts.track_id = v_task.track_id and mts.specialization_id = v_task.specialization_id
    ) then
      continue;
    end if;

    if not public.is_task_done(v_task.id, p_uid) and public.task_unlocked(v_task.id, p_uid) then
      return jsonb_build_object(
        'taskId', v_task.id,
        'title', v_task.title,
        'description', v_task.description,
        'dueDate', v_task.due_date,
        'trackKey', v_task.track_key,
        'trackLabel', v_task.track_label,
        'trackIcon', v_task.track_icon
      );
    end if;
  end loop;

  return null;
end;
$$;

revoke execute on function public.get_next_best_action(uuid) from public, anon;
grant execute on function public.get_next_best_action(uuid) to authenticated;

-- ================= seed: Skill track branches into its three paths =================
-- Matches the labels already shown to members during onboarding
-- (src/lib/onboardingOptions.js INTERESTS) so the language is consistent;
-- that onboarding field itself stays a free-form interest signal and is not
-- wired to this selection.
insert into public.track_specializations (track_id, key, label, icon, order_index)
select t.id, v.key, v.label, v.icon, v.order_index
from public.tracks t
cross join (values
  ('graphics_design', 'Graphics Design', '🎨', 1),
  ('gohighlevel_crm', 'GoHighLevel / CRM', '🧩', 2),
  ('flutterflow', 'FlutterFlow / Mobile App Development', '📱', 3)
) as v(key, label, icon, order_index)
where t.key = 'skill';
