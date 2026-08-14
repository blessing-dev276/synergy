-- New members now get their first published stage assigned the moment
-- their account is created, instead of waiting on the lazy auto-start in
-- get_journey_overview (0009) to fire the first time they open their
-- dashboard. That lazy path is left in place unchanged -- both use the same
-- "earliest published stage" rule and `on conflict (uid) do nothing`, so
-- they're safe to run in either order. It now just backstops members who
-- signed up before this migration, or the rare case where no stage was
-- published yet at signup time (this trigger simply skips assignment then;
-- the lazy path picks it up later once a stage exists).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sponsor_uid uuid;
  v_claimed_name text;
  v_first_stage_id uuid;
begin
  begin
    v_sponsor_uid := nullif(new.raw_user_meta_data->>'sponsor_uid', '')::uuid;
  exception when others then
    v_sponsor_uid := null;
  end;

  if v_sponsor_uid is not null and not exists (
    select 1 from public.profiles where id = v_sponsor_uid and status = 'active'
  ) then
    v_sponsor_uid := null;
  end if;

  v_claimed_name := nullif(trim(new.raw_user_meta_data->>'claimed_sponsor_name'), '');

  insert into public.profiles (id, display_name, email, sponsor_uid, whatsapp_number, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', ''),
    new.email,
    v_sponsor_uid,
    coalesce(new.raw_user_meta_data->>'whatsapp_number', ''),
    'pending'
  )
  on conflict (id) do nothing;

  if v_sponsor_uid is not null then
    insert into public.sponsor_relationships (member_uid, sponsor_uid, source, active, assigned_at)
    values (new.id, v_sponsor_uid, 'signup', true, now());
  elsif v_claimed_name is not null then
    insert into public.sponsor_requests (member_uid, claimed_sponsor_name, status)
    values (new.id, v_claimed_name, 'pending');
  end if;

  select id into v_first_stage_id from public.stages where published = true order by order_index limit 1;
  if v_first_stage_id is not null then
    insert into public.member_journey (uid, current_stage_id, started_at, updated_at)
    values (new.id, v_first_stage_id, now(), now())
    on conflict (uid) do nothing;
  end if;

  return new;
end;
$$;
-- Trigger on_auth_user_created (0003) already points at this function by
-- name; CREATE OR REPLACE is enough, no need to redeclare the trigger.
