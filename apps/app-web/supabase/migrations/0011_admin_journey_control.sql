-- Lets an admin directly set/advance a member's current journey stage.
-- member_journey has had select-only grants since 0008 (rows were only
-- ever created implicitly, by get_journey_overview, the first time a
-- member viewed their own dashboard) — there was no path for an admin to
-- actually choose or change someone's stage. This is that path.
create or replace function public.set_member_stage(p_uid uuid, p_stage_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_role text;
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;

  select role into v_member_role from public.profiles where id = p_uid;
  if v_member_role is distinct from 'member' then
    raise exception 'target % is not a member', p_uid;
  end if;

  if p_stage_id is not null and not exists (select 1 from public.stages where id = p_stage_id) then
    raise exception 'stage not found';
  end if;

  insert into public.member_journey (uid, current_stage_id, started_at, updated_at)
  values (p_uid, p_stage_id, now(), now())
  on conflict (uid) do update set current_stage_id = p_stage_id, updated_at = now();

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'member_stage_set', 'member_journey', p_uid::text, jsonb_build_object('stage_id', p_stage_id));
end;
$$;

revoke execute on function public.set_member_stage(uuid, uuid) from public, anon;
grant execute on function public.set_member_stage(uuid, uuid) to authenticated;
