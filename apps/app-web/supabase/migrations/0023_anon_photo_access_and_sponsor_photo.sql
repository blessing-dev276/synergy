-- Signup's sponsor picker needs to show a photo next to same-name matches
-- so people can tell them apart before an account exists. That means:
--   1. anon visitors need read access to profile-photos (was authenticated-
--      only, see 0004_storage.sql) — a deliberate widening of exposure,
--      confirmed with the product owner.
--   2. search_sponsors (anon-callable, see 0019/0022) needs to return
--      photo_url alongside id/display_name.

drop policy if exists profile_photos_read on storage.objects;
create policy profile_photos_read on storage.objects for select
  using (bucket_id = 'profile-photos');

-- CREATE OR REPLACE can't change a function's return-column set (Postgres
-- error 42P13, "cannot change return type of existing function... Row type
-- defined by OUT parameters is different") -- must drop first since this
-- adds photo_url to the 0019/0022 two-column shape.
drop function if exists public.search_sponsors(text);

create function public.search_sponsors(p_query text)
returns table (id uuid, display_name text, photo_url text)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.display_name, p.photo_url
  from public.profiles p
  where p.status = 'active'
    and coalesce(p.display_name, '') <> ''
    and position(lower(trim(coalesce(p_query, ''))) in lower(p.display_name)) > 0
  order by p.display_name
  limit 500;
$$;

revoke execute on function public.search_sponsors(text) from public;
grant execute on function public.search_sponsors(text) to anon, authenticated;
