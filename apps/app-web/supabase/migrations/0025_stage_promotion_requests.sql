-- Stage advancement now requires admin sign-off. Before this, set_member_stage
-- (0011/0013) was the only path to move someone forward and admins had to
-- notice on their own that a member had finished everything -- no signal, no
-- request, no record of who asked. First-stage assignment already happens
-- automatically (get_journey_overview auto-starts a member on the earliest
-- published stage the first time they view their own dashboard, 0009) --
-- that part needed no change. What was missing is the member->admin
-- handoff for every stage *after* the first: a member requests promotion,
-- the server verifies every track in their current stage is actually at
-- 100% (not just trusting the client), an admin is notified, and only an
-- explicit approve/reject by that admin moves them (approval composes the
-- existing set_member_stage so its notification/activity-log behavior is
-- reused, not duplicated).

create table public.stage_promotion_requests (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references public.profiles(id) on delete cascade,
  from_stage_id uuid references public.stages(id),
  to_stage_id uuid not null references public.stages(id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text default ''
);
-- one open request at a time per member, same pattern as sponsor_requests (0018)
create unique index stage_promotion_requests_member_pending_uidx on public.stage_promotion_requests (uid) where (status = 'pending');
create index stage_promotion_requests_status_idx on public.stage_promotion_requests (status, requested_at desc);

alter table public.stage_promotion_requests enable row level security;
grant select on public.stage_promotion_requests to authenticated;
create policy stage_promotion_requests_select on public.stage_promotion_requests for select
  using (uid = auth.uid() or public.current_role() = 'admin');
-- no client insert/update grant: written only by request_stage_promotion /
-- review_stage_promotion below, both SECURITY DEFINER.

-- ---------- member: ask to move to the next stage ----------
create or replace function public.request_stage_promotion()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_current_stage_id uuid;
  v_current_order int;
  v_to_stage_id uuid;
  v_to_stage_title text;
  v_track record;
  v_track_count int := 0;
  v_admin record;
  v_display_name text;
begin
  select current_stage_id into v_current_stage_id from public.member_journey where uid = v_uid;
  if v_current_stage_id is null then
    raise exception 'you have not started your journey yet';
  end if;

  if exists (select 1 from public.stage_promotion_requests where uid = v_uid and status = 'pending') then
    raise exception 'you already have a pending promotion request';
  end if;

  select order_index into v_current_order from public.stages where id = v_current_stage_id;

  select id, title into v_to_stage_id, v_to_stage_title from public.stages
    where published = true and order_index > v_current_order
    order by order_index limit 1;
  if v_to_stage_id is null then
    raise exception 'you are already on the final stage';
  end if;

  for v_track in select track_id from public.stage_tracks where stage_id = v_current_stage_id loop
    v_track_count := v_track_count + 1;
    if public.compute_track_progress(v_uid, v_current_stage_id, v_track.track_id) < 100 then
      raise exception 'finish every track in your current stage before requesting promotion';
    end if;
  end loop;
  if v_track_count = 0 then
    raise exception 'this stage has no tracks configured';
  end if;

  insert into public.stage_promotion_requests (uid, from_stage_id, to_stage_id, status)
  values (v_uid, v_current_stage_id, v_to_stage_id, 'pending');

  select display_name into v_display_name from public.profiles where id = v_uid;

  for v_admin in select id from public.profiles where role = 'admin' loop
    insert into public.notifications (uid, type, title, body, link_to)
    values (
      v_admin.id, 'stage_promotion_requested', 'Promotion request',
      coalesce(nullif(v_display_name, ''), 'A member') || ' finished every track and is ready for: ' || v_to_stage_title,
      '/admin/members/' || v_uid::text
    );
  end loop;

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (v_uid, 'stage_promotion_requested', 'member_journey', v_uid::text, jsonb_build_object('toStageId', v_to_stage_id));
end;
$$;

revoke execute on function public.request_stage_promotion() from public, anon;
grant execute on function public.request_stage_promotion() to authenticated;

-- ---------- admin: approve or reject a pending request ----------
create or replace function public.review_stage_promotion(p_request_id uuid, p_decision text, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_to_stage_id uuid;
  v_status text;
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'invalid decision: %', p_decision;
  end if;

  select uid, to_stage_id, status into v_uid, v_to_stage_id, v_status
    from public.stage_promotion_requests where id = p_request_id;
  if v_uid is null then
    raise exception 'promotion request not found';
  end if;
  if v_status <> 'pending' then
    raise exception 'this request has already been reviewed';
  end if;

  update public.stage_promotion_requests
    set status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(), review_note = coalesce(p_note, '')
    where id = p_request_id;

  if p_decision = 'approved' then
    -- composes set_member_stage (0013) so the member-facing "stage_changed"
    -- notification and activity_log entry stay the single source of truth,
    -- not duplicated here.
    perform public.set_member_stage(v_uid, v_to_stage_id);
  else
    insert into public.notifications (uid, type, title, body, link_to)
    values (
      v_uid, 'stage_promotion_rejected', 'Promotion request declined',
      coalesce(nullif(p_note, ''), 'An admin reviewed your request and asked you to keep working on your current stage.'),
      '/dashboard'
    );
  end if;

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'stage_promotion_reviewed', 'stage_promotion_request', p_request_id::text, jsonb_build_object('decision', p_decision));
end;
$$;

revoke execute on function public.review_stage_promotion(uuid, text, text) from public, anon;
grant execute on function public.review_stage_promotion(uuid, text, text) to authenticated;
