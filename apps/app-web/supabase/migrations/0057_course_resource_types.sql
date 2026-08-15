-- Learning Hub: a "class" (learning_path) needs to hold more than
-- structured courses -- a curated book/podcast/video/link is a common,
-- much lighter kind of entry (esp. under Mind Training, where nothing
-- needs modules/lessons at all). Rather than a parallel table, this adds a
-- type to the existing courses row: resource_type='course' keeps today's
-- behavior exactly (admin drills into CourseEditor to build modules/
-- lessons -- the 3 real courses with real lesson content, e.g. "Graphic
-- Design Basics" with 6 lessons, are untouched by the default). Any other
-- type is a standalone link -- resource_url is the whole payload, no
-- lesson-building needed.

alter table public.courses
  add column resource_type text not null default 'course'
    check (resource_type in ('course', 'video', 'book', 'podcast', 'link', 'pdf')),
  add column resource_url text not null default '',
  add column resource_author text not null default '';
