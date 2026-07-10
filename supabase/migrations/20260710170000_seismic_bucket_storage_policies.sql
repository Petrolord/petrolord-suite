-- Storage RLS for the private 'seismic' bucket (Seismolord Phase 0).
--
-- Owner-path convention: every user-owned object lives under
--   seismic/{auth.uid()}/...
-- so the client can read/write its own bricks and manifests DIRECTLY with
-- its JWT — no Edge Function hop in the brick-fetch hot path (plan of
-- record, decision #4/#6). Objects outside a user folder (e.g. the
-- walking-skeleton's test/manifest.json) stay reachable only via the
-- service role, which bypasses RLS.
--
-- Policies are per-verb and idempotent, matching the house table-RLS style.

drop policy if exists "seismic_objects_select_own" on storage.objects;
create policy "seismic_objects_select_own"
    on storage.objects for select to authenticated
    using (
        bucket_id = 'seismic'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists "seismic_objects_insert_own" on storage.objects;
create policy "seismic_objects_insert_own"
    on storage.objects for insert to authenticated
    with check (
        bucket_id = 'seismic'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists "seismic_objects_update_own" on storage.objects;
create policy "seismic_objects_update_own"
    on storage.objects for update to authenticated
    using (
        bucket_id = 'seismic'
        and (storage.foldername(name))[1] = auth.uid()::text
    )
    with check (
        bucket_id = 'seismic'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists "seismic_objects_delete_own" on storage.objects;
create policy "seismic_objects_delete_own"
    on storage.objects for delete to authenticated
    using (
        bucket_id = 'seismic'
        and (storage.foldername(name))[1] = auth.uid()::text
    );
