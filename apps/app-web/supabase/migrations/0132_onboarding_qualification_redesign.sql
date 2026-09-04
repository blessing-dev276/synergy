-- ================= Onboarding redesign: the real Prospect -> Newbie qualification =================
-- Replaces the placeholder "Level 1 - Prospect" (Learn/Practice/Work/
-- Registration/Milestone) with the real two-level qualification process:
-- Level 1 Foundation (8 requirements) -> Level 2 Get to Work (5
-- requirements) -> a manually-submitted Newbie Rank-Up request -> admin
-- evaluation (folded into the existing Rank Advancement review, not a
-- second system) -> approval flips Prospect -> Newbie, which (via the
-- rank-based RankGate already in App.jsx/MemberLayout.jsx) is what
-- actually unlocks the Learning Hub.
--
-- Checked before touching anything: level_learn_items/level_learn_progress/
-- level_checklist_progress are all empty (0 rows); level_checklist_items
-- has only the 7 placeholder seed rows from the prior pass, 0 progress
-- against any of them; level_registration_submissions has exactly the
-- one test row from that pass's own verification. Nothing real to lose --
-- dropped and rebuilt clean rather than warped to fit a shape that was
-- always meant to be provisional.

drop function if exists public.review_level_registration(uuid, text, text);
drop function if exists public.submit_level_registration_document(text, text);
drop function if exists public.admin_set_level_registration_link(text, text);
drop function if exists public.toggle_level_checklist_item(uuid, boolean);
drop function if exists public.admin_remove_level_checklist_item(uuid);
drop function if exists public.admin_add_level_checklist_item(text, text, text, text);
drop function if exists public.complete_level_learn_item(uuid);
drop function if exists public.admin_remove_level_learn_item(uuid);
drop function if exists public.admin_add_level_learn_item(text, text, text, text, text);
drop function if exists public.get_admin_level_overview(text);
drop function if exists public.get_my_level_progress(text);
drop table if exists public.level_registration_submissions;
drop table if exists public.level_registration;
drop table if exists public.level_checklist_progress;
drop table if exists public.level_checklist_items;
drop table if exists public.level_learn_progress;
drop table if exists public.level_learn_items;

-- The existing 'prospect' training_levels row becomes Level 1 (Foundation);
-- Level 2 (Get to Work) is new. Both still gate on PROSPECT rank via the
-- existing RankGate -- Levels sit *inside* Onboarding, they aren't a rank
-- split themselves.
update public.training_levels set title = 'Foundation', objective = 'Understand how Synergy works and establish your foundation.' where key = 'prospect';

insert into public.training_levels (key, order_index, title, objective, status)
values ('get_to_work', 2, 'Get to Work', 'Set yourself up for real work inside your Synergy office.', 'published')
on conflict (org_id, key) do nothing;

-- ================= Level 1 Foundation: the 8 requirements =================
-- Four shapes, one table: a lesson (text/video/pdf, optionally gated by a
-- real exam -- reuses the exact exam engine built for Skill/Income
-- Development, same has_passed_exam check Task Flow's exam steps already
-- use), a digitally-signed agreement, an external-form confirmation, and a
-- plain confirmation checkbox. Exactly one shape's fields populated per
-- row, enforced by the CHECK below.
create table public.level_learn_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id),
  level_id uuid not null references public.training_levels(id) on delete cascade,
  order_index int not null default 0,
  title text not null,
  description text,
  kind text not null default 'lesson' check (kind in ('lesson', 'agreement_signature', 'external_confirmation', 'checkbox_confirmation')),
  -- lesson
  text_body text,
  video_url text,
  pdf_file_path text,
  exam_id uuid references public.exams(id),
  -- agreement_signature (Code of Conduct)
  agreement_body text,
  agreement_version text default 'v1',
  -- external_confirmation (SkyTeam Agreement Form) / checkbox_confirmation (Membership Agreement)
  external_link text,
  confirmation_label text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (
    (kind = 'lesson' and text_body is not null and agreement_body is null and confirmation_label is null)
    or (kind = 'agreement_signature' and agreement_body is not null and text_body is null and confirmation_label is null)
    or (kind in ('external_confirmation', 'checkbox_confirmation') and confirmation_label is not null and text_body is null and agreement_body is null)
  )
);
create index level_learn_items_level_idx on public.level_learn_items (level_id, order_index);

