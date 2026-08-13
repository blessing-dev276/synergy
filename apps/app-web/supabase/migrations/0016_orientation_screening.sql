-- Turns signup from "instant access" into "apply -> screen -> admin
-- approves". New members now land in a 'pending' status (blocked from
-- participating via the same is_active() choke point suspend/removed
-- already use, per 0014) until they complete a short orientation — read a
-- few sections about the program, then answer a graded quiz — and an admin
-- reviews their score and approves or rejects them.
--
-- Deliberately mirrors the existing quiz schema (quizzes/quiz_questions/
-- quiz_options/quiz_attempts) rather than reusing it directly: orientation
-- isn't tied to a lesson, runs pre-membership (before is_active() even
-- applies), and is graded once as a single flat set, not per-lesson.

-- ---------- allow 'pending' as a real status ----------
alter table public.profiles drop constraint profiles_status_check;
alter table public.profiles add constraint profiles_status_check
  check (status in ('pending', 'active', 'suspended', 'removed'));

-- ---------- new signups start 'pending', not 'active' ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invited_by uuid;
begin
  begin
    v_invited_by := nullif(new.raw_user_meta_data->>'invited_by_uid', '')::uuid;
  exception when others then
    v_invited_by := null;
  end;

  if v_invited_by is not null and not exists (select 1 from public.profiles where id = v_invited_by) then
    v_invited_by := null;
  end if;

  insert into public.profiles (id, display_name, email, invited_by_uid, status)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', ''), new.email, v_invited_by, 'pending')
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------- set_member_status: 'pending' is now a valid target too ----------
-- (lets an admin send someone back to redo orientation, and reuses the same
-- self/admin lockout guards from 0014 unchanged.)
create or replace function public.set_member_status(p_uid uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_role text;
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;
  if p_status not in ('pending', 'active', 'suspended', 'removed') then
    raise exception 'invalid status: %', p_status;
  end if;
  if p_uid = auth.uid() then
    raise exception 'you cannot change your own status';
  end if;

  select role into v_target_role from public.profiles where id = p_uid;
  if v_target_role is null then
    raise exception 'member not found';
  end if;
  if v_target_role = 'admin' then
    raise exception 'cannot change another admin''s status';
  end if;

  update public.profiles set status = p_status where id = p_uid;

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'member_status_changed', 'profile', p_uid::text, jsonb_build_object('status', p_status));
end;
$$;

-- ================= orientation content (admin-editable) =================

create table public.orientation_sections (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text default '',
  order_index int not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orientation_sections_order_idx on public.orientation_sections (order_index);

create table public.orientation_questions (
  id uuid primary key default gen_random_uuid(),
  prompt text not null,
  order_index int not null default 0
);
create index orientation_questions_order_idx on public.orientation_questions (order_index);

create table public.orientation_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.orientation_questions(id) on delete cascade,
  text text not null,
  is_correct boolean not null default false,
  order_index int not null default 0
);
create index orientation_options_question_idx on public.orientation_options (question_id, order_index);

-- ---------- per-member progress ----------

-- "Reading" a section is self-attested (direct RLS insert, same pattern as
-- task_completions) — gates quiz access and is the "gain a point per
-- section" mechanic the applicant sees as they go.
create table public.orientation_reads (
  uid uuid not null references public.profiles(id) on delete cascade,
  section_id uuid not null references public.orientation_sections(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (uid, section_id)
);

-- One row per member (like member_journey) — re-submitting overwrites, so
-- there's always exactly one current grade for the admin to review.
create table public.orientation_attempts (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null unique references public.profiles(id) on delete cascade,
  score int not null,
  total int not null,
  answers jsonb not null default '[]'::jsonb,
  submitted_at timestamptz not null default now()
);

-- ================= RLS =================

alter table public.orientation_sections enable row level security;
grant select, insert, update, delete on public.orientation_sections to authenticated;
create policy orientation_sections_select on public.orientation_sections for select using (auth.uid() is not null);
create policy orientation_sections_admin_insert on public.orientation_sections for insert with check (public.current_role() = 'admin');
create policy orientation_sections_admin_update on public.orientation_sections for update using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
create policy orientation_sections_admin_delete on public.orientation_sections for delete using (public.current_role() = 'admin');

-- questions/options are graded server-side only (get_orientation_content
-- strips is_correct) — admin-only in both directions, same as quiz_questions/
-- quiz_options in 0002.
alter table public.orientation_questions enable row level security;
grant select, insert, update, delete on public.orientation_questions to authenticated;
create policy orientation_questions_admin_all on public.orientation_questions for all
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

alter table public.orientation_options enable row level security;
grant select, insert, update, delete on public.orientation_options to authenticated;
create policy orientation_options_admin_all on public.orientation_options for all
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

alter table public.orientation_reads enable row level security;
grant select, insert on public.orientation_reads to authenticated;
create policy orientation_reads_select on public.orientation_reads for select
  using (uid = auth.uid() or public.current_role() = 'admin');
create policy orientation_reads_insert on public.orientation_reads for insert
  with check (uid = auth.uid());

alter table public.orientation_attempts enable row level security;
grant select on public.orientation_attempts to authenticated;
create policy orientation_attempts_select on public.orientation_attempts for select
  using (uid = auth.uid() or public.current_role() = 'admin');
-- no insert/update grant: written only by submit_orientation (below), SECURITY DEFINER.

-- ================= RPCs =================

-- ---------- sanitized read: sections + questions/options, no is_correct ----------
create or replace function public.get_orientation_content()
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'body', s.body) order by s.order_index)
      from public.orientation_sections s where s.published = true
    ), '[]'::jsonb),
    'questions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', q.id,
          'prompt', q.prompt,
          'options', (
            select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'text', o.text) order by o.order_index), '[]'::jsonb)
            from public.orientation_options o where o.question_id = q.id
          )
        ) order by q.order_index
      )
      from public.orientation_questions q
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.get_orientation_content() from public, anon;
grant execute on function public.get_orientation_content() to authenticated;

