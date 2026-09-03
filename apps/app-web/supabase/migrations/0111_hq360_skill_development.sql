-- ================= HQ360 restructure: Stage 3 — Skill Development (§7) =================
-- Schema only in this pass (the richest stage -- class editor + player is
-- real frontend work, deferred to the next phase alongside the exam
-- manager and coursework manager it depends on). This migration exists so
-- the Training shell can at least list published classes and the shape is
-- ready for that build. `classes.purpose` also serves Income Development's
-- "Skill Catalog" (§8.2), which reuses this exact schema.

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id),
  title text not null,
  description text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  purpose text not null default 'skill_development' check (purpose in ('skill_development', 'income_development')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index classes_org_purpose_status_idx on public.classes (org_id, purpose, status);

alter table public.classes enable row level security;
grant select on public.classes to authenticated;
create policy classes_select on public.classes for select
  using (status = 'published' or public.current_role() in ('admin', 'mentor'));

create table public.class_modules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id),
  class_id uuid not null references public.classes(id) on delete cascade,
  title text not null,
  order_index int not null default 0,
  created_at timestamptz not null default now()
);
create index class_modules_class_idx on public.class_modules (class_id, order_index);

alter table public.class_modules enable row level security;
grant select on public.class_modules to authenticated;
create policy class_modules_select on public.class_modules for select
  using (exists (select 1 from public.classes c where c.id = class_id and (c.status = 'published' or public.current_role() in ('admin', 'mentor'))));

create table public.class_module_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id),
  module_id uuid not null references public.class_modules(id) on delete cascade,
  type text not null check (type in ('video', 'pdf', 'article', 'test', 'quiz', 'assignment')),
  title text not null,
  order_index int not null default 0,
  resource_id uuid references public.resources(id),
  body text,
  exam_id uuid references public.exams(id),
  coursework_assignment_id uuid references public.coursework_assignments(id),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (
    (type in ('video', 'pdf') and resource_id is not null and body is null and exam_id is null and coursework_assignment_id is null)
    or (type = 'article' and body is not null and resource_id is null and exam_id is null and coursework_assignment_id is null)
    or (type in ('test', 'quiz') and exam_id is not null and resource_id is null and body is null and coursework_assignment_id is null)
    or (type = 'assignment' and coursework_assignment_id is not null and resource_id is null and body is null and exam_id is null)
  )
);
create index class_module_items_module_idx on public.class_module_items (module_id, order_index);

alter table public.class_module_items enable row level security;
grant select on public.class_module_items to authenticated;
create policy class_module_items_select on public.class_module_items for select
  using (exists (
    select 1 from public.class_modules m join public.classes c on c.id = m.class_id
    where m.id = module_id and (c.status = 'published' or public.current_role() in ('admin', 'mentor'))
  ));

-- Only for video/pdf/article items -- test/quiz/assignment completion is
-- derived from attempts/coursework_submissions, never stored here (a
-- gotcha the spec calls out explicitly: writing rows for those item types
-- would double-count derived completion). Enforced with a trigger, not
-- just app discipline, since getting this wrong silently breaks class
-- completion math.
create table public.class_item_progress (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id),
  item_id uuid not null references public.class_module_items(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (item_id, user_id)
);

alter table public.class_item_progress enable row level security;
grant select on public.class_item_progress to authenticated;
create policy class_item_progress_select on public.class_item_progress for select
  using (user_id = auth.uid() or public.current_role() in ('admin', 'mentor'));

create or replace function public.enforce_class_item_progress_type()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text;
begin
  select type into v_type from public.class_module_items where id = new.item_id;
  if v_type not in ('video', 'pdf', 'article') then
    raise exception 'class_item_progress cannot be recorded for a % item -- its completion is derived, not stored', v_type;
  end if;
  return new;
end;
$$;

create trigger class_item_progress_type_guard
  before insert or update on public.class_item_progress
  for each row execute function public.enforce_class_item_progress_type();

create table public.class_trainers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id),
  class_id uuid not null references public.classes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  added_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (class_id, user_id)
);

alter table public.class_trainers enable row level security;
grant select on public.class_trainers to authenticated;
create policy class_trainers_select on public.class_trainers for select using (auth.uid() is not null);

-- Whole-class / item completion, computed live per §7.3 and §11 -- one
-- function so Task step derivation (§10.3) and the eventual class player
-- agree on the exact same definition instead of re-deriving it twice.
create or replace function public.is_class_item_complete(p_item_id uuid, p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_item record;
begin
  select * into v_item from public.class_module_items where id = p_item_id;
  if v_item is null then
    return false;
  end if;

  if v_item.type in ('video', 'pdf', 'article') then
    return exists (
      select 1 from public.class_item_progress
      where item_id = p_item_id and user_id = p_user_id and status = 'completed'
    );
  elsif v_item.type in ('test', 'quiz') then
    return public.has_passed_exam(v_item.exam_id, p_user_id);
  elsif v_item.type = 'assignment' then
    return public.has_approved_coursework(v_item.coursework_assignment_id, p_user_id);
  end if;
  return false;
end;
$$;

grant execute on function public.is_class_item_complete(uuid, uuid) to authenticated;

-- A class with zero items is trivially complete (spec gotcha, §13 note 4).
create or replace function public.is_class_complete(p_class_id uuid, p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_item_id uuid;
begin
  for v_item_id in
    select cmi.id from public.class_module_items cmi
    join public.class_modules cm on cm.id = cmi.module_id
    where cm.class_id = p_class_id
  loop
    if not public.is_class_item_complete(v_item_id, p_user_id) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

grant execute on function public.is_class_complete(uuid, uuid) to authenticated;
