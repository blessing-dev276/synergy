-- ================= HQ360 restructure v2: level registration in the pending badge =================
-- Same "0119 already extended this once for coursework" convention --
-- CREATE OR REPLACE, that body plus one more addend, never edit the old
-- migration file.
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
      + (select count(*) from public.coursework_submissions where status = 'submitted')
      + (select count(*) from public.level_registration_submissions where status = 'submitted')
    else 0 end;
$$;

revoke execute on function public.admin_count_pending_submissions() from public, anon;
grant execute on function public.admin_count_pending_submissions() to authenticated;
