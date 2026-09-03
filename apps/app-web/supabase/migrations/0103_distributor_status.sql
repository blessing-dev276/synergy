-- "Status" -- a fixed leadership/pin title, separate from the free-form
-- Rank Journey ladder (ranks/rank_id, Business Path v2) and from
-- profiles.status (account state: active/pending/suspended/removed,
-- 0001/0014/0016). Admin-assigned only, no member self-service, no
-- prerequisites to earn it yet -- just a real, persisted tag an admin can
-- set or clear, for compensation-plan qualifications to be built against
-- later. Column named distributor_status (not "status") specifically to
-- avoid colliding with the existing account-status column of the same
-- table.
alter table public.profiles add column distributor_status text
  check (distributor_status in (
    'distributor', 'manager', 'senior_manager', 'executive_manager',
    'director', 'emerald_director', 'sapphire_director'
  ));

create or replace function public.admin_set_distributor_status(p_uid uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text;
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;
  if p_status is not null and p_status not in (
    'distributor', 'manager', 'senior_manager', 'executive_manager',
    'director', 'emerald_director', 'sapphire_director'
  ) then
    raise exception 'invalid status: %', p_status;
  end if;
  if not exists (select 1 from public.profiles where id = p_uid) then
    raise exception 'member not found';
  end if;

  update public.profiles set distributor_status = p_status where id = p_uid;

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'distributor_status_changed', 'profile', p_uid::text, jsonb_build_object('status', p_status));

  if p_status is not null then
    -- Same title casing as the frontend's DISTRIBUTOR_STATUSES label map
    -- (src/lib/distributorStatus.js) -- duplicated here only because a
    -- notification body has to read right without a UI to render it.
    v_label := case p_status
      when 'distributor' then 'Distributor'
      when 'manager' then 'Manager'
      when 'senior_manager' then 'Senior Manager'
      when 'executive_manager' then 'Executive Manager'
      when 'director' then 'Director'
      when 'emerald_director' then 'Emerald Director'
      when 'sapphire_director' then 'Sapphire Director'
    end;
    insert into public.notifications (uid, type, title, body, link_to)
    values (p_uid, 'distributor_status_changed', 'Status updated 🎉', 'Your status is now ' || v_label || '.', '/profile');
  end if;
end;
$$;

revoke execute on function public.admin_set_distributor_status(uuid, text) from public, anon;
grant execute on function public.admin_set_distributor_status(uuid, text) to authenticated;
