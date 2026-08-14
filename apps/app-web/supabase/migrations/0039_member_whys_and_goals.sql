-- Product decision: drop the fixed-enum "What do you want to achieve?" step
-- from signup (apps/app-web/src/pages/onboarding/OnboardingFlow.jsx) --
-- replaced by two richer, member-authored concepts that live on the Profile
-- page instead, filled in after signup rather than blocking it:
--   - member_whys: up to 20 freeform "why I joined the business" reasons
--   - member_goals: this month's structured targets (income, team size,
--     reward tools, target rank)
-- profiles.onboarding.goals (the old string[] written by OnboardingFlow/
-- Profile) is left in place as an unused legacy key on existing rows --
-- no data migration needed, the frontend just stops writing/reading it.
--
-- Neither table is wired into onboarding.completed/OnboardingGate.jsx --
-- that gate stays a signup-time thing (bio + interests). "Profile health"
-- (whether whys/goals are filled in) is a separate, non-blocking concept
-- computed by the frontend (src/lib/profileHealth.js) so members can use
-- the app immediately after signup and fill these in later.

-- ---------- member_whys: add-and-remove-only list, capped at 20 ----------
create table public.member_whys (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references public.profiles(id) on delete cascade,
  text text not null check (length(trim(text)) > 0),
  order_index int not null default 0,
  created_at timestamptz not null default now()
);
create index member_whys_uid_idx on public.member_whys (uid, order_index);

create or replace function public.enforce_member_whys_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (select count(*) from public.member_whys where uid = new.uid) >= 20 then
    raise exception 'you can add at most 20 whys';
  end if;
  return new;
end;
$$;

create trigger member_whys_limit_check
  before insert on public.member_whys
  for each row execute function public.enforce_member_whys_limit();

alter table public.member_whys enable row level security;
grant select, insert, delete on public.member_whys to authenticated;
create policy member_whys_select on public.member_whys for select
  using (uid = auth.uid() or public.current_role() = 'admin');
create policy member_whys_insert on public.member_whys for insert
  with check (uid = auth.uid());
create policy member_whys_delete on public.member_whys for delete
  using (uid = auth.uid());

-- ---------- member_goals: this month's targets, one row per member ----------
-- target_rank_id points at the live `ranks` ladder (Newbie/Pro/Distributor/…,
-- see 0032/0037 -- what the Dashboard already shows as the member's rank),
-- not the disconnected `compensation_ranks` table (0035, deliberately retired
-- from the journey engine).
create table public.member_goals (
  uid uuid primary key references public.profiles(id) on delete cascade,
  monthly_income_goal numeric,
  team_size_goal int,
  reward_tools text[] not null default '{}',
  target_rank_id uuid references public.ranks(id),
  updated_at timestamptz not null default now()
);

alter table public.member_goals enable row level security;
grant select, insert, update on public.member_goals to authenticated;
create policy member_goals_select on public.member_goals for select
  using (uid = auth.uid() or public.current_role() = 'admin');
create policy member_goals_insert on public.member_goals for insert
  with check (uid = auth.uid());
create policy member_goals_update on public.member_goals for update
  using (uid = auth.uid()) with check (uid = auth.uid());
