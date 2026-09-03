-- Member-facing Rank Journey page needs one thing nothing currently
-- exposes: "for rank X (not necessarily my own), which learning paths does
-- it require, and have I actually finished each one" -- the real gate
-- evaluate_rank_advancement (0082) uses to auto-file a rank_advancement_
-- request is "every learning path attached to a rank is 100% complete",
-- computed via is_regular_path_complete/is_mind_training_path_complete --
-- both internal-only (revoked from authenticated). This wraps them for a
-- single rank, callable by any member for any rank_id (ranks/
-- rank_learning_paths/learning_paths are already fully member-readable by
-- direct table select, see 0059 -- this exposes the same "is it done"
-- fact those tables can't compute client-side, nothing more sensitive).
--
-- Deliberately NOT bundling rank_tasks into this same RPC: they don't
-- gate advancement at all (evaluate_rank_advancement never looks at them),
-- and evaluating one for a rank that isn't the caller's current rank would
-- mean half-duplicating evaluate_rank_task_proxies' per-proxy-type logic
-- here too. The member's current rank's tasks already have a real,
-- complete answer via the existing get_my_rank_tasks() -- Rank Journey
-- reuses that as-is for the current rank, and simply doesn't claim a
-- task-level answer for a rank that isn't current.
create or replace function public.get_rank_learning_paths(p_rank_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from public.ranks where id = p_rank_id) then
    raise exception 'rank not found';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', lp.id,
      'title', lp.title,
      'section', lp.section,
      'courseCount', lp.course_count,
      'completed', case when lp.section = 'mind_training'
        then public.is_mind_training_path_complete(v_uid, lp.id)
        else public.is_regular_path_complete(v_uid, lp.id)
      end
    ) order by lp.order_index)
    from public.rank_learning_paths rlp
    join public.learning_paths lp on lp.id = rlp.learning_path_id
    where rlp.rank_id = p_rank_id
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.get_rank_learning_paths(uuid) from public, anon;
grant execute on function public.get_rank_learning_paths(uuid) to authenticated;
