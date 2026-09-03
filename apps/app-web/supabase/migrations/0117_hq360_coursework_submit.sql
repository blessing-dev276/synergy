-- ================= HQ360 restructure: member coursework submission (§4.3) =================
-- "Members can only ever write status='submitted' (insert or resubmit)."
-- A resubmit clears any prior review so it reads as awaiting review again,
-- not as still carrying the old verdict.

create or replace function public.submit_coursework(p_assignment_id uuid, p_note text, p_link text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment record;
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
end;
$$;

revoke execute on function public.submit_coursework(uuid, text, text) from public, anon;
grant execute on function public.submit_coursework(uuid, text, text) to authenticated;
