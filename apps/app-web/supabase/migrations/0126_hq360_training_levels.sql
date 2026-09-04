-- ================= HQ360 restructure v2: Level-based Training =================
-- Replaces the fixed Onboarding stage with a generalized, admin-configurable
-- "Levels" model (Level 1 - Prospect, seeded now; Level 2+ added the same
-- way once described). Each level has: Learn (ordered, sequentially-gated
-- content, self-reported -- generalizes onboarding_step_items' 3-fixed-step
-- shape into N admin-defined topics), Practice + Work (flat checklists,
-- each item either self-reported or backed by a real signal from elsewhere
-- in the app), Registration (a link + a member-uploaded signed document,
-- admin-reviewed), and a derived Milestone.
--
-- onboarding_step_items/onboarding_progress/onboarding_settings had zero
-- real rows (checked: the one onboarding_progress row belonged to the
-- admin's own test account, not a real member) so this is a clean
-- replacement, not a lossy migration -- dropped below rather than carried
-- forward warped to fit a shape it was never designed for.

drop function if exists public.complete_onboarding_step(text);
drop function if exists public.get_admin_onboarding_overview();
drop function if exists public.admin_set_registration_link(text);
drop function if exists public.admin_remove_onboarding_item(uuid);
drop function if exists public.admin_add_onboarding_item(text, text, text, text, text);
drop table if exists public.onboarding_progress;
drop table if exists public.onboarding_step_items;
drop table if exists public.onboarding_settings;

-- ================= levels =================
create table public.training_levels (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id),
  key text not null,
  order_index int not null default 0,
  title text not null,
  objective text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  unique (org_id, key)
);

alter table public.training_levels enable row level security;
grant select on public.training_levels to authenticated;
create policy training_levels_select on public.training_levels for select using (auth.uid() is not null);

insert into public.training_levels (key, order_index, title, objective, status) values
  ('prospect', 1, 'Prospect', 'Understand how Synergy works and establish your foundation.', 'published');

-- ================= Learn: ordered, sequentially-gated, self-reported =================
create table public.level_learn_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id),
  level_id uuid not null references public.training_levels(id) on delete cascade,
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
create index level_learn_items_level_idx on public.level_learn_items (level_id, order_index);

alter table public.level_learn_items enable row level security;
grant select on public.level_learn_items to authenticated;
create policy level_learn_items_select on public.level_learn_items for select using (auth.uid() is not null);

create table public.level_learn_progress (
  org_id uuid not null default public.current_org_id() references public.organizations(id),
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_id uuid not null references public.level_learn_items(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (org_id, user_id, item_id)
);

alter table public.level_learn_progress enable row level security;
grant select on public.level_learn_progress to authenticated;
create policy level_learn_progress_select on public.level_learn_progress for select
  using (user_id = auth.uid() or public.current_role() in ('admin', 'mentor'));

-- ================= Practice / Work: flat checklists, real-signal or manual =================
create table public.level_checklist_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id),
  level_id uuid not null references public.training_levels(id) on delete cascade,
  section text not null check (section in ('practice', 'work')),
  title text not null,
  signal text not null default 'manual' check (signal in ('manual', 'profile_complete', 'skills_identified', 'goals_set', 'sponsor_assigned')),
  order_index int not null default 0,
  created_at timestamptz not null default now()
);
create index level_checklist_items_level_idx on public.level_checklist_items (level_id, section, order_index);

alter table public.level_checklist_items enable row level security;
grant select on public.level_checklist_items to authenticated;
create policy level_checklist_items_select on public.level_checklist_items for select using (auth.uid() is not null);

