-- ================= HQ360 restructure: Stage 4 — Income Development (§8) =================
-- Schema + RPCs land now (member-owned data, same shape as Goals/Reports
-- elsewhere in this app); the Overview/Portfolio/Income/Milestones tabbed
-- frontend itself is deferred alongside Skill Development (its "Skill
-- Catalog" tab reuses that editor, per §8.2).

-- Link table into the shared library, mirrors personal_development_resources
-- but purpose='freelancing'.
create table public.income_development_resources (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id),
  resource_id uuid not null references public.resources(id) on delete cascade,
  added_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (org_id, resource_id)
);

alter table public.income_development_resources enable row level security;
grant select on public.income_development_resources to authenticated;
create policy income_dev_resources_select on public.income_development_resources for select using (auth.uid() is not null);

create table public.income_development_progress (
  org_id uuid not null default public.current_org_id() references public.organizations(id),
  user_id uuid not null references public.profiles(id) on delete cascade,
  skill_selected_at timestamptz,
  skill_name text,
  portfolio_built_at timestamptz,
  freelancing_started_at timestamptz,
  first_income_at timestamptz,
  consistency_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

alter table public.income_development_progress enable row level security;
grant select on public.income_development_progress to authenticated;
create policy income_dev_progress_select on public.income_development_progress for select
  using (user_id = auth.uid() or public.current_role() in ('admin', 'mentor'));

create table public.income_development_portfolio_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  link_url text,
  created_at timestamptz not null default now()
);
create index income_dev_portfolio_user_idx on public.income_development_portfolio_items (user_id);

alter table public.income_development_portfolio_items enable row level security;
grant select on public.income_development_portfolio_items to authenticated;
create policy income_dev_portfolio_select on public.income_development_portfolio_items for select
  using (user_id = auth.uid() or public.current_role() in ('admin', 'mentor'));

create table public.income_development_income_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  source text,
  earned_on date not null,
  note text,
  created_at timestamptz not null default now()
);
create index income_dev_entries_user_idx on public.income_development_income_entries (user_id, earned_on);

alter table public.income_development_income_entries enable row level security;
grant select on public.income_development_income_entries to authenticated;
create policy income_dev_entries_select on public.income_development_income_entries for select
  using (user_id = auth.uid() or public.current_role() in ('admin', 'mentor'));

