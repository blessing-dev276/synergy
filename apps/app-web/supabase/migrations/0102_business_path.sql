-- Member-facing Business Path: the business-BUILDING roadmap (Foundation ->
-- Skill Building -> Get to Work -> Build -> Grow -> Lead), deliberately
-- separate from the rank ladder (public.ranks/rank_tasks, surfaced on
-- /rank-journey) -- that's organizational/rank progression; this is a
-- fixed developmental curriculum every member moves through regardless of
-- rank. Nothing like this existed before (grepped the whole repo for
-- "business_path"/"stage"/"milestone" as a member-progress concept --
-- only the rank system and the *admin* "Business Path" builder, which
-- names ranks, came up).
--
-- Content (stages/milestones) is real, seeded rows here -- not hardcoded
-- in the frontend -- so it can eventually move to an admin CRUD page
-- without a data-model change, per the brief's "don't necessarily build
-- full admin tooling now, but structure it so admin can manage this
-- later." Per-member completion is real too: each milestone is either
-- auto-detected from a genuine existing signal (auto_key, evaluated by
-- evaluate_business_path_auto_key below -- onboarding, profile, sponsor,
-- goals, prospecting activity, referrals, daily reports; deliberately NOT
-- a threshold like "5 prospects", since no such number exists anywhere in
-- the app's real business rules) or, where no such signal exists, a plain
-- member self-check (business_path_milestone_completions) -- lighter than
-- rank_tasks' manual-self-report-plus-admin-review flow on purpose: these
-- are personal development checkpoints, not requirements gating an
-- official status change, so they don't need a review queue.

-- ================= stages =================
create table public.business_path_stages (
  id uuid primary key default gen_random_uuid(),
  order_index int not null,
  title text not null,
  purpose text not null default '',
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index business_path_stages_order_uidx on public.business_path_stages (order_index);

alter table public.business_path_stages enable row level security;
grant select on public.business_path_stages to authenticated;
create policy business_path_stages_select on public.business_path_stages for select using (auth.uid() is not null);

-- ================= milestones =================
-- auto_key null = member self-checks it (business_path_milestone_completions);
-- otherwise evaluated live by evaluate_business_path_auto_key, never stored.
create table public.business_path_milestones (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.business_path_stages(id) on delete cascade,
  order_index int not null default 0,
  title text not null,
  description text not null default '',
  auto_key text,
  link_to text,
  link_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.business_path_milestones add constraint business_path_milestones_auto_key_check
  check (auto_key is null or auto_key in (
    'onboarding_completed', 'profile_complete', 'has_sponsor', 'goals_submitted', 'goals_approved',
    'freelancing_skill_chosen', 'has_prospects', 'has_logged_activity', 'has_referral', 'has_daily_report'
  ));
create index business_path_milestones_stage_idx on public.business_path_milestones (stage_id, order_index);

alter table public.business_path_milestones enable row level security;
grant select on public.business_path_milestones to authenticated;
create policy business_path_milestones_select on public.business_path_milestones for select using (auth.uid() is not null);

-- ================= member self-checks (manual milestones only) =================
create table public.business_path_milestone_completions (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid not null references public.business_path_milestones(id) on delete cascade,
  uid uuid not null references public.profiles(id) on delete cascade,
  completed_at timestamptz not null default now(),
  unique (milestone_id, uid)
);

alter table public.business_path_milestone_completions enable row level security;
grant select on public.business_path_milestone_completions to authenticated;
create policy business_path_milestone_completions_select on public.business_path_milestone_completions for select
  using (uid = auth.uid() or public.current_role() = 'admin');
-- no client insert/delete grant: written only by complete_/uncomplete_business_path_milestone below.

create or replace function public.complete_business_path_milestone(p_milestone_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_auto_key text;
begin
  select auto_key into v_auto_key from public.business_path_milestones where id = p_milestone_id;
  if not found then
    raise exception 'milestone not found';
  end if;
  if v_auto_key is not null then
    raise exception 'this milestone is tracked automatically -- there''s nothing to check off';
  end if;

  insert into public.business_path_milestone_completions (milestone_id, uid)
  values (p_milestone_id, v_uid)
  on conflict (milestone_id, uid) do nothing;

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (v_uid, 'business_path_milestone_completed', 'business_path_milestone', p_milestone_id::text, '{}'::jsonb);
end;
$$;

revoke execute on function public.complete_business_path_milestone(uuid) from public, anon;
grant execute on function public.complete_business_path_milestone(uuid) to authenticated;

-- Self-reported, so a member can correct a mistaken check the same way
-- they made it -- no admin involvement needed either direction.
create or replace function public.uncomplete_business_path_milestone(p_milestone_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.business_path_milestone_completions
    where milestone_id = p_milestone_id and uid = auth.uid();
end;
$$;

revoke execute on function public.uncomplete_business_path_milestone(uuid) from public, anon;
grant execute on function public.uncomplete_business_path_milestone(uuid) to authenticated;

-- ================= auto-detection: one real signal per key =================
-- Internal only (same posture as compute_profile_health_percent/
-- count_prospects_added_today etc.) -- takes an arbitrary p_uid with no
-- ownership check, only ever called from get_my_business_path below.
create or replace function public.evaluate_business_path_auto_key(p_uid uuid, p_auto_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result boolean;
begin
  case p_auto_key
    when 'onboarding_completed' then
      select coalesce((onboarding ->> 'completed')::boolean, false) into v_result from public.profiles where id = p_uid;
    when 'profile_complete' then
      v_result := public.compute_profile_health_percent(p_uid) >= 100;
    when 'has_sponsor' then
      select exists(select 1 from public.sponsor_relationships where member_uid = p_uid and active = true) into v_result;
    when 'goals_submitted' then
      v_result := public.has_ever_submitted_goals(p_uid);
    when 'goals_approved' then
      select exists(select 1 from public.monthly_goals where uid = p_uid and status = 'approved') into v_result;
    when 'freelancing_skill_chosen' then
      select coalesce(jsonb_array_length(coalesce(onboarding -> 'skills', '[]'::jsonb)) > 0, false) into v_result
        from public.profiles where id = p_uid;
    when 'has_prospects' then
      select exists(select 1 from public.prospects where owner_uid = p_uid) into v_result;
    when 'has_logged_activity' then
      select exists(select 1 from public.prospect_activities where uid = p_uid) into v_result;
    when 'has_referral' then
      v_result := public.count_personally_sponsored(p_uid) > 0;
    when 'has_daily_report' then
      select exists(select 1 from public.daily_reports where uid = p_uid) into v_result;
    else
      v_result := false;
  end case;
  return coalesce(v_result, false);
end;
$$;

revoke execute on function public.evaluate_business_path_auto_key(uuid, text) from public, anon, authenticated;

-- ================= member: the whole path, real progress, one call =================
create or replace function public.get_my_business_path()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id,
      'orderIndex', s.order_index,
      'title', s.title,
      'purpose', s.purpose,
      'description', s.description,
      'milestones', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', m.id,
          'title', m.title,
          'description', m.description,
          'autoKey', m.auto_key,
          'linkTo', m.link_to,
          'linkLabel', m.link_label,
          'done', case when m.auto_key is not null
            then public.evaluate_business_path_auto_key(v_uid, m.auto_key)
            else exists(
              select 1 from public.business_path_milestone_completions c
              where c.milestone_id = m.id and c.uid = v_uid
            )
          end,
          'completedAt', (
            select c.completed_at from public.business_path_milestone_completions c
            where c.milestone_id = m.id and c.uid = v_uid
          )
        ) order by m.order_index)
        from public.business_path_milestones m
        where m.stage_id = s.id
      ), '[]'::jsonb)
    ) order by s.order_index)
    from public.business_path_stages s
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.get_my_business_path() from public, anon;
grant execute on function public.get_my_business_path() to authenticated;

