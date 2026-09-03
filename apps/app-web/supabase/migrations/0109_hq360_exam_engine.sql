-- ================= HQ360 restructure: shared infra — exam/CBT engine (§4.2) =================
-- Schema only in this pass: Skill Development class items (§7) need `exams`
-- to exist as an FK target (thin-pointer "test"/"quiz" items) before the
-- Skill Development editor itself is built. The exam MANAGER (question
-- authoring) and public take-link flow are deferred to the Skill
-- Development / exam-manager frontend phase -- no write RPCs here yet, so
-- there is deliberately no way to create an exam through the app until
-- then. Read access is scoped narrowly (published only, or your own
-- attempts) since there's no manager UI yet to justify wider access.

create table public.exams (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id),
  title text not null,
  description text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  public_link_enabled boolean not null default false,
  public_token uuid not null default gen_random_uuid(),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (public_token)
);
create index exams_org_status_idx on public.exams (org_id, status);

alter table public.exams enable row level security;
grant select on public.exams to authenticated;
create policy exams_select on public.exams for select
  using (status = 'published' or public.current_role() in ('admin', 'mentor'));

create table public.exam_settings (
  exam_id uuid primary key references public.exams(id) on delete cascade,
  num_questions int not null default 10 check (num_questions > 0),
  time_limit_minutes int not null default 30 check (time_limit_minutes > 0),
  pass_mark_percent int not null default 70 check (pass_mark_percent between 0 and 100),
  max_attempts int check (max_attempts is null or max_attempts > 0),
  shuffle_questions boolean not null default true,
  shuffle_options boolean not null default true
);

alter table public.exam_settings enable row level security;
grant select on public.exam_settings to authenticated;
create policy exam_settings_select on public.exam_settings for select
  using (exists (select 1 from public.exams e where e.id = exam_id and (e.status = 'published' or public.current_role() in ('admin', 'mentor'))));

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id),
  exam_id uuid not null references public.exams(id) on delete cascade,
  type text not null check (type in ('single_choice', 'multi_select', 'true_false')),
  prompt text not null,
  points numeric(6, 2) not null default 1,
  order_index int not null default 0,
  created_at timestamptz not null default now()
);
create index questions_exam_idx on public.questions (exam_id, order_index);

alter table public.questions enable row level security;
grant select on public.questions to authenticated;
create policy questions_select on public.questions for select
  using (exists (select 1 from public.exams e where e.id = exam_id and (e.status = 'published' or public.current_role() in ('admin', 'mentor'))));

create table public.question_options (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id),
  question_id uuid not null references public.questions(id) on delete cascade,
  label text not null,
  is_correct boolean not null default false,
  order_index int not null default 0
);
create index question_options_question_idx on public.question_options (question_id, order_index);

alter table public.question_options enable row level security;
grant select on public.question_options to authenticated;
create policy question_options_select on public.question_options for select
  using (exists (
    select 1 from public.questions q join public.exams e on e.id = q.exam_id
    where q.id = question_id and (e.status = 'published' or public.current_role() in ('admin', 'mentor'))
  ));

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id),
  exam_id uuid not null references public.exams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  attempt_number int not null default 1,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted', 'expired')),
  score_percent numeric(5, 2),
  passed boolean,
  time_spent_seconds int,
  unique (exam_id, user_id, attempt_number)
);
create index attempts_exam_user_idx on public.attempts (exam_id, user_id);

alter table public.attempts enable row level security;
grant select on public.attempts to authenticated;
create policy attempts_select on public.attempts for select
  using (user_id = auth.uid() or public.current_role() in ('admin', 'mentor'));

create table public.attempt_answers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  selected_option_ids uuid[] not null default '{}',
  is_correct boolean,
  created_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

alter table public.attempt_answers enable row level security;
grant select on public.attempt_answers to authenticated;
create policy attempt_answers_select on public.attempt_answers for select
  using (exists (
    select 1 from public.attempts a where a.id = attempt_id
      and (a.user_id = auth.uid() or public.current_role() in ('admin', 'mentor'))
  ));

-- "Pass = attempts.status='submitted' AND passed=true" -- helper for
-- downstream derived-completion checks (class items, task steps) so that
-- rule lives in one place instead of being copy-pasted into every RPC that
-- needs to know if a member passed a given exam.
create or replace function public.has_passed_exam(p_exam_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.attempts
    where exam_id = p_exam_id and user_id = p_user_id and status = 'submitted' and passed = true
  );
$$;

grant execute on function public.has_passed_exam(uuid, uuid) to authenticated;
