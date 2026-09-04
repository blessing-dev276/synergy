-- Fix: admin_delete_rank (0060) has always been a bare `delete from ranks`,
-- but three tables reference ranks(id) with no ON DELETE action at all
-- (the default, RESTRICT) -- deleting almost any real rank throws a raw
-- Postgres foreign key error straight into the admin's toast instead of
-- either succeeding or a clean, readable exception:
--
--   business_path_stages.rank_id (0104) -- added after admin_delete_rank
--     already existed, with no ON DELETE action considered at all. Every
--     rank got a matching stage row via that migration's backfill, so
--     this alone blocks deleting almost any rank today (confirmed live --
--     this is the exact error reported).
--   rank_advancement_requests.from_rank_id / to_rank_id (0082) -- historical
--     request records; not hit yet for most ranks (nothing points at a
--     brand-new or low-traffic rank), but would throw the identical error
--     the moment a rank with any real advancement history was deleted.
--   member_goals.target_rank_id (0039/0060) -- a member's own "reach rank
--     X" goal target; same latent problem.
--
-- None of these should make a rank truly undeletable, and none of them
-- should silently destroy real content either. Kept a plain
-- `delete from ranks` in admin_delete_rank itself either way -- fixing the
-- FK actions is the correct level to solve this at, so every current and
-- future caller (not just this one RPC) behaves consistently:
--
--   business_path_stages.rank_id -> SET NULL. Already an explicitly
--     anticipated state in this design -- 0104's own comment says a stage
--     with rank_id null "won't surface on Rank Journey until an admin
--     points it at a rank." Deleting the rank un-points it instead of
--     destroying its milestones' real content.
--   rank_advancement_requests.from_rank_id -> SET NULL (nullable already).
--   rank_advancement_requests.to_rank_id -> CASCADE, since it's NOT NULL
--     (can't null out a required column) and a request record about
--     becoming a rank that no longer exists has nothing left to mean.
--   member_goals.target_rank_id -> SET NULL (nullable already, same
--     "goal target no longer exists" semantic profiles.rank_id already
--     uses for the exact same situation, 0059).

alter table public.business_path_stages drop constraint business_path_stages_rank_id_fkey;
alter table public.business_path_stages add constraint business_path_stages_rank_id_fkey
  foreign key (rank_id) references public.ranks(id) on delete set null;

alter table public.rank_advancement_requests drop constraint rank_advancement_requests_from_rank_id_fkey;
alter table public.rank_advancement_requests add constraint rank_advancement_requests_from_rank_id_fkey
  foreign key (from_rank_id) references public.ranks(id) on delete set null;

alter table public.rank_advancement_requests drop constraint rank_advancement_requests_to_rank_id_fkey;
alter table public.rank_advancement_requests add constraint rank_advancement_requests_to_rank_id_fkey
  foreign key (to_rank_id) references public.ranks(id) on delete cascade;

alter table public.member_goals drop constraint member_goals_target_rank_id_fkey;
alter table public.member_goals add constraint member_goals_target_rank_id_fkey
  foreign key (target_rank_id) references public.ranks(id) on delete set null;
