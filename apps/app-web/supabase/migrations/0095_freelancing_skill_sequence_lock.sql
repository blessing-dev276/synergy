-- Freelancing (learning_paths.section = 'skill_set') gets a sequential
-- unlock chain, product rule from the admin:
--   "What Are Digital Skills?" (foundational, matched by title -- same
--   keyword-match convention OnboardingFlow.jsx already uses for the
--   compulsory skill, no hardcoded id) is always unlocked and comes first.
--   The compulsory skill ("...graphic..." in the title) stays locked until
--   that foundational path is 100% complete. The one skill a member picked
--   during onboarding (profiles.onboarding->'skills', an ordered array of
--   titles -- index 0 is always the compulsory skill's own title, per
--   OnboardingFlow.jsx's finish()) stays locked until the compulsory skill
--   is complete. Once a member's current last track entry is complete,
--   every other published skill_set path becomes "choosable" -- pick any
--   one to unlock it, then the chain continues from there.
--
-- Deliberately UI-guided, not a hard RLS boundary -- same posture as Mind
-- Training's own sequential lock (0075's comment: "guided progression, not
-- a hard server-side security boundary"). The one write this migration
-- adds (choose_next_freelancing_skill) does validate server-side, though:
-- unlike a locked Mind Training path (nothing to write, just a hidden
-- link), unlocking a skill here changes profiles.onboarding, so it gets
-- the same re-check-on-the-server treatment every other proxy/RPC in this
-- app already gets, not just a client-side "the button happened to be
-- visible" trust.

-- ================= is_learning_path_complete: extracted, not duplicated =================
-- Byte-for-byte the existing path_complete proxy logic from
-- evaluate_rank_task_proxies (0080: every published resource in the path
-- done, courses via lesson_progress, standalone video/book/podcast/link/pdf
-- via course_progress) -- pulled out into its own function so this
-- migration's skill-lock logic can reuse it instead of re-embedding a
-- third copy, and evaluate_rank_task_proxies is repointed at it below so
-- there's exactly one definition of "is this path done" for regular
-- (non-Mind-Training) learning paths, mirroring is_mind_training_path_complete's
-- existing precedent for the Mind Training side.
create or replace function public.is_learning_path_complete(p_uid uuid, p_path_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_total_resources int;
  v_incomplete_resources int;
begin
  select count(*) into v_total_resources
    from public.courses c
    where c.path_id = p_path_id and c.published = true
      and (c.resource_type <> 'course' or c.lesson_count > 0);

  if v_total_resources = 0 then
    return false;
  end if;

  select count(*) into v_incomplete_resources
    from public.courses c
    where c.path_id = p_path_id and c.published = true
      and (
        (c.resource_type = 'course' and c.lesson_count > 0 and c.lesson_count > (
          select count(*) from public.lesson_progress lp
          where lp.uid = p_uid and lp.course_id = c.id and lp.status = 'completed'
        ))
        or (c.resource_type <> 'course' and not exists (
          select 1 from public.course_progress cp where cp.uid = p_uid and cp.course_id = c.id
        ))
      );

  return v_incomplete_resources = 0;
end;
$$;

revoke execute on function public.is_learning_path_complete(uuid, uuid) from public, anon, authenticated;

-- ================= evaluate_rank_task_proxies: path_complete now calls the shared helper =================
create or replace function public.evaluate_rank_task_proxies(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rank_id uuid;
  v_task record;
  v_task_date date := current_date;
  v_existing_id uuid;
  v_count int;
  v_qualifies boolean;
begin
  select rank_id into v_rank_id from public.profiles where id = p_uid;
  if v_rank_id is null then
    return;
  end if;

  for v_task in
    select id, title, recurrence, proxy_type, proxy_path_id, proxy_threshold
    from public.rank_tasks
    where rank_id = v_rank_id and proxy_type <> 'manual'
  loop
    select id into v_existing_id
      from public.rank_task_submissions
      where rank_task_id = v_task.id and uid = p_uid
        and (v_task.recurrence = 'once' or task_date = v_task_date)
      limit 1;
    if v_existing_id is not null then
      continue;
    end if;

    v_qualifies := false;

    if v_task.proxy_type = 'modules_count' then
      select count(*) into v_count
        from public.modules m
        join public.courses c on c.id = m.course_id
        where c.path_id = v_task.proxy_path_id and c.resource_type = 'course' and m.lesson_count > 0
          and m.lesson_count <= (
            select count(*) from public.lesson_progress lp
            where lp.uid = p_uid and lp.module_id = m.id and lp.status = 'completed'
              and (v_task.recurrence <> 'daily' or lp.completed_at::date = v_task_date)
          );
      v_qualifies := v_count >= v_task.proxy_threshold;

    elsif v_task.proxy_type = 'path_complete' then
      v_qualifies := public.is_learning_path_complete(p_uid, v_task.proxy_path_id);

    elsif v_task.proxy_type = 'prospects_count' then
      select count(*) into v_count
        from public.prospects
        where owner_uid = p_uid and created_at::date = v_task_date;
      v_qualifies := v_count >= v_task.proxy_threshold;

    elsif v_task.proxy_type = 'mind_training_modules_count' then
      select count(*) into v_count
        from public.mind_training_modules m
        join public.mind_training_levels lv on lv.id = m.level_id and lv.published = true
        where lv.path_id = v_task.proxy_path_id and m.published = true
          and exists (select 1 from public.mind_training_lessons l2 where l2.module_id = m.id and l2.published = true)
          and not exists (
            select 1 from public.mind_training_lessons l
            where l.module_id = m.id and l.published = true
              and not exists (
                select 1 from public.mind_training_lesson_progress lpr
                where lpr.lesson_id = l.id and lpr.uid = p_uid
                  and (v_task.recurrence <> 'daily' or lpr.completed_at::date = v_task_date)
              )
          )
          and not exists (
            select 1 from public.mind_training_activities a
            where a.module_id = m.id and a.published = true and a.is_required
              and not exists (
                select 1 from public.mind_training_activity_progress apr
                where apr.activity_id = a.id and apr.uid = p_uid
                  and (v_task.recurrence <> 'daily' or apr.completed_at::date = v_task_date)
              )
          )
          and not exists (
            select 1 from public.mind_training_assessments asm
            where asm.module_id = m.id
              and not exists (
                select 1 from public.mind_training_assessment_attempts att
                where att.assessment_id = asm.id and att.uid = p_uid and att.passed = true
                  and (v_task.recurrence <> 'daily' or att.submitted_at::date = v_task_date)
              )
          );
      v_qualifies := v_count >= v_task.proxy_threshold;

    elsif v_task.proxy_type = 'mind_training_path_complete' then
      v_qualifies := public.is_mind_training_path_complete(p_uid, v_task.proxy_path_id);
    end if;

    if not v_qualifies then
      continue;
    end if;

    insert into public.rank_task_submissions (rank_task_id, uid, task_date, status, submitted_at, reviewed_at, review_note)
    values (v_task.id, p_uid, v_task_date, 'approved', now(), now(), 'Tracked automatically from learning progress.')
    on conflict (rank_task_id, uid, task_date) do nothing;

    insert into public.notifications (uid, type, title, body, link_to)
    values (
      p_uid, 'rank_task_reviewed', 'Task completed 🎉',
      '"' || v_task.title || '" was completed automatically, based on your progress.',
      '/tasks'
    );

    insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
    values (p_uid, 'rank_task_auto_approved', 'rank_task_submission', v_task.id::text, jsonb_build_object('rank_task_id', v_task.id));
  end loop;
end;
$$;

-- ================= get_skill_lock_status: the chain, one path at a time =================
-- Returns null for anything outside skill_set (no lock concept applies --
-- Business Basics/Mind Training/Personal Development are untouched).
create or replace function public.get_skill_lock_status(p_uid uuid, p_path_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_title text;
  v_section text;
  v_skills jsonb;
  v_idx int;
  v_prev_title text;
  v_prev_path_id uuid;
  v_foundational_id uuid;
  v_foundational_title text;
  v_last_title text;
  v_last_path_id uuid;
begin
  select title, section into v_title, v_section from public.learning_paths where id = p_path_id;
  if v_title is null or v_section is distinct from 'skill_set' then
    return null;
  end if;

  if v_title ilike '%digital skills%' then
    return jsonb_build_object('status', 'unlocked');
  end if;

  select id, title into v_foundational_id, v_foundational_title
    from public.learning_paths
    where section = 'skill_set' and published = true and title ilike '%digital skills%'
    order by order_index limit 1;

  if v_title ilike '%graphic%' then
    if v_foundational_id is null or public.is_learning_path_complete(p_uid, v_foundational_id) then
      return jsonb_build_object('status', 'unlocked');
    end if;
    return jsonb_build_object('status', 'locked', 'blockedBy', v_foundational_title);
  end if;

  select coalesce(onboarding -> 'skills', '[]'::jsonb) into v_skills from public.profiles where id = p_uid;

  select ord - 1 into v_idx
    from jsonb_array_elements_text(v_skills) with ordinality as t(val, ord)
    where t.val = v_title
    limit 1;

  if v_idx is not null then
    -- Index 0 is always the compulsory skill's own title (finish()), which
    -- is handled by the ilike '%graphic%' branch above -- this is
    -- unreachable in practice, just guarding against ever wrapping to the
    -- *last* array element via a negative jsonb ->> index.
    if v_idx = 0 then
      return jsonb_build_object('status', 'unlocked');
    end if;
    v_prev_title := v_skills ->> (v_idx - 1);
    select id into v_prev_path_id from public.learning_paths
      where section = 'skill_set' and title = v_prev_title limit 1;
    if v_prev_path_id is not null and public.is_learning_path_complete(p_uid, v_prev_path_id) then
      return jsonb_build_object('status', 'unlocked');
    end if;
    return jsonb_build_object('status', 'locked', 'blockedBy', v_prev_title);
  end if;

  -- Not in the member's track at all -- only choosable once whatever they
  -- currently have (the last track entry) is fully done.
  if jsonb_array_length(v_skills) = 0 then
    return jsonb_build_object('status', 'locked');
  end if;
  v_last_title := v_skills ->> (jsonb_array_length(v_skills) - 1);
  select id into v_last_path_id from public.learning_paths
    where section = 'skill_set' and title = v_last_title limit 1;
  if v_last_path_id is not null and public.is_learning_path_complete(p_uid, v_last_path_id) then
    return jsonb_build_object('status', 'choosable');
  end if;
  return jsonb_build_object('status', 'locked', 'blockedBy', v_last_title);
end;
$$;

revoke execute on function public.get_skill_lock_status(uuid, uuid) from public, anon, authenticated;

-- ================= get_learning_paths: carries skillLock now =================
create or replace function public.get_learning_paths()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rank_id uuid;
  v_rank_order int;
  v_path text;
begin
  select p.rank_id, coalesce(p.participation_path, 'full')
    into v_rank_id, v_path
    from public.profiles p where p.id = v_uid;

  select order_index into v_rank_order from public.ranks where id = v_rank_id;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', lp.id,
      'title', lp.title,
      'description', lp.description,
      'courseCount', lp.course_count,
      'section', lp.section,
      'completed', coalesce((
        select min(r.order_index) < v_rank_order
        from public.rank_learning_paths rlp
        join public.ranks r on r.id = rlp.rank_id
        where rlp.learning_path_id = lp.id
      ), false),
      'skillLock', public.get_skill_lock_status(v_uid, lp.id)
    ) order by lp.order_index)
    from public.learning_paths lp
    where lp.published = true
      and (v_path <> 'network_marketing_only' or not lp.is_skill)
      and (
        not exists (select 1 from public.rank_learning_paths rlp where rlp.learning_path_id = lp.id)
        or exists (
          select 1 from public.rank_learning_paths rlp
          join public.ranks r on r.id = rlp.rank_id
          where rlp.learning_path_id = lp.id
            and v_rank_order is not null
            and r.order_index <= v_rank_order
        )
      )
  ), '[]'::jsonb);
