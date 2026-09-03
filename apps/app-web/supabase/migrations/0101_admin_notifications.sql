-- Admin notification coverage. Every "needs a decision" flow already
-- notifies admins today (evidence, rank tasks, rank advancement,
-- withdrawals, daily reports, earnings -- all confirmed live, see the
-- for v_admin in select id from public.profiles where role = 'admin' loop
-- pattern each one already uses). What's genuinely missing, found by
-- reading every write path an admin would otherwise have to go looking
-- for on their own:
--
--   1. New signup -- handle_new_user (the auth.users trigger) never told
--      an admin a new member exists.
--   2. Sponsor/referral issue -- the same trigger inserts a pending
--      sponsor_requests row when someone claims a sponsor by name instead
--      of a valid link, and nobody was ever told that needed resolving --
--      resolveSponsorRequest/rejectSponsorRequest (rpc.js) have existed
--      with no caller anywhere in the app.
--   3. A member leaving on their own (leave_office, 0092) never told an
--      admin either -- the one clean, real "needs attention" signal that
--      exists without a scheduler (this project has none, so anything
--      time-based -- "member's gone quiet" -- can't be done honestly here).
--   4. Announcements (create_announcement, 0090) never told any OTHER
--      admin one had just gone out.
--
-- Also fixed: submit_content_evidence's admin notification has pointed at
-- /admin/reviews since 0033 -- that route hasn't existed since the review
-- queues consolidated into /admin/submissions. Every real evidence
-- submission notification has been a dead link until this.
--
-- Each function below is CREATE OR REPLACE, byte-for-byte its current body
-- (0064/0092/0090/0033 respectively) plus the one addition called out in
-- its own comment -- same convention this whole migration history uses,
-- never edit the old file.

-- ================= 1 & 2: new signup + sponsor/referral issue =================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sponsor_uid uuid;
  v_claimed_name text;
  v_first_rank_id uuid;
  v_admin record;
begin
  begin
    v_sponsor_uid := nullif(new.raw_user_meta_data->>'sponsor_uid', '')::uuid;
  exception when others then
    v_sponsor_uid := null;
  end;

  if v_sponsor_uid is not null and not exists (
    select 1 from public.profiles where id = v_sponsor_uid and status = 'active'
  ) then
    v_sponsor_uid := null;
  end if;

  v_claimed_name := nullif(trim(new.raw_user_meta_data->>'claimed_sponsor_name'), '');

  select id into v_first_rank_id from public.ranks order by order_index limit 1;

  insert into public.profiles (id, display_name, email, sponsor_uid, whatsapp_number, status, rank_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', ''),
    new.email,
    v_sponsor_uid,
    coalesce(new.raw_user_meta_data->>'whatsapp_number', ''),
    'pending',
    v_first_rank_id
  )
  on conflict (id) do nothing;

  if v_sponsor_uid is not null then
    insert into public.sponsor_relationships (member_uid, sponsor_uid, source, active, assigned_at)
    values (new.id, v_sponsor_uid, 'signup', true, now());
  elsif v_claimed_name is not null then
    insert into public.sponsor_requests (member_uid, claimed_sponsor_name, status)
    values (new.id, v_claimed_name, 'pending');
  end if;

  for v_admin in select id from public.profiles where role = 'admin' loop
    insert into public.notifications (uid, type, title, body, link_to)
    values (
      v_admin.id, 'new_member_registered', 'New member registered',
      coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), new.email, 'A new member') || ' just signed up.',
      '/admin/members/' || new.id::text
    );

    -- Only when there's actually something to resolve -- a valid sponsor
    -- link needs no admin attention at all.
    if v_claimed_name is not null and v_sponsor_uid is null then
      insert into public.notifications (uid, type, title, body, link_to)
      values (
        v_admin.id, 'sponsor_request_needs_review', 'Sponsor/referral needs review',
        coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), new.email, 'A new member')
          || ' claimed "' || v_claimed_name || '" as their sponsor, but it couldn''t be matched automatically.',
        '/admin/members/' || new.id::text
      );
    end if;
  end loop;

  return new;
end;
$$;

-- ================= 3: a member leaves on their own =================
create or replace function public.leave_office()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
  v_display_name text;
  v_admin record;
begin
  select status into v_status from public.profiles where id = v_uid;
  if v_status is null then
    raise exception 'profile not found';
  end if;
  if v_status in ('suspended', 'removed') then
    raise exception 'your account is already inactive';
  end if;

  update public.profiles set status = 'removed', left_at = now() where id = v_uid;

  select display_name into v_display_name from public.profiles where id = v_uid;

  for v_admin in select id from public.profiles where role = 'admin' loop
    insert into public.notifications (uid, type, title, body, link_to)
    values (
      v_admin.id, 'member_left_office', 'Member needs attention',
      coalesce(nullif(v_display_name, ''), 'A member') || ' just closed their own account.',
      '/admin/members/' || v_uid::text
    );
  end loop;

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (v_uid, 'member_left_office', 'profile', v_uid::text, '{}'::jsonb);
end;
$$;

