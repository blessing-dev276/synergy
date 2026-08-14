-- Phase 2 of the development-level architecture: Milestones as a real
-- entity (today "milestone" is only a task_type tag), a generalized Review
-- path for content_assignments that require admin approval (requires_
-- admin_approval has existed since the old `tasks` table and is still
-- unenforced dead data even after the 0027-0030 content-model cutover --
-- this migration is what finally wires it up), and a progression_rules
-- table so stage-advancement requirements are configurable instead of the
-- hardcoded "every track at 100%" that request_stage_promotion (0025)
-- shipped with.

-- ================= milestones =================

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  title text not null,
  description text default '',
  icon text default '',
  level_id uuid references public.levels(id) on delete set null,
  trigger_type text not null check (trigger_type in ('content_assignment_completed', 'stage_completed', 'level_completed', 'manual')),
  -- meaning depends on trigger_type: a content_assignments.id, a stages.id,
  -- a levels.id, or null for 'manual' (admin-awarded, no auto-check).
  trigger_ref_id uuid,
  unlocks jsonb not null default '{}'::jsonb,
  published boolean not null default false,
  order_index int not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index milestones_level_idx on public.milestones (level_id);
create index milestones_trigger_idx on public.milestones (trigger_type, trigger_ref_id);

alter table public.milestones enable row level security;
grant select on public.milestones to authenticated;
create policy milestones_select on public.milestones for select using (auth.uid() is not null);
grant insert, update, delete on public.milestones to authenticated;
create policy milestones_admin_insert on public.milestones for insert with check (public.current_role() = 'admin');
create policy milestones_admin_update on public.milestones for update using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
create policy milestones_admin_delete on public.milestones for delete using (public.current_role() = 'admin');

create table public.member_milestones (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references public.profiles(id) on delete cascade,
  milestone_id uuid not null references public.milestones(id) on delete cascade,
  achieved_at timestamptz not null default now(),
  note text default '',
  awarded_by uuid references public.profiles(id), -- null = auto-awarded by check_member_milestones
  unique (uid, milestone_id)
);
create index member_milestones_uid_idx on public.member_milestones (uid);

alter table public.member_milestones enable row level security;
grant select on public.member_milestones to authenticated;
create policy member_milestones_select on public.member_milestones for select
  using (uid = auth.uid() or public.current_role() = 'admin');
-- no client insert/update/delete grant: written only by check_member_milestones /
-- award_milestone_manual below, both SECURITY DEFINER.

-- ================= compute_level_progress: extracted from 0032 =================
-- Was inlined in get_journey_overview; factored out so check_member_milestones's
-- level_completed check can reuse the exact same definition of "done", the
-- same way compute_track_progress is already shared by get_journey_overview
-- and request_stage_promotion.
create or replace function public.compute_level_progress(p_uid uuid, p_level_id uuid)
returns int
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_total int;
  v_done int;
begin
  with level_reqs as (
    select ca.id, ca.track_id
    from public.content_assignments ca
    join public.stages s on s.id = ca.stage_id
    where s.level_id = p_level_id and ca.scope = 'stage_track' and ca.is_required = true
      and (
        ca.specialization_id is null
        or ca.specialization_id = (
          select mts.specialization_id from public.member_track_specializations mts
          where mts.uid = p_uid and mts.track_id = ca.track_id
        )
      )
  )
  select count(*), count(*) filter (where public.is_content_assignment_done(id, p_uid))
    into v_total, v_done
  from level_reqs;

  if v_total = 0 then
    return 0;
  end if;
  return round((v_done::numeric / v_total) * 100);
end;
$$;

revoke execute on function public.compute_level_progress(uuid, uuid) from public, anon;
grant execute on function public.compute_level_progress(uuid, uuid) to authenticated;

