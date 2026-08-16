-- Lets a set of lessons share one long YouTube video, each lesson being one
-- chapter/segment of it (e.g. a video's chapters mapped 1:1 onto a
-- module's lessons, all with the same content_body URL). start_seconds is
-- where playback begins for that lesson; end_seconds is where it stops
-- (null = play to the natural end of the video, e.g. the last chapter).

alter table public.lessons
  add column start_seconds int not null default 0 check (start_seconds >= 0),
  add column end_seconds int check (end_seconds is null or end_seconds > start_seconds);
