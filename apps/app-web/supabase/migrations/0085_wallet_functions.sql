-- Member Wallet, part 2 of 2: RPCs. Mirrors this codebase's established
-- request/review shape (submit_rank_task/review_rank_task_submission,
-- 0063) for the exact same reasons those already exist: no client insert/
-- update grant on the tables in 0084, every write goes through a
-- SECURITY DEFINER function that validates, writes a notification, and
-- writes an activity_log row.

-- ---------- member: request a withdrawal ----------
-- Two independent gates, both must clear:
--   1. Remaining balance (income minus everything already paid out) --
--      not just a tier ceiling: nothing else stopped a member from
--      requesting money they haven't actually earned.
--   2. The rank's tiered cap (0084's rank_withdrawal_tiers), based on
--      lifetime net-withdrawn (USD-equivalent) -- see the "highest-min
--      band you qualify for" comment below for how the edge cases
--      (below the lowest tier, above the highest) resolve for free.
-- Cross-currency comparisons (request vs. remaining, request vs. a cap in
-- the other currency) use wallet_settings' reference rate and HARD-FAIL if
-- it isn't set -- silently skipping the check would let a member bypass
-- their cap just by requesting in whichever currency has no rate.
create or replace function public.request_withdrawal(p_amount numeric, p_currency text, p_note text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rank_id uuid;
  v_income_total numeric;
  v_withdrawn_total numeric;
  v_remaining numeric;
  v_reference_rate numeric;
  v_request_usd numeric;
  v_cap_amount numeric;
  v_cap_currency text;
  v_cap_in_request_currency numeric;
  v_id uuid;
  v_display_name text;
  v_admin record;
begin
  if p_currency not in ('USD', 'NGN') then
    raise exception 'invalid currency: %', p_currency;
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'enter an amount greater than zero';
  end if;
  if exists (select 1 from public.withdrawal_requests where uid = v_uid and status = 'pending') then
    raise exception 'you already have a pending withdrawal request';
  end if;

  select rank_id into v_rank_id from public.profiles where id = v_uid;

  select coalesce(sum(amount), 0) into v_income_total
    from public.earnings_logs where uid = v_uid and status = 'verified';
  select coalesce(sum(usd_equivalent), 0) into v_withdrawn_total
    from public.withdrawal_requests where uid = v_uid and status = 'paid';
  v_remaining := v_income_total - v_withdrawn_total;

  select usd_to_ngn_reference_rate into v_reference_rate from public.wallet_settings where id = true;

  if p_currency = 'USD' then
    v_request_usd := p_amount;
  else
    if v_reference_rate is null then
      raise exception 'no reference exchange rate has been set yet -- ask an admin to set one before requesting in NGN';
    end if;
    v_request_usd := p_amount / v_reference_rate;
  end if;

  if v_request_usd > v_remaining then
    raise exception 'that''s more than your remaining balance';
  end if;

  -- The highest-min tier this member's lifetime net-withdrawn total
  -- qualifies for. No row found means uncapped -- either the rank has no
  -- tiers configured at all, or the member's cumulative sits below the
  -- lowest configured band (a brand-new member's cumulative is 0; if that
  -- were blocked, nobody could ever place a first withdrawal to start
  -- accumulating history -- the admin's payout decision remains the real
  -- backstop either way). A cumulative total past the highest band's max
  -- still resolves here too, to that same top band, since it's still the
  -- highest-min band that qualifies -- no separate "above the ceiling"
  -- case to handle.
  select request_cap_amount, request_cap_currency
    into v_cap_amount, v_cap_currency
    from public.rank_withdrawal_tiers
    where rank_id = v_rank_id and min_withdrawn_usd <= v_withdrawn_total
    order by min_withdrawn_usd desc
    limit 1;

  if v_cap_currency is not null then
    if v_cap_currency = p_currency then
      v_cap_in_request_currency := v_cap_amount;
    else
      if v_reference_rate is null then
        raise exception 'no reference exchange rate has been set yet -- ask an admin to set one before requesting in %', p_currency;
      end if;
      v_cap_in_request_currency := case
        when p_currency = 'NGN' then v_cap_amount * v_reference_rate -- cap in USD, request in NGN
        else v_cap_amount / v_reference_rate                        -- cap in NGN, request in USD
      end;
    end if;
    if p_amount > v_cap_in_request_currency then
      raise exception 'your current tier allows at most % % per request', v_cap_amount, v_cap_currency;
    end if;
  end if;

  insert into public.withdrawal_requests (uid, requested_amount, requested_currency, note)
  values (v_uid, p_amount, p_currency, coalesce(p_note, ''))
  returning id into v_id;

  select display_name into v_display_name from public.profiles where id = v_uid;

  for v_admin in select id from public.profiles where role = 'admin' loop
    insert into public.notifications (uid, type, title, body, link_to)
    values (
      v_admin.id, 'withdrawal_requested', 'Withdrawal request submitted',
      coalesce(nullif(v_display_name, ''), 'A member') || ' requested ' || p_amount || ' ' || p_currency || '.',
      '/admin/submissions'
    );
  end loop;

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (v_uid, 'withdrawal_requested', 'withdrawal_request', v_id::text, jsonb_build_object('amount', p_amount, 'currency', p_currency));

  return v_id;
end;
$$;

revoke execute on function public.request_withdrawal(numeric, text, text) from public, anon;
grant execute on function public.request_withdrawal(numeric, text, text) to authenticated;

-- ---------- admin: review (and pay) a withdrawal request ----------
-- Three-state lifecycle, not four -- there's no separate "approved" limbo
-- state. This one decision *is* the payout record: net amount/currency/
-- charges, and (only when paid out in NGN) the exchange rate actually
-- used for this specific payout -- stored on the row itself so it stays
-- fixed even if wallet_settings' reference rate changes later.
-- net_amount is deliberately not constrained <= requested_amount -- the
-- actual payout is admin discretion by design, same as every other review
-- RPC in this codebase having no built-in negotiation limit.
create or replace function public.review_withdrawal_request(
  p_id uuid, p_decision text, p_net_amount numeric, p_net_currency text,
  p_charges_amount numeric, p_exchange_rate numeric, p_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_status text;
  v_usd_equivalent numeric;
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;
  if p_decision not in ('paid', 'rejected') then
    raise exception 'invalid decision: %', p_decision;
  end if;

  select uid, status into v_uid, v_status from public.withdrawal_requests where id = p_id;
  if v_uid is null then
    raise exception 'withdrawal request not found';
  end if;
  if v_status <> 'pending' then
    raise exception 'this request has already been reviewed';
  end if;

  if p_decision = 'paid' then
    if coalesce(p_net_amount, 0) <= 0 then
      raise exception 'enter the amount actually paid out';
    end if;
    if p_net_currency not in ('USD', 'NGN') then
      raise exception 'invalid currency: %', p_net_currency;
    end if;
    if coalesce(p_charges_amount, 0) < 0 then
      raise exception 'charges can''t be negative';
    end if;
    if p_net_currency = 'NGN' and coalesce(p_exchange_rate, 0) <= 0 then
      raise exception 'enter the exchange rate used for this payout';
    end if;

    v_usd_equivalent := case when p_net_currency = 'USD' then p_net_amount else p_net_amount / p_exchange_rate end;

    update public.withdrawal_requests
      set status = 'paid', net_amount = p_net_amount, net_currency = p_net_currency,
          charges_amount = coalesce(p_charges_amount, 0),
          exchange_rate = case when p_net_currency = 'NGN' then p_exchange_rate else null end,
          usd_equivalent = v_usd_equivalent,
          reviewed_by = auth.uid(), reviewed_at = now(), review_note = coalesce(p_note, '')
      where id = p_id;

    insert into public.notifications (uid, type, title, body, link_to)
    values (
      v_uid, 'withdrawal_reviewed', 'Withdrawal paid 🎉',
      'You received ' || p_net_amount || ' ' || p_net_currency || '.',
      '/wallet'
    );
  else
    update public.withdrawal_requests
      set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_note = coalesce(p_note, '')
      where id = p_id;

    insert into public.notifications (uid, type, title, body, link_to)
    values (
      v_uid, 'withdrawal_reviewed', 'Withdrawal request declined',
      coalesce(nullif(p_note, ''), 'An admin declined this withdrawal request.'),
      '/wallet'
    );
  end if;

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'withdrawal_reviewed', 'withdrawal_request', p_id::text, jsonb_build_object('decision', p_decision));
end;
$$;

revoke execute on function public.review_withdrawal_request(uuid, text, numeric, text, numeric, numeric, text) from public, anon;
grant execute on function public.review_withdrawal_request(uuid, text, numeric, text, numeric, numeric, text) to authenticated;

-- ---------- member: log a savings entry ----------
-- Not a real fund movement -- a member voluntarily re-labeling money they
-- already withdrew. No admin review needed, but a withdrawal-from-savings
-- entry (negative amount) can't take the running total below zero.
create or replace function public.log_savings_entry(p_amount numeric, p_note text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_current_total numeric;
  v_id uuid;
begin
  if coalesce(p_amount, 0) = 0 then
    raise exception 'enter a non-zero amount';
  end if;

  select coalesce(sum(amount), 0) into v_current_total from public.savings_entries where uid = v_uid;
  if v_current_total + p_amount < 0 then
    raise exception 'that would take your savings below zero';
  end if;

  insert into public.savings_entries (uid, amount, note)
  values (v_uid, p_amount, coalesce(p_note, ''))
  returning id into v_id;

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (v_uid, 'savings_entry_logged', 'savings_entry', v_id::text, jsonb_build_object('amount', p_amount));

  return v_id;
end;
$$;

revoke execute on function public.log_savings_entry(numeric, text) from public, anon;
grant execute on function public.log_savings_entry(numeric, text) to authenticated;

-- ---------- admin: set a rank's withdrawal tiers (replace-the-set) ----------
-- Same "replace everything for this rank in one call" shape as
-- admin_set_rank_learning_paths (0060) -- the whole list is edited and
-- saved together client-side, so a full delete+reinsert is simpler and
-- just as safe as a diff/upsert (these rows have no client-stable id to
-- diff against). Validated as a whole set before any write: no overlap,
-- and only the last (highest-min) band may be left open-ended.
create or replace function public.admin_set_rank_withdrawal_tiers(p_rank_id uuid, p_tiers jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier jsonb;
  v_prev_max numeric;
  v_min numeric;
  v_max numeric;
  v_cap numeric;
  v_currency text;
  v_seen_open_ended boolean := false;
  v_count int := 0;
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;
  if not exists (select 1 from public.ranks where id = p_rank_id) then
    raise exception 'rank not found';
  end if;

  for v_tier in
    select t.val from jsonb_array_elements(coalesce(p_tiers, '[]'::jsonb)) as t(val)
    order by (t.val->>'minWithdrawnUsd')::numeric
  loop
    v_count := v_count + 1;
    v_min := (v_tier->>'minWithdrawnUsd')::numeric;
    v_max := nullif(v_tier->>'maxWithdrawnUsd', '')::numeric;
    v_cap := (v_tier->>'requestCapAmount')::numeric;
    v_currency := v_tier->>'requestCapCurrency';

    if v_min is null or v_min < 0 then
      raise exception 'each tier needs a minimum withdrawn amount of 0 or more';
    end if;
    if v_max is not null and v_max <= v_min then
      raise exception 'a tier''s maximum must be greater than its minimum';
    end if;
    if v_cap is null or v_cap <= 0 then
      raise exception 'each tier needs a request cap greater than zero';
    end if;
    if coalesce(v_currency, '') not in ('USD', 'NGN') then
      raise exception 'invalid request cap currency: %', v_currency;
    end if;
    if v_seen_open_ended then
      raise exception 'only the last (highest) tier can be left open-ended';
    end if;
    if v_prev_max is not null and v_min < v_prev_max then
      raise exception 'tiers can''t overlap -- check the min/max ranges';
    end if;
    if v_max is null then
      v_seen_open_ended := true;
    end if;
    v_prev_max := v_max;
  end loop;

  delete from public.rank_withdrawal_tiers where rank_id = p_rank_id;

  insert into public.rank_withdrawal_tiers (rank_id, min_withdrawn_usd, max_withdrawn_usd, request_cap_amount, request_cap_currency)
  select
    p_rank_id,
    (t.val->>'minWithdrawnUsd')::numeric,
    nullif(t.val->>'maxWithdrawnUsd', '')::numeric,
    (t.val->>'requestCapAmount')::numeric,
    t.val->>'requestCapCurrency'
  from jsonb_array_elements(coalesce(p_tiers, '[]'::jsonb)) as t(val);

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'rank_withdrawal_tiers_set', 'rank', p_rank_id::text, jsonb_build_object('tier_count', v_count));
end;
$$;

revoke execute on function public.admin_set_rank_withdrawal_tiers(uuid, jsonb) from public, anon;
grant execute on function public.admin_set_rank_withdrawal_tiers(uuid, jsonb) to authenticated;

-- ---------- read: one member's wallet summary (self or admin) ----------
-- Parameterized by p_uid rather than a no-arg "get_my_..." call, mirroring
-- get_network_overview(p_uid) exactly -- serves both the member's own
-- /wallet page and MemberDetail.jsx's admin-side panel with one RPC.
-- remainingUsd = incomeTotalUsd - withdrawnTotalUsd only -- savedTotalNgn
-- is NOT subtracted again: saved money was already deducted from
-- remaining at withdrawal time, it's just been voluntarily re-labeled by
-- the member afterward, not a second deduction.
create or replace function public.get_wallet_summary(p_uid uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_rank_id uuid;
  v_income_total numeric;
  v_withdrawn_total numeric;
  v_saved_total numeric;
  v_withdrawn_by_currency jsonb;
  v_tier jsonb;
  v_pending jsonb;
begin
  if p_uid <> auth.uid() and coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied';
  end if;

  select rank_id into v_rank_id from public.profiles where id = p_uid;

  select coalesce(sum(amount), 0) into v_income_total
    from public.earnings_logs where uid = p_uid and status = 'verified';

  select coalesce(sum(usd_equivalent), 0) into v_withdrawn_total
    from public.withdrawal_requests where uid = p_uid and status = 'paid';

  select coalesce(sum(amount), 0) into v_saved_total
    from public.savings_entries where uid = p_uid;

  select coalesce(jsonb_object_agg(w.net_currency, w.total), '{}'::jsonb) into v_withdrawn_by_currency
    from (
      select net_currency, sum(net_amount) as total
      from public.withdrawal_requests
      where uid = p_uid and status = 'paid'
      group by net_currency
    ) w;

  select jsonb_build_object('capAmount', request_cap_amount, 'capCurrency', request_cap_currency)
    into v_tier
    from public.rank_withdrawal_tiers
    where rank_id = v_rank_id and min_withdrawn_usd <= v_withdrawn_total
    order by min_withdrawn_usd desc
    limit 1;

  select jsonb_build_object(
      'id', id, 'amount', requested_amount, 'currency', requested_currency, 'createdAt', created_at
    ) into v_pending
    from public.withdrawal_requests
    where uid = p_uid and status = 'pending'
    limit 1;

  return jsonb_build_object(
    'incomeTotalUsd', v_income_total,
    'withdrawnTotalUsd', v_withdrawn_total,
    'withdrawnByCurrency', v_withdrawn_by_currency,
    'savedTotalNgn', v_saved_total,
    'remainingUsd', v_income_total - v_withdrawn_total,
    'tier', v_tier,
    'pendingRequest', v_pending
  );
end;
$$;

revoke execute on function public.get_wallet_summary(uuid) from public, anon;
grant execute on function public.get_wallet_summary(uuid) to authenticated;

-- ---------- read: one member's wallet transaction history (self or admin) ----------
-- Kept separate from get_wallet_summary (not folded in) so refetching
-- after a new savings entry or request doesn't need to re-run the whole
-- aggregate -- same split get_network_overview/get_network already models.
create or replace function public.get_wallet_transactions(p_uid uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if p_uid <> auth.uid() and coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied';
  end if;

  return coalesce((
    select jsonb_agg(t.row_data order by t.occurred_at desc)
    from (
      select
        jsonb_build_object(
          'kind', 'income', 'id', id, 'amount', amount, 'currency', 'USD',
          'status', 'verified', 'note', note, 'occurredAt', earned_at
        ) as row_data,
        earned_at as occurred_at
      from public.earnings_logs
      where uid = p_uid and status = 'verified'

      union all

      select
        jsonb_build_object(
          'kind', 'withdrawal', 'id', id,
          'amount', coalesce(net_amount, requested_amount),
          'currency', coalesce(net_currency, requested_currency),
          'status', status, 'note', note, 'occurredAt', created_at
        ),
        created_at
      from public.withdrawal_requests
      where uid = p_uid

      union all

      select
        jsonb_build_object(
          'kind', 'savings', 'id', id, 'amount', amount, 'currency', 'NGN',
          'status', 'logged', 'note', note, 'occurredAt', created_at
        ),
        created_at
      from public.savings_entries
      where uid = p_uid
    ) t
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.get_wallet_transactions(uuid) from public, anon;
grant execute on function public.get_wallet_transactions(uuid) to authenticated;

-- ---------- admin: set the reference exchange rate ----------
-- Goes through an RPC rather than a direct RLS-gated update (unlike
-- progress_weights, 0008, this codebase's other singleton-settings
-- precedent) because this number gates real money decisions and deserves
-- an activity_log audit trail.
create or replace function public.admin_set_wallet_reference_rate(p_rate numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;
  if coalesce(p_rate, 0) <= 0 then
    raise exception 'enter a rate greater than zero';
  end if;

  update public.wallet_settings
    set usd_to_ngn_reference_rate = p_rate, updated_by = auth.uid(), updated_at = now()
    where id = true;

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'wallet_reference_rate_set', 'wallet_settings', 'singleton', jsonb_build_object('rate', p_rate));
end;
$$;

revoke execute on function public.admin_set_wallet_reference_rate(numeric) from public, anon;
grant execute on function public.admin_set_wallet_reference_rate(numeric) to authenticated;