-- get_journey_overview, redefined only to delegate its level-progress block
-- to compute_level_progress above -- no behavior change from 0032.
create or replace function public.get_journey_overview(p_uid uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stage_id uuid;
  v_stage record;
  v_tracks jsonb;
  v_level_id uuid;
  v_level record;
  v_next_level_id uuid;
  v_next_level_key text;
  v_next_level_label text;
  v_level_percent int;
begin
  if not public.can_view_journey(p_uid) then
    raise exception 'permission denied';
  end if;

  select current_stage_id into v_stage_id from public.member_journey where uid = p_uid;

  if v_stage_id is null and p_uid = auth.uid() then
    select id into v_stage_id from public.stages where published = true order by order_index limit 1;
    if v_stage_id is not null then
      insert into public.member_journey (uid, current_stage_id, started_at, updated_at)
      values (p_uid, v_stage_id, now(), now())
      on conflict (uid) do nothing;
    end if;
  end if;

  if v_stage_id is null then
    return jsonb_build_object('stage', null, 'tracks', '[]'::jsonb, 'level', null, 'levelProgressPercent', 0, 'nextLevel', null);
  end if;

  select id, key, title, description, order_index, level_id into v_stage from public.stages where id = v_stage_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'trackId', t.id,
      'key', t.key,
      'label', t.label,
      'icon', t.icon,
      'colorToken', t.color_token,
      'progressPercent', public.compute_track_progress(p_uid, v_stage_id, t.id),
      'specializations', (
        select coalesce(jsonb_agg(
          jsonb_build_object('id', ts.id, 'key', ts.key, 'label', ts.label, 'icon', ts.icon)
          order by ts.order_index
        ), '[]'::jsonb)
        from public.track_specializations ts
        where ts.track_id = t.id and ts.published = true
      ),
      'selectedSpecializationId', (
        select mts.specialization_id from public.member_track_specializations mts
        where mts.uid = p_uid and mts.track_id = t.id
      )
    ) order by t.key
  ), '[]'::jsonb) into v_tracks
  from public.stage_tracks st
  join public.tracks t on t.id = st.track_id
  where st.stage_id = v_stage_id;

  v_level_id := v_stage.level_id;

  if v_level_id is null then
    return jsonb_build_object(
      'stage', jsonb_build_object('id', v_stage.id, 'key', v_stage.key, 'title', v_stage.title, 'description', v_stage.description),
      'tracks', v_tracks,
      'level', null,
      'levelProgressPercent', 0,
      'nextLevel', null
    );
  end if;

  select id, key, label, purpose, outcome, order_index into v_level from public.levels where id = v_level_id;
  v_level_percent := public.compute_level_progress(p_uid, v_level_id);

  select id, key, label into v_next_level_id, v_next_level_key, v_next_level_label
    from public.levels where order_index > v_level.order_index order by order_index limit 1;

  return jsonb_build_object(
    'stage', jsonb_build_object('id', v_stage.id, 'key', v_stage.key, 'title', v_stage.title, 'description', v_stage.description),
    'tracks', v_tracks,
    'level', jsonb_build_object('id', v_level.id, 'key', v_level.key, 'label', v_level.label, 'purpose', v_level.purpose, 'outcome', v_level.outcome, 'orderIndex', v_level.order_index),
    'levelProgressPercent', v_level_percent,
    'nextLevel', case when v_next_level_id is null then null else jsonb_build_object('id', v_next_level_id, 'key', v_next_level_key, 'label', v_next_level_label) end
  );
end;
$$;

-- ================= milestone awarding =================

