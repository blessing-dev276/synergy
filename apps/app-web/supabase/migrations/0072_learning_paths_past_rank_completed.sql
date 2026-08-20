-- get_learning_paths (0060, then untouched): rank-attached visibility was
-- an exact match against the caller's own rank_id -- reach Rank 2 and a
-- path attached only to Rank 1 disappeared from the catalog entirely, even
-- though nothing stops the member from having already worked through it.
-- Business rule from the product owner: once a member has moved past a
-- rank, that rank's paths stay visible (so they can retake them anytime)
-- and show up marked 'completed' instead of vanishing. A path attached to
-- the member's *current* rank is still just "available", not completed --
-- only ranks strictly behind the member's own count. Unattached paths
-- (visible to everyone, 0047's convention) are never marked completed by
-- this rule; nothing here changes future-rank paths staying hidden.
create or replace function public.get_learning_paths()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rank_id uuid;
  v_rank_order int;
  v_path text;
begin
  select p.rank_id, coalesce(p.participation_path, 'full')
    into v_rank_id, v_path
    from public.profiles p where p.id = v_uid;

  select order_index into v_rank_order from public.ranks where id = v_rank_id;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', lp.id,
      'title', lp.title,
      'description', lp.description,
      'courseCount', lp.course_count,
      'section', lp.section,
      'completed', coalesce((
        select min(r.order_index) < v_rank_order
        from public.rank_learning_paths rlp
        join public.ranks r on r.id = rlp.rank_id
        where rlp.learning_path_id = lp.id
      ), false)
    ) order by lp.order_index)
    from public.learning_paths lp
    where lp.published = true
      and (v_path <> 'network_marketing_only' or not lp.is_skill)
      and (
        not exists (select 1 from public.rank_learning_paths rlp where rlp.learning_path_id = lp.id)
        or exists (
          select 1 from public.rank_learning_paths rlp
          join public.ranks r on r.id = rlp.rank_id
          where rlp.learning_path_id = lp.id
            and v_rank_order is not null
            and r.order_index <= v_rank_order
        )
      )
  ), '[]'::jsonb);
end;
$$;
-- CREATE OR REPLACE preserves the existing grants (same name, same
-- signature) -- no new revoke/grant statements needed.
