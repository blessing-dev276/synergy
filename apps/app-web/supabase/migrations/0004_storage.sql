-- Storage buckets + RLS policies on storage.objects (Supabase applies
-- Postgres RLS to storage too). All buckets are private — reads go through
-- authenticated download()/createSignedUrl() calls, not public URLs.

insert into storage.buckets (id, name, public)
values
  ('profile-photos', 'profile-photos', false),
  ('assignment-submissions', 'assignment-submissions', false),
  ('course-content', 'course-content', false)
on conflict (id) do nothing;

-- profile-photos: path is "{uid}/...", owner-write, any authenticated read.
create policy profile_photos_read on storage.objects for select
  using (bucket_id = 'profile-photos' and auth.role() = 'authenticated');
create policy profile_photos_write on storage.objects for insert
  with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy profile_photos_update on storage.objects for update
  using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy profile_photos_delete on storage.objects for delete
  using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- assignment-submissions: path is "{uid}/{assignment_id}/...", owner-write,
-- read for the owner, an admin, or the owner's assigned mentor.
create policy assignment_submissions_read on storage.objects for select
  using (
    bucket_id = 'assignment-submissions' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.current_role() = 'admin'
      or public.is_assigned_mentor_of(((storage.foldername(name))[1])::uuid)
    )
  );
create policy assignment_submissions_write on storage.objects for insert
  with check (bucket_id = 'assignment-submissions' and (storage.foldername(name))[1] = auth.uid()::text);

-- course-content: admin-write, any authenticated read.
create policy course_content_read on storage.objects for select
  using (bucket_id = 'course-content' and auth.role() = 'authenticated');
create policy course_content_write on storage.objects for insert
  with check (bucket_id = 'course-content' and public.current_role() = 'admin');
create policy course_content_update on storage.objects for update
  using (bucket_id = 'course-content' and public.current_role() = 'admin');
create policy course_content_delete on storage.objects for delete
  using (bucket_id = 'course-content' and public.current_role() = 'admin');
