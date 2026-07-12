-- Server-side per-user storage quota on the 'seismic' bucket.
--
-- The 20 GiB quota has been client-enforced at ingest since Phase 6
-- (ingestService.STORAGE_QUOTA_BYTES) — that bounds what a COOPERATING
-- client ingests. This migration is the recorded escalation: the storage
-- INSERT policy itself now refuses new objects once the user's bucket
-- footprint reaches the quota, so a hostile or buggy client cannot bypass
-- the ceiling. The two constants must stay in lockstep.
--
-- Deliberate shape:
--  * usage is summed live from storage.objects (metadata->>'size') under
--    the owner-path convention seismic/{auth.uid()}/... — no counter
--    table to drift out of sync. The per-insert sum is a scan of one
--    user's rows; if it ever shows up in profiles the escalation is a
--    usage-counter table maintained by storage triggers.
--  * quota applies to INSERT only. UPDATE (manifest/velocity upserts,
--    horizon-blob overwrites, resumed ingests) stays quota-free so an
--    over-quota user can still SAVE work and DELETE volumes — exactly
--    the client rule (resumed ingests skip the check).
--  * functions are SECURITY DEFINER with a pinned search_path; the
--    usage function reads only the CALLER's own folder (auth.uid()), so
--    it leaks no cross-user byte counts.

create or replace function public.seismic_storage_quota_bytes()
returns bigint
language sql
immutable
as $$
    select (20::bigint * 1024 * 1024 * 1024)   -- 20 GiB, = client constant
$$;

create or replace function public.seismic_storage_usage_bytes()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(sum((o.metadata ->> 'size')::bigint), 0)
    from storage.objects o
    where o.bucket_id = 'seismic'
      and (storage.foldername(o.name))[1] = auth.uid()::text
$$;

revoke all on function public.seismic_storage_usage_bytes() from public;
grant execute on function public.seismic_storage_usage_bytes() to authenticated;
grant execute on function public.seismic_storage_quota_bytes() to authenticated;

-- Recreate the INSERT policy with the quota gate (same owner-path check
-- as 20260710170000; SELECT/UPDATE/DELETE policies unchanged).
drop policy if exists "seismic_objects_insert_own" on storage.objects;
create policy "seismic_objects_insert_own"
    on storage.objects for insert to authenticated
    with check (
        bucket_id = 'seismic'
        and (storage.foldername(name))[1] = auth.uid()::text
        and public.seismic_storage_usage_bytes() < public.seismic_storage_quota_bytes()
    );