-- Auto-award engine: checks every published, not-yet-earned milestone whose
-- trigger_type has a computable condition. Called as a side effect of the
-- events that can actually cause one of these to become true (see the
-- bottom of this file) rather than on a timer, same lazy-check idiom as
-- member_journey's auto-start in get_journey_overview. Locked down like
-- finalize_last_week_winners (0026): no direct grant to any role, only
-- reachable via `perform` from other SECURITY DEFINER functions.
create or replace function public.check_member_milestones(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m record;
  v_earned boolean;
begin
  for v_m in
    select * from public.milestones
    where published = true
      and trigger_type in ('content_assignment_completed', 'stage_completed', 'level_completed')
      and not exists (select 1 from public.member_milestones mm where mm.uid = p_uid and mm.milestone_id = milestones.id)
  loop
    v_earned := false;

    if v_m.trigger_type = 'content_assignment_completed' then
      v_earned := v_m.trigger_ref_id is not null and public.is_content_assignment_done(v_m.trigger_ref_id, p_uid);

    elsif v_m.trigger_type = 'stage_completed' then
      v_earned := v_m.trigger_ref_id is not null
        and exists (
          select 1 from public.content_assignments ca2
          where ca2.stage_id = v_m.trigger_ref_id and ca2.scope = 'stage_track' and ca2.is_required = true
        )
        and not exists (
          select 1 from public.content_assignments ca
          where ca.stage_id = v_m.trigger_ref_id and ca.scope = 'stage_track' and ca.is_required = true
            and (
              ca.specialization_id is null
              or ca.specialization_id = (
                select mts.specialization_id from public.member_track_specializations mts
                where mts.uid = p_uid and mts.track_id = ca.track_id
              )
            )
            and not public.is_content_assignment_done(ca.id, p_uid)
        );

    elsif v_m.trigger_type = 'level_completed' then
      v_earned := v_m.trigger_ref_id is not null and public.compute_level_progress(p_uid, v_m.trigger_ref_id) >= 100;
    end if;

    if v_earned then
      insert into public.member_milestones (uid, milestone_id, achieved_at)
      values (p_uid, v_m.id, now())
      on conflict (uid, milestone_id) do nothing;

      insert into public.notifications (uid, type, title, body, link_to)
      values (p_uid, 'milestone_achieved', 'Milestone achieved: ' || v_m.title, coalesce(nullif(v_m.description, ''), 'Nice work.'), '/dashboard');

      insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
      values (p_uid, 'milestone_achieved', 'milestone', v_m.id::text, jsonb_build_object('key', v_m.key));
    end if;
  end loop;
end;
$$;

revoke execute on function public.check_member_milestones(uuid) from public, anon, authenticated;

-- Admin-only: for trigger_type='manual' milestones, or overriding one by
-- hand (e.g. "Develop Emerging Leader", which no query here can compute).
create or replace function public.award_milestone_manual(p_uid uuid, p_milestone_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;

  insert into public.member_milestones (uid, milestone_id, achieved_at, note, awarded_by)
  values (p_uid, p_milestone_id, now(), coalesce(p_note, ''), auth.uid())
  on conflict (uid, milestone_id) do nothing;

  insert into public.notifications (uid, type, title, body, link_to)
  select p_uid, 'milestone_achieved', 'Milestone achieved: ' || m.title, coalesce(nullif(p_note, ''), 'Nice work.'), '/dashboard'
  from public.milestones m where m.id = p_milestone_id;

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'milestone_awarded_manual', 'milestone', p_milestone_id::text, jsonb_build_object('uid', p_uid));
end;
$$;

revoke execute on function public.award_milestone_manual(uuid, uuid, text) from public, anon;
grant execute on function public.award_milestone_manual(uuid, uuid, text) to authenticated;

-- ================= generalized Review for bare content_assignments =================
-- Mirrors assignment_submissions (0001) exactly -- same columns, same
-- upsert-on-resubmit semantics, same admin-only review gate -- but scoped
-- to content_assignments (task_type-tagged bare content) instead of course
-- assignments. Kept as a sibling table rather than merging into
-- assignment_submissions: that table is live, actively queried by
-- ReviewQueue.jsx/grade_assignment(), and a mid-flight rename/merge is a
-- bigger, riskier move than this additive table for the same functional
-- outcome -- an admin sees both queues, the member sees one submit flow
-- per task, and is_content_assignment_done() below is the only place that
-- needs to know both exist.
create table public.content_evidence_submissions (
  id uuid primary key default gen_random_uuid(),
  content_assignment_id uuid not null references public.content_assignments(id) on delete cascade,
  uid uuid not null references public.profiles(id) on delete cascade,
  text_response text default '',
  file_urls text[] default '{}',
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'needs_revision')),
  feedback text default '',
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  submitted_at timestamptz not null default now(),
  unique (content_assignment_id, uid)
);
create index content_evidence_submissions_status_idx on public.content_evidence_submissions (status, submitted_at);

alter table public.content_evidence_submissions enable row level security;
grant select on public.content_evidence_submissions to authenticated;
create policy content_evidence_submissions_select on public.content_evidence_submissions for select
  using (uid = auth.uid() or public.current_role() = 'admin');
-- no client insert/update grant: written only by submit_content_evidence /
-- review_content_evidence below.

