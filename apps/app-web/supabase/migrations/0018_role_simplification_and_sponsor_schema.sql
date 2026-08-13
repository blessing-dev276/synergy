-- Sponsor/network restructuring, part 1 of 3 (schema). Synergy is a network-
-- marketing platform: any member can sponsor another member simply by
-- inviting them, so "sponsor" is a relationship every member can hold, not
-- a separate login-role. Roles collapse to just 'member'/'admin'. See
-- apps/app-web's plan doc for full rationale.
--
-- Deploy order: this file, then 0019 (new RPCs + updated handle_new_user),
-- then the frontend build that stops calling list_inviters/get_my_mentor/
-- assign_mentor, then (only once that frontend is confirmed live) 0020,
-- which retires the now-dead mentor RPC surface and closes an RLS gap.
-- mentor_assignments/profiles.mentor_uid are NOT touched here or in 0019/
-- 0020 — by product decision they're kept as inert historical data for an
-- admin to review by hand (see 0020's LegacyMentors-facing report), not
-- auto-converted into sponsor relationships (a mentor wasn't necessarily
-- who actually invited their assigned members).

-- ---------- role simplification: member/admin only ----------
update public.profiles set role = 'member' where role = 'mentor';

-- The CHECK on profiles.role was declared inline/unnamed in 0001, so
-- Postgres auto-named it '<table>_<column>_check'. Guarded with IF EXISTS:
-- if the name ever turns out different in a given environment, this becomes
-- a harmless no-op rather than a failed migration, and the ADD CONSTRAINT
-- below still leaves the table correctly restricted to member/admin either
-- way (an extra redundant old constraint doesn't change behavior since
-- CHECK constraints are ANDed together).
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('member', 'admin'));

-- ---------- sponsor is a relationship, not a role: rename the pointer column ----------
-- Same server-set-only semantics as before (not in the profiles update
-- grant from 0002) — a member can never rewrite their own sponsor.
alter table public.profiles rename column invited_by_uid to sponsor_uid;
alter index profiles_invited_by_idx rename to profiles_sponsor_uid_idx;

-- ---------- sponsor_relationships: current + historical sponsor links ----------
-- Mirrors mentor_assignments' shape (active/assigned_by/assigned_at) but
-- enforces "exactly one active sponsor per member" via a partial unique
-- index instead of a plain unique(sponsor_uid, member_uid) pair — the
-- sponsor tree needs a single parent per node. Reassignment deactivates the
-- old row rather than deleting it, preserving the audit trail admins asked
-- for when a sponsor is changed.
create table public.sponsor_relationships (
  id uuid primary key default gen_random_uuid(),
  member_uid uuid not null references public.profiles(id) on delete cascade,
  sponsor_uid uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id),
  source text not null default 'signup' check (source in ('signup', 'admin_assigned', 'admin_reassigned', 'request_resolved')),
  active boolean not null default true,
  assigned_at timestamptz not null default now(),
  deactivated_at timestamptz,
  check (member_uid <> sponsor_uid)
);
create unique index sponsor_relationships_member_active_uidx on public.sponsor_relationships (member_uid) where (active = true);
create index sponsor_relationships_sponsor_active_idx on public.sponsor_relationships (sponsor_uid, active);
create index sponsor_relationships_member_idx on public.sponsor_relationships (member_uid);

alter table public.sponsor_relationships enable row level security;
grant select on public.sponsor_relationships to authenticated;
create policy sponsor_relationships_select on public.sponsor_relationships for select
  using (public.current_role() = 'admin' or sponsor_uid = auth.uid() or member_uid = auth.uid());
-- No insert/update/delete grant: written only by handle_new_user (trigger,
-- bypasses RLS) and assign_sponsor/resolve_sponsor_request (0017, SECURITY
-- DEFINER). This select grant is a same-row/admin fallback, not the
-- network-tree read path — get_network/get_personally_sponsored (0017) are
-- RPCs precisely because a member querying this table directly with an
-- embedded profiles!... join would get every downline profile stripped to
-- null by profiles_select's RLS (embeds apply the embedded table's own
-- RLS independently of the outer query).

-- ---------- sponsor_requests: unmatched free-text sponsor claims at signup ----------
-- The name is captured exactly as typed and is never overwritten — even
-- once resolved/rejected, claimed_sponsor_name stays as the original record.
create table public.sponsor_requests (
  id uuid primary key default gen_random_uuid(),
  member_uid uuid not null references public.profiles(id) on delete cascade,
  claimed_sponsor_name text not null,
  status text not null default 'pending' check (status in ('pending', 'resolved', 'rejected')),
  resolved_sponsor_uid uuid references public.profiles(id),
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  resolution_note text not null default '',
  created_at timestamptz not null default now()
);
-- At most one open claim per member at a time.
create unique index sponsor_requests_member_pending_uidx on public.sponsor_requests (member_uid) where (status = 'pending');
create index sponsor_requests_status_idx on public.sponsor_requests (status, created_at desc);
create index sponsor_requests_member_idx on public.sponsor_requests (member_uid);

alter table public.sponsor_requests enable row level security;
grant select on public.sponsor_requests to authenticated;
create policy sponsor_requests_select on public.sponsor_requests for select
  using (public.current_role() = 'admin' or member_uid = auth.uid());
-- No insert/update/delete grant: written by handle_new_user (trigger) and
-- resolve_sponsor_request/reject_sponsor_request (0017, SECURITY DEFINER).
