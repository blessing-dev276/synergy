-- ================= fix: sidebar pending-count 404s after the onboarding redesign =================
-- Live-tested: the admin sidebar badge (AdminLayout.jsx) and the
-- Evaluation Center overview both 404 on admin_count_pending_submissions
-- (pre-existing, 0088) -- it still counts public.level_registration_
-- submissions, which 0132 dropped along with the rest of the old "Level 1
-- Prospect" registration flow it replaced. Same function, same five other
-- queues, just that one term removed -- nothing else about this shared
-- badge count belongs to the onboarding feature, so nothing else changes.
create or replace function public.admin_count_pending_submissions()
returns integer
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
      + (select count(*) from public.coursework_submissions where status = 'submitted')
    else 0 end;
$$;
