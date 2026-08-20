-- Mind Training restructure, part 1 of 4: schema. Deliberately NOT built on
-- courses/modules/lessons -- those feed section-agnostic triggers
-- (maintain_course_counts, the auto-content_items wrap on every course
-- insert, evaluate_rank_task_proxies) that skill_set and nm_business rows
-- also depend on, and reusing them here would mean any Mind-Training-shape
-- change risks a behavior change for the other two sections too. Instead:
-- learning_paths (section='mind_training') stays the top tier exactly as
-- today (same publish/order/rank-gating), and everything below it is a
-- brand-new, fully independent tree -- Level -> Module -> (Lesson |
-- Activity | Assessment). Zero columns/triggers/RLS on any existing table
-- change in this migration or the three that follow it.

-- ---------- mind_training_levels ----------
create table public.mind_training_levels (
  id uuid primary key default gen_random_uuid(),
  path_id uuid not null references public.learning_paths(id) on delete cascade,
  title text not null,
  description text default '',
  order_index int not null default 0,
  published boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index mind_training_levels_path_idx on public.mind_training_levels (path_id, order_index);

-- Fences this whole tree off from skill_set/nm_business by construction,
-- not just convention -- a level (and therefore everything under it) can
-- only ever hang off a learning_paths row whose section is 'mind_training'.
create or replace function public.check_mind_training_level_path()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (select 1 from public.learning_paths where id = new.path_id and section = 'mind_training') then
    raise exception 'mind_training_levels.path_id must reference a learning_paths row with section = ''mind_training''';
  end if;
  return new;
end;
$$;
create trigger check_mind_training_level_path_trg
  before insert or update of path_id on public.mind_training_levels
  for each row execute function public.check_mind_training_level_path();

-- ---------- mind_training_modules ----------
create table public.mind_training_modules (
  id uuid primary key default gen_random_uuid(),
  level_id uuid not null references public.mind_training_levels(id) on delete cascade,
  title text not null,
  description text default '',
  order_index int not null default 0,
  published boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index mind_training_modules_level_idx on public.mind_training_modules (level_id, order_index);

-- ---------- mind_training_lessons ----------
-- Denormalized level_id/path_id alongside module_id, same convention the
-- existing lessons table already uses (module_id + course_id both stored
-- directly) -- keeps progress-listing queries a single-table filter.
-- Rich content is an ordered array of typed blocks (content_blocks), not one
-- text field -- that's what lets the admin editor treat headings/
-- paragraphs/lists/quotes/images/examples as individually editable pieces.
-- Block shape (enforced client-side, not by a DB check -- keeps room to add
-- block types later without a migration): {type, text?, items?, style?,
-- url?, caption?, attribution?}, type in
-- ('heading','paragraph','list','quote','image','example').
create table public.mind_training_lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.mind_training_modules(id) on delete cascade,
  level_id uuid not null references public.mind_training_levels(id) on delete cascade,
  path_id uuid not null references public.learning_paths(id) on delete cascade,
  title text not null,
  order_index int not null default 0,
  published boolean not null default true,

  intro text default '',
  content_blocks jsonb not null default '[]'::jsonb,
  practical_exercise text default '',
  reflection_questions jsonb not null default '[]'::jsonb,
  action_task text default '',
  key_takeaways jsonb not null default '[]'::jsonb,

  estimated_minutes int not null default 5,
  -- Optional attached PDF -- a path in the mind-training-library bucket
  -- (below). Never required to create a lesson (nullable, no check).
  pdf_path text,

  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index mind_training_lessons_module_idx on public.mind_training_lessons (module_id, order_index);

-- ---------- mind_training_activities ----------
-- A standalone, bigger exercise than a lesson's inline practical_exercise --
-- title + instructions (same content_blocks shape as a lesson), self-
-- attested complete (no evidence/review step, unlike rank_tasks -- product
-- decision: Mind Training activities are reflective/practice work, not
-- something an admin needs to verify happened).
create table public.mind_training_activities (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.mind_training_modules(id) on delete cascade,
  title text not null,
  instructions jsonb not null default '[]'::jsonb,
  order_index int not null default 0,
  published boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index mind_training_activities_module_idx on public.mind_training_activities (module_id, order_index);

-- ---------- mind_training_assessments (+ questions/options/attempts) ----------
-- One per module (unique module_id) -- mirrors quizzes' one-per-lesson
-- shape/semantics closely (it's a proven pattern in this codebase), just as
-- new, independent tables rather than reusing quizzes/quiz_questions/
-- quiz_options/quiz_attempts.
create table public.mind_training_assessments (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null unique references public.mind_training_modules(id) on delete cascade,
  title text not null default 'Module Assessment',
  pass_score_percent int not null default 70,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.mind_training_assessment_questions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.mind_training_assessments(id) on delete cascade,
  prompt text not null,
  order_index int not null default 0
);
create index mind_training_assessment_questions_idx on public.mind_training_assessment_questions (assessment_id, order_index);

create table public.mind_training_assessment_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.mind_training_assessment_questions(id) on delete cascade,
  text text not null,
  is_correct boolean not null default false,
  order_index int not null default 0
);
create index mind_training_assessment_options_idx on public.mind_training_assessment_options (question_id, order_index);

create table public.mind_training_assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.mind_training_assessments(id) on delete cascade,
  uid uuid not null references public.profiles(id) on delete cascade,
  answers jsonb not null default '[]'::jsonb,
  score int not null,
  passed boolean not null,
  attempt_number int not null default 1,
  submitted_at timestamptz not null default now()
);
create index mind_training_assessment_attempts_idx on public.mind_training_assessment_attempts (assessment_id, uid);

-- ---------- progress: lesson_progress/activity_progress ----------
-- Same shape/semantics as the existing lesson_progress table -- RPC-write
-- only (RLS below blocks a member from inserting/updating their own row
-- directly), fully independent of it so Mind Training progress never
-- shares a table with skill_set/nm_business progress (Part 5's explicit
-- requirement). Assessment "complete" needs no separate progress table --
-- same as the existing quiz system, it's just "does a passed attempt row
-- exist", checked live.
create table public.mind_training_lesson_progress (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.mind_training_lessons(id) on delete cascade,
  module_id uuid not null references public.mind_training_modules(id) on delete cascade,
  level_id uuid not null references public.mind_training_levels(id) on delete cascade,
  path_id uuid not null references public.learning_paths(id) on delete cascade,
  completed_at timestamptz not null default now(),
  unique (uid, lesson_id)
);
create index mind_training_lesson_progress_uid_idx on public.mind_training_lesson_progress (uid, path_id);

create table public.mind_training_activity_progress (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references public.profiles(id) on delete cascade,
  activity_id uuid not null references public.mind_training_activities(id) on delete cascade,
  module_id uuid not null references public.mind_training_modules(id) on delete cascade,
  completed_at timestamptz not null default now(),
  unique (uid, activity_id)
);
create index mind_training_activity_progress_uid_idx on public.mind_training_activity_progress (uid, module_id);

-- ================= RLS =================
-- Deliberately tighter than the existing content tables (learning_paths/
-- courses/modules/lessons' _select policy is just "auth.uid() is not
-- null" -- any signed-in member can read every row regardless of
-- published/rank, enforced only client-side today). Not touching that
-- existing gap here (out of scope, risky to touch shared policy code for
-- skill_set/nm_business) -- but every new table below gets a real
-- published + rank-membership condition baked into SELECT from the start.

-- A member can read a mind_training_* row iff its path is published and
-- explicitly attached to their rank via rank_learning_paths -- the exact
-- same gate get_learning_paths() applies for the top tier, reused here so
-- there's one consistent definition of "can this member see Mind Training
-- path X" rather than two that could drift apart.
create or replace function public.can_view_mind_training_path(p_path_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.current_role() = 'admin' or exists (
    select 1
    from public.learning_paths lp
    join public.profiles p on p.id = auth.uid()
    join public.rank_learning_paths rlp on rlp.learning_path_id = lp.id and rlp.rank_id = p.rank_id
    where lp.id = p_path_id and lp.published = true
  );
$$;
revoke execute on function public.can_view_mind_training_path(uuid) from public, anon;
grant execute on function public.can_view_mind_training_path(uuid) to authenticated;

alter table public.mind_training_levels enable row level security;
grant select, insert, update, delete on public.mind_training_levels to authenticated;
create policy mind_training_levels_select on public.mind_training_levels for select
  using (published = true and public.can_view_mind_training_path(path_id));
create policy mind_training_levels_admin_insert on public.mind_training_levels for insert with check (public.current_role() = 'admin');
create policy mind_training_levels_admin_update on public.mind_training_levels for update using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
create policy mind_training_levels_admin_delete on public.mind_training_levels for delete using (public.current_role() = 'admin');

alter table public.mind_training_modules enable row level security;
grant select, insert, update, delete on public.mind_training_modules to authenticated;
create policy mind_training_modules_select on public.mind_training_modules for select
  using (
    published = true
    and exists (select 1 from public.mind_training_levels lv where lv.id = level_id and lv.published = true and public.can_view_mind_training_path(lv.path_id))
  );
create policy mind_training_modules_admin_insert on public.mind_training_modules for insert with check (public.current_role() = 'admin');
create policy mind_training_modules_admin_update on public.mind_training_modules for update using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
create policy mind_training_modules_admin_delete on public.mind_training_modules for delete using (public.current_role() = 'admin');

alter table public.mind_training_lessons enable row level security;
grant select, insert, update, delete on public.mind_training_lessons to authenticated;
create policy mind_training_lessons_select on public.mind_training_lessons for select
  using (published = true and public.can_view_mind_training_path(path_id));
create policy mind_training_lessons_admin_insert on public.mind_training_lessons for insert with check (public.current_role() = 'admin');
create policy mind_training_lessons_admin_update on public.mind_training_lessons for update using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
create policy mind_training_lessons_admin_delete on public.mind_training_lessons for delete using (public.current_role() = 'admin');

alter table public.mind_training_activities enable row level security;
grant select, insert, update, delete on public.mind_training_activities to authenticated;
create policy mind_training_activities_select on public.mind_training_activities for select
  using (
    published = true
    and exists (
      select 1 from public.mind_training_modules m
      join public.mind_training_levels lv on lv.id = m.level_id
      where m.id = module_id and m.published = true and lv.published = true and public.can_view_mind_training_path(lv.path_id)
    )
  );
create policy mind_training_activities_admin_insert on public.mind_training_activities for insert with check (public.current_role() = 'admin');
create policy mind_training_activities_admin_update on public.mind_training_activities for update using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
create policy mind_training_activities_admin_delete on public.mind_training_activities for delete using (public.current_role() = 'admin');

-- Assessment metadata (title/pass score) is readable the same way an
-- activity is -- the questions/options themselves stay admin-only, same as
-- quiz_questions/quiz_options, and are only ever exposed to a member
-- sanitized (no is_correct) via get_mind_training_assessment_for_attempt.
alter table public.mind_training_assessments enable row level security;
grant select, insert, update, delete on public.mind_training_assessments to authenticated;
create policy mind_training_assessments_select on public.mind_training_assessments for select
  using (
    exists (
      select 1 from public.mind_training_modules m
      join public.mind_training_levels lv on lv.id = m.level_id
      where m.id = module_id and m.published = true and lv.published = true and public.can_view_mind_training_path(lv.path_id)
    )
  );
create policy mind_training_assessments_admin_insert on public.mind_training_assessments for insert with check (public.current_role() = 'admin');
create policy mind_training_assessments_admin_update on public.mind_training_assessments for update using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
create policy mind_training_assessments_admin_delete on public.mind_training_assessments for delete using (public.current_role() = 'admin');

alter table public.mind_training_assessment_questions enable row level security;
grant select, insert, update, delete on public.mind_training_assessment_questions to authenticated;
create policy mind_training_assessment_questions_admin_all on public.mind_training_assessment_questions for all
  using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

alter table public.mind_training_assessment_options enable row level security;
grant select, insert, update, delete on public.mind_training_assessment_options to authenticated;
create policy mind_training_assessment_options_admin_all on public.mind_training_assessment_options for all
  using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

-- Attempts: same shape as quiz_attempts -- a member can see their own past
-- attempts, an admin can see all; writes only via submit_mind_training_
-- assessment_attempt (SECURITY DEFINER, 0067), no direct insert grant.
alter table public.mind_training_assessment_attempts enable row level security;
grant select on public.mind_training_assessment_attempts to authenticated;
create policy mind_training_assessment_attempts_select on public.mind_training_assessment_attempts for select
  using (uid = auth.uid() or public.current_role() = 'admin');

-- Progress tables: a member can read their own rows (or admin, any); no
-- insert/update grant at all -- written only by mark_mind_training_lesson_
-- complete / mark_mind_training_activity_complete (0067).
alter table public.mind_training_lesson_progress enable row level security;
grant select on public.mind_training_lesson_progress to authenticated;
create policy mind_training_lesson_progress_select on public.mind_training_lesson_progress for select
  using (uid = auth.uid() or public.current_role() = 'admin');

alter table public.mind_training_activity_progress enable row level security;
grant select on public.mind_training_activity_progress to authenticated;
create policy mind_training_activity_progress_select on public.mind_training_activity_progress for select
  using (uid = auth.uid() or public.current_role() = 'admin');

-- ================= storage: mind-training-library =================
-- Private bucket shared by Mind Training lesson PDFs/images and Personal
-- Development resource files/thumbnails (0068) -- both need identical
-- admin-write/authenticated-read/signed-URL-on-read semantics, mirroring
-- course-content's existing policy shape exactly (0004_storage.sql).
insert into storage.buckets (id, name, public)
values ('mind-training-library', 'mind-training-library', false)
on conflict (id) do nothing;

create policy mind_training_library_read on storage.objects for select
  using (bucket_id = 'mind-training-library' and auth.role() = 'authenticated');
create policy mind_training_library_write on storage.objects for insert
  with check (bucket_id = 'mind-training-library' and public.current_role() = 'admin');
create policy mind_training_library_update on storage.objects for update
  using (bucket_id = 'mind-training-library' and public.current_role() = 'admin');
create policy mind_training_library_delete on storage.objects for delete
  using (bucket_id = 'mind-training-library' and public.current_role() = 'admin');
