-- ================= fix: get_onboarding_status 500s for a brand-new Prospect =================
-- Live-tested against a real Prospect account and caught: `v_meeting record;`
-- and `v_request record;` are PL/pgSQL's generic "record" type, which has no
-- fixed structure until a SELECT INTO actually assigns it a row. For a
-- member who has no level_meetings row yet (the normal case -- nothing's
-- been scheduled) or no rank_advancement_requests row yet (never
-- submitted), the SELECT matches zero rows, the variable is never
-- assigned, and the very next field access (`v_meeting.status`,
-- `v_request.id`) raises "record ... is not assigned yet" -- every brand
-- new Prospect hit this. Declaring both as `%rowtype` instead gives them a
-- fixed structure up front (all fields NULL on a zero-row match, same as
-- any other row variable), which is what every other row-shaped variable
-- in this file already does. CREATE OR REPLACE, 0134's body with just the
-- two declarations changed -- never edit the old migration files.
create or replace function public.get_onboarding_status(p_uid uuid default null)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid uuid;
  v_item record;
  v_level1 jsonb := '[]'::jsonb;
  v_level2 jsonb := '[]'::jsonb;
  v_level1_done int := 0;
  v_level1_total int := 0;
  v_level2_done int := 0;
  v_level2_total int := 0;
  v_done boolean;
  v_exam_token uuid;
  v_meeting public.level_meetings%rowtype;
  v_request public.rank_advancement_requests%rowtype;
begin
  if p_uid is null or p_uid = auth.uid() then
    v_uid := auth.uid();
  elsif coalesce(public.current_role(), '') in ('admin', 'mentor') then
    v_uid := p_uid;
  else
    raise exception 'permission denied';
  end if;

  -- ---------- Level 1: Foundation ----------
  for v_item in
    select li.* from public.level_learn_items li
    join public.training_levels tl on tl.id = li.level_id
    where tl.key = 'foundation'
    order by li.order_index
  loop
    v_exam_token := null;
    if v_item.kind = 'lesson' and v_item.exam_id is not null then
      v_done := public.has_passed_exam(v_item.exam_id, v_uid);
      select public_token into v_exam_token from public.exams where id = v_item.exam_id;
    elsif v_item.kind = 'lesson' then
      v_done := exists (select 1 from public.level_learn_progress where item_id = v_item.id and user_id = v_uid);
    elsif v_item.kind = 'agreement_signature' then
      v_done := exists (select 1 from public.level_agreement_signatures where item_id = v_item.id and user_id = v_uid);
    else
      v_done := exists (select 1 from public.level_learn_progress where item_id = v_item.id and user_id = v_uid);
    end if;
    if v_done then v_level1_done := v_level1_done + 1; end if;
    v_level1_total := v_level1_total + 1;

    v_level1 := v_level1 || jsonb_build_object(
      'id', v_item.id, 'title', v_item.title, 'description', v_item.description, 'kind', v_item.kind,
      'textBody', v_item.text_body, 'videoUrl', v_item.video_url, 'pdfFilePath', v_item.pdf_file_path,
      'examId', v_item.exam_id, 'examToken', v_exam_token,
      'agreementBody', v_item.agreement_body, 'agreementVersion', v_item.agreement_version,
      'externalLink', v_item.external_link, 'confirmationLabel', v_item.confirmation_label,
      'done', v_done
    );
  end loop;

  -- ---------- Level 2: Get to Work (locked until Level 1 fully done) ----------
  for v_item in
    select ci.* from public.level_checklist_items ci
    join public.training_levels tl on tl.id = ci.level_id
    where tl.key = 'get_to_work'
    order by ci.order_index
  loop
    if v_item.signal = 'class_complete' then
      v_done := public.is_class_complete(v_item.class_id, v_uid);
    elsif v_item.signal = 'profile_100' then
      v_done := public.compute_profile_health_percent(v_uid) >= 100;
    elsif v_item.signal = 'goals_set' then
      v_done := exists (select 1 from public.monthly_goals where uid = v_uid and status <> 'draft');
    elsif v_item.signal in ('sponsor_meeting', 'upline_meeting') then
      select * into v_meeting from public.level_meetings
        where user_id = v_uid and meeting_type = (case when v_item.signal = 'sponsor_meeting' then 'sponsor' else 'upline_director' end);
      v_done := coalesce(v_meeting.status = 'completed', false);
    else
      v_done := exists (select 1 from public.level_checklist_progress where item_id = v_item.id and user_id = v_uid);
    end if;
    if v_done then v_level2_done := v_level2_done + 1; end if;
    v_level2_total := v_level2_total + 1;

    v_level2 := v_level2 || jsonb_build_object(
      'id', v_item.id, 'title', v_item.title, 'description', v_item.description, 'signal', v_item.signal, 'classId', v_item.class_id,
      'done', v_done,
      'meeting', case when v_item.signal in ('sponsor_meeting', 'upline_meeting') then jsonb_build_object(
        'status', coalesce(v_meeting.status, 'pending'), 'meetingLink', v_meeting.meeting_link,
        'counterpartName', coalesce(v_meeting.counterpart_name, (select display_name from public.profiles where id = v_meeting.counterpart_uid))
      ) else null end
    );
  end loop;

  select * into v_request from public.rank_advancement_requests
    where uid = v_uid and to_rank_id = (select id from public.ranks where title = 'NEWBIE')
    order by requested_at desc limit 1;

  return jsonb_build_object(
    'level1', v_level1, 'level1Done', v_level1_done, 'level1Total', v_level1_total,
    'level2', v_level2, 'level2Done', v_level2_done, 'level2Total', v_level2_total,
    'level2Unlocked', v_level1_done = v_level1_total and v_level1_total > 0,
    'allComplete', v_level1_done = v_level1_total and v_level1_total > 0 and v_level2_done = v_level2_total and v_level2_total > 0,
    'pendingRequest', case when v_request.id is null then null else jsonb_build_object(
      'id', v_request.id, 'status', v_request.status, 'reflectionText', v_request.reflection_text,
      'preparedness', v_request.preparedness, 'questionsText', v_request.questions_text,
      'reviewNote', v_request.review_note, 'requestedAt', v_request.requested_at, 'reviewedAt', v_request.reviewed_at
    ) end
  );
end;
$$;
