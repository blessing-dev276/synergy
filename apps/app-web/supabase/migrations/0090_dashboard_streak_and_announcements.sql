-- Two small, additive pieces for the member/admin dashboard rework:
--
-- 1. get_my_streak() -- "how many consecutive days (ending today or
--    yesterday) has this member actually submitted real work" -- computed
--    from timestamps that already exist (content_evidence_submissions,
--    assignment_submissions, rank_task_submissions), not a new counter
--    column anywhere. No new table: a pure read over existing rows.
--
-- 2. announcements -- genuinely new (nothing like it exists: grep for
--    "announcement" across the whole repo turns up nothing). Kept
--    deliberately minimal -- title/body/active, admin-authored, no
--    scheduling or per-audience targeting -- since SettingsNotifications.jsx
--    already reserves the "which notifications go out, and to whom" slot
--    for exactly this and was a literal "Coming soon" stub.

-- ---------- 1. streak ----------
create or replace function public.get_my_streak()
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_streak int;
begin
  if v_uid is null then
    return 0;
  end if;

  with days as (
    select submitted_at::date as d from public.content_evidence_submissions where uid = v_uid
    union
    select submitted_at::date as d from public.assignment_submissions where uid = v_uid
    union
    select submitted_at::date as d from public.rank_task_submissions where uid = v_uid
  ),
  distinct_days as (
    select distinct d from days
  ),
  -- Consecutive dates share the same (d - row_number) value once ordered --
  -- the classic "gaps and islands" grouping trick.
  runs as (
    select d, (d - (row_number() over (order by d))::int) as grp
    from distinct_days
  ),
  run_lengths as (
    select grp, count(*) as run_len, max(d) as run_end
    from runs
    group by grp
  )
  select run_len into v_streak
  from run_lengths
  where run_end >= current_date - 1
  order by run_end desc
  limit 1;

  return coalesce(v_streak, 0);
end;
$$;

revoke execute on function public.get_my_streak() from public, anon;
grant execute on function public.get_my_streak() to authenticated;

-- ---------- 2. announcements ----------
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  active boolean not null default true
);
create index announcements_active_created_idx on public.announcements (active, created_at desc);

alter table public.announcements enable row level security;
grant select on public.announcements to authenticated;
create policy announcements_select on public.announcements for select
  using (active or public.current_role() = 'admin');
-- no client insert/update/delete grant: admin-authored only, via the RPCs below.

create or replace function public.get_active_announcements()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'title', title, 'body', body, 'createdAt', created_at
  )), '[]'::jsonb)
  from (
    select id, title, body, created_at from public.announcements
    where active order by created_at desc limit 5
  ) recent;
$$;

revoke execute on function public.get_active_announcements() from public, anon;
grant execute on function public.get_active_announcements() to authenticated;

create or replace function public.get_admin_announcements()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', id, 'title', title, 'body', body, 'createdAt', created_at, 'active', active
    ) order by created_at desc)
    from public.announcements
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.get_admin_announcements() from public, anon;
grant execute on function public.get_admin_announcements() to authenticated;

create or replace function public.create_announcement(p_title text, p_body text)
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
    raise exception 'title is required';
  end if;

  insert into public.announcements (title, body, created_by)
  values (trim(p_title), coalesce(p_body, ''), auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.create_announcement(text, text) from public, anon;
grant execute on function public.create_announcement(text, text) to authenticated;

create or replace function public.delete_announcement(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;
  delete from public.announcements where id = p_id;
end;
$$;

revoke execute on function public.delete_announcement(uuid) from public, anon;
grant execute on function public.delete_announcement(uuid) to authenticated;
