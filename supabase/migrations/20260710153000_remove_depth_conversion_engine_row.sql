-- Remove the depth-conversion-engine master_apps row.
--
-- Same class as 20260710150000_remove_legacy_seismic_master_apps.sql:
-- DepthConversionEngine was one of the 8 legacy seismic apps deleted in
-- PR #21, but its catalog row is still Active, so the Geoscience dashboard
-- renders a tile whose route no longer exists (catch-all redirect home).
-- Found after the first cleanup migration was already applied, hence the
-- separate file. Zero purchased_modules references (verified); the guard
-- keeps it re-runnable either way.
--
-- structural-mapping-suite (also deleted in PR #21) is intentionally kept:
-- its row is "Coming Soon", so it reads as a roadmap placeholder like the
-- other unbuilt geoscience tiles, not a broken link.

do $$
declare
  n int;
begin
  delete from public.master_apps ma
   where ma.slug = 'depth-conversion-engine'
     and not exists (
           select 1 from public.purchased_modules pm where pm.app_uuid = ma.id
         );
  get diagnostics n = row_count;
  raise notice 'master_apps: removed % depth-conversion-engine row(s)', n;
end $$;
