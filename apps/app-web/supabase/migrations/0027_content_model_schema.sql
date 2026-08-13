-- Content/Journey model refactor, part 1 of 5 (schema, additive only).
-- Replaces stages -> tracks -> tasks with stages -> tracks -> content
-- assignments -> member progress. See apps/app-web's plan doc for full
-- rationale; short version: `tasks` has no template/definition row (every
-- "task" is N duplicate rows, one per assigned member, fanned out by
-- StageBuilder.jsx and edited/deleted by fragile stage+track+title
-- matching), and content (courses/assignments) is 100% non-reusable with
-- no "place this into a stage/track" concept anywhere. `content_items` is
-- the reusable library card (created once); `content_assignments` is the
-- placement (stable id, one row per placement, not per member).
--
-- Deploy order: this file, then 0028 (new RPCs, including _v2-suffixed
-- rewrites of the functions that read `tasks` today, deployed alongside
-- the untouched originals for parity testing), then 0029 (one-time data
-- migration + verification), then 0030 (cutover: repoint real RPC names
-- at the _v2 bodies), then the frontend deploy, then (only once that
-- frontend build is confirmed live) 0031, which drops
-- tasks/task_completions/task_dependencies/progress_weights and the old
-- RPCs. `tasks` and friends are NOT touched in this file — additive only.

-- ---------- content_items: the reusable library card, created once ----------
create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  content_type text not null check (content_type in ('course', 'assignment', 'bare')),
  course_id uuid references public.courses(id) on delete cascade,
  assignment_id uuid references public.assignments(id) on delete cascade,
  title text,               -- required only for 'bare'; course/assignment types are labeled via live join, see search_content_items (0028)
  description text default '',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (
    (content_type = 'course' and course_id is not null and assignment_id is null) or
    (content_type = 'assignment' and assignment_id is not null and course_id is null) or
    (content_type = 'bare' and course_id is null and assignment_id is null and coalesce(title, '') <> '')
  )
);
-- Unique per course/assignment: content_items is the reusable "library card" —
-- reuse itself happens at the content_assignments layer (one content_item,
-- many placements), not by allowing duplicate wrapper rows here.
create unique index content_items_course_uidx on public.content_items (course_id) where course_id is not null;
create unique index content_items_assignment_uidx on public.content_items (assignment_id) where assignment_id is not null;

alter table public.content_items enable row level security;
grant select on public.content_items to authenticated;
create policy content_items_select on public.content_items for select using (auth.uid() is not null);
grant insert, update, delete on public.content_items to authenticated;
create policy content_items_admin_insert on public.content_items for insert with check (public.current_role() = 'admin');
create policy content_items_admin_update on public.content_items for update using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
create policy content_items_admin_delete on public.content_items for delete using (public.current_role() = 'admin');

-- ---------- content_assignments: WHEN/WHERE members encounter a content_item ----------
-- One row per placement (not per member) -- the fix for tasks' core problem.
-- task_type/xp_reward/is_required/requires_admin_approval/specialization_id
-- live here, not on content_items, because the same content_item can be
-- placed multiple times with different placement-specific settings (e.g.
-- a course as a light optional touchpoint in Stage 1, required+graded as a
-- capstone in Stage 4).
create table public.content_assignments (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  stage_id uuid references public.stages(id) on delete cascade,
  track_id uuid references public.tracks(id) on delete cascade,
  specialization_id uuid references public.track_specializations(id), -- ported placement column (was tasks.specialization_id, 0017)
  task_type text not null default 'practical' check (task_type in
    ('learning', 'practical', 'business_activity', 'freelancing_activity',
     'reflection', 'submission', 'attendance', 'milestone')),
  xp_reward int not null default 0,
  is_required boolean not null default true,
  requires_admin_approval boolean not null default false,
  due_date timestamptz,
  order_index int not null default 0,
  scope text not null default 'stage_track' check (scope in ('stage_track', 'individual')),
  assigned_to_uid uuid references public.profiles(id) on delete cascade, -- set iff scope='individual'
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (
    (scope = 'stage_track' and assigned_to_uid is null and stage_id is not null and track_id is not null) or
    (scope = 'individual' and assigned_to_uid is not null)
  )
);
create index content_assignments_stage_track_idx on public.content_assignments (stage_id, track_id);
create index content_assignments_content_item_idx on public.content_assignments (content_item_id);
create index content_assignments_individual_idx on public.content_assignments (assigned_to_uid) where assigned_to_uid is not null;

