-- ================= HQ360 restructure: notify admins of new coursework =================
-- submit_coursework (0117) never told an admin a submission was waiting --
-- the new "Training Coursework" review section (Submissions.jsx) would
-- otherwise only ever be found by an admin checking in on their own. Same
-- "for v_admin in ... role = 'admin' loop" convention every other
-- needs-a-decision flow uses (0101). CREATE OR REPLACE, 0117's body plus
-- this one addition -- never edit the old migration file.
create or replace function public.submit_coursework(p_assignment_id uuid, p_note text, p_link text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment record;
  v_admin record;
  v_member_name text;
begin
  select * into v_assignment from public.coursework_assignments where id = p_assignment_id;
  if v_assignment is null then
    raise exception 'assignment not found';
  end if;
  if v_assignment.require_note and coalesce(trim(p_note), '') = '' then
    raise exception 'this assignment requires a note';
  end if;
  if v_assignment.require_link and coalesce(trim(p_link), '') = '' then
    raise exception 'this assignment requires a link';
  end if;

  insert into public.coursework_submissions (assignment_id, user_id, note, link, status, submitted_at)
  values (p_assignment_id, auth.uid(), nullif(trim(p_note), ''), nullif(trim(p_link), ''), 'submitted', now())
  on conflict (assignment_id, user_id) do update
    set note = excluded.note, link = excluded.link, status = 'submitted', submitted_at = now(),
        review_note = null, reviewed_by = null, reviewed_at = null;

  select display_name into v_member_name from public.profiles where id = auth.uid();

  for v_admin in select id from public.profiles where role = 'admin' loop
    insert into public.notifications (uid, type, title, body, link_to)
    values (
      v_admin.id, 'coursework_submitted', 'Coursework submitted for review',
      coalesce(v_member_name, 'A member') || ' submitted "' || v_assignment.title || '".',
      '/admin/submissions?section=coursework'
    );
  end loop;
end;
$$;

revoke execute on function public.submit_coursework(uuid, text, text) from public, anon;
grant execute on function public.submit_coursework(uuid, text, text) to authenticated;
