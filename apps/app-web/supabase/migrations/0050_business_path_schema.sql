-- Business Path rebuild, part 1 of 7 (schema, additive only). Replaces the
-- old Journey model (stages/tracks/ranks/track_specializations/member_journey,
-- 0008/0017/0032/0037) with a from-scratch "Business Path" system under a
-- new naming scheme (business_path_* / member_business_path_*). Additive
-- only -- the old tables keep working untouched through 0053, matching this
-- codebase's own 0027-0030 additive-then-cutover precedent. The actual
-- cutover/drop happens in 0054-0056.
--
-- Milestones and the member-initiated promotion-request workflow are
-- deliberately NOT ported -- confirmed product decision to drop both
-- entirely, no replacement (admins move a member's stage directly instead,
-- see set_member_business_path_stage in 0051). daily_task_selections is
-- NOT created here -- it's dropped-and-recreated in 0052 together with the
-- get_or_generate_daily_tasks rewrite, since those two changes must land
-- atomically (the old table shape would otherwise be dangling between this
-- file and 0052).
--
-- content_assignments/content_items/member_progress/content_evidence_submissions
-- are NOT touched anywhere in this rebuild's schema files -- they keep
-- serving the individual-task feature (MemberDetail.jsx's Activities panel)
-- untouched, per the plan's explicit landmine #1: those tables must survive
-- this rebuild fully intact.

-- ---------- business_path_tracks: fixed set of 3, admins may relabel/re-icon ----------
create table public.business_path_tracks (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key in ('skill', 'business', 'freelancing')),
  label text not null,
  icon text default '',
  color_token text default ''
);

insert into public.business_path_tracks (key, label, icon, color_token) values
  ('skill', 'Skill', '🎯', '--blue'),
  ('business', 'Business', '💼', '--gold'),
  ('freelancing', 'Freelancing', '💻', '--success');

alter table public.business_path_tracks enable row level security;
grant select, update on public.business_path_tracks to authenticated;
create policy business_path_tracks_select on public.business_path_tracks for select using (auth.uid() is not null);
create policy business_path_tracks_admin_update on public.business_path_tracks for update
  using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