alter table public.level_learn_items enable row level security;
grant select on public.level_learn_items to authenticated;
create policy level_learn_items_select on public.level_learn_items for select using (auth.uid() is not null);

-- Generic "done" marker -- used for lesson items with no exam_id, and for
-- both confirmation kinds. Never written for a quiz-gated lesson (that
-- completes only via has_passed_exam, derived, no row here) or an
-- agreement_signature (its own table below).
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

-- Code of Conduct: a real digital signature, not a checkbox -- typed full
-- name + the exact agreement version they signed + when.
create table public.level_agreement_signatures (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id),
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_id uuid not null references public.level_learn_items(id) on delete cascade,
  signature_name text not null,
  agreement_version text not null,
  signed_at timestamptz not null default now(),
  unique (org_id, user_id, item_id)
);

alter table public.level_agreement_signatures enable row level security;
grant select on public.level_agreement_signatures to authenticated;
create policy level_agreement_signatures_select on public.level_agreement_signatures for select
  using (user_id = auth.uid() or public.current_role() in ('admin', 'mentor'));

-- ================= Level 2 Get to Work: the 5 requirements =================
-- Same "one table, a signal per row" shape as before, but the signal set
-- is now exactly what the spec calls for: a real system-training class
-- (reuses classes/class_modules/class_module_items -- is_class_complete),
-- real profile-health (compute_profile_health_percent, 0093 -- the same
-- number already surfaced elsewhere in this app, not reinvented), real
-- monthly goals (already existed), and two verified meetings (new table
-- below -- these can never be self-marked done by the member).
create table public.level_checklist_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id),
  level_id uuid not null references public.training_levels(id) on delete cascade,
  section text not null default 'work' check (section in ('work')),
  title text not null,
  description text,
  signal text not null default 'manual' check (signal in ('manual', 'class_complete', 'profile_100', 'goals_set', 'sponsor_meeting', 'upline_meeting')),
  class_id uuid references public.classes(id),
  order_index int not null default 0,
  created_at timestamptz not null default now(),
  check ((signal = 'class_complete') = (class_id is not null))
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

-- Sponsor / Upline Director meetings -- a real, admin-or-sponsor-confirmed
-- record, never self-reported by the member (the whole point: "The member
-- should NOT be able to falsely mark the meeting completed").
create table public.level_meetings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id),
  user_id uuid not null references public.profiles(id) on delete cascade,
  meeting_type text not null check (meeting_type in ('sponsor', 'upline_director')),
  counterpart_uid uuid references public.profiles(id),
  counterpart_name text,
  meeting_link text,
  status text not null default 'pending' check (status in ('pending', 'completed')),
  confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, user_id, meeting_type)
);

alter table public.level_meetings enable row level security;
grant select on public.level_meetings to authenticated;
create policy level_meetings_select on public.level_meetings for select
  using (user_id = auth.uid() or counterpart_uid = auth.uid() or public.current_role() in ('admin', 'mentor'));

-- Seed Get to Work's 5 requirements. class_id for "Learn How Synergy
-- Works" is filled in by the next migration once the class itself exists
-- (can't forward-reference a not-yet-created class row in the same insert
-- without a second statement anyway).
insert into public.level_checklist_items (level_id, section, title, description, signal, order_index)
select id, 'work', 'Complete Profile Setup', 'Fill in the required profile fields until your profile reaches 100%.', 'profile_100', 2
from public.training_levels where key = 'get_to_work'
union all
select id, 'work', 'Meet Your Sponsor', 'An online meeting or call with your sponsor.', 'sponsor_meeting', 3
from public.training_levels where key = 'get_to_work'
union all
select id, 'work', 'Meet Your Upline Director', 'An online meeting or call with your upline director.', 'upline_meeting', 4
from public.training_levels where key = 'get_to_work'
union all
select id, 'work', 'Set Monthly Goals', 'Create your first monthly goals in My Goals.', 'goals_set', 5
from public.training_levels where key = 'get_to_work';

