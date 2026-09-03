-- ================= HQ360 restructure: fix Personal Development shape =================
-- 0107 built personal_development_resources as its own content table
-- (title/type/file_url/body inline). The spec (§6.1) has it as a thin LINK
-- table into the shared `resources` library (purpose='book'), same pattern
-- as income_development_resources later. Nothing has consumed 0107's shape
-- yet (no frontend, no rows) so this drops and rebuilds it correctly rather
-- than carrying the divergence forward.

drop function if exists public.get_admin_pd_overview();
drop function if exists public.get_my_personal_development();
drop function if exists public.toggle_personal_development_item(uuid, boolean);
drop function if exists public.admin_delete_pd_resource(uuid);
drop function if exists public.admin_set_pd_resource_active(uuid, boolean);
drop function if exists public.admin_add_pd_resource(text, text, text, text);
drop table if exists public.personal_development_completions;
drop table if exists public.personal_development_resources;

-- ================= link table: which shared `resources` rows are required =================
create table public.personal_development_resources (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id),
  resource_id uuid not null references public.resources(id) on delete cascade,
  added_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (org_id, resource_id)
);
create index pd_resources_org_idx on public.personal_development_resources (org_id);

alter table public.personal_development_resources enable row level security;
grant select on public.personal_development_resources to authenticated;
create policy pd_resources_select on public.personal_development_resources for select using (auth.uid() is not null);

create table public.personal_development_completions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id),
  resource_id uuid not null references public.resources(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  completed_on date not null,
  created_at timestamptz not null default now(),
  unique (resource_id, user_id, completed_on)
);
create index pd_completions_user_date_idx on public.personal_development_completions (org_id, user_id, completed_on);

alter table public.personal_development_completions enable row level security;
grant select on public.personal_development_completions to authenticated;
create policy pd_completions_select on public.personal_development_completions for select
  using (user_id = auth.uid() or public.current_role() in ('admin', 'mentor'));
-- no client insert/update/delete: written only through toggle_personal_development_item below.

-- ================= admin: curate the required list =================
-- Adds the shared resource (purpose='book') and links it in one step, same
-- as the HQ360 admin flow ("createResource + insert the link row").
create or replace function public.admin_add_pd_resource(
  p_title text, p_file_type text, p_file_url text
)
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
  values (auth.uid(), trim(p_title), trim(p_file_url), p_file_type, 'book')
  returning id into v_resource_id;

  insert into public.personal_development_resources (resource_id, added_by)
  values (v_resource_id, auth.uid())
  returning id into v_link_id;

  return v_link_id;
end;
$$;

revoke execute on function public.admin_add_pd_resource(text, text, text) from public, anon;
grant execute on function public.admin_add_pd_resource(text, text, text) to authenticated;

-- Unlinks (removes from the required list) without deleting the underlying
-- resources row, matching "Remove unlinks (deletes the link row)."
create or replace function public.admin_remove_pd_resource(p_link_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;
  delete from public.personal_development_resources where id = p_link_id;
end;
$$;

revoke execute on function public.admin_remove_pd_resource(uuid) from public, anon;
grant execute on function public.admin_remove_pd_resource(uuid) to authenticated;

-- ================= member: today's checklist + streak =================
create or replace function public.toggle_personal_development_item(p_resource_id uuid, p_done boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := current_date;
  v_linked boolean;
begin
  select exists(
    select 1 from public.personal_development_resources
      where org_id = public.current_org_id() and resource_id = p_resource_id
  ) into v_linked;
  if not v_linked then
    raise exception 'this resource is not on the required list';
  end if;

  if p_done then
    insert into public.personal_development_completions (org_id, resource_id, user_id, completed_on)
    values (public.current_org_id(), p_resource_id, v_uid, v_today)
    on conflict (resource_id, user_id, completed_on) do nothing;
  else
    delete from public.personal_development_completions
      where org_id = public.current_org_id() and user_id = v_uid
        and resource_id = p_resource_id and completed_on = v_today;
  end if;
end;
$$;

revoke execute on function public.toggle_personal_development_item(uuid, boolean) from public, anon;
grant execute on function public.toggle_personal_development_item(uuid, boolean) to authenticated;

-- Today's checklist + a real consecutive-day streak. A day counts as "full"
-- only if every resource required that day (link created_at <= that day)
-- was completed by this user. Streak counts consecutive full days ending
-- today or yesterday (an in-progress today doesn't break an existing streak).
create or replace function public.get_my_personal_development()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := current_date;
  v_items jsonb;
  v_streak int := 0;
  v_cursor date;
  v_day_required int;
  v_day_done int;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'linkId', l.id, 'resourceId', r.id, 'title', r.title, 'fileType', r.file_type, 'fileUrl', r.file_url,
    'done', (c.resource_id is not null)
  ) order by l.created_at), '[]'::jsonb)
    into v_items
    from public.personal_development_resources l
    join public.resources r on r.id = l.resource_id
    left join public.personal_development_completions c
      on c.resource_id = l.resource_id and c.user_id = v_uid and c.completed_on = v_today
    where l.org_id = public.current_org_id();

  select count(*) into v_day_required from public.personal_development_resources
    where org_id = public.current_org_id() and created_at::date <= v_today;
  select count(*) into v_day_done from public.personal_development_completions
    where org_id = public.current_org_id() and user_id = v_uid and completed_on = v_today;

  if v_day_required > 0 and v_day_done >= v_day_required then
    v_cursor := v_today;
  else
    v_cursor := v_today - 1;
  end if;

  loop
    exit when v_today - v_cursor > 60;
    select count(*) into v_day_required from public.personal_development_resources
      where org_id = public.current_org_id() and created_at::date <= v_cursor;
    exit when v_day_required = 0;
    select count(*) into v_day_done from public.personal_development_completions
      where org_id = public.current_org_id() and user_id = v_uid and completed_on = v_cursor;
    exit when v_day_done < v_day_required;
    v_streak := v_streak + 1;
    v_cursor := v_cursor - 1;
  end loop;

  return jsonb_build_object('items', v_items, 'streak', v_streak);
end;
$$;

revoke execute on function public.get_my_personal_development() from public, anon;
grant execute on function public.get_my_personal_development() to authenticated;

-- Admin overview: every active member's today completion vs. required count.
create or replace function public.get_admin_pd_overview()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_today date := current_date;
  v_total_required int;
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;

  select count(*) into v_total_required from public.personal_development_resources
    where org_id = public.current_org_id();

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'uid', p.id,
      'displayName', p.display_name,
      'doneToday', coalesce(t.done_count, 0),
      'totalToday', v_total_required
    ) order by p.display_name)
    from public.profiles p
    left join (
      select user_id, count(*) as done_count from public.personal_development_completions
        where org_id = public.current_org_id() and completed_on = v_today
        group by user_id
    ) t on t.user_id = p.id
    where p.role = 'member' and p.status = 'active'
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.get_admin_pd_overview() from public, anon;
grant execute on function public.get_admin_pd_overview() to authenticated;