-- ================= admin: curate the skill catalog resource list =================
create or replace function public.admin_add_income_resource(p_title text, p_file_type text, p_file_url text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resource_id uuid;
  v_link_id uuid;
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
  if coalesce(trim(p_file_url), '') = '' then
    raise exception 'a resource needs a file or link';
  end if;

  insert into public.resources (uploaded_by, title, file_url, file_type, purpose)
  values (auth.uid(), trim(p_title), trim(p_file_url), p_file_type, 'freelancing')
  returning id into v_resource_id;

  insert into public.income_development_resources (resource_id, added_by)
  values (v_resource_id, auth.uid())
  returning id into v_link_id;

  return v_link_id;
end;
$$;

revoke execute on function public.admin_add_income_resource(text, text, text) from public, anon;
grant execute on function public.admin_add_income_resource(text, text, text) to authenticated;

create or replace function public.admin_remove_income_resource(p_link_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;
  delete from public.income_development_resources where id = p_link_id;
end;
$$;

revoke execute on function public.admin_remove_income_resource(uuid) from public, anon;
grant execute on function public.admin_remove_income_resource(uuid) to authenticated;

-- ================= member: milestones =================
create or replace function public.ensure_income_progress_row()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.income_development_progress (org_id, user_id)
  values (public.current_org_id(), auth.uid())
  on conflict (org_id, user_id) do nothing;
end;
$$;

-- Milestone 1: enter a skill name.
create or replace function public.set_income_skill(p_skill_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(trim(p_skill_name), '') = '' then
    raise exception 'enter the skill you are learning';
  end if;
  perform public.ensure_income_progress_row();
  update public.income_development_progress
    set skill_name = trim(p_skill_name),
        skill_selected_at = coalesce(skill_selected_at, now()),
        updated_at = now()
    where org_id = public.current_org_id() and user_id = auth.uid();
end;
$$;

revoke execute on function public.set_income_skill(text) from public, anon;
grant execute on function public.set_income_skill(text) to authenticated;

-- Milestones 2/3/5: manual toggles. Milestone 4 (first income) is
-- deliberately NOT toggleable here -- it only auto-stamps from add_income_entry.
create or replace function public.toggle_income_milestone(p_milestone text, p_done boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_milestone not in ('portfolio_built', 'freelancing_started', 'consistency') then
    raise exception 'invalid or non-manual milestone: %', p_milestone;
  end if;
  perform public.ensure_income_progress_row();

  update public.income_development_progress
    set portfolio_built_at = case when p_milestone = 'portfolio_built' then (case when p_done then coalesce(portfolio_built_at, now()) else null end) else portfolio_built_at end,
        freelancing_started_at = case when p_milestone = 'freelancing_started' then (case when p_done then coalesce(freelancing_started_at, now()) else null end) else freelancing_started_at end,
        consistency_at = case when p_milestone = 'consistency' then (case when p_done then coalesce(consistency_at, now()) else null end) else consistency_at end,
        updated_at = now()
    where org_id = public.current_org_id() and user_id = auth.uid();
end;
$$;

revoke execute on function public.toggle_income_milestone(text, boolean) from public, anon;
grant execute on function public.toggle_income_milestone(text, boolean) to authenticated;

-- ================= member: portfolio =================
create or replace function public.add_income_portfolio_item(p_title text, p_description text, p_link_url text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if coalesce(trim(p_title), '') = '' then
    raise exception 'a portfolio item needs a title';
  end if;
  insert into public.income_development_portfolio_items (user_id, title, description, link_url)
  values (auth.uid(), trim(p_title), nullif(trim(p_description), ''), nullif(trim(p_link_url), ''))
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.add_income_portfolio_item(text, text, text) from public, anon;
grant execute on function public.add_income_portfolio_item(text, text, text) to authenticated;

create or replace function public.remove_income_portfolio_item(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.income_development_portfolio_items where id = p_id and user_id = auth.uid();
end;
$$;

revoke execute on function public.remove_income_portfolio_item(uuid) from public, anon;
grant execute on function public.remove_income_portfolio_item(uuid) to authenticated;

-- ================= member: income log (first entry auto-completes milestone 4) =================
create or replace function public.add_income_entry(p_amount numeric, p_source text, p_earned_on date, p_note text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'enter an amount greater than zero';
  end if;
  if p_earned_on is null then
    raise exception 'enter the date this was earned';
  end if;

  insert into public.income_development_income_entries (user_id, amount, source, earned_on, note)
  values (auth.uid(), p_amount, nullif(trim(p_source), ''), p_earned_on, nullif(trim(p_note), ''))
  returning id into v_id;

  perform public.ensure_income_progress_row();
  update public.income_development_progress
    set first_income_at = coalesce(first_income_at, now()), updated_at = now()
    where org_id = public.current_org_id() and user_id = auth.uid();

  return v_id;
end;
$$;

revoke execute on function public.add_income_entry(numeric, text, date, text) from public, anon;
grant execute on function public.add_income_entry(numeric, text, date, text) to authenticated;

create or replace function public.remove_income_entry(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.income_development_income_entries where id = p_id and user_id = auth.uid();
end;
$$;

revoke execute on function public.remove_income_entry(uuid) from public, anon;
grant execute on function public.remove_income_entry(uuid) to authenticated;

-- ================= member: overview aggregate =================
create or replace function public.get_my_income_development()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_progress record;
  v_portfolio_count int;
  v_total_earned numeric;
  v_milestones_done int;
begin
  select * into v_progress from public.income_development_progress
    where org_id = public.current_org_id() and user_id = v_uid;

  select count(*) into v_portfolio_count from public.income_development_portfolio_items where user_id = v_uid;
  select coalesce(sum(amount), 0) into v_total_earned from public.income_development_income_entries where user_id = v_uid;

  v_milestones_done := (case when v_progress.skill_selected_at is not null then 1 else 0 end)
    + (case when v_progress.portfolio_built_at is not null then 1 else 0 end)
    + (case when v_progress.freelancing_started_at is not null then 1 else 0 end)
    + (case when v_progress.first_income_at is not null then 1 else 0 end)
    + (case when v_progress.consistency_at is not null then 1 else 0 end);

  return jsonb_build_object(
    'skillName', v_progress.skill_name,
    'skillSelectedAt', v_progress.skill_selected_at,
    'portfolioBuiltAt', v_progress.portfolio_built_at,
    'freelancingStartedAt', v_progress.freelancing_started_at,
    'firstIncomeAt', v_progress.first_income_at,
    'consistencyAt', v_progress.consistency_at,
    'milestonesDone', v_milestones_done,
    'portfolioCount', v_portfolio_count,
    'totalEarned', v_total_earned
  );
end;
$$;

revoke execute on function public.get_my_income_development() from public, anon;
grant execute on function public.get_my_income_development() to authenticated;
