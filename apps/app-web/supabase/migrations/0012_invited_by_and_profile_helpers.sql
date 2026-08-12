-- Registration must record who invited the new member (selected from
-- existing members/mentors/admins, not free text), and the profile page
-- needs to show that person's name plus the member's assigned mentor's
-- name — both require reading other people's profiles.profiles RLS
-- (0002) only lets a caller read their own row, an admin, or (for a
-- mentor) their assigned members, so none of that is reachable directly.
-- SECURITY DEFINER RPCs expose the minimal safe slice instead.

alter table public.profiles add column invited_by_uid uuid references public.profiles(id);
create index profiles_invited_by_idx on public.profiles (invited_by_uid);
-- Not added to the profiles update grant (0002) — like role/mentor_uid,
-- this stays server-set only (by handle_new_user, below) so a member can
-- never rewrite their own referral history after signup.

-- ---------- capture invited_by_uid at signup, from auth metadata ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invited_by uuid;
begin
  begin
    v_invited_by := nullif(new.raw_user_meta_data->>'invited_by_uid', '')::uuid;
  exception when others then
    v_invited_by := null;
  end;

  if v_invited_by is not null and not exists (select 1 from public.profiles where id = v_invited_by) then
    v_invited_by := null;
  end if;

  insert into public.profiles (id, display_name, email, invited_by_uid)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', ''), new.email, v_invited_by)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------- selectable inviter list (id + name only) ----------
-- Deliberately anon-callable: the signup form (pre-auth) needs it to
-- populate the "who invited you" picker. Only display_name/role are
-- exposed, no email/photo/bio/stats.
create or replace function public.list_inviters()
returns table (id uuid, display_name text, role text)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.display_name, p.role
  from public.profiles p
  where p.status = 'active' and coalesce(p.display_name, '') <> ''
  order by p.display_name
  limit 500;
$$;

revoke execute on function public.list_inviters() from public;
grant execute on function public.list_inviters() to anon, authenticated;

-- ---------- a member's own mentor (name/email/photo only) ----------
create or replace function public.get_my_mentor()
returns table (id uuid, display_name text, email text, photo_url text)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.display_name, p.email, p.photo_url
  from public.profiles p
  join public.profiles me on me.mentor_uid = p.id
  where me.id = auth.uid();
$$;

revoke execute on function public.get_my_mentor() from public, anon;
grant execute on function public.get_my_mentor() to authenticated;
