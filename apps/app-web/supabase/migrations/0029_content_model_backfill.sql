-- Content/Journey model refactor, part 3 of 5: one-time data migration.
-- Converts existing tasks/task_completions/task_dependencies into
-- content_items/content_assignments/member_progress/content_assignment_dependencies.
-- `tasks` and friends are NOT dropped here -- 0031 does that, only after the
-- verification queries in the plan doc are run manually and the frontend
-- deploy that stops querying `tasks` directly is confirmed live.
--
-- Grouping key for legacy `tasks` rows deliberately does NOT use title
-- alone (that risks merging two unrelated members' private one-off notes
-- that happen to share a title) -- it groups by everything one
-- StageBuilder.jsx NewTaskForm submission shares in a single insert.
-- Groups of >1 are confident fan-outs and collapse into one stage_track
-- placement (fixing the "members who arrive later don't get it" gap).
-- Groups of exactly 1 are ambiguous (a fan-out to a single-member stage, or
-- a genuine one-off) and are conservatively kept as individual placements,
-- preserving today's exact visibility for that member.

create table public._journey_migration_map (
  task_id uuid primary key references public.tasks(id),
  content_item_id uuid not null references public.content_items(id),
  content_assignment_id uuid not null references public.content_assignments(id)
);

do $$
declare
  v_course record;
  v_assignment record;
  v_task record;
  v_group record;
  v_content_item_id uuid;
  v_content_assignment_id uuid;
