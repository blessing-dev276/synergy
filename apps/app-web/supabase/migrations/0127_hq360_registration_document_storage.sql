-- ================= HQ360 restructure v2: member document uploads =================
-- Reuses the existing private `onboarding` bucket (0105) rather than a new
-- one -- same private-bucket pattern, just an additional owner-scoped
-- insert policy so a member can upload their own signed registration
-- document to registration-documents/<uid>/..., matching the
-- storage.foldername(name)[n] = auth.uid()::text convention already used
-- elsewhere (0004_storage.sql).
create policy onboarding_member_upload_own_registration on storage.objects for insert
  with check (
    bucket_id = 'onboarding'
    and (storage.foldername(name))[1] = 'registration-documents'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
