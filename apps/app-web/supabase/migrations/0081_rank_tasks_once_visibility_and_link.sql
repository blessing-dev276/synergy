-- Two real bugs in the member-facing rank task list, found together:
--
-- 1) get_my_rank_tasks' filter -- "not (recurrence = 'once' and
--    submission->>'status' = 'approved')" -- silently hid every one-time
--    task that has NO submission yet, not just approved ones. When
--    `submission` is null (nothing submitted), `submission->>'status'` is
--    null, `'once' and null` is null (three-valued logic, not false), and
--    `not null` is null -- which a WHERE clause treats as "exclude the
--    row," same as false. So a brand-new one-time task with zero
--    submissions never showed up for anyone, on Today's Tasks or /tasks,
--    until this migration. Daily tasks were never affected: recurrence
--    <> 'once' short-circuits the AND to false regardless of the null.
--
-- 2) An auto-tracked (proxy_type <> 'manual') task's row had nothing
--    clickable at all -- just an "Auto-tracked" label -- so a member had
--    no way to get from the task to the learning path (or /network/
--    prospects) it's actually tracking. Exposing proxy_path_id here lets
--    the frontend build that link (TaskList.jsx, Dashboard.jsx).
create or replace function public.get_my_rank_tasks()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rank_id uuid;
begin
  select rank_id into v_rank_id from public.profiles where id = v_uid;
  if v_rank_id is null then
    return '[]'::jsonb;
  end if;

  return coalesce((
    with my_tasks as (
      select
        t.id, t.title, t.description, t.recurrence, t.proxy_type, t.proxy_path_id, t.order_index,
        (
          select jsonb_build_object('id', s.id, 'status', s.status, 'submittedAt', s.submitted_at, 'reviewNote', s.review_note)
          from public.rank_task_submissions s
          where s.rank_task_id = t.id and s.uid = v_uid
            and (t.recurrence = 'once' or s.task_date = current_date)
          order by s.submitted_at desc
          limit 1
        ) as submission
      from public.rank_tasks t
      where t.rank_id = v_rank_id
    )
    select jsonb_agg(jsonb_build_object(
      'id', id, 'title', title, 'description', description, 'recurrence', recurrence,
      'proxyType', proxy_type, 'proxyPathId', proxy_path_id, 'submission', submission
    ) order by order_index)
    from my_tasks
    where not (recurrence = 'once' and coalesce(submission->>'status', '') = 'approved')
  ), '[]'::jsonb);
end;
$$;
-- CREATE OR REPLACE preserves existing grants (same name, same signature).
