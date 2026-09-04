-- ================= Onboarding redesign, part 2: system training + Rank-Up =================

-- 0132 renamed the title but left the key as 'prospect' (couldn't
-- reference the new key before deciding it) -- fixing that now, before
-- anything below queries by key = 'foundation'.
update public.training_levels set key = 'foundation' where key = 'prospect';

-- "Learn How Synergy Works" reuses the classes/class_modules/class_module_items
-- engine built for Skill/Income Development -- same ClassEditor/ClassPlayer,
-- same is_class_complete derivation, just a class purpose no existing tab
-- filters on, so it only ever shows up where Onboarding links to it.
alter table public.classes drop constraint classes_purpose_check;
alter table public.classes add constraint classes_purpose_check check (purpose in ('skill_development', 'income_development', 'onboarding'));

do $$
declare
  v_class_id uuid;
  v_module_id uuid;
begin
  insert into public.classes (title, description, status, purpose)
  values (
    'Learn How Synergy Works',
    'A short tour of your Synergy office -- what everything is for and how to use it well.',
    'published', 'onboarding'
  )
  returning id into v_class_id;

  insert into public.class_modules (class_id, title, order_index) values (v_class_id, 'Your Synergy Office', 1) returning id into v_module_id;
  insert into public.class_module_items (module_id, type, title, order_index, body) values (
    v_module_id, 'article', 'Dashboard, Notifications, Tasks', 1,
    'Your Dashboard is the front door to your office -- it opens on what actually needs your attention today: your tasks, your streak, your monthly goals, and anything an admin has flagged for you. The bell icon in the top bar is your Notifications -- every real event that touches your account (a rank change, a reviewed report, a request that needs a decision) lands there, so it is worth checking regularly rather than only when something feels off. Tasks is where each day''s real work actually lives, pulled together from every system you touch -- content assignments, rank tasks, and (once you are a Newbie) your Training coursework -- into one list, so you never have to go hunting across the app to know what is due.'
  );

  insert into public.class_modules (class_id, title, order_index) values (v_class_id, 'Learning Hub', 2) returning id into v_module_id;
  insert into public.class_module_items (module_id, type, title, order_index, body) values (
    v_module_id, 'article', 'Courses, Training, Exams, Progress', 1,
    'The Learning Hub is where real skill-building happens once you are promoted to Newbie -- Business Basics, Freelancing, Mind Training, and Personal Development each hold real courses with modules and lessons, and your progress on every one of them is tracked for real, never invented. Training (inside the Learning Center) is a separate, structured curriculum built from Classes -- each one an ordered set of modules and items (videos, articles, PDFs, tests, and assignments) a manager puts together. Exams are the graded side of that: a real question bank, a timer, and a pass mark, graded the moment you submit -- never a guess at your score. Whatever you complete anywhere in here shows up as real, current progress -- nothing here is ever marked done on your behalf.'
  );

  insert into public.class_modules (class_id, title, order_index) values (v_class_id, 'My Work', 3) returning id into v_module_id;
  insert into public.class_module_items (module_id, type, title, order_index, body) values (
    v_module_id, 'article', 'Tasks, Goals, Reports', 1,
    'My Work is where your day-to-day accountability lives. Tasks is your daily checklist, pulled from real assignments and rank requirements. My Goals is where you set real monthly targets across Learning, Freelancing, Network Marketing, and Personal Development, track real progress against each one, and check in on how the month is going -- not a wish list, a working plan. Reports is your own record of what you told your office you accomplished each day, and how those reports were reviewed -- your honest paper trail of real effort over time.'
  );

  insert into public.class_modules (class_id, title, order_index) values (v_class_id, 'Building Your Business', 4) returning id into v_module_id;
  insert into public.class_module_items (module_id, type, title, order_index, body) values (
    v_module_id, 'article', 'My Network, Prospects, Rank Journey, Team', 1,
    'My Network is your real team view -- who you have personally sponsored, and the wider network beneath them. Prospects lives inside it: your own pipeline of people you are talking to about the business, tracked stage by stage, not just a list of names. Rank Journey shows your real current rank, what is genuinely required to reach the next one, and how far you actually are -- it never shows a rank you have not truly earned. As your team grows, this is also where you start to see and support the people you have brought in, the same way your own sponsor supports you.'
  );

  insert into public.class_modules (class_id, title, order_index) values (v_class_id, 'Working With Your Sponsor', 5) returning id into v_module_id;
  insert into public.class_module_items (module_id, type, title, order_index, body) values (
    v_module_id, 'article', 'Communication, Meetings, Accountability', 1,
    'Your sponsor is the person who brought you into Synergy and is invested in you actually succeeding here -- not a background contact. Keep in touch with them the same way you would a real colleague: ask questions early rather than staying stuck, and use your scheduled check-ins (like the meeting that is part of your own onboarding) as a real two-way conversation about how things are going, not a box to tick. As you progress, being reachable and honest with your sponsor about real wins and real struggles is what makes the relationship actually useful, for both of you.'
  );

  insert into public.class_modules (class_id, title, order_index) values (v_class_id, 'Your Workday', 6) returning id into v_module_id;
  insert into public.class_module_items (module_id, type, title, order_index, body) values (
    v_module_id, 'article', 'Learn, Work, Build, Report', 1,
    'A real Synergy workday has a rhythm: Learn something real (a lesson, a course, a module), Work on what is actually in front of you today (your real Tasks list), Build your business deliberately (a real conversation with a prospect, real progress toward a rank requirement, real time with your team), and Report honestly on what you actually did. None of it has to be dramatic every day -- but showing up for all four, consistently, for real, is what separates a member who is genuinely building something here from one who is just logged in.'
  );

  -- Point Get to Work's "Learn How Synergy Works" checklist item at this
  -- class (couldn't forward-reference it in 0132's own insert).
  insert into public.level_checklist_items (level_id, section, title, description, signal, class_id, order_index)
  select tl.id, 'work', 'Learn How Synergy Works', 'A short guided tour of your Synergy office.', 'class_complete', v_class_id, 1
  from public.training_levels tl where tl.key = 'get_to_work';
