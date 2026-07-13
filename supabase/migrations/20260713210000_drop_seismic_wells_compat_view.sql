-- Well Data Manager G1.5 close-out (docs/scope/WellDataManager-PLAN.md
-- decision 5, owner sign-off 2026-07-12: "compatibility view during
-- G1.4, hard drop at G1.5"): retire the seismic_wells name for good.
--
-- The G1.4 view (20260713160000) existed for exactly one phase so
-- already-deployed production clients kept working. All in-repo code
-- reads the geo_wells registry now (Seismolord via its wellsService
-- adapter over src/lib/wellsRegistry.js since G1.4); after this drop a
-- STALE production bundle's wells panel errors on load/save until the
-- next production upload — accepted: seismic_wells was empty its whole
-- life (no production user ever saved a well), verified again at apply
-- time.
--
-- geo_wells and its children are untouched.

drop trigger if exists seismic_wells_compat_insert on public.seismic_wells;
drop trigger if exists seismic_wells_compat_update on public.seismic_wells;
drop trigger if exists seismic_wells_compat_delete on public.seismic_wells;
drop view if exists public.seismic_wells;
drop function if exists public.seismic_wells_compat_insert();
drop function if exists public.seismic_wells_compat_update();
drop function if exists public.seismic_wells_compat_delete();
