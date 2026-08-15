-- Business Path rebuild, part 5 of 7: detach the individual-task feature
-- from the old Journey tables before anything old gets dropped. Landmine
-- #1 from the plan: content_assignments.stage_id/track_id currently CASCADE
-- to the old stages/tracks tables, and individual-task rows (scope=
-- 'individual') optionally carry a stage/track id too (UI grouping only).
-- Dropping old stages/tracks naively in 0055 would cascade-delete
-- individual task assignments -- exactly the feature that must survive this
-- rebuild untouched. These 4 steps, in this exact order, close that off.

-- 1. Delete every stage_track-scoped content_assignments row -- these are
--    the placements Business Path now owns via business_path_placements.
--    Cascades cleanly into their own content_assignment_dependencies/
--    member_progress/content_evidence_submissions rows for that content
--    only (individual rows' dependency/progress/evidence rows are
--    untouched, they don't reference these ids).
delete from public.content_assignments where scope = 'stage_track';

-- 2. Sever individual rows' stale pointers into tables about to disappear.
--    These were always UI-grouping-only for individual tasks, never load-
--    bearing, so clearing them is safe.
update public.content_assignments set stage_id = null, track_id = null, specialization_id = null where scope = 'individual';

-- 3. Repoint the FKs at the new business_path_* tables, and change
--    ON DELETE CASCADE -> ON DELETE SET NULL: deleting a Business Path
--    stage/track/specialization should never delete someone's individual
--    task, only clear its optional label. Safe to add now -- step 2 already
--    nulled out every remaining value, so there's nothing for the new
--    constraints to fail validation against. Names are the default ones
--    Postgres generated for these FKs in 0027 (none were explicitly named).
alter table public.content_assignments drop constraint content_assignments_stage_id_fkey;
alter table public.content_assignments add constraint content_assignments_stage_id_fkey
  foreign key (stage_id) references public.business_path_stages(id) on delete set null;

alter table public.content_assignments drop constraint content_assignments_track_id_fkey;
alter table public.content_assignments add constraint content_assignments_track_id_fkey
  foreign key (track_id) references public.business_path_tracks(id) on delete set null;

-- content_assignments_specialization_id_fkey originally had no explicit
-- ON DELETE action (plain NO ACTION/RESTRICT, unlike stage_id/track_id
-- which were already CASCADE) -- repointed the same way regardless, so an
-- admin can freely delete a Business Path specialization without it being
-- blocked by, or cascading into, an unrelated individual task that happens
-- to carry the same optional label.
alter table public.content_assignments drop constraint content_assignments_specialization_id_fkey;
alter table public.content_assignments add constraint content_assignments_specialization_id_fkey
  foreign key (specialization_id) references public.business_path_specializations(id) on delete set null;

-- 4. Tighten the scope check to 'individual' only -- closes off the exact
--    failure mode (a planned-but-never-executed cleanup, see 0027's own
--    deploy-order comment referencing a 0031 that was never written) this
--    whole rebuild is fixing: content_assignments can never again silently
--    accumulate stage_track rows. Only the column-level enum check is
--    tightened here; the table-level composite check (scope/assigned_to_uid/
--    stage_id/track_id shape) still holds as-is since its 'individual'
--    branch was never touched.
alter table public.content_assignments drop constraint content_assignments_scope_check;
alter table public.content_assignments add constraint content_assignments_scope_check
  check (scope in ('individual'));

-- ================= detach get_my_content_assignments' body too =================
-- Not one of the plan's 4 listed steps, but the same detachment concern
-- applied to a function body instead of a constraint: get_my_content_
-- assignments (0043's final body) still has a whole stage_track branch that
-- reads member_journey and calls is_specialization_unlocked. Left as-is, it
-- would keep "working" after step 1 above (that branch would just always
-- return zero extra rows, since no scope='stage_track' rows exist anymore)
-- right up until 0055 drops member_journey/track_specializations and
-- is_specialization_unlocked -- at which point this function would hard-
-- error on its very next call, including for its individual branch (Postgres
-- resolves every function reference in a query at parse time, so a missing
-- is_specialization_unlocked breaks the whole query, not just the branch
-- that would have called it). That would break TaskList.jsx's "My Tasks"
-- list for the individual-task feature -- the one thing this whole rebuild
-- promises to leave fully untouched. Simplifying now, once stage_track rows
-- are actually gone, avoids that landmine entirely instead of leaving it
-- for 0055 to defuse under time pressure.
create or replace function public.get_my_content_assignments(p_uid uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if p_uid <> auth.uid() and coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', ca.id,
      'title', coalesce(ci.title, c.title, a.title),
      'description', coalesce(ci.description, c.description, a.instructions, ''),
      'taskType', ca.task_type,
      'xpReward', ca.xp_reward,
      'isRequired', ca.is_required,
      'dueDate', ca.due_date,
      'scope', ca.scope,
      'contentType', ci.content_type,
      'requiresAdminApproval', ca.requires_admin_approval,
      'evidenceStatus', (
        select ces.status from public.content_evidence_submissions ces
        where ces.content_assignment_id = ca.id and ces.uid = p_uid
      ),
      'isDone', public.is_content_assignment_done(ca.id, p_uid)
    ) order by ca.due_date nulls last, ca.order_index)
    from public.content_assignments ca
    join public.content_items ci on ci.id = ca.content_item_id
    left join public.courses c on c.id = ci.course_id
    left join public.assignments a on a.id = ci.assignment_id
    where ca.scope = 'individual' and ca.assigned_to_uid = p_uid
  ), '[]'::jsonb);
end;
$$;
-- CREATE OR REPLACE preserves the existing grants from 0028 (same name,
-- same signature) -- no new revoke/grant statements needed.
