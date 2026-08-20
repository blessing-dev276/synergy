-- RankTasksPanel (RankBuilder.jsx) had no reorder control at all for a
-- rank's tasks -- unlike every other admin list in this app (paths,
-- courses, ranks themselves), which all use up/down arrows swapping two
-- adjacent order_index values via direct client writes. Tasks get a real
-- drag-and-drop reorder instead (RankTasksPanel), which needs a "replace
-- the whole order in one call" RPC rather than a pairwise swap -- same
-- shape as admin_set_rank_learning_paths (0060), not the arrow-swap
-- pattern, since a drop can move an item multiple positions at once.
create or replace function public.admin_reorder_rank_tasks(p_rank_id uuid, p_task_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected_count int;
  v_given_count int;
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;
  if not exists (select 1 from public.ranks where id = p_rank_id) then
    raise exception 'rank not found';
  end if;

  select count(*) into v_expected_count from public.rank_tasks where rank_id = p_rank_id;
  select count(*) into v_given_count from unnest(coalesce(p_task_ids, '{}'::uuid[])) t(id) where exists (
    select 1 from public.rank_tasks rt where rt.id = t.id and rt.rank_id = p_rank_id
  );
  if v_given_count <> v_expected_count or v_given_count <> coalesce(array_length(p_task_ids, 1), 0) then
    raise exception 'task list does not match this rank''s tasks';
  end if;

  update public.rank_tasks rt
    set order_index = ord.position, updated_at = now()
    from unnest(p_task_ids) with ordinality as ord(task_id, position)
    where rt.id = ord.task_id;
end;
$$;

revoke execute on function public.admin_reorder_rank_tasks(uuid, uuid[]) from public, anon;
grant execute on function public.admin_reorder_rank_tasks(uuid, uuid[]) to authenticated;
