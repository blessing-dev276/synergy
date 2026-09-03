-- Self-service "Leave the Synergy Office" from Profile.jsx, alongside the
-- existing Log out. Deliberately reuses the existing 'removed' status
-- (profiles_status_check, 0014/0016) rather than inventing a new status
-- value: StatusGate.jsx already bounces any 'removed' profile to
-- /blocked, SettingsTeam.jsx/MemberDetail.jsx already have full admin
-- status-management UI for 'removed' (including reinstating back to
-- 'active') -- none of that needs to change. The one real gap reusing
-- 'removed' as-is would leave: BlockedAccount.jsx's copy says "An admin
-- has removed your access", which is wrong for someone who left on their
-- own. left_at is the small, additive signal that fixes just that copy
-- without touching the status model itself.
alter table public.profiles add column left_at timestamptz;

create or replace function public.leave_office()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
begin
  select status into v_status from public.profiles where id = v_uid;
  if v_status is null then
    raise exception 'profile not found';
  end if;
  if v_status in ('suspended', 'removed') then
    raise exception 'your account is already inactive';
  end if;

  update public.profiles set status = 'removed', left_at = now() where id = v_uid;

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (v_uid, 'member_left_office', 'profile', v_uid::text, '{}'::jsonb);
end;
$$;

revoke execute on function public.leave_office() from public, anon;
grant execute on function public.leave_office() to authenticated;

-- ---------- set_member_status: clear left_at on reinstatement ----------
-- Otherwise a member who left voluntarily, got reinstated, and was later
-- actually removed by an admin would still carry the stale "left
-- voluntarily on <old date>" note (MemberDetail.jsx) from their first
-- departure. Same signature/body as 0016's version, just with this one
-- line added.
create or replace function public.set_member_status(p_uid uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_role text;
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;
  if p_status not in ('pending', 'active', 'suspended', 'removed') then
    raise exception 'invalid status: %', p_status;
  end if;
  if p_uid = auth.uid() then
    raise exception 'you cannot change your own status';
  end if;

  select role into v_target_role from public.profiles where id = p_uid;
  if v_target_role is null then
    raise exception 'member not found';
  end if;
  if v_target_role = 'admin' then
    raise exception 'cannot change another admin''s status';
  end if;

  update public.profiles
    set status = p_status, left_at = case when p_status = 'active' then null else left_at end
    where id = p_uid;

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'member_status_changed', 'profile', p_uid::text, jsonb_build_object('status', p_status));
end;
$$;
-- CREATE OR REPLACE preserves the existing grant (same name, same
-- signature) -- no new revoke/grant statements needed.
