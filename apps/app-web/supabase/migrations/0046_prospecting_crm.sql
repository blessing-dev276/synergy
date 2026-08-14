-- Prospecting / follow-up CRM. Today "prospects" on the weekly leaderboard
-- (0026) is just a count of new signups under a sponsor -- there's no
-- actual contact list or follow-up tracking. This adds a real pipeline:
-- prospects (a member's own contact list, with status + next follow-up
-- date) and prospect_activities (a timeline of calls/messages/meetings per
-- prospect). Core-pipeline scope: no automated reminder notifications yet,
-- just the list + status + activity log + an admin rollup.
--
-- Writes are RPC-only (no client insert/update grant) -- same lockdown
-- reasoning as member_progress/monthly_goals -- so status changes always
-- also produce a matching activity row, never drift apart.

create table public.prospects (
  id uuid primary key default gen_random_uuid(),
  owner_uid uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  phone text default '',
  whatsapp text default '',
  source text default '',
  status text not null default 'new' check (status in ('new', 'contacted', 'follow_up_scheduled', 'presented', 'joined', 'not_interested')),
  next_follow_up_at date,
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index prospects_owner_status_idx on public.prospects (owner_uid, status);
create index prospects_owner_follow_up_idx on public.prospects (owner_uid, next_follow_up_at);

alter table public.prospects enable row level security;
grant select on public.prospects to authenticated;
create policy prospects_select on public.prospects for select
  using (owner_uid = auth.uid() or public.current_role() = 'admin');
-- no client insert/update grant: written only by add_prospect/update_prospect/set_prospect_status.

create table public.prospect_activities (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  uid uuid not null references public.profiles(id) on delete cascade,
  activity_type text not null check (activity_type in ('call', 'message', 'meeting', 'presentation', 'follow_up', 'note', 'status_change')),
  note text default '',
  created_at timestamptz not null default now()
);
create index prospect_activities_prospect_idx on public.prospect_activities (prospect_id, created_at desc);

alter table public.prospect_activities enable row level security;
grant select on public.prospect_activities to authenticated;
create policy prospect_activities_select on public.prospect_activities for select
  using (
    public.current_role() = 'admin'
    or exists (select 1 from public.prospects pr where pr.id = prospect_id and pr.owner_uid = auth.uid())
  );
-- no client insert/update grant: written only by log_prospect_activity/set_prospect_status.

-- ---------- member: add a prospect ----------
create or replace function public.add_prospect(p_name text, p_phone text, p_whatsapp text, p_source text, p_notes text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_active() then
    raise exception 'your account is suspended and can''t add prospects';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'a prospect needs a name';
  end if;

  insert into public.prospects (owner_uid, name, phone, whatsapp, source, notes)
  values (auth.uid(), trim(p_name), coalesce(p_phone, ''), coalesce(p_whatsapp, ''), coalesce(p_source, ''), coalesce(p_notes, ''))
  returning id into v_id;

  insert into public.activity_log (actor_uid, action, target_type, target_id)
  values (auth.uid(), 'prospect_added', 'prospect', v_id::text);

  return v_id;
end;
$$;

revoke execute on function public.add_prospect(text, text, text, text, text) from public, anon;
grant execute on function public.add_prospect(text, text, text, text, text) to authenticated;

-- ---------- member: edit a prospect's contact info/notes (not status -- see below) ----------
create or replace function public.update_prospect(p_id uuid, p_name text, p_phone text, p_whatsapp text, p_source text, p_notes text, p_next_follow_up_at date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.prospects where id = p_id and owner_uid = auth.uid()) then
    raise exception 'prospect not found';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'a prospect needs a name';
  end if;

  update public.prospects
    set name = trim(p_name), phone = coalesce(p_phone, ''), whatsapp = coalesce(p_whatsapp, ''),
        source = coalesce(p_source, ''), notes = coalesce(p_notes, ''), next_follow_up_at = p_next_follow_up_at,
        updated_at = now()
    where id = p_id and owner_uid = auth.uid();
end;
$$;

revoke execute on function public.update_prospect(uuid, text, text, text, text, text, date) from public, anon;
grant execute on function public.update_prospect(uuid, text, text, text, text, text, date) to authenticated;

-- ---------- member: move a prospect through the pipeline ----------
create or replace function public.set_prospect_status(p_id uuid, p_status text, p_next_follow_up_at date, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('new', 'contacted', 'follow_up_scheduled', 'presented', 'joined', 'not_interested') then
    raise exception 'invalid prospect status: %', p_status;
  end if;
  if not exists (select 1 from public.prospects where id = p_id and owner_uid = auth.uid()) then
    raise exception 'prospect not found';
  end if;

  update public.prospects
    set status = p_status, next_follow_up_at = p_next_follow_up_at, updated_at = now()
    where id = p_id and owner_uid = auth.uid();

  insert into public.prospect_activities (prospect_id, uid, activity_type, note)
  values (p_id, auth.uid(), 'status_change', coalesce(p_note, 'Status changed to ' || p_status));

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'prospect_status_changed', 'prospect', p_id::text, jsonb_build_object('status', p_status));
end;
$$;

revoke execute on function public.set_prospect_status(uuid, text, date, text) from public, anon;
grant execute on function public.set_prospect_status(uuid, text, date, text) to authenticated;

-- ---------- member: log an activity (call/message/meeting/etc.) without changing status ----------
create or replace function public.log_prospect_activity(p_prospect_id uuid, p_activity_type text, p_note text, p_next_follow_up_at date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_activity_type not in ('call', 'message', 'meeting', 'presentation', 'follow_up', 'note') then
    raise exception 'invalid activity type: %', p_activity_type;
  end if;
  if not exists (select 1 from public.prospects where id = p_prospect_id and owner_uid = auth.uid()) then
    raise exception 'prospect not found';
  end if;

  insert into public.prospect_activities (prospect_id, uid, activity_type, note)
  values (p_prospect_id, auth.uid(), p_activity_type, coalesce(p_note, ''));

  if p_next_follow_up_at is not null then
    update public.prospects set next_follow_up_at = p_next_follow_up_at, updated_at = now()
      where id = p_prospect_id and owner_uid = auth.uid();
  end if;
end;
$$;

revoke execute on function public.log_prospect_activity(uuid, text, text, date) from public, anon;
grant execute on function public.log_prospect_activity(uuid, text, text, date) to authenticated;

-- ---------- admin: who is prospecting, who is following up ----------
create or replace function public.get_admin_prospecting_overview()
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
      'photoUrl', p.photo_url,
      'totalProspects', (select count(*) from public.prospects where owner_uid = p.id),
      'statusCounts', (
        select coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb)
        from (select status, count(*) as cnt from public.prospects where owner_uid = p.id group by status) s
      ),
      'overdueFollowUps', (select count(*) from public.prospects where owner_uid = p.id and next_follow_up_at < current_date and status not in ('joined', 'not_interested')),
      'dueTodayFollowUps', (select count(*) from public.prospects where owner_uid = p.id and next_follow_up_at = current_date and status not in ('joined', 'not_interested')),
      'lastActivityAt', (
        select max(pa.created_at) from public.prospect_activities pa
        join public.prospects pr on pr.id = pa.prospect_id
        where pr.owner_uid = p.id
      )
    ) order by p.display_name)
    from public.profiles p
    where p.role = 'member' and p.status = 'active'
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.get_admin_prospecting_overview() from public, anon;
grant execute on function public.get_admin_prospecting_overview() to authenticated;