revoke execute on function public.leave_office() from public, anon;
grant execute on function public.leave_office() to authenticated;

-- ================= 4: announcement published =================
create or replace function public.create_announcement(p_title text, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_admin record;
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'title is required';
  end if;

  insert into public.announcements (title, body, created_by)
  values (trim(p_title), coalesce(p_body, ''), auth.uid())
  returning id into v_id;

  -- Every OTHER admin, not the one who just posted it -- they already know.
  for v_admin in select id from public.profiles where role = 'admin' and id <> auth.uid() loop
    insert into public.notifications (uid, type, title, body, link_to)
    values (
      v_admin.id, 'announcement_published', 'Announcement published',
      '"' || trim(p_title) || '" was just posted to every member''s dashboard.',
      '/admin/settings/notifications'
    );
  end loop;

  return v_id;
end;
$$;

revoke execute on function public.create_announcement(text, text) from public, anon;
grant execute on function public.create_announcement(text, text) to authenticated;

-- ================= fix: dead link in the evidence-submitted notification =================
create or replace function public.submit_content_evidence(p_content_assignment_id uuid, p_text_response text, p_file_urls text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_content_type text;
  v_requires_approval boolean;
  v_uid uuid := auth.uid();
  v_admin record;
  v_display_name text;
  v_title text;
begin
  if not public.is_active() then
    raise exception 'your account is suspended and can''t submit evidence';
  end if;

  select ci.content_type, ca.requires_admin_approval, coalesce(ci.title, c.title, a.title)
    into v_content_type, v_requires_approval, v_title
    from public.content_assignments ca
    join public.content_items ci on ci.id = ca.content_item_id
    left join public.courses c on c.id = ci.course_id
    left join public.assignments a on a.id = ci.assignment_id
    where ca.id = p_content_assignment_id;

  if v_content_type is null then
    raise exception 'content assignment not found';
  end if;
  if v_content_type <> 'bare' or not coalesce(v_requires_approval, false) then
    raise exception 'this task doesn''t need submitted evidence -- use complete_content_assignment instead';
  end if;
  if not public.content_assignment_unlocked(p_content_assignment_id, v_uid) then
    raise exception 'complete the prerequisite tasks first';
  end if;

  insert into public.content_evidence_submissions (content_assignment_id, uid, text_response, file_urls, status, submitted_at)
  values (p_content_assignment_id, v_uid, coalesce(p_text_response, ''), coalesce(p_file_urls, '{}'), 'submitted', now())
  on conflict (content_assignment_id, uid) do update
    set text_response = excluded.text_response, file_urls = excluded.file_urls,
        status = 'submitted', feedback = '', reviewed_by = null, reviewed_at = null, submitted_at = now();

  select display_name into v_display_name from public.profiles where id = v_uid;

  for v_admin in select id from public.profiles where role = 'admin' loop
    insert into public.notifications (uid, type, title, body, link_to)
    values (
      v_admin.id, 'content_evidence_submitted', 'Evidence submitted for review',
      coalesce(nullif(v_display_name, ''), 'A member') || ' submitted evidence for: ' || coalesce(v_title, 'a task'),
      '/admin/submissions?section=evidence'
    );
  end loop;

  insert into public.activity_log (actor_uid, action, target_type, target_id)
  values (v_uid, 'content_evidence_submitted', 'content_assignment', p_content_assignment_id::text);
end;
$$;

revoke execute on function public.submit_content_evidence(uuid, text, text[]) from public, anon;
grant execute on function public.submit_content_evidence(uuid, text, text[]) to authenticated;

-- ================= same fix, other /admin/submissions links -> their exact section =================
-- rank_advancement_requested (evaluate_rank_advancement, 0082) and
-- withdrawal_requested (request_withdrawal, 0085) both linked at the bare
-- page (it always opened on Daily Reports by default, 0094) -- now that
-- Submissions.jsx supports ?section=, point each at its own section
-- directly instead of making the admin find it by hand. Both bodies below
-- are byte-for-byte their current source (0082/0085) -- only each
-- link_to's ?section= is new.
create or replace function public.evaluate_rank_advancement(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rank_id uuid;
  v_rank_order int;
  v_to_rank_id uuid;
  v_to_rank_title text;
  v_total_paths int;
  v_incomplete_paths int;
  v_display_name text;
  v_admin record;
begin
  select rank_id into v_rank_id from public.profiles where id = p_uid;
  if v_rank_id is null then
    return;
  end if;

  if exists (select 1 from public.rank_advancement_requests where uid = p_uid and status = 'pending') then
    return;
  end if;

  select order_index into v_rank_order from public.ranks where id = v_rank_id;

  select id, title into v_to_rank_id, v_to_rank_title
    from public.ranks where order_index > v_rank_order
    order by order_index limit 1;
  if v_to_rank_id is null then
    return;
  end if;

  select count(*) into v_total_paths from public.rank_learning_paths where rank_id = v_rank_id;
  if v_total_paths = 0 then
    return;
  end if;

  select count(*) into v_incomplete_paths
    from public.rank_learning_paths rlp
    join public.learning_paths lp on lp.id = rlp.learning_path_id
    where rlp.rank_id = v_rank_id
      and not (
        case when lp.section = 'mind_training'
          then public.is_mind_training_path_complete(p_uid, lp.id)
          else public.is_regular_path_complete(p_uid, lp.id)
        end
      );
  if v_incomplete_paths > 0 then
    return;
  end if;

  insert into public.rank_advancement_requests (uid, from_rank_id, to_rank_id, status)
  values (p_uid, v_rank_id, v_to_rank_id, 'pending');

  select display_name into v_display_name from public.profiles where id = p_uid;

  for v_admin in select id from public.profiles where role = 'admin' loop
    insert into public.notifications (uid, type, title, body, link_to)
    values (
      v_admin.id, 'rank_advancement_requested', 'Rank advancement request',
      coalesce(nullif(v_display_name, ''), 'A member') || ' finished every learning path for their rank and is ready for: ' || v_to_rank_title,
      '/admin/submissions?section=rank-advancement'
    );
  end loop;

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (p_uid, 'rank_advancement_requested', 'profile', p_uid::text, jsonb_build_object('toRankId', v_to_rank_id));
end;
$$;

revoke execute on function public.evaluate_rank_advancement(uuid) from public, anon, authenticated;

create or replace function public.request_withdrawal(p_amount numeric, p_currency text, p_note text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rank_id uuid;
  v_income_total numeric;
  v_withdrawn_total numeric;
  v_remaining numeric;
  v_reference_rate numeric;
  v_request_usd numeric;
  v_cap_amount numeric;
  v_cap_currency text;
  v_cap_in_request_currency numeric;
  v_id uuid;
  v_display_name text;
  v_admin record;
begin
  if p_currency not in ('USD', 'NGN') then
    raise exception 'invalid currency: %', p_currency;
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'enter an amount greater than zero';
  end if;
  if exists (select 1 from public.withdrawal_requests where uid = v_uid and status = 'pending') then
    raise exception 'you already have a pending withdrawal request';
  end if;

  select rank_id into v_rank_id from public.profiles where id = v_uid;

  select coalesce(sum(amount), 0) into v_income_total
    from public.earnings_logs where uid = v_uid and status = 'verified';
  select coalesce(sum(usd_equivalent), 0) into v_withdrawn_total
    from public.withdrawal_requests where uid = v_uid and status = 'paid';
  v_remaining := v_income_total - v_withdrawn_total;

  select usd_to_ngn_reference_rate into v_reference_rate from public.wallet_settings where id = true;

  if p_currency = 'USD' then
    v_request_usd := p_amount;
  else
    if v_reference_rate is null then
      raise exception 'no reference exchange rate has been set yet -- ask an admin to set one before requesting in NGN';
    end if;
    v_request_usd := p_amount / v_reference_rate;
  end if;

  if v_request_usd > v_remaining then
    raise exception 'that''s more than your remaining balance';
  end if;

  select request_cap_amount, request_cap_currency
    into v_cap_amount, v_cap_currency
    from public.rank_withdrawal_tiers
    where rank_id = v_rank_id and min_withdrawn_usd <= v_withdrawn_total
    order by min_withdrawn_usd desc
    limit 1;

  if v_cap_currency is not null then
    if v_cap_currency = p_currency then
      v_cap_in_request_currency := v_cap_amount;
    else
      if v_reference_rate is null then
        raise exception 'no reference exchange rate has been set yet -- ask an admin to set one before requesting in %', p_currency;
      end if;
      v_cap_in_request_currency := case
        when p_currency = 'NGN' then v_cap_amount * v_reference_rate -- cap in USD, request in NGN
        else v_cap_amount / v_reference_rate                        -- cap in NGN, request in USD
      end;
    end if;
    if p_amount > v_cap_in_request_currency then
      raise exception 'your current tier allows at most % % per request', v_cap_amount, v_cap_currency;
    end if;
  end if;

  insert into public.withdrawal_requests (uid, requested_amount, requested_currency, note)
  values (v_uid, p_amount, p_currency, coalesce(p_note, ''))
  returning id into v_id;

  select display_name into v_display_name from public.profiles where id = v_uid;

  for v_admin in select id from public.profiles where role = 'admin' loop
    insert into public.notifications (uid, type, title, body, link_to)
    values (
      v_admin.id, 'withdrawal_requested', 'Withdrawal request submitted',
      coalesce(nullif(v_display_name, ''), 'A member') || ' requested ' || p_amount || ' ' || p_currency || '.',
      '/admin/submissions?section=withdrawals'
    );
  end loop;

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (v_uid, 'withdrawal_requested', 'withdrawal_request', v_id::text, jsonb_build_object('amount', p_amount, 'currency', p_currency));

  return v_id;
end;
$$;

revoke execute on function public.request_withdrawal(numeric, text, text) from public, anon;
grant execute on function public.request_withdrawal(numeric, text, text) to authenticated;

-- daily_report_submitted (0094) already links at /admin/submissions with no
-- ?section= -- it's the default-open section (Submissions.jsx's own
-- openSection state starts at "daily-reports"), so it was already
-- landing in the right place; left untouched.
