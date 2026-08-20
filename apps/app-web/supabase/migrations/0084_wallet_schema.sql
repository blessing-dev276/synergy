-- Member Wallet, part 1 of 2: schema + RLS. A member currently has no way
-- to see their income/withdrawals/savings in one place and no way to
-- request money -- the only existing money feature is earnings_logs
-- (self-report an earning, admin verifies it, 0026/0048), which feeds the
-- Leaderboard's Top Earner board and nothing else. That table is untouched
-- here and stays the read-only source of truth for "Income" -- everything
-- below is new: withdrawal requests, a member-managed Naira savings bucket,
-- and an admin-configurable per-rank tiered withdrawal-request limit.
--
-- Product rules (confirmed with the client before writing this):
--   - The tier bracket is driven by NET amount actually paid out lifetime
--     ("how much they receive in bank after all charges"), not gross
--     earnings and not a live balance.
--   - Two fully separate balances (USD and NGN), never auto-converted --
--     but a payout that DOES cross currencies (a USD earning paid out in
--     Naira) records the USD amount, the NGN amount, and the rate used,
--     for transparency.
--   - The tier rule is admin-configurable per rank, not global.

-- ---------- withdrawal_requests: a member's request + the eventual payout record ----------
-- Three-state lifecycle (pending -> paid | rejected), not four -- there's
-- no separate "approved" limbo state. The admin's payout entry (net
-- amount/currency/charges/rate) *is* the decision, same single-step
-- pending->verified/rejected shape review_earning (0026) already uses.
create table public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references public.profiles(id) on delete cascade,
  requested_amount numeric(12,2) not null check (requested_amount > 0),
  requested_currency text not null check (requested_currency in ('USD', 'NGN')),
  status text not null default 'pending' check (status in ('pending', 'paid', 'rejected')),
  -- Null until paid -- the actual payout record, filled in by review_withdrawal_request.
  net_amount numeric(12,2),
  net_currency text check (net_currency in ('USD', 'NGN')),
  charges_amount numeric(12,2) not null default 0 check (charges_amount >= 0),
  -- NGN per 1 USD -- required only when net_currency = 'NGN' (a USD payout
  -- needs no rate at all). Stored on the request itself, not looked up
  -- later, so the rate actually used stays fixed to this specific payout
  -- even if the reference rate (wallet_settings, below) changes afterward.
  exchange_rate numeric(12,4),
  -- The tier-bracket input: = net_amount when net_currency = 'USD', else
  -- net_amount / exchange_rate. Computed and stored (not derived on read)
  -- so a member's cumulative-withdrawn sum is a plain, indexable column
  -- sum rather than a per-row conversion at query time.
  usd_equivalent numeric(12,2),
  note text default '',
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text default '',
  created_at timestamptz not null default now()
);
-- At most one pending request per member at a time -- same pattern
-- sponsor_requests/participation_path_requests already use.
create unique index withdrawal_requests_uid_pending_uidx on public.withdrawal_requests (uid) where (status = 'pending');
create index withdrawal_requests_uid_idx on public.withdrawal_requests (uid, created_at desc);
create index withdrawal_requests_status_idx on public.withdrawal_requests (status, created_at desc);

alter table public.withdrawal_requests enable row level security;
grant select on public.withdrawal_requests to authenticated;
create policy withdrawal_requests_select on public.withdrawal_requests for select
  using (uid = auth.uid() or public.current_role() = 'admin');
-- no client insert/update grant: written only by request_withdrawal /
-- review_withdrawal_request (0085).

-- ---------- savings_entries: a member's own Naira bucket ----------
-- Not a real fund movement across the platform boundary -- it's a member
-- voluntarily re-labeling money they already withdrew as "set aside",
-- purely for their own tracking. No admin review needed, unlike a
-- withdrawal request.
create table public.savings_entries (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references public.profiles(id) on delete cascade,
  amount numeric(12,2) not null check (amount <> 0), -- NGN; positive = deposit, negative = drawn back out
  note text default '',
  created_at timestamptz not null default now()
);
create index savings_entries_uid_idx on public.savings_entries (uid, created_at desc);

alter table public.savings_entries enable row level security;
grant select on public.savings_entries to authenticated;
create policy savings_entries_select on public.savings_entries for select
  using (uid = auth.uid() or public.current_role() = 'admin');
-- no client insert grant: written only by log_savings_entry (0085).

-- ---------- rank_withdrawal_tiers: admin-configured bands per rank ----------
-- "If this member's lifetime net-withdrawn (USD-equivalent) falls in
-- [min, max), they can request at most `request_cap_amount` per request."
-- max_withdrawn_usd is nullable -- null means an open-ended top band, so
-- an admin's highest-trust tier never silently runs out.
create table public.rank_withdrawal_tiers (
  id uuid primary key default gen_random_uuid(),
  rank_id uuid not null references public.ranks(id) on delete cascade,
  min_withdrawn_usd numeric(12,2) not null default 0 check (min_withdrawn_usd >= 0),
  max_withdrawn_usd numeric(12,2) check (max_withdrawn_usd is null or max_withdrawn_usd > min_withdrawn_usd),
  request_cap_amount numeric(12,2) not null check (request_cap_amount > 0),
  request_cap_currency text not null check (request_cap_currency in ('USD', 'NGN')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index rank_withdrawal_tiers_rank_idx on public.rank_withdrawal_tiers (rank_id, min_withdrawn_usd);

alter table public.rank_withdrawal_tiers enable row level security;
grant select on public.rank_withdrawal_tiers to authenticated;
-- Same fully-open-read convention ranks/rank_learning_paths/rank_tasks
-- already use (every member can already see every OTHER rank's tasks and
-- attached paths today) -- kept consistent rather than special-casing
-- this one table to be more private than everything else it sits
-- alongside in the same admin builder.
create policy rank_withdrawal_tiers_select on public.rank_withdrawal_tiers for select
  using (auth.uid() is not null);
-- no client insert/update/delete grant: written only by
-- admin_set_rank_withdrawal_tiers (0085).

-- ---------- wallet_settings: singleton reference exchange rate ----------
-- Same id boolean primary key default true check (id) singleton shape
-- progress_weights (0008) already established for "exactly one settings
-- row". Used only to compare a withdrawal request against a tier cap when
-- the two are denominated in different currencies -- the ACTUAL payout
-- conversion always uses whatever real rate the admin enters on that
-- specific request (exchange_rate above), never this one.
create table public.wallet_settings (
  id boolean primary key default true check (id),
  usd_to_ngn_reference_rate numeric(12,4), -- null until an admin sets it
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
insert into public.wallet_settings (id) values (true);

alter table public.wallet_settings enable row level security;
grant select on public.wallet_settings to authenticated;
create policy wallet_settings_select on public.wallet_settings for select
  using (auth.uid() is not null);
-- Deliberately no client update grant, unlike progress_weights' direct-
-- RLS-update convention: this number gates real money decisions, so
-- writes go through admin_set_wallet_reference_rate (0085) for an
-- activity_log audit trail instead.
