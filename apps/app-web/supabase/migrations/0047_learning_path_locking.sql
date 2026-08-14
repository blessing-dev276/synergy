-- Bug: the "Learning" catalog (learning_paths -> PathList.jsx/PathDetail.jsx)
-- predates the specialization-lock system (0038) and was never wired into
-- it -- members could browse/open every learning path regardless of the one
-- skill they'd chosen, even though the Dashboard's track cards already
-- enforce the lock correctly via is_specialization_unlocked.
--
-- learning_paths has no track/specialization concept at all today, so this
-- adds a nullable specialization_id (mirrors content_assignments.specialization_id,
-- 0027) and backfills the three paths that clearly correspond to the seeded
-- 'skill' track specializations (0017's graphics_design/gohighlevel_crm/
-- flutterflow). Paths that aren't part of that three-way branch (Ai Video,
-- Fiverr, Upwork, and any future ones) are intentionally left unspecialized
-- (null) -- same "null = applies to everyone" convention as
-- content_assignments -- so they stay unlocked for everyone; only an admin
-- explicitly tagging a path locks it to a specialization.

alter table public.learning_paths add column specialization_id uuid references public.track_specializations(id);

update public.learning_paths lp
set specialization_id = ts.id
from public.track_specializations ts
where ts.key = 'graphics_design' and lp.title ilike 'Graphics Design';

update public.learning_paths lp
set specialization_id = ts.id
from public.track_specializations ts
where ts.key = 'gohighlevel_crm' and lp.title ilike '%GoHighLevel%';

update public.learning_paths lp
set specialization_id = ts.id
from public.track_specializations ts
where ts.key = 'flutterflow' and (lp.title ilike '%FlutterFlow%' or lp.title ilike '%Mobile App Development%');

-- ---------- member-facing: published paths with the lock computed server-side ----------
-- Self-view only (no p_uid param) -- this is the member's own catalog
-- browse, same scoping as e.g. get_my_content_assignments.
create or replace function public.get_learning_paths()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', lp.id,
      'title', lp.title,
      'description', lp.description,
      'courseCount', lp.course_count,
      'specializationId', lp.specialization_id,
      'locked', lp.specialization_id is not null and not public.is_specialization_unlocked(auth.uid(), lp.specialization_id)
    ) order by lp.order_index)
    from public.learning_paths lp
    where lp.published = true
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.get_learning_paths() from public, anon;
grant execute on function public.get_learning_paths() to authenticated;
