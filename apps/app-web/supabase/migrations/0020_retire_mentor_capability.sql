-- Sponsor/network restructuring, part 3 of 3: retires the mentor RPC/RLS
-- surface. Deploy LAST, only after 0018+0019 and the frontend build that
-- stops calling list_inviters/get_my_mentor/assign_mentor/unassign_mentor
-- are confirmed live (migrations and the Netlify frontend deploy are not
-- atomic) — dropping these functions any earlier would break the old
-- frontend mid-rollout.
--
-- Why this can't simply be skipped/deferred: is_assigned_mentor_of() checks
-- only mentor_assignments.active, never profiles.role. By product decision
-- mentor_assignments rows are left active=true forever (kept as historical
-- data for manual admin review, not auto-migrated). Converting
-- role='mentor'->'member' (0018) without also removing every call site of
-- is_assigned_mentor_of() would leave ex-mentors with permanent, silent
-- read access to their former mentees' profiles, submissions, journey
-- state, private files, and (0017) chosen track specializations — this
-- migration is what actually closes that.

-- ---------- grading becomes admin-only ----------
create or replace function public.grade_assignment(p_submission_id uuid, p_decision text, p_grade int, p_feedback text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submission_uid uuid;
  v_assignment_id uuid;
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;
  if p_decision not in ('approved', 'needs_revision') then
    raise exception 'invalid decision: %', p_decision;
  end if;

  select uid, assignment_id into v_submission_uid, v_assignment_id
    from public.assignment_submissions where id = p_submission_id;
  if v_submission_uid is null then
    raise exception 'submission not found';
  end if;

  update public.assignment_submissions
    set status = p_decision, grade = p_grade, feedback = coalesce(p_feedback, ''), graded_by = auth.uid(), graded_at = now()
    where id = p_submission_id;

  insert into public.notifications (uid, type, title, body, link_to)
  values (
    v_submission_uid, 'assignment_graded',
    case when p_decision = 'approved' then 'Assignment approved' else 'Assignment needs revision' end,
    coalesce(nullif(p_feedback, ''), case when p_decision = 'approved' then 'Your assignment was approved.' else 'An admin left feedback for you.' end),
    '/assignments/' || v_assignment_id::text
  );

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'assignment_graded', 'assignment_submission', p_submission_id::text, jsonb_build_object('decision', p_decision));
end;
$$;

-- ---------- set_user_role: two roles only ----------
create or replace function public.set_user_role(target_uid uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;
  if new_role not in ('member', 'admin') then
    raise exception 'invalid role: %', new_role;
  end if;

  update public.profiles set role = new_role where id = target_uid;

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'role_changed', 'user', target_uid::text, jsonb_build_object('role', new_role));
end;
$$;

-- ---------- can_view_journey: drop the mentor clause ----------
create or replace function public.can_view_journey(p_uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select p_uid = auth.uid() or public.current_role() = 'admin';
$$;

-- ---------- RLS: drop is_assigned_mentor_of from every table policy that used it ----------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.current_role() = 'admin');

drop policy if exists quiz_attempts_select on public.quiz_attempts;
create policy quiz_attempts_select on public.quiz_attempts for select
  using (uid = auth.uid() or public.current_role() = 'admin');

drop policy if exists enrollments_select on public.enrollments;
create policy enrollments_select on public.enrollments for select
  using (uid = auth.uid() or public.current_role() = 'admin');

drop policy if exists lesson_progress_select on public.lesson_progress;
create policy lesson_progress_select on public.lesson_progress for select
  using (uid = auth.uid() or public.current_role() = 'admin');

drop policy if exists assignment_submissions_select on public.assignment_submissions;
create policy assignment_submissions_select on public.assignment_submissions for select
  using (uid = auth.uid() or public.current_role() = 'admin');

drop policy if exists task_completions_select on public.task_completions;
create policy task_completions_select on public.task_completions for select
  using (uid = auth.uid() or public.current_role() = 'admin');

drop policy if exists member_journey_select on public.member_journey;
create policy member_journey_select on public.member_journey for select
  using (uid = auth.uid() or public.current_role() = 'admin');

drop policy if exists member_track_specializations_select on public.member_track_specializations;
create policy member_track_specializations_select on public.member_track_specializations for select
  using (uid = auth.uid() or public.current_role() = 'admin');

-- ---------- storage RLS: same fix for the assignment-submissions bucket ----------
-- (0004_storage.sql — a Storage policy, not a table policy, easy to miss
-- when grepping only supabase/migrations/*.sql for table names.)
drop policy if exists assignment_submissions_read on storage.objects;
create policy assignment_submissions_read on storage.objects for select
  using (
    bucket_id = 'assignment-submissions' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.current_role() = 'admin'
    )
  );

-- ---------- retire dead mentor-only RPC surface ----------
-- mentor_assignments the TABLE and profiles.mentor_uid the COLUMN are left
-- untouched (historical data, per the confirmed product decision) — only
-- the write/read RPCs that assumed a live mentor role are dropped.
-- mentor_assignments_select's own RLS policy (0002) never used
-- is_assigned_mentor_of, so it needs no change and stays admin/self-only.
drop function if exists public.assign_mentor(uuid, uuid);
drop function if exists public.unassign_mentor(uuid, uuid);
drop function if exists public.is_assigned_mentor_of(uuid);
drop function if exists public.get_my_mentor();
drop function if exists public.list_inviters();

-- Column meant "requires a mentor's sign-off"; mentors no longer exist as a
-- reviewer concept (grading is admin-only, see grade_assignment above).
alter table public.tasks rename column requires_mentor_approval to requires_admin_approval;
