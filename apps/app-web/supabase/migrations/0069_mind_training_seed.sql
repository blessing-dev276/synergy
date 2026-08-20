-- Mind Training restructure, part 4 of 4: seed data. The one Mind Training
-- path already in the database ("MINDSET FOUNDATION", unpublished, not
-- linked to any rank -- so no member has ever seen it) is reused as
-- Learning Path 1 rather than replaced, since it's already correctly named
-- and completely unseen so far. Its one orphaned courses row ("What Is
-- Mindset?", an empty unpublished course from before this restructure) is
-- deleted -- nothing in the new system reads courses for Mind Training
-- content anymore, so it would just be permanently invisible clutter
-- otherwise. The other 9 paths from the spec are inserted fresh, unpublished
-- (empty of content until an admin builds them out in the new Mind Training
-- manager) -- same "admin publishes when ready" convention every existing
-- learning path already follows. None of these are linked to a rank here;
-- that's an unrelated existing admin action (RankBuilder.jsx's rank <->
-- learning-path picker, unchanged by this restructure, already works for a
-- learning_paths row of any section).

update public.learning_paths
  set title = 'Mindset Foundation', order_index = 1
  where id = '734b8850-e743-4323-9096-b99696e61c9f' and section = 'mind_training';

delete from public.courses where path_id = '734b8850-e743-4323-9096-b99696e61c9f';

insert into public.learning_paths (title, section, order_index, published)
values
  ('Self-Awareness & Self-Mastery', 'mind_training', 2, false),
  ('Goals, Vision & Ambition', 'mind_training', 3, false),
  ('Discipline & Habits', 'mind_training', 4, false),
  ('Focus, Productivity & Execution', 'mind_training', 5, false),
  ('Failure, Rejection & Resilience', 'mind_training', 6, false),
  ('Emotional Intelligence', 'mind_training', 7, false),
  ('Confidence, Courage & Communication', 'mind_training', 8, false),
  ('Success, Money & Abundance Mindset', 'mind_training', 9, false),
  ('Leadership & The Synergy Mind', 'mind_training', 10, false);
