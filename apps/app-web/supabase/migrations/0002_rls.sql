-- RBAC/RLS model. Every table below defaults to fully locked (RLS enabled,
-- no grant to `authenticated` for a given operation unless listed here) —
-- nothing is reachable unless explicitly opened up.
--
-- Note: Supabase has no separate Postgres role per app-role (member/mentor/
-- admin) — every logged-in user is the `authenticated` role. Table GRANTs
-- are the coarse gate ("can this operation ever run"), RLS policies (via
-- current_role()/is_assigned_mentor_of() below) are the fine-grained,
-- per-row gate that actually distinguishes member/mentor/admin.

-- ---------- helpers (SECURITY DEFINER so they can read profiles/
-- mentor_assignments without recursing into these same tables' RLS) ----------
create or replace function public.current_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_assigned_mentor_of(p_member_uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.mentor_assignments
    where mentor_uid = auth.uid() and member_uid = p_member_uid and active = true
  );
$$;

-- ---------- profiles ----------
alter table public.profiles enable row level security;
grant select on public.profiles to authenticated;
grant update (display_name, photo_url, bio, onboarding, last_active_at) on public.profiles to authenticated;

create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.current_role() = 'admin' or public.is_assigned_mentor_of(id));

create policy profiles_update_self on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());
-- no insert policy/grant: rows are created only by the handle_new_user
-- trigger (0003), which runs with elevated privileges and bypasses RLS.
-- role/mentor_uid are never in the update grant above, so they are
-- structurally unwritable by the client regardless of payload.

-- ---------- admin-authored, member-readable content ----------
do $$
declare
  t text;
begin
  foreach t in array array['learning_paths', 'courses', 'modules', 'lessons', 'assignments', 'tasks', 'quizzes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create policy %I_select on public.%I for select using (auth.uid() is not null)', t, t);
    execute format('create policy %I_admin_insert on public.%I for insert with check (public.current_role() = ''admin'')', t, t);
    execute format('create policy %I_admin_update on public.%I for update using (public.current_role() = ''admin'') with check (public.current_role() = ''admin'')', t, t);
    execute format('create policy %I_admin_delete on public.%I for delete using (public.current_role() = ''admin'')', t, t);
  end loop;
end $$;

-- quiz_questions/quiz_options: admin-only in both directions — members only
-- ever see sanitized questions via the get_quiz_for_attempt RPC (0003).
alter table public.quiz_questions enable row level security;
grant select, insert, update, delete on public.quiz_questions to authenticated;
create policy quiz_questions_admin_all on public.quiz_questions for all
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

alter table public.quiz_options enable row level security;
grant select, insert, update, delete on public.quiz_options to authenticated;
create policy quiz_options_admin_all on public.quiz_options for all
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

-- ---------- quiz_attempts: insert-only via submit_quiz_attempt RPC ----------
alter table public.quiz_attempts enable row level security;
grant select on public.quiz_attempts to authenticated;
create policy quiz_attempts_select on public.quiz_attempts for select
  using (uid = auth.uid() or public.current_role() = 'admin' or public.is_assigned_mentor_of(uid));
-- no insert/update/delete grant: rows are written only by the
-- submit_quiz_attempt RPC (SECURITY DEFINER, bypasses grants).

-- ---------- enrollments ----------
alter table public.enrollments enable row level security;
grant select, insert, update on public.enrollments to authenticated;
create policy enrollments_select on public.enrollments for select
  using (uid = auth.uid() or public.current_role() = 'admin' or public.is_assigned_mentor_of(uid));
create policy enrollments_insert on public.enrollments for insert
  with check (uid = auth.uid());
create policy enrollments_update on public.enrollments for update
  using (uid = auth.uid())
  with check (uid = auth.uid());

-- ---------- lesson_progress: completion only via mark_lesson_complete RPC ----------
alter table public.lesson_progress enable row level security;
grant select, insert, update on public.lesson_progress to authenticated;
create policy lesson_progress_select on public.lesson_progress for select
  using (uid = auth.uid() or public.current_role() = 'admin' or public.is_assigned_mentor_of(uid));
create policy lesson_progress_insert on public.lesson_progress for insert
  with check (uid = auth.uid() and status <> 'completed');
create policy lesson_progress_update on public.lesson_progress for update
  using (uid = auth.uid())
  with check (uid = auth.uid() and status <> 'completed');

-- ---------- assignment_submissions: grading only via grade_assignment RPC ----------
alter table public.assignment_submissions enable row level security;
grant select on public.assignment_submissions to authenticated;
grant insert (assignment_id, uid, course_id, text_response, file_urls, status, submitted_at) on public.assignment_submissions to authenticated;
grant update (text_response, file_urls, status, submitted_at) on public.assignment_submissions to authenticated;
create policy assignment_submissions_select on public.assignment_submissions for select
  using (uid = auth.uid() or public.current_role() = 'admin' or public.is_assigned_mentor_of(uid));
create policy assignment_submissions_insert on public.assignment_submissions for insert
  with check (uid = auth.uid() and status = 'submitted');
create policy assignment_submissions_update on public.assignment_submissions for update
  using (uid = auth.uid())
  with check (uid = auth.uid() and status = 'submitted');

-- ---------- task_completions ----------
alter table public.task_completions enable row level security;
grant select, insert, update on public.task_completions to authenticated;
create policy task_completions_select on public.task_completions for select
  using (uid = auth.uid() or public.current_role() = 'admin' or public.is_assigned_mentor_of(uid));
create policy task_completions_insert on public.task_completions for insert
  with check (uid = auth.uid());
create policy task_completions_update on public.task_completions for update
  using (uid = auth.uid())
  with check (uid = auth.uid());

-- ---------- mentor_assignments: RPC-only writes (assign_mentor/unassign_mentor) ----------
alter table public.mentor_assignments enable row level security;
grant select on public.mentor_assignments to authenticated;
create policy mentor_assignments_select on public.mentor_assignments for select
  using (public.current_role() = 'admin' or mentor_uid = auth.uid() or member_uid = auth.uid());

-- ---------- notifications: server-written, client may only flip `read` ----------
alter table public.notifications enable row level security;
grant select on public.notifications to authenticated;
grant update (read) on public.notifications to authenticated;
create policy notifications_select on public.notifications for select
  using (uid = auth.uid());
create policy notifications_update on public.notifications for update
  using (uid = auth.uid())
  with check (uid = auth.uid());

-- ---------- activity_log: admin-read-only, server-written ----------
alter table public.activity_log enable row level security;
grant select on public.activity_log to authenticated;
create policy activity_log_select on public.activity_log for select
  using (public.current_role() = 'admin');