create table public.level_checklist_progress (
  org_id uuid not null default public.current_org_id() references public.organizations(id),
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_id uuid not null references public.level_checklist_items(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (org_id, user_id, item_id)
);

alter table public.level_checklist_progress enable row level security;
grant select on public.level_checklist_progress to authenticated;
create policy level_checklist_progress_select on public.level_checklist_progress for select
  using (user_id = auth.uid() or public.current_role() in ('admin', 'mentor'));

-- Seed Prospect's Practice + Work exactly as specified.
insert into public.level_checklist_items (level_id, section, title, signal, order_index)
select id, 'practice', 'Complete your profile', 'profile_complete', 1 from public.training_levels where key = 'prospect'
union all
select id, 'practice', 'Identify your skills', 'skills_identified', 2 from public.training_levels where key = 'prospect'
union all
select id, 'practice', 'Define your interests', 'manual', 3 from public.training_levels where key = 'prospect'
union all
select id, 'practice', 'Learn the basic tools of the Synergy system', 'manual', 4 from public.training_levels where key = 'prospect'
union all
select id, 'work', 'Set your first monthly goals', 'goals_set', 1 from public.training_levels where key = 'prospect'
union all
select id, 'work', 'Create your personal work schedule', 'manual', 2 from public.training_levels where key = 'prospect'
union all
select id, 'work', 'Meet your sponsor/team leader', 'sponsor_assigned', 3 from public.training_levels where key = 'prospect';

-- Real signals, one place: profile fields, the real skills array saved at
-- signup (OnboardingFlow.jsx), a genuinely-submitted monthly goals sheet,
-- a real sponsor assignment. "Define your interests" and the other two
-- have no real signal anywhere in the app (no interests field is ever
-- written, no schedule feature exists) -- they stay 'manual' rather than
-- faking a signal that isn't real.
create or replace function public.evaluate_level_signal(p_signal text, p_uid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result boolean;
begin
  if p_signal = 'profile_complete' then
    select coalesce(bio, '') <> '' and coalesce(photo_url, '') <> '' into v_result from public.profiles where id = p_uid;
    return coalesce(v_result, false);
  elsif p_signal = 'skills_identified' then
    select jsonb_array_length(coalesce(onboarding -> 'skills', '[]'::jsonb)) > 0 into v_result from public.profiles where id = p_uid;
    return coalesce(v_result, false);
  elsif p_signal = 'goals_set' then
    return exists (select 1 from public.monthly_goals where uid = p_uid and status <> 'draft');
  elsif p_signal = 'sponsor_assigned' then
    return exists (select 1 from public.profiles where id = p_uid and mentor_uid is not null);
  end if;
  return false;
end;
$$;

grant execute on function public.evaluate_level_signal(text, uuid) to authenticated;

-- ================= Registration: link + signed document upload + review =================
create table public.level_registration (
  org_id uuid not null default public.current_org_id() references public.organizations(id),
  level_id uuid not null references public.training_levels(id) on delete cascade,
  registration_link text,
  updated_at timestamptz not null default now(),
  primary key (org_id, level_id)
);
insert into public.level_registration (level_id) select id from public.training_levels where key = 'prospect';

alter table public.level_registration enable row level security;
grant select on public.level_registration to authenticated;
create policy level_registration_select on public.level_registration for select using (auth.uid() is not null);

create table public.level_registration_submissions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id),
  level_id uuid not null references public.training_levels(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  document_path text not null,
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'rejected')),
  review_note text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  submitted_at timestamptz not null default now(),
  unique (level_id, user_id)
);

alter table public.level_registration_submissions enable row level security;
grant select on public.level_registration_submissions to authenticated;
create policy level_registration_submissions_select on public.level_registration_submissions for select
  using (user_id = auth.uid() or public.current_role() in ('admin', 'mentor'));