end;
$$;

-- ================= choose_next_freelancing_skill: the member's write side =================
-- Re-validates 'choosable' server-side via the same get_skill_lock_status
-- a member's client just read -- unlike a locked Mind Training path (there's
-- nothing to write, the link is just hidden), unlocking a skill here writes
-- profiles.onboarding, so it doesn't get to be UI-trust-only the way the
-- rest of this lock is.
create or replace function public.choose_next_freelancing_skill(p_path_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_title text;
  v_section text;
  v_published boolean;
  v_status jsonb;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;

  select title, section, published into v_title, v_section, v_published
    from public.learning_paths where id = p_path_id;
  if v_title is null then
    raise exception 'learning path not found';
  end if;
  if v_section is distinct from 'skill_set' or not v_published then
    raise exception 'not a published Freelancing skill';
  end if;

  v_status := public.get_skill_lock_status(v_uid, p_path_id);
  if v_status ->> 'status' is distinct from 'choosable' then
    raise exception 'this skill is not currently available to unlock';
  end if;

  update public.profiles
    set onboarding = jsonb_set(
      onboarding,
      '{skills}',
      coalesce(onboarding -> 'skills', '[]'::jsonb) || to_jsonb(v_title)
    )
    where id = v_uid;

  insert into public.notifications (uid, type, title, body, link_to)
  values (
    v_uid, 'skill_unlocked', 'New skill unlocked 🎉',
    '"' || v_title || '" is now unlocked — dive in whenever you''re ready.',
    '/learning/' || p_path_id::text
  );

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (v_uid, 'freelancing_skill_unlocked', 'learning_path', p_path_id::text, jsonb_build_object('title', v_title));
end;
$$;

revoke execute on function public.choose_next_freelancing_skill(uuid) from public, anon;
grant execute on function public.choose_next_freelancing_skill(uuid) to authenticated;
