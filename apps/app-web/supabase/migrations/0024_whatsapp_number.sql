-- Collect a WhatsApp number at signup so admins can add new members to the
-- office WhatsApp group.
alter table public.profiles add column if not exists whatsapp_number text default '';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sponsor_uid uuid;
  v_claimed_name text;
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

  return new;
end;
$$;
