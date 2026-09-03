-- Two additive pieces for the My Goals rework:
--
-- 1. goal_checkins -- lightweight weekly accountability, genuinely new
--    (grepped the whole repo for "checkin"/"check-in"; nothing exists).
--    One per member per ISO week (Monday), upsert on resubmit -- same
--    posture as daily_reports (0094): a member's own reflection, no admin
--    review workflow (this is self-accountability, not a submission
--    queue).
--
-- 2. monthly_goals: + three reflection columns for the month-end review
--    (accomplished / missed / next focus). Additive columns on the
--    existing table rather than a new one -- one row per member per
--    period already exists, this is just three more optional fields on
--    it, no different from how goals/status/admin_comment already live
--    there. Not gated by editable status: reflecting on a month is always
--    allowed, whatever review state the goals themselves are in.

-- ---------- 1. goal_checkins ----------
create table public.goal_checkins (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  whats_working text not null default '',
  whats_slowing text not null default '',
  next_focus text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (uid, week_start)
);
create index goal_checkins_uid_week_idx on public.goal_checkins (uid, week_start desc);

alter table public.goal_checkins enable row level security;
grant select on public.goal_checkins to authenticated;
create policy goal_checkins_select on public.goal_checkins for select
  using (uid = auth.uid() or public.current_role() = 'admin');
-- no client insert/update grant: written only by save_weekly_checkin below.

create or replace function public.save_weekly_checkin(
  p_week_start date, p_whats_working text, p_whats_slowing text, p_next_focus text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  insert into public.goal_checkins (uid, week_start, whats_working, whats_slowing, next_focus)
  values (v_uid, p_week_start, coalesce(p_whats_working, ''), coalesce(p_whats_slowing, ''), coalesce(p_next_focus, ''))
  on conflict (uid, week_start) do update
    set whats_working = excluded.whats_working,
        whats_slowing = excluded.whats_slowing,
        next_focus = excluded.next_focus,
        updated_at = now()
  returning id into v_id;

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (v_uid, 'weekly_checkin_saved', 'goal_checkin', v_id::text, jsonb_build_object('week_start', p_week_start));

  return v_id;
end;
$$;

revoke execute on function public.save_weekly_checkin(date, text, text, text) from public, anon;
grant execute on function public.save_weekly_checkin(date, text, text, text) to authenticated;

-- ---------- 2. monthly_goals: month-end reflection ----------
alter table public.monthly_goals
  add column reflection_accomplished text not null default '',
  add column reflection_missed text not null default '',
  add column reflection_next_focus text not null default '';

create or replace function public.save_month_review(
  p_period text, p_accomplished text, p_missed text, p_next_focus text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  update public.monthly_goals
    set reflection_accomplished = coalesce(p_accomplished, ''),
        reflection_missed = coalesce(p_missed, ''),
        reflection_next_focus = coalesce(p_next_focus, ''),
        updated_at = now()
    where uid = v_uid and period = p_period;

  if not found then
    raise exception 'set your goals for that period before reviewing it';
  end if;

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (v_uid, 'month_review_saved', 'monthly_goals', v_uid::text, jsonb_build_object('period', p_period));
end;
$$;

revoke execute on function public.save_month_review(text, text, text, text) from public, anon;
grant execute on function public.save_month_review(text, text, text, text) to authenticated;
