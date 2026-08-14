-- Admin progression triage view (proposal section 6/15): one row per
-- active member with Level, per-track progress, current Stage, overdue
-- count, pending-review count, and personally-sponsored count -- so an
-- admin can spot who needs support without opening every profile.
-- One RPC, computed set-based, rather than the frontend looping
-- get_journey_overview per member (N+1 admin-only page, but still --
-- no reason to make 50+ round trips for a table).
create or replace function public.get_admin_progression_overview()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if coalesce(public.current_role(), '') <> 'admin' then
    raise exception 'permission denied: admin role required';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'uid', p.id,
      'displayName', p.display_name,
      'photoUrl', p.photo_url,
      'level', case when l.id is null then null else jsonb_build_object('id', l.id, 'label', l.label) end,
      'levelProgressPercent', public.compute_level_progress(p.id, l.id),
      'stage', case when s.id is null then null else jsonb_build_object('id', s.id, 'title', s.title) end,
      'trackProgress', (
        select coalesce(jsonb_object_agg(t.key, public.compute_track_progress(p.id, s.id, t.id)), '{}'::jsonb)
        from public.stage_tracks st
        join public.tracks t on t.id = st.track_id
        where st.stage_id = s.id
      ),
      'overdueCount', (
        select count(*) from public.content_assignments ca
        where ca.is_required = true and ca.due_date is not null and ca.due_date < now()
          and not public.is_content_assignment_done(ca.id, p.id)
          and (
            (ca.scope = 'individual' and ca.assigned_to_uid = p.id)
            or (
              ca.scope = 'stage_track' and ca.stage_id = s.id
              and (
                ca.specialization_id is null
                or ca.specialization_id = (
                  select specialization_id from public.member_track_specializations
                  where uid = p.id and track_id = ca.track_id
                )
              )
            )
          )
      ),
      'pendingReviewCount',
        (select count(*) from public.assignment_submissions where uid = p.id and status = 'submitted')
        + (select count(*) from public.content_evidence_submissions where uid = p.id and status = 'submitted'),
      'sponsoredCount', (select count(*) from public.sponsor_relationships where sponsor_uid = p.id and active = true),
      'officialRank', null
    ) order by p.display_name)
    from public.profiles p
    left join public.member_journey mj on mj.uid = p.id
    left join public.stages s on s.id = mj.current_stage_id
    left join public.levels l on l.id = s.level_id
    where p.role = 'member' and p.status = 'active'
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.get_admin_progression_overview() from public, anon;
grant execute on function public.get_admin_progression_overview() to authenticated;
