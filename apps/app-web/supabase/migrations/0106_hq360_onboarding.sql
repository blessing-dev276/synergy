-- ================= HQ360 restructure: Stage 1 — Onboarding =================
-- One-time, linear, self-reported checklist: Business Explanation ->
-- Network Varsity -> Office Policy -> Registration Link. This is a new,
-- parallel onboarding to the existing signup-blocking OnboardingFlow.jsx
-- (bio/photo/skill picker) -- that one stays exactly as is (it gates
-- account creation itself); this is the content-driven orientation stage
-- of the new Training journey.

create table public.onboarding_settings (
  org_id uuid primary key references public.organizations(id),
  registration_link text,
  updated_at timestamptz not null default now()
);
insert into public.onboarding_settings (org_id) values (public.current_org_id())
on conflict (org_id) do nothing;

alter table public.onboarding_settings enable row level security;
grant select on public.onboarding_settings to authenticated;
create policy onboarding_settings_select on public.onboarding_settings for select using (auth.uid() is not null);

create table public.onboarding_step_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id),
  step text not null check (step in ('business_explanation', 'network_varsity', 'office_policy')),
  type text not null check (type in ('pdf', 'video', 'link')),
  title text not null,
  file_path text,
  link_url text,
  order_index int not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (
    (type in ('pdf', 'video') and file_path is not null and link_url is null)
    or (type = 'link' and link_url is not null and file_path is null)
  )
);
create index onboarding_step_items_org_step_idx on public.onboarding_step_items (org_id, step, order_index);

alter table public.onboarding_step_items enable row level security;
grant select on public.onboarding_step_items to authenticated;
create policy onboarding_step_items_select on public.onboarding_step_items for select using (auth.uid() is not null);

create table public.onboarding_progress (
  org_id uuid not null default public.current_org_id() references public.organizations(id),
  user_id uuid not null references public.profiles(id) on delete cascade,
  business_explanation_viewed_at timestamptz,
  network_varsity_completed_at timestamptz,
  policy_acknowledged_at timestamptz,
  registered_at timestamptz,
  primary key (org_id, user_id)
);

alter table public.onboarding_progress enable row level security;
grant select on public.onboarding_progress to authenticated;
create policy onboarding_progress_select on public.onboarding_progress for select
  using (user_id = auth.uid() or public.current_role() = 'admin');
-- no client insert/update grant: written only by complete_onboarding_step below.

-- ================= admin: author content =================
create or replace function public.admin_add_onboarding_item(
  p_step text, p_type text, p_title text, p_file_path text, p_link_url text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_next_order int;
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;
  if p_step not in ('business_explanation', 'network_varsity', 'office_policy') then
    raise exception 'invalid step: %', p_step;
  end if;
  if p_type not in ('pdf', 'video', 'link') then
    raise exception 'invalid type: %', p_type;
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'an item needs a title';
  end if;
  if p_type in ('pdf', 'video') and (p_file_path is null or p_link_url is not null) then
    raise exception 'pdf/video items need an uploaded file, not a link';
  end if;
  if p_type = 'link' and (p_link_url is null or p_file_path is not null) then
    raise exception 'link items need a URL, not a file';
  end if;

  select coalesce(max(order_index), 0) + 1 into v_next_order
    from public.onboarding_step_items where org_id = public.current_org_id() and step = p_step;

  insert into public.onboarding_step_items (step, type, title, file_path, link_url, order_index, created_by)
  values (p_step, p_type, trim(p_title), p_file_path, p_link_url, v_next_order, auth.uid())
  returning id into v_id;

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'onboarding_item_added', 'onboarding_step_item', v_id::text, jsonb_build_object('step', p_step));

  return v_id;
end;
$$;

revoke execute on function public.admin_add_onboarding_item(text, text, text, text, text) from public, anon;
grant execute on function public.admin_add_onboarding_item(text, text, text, text, text) to authenticated;

create or replace function public.admin_remove_onboarding_item(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;
  delete from public.onboarding_step_items where id = p_id;
end;
$$;

revoke execute on function public.admin_remove_onboarding_item(uuid) from public, anon;
grant execute on function public.admin_remove_onboarding_item(uuid) to authenticated;

create or replace function public.admin_set_registration_link(p_link text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;
  update public.onboarding_settings
    set registration_link = nullif(trim(p_link), ''), updated_at = now()
    where org_id = public.current_org_id();
end;
$$;

revoke execute on function public.admin_set_registration_link(text) from public, anon;
grant execute on function public.admin_set_registration_link(text) to authenticated;

-- Every active member x the 4 timestamps -- the "Member Progress" table.
create or replace function public.get_admin_onboarding_overview()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'uid', p.id,
      'displayName', p.display_name,
      'businessExplanationAt', op.business_explanation_viewed_at,
      'networkVarsityAt', op.network_varsity_completed_at,
      'officePolicyAt', op.policy_acknowledged_at,
      'registeredAt', op.registered_at
    ) order by p.display_name)
    from public.profiles p
    left join public.onboarding_progress op on op.user_id = p.id and op.org_id = public.current_org_id()
    where p.role = 'member' and p.status = 'active'
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.get_admin_onboarding_overview() from public, anon;
grant execute on function public.get_admin_onboarding_overview() to authenticated;

-- ================= member: self-reported step completion, strictly gated =================
create or replace function public.complete_onboarding_step(p_step text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_progress record;
begin
  if p_step not in ('business_explanation', 'network_varsity', 'office_policy', 'registration') then
    raise exception 'invalid onboarding step: %', p_step;
  end if;

  select * into v_progress from public.onboarding_progress
    where org_id = public.current_org_id() and user_id = v_uid;

  if p_step = 'network_varsity' and (v_progress is null or v_progress.business_explanation_viewed_at is null) then
    raise exception 'complete Business Explanation first';
  end if;
  if p_step = 'office_policy' and (v_progress is null or v_progress.network_varsity_completed_at is null) then
    raise exception 'complete Network Varsity first';
  end if;
  if p_step = 'registration' and (v_progress is null or v_progress.policy_acknowledged_at is null) then
    raise exception 'acknowledge Office Policy first';
  end if;

  insert into public.onboarding_progress (org_id, user_id) values (public.current_org_id(), v_uid)
  on conflict (org_id, user_id) do nothing;

  update public.onboarding_progress
    set business_explanation_viewed_at = case when p_step = 'business_explanation' then coalesce(business_explanation_viewed_at, now()) else business_explanation_viewed_at end,
        network_varsity_completed_at = case when p_step = 'network_varsity' then coalesce(network_varsity_completed_at, now()) else network_varsity_completed_at end,
        policy_acknowledged_at = case when p_step = 'office_policy' then coalesce(policy_acknowledged_at, now()) else policy_acknowledged_at end,
        registered_at = case when p_step = 'registration' then coalesce(registered_at, now()) else registered_at end
    where org_id = public.current_org_id() and user_id = v_uid;
end;
$$;

revoke execute on function public.complete_onboarding_step(text) from public, anon;
grant execute on function public.complete_onboarding_step(text) to authenticated;
