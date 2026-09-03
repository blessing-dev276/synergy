-- ================= HQ360 restructure: storage bucket for `resources` PDFs =================
-- 0105 created the `resources` table (file_url = storage path for pdf,
-- external URL for podcast/video, per §4.1) but never created a bucket for
-- it -- only the `onboarding` bucket. Personal/Income Development's admin
-- upload flow needs somewhere for pdf uploads to land. Same private-bucket
-- + signed-URL pattern as `onboarding` (0105) and `course-content` (0004).

insert into storage.buckets (id, name, public)
values ('resources', 'resources', false)
on conflict (id) do nothing;

create policy resources_bucket_read on storage.objects for select
  using (bucket_id = 'resources' and auth.role() = 'authenticated');
create policy resources_bucket_write on storage.objects for insert
  with check (bucket_id = 'resources' and public.current_role() in ('admin', 'mentor'));
create policy resources_bucket_update on storage.objects for update
  using (bucket_id = 'resources' and public.current_role() in ('admin', 'mentor'));
create policy resources_bucket_delete on storage.objects for delete
  using (bucket_id = 'resources' and public.current_role() in ('admin', 'mentor'));
