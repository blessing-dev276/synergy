-- Personal Development: drop the 'book' resource type -- PDF now covers
-- that ground (it already supported both a file upload and an external
-- link, same as book did). Existing 'book' rows are relabeled 'pdf' first
-- so the type-check swap below never orphans a row.

update public.pd_resources set resource_type = 'pdf' where resource_type = 'book';

alter table public.pd_resources drop constraint pd_resources_resource_type_check;
alter table public.pd_resources add constraint pd_resources_resource_type_check
  check (resource_type in ('podcast', 'video', 'pdf', 'workbook', 'article', 'template', 'other'));