begin
  -- ---------- Step 1: backfill content_items for every existing course/assignment ----------
  -- (the 0028 trigger only covers rows inserted after it went live)
  for v_course in select * from public.courses loop
    insert into public.content_items (content_type, course_id, created_by, created_at)
    values ('course', v_course.id, v_course.created_by, v_course.created_at)
    on conflict (course_id) where course_id is not null do nothing;
  end loop;

  for v_assignment in select * from public.assignments loop
    insert into public.content_items (content_type, assignment_id, created_by, created_at)
    values ('assignment', v_assignment.id, null, now())
    on conflict (assignment_id) where assignment_id is not null do nothing;
  end loop;

  -- ---------- Step 2: scope='global' tasks -> one content_assignment each ----------
  for v_task in select * from public.tasks where scope = 'global' loop
    if v_task.linked_course_id is not null then
      select id into v_content_item_id from public.content_items where course_id = v_task.linked_course_id;
    elsif v_task.linked_assignment_id is not null then
      select id into v_content_item_id from public.content_items where assignment_id = v_task.linked_assignment_id;
    else
      insert into public.content_items (content_type, title, description, created_by, created_at)
      values ('bare', v_task.title, v_task.description, v_task.created_by, now())
      returning id into v_content_item_id;
    end if;

    insert into public.content_assignments (
      content_item_id, stage_id, track_id, specialization_id, task_type, xp_reward,
      is_required, requires_admin_approval, due_date, scope, assigned_to_uid, created_by
    ) values (
      v_content_item_id, v_task.stage_id, v_task.track_id, v_task.specialization_id, v_task.task_type,
      v_task.xp_reward, v_task.is_required, v_task.requires_admin_approval, v_task.due_date,
      case when v_task.stage_id is not null and v_task.track_id is not null then 'stage_track' else 'individual' end,
      case when v_task.stage_id is not null and v_task.track_id is not null then null else v_task.assigned_to_uid end,
      v_task.created_by
    )
    returning id into v_content_assignment_id;

    insert into public._journey_migration_map (task_id, content_item_id, content_assignment_id)
    values (v_task.id, v_content_item_id, v_content_assignment_id);
  end loop;

  -- ---------- Step 3: scope='individual' + stage_id set -> grouped collapse ----------
  for v_group in
    select
      stage_id, track_id, title, description, task_type, xp_reward,
      is_required, requires_admin_approval, linked_course_id, linked_assignment_id,
      specialization_id, due_date, created_by,
      array_agg(id) as task_ids,
      count(*) as n
    from public.tasks
    where scope = 'individual' and stage_id is not null
    group by stage_id, track_id, title, description, task_type, xp_reward,
      is_required, requires_admin_approval, linked_course_id, linked_assignment_id,
      specialization_id, due_date, created_by
  loop
    if v_group.linked_course_id is not null then
      select id into v_content_item_id from public.content_items where course_id = v_group.linked_course_id;
    elsif v_group.linked_assignment_id is not null then
      select id into v_content_item_id from public.content_items where assignment_id = v_group.linked_assignment_id;
    else
      insert into public.content_items (content_type, title, description, created_by, created_at)
      values ('bare', v_group.title, v_group.description, v_group.created_by, now())
      returning id into v_content_item_id;
    end if;

    if v_group.n > 1 then
      insert into public.content_assignments (
        content_item_id, stage_id, track_id, specialization_id, task_type, xp_reward,
        is_required, requires_admin_approval, due_date, scope, assigned_to_uid, created_by
      ) values (
        v_content_item_id, v_group.stage_id, v_group.track_id, v_group.specialization_id, v_group.task_type,
        v_group.xp_reward, v_group.is_required, v_group.requires_admin_approval, v_group.due_date,
        'stage_track', null, v_group.created_by
      )
      returning id into v_content_assignment_id;

      insert into public._journey_migration_map (task_id, content_item_id, content_assignment_id)
      select unnest(v_group.task_ids), v_content_item_id, v_content_assignment_id;
    else
      insert into public.content_assignments (
        content_item_id, stage_id, track_id, specialization_id, task_type, xp_reward,
        is_required, requires_admin_approval, due_date, scope, assigned_to_uid, created_by
      )
      select v_content_item_id, v_group.stage_id, v_group.track_id, v_group.specialization_id, v_group.task_type,
        v_group.xp_reward, v_group.is_required, v_group.requires_admin_approval, v_group.due_date,
        'individual', t.assigned_to_uid, v_group.created_by
      from public.tasks t where t.id = v_group.task_ids[1]
      returning id into v_content_assignment_id;

      insert into public._journey_migration_map (task_id, content_item_id, content_assignment_id)
      values (v_group.task_ids[1], v_content_item_id, v_content_assignment_id);
    end if;
  end loop;

  -- ---------- Step 4: scope='individual' + stage_id null -> always 1:1 ----------
  for v_task in select * from public.tasks where scope = 'individual' and stage_id is null loop
    if v_task.linked_course_id is not null then
      select id into v_content_item_id from public.content_items where course_id = v_task.linked_course_id;
    elsif v_task.linked_assignment_id is not null then
      select id into v_content_item_id from public.content_items where assignment_id = v_task.linked_assignment_id;
    else
      insert into public.content_items (content_type, title, description, created_by, created_at)
      values ('bare', v_task.title, v_task.description, v_task.created_by, now())
      returning id into v_content_item_id;
    end if;

    insert into public.content_assignments (
      content_item_id, stage_id, track_id, specialization_id, task_type, xp_reward,
      is_required, requires_admin_approval, due_date, scope, assigned_to_uid, created_by
    ) values (
      v_content_item_id, null, v_task.track_id, v_task.specialization_id, v_task.task_type,
      v_task.xp_reward, v_task.is_required, v_task.requires_admin_approval, v_task.due_date,
      'individual', v_task.assigned_to_uid, v_task.created_by
    )
    returning id into v_content_assignment_id;

    insert into public._journey_migration_map (task_id, content_item_id, content_assignment_id)
    values (v_task.id, v_content_item_id, v_content_assignment_id);
  end loop;
end $$;

-- ---------- Step 5: task_completions -> member_progress (bare/self-attested only) ----------
insert into public.member_progress (uid, content_assignment_id, completed_at)
select tc.uid, m.content_assignment_id, coalesce(tc.completed_at, now())
from public.task_completions tc
join public._journey_migration_map m on m.task_id = tc.task_id
where tc.completed = true
on conflict (uid, content_assignment_id) do nothing;

-- ---------- Step 6: task_dependencies -> content_assignment_dependencies ----------
-- Expected empty (zero admin UI ever wrote to task_dependencies) -- handled
-- generically for correctness. Self-referential rows that would result from
-- Step 3's collapse (two dependent tasks landing in the same group) are
-- filtered out rather than silently inserted.
insert into public.content_assignment_dependencies (content_assignment_id, depends_on_content_assignment_id)
select distinct m1.content_assignment_id, m2.content_assignment_id
from public.task_dependencies td
join public._journey_migration_map m1 on m1.task_id = td.task_id
join public._journey_migration_map m2 on m2.task_id = td.depends_on_task_id
where m1.content_assignment_id <> m2.content_assignment_id
on conflict do nothing;