-- ================= admin: author Learn content =================
create or replace function public.admin_add_level_learn_item(p_level_key text, p_type text, p_title text, p_file_path text, p_link_url text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_level_id uuid;
  v_id uuid;
  v_next_order int;
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;
  select id into v_level_id from public.training_levels where key = p_level_key and org_id = public.current_org_id();
  if v_level_id is null then
    raise exception 'level not found: %', p_level_key;
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

  select coalesce(max(order_index), 0) + 1 into v_next_order from public.level_learn_items where level_id = v_level_id;

  insert into public.level_learn_items (level_id, type, title, file_path, link_url, order_index, created_by)
  values (v_level_id, p_type, trim(p_title), p_file_path, p_link_url, v_next_order, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.admin_add_level_learn_item(text, text, text, text, text) from public, anon;
grant execute on function public.admin_add_level_learn_item(text, text, text, text, text) to authenticated;

create or replace function public.admin_remove_level_learn_item(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;
  delete from public.level_learn_items where id = p_id;
end;
$$;

revoke execute on function public.admin_remove_level_learn_item(uuid) from public, anon;
grant execute on function public.admin_remove_level_learn_item(uuid) to authenticated;

-- ================= admin: author Practice/Work checklist content =================
create or replace function public.admin_add_level_checklist_item(p_level_key text, p_section text, p_title text, p_signal text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_level_id uuid;
  v_id uuid;
  v_next_order int;
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;
  select id into v_level_id from public.training_levels where key = p_level_key and org_id = public.current_org_id();
  if v_level_id is null then
    raise exception 'level not found: %', p_level_key;
  end if;
  if p_section not in ('practice', 'work') then
    raise exception 'invalid section: %', p_section;
  end if;
  if p_signal not in ('manual', 'profile_complete', 'skills_identified', 'goals_set', 'sponsor_assigned') then
    raise exception 'invalid signal: %', p_signal;
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'an item needs a title';
  end if;

  select coalesce(max(order_index), 0) + 1 into v_next_order
    from public.level_checklist_items where level_id = v_level_id and section = p_section;

  insert into public.level_checklist_items (level_id, section, title, signal, order_index)
  values (v_level_id, p_section, trim(p_title), p_signal, v_next_order)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.admin_add_level_checklist_item(text, text, text, text) from public, anon;
grant execute on function public.admin_add_level_checklist_item(text, text, text, text) to authenticated;

create or replace function public.admin_remove_level_checklist_item(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;
  delete from public.level_checklist_items where id = p_id;
end;
$$;

revoke execute on function public.admin_remove_level_checklist_item(uuid) from public, anon;
grant execute on function public.admin_remove_level_checklist_item(uuid) to authenticated;

create or replace function public.admin_set_level_registration_link(p_level_key text, p_link text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_level_id uuid;
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;
  select id into v_level_id from public.training_levels where key = p_level_key and org_id = public.current_org_id();
  if v_level_id is null then
    raise exception 'level not found: %', p_level_key;
  end if;
  update public.level_registration set registration_link = nullif(trim(p_link), ''), updated_at = now() where level_id = v_level_id;
end;
$$;

revoke execute on function public.admin_set_level_registration_link(text, text) from public, anon;
grant execute on function public.admin_set_level_registration_link(text, text) to authenticated;

-- ================= member: self-reported Learn completion, sequentially gated =================
create or replace function public.complete_level_learn_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_prev_count int;
  v_prev_done_count int;
  v_uid uuid := auth.uid();
begin
  select * into v_item from public.level_learn_items where id = p_item_id;
  if v_item is null then
    raise exception 'item not found';
  end if;

  select count(*) into v_prev_count from public.level_learn_items
    where level_id = v_item.level_id and order_index < v_item.order_index;
  select count(*) into v_prev_done_count from public.level_learn_progress p
    join public.level_learn_items i on i.id = p.item_id
    where i.level_id = v_item.level_id and i.order_index < v_item.order_index and p.user_id = v_uid;

  if v_prev_done_count < v_prev_count then
    raise exception 'complete the earlier items in this level first';
  end if;

  insert into public.level_learn_progress (org_id, user_id, item_id)
  values (public.current_org_id(), v_uid, p_item_id)
  on conflict (org_id, user_id, item_id) do nothing;
end;
$$;

revoke execute on function public.complete_level_learn_item(uuid) from public, anon;
grant execute on function public.complete_level_learn_item(uuid) to authenticated;

-- ================= member: Practice/Work toggling, manual items only =================
create or replace function public.toggle_level_checklist_item(p_item_id uuid, p_done boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_signal text;
  v_uid uuid := auth.uid();
begin
  select signal into v_signal from public.level_checklist_items where id = p_item_id;
  if v_signal is null then
    raise exception 'item not found';
  end if;
  if v_signal <> 'manual' then
    raise exception 'this item is tracked automatically, not marked by hand';
  end if;

  if p_done then
    insert into public.level_checklist_progress (org_id, user_id, item_id)
    values (public.current_org_id(), v_uid, p_item_id)
    on conflict (org_id, user_id, item_id) do nothing;
  else
    delete from public.level_checklist_progress where org_id = public.current_org_id() and user_id = v_uid and item_id = p_item_id;
  end if;
end;
$$;

revoke execute on function public.toggle_level_checklist_item(uuid, boolean) from public, anon;
grant execute on function public.toggle_level_checklist_item(uuid, boolean) to authenticated;

-- ================= member: registration document upload =================
create or replace function public.submit_level_registration_document(p_level_key text, p_document_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_level_id uuid;
  v_uid uuid := auth.uid();
begin
  select id into v_level_id from public.training_levels where key = p_level_key and org_id = public.current_org_id();
  if v_level_id is null then
    raise exception 'level not found: %', p_level_key;
  end if;
  if coalesce(trim(p_document_path), '') = '' then
    raise exception 'upload a document first';
  end if;

  insert into public.level_registration_submissions (level_id, user_id, document_path, status, submitted_at)
  values (v_level_id, v_uid, p_document_path, 'submitted', now())
  on conflict (level_id, user_id) do update
    set document_path = excluded.document_path, status = 'submitted', submitted_at = now(),
        review_note = null, reviewed_by = null, reviewed_at = null;

  insert into public.notifications (uid, type, title, body, link_to)
  select p.id, 'level_registration_submitted', 'Registration document submitted',
    coalesce((select display_name from public.profiles where id = v_uid), 'A member') || ' uploaded their signed registration document.',
    '/admin/submissions?section=level-registration'
  from public.profiles p where p.role = 'admin';
end;
$$;

revoke execute on function public.submit_level_registration_document(text, text) from public, anon;
grant execute on function public.submit_level_registration_document(text, text) to authenticated;

create or replace function public.review_level_registration(p_id uuid, p_decision text, p_review_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submission record;
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'invalid decision: %', p_decision;
  end if;

  select * into v_submission from public.level_registration_submissions where id = p_id;
  if v_submission is null then
    raise exception 'submission not found';
  end if;

  update public.level_registration_submissions
    set status = p_decision, review_note = nullif(trim(p_review_note), ''), reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_id;

  insert into public.notifications (uid, type, title, body, link_to)
  values (
    v_submission.user_id, 'level_registration_reviewed',
    case p_decision when 'approved' then 'Registration approved 🎉' else 'Registration needs another look' end,
    coalesce(nullif(trim(p_review_note), ''), case p_decision when 'approved' then 'Your registration document was approved.' else 'Your registration document was not approved -- please resubmit.' end),
    '/training'
  );
end;
$$;

revoke execute on function public.review_level_registration(uuid, text, text) from public, anon;
grant execute on function public.review_level_registration(uuid, text, text) to authenticated;

-- ================= member: aggregate read for one level =================
create or replace function public.get_my_level_progress(p_level_key text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_level record;
  v_learn jsonb := '[]'::jsonb;
  v_practice jsonb := '[]'::jsonb;
  v_work jsonb := '[]'::jsonb;
  v_item record;
  v_unlocked boolean;
  v_done boolean;
  v_all_learn_done boolean := true;
  v_all_practice_done boolean := true;
  v_all_work_done boolean := true;
  v_registration record;
  v_submission record;
begin
  select * into v_level from public.training_levels where key = p_level_key and org_id = public.current_org_id();
  if v_level is null then
    raise exception 'level not found: %', p_level_key;
  end if;

  v_unlocked := true;
  for v_item in select * from public.level_learn_items where level_id = v_level.id order by order_index loop
    v_done := exists (select 1 from public.level_learn_progress where item_id = v_item.id and user_id = v_uid);
    v_learn := v_learn || jsonb_build_object(
      'id', v_item.id, 'type', v_item.type, 'title', v_item.title, 'filePath', v_item.file_path, 'linkUrl', v_item.link_url,
      'done', v_done, 'unlocked', v_unlocked
    );
    if not v_done then
      v_all_learn_done := false;
      v_unlocked := false;
    end if;
  end loop;

  for v_item in select * from public.level_checklist_items where level_id = v_level.id and section = 'practice' order by order_index loop
    v_done := case when v_item.signal = 'manual'
      then exists (select 1 from public.level_checklist_progress where item_id = v_item.id and user_id = v_uid)
      else public.evaluate_level_signal(v_item.signal, v_uid) end;
    v_practice := v_practice || jsonb_build_object('id', v_item.id, 'title', v_item.title, 'signal', v_item.signal, 'done', v_done);
    if not v_done then v_all_practice_done := false; end if;
  end loop;

  for v_item in select * from public.level_checklist_items where level_id = v_level.id and section = 'work' order by order_index loop
    v_done := case when v_item.signal = 'manual'
      then exists (select 1 from public.level_checklist_progress where item_id = v_item.id and user_id = v_uid)
      else public.evaluate_level_signal(v_item.signal, v_uid) end;
    v_work := v_work || jsonb_build_object('id', v_item.id, 'title', v_item.title, 'signal', v_item.signal, 'done', v_done);
    if not v_done then v_all_work_done := false; end if;
  end loop;

  select * into v_registration from public.level_registration where level_id = v_level.id;
  select * into v_submission from public.level_registration_submissions where level_id = v_level.id and user_id = v_uid;

  return jsonb_build_object(
    'levelId', v_level.id, 'key', v_level.key, 'title', v_level.title, 'objective', v_level.objective,
    'learn', v_learn, 'practice', v_practice, 'work', v_work,
    'registrationLink', v_registration.registration_link,
    'mySubmission', case when v_submission.id is null then null else jsonb_build_object(
      'status', v_submission.status, 'reviewNote', v_submission.review_note, 'submittedAt', v_submission.submitted_at
    ) end,
    'milestoneComplete', v_all_learn_done and v_all_practice_done and v_all_work_done and v_submission.status = 'approved'
  );
end;
$$;

revoke execute on function public.get_my_level_progress(text) from public, anon;
grant execute on function public.get_my_level_progress(text) to authenticated;

-- ================= admin: member progress overview for one level =================
create or replace function public.get_admin_level_overview(p_level_key text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_level_id uuid;
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;

  select id into v_level_id from public.training_levels where key = p_level_key and org_id = public.current_org_id();
  if v_level_id is null then
    raise exception 'level not found: %', p_level_key;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'uid', p.id, 'displayName', p.display_name,
      'registrationStatus', s.status
    ) order by p.display_name)
    from public.profiles p
    left join public.level_registration_submissions s on s.user_id = p.id and s.level_id = v_level_id
    where p.role = 'member' and p.status = 'active'
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.get_admin_level_overview(text) from public, anon;
grant execute on function public.get_admin_level_overview(text) to authenticated;
