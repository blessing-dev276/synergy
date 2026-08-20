-- Wallet UI follow-up: the Savings section/tile is fully retired from
-- /wallet now (both turns of feedback), so get_wallet_transactions stops
-- unioning savings_entries in too -- nothing can create a new one from the
-- UI anymore, and a stray "Savings" line with no explanation of where it
-- came from would just be confusing. savings_entries/log_savings_entry
-- themselves are untouched (schema stays, just unused) in case this comes
-- back later.
--
-- Also widens the withdrawal branch with every field already sitting on
-- withdrawal_requests but never exposed (requested vs net amount/currency,
-- charges, exchange rate, USD-equivalent, reviewed-at, review note) --
-- Wallet.jsx's transaction detail popup needs these to actually be "well
-- detailed" instead of collapsing a payout down to one amount+currency.
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
          'status', status, 'note', note, 'occurredAt', created_at,
          'requestedAmount', requested_amount, 'requestedCurrency', requested_currency,
          'netAmount', net_amount, 'netCurrency', net_currency,
          'chargesAmount', charges_amount, 'exchangeRate', exchange_rate,
          'usdEquivalent', usd_equivalent,
          'reviewedAt', reviewed_at, 'reviewNote', review_note
        ),
        created_at
      from public.withdrawal_requests
      where uid = p_uid
    ) t
  ), '[]'::jsonb);
end;
$$;
-- CREATE OR REPLACE preserves existing grants (same name, same signature).
