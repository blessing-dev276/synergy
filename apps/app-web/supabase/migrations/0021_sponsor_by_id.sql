-- Referral-link signup: a member's Network page (NetworkDashboard.jsx) shows
-- a copyable "/signup?ref=<their-uid>" link so a new signup can skip
-- search_sponsors entirely (searching by name was reported as stressful/
-- error-prone) — the sponsor is already known from the link, Signup.jsx just
-- needs to resolve that uid to a display name to confirm it to the invitee
-- before submitting. Mirrors search_sponsors' (0019) minimal-exposure
-- shape: anon-callable (pre-auth), display_name only, active members only.
create or replace function public.get_sponsor_by_id(p_id uuid)
returns table (id uuid, display_name text)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.display_name
  from public.profiles p
  where p.id = p_id and p.status = 'active' and coalesce(p.display_name, '') <> ''
  limit 1;
$$;

revoke execute on function public.get_sponsor_by_id(uuid) from public;
grant execute on function public.get_sponsor_by_id(uuid) to anon, authenticated;
