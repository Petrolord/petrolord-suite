-- Drop legacy storage policies on the 'seismic' bucket.
--
-- seismic_read/write/update/delete predate the bucket itself (leftovers of
-- the seismic apps deleted in PR #21) and grant access by a dead
-- project-membership scheme: is_project_member/can_edit_project on
-- split_part(name,'/',1)::uuid. Besides being wrong for Seismolord's
-- owner-path convention ({user_id}/...), the unguarded ::uuid cast makes
-- ANY authenticated query over the bucket error out on objects whose first
-- path segment is not a uuid (e.g. test/manifest.json):
--   ERROR 22P02: invalid input syntax for type uuid
-- because OR-combined policy expressions are all evaluated per row.
--
-- The replacement owner-scoped policies were created in
-- 20260710170000_seismic_bucket_storage_policies.sql (text comparison, no
-- cast). The "Allow authenticated users to upload seismic files" policy is
-- deliberately kept — it targets the separate legacy 'seismic-files'
-- bucket, whose cleanup is tracked in Seismolord-STATUS.md.

drop policy if exists "seismic_read" on storage.objects;
drop policy if exists "seismic_write" on storage.objects;
drop policy if exists "seismic_update" on storage.objects;
drop policy if exists "seismic_delete" on storage.objects;