-- ================= seed: the six stages, per the product brief =================
insert into public.business_path_stages (order_index, title, purpose, description) values
  (1, 'Foundation', 'Understand the business and build your foundation.',
    'Get oriented, set up your profile, connect with your sponsor, and set your first goals.'),
  (2, 'Skill Building', 'Develop a valuable skill that can be turned into an opportunity.',
    'Build real ability in the skill you chose, from fundamentals to your first portfolio pieces.'),
  (3, 'Get to Work', 'Turn learning into real-world action.',
    'Learning alone does not build a business — put your skill and knowledge to work.'),
  (4, 'Build', 'Build consistent activity and begin creating a real customer/client/network base.',
    'Turn one-off actions into a repeatable system — prospects, follow-ups, and offers you can rely on.'),
  (5, 'Grow', 'Improve consistency, systems, results, and business maturity.',
    'Move from figuring it out to having a system — and making that system better.'),
  (6, 'Lead', 'Develop the ability to help other people learn, work, build, and grow.',
    'Bring others along — sponsor, support, and train the next person coming up behind you.');

insert into public.business_path_milestones (stage_id, order_index, title, description, auto_key, link_to, link_label)
select s.id, v.order_index, v.title, v.description, v.auto_key, v.link_to, v.link_label
from public.business_path_stages s
join (values
  -- Foundation
  (1, 1, 'Complete Synergy orientation', 'Finish the orientation content every new member gets.', 'onboarding_completed', '/onboarding', null),
  (1, 2, 'Complete your profile', 'Add your photo, bio, and Whys/goals so your profile is fully set up.', 'profile_complete', '/profile', 'Profile'),
  (1, 3, 'Connect with your sponsor', 'Get paired with the sponsor who''ll support you.', 'has_sponsor', '/network', 'My Network'),
  (1, 4, 'Set your first monthly goals', 'Set targets across Skill, Freelancing, Network Marketing, and Personal.', 'goals_submitted', '/goals', 'My Goals'),
  (1, 5, 'Choose your primary skill path', 'Pick the Freelancing skill you''ll focus on first.', 'freelancing_skill_chosen', '/learning', 'Learning Hub'),
  -- Skill Building
  (2, 1, 'Complete your skill''s foundation lessons', 'Work through the core lessons for the skill you chose.', null, '/learning', 'Learning Hub'),
  (2, 2, 'Complete practical projects', 'Apply what you''re learning to hands-on practice work.', null, '/learning', 'Learning Hub'),
  (2, 3, 'Create your first portfolio piece', 'Put together something real you can show a client.', null, '/learning', 'Learning Hub'),
  (2, 4, 'Demonstrate skill competency', 'Show you can reliably do the work, not just follow along.', null, '/tasks', 'Tasks'),
  -- Get to Work
  (3, 1, 'Complete product knowledge training', 'Know what you''re representing well enough to talk about it.', null, '/learning', 'Learning Hub'),
  (3, 2, 'Start prospecting conversations', 'Add your first prospects and start real conversations.', 'has_prospects', '/network', 'My Network'),
  (3, 3, 'Log your first follow-up', 'Record a real follow-up with a prospect.', 'has_logged_activity', '/network', 'My Network'),
  (3, 4, 'Submit your first freelancing proposal', 'Put together and send a real proposal.', null, '/learning', 'Learning Hub'),
  (3, 5, 'Stay on top of your daily tasks', 'Keep up with what''s assigned on Tasks.', null, '/tasks', 'Tasks'),
  -- Build
  (4, 1, 'Complete your first business activity cycle', 'Run through a full prospect-to-follow-up cycle at least once.', null, '/network', 'My Network'),
  (4, 2, 'Build your prospect list', 'Keep adding real people to follow up with.', null, '/network', 'My Network'),
  (4, 3, 'Build a reliable follow-up process', 'Make following up a habit, not an afterthought.', null, '/network', 'My Network'),
  (4, 4, 'Create or improve your offer', 'Sharpen what you''re actually offering clients or prospects.', null, '/learning', 'Learning Hub'),
  (4, 5, 'Reach your first client or business milestone', 'Land your first real client, sale, or sign-up.', null, '/goals', 'My Goals'),
  -- Grow
  (5, 1, 'Get a monthly goals review approved', 'Have an admin review and approve a month of goals.', 'goals_approved', '/goals', 'My Goals'),
  (5, 2, 'Improve your follow-up system', 'Refine how and when you follow up based on what''s working.', null, '/network', 'My Network'),
  (5, 3, 'Strengthen your personal brand', 'Make your profile and presence reflect where you are now.', null, '/profile', 'Profile'),
  (5, 4, 'Complete a monthly review cycle', 'Do a real check-in on what worked and what didn''t.', null, '/goals', 'My Goals'),
  -- Lead
  (6, 1, 'Personally sponsor a new member', 'Bring someone new into your team.', 'has_referral', '/network', 'My Network'),
  (6, 2, 'Support your team''s development', 'Help someone on your team with their own next step.', null, '/network', 'My Network'),
  (6, 3, 'Complete leadership training', 'Work through the leadership/coaching content in the Learning Hub.', null, '/learning', 'Learning Hub'),
  (6, 4, 'Keep a consistent reporting habit', 'Submit a real daily report at least once.', 'has_daily_report', '/reports', 'Reports')
) as v(stage_order, order_index, title, description, auto_key, link_to, link_label)
  on s.order_index = v.stage_order;