-- ---------- grade + record a submission ----------
create or replace function public.submit_orientation(p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_published_count int;
  v_read_count int;
  v_total int;
  v_correct int := 0;
  v_score int;
  v_question record;
  v_given_option uuid;
begin
  select count(*) into v_published_count from public.orientation_sections where published = true;
  select count(*) into v_read_count from public.orientation_reads where uid = auth.uid();
  if v_published_count > 0 and v_read_count < v_published_count then
    raise exception 'read through every section first';
  end if;

  select count(*) into v_total from public.orientation_questions;

  for v_question in select id from public.orientation_questions loop
    select (elem->>'optionId')::uuid into v_given_option
      from jsonb_array_elements(p_answers) elem
      where (elem->>'questionId')::uuid = v_question.id
      limit 1;

    if v_given_option is not null and exists (
      select 1 from public.orientation_options where id = v_given_option and question_id = v_question.id and is_correct = true
    ) then
      v_correct := v_correct + 1;
    end if;
  end loop;

  v_score := case when v_total > 0 then round((v_correct::numeric / v_total) * 100) else 0 end;

  insert into public.orientation_attempts (uid, score, total, answers, submitted_at)
  values (auth.uid(), v_score, v_total, p_answers, now())
  on conflict (uid) do update set score = excluded.score, total = excluded.total, answers = excluded.answers, submitted_at = now();

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'orientation_submitted', 'profile', auth.uid()::text, jsonb_build_object('score', v_score, 'total', v_total));

  return jsonb_build_object('score', v_score, 'total', v_total);
end;
$$;

revoke execute on function public.submit_orientation(jsonb) from public, anon;
grant execute on function public.submit_orientation(jsonb) to authenticated;

-- ================= seed default content =================
-- Admin can rewrite/replace all of this from the Orientation Builder —
-- these are starting defaults so a fresh signup isn't stuck on an empty
-- screening step before anyone's configured it.

insert into public.orientation_sections (title, body, order_index) values
  ('How to Build a Passive Income Business',
   'Passive income means building something once — a product, a system, a piece of content — that keeps earning after the initial work is done. The businesses that get this right treat the first push as an investment: they document what works, systemize the repeatable parts, and let a process (not their constant attention) carry the result forward. It''s rarely "no work" — it''s front-loaded work that pays out later.',
   1),
  ('All About Business',
   'At its core, a business solves a real problem for people who are willing to pay for the solution. Everything else — branding, marketing, pricing, operations — exists to make that exchange happen more reliably and at a bigger scale. The businesses that last aren''t the ones with the cleverest idea; they''re the ones that stay closest to the actual problem their customers have and keep adjusting as that problem changes.',
   2),
  ('What Is an Entrepreneur?',
   'An entrepreneur is someone who takes ownership of a problem and the risk of solving it — they don''t wait for permission or a perfect plan, they start with what they have and adjust as they learn. That mindset matters more than any specific skill: entrepreneurship is less about having all the answers upfront and more about being willing to test, fail, learn, and try again.',
   3);

insert into public.orientation_questions (prompt, order_index) values
  ('What best describes "passive income"?', 1),
  ('What does a business fundamentally exist to do?', 2),
  ('What trait most defines an entrepreneur?', 3),
  ('True or false: most passive income requires zero upfront work.', 4),
  ('Which habit is most useful when starting something new with limited resources?', 5);

do $$
declare
  q1 uuid; q2 uuid; q3 uuid; q4 uuid; q5 uuid;
begin
  select id into q1 from public.orientation_questions where order_index = 1;
  select id into q2 from public.orientation_questions where order_index = 2;
  select id into q3 from public.orientation_questions where order_index = 3;
  select id into q4 from public.orientation_questions where order_index = 4;
  select id into q5 from public.orientation_questions where order_index = 5;

  insert into public.orientation_options (question_id, text, is_correct, order_index) values
    (q1, 'Income from work you do once that keeps paying out through a system or asset', true, 1),
    (q1, 'Money that arrives with no effort at any point', false, 2),
    (q1, 'A salary paid automatically every month', false, 3),

    (q2, 'Solve a real problem people are willing to pay for', true, 1),
    (q2, 'Look impressive to investors', false, 2),
    (q2, 'Maximize the number of products offered', false, 3),

    (q3, 'Taking ownership of a problem and the risk of solving it', true, 1),
    (q3, 'Having a perfect plan before starting', false, 2),
    (q3, 'Avoiding risk at all costs', false, 3),

    (q4, 'True', false, 1),
    (q4, 'False', true, 2),

    (q5, 'Start with what you have, test, and adjust as you learn', true, 1),
    (q5, 'Wait until every detail is figured out', false, 2),
    (q5, 'Copy a competitor exactly and never change it', false, 3);
end $$;
