-- Submissions.jsx already aggregates every review queue an admin has
-- (rank advancement, rank tasks, withdrawals, course assignments, task
-- evidence) into one page, but nothing signals from the sidebar that any
-- of them actually need attention -- an admin has to click in and check
-- each accordion section themselves. One aggregate count, badged onto the
-- "Submissions" nav link (AdminLayout.jsx/Sidebar.jsx).
--
-- Same "pending" statuses each of Submissions.jsx's own section queries
-- already filters on: rank_advancement_requests/rank_task_submissions/
-- withdrawal_requests = 'pending', assignment_submissions/
-- content_evidence_submissions = 'submitted'.
create or replace function public.admin_count_pending_submissions()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select
    case when coalesce(public.current_role(), '') = 'admin' then
      (select count(*) from public.rank_advancement_requests where status = 'pending')
      + (select count(*) from public.rank_task_submissions where status = 'pending')
      + (select count(*) from public.withdrawal_requests where status = 'pending')
      + (select count(*) from public.assignment_submissions where status = 'submitted')
      + (select count(*) from public.content_evidence_submissions where status = 'submitted')
    else 0 end;
$$;

revoke execute on function public.admin_count_pending_submissions() from public, anon;
grant execute on function public.admin_count_pending_submissions() to authenticated;
