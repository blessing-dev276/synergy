-- Two behavior changes requested together, plus one bug this surfaced:
--
-- 1. Learning Hub visibility tightens from "a path with no rank attached is
--    visible to everyone" to "a member only ever sees paths attached to
--    their own current rank." The previous rule existed so the Learning Hub
--    wasn't empty before an admin configured anything (0059/0060) -- now
--    that every member is guaranteed a rank (point 2 below), that fallback
--    is no longer needed and is removed.
--
-- 2. New members are assigned the lowest-order_index rank at signup,
--    instead of staying rank_id = null until an admin manually assigns one
--    -- mirrors the old journey system's auto-assign-first-stage-on-signup
--    (0036), same "earliest by order_index" rule, just against `ranks`
--    instead of `stages`.
--
-- 3. Bug found while making change 2: handle_new_user's live body (last
--    redefined in 0053, for Business Path v1) still selects from
--    `business_path_stages` and inserts into `member_business_path_stage`
--    -- both dropped by 0058 when v1 was scrapped for the rank-based v2
--    redesign. Every signup since 0058 applied has been throwing
--    "relation does not exist" inside this trigger and failing outright.
--    Rewritten here against `ranks`/`profiles.rank_id` as part of the same
--    change, since it's the same code path.

-- ================= 1. tighten Learning Hub visibility =================
-- Same signature/name as 0047/0053/0060's redefinitions -- CREATE OR REPLACE
-- preserves existing grants, no new revoke/grant needed.
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
  v_path text;
begin
  select rank_id, coalesce(participation_path, 'full') into v_rank_id, v_path
    from public.profiles where id = v_uid;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', lp.id,
      'title', lp.title,
      'description', lp.description,
      'courseCount', lp.course_count,
      'section', lp.section
    ) order by lp.order_index)
    from public.learning_paths lp
    where lp.published = true
      and (v_path <> 'network_marketing_only' or not lp.is_skill)
      -- No more "unattached = visible to all" fallback: a path only shows
      -- up if it's explicitly attached to the caller's own rank. A member
      -- with no rank (shouldn't happen going forward, see below) sees none.
      and exists (
        select 1 from public.rank_learning_paths rlp
        where rlp.learning_path_id = lp.id and rlp.rank_id = v_rank_id
      )
  ), '[]'::jsonb);
end;
$$;

-- ================= 2 + 3. first-rank-on-signup, and fix the broken trigger =================
-- Same signature/name as 0003's original -- CREATE OR REPLACE preserves
-- existing grants; trigger on_auth_user_created (0003) already points at
-- this function by name, no need to redeclare it.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sponsor_uid uuid;
  v_claimed_name text;
  v_first_rank_id uuid;
begin
  begin
    v_sponsor_uid := nullif(new.raw_user_meta_data->>'sponsor_uid', '')::uuid;
  exception when others then
    v_sponsor_uid := null;
  end;

  if v_sponsor_uid is not null and not exists (
    select 1 from public.profiles where id = v_sponsor_uid and status = 'active'
  ) then
    v_sponsor_uid := null;
  end if;

  v_claimed_name := nullif(trim(new.raw_user_meta_data->>'claimed_sponsor_name'), '');

  select id into v_first_rank_id from public.ranks order by order_index limit 1;

  insert into public.profiles (id, display_name, email, sponsor_uid, whatsapp_number, status, rank_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', ''),
    new.email,
    v_sponsor_uid,
    coalesce(new.raw_user_meta_data->>'whatsapp_number', ''),
    'pending',
    v_first_rank_id
  )
  on conflict (id) do nothing;

  if v_sponsor_uid is not null then
    insert into public.sponsor_relationships (member_uid, sponsor_uid, source, active, assigned_at)
    values (new.id, v_sponsor_uid, 'signup', true, now());
  elsif v_claimed_name is not null then
    insert into public.sponsor_requests (member_uid, claimed_sponsor_name, status)
    values (new.id, v_claimed_name, 'pending');
  end if;

  return new;
end;
$$;

-- Backstop for every profile that predates this migration (i.e. everyone up
-- to now, since rank assignment was previously admin-only/manual) -- without
-- this, change 1 above would leave every existing member looking at an
-- empty Learning Hub the moment this ships. Same rule as new signups: the
-- lowest-order_index rank. No-op if no rank exists yet.
update public.profiles
  set rank_id = (select id from public.ranks order by order_index limit 1)
  where rank_id is null
    and exists (select 1 from public.ranks);