-- Mirrors 0017's check_task_specialization_track: specialization_id, if set,
-- must belong to the same track as the placement.
create or replace function public.check_content_assignment_specialization_track()
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
    raise exception 'specialization does not belong to this placement''s track';
  end if;
  return new;
end;
$$;

create trigger content_assignments_specialization_track_check
  before insert or update of specialization_id, track_id on public.content_assignments
  for each row execute function public.check_content_assignment_specialization_track();

-- Mirrors 0013's notify_task_assigned, individual placements only --
-- stage_track placements shouldn't spam a "new task" notification to
-- nobody in particular.
create or replace function public.notify_content_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
begin
  if new.scope = 'individual' and new.assigned_to_uid is not null then
    select coalesce(ci.title, c.title, a.title) into v_title
      from public.content_items ci
      left join public.courses c on c.id = ci.course_id
      left join public.assignments a on a.id = ci.assignment_id
      where ci.id = new.content_item_id;

    insert into public.notifications (uid, type, title, body, link_to)
    values (new.assigned_to_uid, 'task_assigned', 'New activity assigned', coalesce(v_title, 'A new activity'), '/tasks');
  end if;
  return new;
end;
$$;

revoke execute on function public.notify_content_assignment() from public, anon, authenticated;

create trigger on_content_assignment_created
  after insert on public.content_assignments
  for each row execute function public.notify_content_assignment();

alter table public.content_assignments enable row level security;
grant select on public.content_assignments to authenticated;
-- Tightens a real, currently-live gap: tasks_select (0002) has no
-- assigned_to_uid scoping at all today, so any member can read any other
-- member's individual tasks straight off the table. This closes that.
create policy content_assignments_select on public.content_assignments for select
  using (scope = 'stage_track' or assigned_to_uid = auth.uid() or public.current_role() = 'admin');
grant insert, update, delete on public.content_assignments to authenticated;
create policy content_assignments_admin_insert on public.content_assignments for insert with check (public.current_role() = 'admin');
create policy content_assignments_admin_update on public.content_assignments for update using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
create policy content_assignments_admin_delete on public.content_assignments for delete using (public.current_role() = 'admin');

-- ---------- content_assignment_dependencies: ported task_dependencies ----------
create table public.content_assignment_dependencies (
  content_assignment_id uuid not null references public.content_assignments(id) on delete cascade,
  depends_on_content_assignment_id uuid not null references public.content_assignments(id) on delete cascade,
  primary key (content_assignment_id, depends_on_content_assignment_id),
  check (content_assignment_id <> depends_on_content_assignment_id)
);

alter table public.content_assignment_dependencies enable row level security;
grant select, insert, delete on public.content_assignment_dependencies to authenticated;
create policy content_assignment_dependencies_select on public.content_assignment_dependencies for select using (auth.uid() is not null);
create policy content_assignment_dependencies_admin_insert on public.content_assignment_dependencies for insert with check (public.current_role() = 'admin');
create policy content_assignment_dependencies_admin_delete on public.content_assignment_dependencies for delete using (public.current_role() = 'admin');

-- ---------- member_progress: write-of-record ONLY for content_type='bare' ----------
-- Mirrors task_completions' exact role. course/assignment placements derive
-- "done" live from enrollments/assignment_submissions (unchanged, already-
-- correct machinery) -- no duplicated write path, no dual-write sync risk.
create table public.member_progress (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references public.profiles(id) on delete cascade,
  content_assignment_id uuid not null references public.content_assignments(id) on delete cascade,
  completed_at timestamptz not null default now(),
  unique (uid, content_assignment_id)
);
create index member_progress_uid_idx on public.member_progress (uid);

alter table public.member_progress enable row level security;
grant select on public.member_progress to authenticated;
create policy member_progress_select on public.member_progress for select
  using (uid = auth.uid() or public.current_role() = 'admin');
-- No insert/update/delete grant: written only by complete_content_assignment
-- (0028, SECURITY DEFINER) -- mirrors 0010_task_completion_guardrails.sql's
-- lockdown of task_completions (routed through can_self_complete_task there).
