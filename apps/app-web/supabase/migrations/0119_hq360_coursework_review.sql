-- ================= HQ360 restructure: Assignment Manager (§4.3 review side) =================
-- The spec's "Assignments" manager is mostly already covered by what this
-- app has: assignments are authored from inside the Skill/Income
-- Development class editor (add_class_assignment_item, 0116), and this app
-- already has one central review inbox for every submission queue
-- (Submissions.jsx / admin_count_pending_submissions). Rather than build a
-- second, parallel top-level "/assignments" review page, coursework_submissions
-- becomes a new section in that same existing inbox -- one place an admin
-- checks, not two. This migration is the review RPC + the pending-count
-- update that section needs; the actual UI change is a Submissions.jsx edit.

create or replace function public.review_coursework_submission(p_id uuid, p_decision text, p_review_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submission record;
  v_title text;
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;
  if p_decision not in ('approved', 'rejected', 'changes_requested') then
    raise exception 'invalid decision: %', p_decision;
  end if;

  select * into v_submission from public.coursework_submissions where id = p_id;
  if v_submission is null then
    raise exception 'submission not found';
  end if;

  update public.coursework_submissions
    set status = p_decision, review_note = nullif(trim(p_review_note), ''), reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_id;

  select title into v_title from public.coursework_assignments where id = v_submission.assignment_id;

  insert into public.notifications (uid, type, title, body, link_to)
  values (
    v_submission.user_id, 'coursework_reviewed',
    case p_decision
      when 'approved' then 'Assignment approved 🎉'
      when 'rejected' then 'Assignment rejected'
      else 'Changes requested'
    end,
    '"' || coalesce(v_title, 'Your assignment') || '"' || case when p_review_note is not null and trim(p_review_note) <> '' then ': ' || trim(p_review_note) else '' end,
    '/training'
  );
end;
$$;

revoke execute on function public.review_coursework_submission(uuid, text, text) from public, anon;
grant execute on function public.review_coursework_submission(uuid, text, text) to authenticated;

-- Extend the sidebar's pending-review badge to include coursework awaiting
-- review, same "submitted" convention as assignment_submissions/
-- content_evidence_submissions (0088).
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
    else 0 end;
$$;

revoke execute on function public.admin_count_pending_submissions() from public, anon;
grant execute on function public.admin_count_pending_submissions() to authenticated;