create or replace function public.submit_content_evidence(p_content_assignment_id uuid, p_text_response text, p_file_urls text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_content_type text;
  v_requires_approval boolean;
  v_uid uuid := auth.uid();
  v_admin record;
  v_display_name text;
  v_title text;
begin
  if not public.is_active() then
    raise exception 'your account is suspended and can''t submit evidence';
  end if;

  select ci.content_type, ca.requires_admin_approval, coalesce(ci.title, c.title, a.title)
    into v_content_type, v_requires_approval, v_title
    from public.content_assignments ca
    join public.content_items ci on ci.id = ca.content_item_id
    left join public.courses c on c.id = ci.course_id
    left join public.assignments a on a.id = ci.assignment_id
    where ca.id = p_content_assignment_id;

  if v_content_type is null then
    raise exception 'content assignment not found';
  end if;
  if v_content_type <> 'bare' or not coalesce(v_requires_approval, false) then
    raise exception 'this task doesn''t need submitted evidence -- use complete_content_assignment instead';
  end if;
  if not public.content_assignment_unlocked(p_content_assignment_id, v_uid) then
    raise exception 'complete the prerequisite tasks first';
  end if;

  insert into public.content_evidence_submissions (content_assignment_id, uid, text_response, file_urls, status, submitted_at)
  values (p_content_assignment_id, v_uid, coalesce(p_text_response, ''), coalesce(p_file_urls, '{}'), 'submitted', now())
  on conflict (content_assignment_id, uid) do update
    set text_response = excluded.text_response, file_urls = excluded.file_urls,
        status = 'submitted', feedback = '', reviewed_by = null, reviewed_at = null, submitted_at = now();

  select display_name into v_display_name from public.profiles where id = v_uid;

  for v_admin in select id from public.profiles where role = 'admin' loop
    insert into public.notifications (uid, type, title, body, link_to)
    values (
      v_admin.id, 'content_evidence_submitted', 'Evidence submitted for review',
      coalesce(nullif(v_display_name, ''), 'A member') || ' submitted evidence for: ' || coalesce(v_title, 'a task'),
      '/admin/reviews'
    );
  end loop;

  insert into public.activity_log (actor_uid, action, target_type, target_id)
  values (v_uid, 'content_evidence_submitted', 'content_assignment', p_content_assignment_id::text);
end;
$$;

revoke execute on function public.submit_content_evidence(uuid, text, text[]) from public, anon;
grant execute on function public.submit_content_evidence(uuid, text, text[]) to authenticated;

create or replace function public.review_content_evidence(p_submission_id uuid, p_decision text, p_feedback text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_content_assignment_id uuid;
  v_status text;
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;
  if p_decision not in ('approved', 'needs_revision') then
    raise exception 'invalid decision: %', p_decision;
  end if;

  select uid, content_assignment_id, status into v_uid, v_content_assignment_id, v_status
    from public.content_evidence_submissions where id = p_submission_id;
  if v_uid is null then
    raise exception 'submission not found';
  end if;
  if v_status <> 'submitted' then
    raise exception 'this submission has already been reviewed';
  end if;

  update public.content_evidence_submissions
    set status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(), feedback = coalesce(p_feedback, '')
    where id = p_submission_id;

  if p_decision = 'approved' then
    -- the same member_progress row complete_content_assignment would have
    -- written -- is_content_assignment_done()'s 'bare' branch already reads
    -- this table, so no other function needs to know evidence review exists.
    insert into public.member_progress (uid, content_assignment_id, completed_at)
    values (v_uid, v_content_assignment_id, now())
    on conflict (uid, content_assignment_id) do nothing;
  end if;

  insert into public.notifications (uid, type, title, body, link_to)
  values (
    v_uid, 'content_evidence_reviewed',
    case when p_decision = 'approved' then 'Evidence approved' else 'Needs another look' end,
    coalesce(nullif(p_feedback, ''), case when p_decision = 'approved' then 'Your submission was approved.' else 'An admin asked for a revision.' end),
    '/tasks'
  );

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'content_evidence_reviewed', 'content_evidence_submission', p_submission_id::text, jsonb_build_object('decision', p_decision));

  if p_decision = 'approved' then
    perform public.check_member_milestones(v_uid);
  end if;
end;
$$;

revoke execute on function public.review_content_evidence(uuid, text, text) from public, anon;
grant execute on function public.review_content_evidence(uuid, text, text) to authenticated;

-- complete_content_assignment, redefined to refuse self-attestation once
-- requires_admin_approval is set -- this is the actual enforcement of that
-- flag; before this it was captured in the admin UI and otherwise ignored.
create or replace function public.complete_content_assignment(p_content_assignment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_content_type text;
  v_requires_approval boolean;
begin
  if not public.is_active() then
    raise exception 'your account is suspended and can''t complete tasks';
  end if;

  select ci.content_type, ca.requires_admin_approval into v_content_type, v_requires_approval
    from public.content_assignments ca
    join public.content_items ci on ci.id = ca.content_item_id
    where ca.id = p_content_assignment_id;

  if v_content_type is null then
    raise exception 'content assignment not found';
  end if;
  if v_content_type <> 'bare' then
    raise exception 'this task completes automatically once its linked training/assignment is done';
  end if;
  if coalesce(v_requires_approval, false) then
    raise exception 'this task needs submitted evidence -- use submit_content_evidence instead';
  end if;

  if not public.content_assignment_unlocked(p_content_assignment_id, auth.uid()) then
    raise exception 'complete the prerequisite tasks first';
  end if;

  insert into public.member_progress (uid, content_assignment_id, completed_at)
  values (auth.uid(), p_content_assignment_id, now())
  on conflict (uid, content_assignment_id) do nothing;

  insert into public.activity_log (actor_uid, action, target_type, target_id)
  values (auth.uid(), 'content_assignment_completed', 'content_assignment', p_content_assignment_id::text);

  perform public.check_member_milestones(auth.uid());
end;
$$;

-- get_my_content_assignments, redefined only to add requiresAdminApproval +
-- evidenceStatus so TaskList.jsx can render the submit/pending/needs-
-- revision states instead of just isDone.
create or replace function public.get_my_content_assignments(p_uid uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_stage_id uuid;
begin
  if p_uid <> auth.uid() and coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied';
  end if;

  select current_stage_id into v_stage_id from public.member_journey where uid = p_uid;

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
    where
      (ca.scope = 'individual' and ca.assigned_to_uid = p_uid)
      or (
        ca.scope = 'stage_track' and ca.stage_id = v_stage_id
        and (
          ca.specialization_id is null
          or ca.specialization_id = (
            select specialization_id from public.member_track_specializations
            where uid = p_uid and track_id = ca.track_id
          )
        )
      )
  ), '[]'::jsonb);
end;
$$;

-- ================= configurable progression rules =================

create table public.progression_rules (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null check (scope_type in ('stage', 'level')),
  scope_id uuid not null,
  rule_type text not null default 'all_required_tasks' check (rule_type in ('all_required_tasks', 'percent_threshold')),
  threshold_percent int check (threshold_percent between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scope_type, scope_id)
);

alter table public.progression_rules enable row level security;
grant select on public.progression_rules to authenticated;
create policy progression_rules_select on public.progression_rules for select using (auth.uid() is not null);
grant insert, update, delete on public.progression_rules to authenticated;
create policy progression_rules_admin_insert on public.progression_rules for insert with check (public.current_role() = 'admin');
create policy progression_rules_admin_update on public.progression_rules for update using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
create policy progression_rules_admin_delete on public.progression_rules for delete using (public.current_role() = 'admin');

-- request_stage_promotion, redefined only in the per-track check: consults
-- progression_rules for this stage first. No row (the default state for
-- every existing stage) preserves the exact original behavior -- every
-- required track at 100% -- so nothing currently working changes unless an
-- admin explicitly configures a looser rule.
create or replace function public.request_stage_promotion()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_current_stage_id uuid;
  v_current_order int;
  v_to_stage_id uuid;
  v_to_stage_title text;
  v_track record;
  v_track_count int := 0;
  v_track_progress int;
  v_rule_type text;
  v_rule_threshold int;
  v_admin record;
  v_display_name text;
begin
  select current_stage_id into v_current_stage_id from public.member_journey where uid = v_uid;
  if v_current_stage_id is null then
    raise exception 'you have not started your journey yet';
  end if;

  if exists (select 1 from public.stage_promotion_requests where uid = v_uid and status = 'pending') then
    raise exception 'you already have a pending promotion request';
  end if;

  select order_index into v_current_order from public.stages where id = v_current_stage_id;

  select id, title into v_to_stage_id, v_to_stage_title from public.stages
    where published = true and order_index > v_current_order
    order by order_index limit 1;
  if v_to_stage_id is null then
    raise exception 'you are already on the final stage';
  end if;

  select rule_type, threshold_percent into v_rule_type, v_rule_threshold
    from public.progression_rules where scope_type = 'stage' and scope_id = v_current_stage_id;

  for v_track in select track_id from public.stage_tracks where stage_id = v_current_stage_id loop
    v_track_count := v_track_count + 1;
    v_track_progress := public.compute_track_progress(v_uid, v_current_stage_id, v_track.track_id);
    if v_rule_type = 'percent_threshold' then
      if v_track_progress < coalesce(v_rule_threshold, 100) then
        raise exception 'finish more of your current stage before requesting promotion';
      end if;
    else
      if v_track_progress < 100 then
        raise exception 'finish every track in your current stage before requesting promotion';
      end if;
    end if;
  end loop;
  if v_track_count = 0 then
    raise exception 'this stage has no tracks configured';
  end if;

  insert into public.stage_promotion_requests (uid, from_stage_id, to_stage_id, status)
  values (v_uid, v_current_stage_id, v_to_stage_id, 'pending');

  select display_name into v_display_name from public.profiles where id = v_uid;

  for v_admin in select id from public.profiles where role = 'admin' loop
    insert into public.notifications (uid, type, title, body, link_to)
    values (
      v_admin.id, 'stage_promotion_requested', 'Promotion request',
      coalesce(nullif(v_display_name, ''), 'A member') || ' finished every track and is ready for: ' || v_to_stage_title,
      '/admin/members/' || v_uid::text
    );
  end loop;

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (v_uid, 'stage_promotion_requested', 'member_journey', v_uid::text, jsonb_build_object('toStageId', v_to_stage_id));
end;
$$;