-- ---------- business_path_levels: "Path Level" ladder, Newbie -> Director ----------
-- Same 7 fixed rungs as the old `levels`/`ranks` table (0032/0037) -- only
-- the wrapper renames under Business Path branding, the labels/copy don't.
create table public.business_path_levels (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  purpose text not null default '',
  outcome text not null default '',
  order_index int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index business_path_levels_order_idx on public.business_path_levels (order_index);

insert into public.business_path_levels (key, label, purpose, outcome, order_index) values
  ('newbie', 'Newbie', 'Orientation and foundation.', 'I understand the Synergy journey and know what I am building.', 1),
  ('pro', 'Pro', 'Become competent and begin creating value.', 'I have a useful skill and understand how to create opportunities.', 2),
  ('distributor', 'Distributor', 'Turn learning into practical work and market preparation.', 'I can perform my skill and begin taking it to the market.', 3),
  ('manager', 'Manager', 'Produce results and begin developing people.', 'I can produce results and help others develop.', 4),
  ('senior_manager', 'Senior Manager', 'Develop people and create repeatable growth.', 'I can develop people and build a productive team.', 5),
  ('executive_manager', 'Executive Manager', 'Build systems and scale.', 'I can build systems that produce results beyond my personal effort.', 6),
  ('director', 'Director', 'Leadership mastery and organization building.', 'I can build and develop an organization.', 7);

alter table public.business_path_levels enable row level security;
grant select on public.business_path_levels to authenticated;
create policy business_path_levels_select on public.business_path_levels for select using (auth.uid() is not null);
-- update only (no insert/delete): the 7 rows are fixed, admins edit copy/order in place.
grant update on public.business_path_levels to authenticated;
create policy business_path_levels_admin_update on public.business_path_levels for update
  using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

-- ---------- business_path_stages: admin-configurable, ordered. No seed data --
-- Stage Builder content is being fully re-authored, so this starts empty. ----------
create table public.business_path_stages (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  title text not null,
  description text default '',
  order_index int not null default 0,
  published boolean not null default false,
  path_level_id uuid references public.business_path_levels(id) on delete set null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index business_path_stages_order_idx on public.business_path_stages (order_index);
create index business_path_stages_level_idx on public.business_path_stages (path_level_id);

alter table public.business_path_stages enable row level security;
grant select, insert, update, delete on public.business_path_stages to authenticated;
create policy business_path_stages_select on public.business_path_stages for select using (auth.uid() is not null);
create policy business_path_stages_admin_insert on public.business_path_stages for insert with check (public.current_role() = 'admin');
create policy business_path_stages_admin_update on public.business_path_stages for update using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
create policy business_path_stages_admin_delete on public.business_path_stages for delete using (public.current_role() = 'admin');

-- ---------- business_path_stage_tracks: which tracks are active in a given stage ----------
create table public.business_path_stage_tracks (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.business_path_stages(id) on delete cascade,
  track_id uuid not null references public.business_path_tracks(id) on delete cascade,
  intro_text text default '',
  unique (stage_id, track_id)
);
create index business_path_stage_tracks_stage_idx on public.business_path_stage_tracks (stage_id);

alter table public.business_path_stage_tracks enable row level security;
grant select, insert, update, delete on public.business_path_stage_tracks to authenticated;
create policy business_path_stage_tracks_select on public.business_path_stage_tracks for select using (auth.uid() is not null);
create policy business_path_stage_tracks_admin_insert on public.business_path_stage_tracks for insert with check (public.current_role() = 'admin');
create policy business_path_stage_tracks_admin_update on public.business_path_stage_tracks for update using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
create policy business_path_stage_tracks_admin_delete on public.business_path_stage_tracks for delete using (public.current_role() = 'admin');

-- ---------- business_path_specializations: member-selectable sub-paths within a track ----------
create table public.business_path_specializations (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.business_path_tracks(id) on delete cascade,
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
create index business_path_specializations_track_idx on public.business_path_specializations (track_id, order_index);

alter table public.business_path_specializations enable row level security;
grant select, insert, update, delete on public.business_path_specializations to authenticated;
create policy business_path_specializations_select on public.business_path_specializations for select using (auth.uid() is not null);
create policy business_path_specializations_admin_insert on public.business_path_specializations for insert with check (public.current_role() = 'admin');
create policy business_path_specializations_admin_update on public.business_path_specializations for update using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
create policy business_path_specializations_admin_delete on public.business_path_specializations for delete using (public.current_role() = 'admin');

-- ---------- member_business_path_specializations: one chosen path per track, one-time lock ----------
create table public.member_business_path_specializations (
  uid uuid not null references public.profiles(id) on delete cascade,
  track_id uuid not null references public.business_path_tracks(id) on delete cascade,
  specialization_id uuid not null references public.business_path_specializations(id),
  selected_at timestamptz not null default now(),
  primary key (uid, track_id)
);

alter table public.member_business_path_specializations enable row level security;
grant select on public.member_business_path_specializations to authenticated;
create policy member_business_path_specializations_select on public.member_business_path_specializations for select
  using (uid = auth.uid() or public.current_role() = 'admin');
-- no client insert/update grant: rows are written only by
-- set_my_business_path_specialization / admin_set_member_business_path_specialization
-- (0051), both SECURITY DEFINER.

-- ---------- member_business_path_stage: one row per member, tracks current stage ----------
create table public.member_business_path_stage (
  uid uuid primary key references public.profiles(id) on delete cascade,
  current_stage_id uuid references public.business_path_stages(id) on delete set null,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.member_business_path_stage enable row level security;
grant select on public.member_business_path_stage to authenticated;
create policy member_business_path_stage_select on public.member_business_path_stage for select
  using (uid = auth.uid() or public.current_role() = 'admin');
-- no client insert/update grant: rows are written only by
-- set_member_business_path_stage / the lazy-init in get_business_path_overview
-- (0051), both SECURITY DEFINER.

-- ---------- business_path_placements: WHEN/WHERE a content_item sits in Business Path ----------
-- Replaces the scope='stage_track' half of content_assignments. Always
-- stage/track-scoped -- no scope/assigned_to_uid columns at all, since
-- individual ad-hoc assignments stay on content_assignments permanently
-- (see 0054's detach). This simplifies the admin authoring form: no scope
-- branching, ever.
create table public.business_path_placements (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  stage_id uuid not null references public.business_path_stages(id) on delete cascade,
  track_id uuid not null references public.business_path_tracks(id) on delete cascade,
  specialization_id uuid references public.business_path_specializations(id),
  task_type text not null default 'practical' check (task_type in
    ('learning', 'practical', 'business_activity', 'freelancing_activity',
     'reflection', 'submission', 'attendance', 'milestone')),
  xp_reward int not null default 0,
  is_required boolean not null default true,
  requires_admin_approval boolean not null default false,
  due_date timestamptz,
  order_index int not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index business_path_placements_stage_track_idx on public.business_path_placements (stage_id, track_id);
create index business_path_placements_content_item_idx on public.business_path_placements (content_item_id);

-- Mirrors 0027's check_content_assignment_specialization_track: a
-- placement's specialization (if any) must belong to the same track as the
-- placement itself.
create or replace function public.check_business_path_placement_specialization_track()
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
  select track_id into v_track_id from public.business_path_specializations where id = new.specialization_id;
  if v_track_id is null or v_track_id <> new.track_id then
    raise exception 'specialization does not belong to this placement''s track';
  end if;
  return new;
end;
$$;

create trigger business_path_placements_specialization_track_check
  before insert or update of specialization_id, track_id on public.business_path_placements
  for each row execute function public.check_business_path_placement_specialization_track();

alter table public.business_path_placements enable row level security;
grant select on public.business_path_placements to authenticated;
create policy business_path_placements_select on public.business_path_placements for select using (auth.uid() is not null);
grant insert, update, delete on public.business_path_placements to authenticated;
create policy business_path_placements_admin_insert on public.business_path_placements for insert with check (public.current_role() = 'admin');
create policy business_path_placements_admin_update on public.business_path_placements for update using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
create policy business_path_placements_admin_delete on public.business_path_placements for delete using (public.current_role() = 'admin');

-- ---------- business_path_placement_dependencies: ported content_assignment_dependencies ----------
create table public.business_path_placement_dependencies (
  business_path_placement_id uuid not null references public.business_path_placements(id) on delete cascade,
  depends_on_business_path_placement_id uuid not null references public.business_path_placements(id) on delete cascade,
  primary key (business_path_placement_id, depends_on_business_path_placement_id),
  check (business_path_placement_id <> depends_on_business_path_placement_id)
);

alter table public.business_path_placement_dependencies enable row level security;
grant select, insert, delete on public.business_path_placement_dependencies to authenticated;
create policy business_path_placement_dependencies_select on public.business_path_placement_dependencies for select using (auth.uid() is not null);
create policy business_path_placement_dependencies_admin_insert on public.business_path_placement_dependencies for insert with check (public.current_role() = 'admin');
create policy business_path_placement_dependencies_admin_delete on public.business_path_placement_dependencies for delete using (public.current_role() = 'admin');

-- ---------- member_business_path_progress: write-of-record ONLY for content_type='bare' ----------
-- Mirrors member_progress's exact role (0027) -- course/assignment
-- placements derive "done" live from enrollments/assignment_submissions,
-- no duplicated write path.
create table public.member_business_path_progress (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references public.profiles(id) on delete cascade,
  business_path_placement_id uuid not null references public.business_path_placements(id) on delete cascade,
  completed_at timestamptz not null default now(),
  unique (uid, business_path_placement_id)
);
create index member_business_path_progress_uid_idx on public.member_business_path_progress (uid);

alter table public.member_business_path_progress enable row level security;
grant select on public.member_business_path_progress to authenticated;
create policy member_business_path_progress_select on public.member_business_path_progress for select
  using (uid = auth.uid() or public.current_role() = 'admin');
-- No insert/update/delete grant: written only by complete_business_path_placement /
-- review_business_path_evidence (0051, both SECURITY DEFINER).

-- ---------- business_path_evidence_submissions: generalized Review for bare placements ----------
-- A genuinely new table, not a repoint of content_evidence_submissions --
-- that table is left untouched, serving the individual-task feature only
-- going forward. Mirrors its exact shape (0033).
create table public.business_path_evidence_submissions (
  id uuid primary key default gen_random_uuid(),
  business_path_placement_id uuid not null references public.business_path_placements(id) on delete cascade,
  uid uuid not null references public.profiles(id) on delete cascade,
  text_response text default '',
  file_urls text[] default '{}',
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'needs_revision')),
  feedback text default '',
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  submitted_at timestamptz not null default now(),
  unique (business_path_placement_id, uid)
);
create index business_path_evidence_submissions_status_idx on public.business_path_evidence_submissions (status, submitted_at);

alter table public.business_path_evidence_submissions enable row level security;
grant select on public.business_path_evidence_submissions to authenticated;
create policy business_path_evidence_submissions_select on public.business_path_evidence_submissions for select
  using (uid = auth.uid() or public.current_role() = 'admin');
-- no client insert/update grant: written only by submit_business_path_evidence /
-- review_business_path_evidence (0051).
