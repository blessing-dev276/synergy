-- ================= HQ360 restructure: Stage 2 — Personal Development =================
-- A daily checklist of admin-authored resources (video/pdf/podcast/article/
-- prompt). Completion resets every day; "streak" = number of consecutive
-- days (ending today or yesterday) where every resource active that day
-- was completed. This is a NEW system distinct from the existing
-- pd_resources / mind_training_* schemas -- neither is touched here.

create table public.personal_development_resources (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id),
  title text not null,
  type text not null check (type in ('video', 'pdf', 'podcast', 'article', 'prompt')),
  file_url text,
  body text,
  order_index int not null default 0,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (
    (type = 'prompt' and body is not null)
    or (type <> 'prompt' and file_url is not null)
  )
);
create index pd_resources_org_active_idx on public.personal_development_resources (org_id, is_active, order_index);

alter table public.personal_development_resources enable row level security;
grant select on public.personal_development_resources to authenticated;
create policy pd_resources_select on public.personal_development_resources for select using (auth.uid() is not null);

create table public.personal_development_completions (
  org_id uuid not null default public.current_org_id() references public.organizations(id),
  user_id uuid not null references public.profiles(id) on delete cascade,
  resource_id uuid not null references public.personal_development_resources(id) on delete cascade,
  completed_on date not null,
  completed_at timestamptz not null default now(),
  primary key (org_id, user_id, resource_id, completed_on)
);
create index pd_completions_user_date_idx on public.personal_development_completions (org_id, user_id, completed_on);

alter table public.personal_development_completions enable row level security;
grant select on public.personal_development_completions to authenticated;
create policy pd_completions_select on public.personal_development_completions for select
  using (user_id = auth.uid() or public.current_role() in ('admin', 'mentor'));
-- no client insert/update/delete: written only through toggle_personal_development_item below.

-- ================= admin: author content =================
create or replace function public.admin_add_pd_resource(
  p_title text, p_type text, p_file_url text, p_body text
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
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'a resource needs a title';
  end if;
  if p_type not in ('video', 'pdf', 'podcast', 'article', 'prompt') then
    raise exception 'invalid type: %', p_type;
  end if;
  if p_type = 'prompt' and coalesce(trim(p_body), '') = '' then
    raise exception 'a prompt needs body text';
  end if;
  if p_type <> 'prompt' and coalesce(trim(p_file_url), '') = '' then
    raise exception 'a % resource needs a file/link', p_type;
  end if;

  select coalesce(max(order_index), 0) + 1 into v_next_order
    from public.personal_development_resources where org_id = public.current_org_id();

  insert into public.personal_development_resources (title, type, file_url, body, order_index, created_by)
  values (trim(p_title), p_type, nullif(trim(p_file_url), ''), nullif(trim(p_body), ''), v_next_order, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.admin_add_pd_resource(text, text, text, text) from public, anon;
grant execute on function public.admin_add_pd_resource(text, text, text, text) to authenticated;

create or replace function public.admin_set_pd_resource_active(p_id uuid, p_is_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;
  update public.personal_development_resources set is_active = p_is_active where id = p_id;
end;
$$;

revoke execute on function public.admin_set_pd_resource_active(uuid, boolean) from public, anon;
grant execute on function public.admin_set_pd_resource_active(uuid, boolean) to authenticated;

create or replace function public.admin_delete_pd_resource(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;
  delete from public.personal_development_resources where id = p_id;
end;
$$;

revoke execute on function public.admin_delete_pd_resource(uuid) from public, anon;
grant execute on function public.admin_delete_pd_resource(uuid) to authenticated;

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
  v_active boolean;
begin
  select is_active into v_active from public.personal_development_resources where id = p_resource_id;
  if v_active is null then
    raise exception 'resource not found';
  end if;
  if not v_active then
    raise exception 'this resource is no longer active';
  end if;

  if p_done then
    insert into public.personal_development_completions (org_id, user_id, resource_id, completed_on)
    values (public.current_org_id(), v_uid, p_resource_id, v_today)
    on conflict (org_id, user_id, resource_id, completed_on) do nothing;
  else
    delete from public.personal_development_completions
      where org_id = public.current_org_id() and user_id = v_uid
        and resource_id = p_resource_id and completed_on = v_today;
  end if;
end;
$$;

revoke execute on function public.toggle_personal_development_item(uuid, boolean) from public, anon;
grant execute on function public.toggle_personal_development_item(uuid, boolean) to authenticated;

-- Today's checklist + a real consecutive-day streak, computed from a
-- 60-day lookback of which resources were active each day vs. completed.
-- A day counts as "full" only if every resource active that day (by
-- created_at <= that day and not yet deleted) was completed by this user.
-- Streak counts consecutive full days ending today or yesterday (today
-- not yet finished doesn't break an existing streak).
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
  v_day_active int;
  v_day_done int;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'title', r.title, 'type', r.type, 'fileUrl', r.file_url, 'body', r.body,
    'done', (c.resource_id is not null)
  ) order by r.order_index), '[]'::jsonb)
    into v_items
    from public.personal_development_resources r
    left join public.personal_development_completions c
      on c.resource_id = r.id and c.user_id = v_uid and c.completed_on = v_today
    where r.org_id = public.current_org_id() and r.is_active;

  -- streak: walk backward from today; if today isn't full yet, start from
  -- yesterday instead (an in-progress today shouldn't zero out a streak).
  select count(*) into v_day_active from public.personal_development_resources
    where org_id = public.current_org_id() and is_active and created_at::date <= v_today;
  select count(*) into v_day_done from public.personal_development_completions
    where org_id = public.current_org_id() and user_id = v_uid and completed_on = v_today;

  if v_day_active > 0 and v_day_done >= v_day_active then
    v_cursor := v_today;
  else
    v_cursor := v_today - 1;
  end if;

  loop
    exit when v_today - v_cursor > 60;
    select count(*) into v_day_active from public.personal_development_resources
      where org_id = public.current_org_id() and is_active and created_at::date <= v_cursor;
    exit when v_day_active = 0;
    select count(*) into v_day_done from public.personal_development_completions
      where org_id = public.current_org_id() and user_id = v_uid and completed_on = v_cursor;
    exit when v_day_done < v_day_active;
    v_streak := v_streak + 1;
    v_cursor := v_cursor - 1;
  end loop;

  return jsonb_build_object('items', v_items, 'streak', v_streak);
end;
$$;

revoke execute on function public.get_my_personal_development() from public, anon;
grant execute on function public.get_my_personal_development() to authenticated;

-- Admin overview: every active member's current streak + today's completion.
create or replace function public.get_admin_pd_overview()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_today date := current_date;
  v_total_active int;
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;

  select count(*) into v_total_active from public.personal_development_resources
    where org_id = public.current_org_id() and is_active;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'uid', p.id,
      'displayName', p.display_name,
      'doneToday', coalesce(t.done_count, 0),
      'totalToday', v_total_active
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
