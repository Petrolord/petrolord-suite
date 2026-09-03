-- One well name per owner (owner rule 2026-09-03).
--
-- **HELD: shared table (geo_wells), needs a second engineer's review
-- before apply (database conventions).**
--
-- The client rule lives in src/lib/wellsRegistry.js (saveWell/updateWell
-- refuse a name that matches, case- and whitespace-insensitively, any well
-- the caller can see). This index is the server-side backstop for the
-- part of that rule the database can express: two wells of the SAME
-- OWNER never share a normalised name. Cross-owner clashes (a teammate's
-- shared well) stay client-side because RLS visibility is per caller.
--
-- Probe before apply (must return 0 groups; it did on 2026-09-03):
--   select user_id, lower(btrim(regexp_replace(name, '\s+', ' ', 'g'))) nm, count(*)
--   from public.geo_wells group by 1, 2 having count(*) > 1;
--
-- Known consequence for the .pld importer (src/lib/portability): a
-- package restored twice into the same account inserts a second geo_wells
-- row with the original name and would now fail on this index instead of
-- creating a duplicate. That is the intended behaviour for a registry,
-- but the importer should learn to report it as "well already present"
-- before this ships.

create unique index if not exists geo_wells_owner_name_uniq
  on public.geo_wells (user_id, lower(btrim(regexp_replace(name, '\s+', ' ', 'g'))));

comment on index public.geo_wells_owner_name_uniq is
  'One normalised well name per owner (2026-09-03); client rule in src/lib/wellsRegistry.js';
