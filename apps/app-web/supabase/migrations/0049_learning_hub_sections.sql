-- Learning Hub restructure: group learning_paths into three top-level
-- sections (Udemy-style catalog tabs) — Skill Set Training, Network
-- Marketing Business Training, and Mind Training. Exactly three, fixed —
-- unlike track_specializations (0017), this isn't an admin-configurable
-- taxonomy, so a plain checked text column is the right size, not a new
-- lookup table.
--
-- All 6 existing learning_paths (Graphic & Design, GoHighLevel CRM
-- Specialist, Ai Video, Mobile App Development, Fiverr, Upwork) are digital
-- skills, so the column default backfills every existing row to
-- 'skill_set' for free. Network Marketing Business Training and Mind
-- Training start empty — admins add paths into them the same way, just
-- scoped to whichever tab is open.

alter table public.learning_paths
  add column section text not null default 'skill_set'
  check (section in ('skill_set', 'nm_business', 'mind_training'));

create index learning_paths_section_idx on public.learning_paths (section, order_index);

-- ---------- member-facing catalog: now section-aware ----------
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
      'section', lp.section,
      'specializationId', lp.specialization_id,
      'locked', lp.specialization_id is not null and not public.is_specialization_unlocked(auth.uid(), lp.specialization_id)
    ) order by lp.order_index)
    from public.learning_paths lp
    where lp.published = true
  ), '[]'::jsonb);
end;
$$;
