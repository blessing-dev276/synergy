-- Business Path v2, part 1 of 3: tear down the v1 rebuild (0050-0053's
-- schema/functions, 0052's daily-tasks rework). The user decided the whole
-- stage/track/rank-ladder/specialization/daily-tasks shape (a rename of the
-- old Journey system, not a real simplification) is wrong, and wants
-- something much simpler instead: admin-created arbitrary ranks, each with
-- whole Learning Hub paths attached (0059/0060). This file only tears down --
-- nothing here is replaced until 0059/0060.
--
-- 0054's individual-task detachment (content_assignments' scope-tightening
-- to 'individual' only, and its stage_id/track_id/specialization_id FKs
-- repointed at business_path_stages/business_path_tracks/business_path_
-- specializations with ON DELETE SET NULL) is explicitly NOT undone here --
-- that already correctly isolated the individual-task feature, and it must
-- keep working untouched through this migration set, same as it did through
-- the v1 rebuild itself. But those 3 FKs are a real landmine for THIS file:
-- content_assignments still references business_path_stages/business_path_
-- tracks/business_path_specializations, all three of which this file drops
-- below. Left alone, those DROP TABLEs would fail outright ("cannot drop
-- table because other objects depend on it"), even though the FKs are all
-- ON DELETE SET NULL, not CASCADE -- an FK's delete action only governs what
-- happens to ROWS on delete, it doesn't let the referenced TABLE itself be
-- dropped while the constraint still exists. So step 1 below severs those 3
-- FKs first, exactly the same move 0055 made for `tasks`' dangling FKs
-- before dropping stages/tracks/track_specializations (its step 4.5) --
-- same landmine, same fix, different table. The columns and their data are
-- left as-is (all NULL today per 0054's own migration, and per that file's
-- own comment these were "always UI-grouping-only for individual tasks,
-- never load-bearing") -- only the constraints are severed, so nothing about
-- the individual-task feature's behavior changes.
--
-- Order below: (1) sever every FK reaching into a table this file drops,
-- (2) drop every business_path_*/member_business_path_* function (0050's
-- trigger helper included -- it's not one of the plan's named RPCs, but
-- left alive it would become the exact class of dead cruft 0055/0056 was
-- written to clean up, referencing a table that no longer exists), (3) drop
-- the tables themselves, children before parents, (4) drop 0052's
-- daily-tasks rework (function then table) -- daily tasks has no
-- replacement this time, full removal.

-- ================= 1. sever FKs reaching into tables this file drops =================

-- learning_paths.specialization_id: its replacement (learning_paths.is_skill)
-- and the column's own drop both happen in 0059, not here -- this step only
-- clears the way for business_path_specializations (below) to be dropped.
alter table public.learning_paths drop constraint learning_paths_specialization_id_fkey;

-- member_goals.target_rank_id: column stays (still a meaningful "goal: reach
-- rank X" reference), just unpointed until 0060 re-adds its FK against the
-- new ranks(id).
alter table public.member_goals drop constraint member_goals_target_rank_id_fkey;

-- content_assignments' 3 FKs, repointed at business_path_* by 0054 -- see
-- this file's header for why these must be severed before step 3 below.
alter table public.content_assignments drop constraint content_assignments_stage_id_fkey;
alter table public.content_assignments drop constraint content_assignments_track_id_fkey;
alter table public.content_assignments drop constraint content_assignments_specialization_id_fkey;

-- ================= 2. drop business_path_*/member_business_path_* functions (0050-0051) =================

drop function public.get_business_path_overview(uuid);
drop function public.get_next_business_path_action(uuid);
drop function public.set_member_business_path_stage(uuid, uuid);
drop function public.set_my_business_path_specialization(uuid, uuid);
drop function public.admin_set_member_business_path_specialization(uuid, uuid, uuid);
drop function public.get_admin_business_path_overview();
drop function public.is_business_path_placement_done(uuid, uuid);
drop function public.business_path_placement_unlocked(uuid, uuid);
drop function public.complete_business_path_placement(uuid);
drop function public.submit_business_path_evidence(uuid, text, text[]);
drop function public.review_business_path_evidence(uuid, text, text);
drop function public.get_my_business_path_placements(uuid);
drop function public.can_view_business_path(uuid);
drop function public.compute_business_path_track_progress(uuid, uuid, uuid);
drop function public.compute_business_path_level_progress(uuid, uuid);
drop function public.is_business_path_specialization_unlocked(uuid, uuid);
-- 0050's trigger helper, not in the plan's named-RPC list but still a
-- business_path_* function that becomes dead cruft the moment its table
-- (business_path_placements, step 3) is dropped -- its own trigger goes with
-- the table automatically, but the function object itself doesn't.
drop function public.check_business_path_placement_specialization_track();

-- ================= 3. drop business_path_*/member_business_path_* tables (0050), children before parents =================

drop table public.business_path_evidence_submissions;
drop table public.member_business_path_progress;
drop table public.business_path_placement_dependencies;
drop table public.business_path_placements;
drop table public.member_business_path_stage;
drop table public.member_business_path_specializations;
drop table public.business_path_specializations;
drop table public.business_path_stage_tracks;
drop table public.business_path_stages;
drop table public.business_path_levels;
drop table public.business_path_tracks;

-- ================= 4. drop 0052's daily-tasks rework: full removal, no replacement =================

drop function public.get_or_generate_daily_tasks(uuid, date);
drop table public.daily_task_selections;
