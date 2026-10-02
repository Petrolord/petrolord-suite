-- Signed-out reads of storage.objects fail since 20261002110000
-- (geo_wells team editing) revoked anon on geo_wells.
--
-- The older read policy wells_objects_select_own_or_org on storage.objects
-- is granted to PUBLIC (so anon evaluates it) and its expression reads
-- public.geo_wells. Postgres checks table privileges for every policy
-- expression of the querying role, whichever bucket is asked for, so ANY
-- anon query of storage.objects through row level security now ends in
-- "permission denied for table geo_wells" (probed read-only 2026-10-02:
-- `set local role anon; select count(*) from storage.objects`). Public
-- object URLs and signed URLs do not go through these policies and were
-- never affected.
--
-- Fix: the three registry read policies (wells, surfaces, culture) apply to
-- signed-in users only. Nobody loses access: each expression needs
-- auth.uid() (own folder) or is_org_member (organisation), which a
-- signed-out visitor can never satisfy. surfaces and culture are scoped the
-- same way so that a later anon revoke on geo_surfaces or geo_culture cannot
-- repeat this.
--
-- Idempotent; no transaction lines (the caller's batch is one transaction).

alter policy wells_objects_select_own_or_org    on storage.objects to authenticated;
alter policy surfaces_objects_select_own_or_org on storage.objects to authenticated;
alter policy culture_objects_select_own_or_org  on storage.objects to authenticated;
