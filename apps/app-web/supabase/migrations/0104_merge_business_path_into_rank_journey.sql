-- Business Path and Rank Journey turned out to be the same thing in this
-- deployment: the real, admin-configured rank ladder (Foundation, Skill
-- Builder, Business Starter, Business Builder, Growth, Leadership) already
-- mirrors the six-stage business-development curriculum Business Path
-- seeded (Foundation, Skill Building, Get to Work, Build, Grow, Lead) --
-- same six steps, same order, just two different names for each one. Two
-- separate roadmap pages for the same progression was confusing, not
-- complementary, so this merges Business Path's real content (the
-- auto-detected + self-checked milestones -- genuinely richer than what
-- Rank Journey had, which was only learning paths + rank tasks) into Rank
-- Journey, rather than keeping a second page.
--
-- Table names stay business_path_* -- same "don't rename internal storage
-- just because the product surface changed" call as Business Path ->
-- Rank Journey itself: renaming would touch every reference for zero
-- functional benefit. What changes is that a stage now points at the real
-- rank it corresponds to, and a rank's milestones are readable by rank_id,
-- for Rank Journey to render alongside its existing Learning/Rank
-- Activities groups.

alter table public.business_path_stages add column rank_id uuid references public.ranks(id);

-- Match the Nth stage (by order_index) to the Nth rank (by order_index) --
-- position-based, not a numeric order_index match, since the two tables'
-- order_index values were never guaranteed to line up exactly. Only
-- backfills as many stages as there are ranks; any leftover stage (more
-- stages configured than ranks exist) simply keeps rank_id null and won't
-- surface on Rank Journey until an admin points it at a rank.
with ranked_ranks as (
  select id, row_number() over (order by order_index) as rn from public.ranks
),
ranked_stages as (
  select id, row_number() over (order by order_index) as rn from public.business_path_stages
)
update public.business_path_stages bps
set rank_id = rr.id
from ranked_stages rs
join ranked_ranks rr on rr.rn = rs.rn
where bps.id = rs.id;

create index business_path_stages_rank_idx on public.business_path_stages (rank_id);

-- ================= member: a rank's milestones (real completion, any rank) =================
-- Mirrors get_rank_learning_paths (0100) exactly -- works for any rank,
-- not just the caller's current one, since every milestone here is either
-- a real fact about the member (auto_key) or their own self-check
-- (business_path_milestone_completions), neither of which depends on
-- which rank happens to be theirs right now.
create or replace function public.get_rank_milestones(p_rank_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_stage record;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from public.ranks where id = p_rank_id) then
    raise exception 'rank not found';
  end if;

  select id, title, purpose, description into v_stage
    from public.business_path_stages where rank_id = p_rank_id;

  if v_stage.id is null then
    return jsonb_build_object('stagePurpose', null, 'stageDescription', null, 'milestones', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'stagePurpose', v_stage.purpose,
    'stageDescription', v_stage.description,
    'milestones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'title', m.title,
        'description', m.description,
        'autoKey', m.auto_key,
        'linkTo', m.link_to,
        'linkLabel', m.link_label,
        'done', case when m.auto_key is not null
          then public.evaluate_business_path_auto_key(v_uid, m.auto_key)
          else exists(
            select 1 from public.business_path_milestone_completions c
            where c.milestone_id = m.id and c.uid = v_uid
          )
        end,
        'completedAt', (
          select c.completed_at from public.business_path_milestone_completions c
          where c.milestone_id = m.id and c.uid = v_uid
        )
      ) order by m.order_index)
      from public.business_path_milestones m
      where m.stage_id = v_stage.id
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.get_rank_milestones(uuid) from public, anon;
grant execute on function public.get_rank_milestones(uuid) to authenticated;
