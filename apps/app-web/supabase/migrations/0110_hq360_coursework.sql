-- ================= HQ360 restructure: shared infra — coursework (§4.3) =================
-- Schema only in this pass, same reasoning as 0109: Skill Development items
-- and Task steps need `coursework_assignments` to exist as an FK target
-- before their own editors are built. The assignment MANAGER (create/review)
-- frontend is deferred; no write RPCs here yet.

create table public.coursework_assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id),
  title text not null,
  instructions text,
  reference_link text,
  require_note boolean not null default true,
  require_link boolean not null default false,
  due_date date,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (require_note or require_link)
);
create index coursework_assignments_org_idx on public.coursework_assignments (org_id);

alter table public.coursework_assignments enable row level security;
grant select on public.coursework_assignments to authenticated;
create policy coursework_assignments_select on public.coursework_assignments for select using (auth.uid() is not null);

-- Targeting is a one-time snapshot: assigned_to_user is who it's for; a
-- future group-targeting column (assigned_to_group) is left for when the
-- assignment editor actually needs it -- not adding an unused FK now.
create table public.coursework_targets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id),
  assignment_id uuid not null references public.coursework_assignments(id) on delete cascade,
  assigned_to_user uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (assignment_id, assigned_to_user)
);
create index coursework_targets_user_idx on public.coursework_targets (assigned_to_user);

alter table public.coursework_targets enable row level security;
grant select on public.coursework_targets to authenticated;
create policy coursework_targets_select on public.coursework_targets for select
  using (assigned_to_user = auth.uid() or public.current_role() in ('admin', 'mentor'));

create table public.coursework_submissions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id),
  assignment_id uuid not null references public.coursework_assignments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  note text,
  link text,
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'rejected', 'changes_requested')),
  review_note text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  submitted_at timestamptz not null default now(),
  unique (assignment_id, user_id)
);
create index coursework_submissions_user_idx on public.coursework_submissions (user_id);

alter table public.coursework_submissions enable row level security;
grant select on public.coursework_submissions to authenticated;
create policy coursework_submissions_select on public.coursework_submissions for select
  using (user_id = auth.uid() or public.current_role() in ('admin', 'mentor'));

-- "Done = a coursework_submissions row with status='approved'" -- one place
-- for downstream derived-completion checks to call.
create or replace function public.has_approved_coursework(p_assignment_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.coursework_submissions
    where assignment_id = p_assignment_id and user_id = p_user_id and status = 'approved'
  );
$$;

grant execute on function public.has_approved_coursework(uuid, uuid) to authenticated;
