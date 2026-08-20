-- Explicit one-off request: reset Minea's wallet back to zero -- her
-- earnings/withdrawals/savings were real manual testing of the new wallet
-- feature (not seed/placeholder data), and she should start clean. Same
-- shape as 0083's cleanup migration: these tables have no client delete
-- grant (RPC-only writes, no delete RPC exists for any of them -- by
-- design, matching every other financial-history table in this app), so
-- a migration is the only way to remove rows rather than just leaving
-- them.
delete from public.earnings_logs where uid = '72ae556d-f747-4378-8231-34a0cc4b44eb';
delete from public.withdrawal_requests where uid = '72ae556d-f747-4378-8231-34a0cc4b44eb';
delete from public.savings_entries where uid = '72ae556d-f747-4378-8231-34a0cc4b44eb';
