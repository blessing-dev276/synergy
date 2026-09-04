-- ================= HQ360 restructure v2: migrate real Learning Hub content =================
-- Learning Hub's three sections, checked against real data before writing
-- this:
--   skill_set (Freelancing): 6 courses, 8 modules, 9 lessons, 14 real
--     lesson_progress rows -- real, substantial, and its shape (course >
--     module > lesson) maps cleanly onto classes > class_modules >
--     class_module_items. Migrated below, progress preserved.
--   nm_business (Network Marketing): 21 paths, only 3 courses, all three
--     genuinely empty (0 modules, 0 lessons each -- confirmed, not a query
--     artifact). Nothing of substance to migrate; skipped rather than
--     creating 3 empty shell classes with no content and calling it a
--     migration.
--   mind_training: its OWN bespoke schema (mind_training_levels/modules/
--     lessons/activities/assessments), not learning_paths/courses/lessons.
--     116 real lessons, 62 real activities, 75 real progress rows across
--     both. Structurally incompatible with the 6-type class_module_items
--     model (activities have no equivalent item type) and far too large/
--     real to force through a lossy conversion. Deliberately NOT migrated
--     -- kept exactly as is, still reachable (see MemberLayout.jsx), not
--     folded into Training.
--
-- Two of the 9 lessons have content_type='text' + completion_rule=
-- 'quiz_pass' (a lesson-level quiz via the OLD quizzes/quiz_questions
-- tables, unrelated to the new exam engine). Converting those two quizzes
-- into real exams/questions was out of scope for this pass -- they migrate
-- as plain article/video items (manual completion) rather than gaining a
-- fabricated quiz requirement they didn't earn.
do $$
declare
  v_course record;
  v_module record;
  v_lesson record;
  v_progress record;
  v_class_id uuid;
  v_module_id uuid;
  v_resource_id uuid;
  v_item_id uuid;
  v_module_order int;
  v_item_order int;
begin
  for v_course in
    select c.* from public.courses c
    join public.learning_paths lp on lp.id = c.path_id
    where lp.section = 'skill_set'
    order by c.order_index
  loop
    -- Skip genuinely empty, unpublished courses (nothing to preserve).
    if v_course.module_count = 0 and v_course.lesson_count = 0 and not v_course.published then
      continue;
    end if;

    insert into public.classes (title, description, status, purpose, created_at)
    values (v_course.title, nullif(v_course.description, ''), case when v_course.published then 'published' else 'draft' end, 'skill_development', v_course.created_at)
    returning id into v_class_id;

    -- A published course with real description but zero lessons (e.g.
    -- "What Are Digital Skills?") keeps that real intro content as a
    -- single article item instead of becoming an empty class.
    if not exists (select 1 from public.modules where course_id = v_course.id) then
      if coalesce(v_course.description, '') <> '' then
        insert into public.class_modules (class_id, title, order_index) values (v_class_id, 'Overview', 1) returning id into v_module_id;
        insert into public.class_module_items (module_id, type, title, body, order_index)
        values (v_module_id, 'article', v_course.title, v_course.description, 1);
      end if;
      continue;
    end if;

    v_module_order := 0;
    for v_module in select * from public.modules where course_id = v_course.id order by order_index loop
      v_module_order := v_module_order + 1;
      insert into public.class_modules (class_id, title, order_index)
      values (v_class_id, v_module.title, v_module_order)
      returning id into v_module_id;

      v_item_order := 0;
      for v_lesson in select * from public.lessons where module_id = v_module.id order by order_index loop
        v_item_order := v_item_order + 1;

        if v_lesson.content_type = 'video' then
          insert into public.resources (title, file_url, file_type, purpose)
          values (v_lesson.title, v_lesson.content_body, 'video', 'skill_set')
          returning id into v_resource_id;
          insert into public.class_module_items (module_id, type, title, resource_id, order_index)
          values (v_module_id, 'video', v_lesson.title, v_resource_id, v_item_order)
          returning id into v_item_id;
        else
          -- 'text' (and any 'link'/'pdf' outlier) becomes an article --
          -- content_body is real prose in every actual skill_set lesson
          -- (checked: no pdf-type lessons exist in this section).
          insert into public.class_module_items (module_id, type, title, body, order_index)
          values (v_module_id, 'article', v_lesson.title, coalesce(nullif(v_lesson.content_body, ''), v_lesson.title), v_item_order)
          returning id into v_item_id;
        end if;

        -- Preserve every real member's real progress on this lesson.
        for v_progress in select * from public.lesson_progress where lesson_id = v_lesson.id loop
          insert into public.class_item_progress (item_id, user_id, status, completed_at)
          values (v_item_id, v_progress.uid, v_progress.status, v_progress.completed_at)
          on conflict (item_id, user_id) do nothing;
        end loop;
      end loop;
    end loop;
  end loop;
end;
$$;
