-- Signup's sponsor picker now lists every active member up front (filtered
-- by typing) instead of requiring 2+ characters before showing anything, so
-- search_sponsors must return the full roster for an empty query too.
-- Note: this intentionally relaxes the anti-scraping cap from 0019 — the
-- full active member roster (name only, no email/role/photo) is now
-- reachable by any anon visitor of the signup page in one call.
create or replace function public.search_sponsors(p_query text)
returns table (id uuid, display_name text)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.display_name
  from public.profiles p
  where p.status = 'active'
    and coalesce(p.display_name, '') <> ''
    and position(lower(trim(coalesce(p_query, ''))) in lower(p.display_name)) > 0
  order by p.display_name
  limit 500;
$$;

revoke execute on function public.search_sponsors(text) from public;
grant execute on function public.search_sponsors(text) to anon, authenticated;