-- ================= admin: author Level 1 content =================
create or replace function public.admin_add_level_learn_item(
  p_level_key text, p_kind text, p_title text, p_description text,
  p_text_body text, p_video_url text, p_pdf_file_path text, p_exam_id uuid,
  p_agreement_body text, p_agreement_version text,
  p_external_link text, p_confirmation_label text
)
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
  if coalesce(trim(p_title), '') = '' then
    raise exception 'an item needs a title';
  end if;
  if p_kind = 'lesson' and coalesce(trim(p_text_body), '') = '' then
    raise exception 'a lesson needs body text';
  end if;
  if p_kind = 'agreement_signature' and coalesce(trim(p_agreement_body), '') = '' then
    raise exception 'an agreement needs its document text';
  end if;
  if p_kind in ('external_confirmation', 'checkbox_confirmation') and coalesce(trim(p_confirmation_label), '') = '' then
    raise exception 'a confirmation needs its checkbox label';
  end if;

  select coalesce(max(order_index), 0) + 1 into v_next_order from public.level_learn_items where level_id = v_level_id;

  insert into public.level_learn_items (
    level_id, order_index, title, description, kind,
    text_body, video_url, pdf_file_path, exam_id,
    agreement_body, agreement_version, external_link, confirmation_label, created_by
  )
  values (
    v_level_id, v_next_order, trim(p_title), nullif(trim(p_description), ''), p_kind,
    case when p_kind = 'lesson' then trim(p_text_body) else null end,
    case when p_kind = 'lesson' then nullif(trim(p_video_url), '') else null end,
    case when p_kind = 'lesson' then p_pdf_file_path else null end,
    case when p_kind = 'lesson' then p_exam_id else null end,
    case when p_kind = 'agreement_signature' then trim(p_agreement_body) else null end,
    case when p_kind = 'agreement_signature' then coalesce(nullif(trim(p_agreement_version), ''), 'v1') else null end,
    case when p_kind in ('external_confirmation') then nullif(trim(p_external_link), '') else null end,
    case when p_kind in ('external_confirmation', 'checkbox_confirmation') then trim(p_confirmation_label) else null end,
    auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.admin_add_level_learn_item(text, text, text, text, text, text, text, uuid, text, text, text, text) from public, anon;
grant execute on function public.admin_add_level_learn_item(text, text, text, text, text, text, text, uuid, text, text, text, text) to authenticated;

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

-- ================= admin: author Level 2 content =================
create or replace function public.admin_add_level_checklist_item(p_level_key text, p_title text, p_description text, p_signal text, p_class_id uuid)
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
  if p_signal not in ('manual', 'class_complete', 'profile_100', 'goals_set', 'sponsor_meeting', 'upline_meeting') then
    raise exception 'invalid signal: %', p_signal;
  end if;
  if (p_signal = 'class_complete') <> (p_class_id is not null) then
    raise exception 'class_complete needs a class picked (and only that signal uses one)';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'an item needs a title';
  end if;

  select coalesce(max(order_index), 0) + 1 into v_next_order from public.level_checklist_items where level_id = v_level_id;

  insert into public.level_checklist_items (level_id, section, title, description, signal, class_id, order_index)
  values (v_level_id, 'work', trim(p_title), nullif(trim(p_description), ''), p_signal, p_class_id, v_next_order)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.admin_add_level_checklist_item(text, text, text, text, uuid) from public, anon;
grant execute on function public.admin_add_level_checklist_item(text, text, text, text, uuid) to authenticated;

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

-- ================= member: Level 1 completion =================
create or replace function public.complete_level_lesson_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
begin
  select * into v_item from public.level_learn_items where id = p_item_id;
  if v_item is null then
    raise exception 'item not found';
  end if;
  if v_item.kind <> 'lesson' then
    raise exception 'this item is not a lesson';
  end if;
  if v_item.exam_id is not null then
    raise exception 'this item completes automatically once you pass its quiz';
  end if;

  insert into public.level_learn_progress (org_id, user_id, item_id)
  values (public.current_org_id(), auth.uid(), p_item_id)
  on conflict (org_id, user_id, item_id) do nothing;
end;
$$;

revoke execute on function public.complete_level_lesson_item(uuid) from public, anon;
grant execute on function public.complete_level_lesson_item(uuid) to authenticated;

create or replace function public.confirm_level_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
begin
  select kind into v_kind from public.level_learn_items where id = p_item_id;
  if v_kind is null then
    raise exception 'item not found';
  end if;
  if v_kind not in ('external_confirmation', 'checkbox_confirmation') then
    raise exception 'this item is not a confirmation';
  end if;

  insert into public.level_learn_progress (org_id, user_id, item_id)
  values (public.current_org_id(), auth.uid(), p_item_id)
  on conflict (org_id, user_id, item_id) do nothing;
end;
$$;

revoke execute on function public.confirm_level_item(uuid) from public, anon;
grant execute on function public.confirm_level_item(uuid) to authenticated;

create or replace function public.sign_level_agreement(p_item_id uuid, p_signature_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
begin
  select * into v_item from public.level_learn_items where id = p_item_id;
  if v_item is null or v_item.kind <> 'agreement_signature' then
    raise exception 'this item is not an agreement to sign';
  end if;
  if coalesce(trim(p_signature_name), '') = '' then
    raise exception 'type your full name to sign';
  end if;

  insert into public.level_agreement_signatures (user_id, item_id, signature_name, agreement_version)
  values (auth.uid(), p_item_id, trim(p_signature_name), coalesce(v_item.agreement_version, 'v1'))
  on conflict (org_id, user_id, item_id) do update
    set signature_name = excluded.signature_name, agreement_version = excluded.agreement_version, signed_at = now();
end;
$$;

revoke execute on function public.sign_level_agreement(uuid, text) from public, anon;
grant execute on function public.sign_level_agreement(uuid, text) to authenticated;

-- ================= member: Level 2's one manual-fallback toggle =================
-- Kept for any future 'manual' checklist item -- none of the 5 seeded
-- Get to Work items use it (all are real, verified signals).
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

-- ================= sponsor / upline director meetings =================
create or replace function public.admin_set_level_meeting(p_user_id uuid, p_meeting_type text, p_meeting_link text, p_counterpart_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_counterpart_uid uuid;
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;
  if p_meeting_type not in ('sponsor', 'upline_director') then
    raise exception 'invalid meeting type: %', p_meeting_type;
  end if;

  if p_meeting_type = 'sponsor' then
    select mentor_uid into v_counterpart_uid from public.profiles where id = p_user_id;
  end if;

  insert into public.level_meetings (user_id, meeting_type, counterpart_uid, counterpart_name, meeting_link)
  values (p_user_id, p_meeting_type, v_counterpart_uid, nullif(trim(p_counterpart_name), ''), nullif(trim(p_meeting_link), ''))
  on conflict (org_id, user_id, meeting_type) do update
    set counterpart_uid = coalesce(excluded.counterpart_uid, public.level_meetings.counterpart_uid),
        counterpart_name = excluded.counterpart_name, meeting_link = excluded.meeting_link, updated_at = now();
end;
$$;

revoke execute on function public.admin_set_level_meeting(uuid, text, text, text) from public, anon;
grant execute on function public.admin_set_level_meeting(uuid, text, text, text) to authenticated;

-- Admin, or the member's own assigned sponsor (for a sponsor-type meeting
-- only) -- never the member themselves.
create or replace function public.confirm_level_meeting(p_user_id uuid, p_meeting_type text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mentor_uid uuid;
  v_is_admin boolean;
begin
  v_is_admin := coalesce(public.current_role(), '') in ('admin', 'mentor');
  select mentor_uid into v_mentor_uid from public.profiles where id = p_user_id;

  if not (v_is_admin or (p_meeting_type = 'sponsor' and v_mentor_uid = auth.uid())) then
    raise exception 'permission denied: only an admin or this member''s sponsor can confirm this meeting';
  end if;

  insert into public.level_meetings (user_id, meeting_type, status, confirmed_by, confirmed_at)
  values (p_user_id, p_meeting_type, 'completed', auth.uid(), now())
  on conflict (org_id, user_id, meeting_type) do update
    set status = 'completed', confirmed_by = auth.uid(), confirmed_at = now(), updated_at = now();

  insert into public.notifications (uid, type, title, body, link_to)
  values (
    p_user_id, 'level_meeting_confirmed',
    case p_meeting_type when 'sponsor' then 'Sponsor meeting confirmed' else 'Upline director meeting confirmed' end,
    'Marked complete -- check your Onboarding progress.', '/training'
  );
end;
$$;

revoke execute on function public.confirm_level_meeting(uuid, text) from public, anon;
grant execute on function public.confirm_level_meeting(uuid, text) to authenticated;