end;
$$;

-- ================= Rank-Up request: extend the existing table, not a new system =================
-- Reflection fields folded straight into rank_advancement_requests so the
-- Prospect -> Newbie qualification shows up inside the existing Rank
-- Advancement review queue, not a parallel one. 'needs_more_work' replaces
-- the harsh "rejected" framing for ordinary incomplete-onboarding cases;
-- 'rejected' stays in the CHECK for whatever the original harsher case was
-- meant for, just not used by this flow.
alter table public.rank_advancement_requests
  add column if not exists reflection_text text,
  add column if not exists preparedness text check (preparedness in ('not_ready', 'somewhat_ready', 'ready', 'very_ready')),
  add column if not exists questions_text text;

alter table public.rank_advancement_requests drop constraint rank_advancement_requests_status_check;
alter table public.rank_advancement_requests add constraint rank_advancement_requests_status_check
  check (status in ('pending', 'approved', 'rejected', 'needs_more_work'));

-- One function, reused for the member's own view (get_onboarding_status())
-- and for admin reviewing a specific member's request
-- (get_onboarding_status(p_uid) inside Evaluation) -- exactly the same 13
-- requirements, exactly the same derivation, so the two views can never
-- disagree.
create or replace function public.get_onboarding_status(p_uid uuid default null)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid uuid;
  v_level record;
  v_item record;
  v_level1 jsonb := '[]'::jsonb;
  v_level2 jsonb := '[]'::jsonb;
  v_level1_done int := 0;
  v_level1_total int := 0;
  v_level2_done int := 0;
  v_level2_total int := 0;
  v_done boolean;
  v_meeting record;
  v_request record;
