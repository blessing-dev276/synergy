-- Journey model: Stage -> (Skill/Business/Freelancing) Track -> Task, layered on
-- top of the existing content tables (courses/lessons/assignments unchanged).
-- See apps/app-web's plan doc for rationale. Additive only, per the
-- forward-only migration convention established by 0005-0007.

-- ---------- stages (admin-configurable, ordered) ----------
create table public.stages (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  title text not null,
  description text default '',
  order_index int not null default 0,
  published boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index stages_order_idx on public.stages (order_index);

-- ---------- tracks (fixed set of 3 by product design; admins may relabel/re-icon) ----------
create table public.tracks (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key in ('skill', 'business', 'freelancing')),
  label text not null,
  icon text default '',
  color_token text default ''
);

insert into public.tracks (key, label, icon, color_token) values
  ('skill', 'Skill', '🎯', '--blue'),
  ('business', 'Business', '💼', '--gold'),
  ('freelancing', 'Freelancing', '💻', '--success');

-- ---------- stage_tracks: which tracks are active in a given stage ----------
create table public.stage_tracks (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.stages(id) on delete cascade,
  track_id uuid not null references public.tracks(id) on delete cascade,
  intro_text text default '',
  unique (stage_id, track_id)
);
create index stage_tracks_stage_idx on public.stage_tracks (stage_id);

-- ---------- generalize tasks: stage/track tagging, type, XP, dependencies ----------
alter table public.tasks add column stage_id uuid references public.stages(id);
alter table public.tasks add column track_id uuid references public.tracks(id);
alter table public.tasks add column task_type text not null default 'practical' check (task_type in
  ('learning', 'practical', 'business_activity', 'freelancing_activity',
   'reflection', 'submission', 'attendance', 'milestone'));
alter table public.tasks add column xp_reward int not null default 0;
alter table public.tasks add column is_required boolean not null default true;
alter table public.tasks add column requires_mentor_approval boolean not null default false;
alter table public.tasks add column linked_course_id uuid references public.courses(id);
alter table public.tasks add column linked_assignment_id uuid references public.assignments(id);
create index tasks_stage_track_idx on public.tasks (stage_id, track_id);

create table public.task_dependencies (
  task_id uuid not null references public.tasks(id) on delete cascade,
  depends_on_task_id uuid not null references public.tasks(id) on delete cascade,
  primary key (task_id, depends_on_task_id),
  check (task_id <> depends_on_task_id)
);

-- ---------- member_journey: one row per member, tracks current stage ----------
create table public.member_journey (
  uid uuid primary key references public.profiles(id) on delete cascade,
  current_stage_id uuid references public.stages(id),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- progress weighting (admin-configurable, singleton row) ----------
create table public.progress_weights (
  id boolean primary key default true check (id),
  training_weight int not null default 40,
  tasks_weight int not null default 40,
  assignments_weight int not null default 20
);
insert into public.progress_weights (id) values (true);

-- ================= RLS =================

alter table public.stages enable row level security;
grant select, insert, update, delete on public.stages to authenticated;
create policy stages_select on public.stages for select using (auth.uid() is not null);
create policy stages_admin_insert on public.stages for insert with check (public.current_role() = 'admin');
create policy stages_admin_update on public.stages for update using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
create policy stages_admin_delete on public.stages for delete using (public.current_role() = 'admin');

alter table public.tracks enable row level security;
grant select, update on public.tracks to authenticated;
create policy tracks_select on public.tracks for select using (auth.uid() is not null);
create policy tracks_admin_update on public.tracks for update using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

alter table public.stage_tracks enable row level security;
grant select, insert, update, delete on public.stage_tracks to authenticated;
create policy stage_tracks_select on public.stage_tracks for select using (auth.uid() is not null);
create policy stage_tracks_admin_insert on public.stage_tracks for insert with check (public.current_role() = 'admin');
create policy stage_tracks_admin_update on public.stage_tracks for update using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
create policy stage_tracks_admin_delete on public.stage_tracks for delete using (public.current_role() = 'admin');

alter table public.task_dependencies enable row level security;
grant select, insert, delete on public.task_dependencies to authenticated;
create policy task_dependencies_select on public.task_dependencies for select using (auth.uid() is not null);
create policy task_dependencies_admin_insert on public.task_dependencies for insert with check (public.current_role() = 'admin');
create policy task_dependencies_admin_delete on public.task_dependencies for delete using (public.current_role() = 'admin');

alter table public.member_journey enable row level security;
grant select on public.member_journey to authenticated;
create policy member_journey_select on public.member_journey for select
  using (uid = auth.uid() or public.current_role() = 'admin' or public.is_assigned_mentor_of(uid));
-- no client insert/update grant: rows are written by advance_member_stage (below), SECURITY DEFINER.

alter table public.progress_weights enable row level security;
grant select, update on public.progress_weights to authenticated;
create policy progress_weights_select on public.progress_weights for select using (auth.uid() is not null);
create policy progress_weights_admin_update on public.progress_weights for update using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
