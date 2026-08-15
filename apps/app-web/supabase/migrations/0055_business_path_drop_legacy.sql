-- Business Path rebuild, part 6 of 7: retire the old Journey system.
-- Order within this file matters a lot -- it's the reverse of the call
-- graph, not just the plan's table-drop list:
--
--   1. Strip the dead check_member_milestones(...) call from
--      complete_content_assignment/review_content_evidence FIRST. These are
--      the two individual-task functions this whole rebuild promises to
--      leave otherwise untouched (landmine #2) -- if milestones-related
--      functions were dropped before this edit landed, both would start
--      throwing "function does not exist" on every single completion/review,
--      breaking the individual-task feature app-wide.
--   2. Only THEN drop check_member_milestones/award_milestone_manual/
--      request_stage_promotion/review_stage_promotion -- now nothing calls
--      them.
--   3. Only THEN drop get_journey_overview/get_next_best_action/
--      get_admin_progression_overview/set_member_stage/set_member_
--      specialization/admin_set_member_specialization -- these were left
--      alive through 0051-0054 (deliberately NOT dropped there, see 0051's
--      header) specifically so review_stage_promotion (step 2) and
--      get_my_content_assignments (already simplified in 0054) kept working
--      right up until this point.
--   4. Only THEN drop can_view_journey/compute_track_progress/
--      compute_rank_progress/is_specialization_unlocked -- check_member_
--      milestones (step 2) and the step-3 functions were their last
--      remaining callers.
--   4.5. Sever three FK constraints on the still-alive `tasks` table
--      (stage_id/track_id/specialization_id, 0008/0017) that point at
--      stages/tracks/track_specializations -- `tasks` itself isn't dropped
--      until 0056, so without this the table drops below would fail with
--      "cannot drop table because other objects depend on it".
--   5. Only THEN drop the old tables themselves, in the dependency order
--      the plan specifies (children before parents).
--
-- Every function below being dropped is a rename target from 0051 --
-- CREATE OR REPLACE never removes the old-named version, so without this
-- explicit cleanup these would become new dead cruft the moment their
-- tables disappear.

-- ================= 1. minimal edit: strip the dead milestone call =================
-- Nothing else about params/logic/grants changes -- these are byte-for-byte
-- 0033's bodies except for the removed `perform` line.

create or replace function public.complete_content_assignment(p_content_assignment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_content_type text;
  v_requires_approval boolean;
begin
  if not public.is_active() then
    raise exception 'your account is suspended and can''t complete tasks';
  end if;

  select ci.content_type, ca.requires_admin_approval into v_content_type, v_requires_approval
    from public.content_assignments ca
    join public.content_items ci on ci.id = ca.content_item_id
    where ca.id = p_content_assignment_id;

  if v_content_type is null then
    raise exception 'content assignment not found';
  end if;
  if v_content_type <> 'bare' then
    raise exception 'this task completes automatically once its linked training/assignment is done';
  end if;
  if coalesce(v_requires_approval, false) then
    raise exception 'this task needs submitted evidence -- use submit_content_evidence instead';
  end if;

  if not public.content_assignment_unlocked(p_content_assignment_id, auth.uid()) then
    raise exception 'complete the prerequisite tasks first';
  end if;

  insert into public.member_progress (uid, content_assignment_id, completed_at)
  values (auth.uid(), p_content_assignment_id, now())
  on conflict (uid, content_assignment_id) do nothing;

  insert into public.activity_log (actor_uid, action, target_type, target_id)
  values (auth.uid(), 'content_assignment_completed', 'content_assignment', p_content_assignment_id::text);
end;
$$;
-- CREATE OR REPLACE preserves the existing grants from 0028/0033 -- no new
-- revoke/grant statements needed.

create or replace function public.review_content_evidence(p_submission_id uuid, p_decision text, p_feedback text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_content_assignment_id uuid;
  v_status text;
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;
  if p_decision not in ('approved', 'needs_revision') then
    raise exception 'invalid decision: %', p_decision;
  end if;

  select uid, content_assignment_id, status into v_uid, v_content_assignment_id, v_status
    from public.content_evidence_submissions where id = p_submission_id;
  if v_uid is null then
    raise exception 'submission not found';
  end if;
  if v_status <> 'submitted' then
    raise exception 'this submission has already been reviewed';
  end if;

  update public.content_evidence_submissions
    set status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(), feedback = coalesce(p_feedback, '')
    where id = p_submission_id;

  if p_decision = 'approved' then
    -- the same member_progress row complete_content_assignment would have
    -- written -- is_content_assignment_done()'s 'bare' branch already reads
    -- this table, so no other function needs to know evidence review exists.
    insert into public.member_progress (uid, content_assignment_id, completed_at)
    values (v_uid, v_content_assignment_id, now())
    on conflict (uid, content_assignment_id) do nothing;
  end if;

  insert into public.notifications (uid, type, title, body, link_to)
  values (
    v_uid, 'content_evidence_reviewed',
    case when p_decision = 'approved' then 'Evidence approved' else 'Needs another look' end,
    coalesce(nullif(p_feedback, ''), case when p_decision = 'approved' then 'Your submission was approved.' else 'An admin asked for a revision.' end),
    '/tasks'
  );

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'content_evidence_reviewed', 'content_evidence_submission', p_submission_id::text, jsonb_build_object('decision', p_decision));
end;
$$;
-- CREATE OR REPLACE preserves the existing grants from 0033 -- no new
-- revoke/grant statements needed.

-- ================= 2. drop milestones/promotion functions =================
drop function public.request_stage_promotion();
drop function public.review_stage_promotion(uuid, text, text);
drop function public.check_member_milestones(uuid);
drop function public.award_milestone_manual(uuid, uuid, text);

-- ================= 3. drop renamed top-level RPCs (old names) =================
drop function public.get_journey_overview(uuid);
drop function public.get_next_best_action(uuid);
drop function public.get_admin_progression_overview();
drop function public.set_member_stage(uuid, uuid);
drop function public.set_member_specialization(uuid, uuid);
drop function public.admin_set_member_specialization(uuid, uuid, uuid);

-- ================= 4. drop the now-unreferenced shared helpers (old names) =================
drop function public.can_view_journey(uuid);
drop function public.compute_track_progress(uuid, uuid, uuid);
drop function public.compute_rank_progress(uuid, uuid);
drop function public.is_specialization_unlocked(uuid, uuid);

-- ================= 4.5. sever `tasks`' dangling FKs into the tables below =================
-- `tasks` itself is confirmed-dead cruft (0031 never ran, see 0056's header)
-- and isn't dropped until 0056, one migration after this one -- but three of
-- its columns (stage_id/track_id, 0008; specialization_id, 0017) still carry
-- live foreign keys into stages/tracks/track_specializations. Without
-- dropping these constraints first, "drop table stages/tracks/
-- track_specializations" below would fail outright ("cannot drop table
-- because other objects depend on it"), since `tasks` still exists and
-- still references them. Only the constraints are dropped here -- `tasks`
-- and its data are untouched until 0056 drops the table outright, so this
-- doesn't jump ahead of that migration's own job.
alter table public.tasks drop constraint tasks_stage_id_fkey;
alter table public.tasks drop constraint tasks_track_id_fkey;
alter table public.tasks drop constraint tasks_specialization_id_fkey;

-- ================= 5. drop old tables, children before parents =================
drop table public.stage_promotion_requests;
drop table public.progression_rules;
drop table public.member_milestones;
drop table public.milestones;
drop table public.member_track_specializations;
drop table public.track_specializations;
drop table public.stage_tracks;
drop table public.member_journey;
drop table public.stages;
drop table public.tracks;
drop table public.ranks;
