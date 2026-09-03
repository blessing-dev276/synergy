-- ================= HQ360 Learning Center restructure — Phase 1 =================
-- Rebuilding the Learning Hub to the HQ360 Learning Center / Training spec
-- (see LEARNING_CENTER_TRAINING_STRUCTURE.md). This is explicitly a new,
-- parallel system, not a rename of the existing one: Synergy's current
-- learning_paths/courses/modules/lessons stay exactly as they are (real
-- published content, real member progress) -- nothing here touches or
-- deletes them. Training is the new primary member-facing experience;
-- migrating/retiring the old Learning Hub content is a follow-up once
-- Training is fully built out here.
--
-- Multi-tenancy: HQ360 scopes every table by org_id. Synergy has no
-- concept of "office" today (checked: zero org_id anywhere) and isn't
-- adding real org creation/switching/signup in this pass -- that's a much
-- bigger, separate authentication project. Instead: one real
-- organizations row (Synergy itself), and every new HQ360-shaped table
-- carries org_id defaulting to it. The shape matches the spec exactly;
-- there's just one tenant using it, which is the truth today. If real
-- multi-org ever becomes a requirement, every table here is already
-- structured for it.
--
-- Roles: HQ360 has admin/trainer/team_leader/member. Synergy's profiles.role
-- is admin/mentor/member (no team_leader) -- not widened here, too invasive
-- (touches every existing RLS policy). Mapping used throughout this
-- restructure: HQ360 "trainer" -> Synergy "mentor"; "manage" access below
-- means role in ('admin','mentor') unless a step says admin-only.

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

insert into public.organizations (id, name) values
  ('00000000-0000-0000-0000-000000000001', 'Synergy')
on conflict (id) do nothing;

-- Every authenticated user belongs to the one real org for now. A
-- function (not a hardcoded literal sprinkled through every RLS policy)
-- so the "how do I find my org" question has one answer if that ever
-- changes.
create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select '00000000-0000-0000-0000-000000000001'::uuid;
$$;

grant execute on function public.current_org_id() to authenticated;

-- ================= resources: the file/link library =================
create table public.resources (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id),
  uploaded_by uuid references public.profiles(id),
  title text not null,
  file_url text not null,
  file_type text not null check (file_type in ('pdf', 'podcast', 'video')),
  purpose text not null default 'skill_set' check (purpose in ('book', 'skill_set', 'freelancing')),
  skill_tags text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index resources_org_purpose_idx on public.resources (org_id, purpose);

alter table public.resources enable row level security;
grant select on public.resources to authenticated;
create policy resources_select on public.resources for select using (auth.uid() is not null);
-- no client insert/update/delete: written only through create_resource/
-- delete_resource below, same server-authoritative posture as everything
-- else admin-authored in this app.

create or replace function public.create_resource(
  p_title text, p_file_url text, p_file_type text, p_purpose text, p_skill_tags text[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'a resource needs a title';
  end if;
  if p_file_type not in ('pdf', 'podcast', 'video') then
    raise exception 'invalid file type: %', p_file_type;
  end if;
  if p_purpose not in ('book', 'skill_set', 'freelancing') then
    raise exception 'invalid purpose: %', p_purpose;
  end if;

  insert into public.resources (uploaded_by, title, file_url, file_type, purpose, skill_tags)
  values (auth.uid(), trim(p_title), p_file_url, p_file_type, p_purpose, coalesce(p_skill_tags, '{}'))
  returning id into v_id;

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'resource_created', 'resource', v_id::text, jsonb_build_object('purpose', p_purpose));

  return v_id;
end;
$$;

revoke execute on function public.create_resource(text, text, text, text, text[]) from public, anon;
grant execute on function public.create_resource(text, text, text, text, text[]) to authenticated;

create or replace function public.delete_resource(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;
  delete from public.resources where id = p_id;
end;
$$;

revoke execute on function public.delete_resource(uuid) from public, anon;
grant execute on function public.delete_resource(uuid) to authenticated;

-- ================= storage: onboarding bucket (course-content already exists, 0004) =================
insert into storage.buckets (id, name, public)
values ('onboarding', 'onboarding', false)
on conflict (id) do nothing;

create policy onboarding_read on storage.objects for select
  using (bucket_id = 'onboarding' and auth.role() = 'authenticated');
create policy onboarding_write on storage.objects for insert
  with check (bucket_id = 'onboarding' and public.current_role() in ('admin', 'mentor'));
create policy onboarding_update on storage.objects for update
  using (bucket_id = 'onboarding' and public.current_role() in ('admin', 'mentor'));
create policy onboarding_delete on storage.objects for delete
  using (bucket_id = 'onboarding' and public.current_role() in ('admin', 'mentor'));
