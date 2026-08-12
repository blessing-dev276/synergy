-- Phase 1 schema for the Synergy member platform (app.synergyteamm.com).
-- See apps/app-web's plan doc for the full rationale; this file is tables +
-- indexes only, RLS/grants live in 0002, RPCs/triggers in 0003, storage in 0004.

create extension if not exists "pgcrypto";

-- ---------- profiles (1:1 with auth.users) ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text default '',
  email text default '',
  photo_url text default '',
  role text not null default 'member' check (role in ('member', 'mentor', 'admin')),
  status text not null default 'active',
  bio text default '',
  onboarding jsonb not null default '{"completed": false, "interests": [], "goals": []}'::jsonb,
  mentor_uid uuid references public.profiles(id),
  stats jsonb not null default '{"enrolledCount": 0, "completedLessonsCount": 0, "completedCoursesCount": 0}'::jsonb,
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);
create index profiles_role_idx on public.profiles (role);
create index profiles_mentor_uid_idx on public.profiles (mentor_uid);

-- ---------- learning content ----------
create table public.learning_paths (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text default '',
  order_index int not null default 0,
  published boolean not null default false,
  cover_image_url text default '',
  course_count int not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  path_id uuid not null references public.learning_paths(id) on delete cascade,
  title text not null,
  description text default '',
  order_index int not null default 0,
  published boolean not null default false,
  cover_image_url text default '',
  module_count int not null default 0,
  lesson_count int not null default 0,
  estimated_minutes int not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index courses_path_id_idx on public.courses (path_id, order_index);
create index courses_path_published_idx on public.courses (path_id, published, order_index);

create table public.modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null,
  order_index int not null default 0,
  published boolean not null default true,
  lesson_count int not null default 0
);
create index modules_course_id_idx on public.modules (course_id, order_index);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.modules(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null,
  order_index int not null default 0,
  content_type text not null default 'text' check (content_type in ('text', 'video', 'pdf', 'link')),
  content_body text default '',
  estimated_minutes int not null default 10,
  completion_rule text not null default 'manual' check (completion_rule in ('manual', 'quiz_pass')),
  published boolean not null default true
);
create index lessons_module_id_idx on public.lessons (module_id, order_index);
create index lessons_course_id_idx on public.lessons (course_id);

-- ---------- quizzes ----------
create table public.quizzes (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null unique references public.lessons(id) on delete cascade,
  title text not null,
  pass_score_percent int not null default 70,
  time_limit_minutes int,
  question_count int not null default 0
);

create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  prompt text not null,
  type text not null default 'multiple_choice',
  order_index int not null default 0
);
create index quiz_questions_quiz_id_idx on public.quiz_questions (quiz_id, order_index);

create table public.quiz_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  text text not null,
  is_correct boolean not null default false,
  order_index int not null default 0
);
create index quiz_options_question_id_idx on public.quiz_options (question_id, order_index);

create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  uid uuid not null references public.profiles(id) on delete cascade,
  answers jsonb not null default '[]'::jsonb,
  score int not null,
  passed boolean not null,
  attempt_number int not null default 1,
  submitted_at timestamptz not null default now()
);
create index quiz_attempts_quiz_uid_idx on public.quiz_attempts (quiz_id, uid);
create index quiz_attempts_uid_submitted_idx on public.quiz_attempts (uid, submitted_at desc);
create index quiz_attempts_uid_quiz_passed_idx on public.quiz_attempts (uid, quiz_id, passed);

-- ---------- progress / enrollment ----------
create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  path_id uuid references public.learning_paths(id),
  course_title text default '',
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  completed_lessons_count int not null default 0,
  total_lessons_count int not null default 0,
  progress_percent int not null default 0,
  last_accessed_lesson_id uuid,
  last_accessed_at timestamptz,
  enrolled_at timestamptz not null default now(),
  unique (uid, course_id)
);
create index enrollments_uid_last_accessed_idx on public.enrollments (uid, last_accessed_at desc);
create index enrollments_uid_status_idx on public.enrollments (uid, status);

create table public.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  module_id uuid not null references public.modules(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  path_id uuid references public.learning_paths(id),
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (uid, lesson_id)
);
create index lesson_progress_uid_course_idx on public.lesson_progress (uid, course_id);
create index lesson_progress_uid_course_status_idx on public.lesson_progress (uid, course_id, status);

-- ---------- assignments ----------
create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references public.courses(id) on delete cascade,
  title text not null,
  instructions text default '',
  due_date timestamptz,
  max_score int not null default 100,
  published boolean not null default false
);
create index assignments_course_published_idx on public.assignments (course_id, published);

create table public.assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  uid uuid not null references public.profiles(id) on delete cascade,
  course_id uuid references public.courses(id),
  text_response text default '',
  file_urls text[] not null default '{}',
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'needs_revision')),
  grade int,
  feedback text default '',
  graded_by uuid references public.profiles(id),
  graded_at timestamptz,
  submitted_at timestamptz not null default now(),
  unique (assignment_id, uid)
);
create index assignment_submissions_uid_status_idx on public.assignment_submissions (uid, status);
create index assignment_submissions_status_uid_idx on public.assignment_submissions (status, uid);

-- ---------- tasks ----------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text default '',
  scope text not null default 'individual' check (scope in ('global', 'course', 'individual')),
  course_id uuid references public.courses(id),
  assigned_to_uid uuid references public.profiles(id),
  priority text not null default 'medium',
  due_date timestamptz,
  created_by uuid references public.profiles(id)
);
create index tasks_assigned_due_idx on public.tasks (assigned_to_uid, due_date);

create table public.task_completions (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references public.profiles(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  completed boolean not null default false,
  completed_at timestamptz,
  unique (uid, task_id)
);
create index task_completions_uid_completed_idx on public.task_completions (uid, completed);

-- ---------- mentor assignment ----------
create table public.mentor_assignments (
  id uuid primary key default gen_random_uuid(),
  mentor_uid uuid not null references public.profiles(id) on delete cascade,
  member_uid uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id),
  active boolean not null default true,
  assigned_at timestamptz not null default now(),
  unique (mentor_uid, member_uid)
);
create index mentor_assignments_mentor_active_idx on public.mentor_assignments (mentor_uid, active);
create index mentor_assignments_member_active_idx on public.mentor_assignments (member_uid, active);

-- ---------- notifications / activity log ----------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text default '',
  link_to text default '',
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_uid_read_created_idx on public.notifications (uid, read, created_at desc);

create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_uid uuid references public.profiles(id),
  action text not null,
  target_type text default '',
  target_id text default '',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_log_created_idx on public.activity_log (created_at desc);
create index activity_log_actor_created_idx on public.activity_log (actor_uid, created_at desc);
