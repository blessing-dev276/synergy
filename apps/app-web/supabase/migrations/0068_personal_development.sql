-- Mind Training restructure, part 3 of 4: Personal Development -- an
-- independent resource library, not built on courses (see 0057's
-- resource_type courses -- that shape only ever lives nested one level
-- under a single learning_paths row via path_id not null, so a resource
-- can't belong to two paths without duplicating the row, and it drags in
-- courses' module_count/lesson_count/auto-content_items-trigger baggage
-- that makes no sense for a standalone resource). pd_resources exists once;
-- pd_resource_learning_paths is the many-to-many link into Mind Training,
-- modeled directly on rank_learning_paths (0059) -- the one existing
-- precedent in this codebase for "one thing attached to many of another,
-- admin-curated, no duplication."

create table public.pd_resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text default '',
  resource_type text not null check (resource_type in
    ('book', 'podcast', 'video', 'pdf', 'workbook', 'article', 'template', 'other')),
  thumbnail_url text default '',
  -- Author / podcast host / video creator -- one column, labeled per-type
  -- in the UI rather than three separate columns that are really the same
  -- concept (Part 7's own examples treat them as interchangeable).
  author text default '',
  external_url text default '',
  -- Uploaded file (PDF/workbook/etc), a path in the mind-training-library
  -- bucket (0066) -- optional, same "never required" spirit as a lesson's
  -- pdf_path. A resource can have neither, either, or both external_url
  -- and file_path (e.g. a book's "buy it" link plus a companion worksheet
  -- upload) -- deliberately not mutually exclusive.
  file_path text,
  duration_minutes int,
  page_count int,
  published boolean not null default false,
  featured boolean not null default false,
  order_index int not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index pd_resources_type_idx on public.pd_resources (resource_type, published, order_index);

create table public.pd_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table public.pd_resource_tags (
  resource_id uuid not null references public.pd_resources(id) on delete cascade,
  tag_id uuid not null references public.pd_tags(id) on delete cascade,
  primary key (resource_id, tag_id)
);
create index pd_resource_tags_tag_idx on public.pd_resource_tags (tag_id);

create table public.pd_resource_learning_paths (
  resource_id uuid not null references public.pd_resources(id) on delete cascade,
  learning_path_id uuid not null references public.learning_paths(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (resource_id, learning_path_id)
);
create index pd_resource_learning_paths_path_idx on public.pd_resource_learning_paths (learning_path_id);

-- Same fencing as mind_training_levels.path_id (0066) -- a resource can
-- only ever be linked to a Mind Training path, keeping Part 9's "linked to
-- Mind Training Learning Paths" scope real at the schema level, not just
-- convention.
create or replace function public.check_pd_resource_link_path()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (select 1 from public.learning_paths where id = new.learning_path_id and section = 'mind_training') then
    raise exception 'pd_resource_learning_paths.learning_path_id must reference a learning_paths row with section = ''mind_training''';
  end if;
  return new;
end;
$$;
create trigger check_pd_resource_link_path_trg
  before insert or update of learning_path_id on public.pd_resource_learning_paths
  for each row execute function public.check_pd_resource_link_path();

-- ================= RLS =================
-- Resources: published ones are readable by any signed-in member (no
-- rank-gating -- Part 13's library is described as generally available,
-- unlike Mind Training paths themselves); admin sees/writes everything.
alter table public.pd_resources enable row level security;
grant select, insert, update, delete on public.pd_resources to authenticated;
create policy pd_resources_select on public.pd_resources for select
  using (published = true or public.current_role() = 'admin');
create policy pd_resources_admin_insert on public.pd_resources for insert with check (public.current_role() = 'admin');
create policy pd_resources_admin_update on public.pd_resources for update using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
create policy pd_resources_admin_delete on public.pd_resources for delete using (public.current_role() = 'admin');

alter table public.pd_tags enable row level security;
grant select, insert, update, delete on public.pd_tags to authenticated;
create policy pd_tags_select on public.pd_tags for select using (auth.uid() is not null);
create policy pd_tags_admin_insert on public.pd_tags for insert with check (public.current_role() = 'admin');
create policy pd_tags_admin_update on public.pd_tags for update using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
create policy pd_tags_admin_delete on public.pd_tags for delete using (public.current_role() = 'admin');

alter table public.pd_resource_tags enable row level security;
grant select, insert, update, delete on public.pd_resource_tags to authenticated;
create policy pd_resource_tags_select on public.pd_resource_tags for select
  using (exists (select 1 from public.pd_resources r where r.id = resource_id and (r.published = true or public.current_role() = 'admin')));
create policy pd_resource_tags_admin_all on public.pd_resource_tags for insert with check (public.current_role() = 'admin');
create policy pd_resource_tags_admin_delete on public.pd_resource_tags for delete using (public.current_role() = 'admin');

-- resource_learning_paths select mirrors pd_resources' own gate (published
-- resource) intersected with the path being one the member can see
-- (can_view_mind_training_path, 0066) -- both conditions matter: an admin
-- linking an unpublished resource to a path shouldn't leak it, and a
-- resource linked to a path outside the member's rank shouldn't surface
-- there either.
alter table public.pd_resource_learning_paths enable row level security;
grant select, insert, update, delete on public.pd_resource_learning_paths to authenticated;
create policy pd_resource_learning_paths_select on public.pd_resource_learning_paths for select
  using (
    public.current_role() = 'admin'
    or (
      exists (select 1 from public.pd_resources r where r.id = resource_id and r.published = true)
      and public.can_view_mind_training_path(learning_path_id)
    )
  );
-- No direct insert/update/delete grant beyond admin -- writes go through
-- admin_set_resource_learning_paths below (a relationship operation, not
-- plain CRUD, same reasoning admin_set_rank_learning_paths already uses).
create policy pd_resource_learning_paths_admin_all on public.pd_resource_learning_paths for insert with check (public.current_role() = 'admin');
create policy pd_resource_learning_paths_admin_delete on public.pd_resource_learning_paths for delete using (public.current_role() = 'admin');

-- ================= admin: set a resource's linked Mind Training paths =================
-- Replace-all-in-one-call, identical shape to admin_set_rank_learning_paths
-- (0060).
create or replace function public.admin_set_resource_learning_paths(p_resource_id uuid, p_learning_path_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;
  if not exists (select 1 from public.pd_resources where id = p_resource_id) then
    raise exception 'resource not found';
  end if;

  delete from public.pd_resource_learning_paths
    where resource_id = p_resource_id
      and learning_path_id <> all (coalesce(p_learning_path_ids, '{}'::uuid[]));

  insert into public.pd_resource_learning_paths (resource_id, learning_path_id)
  select p_resource_id, lp_id
  from unnest(coalesce(p_learning_path_ids, '{}'::uuid[])) as lp_id
  on conflict (resource_id, learning_path_id) do nothing;
end;
$$;

revoke execute on function public.admin_set_resource_learning_paths(uuid, uuid[]) from public, anon;
grant execute on function public.admin_set_resource_learning_paths(uuid, uuid[]) to authenticated;

-- ================= admin: set a resource's tags (same replace-all shape) =================
create or replace function public.admin_set_resource_tags(p_resource_id uuid, p_tag_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;
  if not exists (select 1 from public.pd_resources where id = p_resource_id) then
    raise exception 'resource not found';
  end if;

  delete from public.pd_resource_tags
    where resource_id = p_resource_id
      and tag_id <> all (coalesce(p_tag_ids, '{}'::uuid[]));

  insert into public.pd_resource_tags (resource_id, tag_id)
  select p_resource_id, t_id
  from unnest(coalesce(p_tag_ids, '{}'::uuid[])) as t_id
  on conflict (resource_id, tag_id) do nothing;
end;
$$;

revoke execute on function public.admin_set_resource_tags(uuid, uuid[]) from public, anon;
grant execute on function public.admin_set_resource_tags(uuid, uuid[]) to authenticated;

-- ================= get_my_mind_training_path: fill in recommendedResources =================
-- Same signature/name as 0067's version (CREATE OR REPLACE) -- now that
-- pd_resources/pd_resource_learning_paths exist, this replaces the
-- placeholder '{}'::jsonb with the real grouped-by-type resource list.
create or replace function public.get_my_mind_training_path(p_path_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_path record;
  v_levels jsonb;
  v_resources jsonb;
begin
  if not public.can_view_mind_training_path(p_path_id) then
    raise exception 'this path is not available to you';
  end if;

  select id, title, description into v_path from public.learning_paths where id = p_path_id and section = 'mind_training';
  if v_path.id is null then
    raise exception 'mind training path not found';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', lv.id,
    'title', lv.title,
    'description', lv.description,
    'modules', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id,
        'title', m.title,
        'description', m.description,
        'lessons', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', l.id,
            'title', l.title,
            'estimatedMinutes', l.estimated_minutes,
            'hasPdf', l.pdf_path is not null,
            'done', exists (select 1 from public.mind_training_lesson_progress lpr where lpr.lesson_id = l.id and lpr.uid = v_uid)
          ) order by l.order_index), '[]'::jsonb)
          from public.mind_training_lessons l where l.module_id = m.id and l.published = true
        ),
        'activities', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', a.id,
            'title', a.title,
            'done', exists (select 1 from public.mind_training_activity_progress apr where apr.activity_id = a.id and apr.uid = v_uid)
          ) order by a.order_index), '[]'::jsonb)
          from public.mind_training_activities a where a.module_id = m.id and a.published = true
        ),
        'assessment', (
          select jsonb_build_object(
            'id', asm.id,
            'title', asm.title,
            'passScorePercent', asm.pass_score_percent,
            'questionCount', (select count(*) from public.mind_training_assessment_questions q where q.assessment_id = asm.id),
            'passed', exists (select 1 from public.mind_training_assessment_attempts att where att.assessment_id = asm.id and att.uid = v_uid and att.passed = true)
          )
          from public.mind_training_assessments asm where asm.module_id = m.id
        )
      ) order by m.order_index), '[]'::jsonb)
      from public.mind_training_modules m where m.level_id = lv.id and m.published = true
    )
  ) order by lv.order_index), '[]'::jsonb) into v_levels
  from public.mind_training_levels lv where lv.path_id = p_path_id and lv.published = true;

  select coalesce(jsonb_object_agg(rt.resource_type, rt.items), '{}'::jsonb) into v_resources
  from (
    select r.resource_type,
      jsonb_agg(jsonb_build_object(
        'id', r.id,
        'title', r.title,
        'author', r.author,
        'thumbnailUrl', r.thumbnail_url,
        'description', r.description,
        'resourceType', r.resource_type
      ) order by r.order_index) as items
    from public.pd_resources r
    join public.pd_resource_learning_paths rlp on rlp.resource_id = r.id
    where rlp.learning_path_id = p_path_id and r.published = true
    group by r.resource_type
  ) rt;

  return jsonb_build_object(
    'id', v_path.id,
    'title', v_path.title,
    'description', v_path.description,
    'levels', v_levels,
    'recommendedResources', v_resources
  );
end;
$$;

revoke execute on function public.get_my_mind_training_path(uuid) from public, anon;
grant execute on function public.get_my_mind_training_path(uuid) to authenticated;
