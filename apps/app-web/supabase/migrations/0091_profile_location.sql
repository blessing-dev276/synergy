-- Onboarding restructure needs a place to save "Location" -- no existing
-- column for it anywhere on profiles (checked). Self-editable like
-- display_name/photo_url/bio already are.
alter table public.profiles add column location text not null default '';

-- Additive, not a replacement: column-level GRANT accumulates onto the
-- existing (role, table, privilege) entry rather than resetting it, so
-- this adds `location` to the set 0002_rls.sql already granted
-- (display_name, photo_url, bio, onboarding, last_active_at) without
-- needing to repeat that whole list here.
grant update (location) on public.profiles to authenticated;
