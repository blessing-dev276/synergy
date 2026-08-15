-- Admin-entered earnings: an admin logging an earning on behalf of a member
-- (e.g. from a report that never went through self-report) is already the
-- trusted party in this flow -- the whole reason log_earning's submissions
-- sit at 'pending' until review_earning verifies them (see
-- 0026_weekly_leaderboard.sql) is that a member's own self-report can't be
-- trusted uncorroborated. That concern doesn't apply when an admin is the
-- one entering it directly, so this inserts straight to 'verified' with no
-- separate review step.

create or replace function public.admin_log_earning(p_uid uuid, p_amount numeric, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be greater than zero';
  end if;
  if not exists (select 1 from public.profiles where id = p_uid) then
    raise exception 'member not found';
  end if;

  insert into public.earnings_logs (uid, amount, note, status, reviewed_by, reviewed_at, earned_at)
  values (p_uid, p_amount, coalesce(p_note, ''), 'verified', auth.uid(), now(), now())
  returning id into v_id;

  insert into public.notifications (uid, type, title, body, link_to)
  values (
    p_uid, 'earning_reviewed', 'Earning logged 🎉',
    '$' || p_amount || ' logged by an admin and counted toward this week''s leaderboard.',
    '/leaderboard'
  );

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'earning_logged_by_admin', 'earnings_log', v_id::text, jsonb_build_object('amount', p_amount, 'for_uid', p_uid));
end;
$$;

revoke execute on function public.admin_log_earning(uuid, numeric, text) from public, anon;
grant execute on function public.admin_log_earning(uuid, numeric, text) to authenticated;
