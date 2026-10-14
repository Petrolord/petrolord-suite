-- Suite Projects P3: well names unique per user PER PROJECT (was per user).
-- A consultant can hold "Well-1" in two clients' projects; inside one project
-- a name is still unique for its owner. Design: docs/scope/SuiteProject-DESIGN.md
-- section 15. Product table only (geo_wells); no policy or data change.
--
-- The new index is created before the old one is dropped. Every existing row
-- already satisfies the old, stricter rule, so the new index always builds.
-- The name key is the same expression as before (case-insensitive, spaces
-- collapsed and trimmed). A row with no project (none after the P0 backfill)
-- is keyed with the nil uuid, so such rows stay unique per user among themselves.
--
-- Idempotent; no transaction lines. Rollback:
-- tools/security/suite-projects/rollback/20261015120000.rollback.sql
create unique index if not exists geo_wells_owner_project_name_uniq on public.geo_wells
    (user_id, coalesce(suite_project_id, '00000000-0000-0000-0000-000000000000'::uuid),
     lower(btrim(regexp_replace(name, '\s+'::text, ' '::text, 'g'::text))));
drop index if exists public.geo_wells_owner_name_uniq;
