-- Monthly goal-setting. Today the only "goals" concept is a one-time
-- onboarding picklist (profiles.onboarding.goals) captured once at signup --
-- no recurring cycle, no categories, no admin review. This adds a real
-- monthly submit -> review -> track-progress loop, one row per member per
-- period ('YYYY-MM'), with four categories matching the spec (skill,
-- freelancing, network_marketing, personal). Each category is a jsonb array
-- of {text, target, progress, done} items -- flexible enough for both
-- countable goals ("Prospect 100 people", target=100) and simple checklist
-- goals ("Attend all required training", target=null).
--
-- Writes are RPC-only (no client insert/update grant), same lockdown
-- reasoning as member_progress/content_evidence_submissions (0027/0033):
-- status transitions (draft -> submitted -> approved/needs_revision) must be
-- server-enforced, not trusted from the client.

create table public.monthly_goals (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references public.profiles(id) on delete cascade,
  period text not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  goals jsonb not null default '{"skill": [], "freelancing": [], "network_marketing": [], "personal": []}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'needs_revision')),
  admin_comment text default '',
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (uid, period)
);
create index monthly_goals_period_status_idx on public.monthly_goals (period, status);

alter table public.monthly_goals enable row level security;
grant select on public.monthly_goals to authenticated;
create policy monthly_goals_select on public.monthly_goals for select
  using (uid = auth.uid() or public.current_role() = 'admin');
-- no client insert/update grant: written only by the RPCs below.

-- ---------- member: create/edit a draft (or a needs_revision set being reworked) ----------
create or replace function public.save_my_goals(p_period text, p_goals jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
begin
  if jsonb_typeof(p_goals) <> 'object' then
    raise exception 'goals must be a jsonb object keyed by category';
  end if;

  select status into v_status from public.monthly_goals where uid = v_uid and period = p_period;

  if v_status is not null and v_status not in ('draft', 'needs_revision') then
    raise exception 'you can only edit goals while they are a draft or need revision';
  end if;

  insert into public.monthly_goals (uid, period, goals, status, updated_at)
  values (v_uid, p_period, p_goals, 'draft', now())
  on conflict (uid, period) do update
    set goals = excluded.goals, status = 'draft', updated_at = now();
end;
$$;

revoke execute on function public.save_my_goals(text, jsonb) from public, anon;
grant execute on function public.save_my_goals(text, jsonb) to authenticated;

-- ---------- member: submit for admin review ----------
create or replace function public.submit_my_goals(p_period text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
begin
  select status into v_status from public.monthly_goals where uid = v_uid and period = p_period;
  if v_status is null then
    raise exception 'save your goals before submitting them';
  end if;
  if v_status not in ('draft', 'needs_revision') then
    raise exception 'these goals have already been submitted';
  end if;

  update public.monthly_goals
    set status = 'submitted', submitted_at = now(), updated_at = now()
    where uid = v_uid and period = p_period;

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (v_uid, 'monthly_goals_submitted', 'monthly_goals', v_uid::text, jsonb_build_object('period', p_period));
end;
$$;

revoke execute on function public.submit_my_goals(text) from public, anon;
grant execute on function public.submit_my_goals(text) to authenticated;

-- ---------- member: update progress on one goal item, any time regardless of review status ----------
create or replace function public.update_goal_progress(p_period text, p_category text, p_index int, p_progress int, p_done boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_item jsonb;
begin
  if p_category not in ('skill', 'freelancing', 'network_marketing', 'personal') then
    raise exception 'invalid goal category: %', p_category;
  end if;

  select goals -> p_category -> p_index into v_item from public.monthly_goals where uid = v_uid and period = p_period;
  if v_item is null then
    raise exception 'goal item not found';
  end if;

  update public.monthly_goals
    set goals = jsonb_set(
          goals,
          array[p_category, p_index::text],
          v_item || jsonb_build_object('progress', p_progress, 'done', coalesce(p_done, false)),
          false
        ),
        updated_at = now()
    where uid = v_uid and period = p_period;
end;
$$;

revoke execute on function public.update_goal_progress(text, text, int, int, boolean) from public, anon;
grant execute on function public.update_goal_progress(text, text, int, int, boolean) to authenticated;

-- ---------- admin: approve or send back for revision ----------
create or replace function public.review_member_goals(p_uid uuid, p_period text, p_decision text, p_comment text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;
  if p_decision not in ('approved', 'needs_revision') then
    raise exception 'invalid decision: %', p_decision;
  end if;

  select status into v_status from public.monthly_goals where uid = p_uid and period = p_period;
  if v_status is null then
    raise exception 'this member has not set goals for that period';
  end if;
  if v_status <> 'submitted' then
    raise exception 'these goals are not awaiting review';
  end if;

  update public.monthly_goals
    set status = p_decision, admin_comment = coalesce(p_comment, ''), reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
    where uid = p_uid and period = p_period;

  insert into public.notifications (uid, type, title, body, link_to)
  values (
    p_uid,
    case when p_decision = 'approved' then 'monthly_goals_approved' else 'monthly_goals_needs_revision' end,
    case when p_decision = 'approved' then 'Your goals were approved' else 'Your goals need a revision' end,
    coalesce(nullif(p_comment, ''), case when p_decision = 'approved' then 'Nice work setting real targets.' else 'An admin asked for changes to your goals.' end),
    '/goals'
  );

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'monthly_goals_reviewed', 'monthly_goals', p_uid::text, jsonb_build_object('period', p_period, 'decision', p_decision));
end;
$$;

revoke execute on function public.review_member_goals(uuid, text, text, text) from public, anon;
grant execute on function public.review_member_goals(uuid, text, text, text) to authenticated;

-- ---------- admin: who has/hasn't set goals for a period ----------
create or replace function public.get_admin_goal_overview(p_period text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'uid', p.id,
      'displayName', p.display_name,
      'photoUrl', p.photo_url,
      'status', coalesce(mg.status, 'not_started'),
      'itemCount', case when mg.goals is null then 0 else
        jsonb_array_length(coalesce(mg.goals->'skill', '[]'::jsonb))
        + jsonb_array_length(coalesce(mg.goals->'freelancing', '[]'::jsonb))
        + jsonb_array_length(coalesce(mg.goals->'network_marketing', '[]'::jsonb))
        + jsonb_array_length(coalesce(mg.goals->'personal', '[]'::jsonb))
      end,
      'submittedAt', mg.submitted_at
    ) order by p.display_name)
    from public.profiles p
    left join public.monthly_goals mg on mg.uid = p.id and mg.period = p_period
    where p.role = 'member' and p.status = 'active'
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.get_admin_goal_overview(text) from public, anon;
grant execute on function public.get_admin_goal_overview(text) to authenticated;
