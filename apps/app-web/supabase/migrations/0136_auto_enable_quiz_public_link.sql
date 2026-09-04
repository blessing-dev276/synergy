-- ================= fix: attaching a quiz to a Level 1 lesson didn't open it =================
-- Live-tested: authored 4 quiz-gated lessons, picked an existing published
-- exam for each from admin_add_level_learn_item's dropdown -- and every one
-- of them 500'd with "this exam is not open right now" the moment a member
-- clicked "Take the quiz". start_exam_attempt (0118) requires
-- exams.public_link_enabled = true, a separate flag an admin normally
-- flips from the Exam Manager's own screen (set_exam_public_link) -- but
-- onboarding's /take/:token is the ONLY way a member ever reaches one of
-- these quizzes, so requiring a second, easy-to-forget manual step in a
-- different part of the admin app is just a footgun here. Compose the
-- existing set_exam_public_link (not a new permission path) the moment a
-- lesson item is attached to an exam, same "reuse what's already built"
-- rule everything else in this feature follows.
create or replace function public.admin_add_level_learn_item(
  p_level_key text, p_kind text, p_title text, p_description text,
  p_text_body text, p_video_url text, p_pdf_file_path text, p_exam_id uuid,
  p_agreement_body text, p_agreement_version text, p_external_link text, p_confirmation_label text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_level_id uuid;
  v_id uuid;
  v_next_order int;
begin
  if coalesce(public.current_role(), '') not in ('admin', 'mentor') then
    raise exception 'permission denied: admin or mentor role required';
  end if;
  select id into v_level_id from public.training_levels where key = p_level_key and org_id = public.current_org_id();
  if v_level_id is null then
    raise exception 'level not found: %', p_level_key;
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'an item needs a title';
  end if;
  if p_kind = 'lesson' and coalesce(trim(p_text_body), '') = '' then
    raise exception 'a lesson needs body text';
  end if;
  if p_kind = 'agreement_signature' and coalesce(trim(p_agreement_body), '') = '' then
    raise exception 'an agreement needs its document text';
  end if;
  if p_kind in ('external_confirmation', 'checkbox_confirmation') and coalesce(trim(p_confirmation_label), '') = '' then
    raise exception 'a confirmation needs its checkbox label';
  end if;

  select coalesce(max(order_index), 0) + 1 into v_next_order from public.level_learn_items where level_id = v_level_id;

  insert into public.level_learn_items (
    level_id, order_index, title, description, kind,
    text_body, video_url, pdf_file_path, exam_id,
    agreement_body, agreement_version, external_link, confirmation_label, created_by
  )
  values (
    v_level_id, v_next_order, trim(p_title), nullif(trim(p_description), ''), p_kind,
    case when p_kind = 'lesson' then trim(p_text_body) else null end,
    case when p_kind = 'lesson' then nullif(trim(p_video_url), '') else null end,
    case when p_kind = 'lesson' then p_pdf_file_path else null end,
    case when p_kind = 'lesson' then p_exam_id else null end,
    case when p_kind = 'agreement_signature' then trim(p_agreement_body) else null end,
    case when p_kind = 'agreement_signature' then coalesce(nullif(trim(p_agreement_version), ''), 'v1') else null end,
    case when p_kind in ('external_confirmation') then nullif(trim(p_external_link), '') else null end,
    case when p_kind in ('external_confirmation', 'checkbox_confirmation') then trim(p_confirmation_label) else null end,
    auth.uid()
  )
  returning id into v_id;

  if p_kind = 'lesson' and p_exam_id is not null then
    perform public.set_exam_public_link(p_exam_id, true);
  end if;

  return v_id;
end;
$$;
