-- admin_set_rank_learning_paths (0060) only ever cleaned up stale rows for
-- the ONE rank_id being replaced ("delete ... where rank_id = p_rank_id and
-- learning_path_id <> all (...)") -- it never touched a path's row under a
-- DIFFERENT rank. RankBuilder.jsx's whole UI assumes a path belongs to at
-- most one rank (a path already attached elsewhere is filtered out of every
-- other rank's picker, so it can't normally be double-attached through the
-- UI) -- but nothing enforced that invariant at the write layer, and once a
-- path *is* double-attached (a stale picker mid-load, or a direct write),
-- that same "attached elsewhere" filter makes it invisible in EVERY rank's
-- checklist from then on, with no UI path back to fixing it. Found live: 4
-- nm_business paths ended up attached to both Newbie and Pro.
--
-- Fix: before inserting a path under p_rank_id, delete any row for that
-- path under every OTHER rank too -- enforces "at most one rank per path"
-- at the RPC itself, not just as a UI-level assumption.
create or replace function public.admin_set_rank_learning_paths(p_rank_id uuid, p_learning_path_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;
  if not exists (select 1 from public.ranks where id = p_rank_id) then
    raise exception 'rank not found';
  end if;

  delete from public.rank_learning_paths
    where rank_id = p_rank_id
      and learning_path_id <> all (coalesce(p_learning_path_ids, '{}'::uuid[]));

  delete from public.rank_learning_paths
    where rank_id <> p_rank_id
      and learning_path_id = any (coalesce(p_learning_path_ids, '{}'::uuid[]));

  insert into public.rank_learning_paths (rank_id, learning_path_id)
  select p_rank_id, lp_id
  from unnest(coalesce(p_learning_path_ids, '{}'::uuid[])) as lp_id
  on conflict (rank_id, learning_path_id) do nothing;

  insert into public.activity_log (actor_uid, action, target_type, target_id, metadata)
  values (auth.uid(), 'rank_learning_paths_set', 'rank', p_rank_id::text, jsonb_build_object('learning_path_ids', p_learning_path_ids));
end;
$$;
-- CREATE OR REPLACE preserves existing grants (same name, same signature).
