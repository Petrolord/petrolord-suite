-- Contour Map Digitizer: the scanned map image kept with the project
-- (Mapping U2-020). Owner released 2026-10-01.
-- Design: docs/scope/DigitizerImageStorage-DESIGN-AND-STATUS.md.
--
-- Until now a saved Digitizer project kept the image's name and size and
-- asked for the image again on load. This adds a PRIVATE bucket for those
-- images and the policies that keep each owner inside their own folder.
--
--   bucket  digitizer-images, public = false (no public URL),
--           25 MB per file, PNG / JPEG / WebP only (enforced by the Storage
--           service from this row)
--   path    <owner user id>/<project id>/map.<ext>
--
-- storage.objects policies, all for this bucket only, all to authenticated:
--   select, insert, update, delete   first folder = auth.uid()
-- There is no policy for anon: anon reads and writes nothing in this bucket.
-- The bucket-less live policy "Allow user to update own files" does not
-- reach into it: a moved row must also be readable by the caller, and the
-- read policy admits only the caller's own folder (proven by
-- tools/validation/digitizer-images, which also shows what to add if the
-- read policy is ever widened).
-- Organisation members do not read a shared project's image through this
-- change (Digitizer projects are personal; the organisation sharing wave may
-- extend the read policy).
--
-- No table is created or altered; public.contour_projects is untouched (the
-- object path rides in its contours jsonb). No grant is changed.
--
-- Idempotent. The whole file is ONE DO statement, so it runs as one
-- transaction however it is sent, and it carries no begin or commit line: a
-- dry run that wraps it in begin ... rollback really rolls back.

do $digitizer$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('digitizer-images', 'digitizer-images', false, 26214400, array['image/png', 'image/jpeg', 'image/webp'])
  on conflict (id) do update
    set public = false,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  drop policy if exists "digitizer_images_select_own" on storage.objects;
  create policy "digitizer_images_select_own"
    on storage.objects for select to authenticated
    using (
      bucket_id = 'digitizer-images'
      and (storage.foldername(name))[1] = auth.uid()::text
    );

  drop policy if exists "digitizer_images_insert_own" on storage.objects;
  create policy "digitizer_images_insert_own"
    on storage.objects for insert to authenticated
    with check (
      bucket_id = 'digitizer-images'
      and (storage.foldername(name))[1] = auth.uid()::text
    );

  drop policy if exists "digitizer_images_update_own" on storage.objects;
  create policy "digitizer_images_update_own"
    on storage.objects for update to authenticated
    using (
      bucket_id = 'digitizer-images'
      and (storage.foldername(name))[1] = auth.uid()::text
    )
    with check (
      bucket_id = 'digitizer-images'
      and (storage.foldername(name))[1] = auth.uid()::text
    );

  drop policy if exists "digitizer_images_delete_own" on storage.objects;
  create policy "digitizer_images_delete_own"
    on storage.objects for delete to authenticated
    using (
      bucket_id = 'digitizer-images'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
end
$digitizer$;
