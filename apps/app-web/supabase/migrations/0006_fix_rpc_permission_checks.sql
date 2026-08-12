-- Fix two issues found by directly testing the deployed database:
--
-- 1. `revoke execute ... from public` does not remove `anon`'s EXECUTE
--    privilege — Supabase grants EXECUTE directly to `anon`/`authenticated`
--    by default on new functions (not via the PUBLIC pseudo-role), so an
--    explicit `from public, anon` is required.
-- 2. `current_role() <> 'admin'` (and `not in (...)`) is NULL-unsafe: for
--    an unauthenticated/roleless caller, current_role() is NULL, and
--    `NULL <> 'admin'` is NULL, which PL/pgSQL's IF treats as false —
--    silently skipping the permission-denied branch. Combined with (1),
--    this meant an anonymous caller could reach set_user_role/
--    assign_mentor/unassign_mentor/grade_assignment without ever failing
--    the admin/mentor check. Fixed with coalesce(...) to force a
--    non-null, correctly-failing comparison.
--
-- CREATE OR REPLACE FUNCTION and revoke/grant are both safe to rerun.

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
  if new_role not in ('member', 'mentor', 'admin') then
    raise exception 'invalid role: %', new_role;
  end if;

  update public.profiles set role = new_role where id = target_uid;

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'role_changed', 'user', target_uid::text, jsonb_build_object('role', new_role));
end;
$$;

create or replace function public.assign_mentor(p_mentor_uid uuid, p_member_uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mentor_role text;
  v_member_role text;
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;

  select role into v_mentor_role from public.profiles where id = p_mentor_uid;
  select role into v_member_role from public.profiles where id = p_member_uid;

  if v_mentor_role is distinct from 'mentor' then
    raise exception 'target % is not a mentor', p_mentor_uid;
  end if;
  if v_member_role is distinct from 'member' then
    raise exception 'target % is not a member', p_member_uid;
  end if;

  insert into public.mentor_assignments (mentor_uid, member_uid, assigned_by, active, assigned_at)
  values (p_mentor_uid, p_member_uid, auth.uid(), true, now())
  on conflict (mentor_uid, member_uid) do update
    set active = true, assigned_by = excluded.assigned_by, assigned_at = now();

  update public.profiles set mentor_uid = p_mentor_uid where id = p_member_uid;

  insert into public.activity_log (actor_uid, action, target_type, target_id)
  values (auth.uid(), 'mentor_assigned', 'mentor_assignment', p_mentor_uid::text || '_' || p_member_uid::text);
end;
$$;

create or replace function public.unassign_mentor(p_mentor_uid uuid, p_member_uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;

  update public.mentor_assignments set active = false
    where mentor_uid = p_mentor_uid and member_uid = p_member_uid;

  update public.profiles set mentor_uid = null where id = p_member_uid and mentor_uid = p_mentor_uid;

  insert into public.activity_log (actor_uid, action, target_type, target_id)
  values (auth.uid(), 'mentor_unassigned', 'mentor_assignment', p_mentor_uid::text || '_' || p_member_uid::text);
end;
$$;

create or replace function public.grade_assignment(p_submission_id uuid, p_decision text, p_grade int, p_feedback text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_submission_uid uuid;
  v_assignment_id uuid;
begin
  v_role := coalesce(public.current_role(), '');
  if v_role not in ('mentor', 'admin') then
    raise exception 'permission denied: mentor or admin role required';
  end if;
  if p_decision not in ('approved', 'needs_revision') then
    raise exception 'invalid decision: %', p_decision;
  end if;

  select uid, assignment_id into v_submission_uid, v_assignment_id
    from public.assignment_submissions where id = p_submission_id;
  if v_submission_uid is null then
    raise exception 'submission not found';
  end if;

  if v_role = 'mentor' and not public.is_assigned_mentor_of(v_submission_uid) then
    raise exception 'you can only grade your assigned members'' work';
  end if;

  update public.assignment_submissions
    set status = p_decision, grade = p_grade, feedback = coalesce(p_feedback, ''), graded_by = auth.uid(), graded_at = now()
    where id = p_submission_id;

  insert into public.notifications (uid, type, title, body, link_to)
  values (
    v_submission_uid,
    'assignment_graded',
    case when p_decision = 'approved' then 'Assignment approved' else 'Assignment needs revision' end,
    coalesce(nullif(p_feedback, ''), case when p_decision = 'approved' then 'Your assignment was approved.' else 'Your mentor left feedback for you.' end),
    '/assignments/' || v_assignment_id::text
  );

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'assignment_graded', 'assignment_submission', p_submission_id::text, jsonb_build_object('decision', p_decision));
end;
$$;

revoke execute on function public.set_user_role(uuid, text) from public, anon;
grant execute on function public.set_user_role(uuid, text) to authenticated;
revoke execute on function public.assign_mentor(uuid, uuid) from public, anon;
grant execute on function public.assign_mentor(uuid, uuid) to authenticated;
revoke execute on function public.unassign_mentor(uuid, uuid) from public, anon;
grant execute on function public.unassign_mentor(uuid, uuid) to authenticated;
revoke execute on function public.mark_lesson_complete(uuid, uuid, uuid) from public, anon;
grant execute on function public.mark_lesson_complete(uuid, uuid, uuid) to authenticated;
revoke execute on function public.get_quiz_for_attempt(uuid) from public, anon;
grant execute on function public.get_quiz_for_attempt(uuid) to authenticated;
revoke execute on function public.submit_quiz_attempt(uuid, jsonb) from public, anon;
grant execute on function public.submit_quiz_attempt(uuid, jsonb) to authenticated;
revoke execute on function public.grade_assignment(uuid, text, int, text) from public, anon;
grant execute on function public.grade_assignment(uuid, text, int, text) to authenticated;
