-- Business Path rebuild, part 3 of 7: daily tasks. daily_task_selections
-- (0044) is dropped and recreated here, together with the
-- get_or_generate_daily_tasks rewrite, because the two changes are only
-- safe landing atomically -- the table's old shape (a single, NOT NULL
-- content_assignment_id) can't represent a Business Path placement at all,
-- so leaving the table as-is while rewriting the function (or vice versa)
-- would leave one or the other broken for a migration or more. Nothing else
-- references daily_task_selections (grepped), so the drop is clean.
--
-- The rewritten function pulls "today's tasks" from two independent pools --
-- content_assignments (individual, untouched) and business_path_placements
-- (new) -- and tags every returned row with a 'source' field so the client
-- knows which completion/evidence RPCs to call for it. Selection logic
-- (per-track cap, individual cap, unlocked+not-done gating) is unchanged
-- from 0044, just split across two pools instead of one.

drop table public.daily_task_selections;

create table public.daily_task_selections (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references public.profiles(id) on delete cascade,
  task_date date not null,
  content_assignment_id uuid references public.content_assignments(id) on delete cascade,
  business_path_placement_id uuid references public.business_path_placements(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (
    (content_assignment_id is not null and business_path_placement_id is null) or
    (content_assignment_id is null and business_path_placement_id is not null)
  )
);
create index daily_task_selections_uid_date_idx on public.daily_task_selections (uid, task_date);

-- Two partial unique indexes instead of one composite UNIQUE across both
-- nullable columns: a plain multi-column UNIQUE treats NULL as distinct from
-- NULL, and since exactly one of these two columns is always NULL (per the
-- check above), a composite constraint here would never actually fire --
-- every "duplicate" row would carry a NULL in a different column and slip
-- through, silently defeating the ON CONFLICT de-dup below under concurrent
-- calls. Restricting each index to the rows where the other column is NULL
-- (so every indexed row has all its indexed columns non-null) closes that
-- gap for both pools.
create unique index daily_task_selections_individual_uniq
  on public.daily_task_selections (uid, task_date, content_assignment_id)
  where business_path_placement_id is null;
create unique index daily_task_selections_business_path_uniq
  on public.daily_task_selections (uid, task_date, business_path_placement_id)
  where content_assignment_id is null;

alter table public.daily_task_selections enable row level security;
grant select on public.daily_task_selections to authenticated;
create policy daily_task_selections_select on public.daily_task_selections for select
  using (uid = auth.uid() or public.current_role() = 'admin');
-- no client insert/update/delete grant: written only by get_or_generate_daily_tasks.

create or replace function public.get_or_generate_daily_tasks(p_uid uuid, p_date date default current_date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stage_id uuid;
  v_path text;
  v_already_generated boolean;
  v_track record;
  v_ca record;
  v_bp record;
  v_picked int;
  v_per_track_cap constant int := 3;
  v_individual_cap constant int := 5;
begin
  if p_uid <> auth.uid() and coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied';
  end if;

  select exists(select 1 from public.daily_task_selections where uid = p_uid and task_date = p_date)
    into v_already_generated;

  if not v_already_generated then
    select current_stage_id into v_stage_id from public.member_business_path_stage where uid = p_uid;
    select coalesce(participation_path, 'full') into v_path from public.profiles where id = p_uid;

    -- individual pool: content_assignments, untouched by this rebuild.
    v_picked := 0;
    for v_ca in
      select ca.id from public.content_assignments ca
      where ca.scope = 'individual' and ca.assigned_to_uid = p_uid
      order by ca.due_date nulls last, ca.order_index
    loop
      exit when v_picked >= v_individual_cap;
      if not public.is_content_assignment_done(v_ca.id, p_uid) and public.content_assignment_unlocked(v_ca.id, p_uid) then
        insert into public.daily_task_selections (uid, task_date, content_assignment_id)
        values (p_uid, p_date, v_ca.id)
        on conflict (uid, task_date, content_assignment_id) where business_path_placement_id is null do nothing;
        v_picked := v_picked + 1;
      end if;
    end loop;

    -- business path pool: up to a few per active track in the member's current stage.
    if v_stage_id is not null then
      for v_track in
        select t.id, t.key from public.business_path_stage_tracks st
        join public.business_path_tracks t on t.id = st.track_id
        where st.stage_id = v_stage_id and (v_path = 'full' or t.key not in ('skill', 'freelancing'))
      loop
        v_picked := 0;
        for v_bp in
          select bp.id from public.business_path_placements bp
          where bp.stage_id = v_stage_id and bp.track_id = v_track.id
            and (bp.specialization_id is null or public.is_business_path_specialization_unlocked(p_uid, bp.specialization_id))
          order by bp.due_date nulls last, bp.order_index
        loop
          exit when v_picked >= v_per_track_cap;
          if not public.is_business_path_placement_done(v_bp.id, p_uid) and public.business_path_placement_unlocked(v_bp.id, p_uid) then
            insert into public.daily_task_selections (uid, task_date, business_path_placement_id)
            values (p_uid, p_date, v_bp.id)
            on conflict (uid, task_date, business_path_placement_id) where content_assignment_id is null do nothing;
            v_picked := v_picked + 1;
          end if;
        end loop;
      end loop;
    end if;

    insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
    values (p_uid, 'daily_tasks_generated', 'daily_task_selections', p_uid::text, jsonb_build_object('date', p_date));
  end if;

  return coalesce((
    select jsonb_agg(combined.row_data order by combined.track_key nulls last, combined.due_date nulls last, combined.order_index)
    from (
      -- individual rows. Joined against business_path_tracks (not the old
      -- `tracks` table) for the optional UI-grouping label: content_assignments.
      -- track_id is repointed at business_path_tracks by 0054's detach, so
      -- this is the FK target that will actually resolve going forward --
      -- joining the old `tracks` table here would silently stop matching
      -- after 0054 and hard-error once 0055 drops it.
      select
        jsonb_build_object(
          'id', ca.id,
          'title', coalesce(ci.title, c.title, a.title),
          'description', coalesce(ci.description, c.description, a.instructions, ''),
          'taskType', ca.task_type,
          'xpReward', ca.xp_reward,
          'isRequired', ca.is_required,
          'dueDate', ca.due_date,
          'contentType', ci.content_type,
          'requiresAdminApproval', ca.requires_admin_approval,
          'evidenceStatus', (
            select ces.status from public.content_evidence_submissions ces
            where ces.content_assignment_id = ca.id and ces.uid = p_uid
          ),
          'trackKey', tr.key,
          'trackLabel', tr.label,
          'trackIcon', tr.icon,
          'isDone', public.is_content_assignment_done(ca.id, p_uid),
          'source', 'individual'
        ) as row_data,
        tr.key as track_key, ca.due_date as due_date, ca.order_index as order_index
      from public.daily_task_selections dts
      join public.content_assignments ca on ca.id = dts.content_assignment_id
      join public.content_items ci on ci.id = ca.content_item_id
      left join public.courses c on c.id = ci.course_id
      left join public.assignments a on a.id = ci.assignment_id
      left join public.business_path_tracks tr on tr.id = ca.track_id
      where dts.uid = p_uid and dts.task_date = p_date and dts.content_assignment_id is not null

      union all

      select
        jsonb_build_object(
          'id', bp.id,
          'title', coalesce(ci.title, c.title, a.title),
          'description', coalesce(ci.description, c.description, a.instructions, ''),
          'taskType', bp.task_type,
          'xpReward', bp.xp_reward,
          'isRequired', bp.is_required,
          'dueDate', bp.due_date,
          'contentType', ci.content_type,
          'requiresAdminApproval', bp.requires_admin_approval,
          'evidenceStatus', (
            select bes.status from public.business_path_evidence_submissions bes
            where bes.business_path_placement_id = bp.id and bes.uid = p_uid
          ),
          'trackKey', tr.key,
          'trackLabel', tr.label,
          'trackIcon', tr.icon,
          'isDone', public.is_business_path_placement_done(bp.id, p_uid),
          'source', 'business_path'
        ) as row_data,
        tr.key as track_key, bp.due_date as due_date, bp.order_index as order_index
      from public.daily_task_selections dts
      join public.business_path_placements bp on bp.id = dts.business_path_placement_id
      join public.content_items ci on ci.id = bp.content_item_id
      left join public.courses c on c.id = ci.course_id
      left join public.assignments a on a.id = ci.assignment_id
      left join public.business_path_tracks tr on tr.id = bp.track_id
      where dts.uid = p_uid and dts.task_date = p_date and dts.business_path_placement_id is not null
    ) combined
  ), '[]'::jsonb);
end;
$$;
-- CREATE OR REPLACE preserves the existing grants from 0044 (same name,
-- same signature) -- mirrors 0030's cutover comment on this exact point, no
-- new revoke/grant statements needed here.
