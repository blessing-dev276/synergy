-- Fixes stage deletion so it actually does what StageBuilder's confirm
-- dialog already claims ("This also removes its tasks and any members'
-- progress tied to it."). Previously tasks.stage_id and
-- member_journey.current_stage_id had plain (non-cascading) FKs to
-- stages, so deleting a stage left orphaned references instead of
-- cleaning them up — stage_tracks was the only child that actually
-- cascaded (0008).
--
-- tasks.stage_id -> on delete cascade: deleting a stage deletes its tasks,
-- which in turn cascades to task_completions and task_dependencies (both
-- already on delete cascade from tasks per 0001/0008) — so members' per-task
-- progress for that stage goes with it, matching the confirm text.
--
-- member_journey.current_stage_id -> on delete set null: a member's journey
-- row (their started_at, overall record) is not deleted, just unpointed
-- from the now-gone stage, so they aren't left referencing a stage that no
-- longer exists.

alter table public.tasks drop constraint tasks_stage_id_fkey;
alter table public.tasks add constraint tasks_stage_id_fkey
  foreign key (stage_id) references public.stages(id) on delete cascade;

alter table public.member_journey drop constraint member_journey_current_stage_id_fkey;
alter table public.member_journey add constraint member_journey_current_stage_id_fkey
  foreign key (current_stage_id) references public.stages(id) on delete set null;
