-- My Network rebuild: lets a member explicitly connect a prospect record
-- to the real member account that resulted from it, instead of the two
-- staying unrelated rows forever ("Registered Prospects", My Network spec).
--
-- Deliberately NOT automatic/inferred (no phone-number matching or
-- referral-link heuristics) -- there's no reliable key linking a prospects
-- row to a specific signup, and guessing wrong would misattribute a real
-- person. Instead this is member-confirmed: they pick which of their own
-- directly-sponsored members (sponsor_relationships, the actual verified
-- referral outcome, 0018/0019) a prospect turned into. link_prospect_to_
-- member only allows linking to a relationship that already exists there,
-- so this can't be used to fabricate or backdate a sponsor relationship --
-- it just labels an existing one.

alter table public.prospects add column registered_uid uuid references public.profiles(id) on delete set null;
create index prospects_registered_uid_idx on public.prospects (registered_uid);

create or replace function public.link_prospect_to_member(p_prospect_id uuid, p_member_uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_name text;
begin
  if not exists (select 1 from public.prospects where id = p_prospect_id and owner_uid = auth.uid()) then
    raise exception 'prospect not found';
  end if;
  if not exists (
    select 1 from public.sponsor_relationships
    where sponsor_uid = auth.uid() and member_uid = p_member_uid and active = true
  ) then
    raise exception 'that member isn''t someone you sponsor';
  end if;

  select display_name into v_member_name from public.profiles where id = p_member_uid;

  update public.prospects
    set registered_uid = p_member_uid,
        status = case when status in ('joined', 'not_interested') then status else 'joined' end,
        updated_at = now()
    where id = p_prospect_id and owner_uid = auth.uid();

  insert into public.prospect_activities (prospect_id, uid, activity_type, note)
  values (p_prospect_id, auth.uid(), 'status_change', 'Linked to member account: ' || coalesce(v_member_name, 'member'));

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'prospect_linked_to_member', 'prospect', p_prospect_id::text, jsonb_build_object('member_uid', p_member_uid));
end;
$$;

revoke execute on function public.link_prospect_to_member(uuid, uuid) from public, anon;
grant execute on function public.link_prospect_to_member(uuid, uuid) to authenticated;