begin
  if p_uid is null or p_uid = auth.uid() then
    v_uid := auth.uid();
  elsif coalesce(public.current_role(), '') in ('admin', 'mentor') then
    v_uid := p_uid;
  else
    raise exception 'permission denied';
  end if;

  -- ---------- Level 1: Foundation ----------
  for v_item in
    select li.* from public.level_learn_items li
    join public.training_levels tl on tl.id = li.level_id
    where tl.key = 'foundation'
    order by li.order_index
  loop
    v_level1_total := v_level1_total + 1;
    if v_item.kind = 'lesson' and v_item.exam_id is not null then
      v_done := public.has_passed_exam(v_item.exam_id, v_uid);
    elsif v_item.kind = 'lesson' then
      v_done := exists (select 1 from public.level_learn_progress where item_id = v_item.id and user_id = v_uid);
    elsif v_item.kind = 'agreement_signature' then
      v_done := exists (select 1 from public.level_agreement_signatures where item_id = v_item.id and user_id = v_uid);
    else
      v_done := exists (select 1 from public.level_learn_progress where item_id = v_item.id and user_id = v_uid);
    end if;
    if v_done then v_level1_done := v_level1_done + 1; end if;

    v_level1 := v_level1 || jsonb_build_object(
      'id', v_item.id, 'title', v_item.title, 'description', v_item.description, 'kind', v_item.kind,
      'textBody', v_item.text_body, 'videoUrl', v_item.video_url, 'pdfFilePath', v_item.pdf_file_path, 'examId', v_item.exam_id,
      'agreementBody', v_item.agreement_body, 'agreementVersion', v_item.agreement_version,
      'externalLink', v_item.external_link, 'confirmationLabel', v_item.confirmation_label,
      'done', v_done
    );
  end loop;

  -- ---------- Level 2: Get to Work (locked until Level 1 fully done) ----------
  for v_item in
    select ci.* from public.level_checklist_items ci
    join public.training_levels tl on tl.id = ci.level_id
    where tl.key = 'get_to_work'
    order by ci.order_index
  loop
    v_level2_total := v_level2_total + 1;
    if v_item.signal = 'class_complete' then
      v_done := public.is_class_complete(v_item.class_id, v_uid);
    elsif v_item.signal = 'profile_100' then
      v_done := public.compute_profile_health_percent(v_uid) >= 100;
    elsif v_item.signal = 'goals_set' then
      v_done := exists (select 1 from public.monthly_goals where uid = v_uid and status <> 'draft');
    elsif v_item.signal in ('sponsor_meeting', 'upline_meeting') then
      select * into v_meeting from public.level_meetings
        where user_id = v_uid and meeting_type = (case when v_item.signal = 'sponsor_meeting' then 'sponsor' else 'upline_director' end);
      v_done := coalesce(v_meeting.status = 'completed', false);
    else
      v_done := exists (select 1 from public.level_checklist_progress where item_id = v_item.id and user_id = v_uid);
    end if;
    if v_done then v_level2_done := v_level2_done + 1; end if;

    v_level2 := v_level2 || jsonb_build_object(
      'id', v_item.id, 'title', v_item.title, 'description', v_item.description, 'signal', v_item.signal, 'classId', v_item.class_id,
      'done', v_done,
      'meeting', case when v_item.signal in ('sponsor_meeting', 'upline_meeting') then jsonb_build_object(
        'status', coalesce(v_meeting.status, 'pending'), 'meetingLink', v_meeting.meeting_link,
        'counterpartName', coalesce(v_meeting.counterpart_name, (select display_name from public.profiles where id = v_meeting.counterpart_uid))
      ) else null end
    );
  end loop;

  select * into v_request from public.rank_advancement_requests
    where uid = v_uid and to_rank_id = (select id from public.ranks where title = 'NEWBIE')
    order by requested_at desc limit 1;

  return jsonb_build_object(
    'level1', v_level1, 'level1Done', v_level1_done, 'level1Total', v_level1_total,
    'level2', v_level2, 'level2Done', v_level2_done, 'level2Total', v_level2_total,
    'level2Unlocked', v_level1_done = v_level1_total and v_level1_total > 0,
    'allComplete', v_level1_done = v_level1_total and v_level1_total > 0 and v_level2_done = v_level2_total and v_level2_total > 0,
    'pendingRequest', case when v_request.id is null then null else jsonb_build_object(
      'id', v_request.id, 'status', v_request.status, 'reflectionText', v_request.reflection_text,
      'preparedness', v_request.preparedness, 'questionsText', v_request.questions_text,
      'reviewNote', v_request.review_note, 'requestedAt', v_request.requested_at, 'reviewedAt', v_request.reviewed_at
    ) end
  );
end;
$$;

revoke execute on function public.get_onboarding_status(uuid) from public, anon;
grant execute on function public.get_onboarding_status(uuid) to authenticated;

-- ================= member: submit the Newbie Rank-Up request =================
-- Re-derives all 13 requirements server-side rather than trusting the
-- client's "I finished everything" -- the whole point of a real
-- qualification process.
create or replace function public.submit_newbie_rankup_request(p_reflection_text text, p_preparedness text, p_questions_text text, p_confirmed boolean)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_status jsonb;
  v_prospect_rank_id uuid;
  v_newbie_rank_id uuid;
  v_current_rank_id uuid;
  v_id uuid;
  v_display_name text;
  v_admin record;
