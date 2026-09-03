-- ================= HQ360 restructure: Stage 5 — Network Marketing (§9) =================
-- v1 slice per the spec: curated products/basics (admin) + a per-member CRM
-- pipeline (contacts + activity timeline). Schema + RPCs land now; the
-- NetworkMarketingHub frontend is deferred with the rest of the Training
-- stages beyond Onboarding/Personal Development. This is a distinct system
-- from Synergy's existing "My Network" (/network, real referral tree) --
-- nothing here touches that table.

create table public.network_marketing_products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id),
  name text not null,
  description text,
  link_url text,
  added_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.network_marketing_products enable row level security;
grant select on public.network_marketing_products to authenticated;
create policy nm_products_select on public.network_marketing_products for select using (auth.uid() is not null);

create table public.network_marketing_basics (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id),
  title text not null,
  description text,
  link_url text,
  added_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.network_marketing_basics enable row level security;
grant select on public.network_marketing_basics to authenticated;
create policy nm_basics_select on public.network_marketing_basics for select using (auth.uid() is not null);

create table public.network_marketing_contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id),
  user_id uuid not null references public.profiles(id) on delete cascade,
  full_name text not null,
  phone text,
  email text,
  stage text not null default 'prospect' check (stage in ('prospect', 'invited', 'presented', 'followed_up', 'won_customer', 'won_distributor', 'lost')),
  interested_product_id uuid references public.network_marketing_products(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index nm_contacts_user_idx on public.network_marketing_contacts (user_id, stage);

alter table public.network_marketing_contacts enable row level security;
grant select on public.network_marketing_contacts to authenticated;
create policy nm_contacts_select on public.network_marketing_contacts for select
  using (user_id = auth.uid() or public.current_role() in ('admin', 'mentor'));

create table public.network_marketing_activities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id),
  contact_id uuid not null references public.network_marketing_contacts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  note text,
  stage text not null check (stage in ('prospect', 'invited', 'presented', 'followed_up', 'won_customer', 'won_distributor', 'lost')),
  created_at timestamptz not null default now()
);
create index nm_activities_contact_idx on public.network_marketing_activities (contact_id, created_at);

alter table public.network_marketing_activities enable row level security;
grant select on public.network_marketing_activities to authenticated;
create policy nm_activities_select on public.network_marketing_activities for select
  using (user_id = auth.uid() or public.current_role() in ('admin', 'mentor'));

-- ================= admin: curate products + basics =================
create or replace function public.admin_add_nm_product(p_name text, p_description text, p_link_url text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'a product needs a name';
  end if;
  insert into public.network_marketing_products (name, description, link_url, added_by)
  values (trim(p_name), nullif(trim(p_description), ''), nullif(trim(p_link_url), ''), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.admin_add_nm_product(text, text, text) from public, anon;
grant execute on function public.admin_add_nm_product(text, text, text) to authenticated;

create or replace function public.admin_remove_nm_product(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;
  delete from public.network_marketing_products where id = p_id;
end;
$$;

revoke execute on function public.admin_remove_nm_product(uuid) from public, anon;
grant execute on function public.admin_remove_nm_product(uuid) to authenticated;

create or replace function public.admin_add_nm_basic(p_title text, p_description text, p_link_url text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'a basics link needs a title';
  end if;
  insert into public.network_marketing_basics (title, description, link_url, added_by)
  values (trim(p_title), nullif(trim(p_description), ''), nullif(trim(p_link_url), ''), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.admin_add_nm_basic(text, text, text) from public, anon;
grant execute on function public.admin_add_nm_basic(text, text, text) to authenticated;

create or replace function public.admin_remove_nm_basic(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;
  delete from public.network_marketing_basics where id = p_id;
end;
$$;

revoke execute on function public.admin_remove_nm_basic(uuid) from public, anon;
grant execute on function public.admin_remove_nm_basic(uuid) to authenticated;

-- ================= member: own pipeline =================
create or replace function public.add_nm_contact(
  p_full_name text, p_phone text, p_email text, p_interested_product_id uuid, p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if coalesce(trim(p_full_name), '') = '' then
    raise exception 'a contact needs a name';
  end if;
  insert into public.network_marketing_contacts (user_id, full_name, phone, email, interested_product_id, notes)
  values (auth.uid(), trim(p_full_name), nullif(trim(p_phone), ''), nullif(trim(p_email), ''), p_interested_product_id, nullif(trim(p_notes), ''))
  returning id into v_id;

  insert into public.network_marketing_activities (contact_id, user_id, note, stage)
  values (v_id, auth.uid(), 'Added as a prospect', 'prospect');

  return v_id;
end;
$$;

revoke execute on function public.add_nm_contact(text, text, text, uuid, text) from public, anon;
grant execute on function public.add_nm_contact(text, text, text, uuid, text) to authenticated;

create or replace function public.update_nm_contact(
  p_id uuid, p_full_name text, p_phone text, p_email text, p_interested_product_id uuid, p_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(trim(p_full_name), '') = '' then
    raise exception 'a contact needs a name';
  end if;
  update public.network_marketing_contacts
    set full_name = trim(p_full_name), phone = nullif(trim(p_phone), ''), email = nullif(trim(p_email), ''),
        interested_product_id = p_interested_product_id, notes = nullif(trim(p_notes), ''), updated_at = now()
    where id = p_id and user_id = auth.uid();
end;
$$;

revoke execute on function public.update_nm_contact(uuid, text, text, text, uuid, text) from public, anon;
grant execute on function public.update_nm_contact(uuid, text, text, text, uuid, text) to authenticated;

-- Moves the pipeline stage and logs it to the activity timeline in one step.
create or replace function public.set_nm_contact_stage(p_contact_id uuid, p_stage text, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_stage not in ('prospect', 'invited', 'presented', 'followed_up', 'won_customer', 'won_distributor', 'lost') then
    raise exception 'invalid stage: %', p_stage;
  end if;
  if not exists (select 1 from public.network_marketing_contacts where id = p_contact_id and user_id = auth.uid()) then
    raise exception 'contact not found';
  end if;

  update public.network_marketing_contacts set stage = p_stage, updated_at = now() where id = p_contact_id;

  insert into public.network_marketing_activities (contact_id, user_id, note, stage)
  values (p_contact_id, auth.uid(), nullif(trim(p_note), ''), p_stage);
end;
$$;

revoke execute on function public.set_nm_contact_stage(uuid, text, text) from public, anon;
grant execute on function public.set_nm_contact_stage(uuid, text, text) to authenticated;

-- A note without a stage change -- logged at the contact's current stage.
create or replace function public.add_nm_activity_note(p_contact_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stage text;
begin
  select stage into v_stage from public.network_marketing_contacts where id = p_contact_id and user_id = auth.uid();
  if v_stage is null then
    raise exception 'contact not found';
  end if;
  if coalesce(trim(p_note), '') = '' then
    raise exception 'enter a note';
  end if;
  insert into public.network_marketing_activities (contact_id, user_id, note, stage)
  values (p_contact_id, auth.uid(), trim(p_note), v_stage);
end;
$$;

revoke execute on function public.add_nm_activity_note(uuid, text) from public, anon;
grant execute on function public.add_nm_activity_note(uuid, text) to authenticated;

create or replace function public.remove_nm_contact(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.network_marketing_contacts where id = p_id and user_id = auth.uid();
end;
$$;

revoke execute on function public.remove_nm_contact(uuid) from public, anon;
grant execute on function public.remove_nm_contact(uuid) to authenticated;
