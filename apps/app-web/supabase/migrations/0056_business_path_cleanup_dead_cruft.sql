-- Business Path rebuild, part 7 of 7 (final): drop the cruft that was
-- already confirmed dead before this rebuild even started --
--   - `tasks`/`task_completions`/`task_dependencies`/`progress_weights` --
--     the original task-tracking system. The 0027-0030 content-model
--     cutover fully replaced it (content_assignments/content_items/
--     member_progress) and left these orphaned; a planned follow-up
--     (referenced in 0027/0029's own comments as "0031") was meant to drop
--     them but was never written. Nothing in the current schema queries
--     these tables or their 3 functions (is_task_done/task_unlocked/
--     complete_task) -- grepped to confirm.
--   - `compensation_ranks`/`member_rank_status` -- the real NeoLife
--     17-title ladder (0035), deliberately disconnected from the journey/
--     rank engine since the 2024 levels-and-ranks merge (0037) and never
--     reconnected. set_member_official_rank (0035) is the only function
--     that writes to it; confirmed still present (grepped for a drop
--     anywhere in this codebase's history -- there isn't one), so it's
--     dropped here too, per the plan's "confirm still exists" instruction.
--
-- public._journey_migration_map is dropped first, ahead of `tasks` -- it's
-- not in the plan's drop list (it predates this rebuild, created by 0029 as
-- one-time scaffolding for the 0027-0030 cutover's data migration, and was
-- meant to be temporary) but it holds a foreign key straight at tasks(id)
-- with no CASCADE, so `drop table tasks` would fail outright without
-- dropping this first. Confirmed via grep that nothing outside 0029 ever
-- reads it -- its one-time job finished the moment that migration ran.

-- ---------- dead functions ----------
drop function public.is_task_done(uuid, uuid);
drop function public.task_unlocked(uuid, uuid);
drop function public.complete_task(uuid);
drop function public.set_member_official_rank(uuid, uuid, text);

-- ---------- dead tables: original task-tracking system ----------
drop table public._journey_migration_map;
drop table public.task_completions;
drop table public.task_dependencies;
drop table public.tasks;
drop table public.progress_weights;

-- ---------- dead tables: disconnected NeoLife compensation-rank ladder ----------
drop table public.member_rank_status;
drop table public.compensation_ranks;