begin
  select rank_id into v_current_rank_id from public.profiles where id = v_uid;
  select id into v_prospect_rank_id from public.ranks where title = 'PROSPECT';
  select id into v_newbie_rank_id from public.ranks where title = 'NEWBIE';

  if v_current_rank_id is distinct from v_prospect_rank_id then
    raise exception 'only a Prospect can request Newbie rank';
  end if;
  if exists (select 1 from public.rank_advancement_requests where uid = v_uid and status = 'pending') then
    raise exception 'you already have a rank-up request pending review';
  end if;
  if not coalesce(p_confirmed, false) then
    raise exception 'confirm that you have completed all required onboarding activities';
  end if;
  if p_preparedness not in ('not_ready', 'somewhat_ready', 'ready', 'very_ready') then
    raise exception 'invalid preparedness answer';
  end if;
  if coalesce(trim(p_reflection_text), '') = '' then
    raise exception 'share a short reflection before submitting';
  end if;

  v_status := public.get_onboarding_status(v_uid);
  if not coalesce((v_status ->> 'allComplete')::boolean, false) then
    raise exception 'finish every Level 1 and Level 2 requirement first';
  end if;

  insert into public.rank_advancement_requests (uid, from_rank_id, to_rank_id, status, reflection_text, preparedness, questions_text)
  values (v_uid, v_prospect_rank_id, v_newbie_rank_id, 'pending', trim(p_reflection_text), p_preparedness, nullif(trim(p_questions_text), ''))
  returning id into v_id;

  select display_name into v_display_name from public.profiles where id = v_uid;

  for v_admin in select id from public.profiles where role = 'admin' loop
    insert into public.notifications (uid, type, title, body, link_to)
    values (
      v_admin.id, 'newbie_rankup_requested', 'Newbie rank-up request',
      coalesce(nullif(v_display_name, ''), 'A member') || ' finished onboarding and is requesting Newbie rank.',
      '/admin/evaluation/reports?section=rank-advancement'
    );
  end loop;

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (v_uid, 'newbie_rankup_requested', 'rank_advancement_request', v_id::text, '{}'::jsonb);

  return v_id;
end;
$$;

revoke execute on function public.submit_newbie_rankup_request(text, text, text, boolean) from public, anon;
grant execute on function public.submit_newbie_rankup_request(text, text, text, boolean) to authenticated;

-- ================= admin: review, now with a real third outcome =================
-- CREATE OR REPLACE, 0082's body plus: 'needs_more_work' (requires a note,
-- notifies the member with that exact feedback, and -- since it clears
-- the unique-pending index -- lets them resubmit once they've acted on
-- it) and a Newbie-specific congratulations on approval, on top of
-- admin_set_member_rank's own generic "your rank changed" notice.
create or replace function public.review_rank_advancement_request(p_request_id uuid, p_decision text, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_to_rank_id uuid;
  v_to_rank_title text;
  v_status text;
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;
  if p_decision not in ('approved', 'rejected', 'needs_more_work') then
    raise exception 'invalid decision: %', p_decision;
  end if;
  if p_decision = 'needs_more_work' and coalesce(trim(p_note), '') = '' then
    raise exception 'add feedback so the member knows what to do next';
  end if;

  select uid, to_rank_id, status into v_uid, v_to_rank_id, v_status
    from public.rank_advancement_requests where id = p_request_id;
  if v_uid is null then
    raise exception 'advancement request not found';
  end if;
  if v_status <> 'pending' then
    raise exception 'this request has already been reviewed';
  end if;

  select title into v_to_rank_title from public.ranks where id = v_to_rank_id;

  update public.rank_advancement_requests
    set status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(), review_note = coalesce(p_note, '')
    where id = p_request_id;

  if p_decision = 'approved' then
    -- Composes admin_set_member_rank (0060) so its own notification/
    -- activity-log behavior stays the single source of truth for "your
    -- rank changed," not duplicated here.
    perform public.admin_set_member_rank(v_uid, v_to_rank_id);

    if v_to_rank_title = 'NEWBIE' then
      insert into public.notifications (uid, type, title, body, link_to)
      values (
        v_uid, 'newbie_rankup_approved', '🎉 Congratulations! You''ve been approved for Newbie Rank.',
        'Your onboarding is complete and your Learning Hub training is now unlocked.', '/training'
      );
    end if;
  elsif p_decision = 'needs_more_work' then
    insert into public.notifications (uid, type, title, body, link_to)
    values (v_uid, 'rankup_needs_more_work', 'Further action required on your rank-up request', trim(p_note), '/training');
  else
    insert into public.notifications (uid, type, title, body, link_to)
    values (
      v_uid, 'rank_advancement_rejected', 'Rank advancement declined',
      coalesce(nullif(p_note, ''), 'An admin reviewed your request and asked you to keep working on your current rank.'),
      '/dashboard'
    );
  end if;

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'rank_advancement_reviewed', 'rank_advancement_request', p_request_id::text, jsonb_build_object('decision', p_decision));
end;
$$;

revoke execute on function public.review_rank_advancement_request(uuid, text, text) from public, anon;
grant execute on function public.review_rank_advancement_request(uuid, text, text) to authenticated;
