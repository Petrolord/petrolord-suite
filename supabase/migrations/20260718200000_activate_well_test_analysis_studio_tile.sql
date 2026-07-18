-- WT3 (Well Test Analysis Studio, docs/scope/WellTestAnalysisStudio-STATUS.md):
-- tile activation for the real PTA studio.
--
-- The well-test-analyzer tile (archived 2026-07-17 by 20260717090000 when the
-- mock behind it was flagged) keeps its slug (tile link + entitlement key,
-- locked owner decision) but becomes the Well Test Analysis Studio: renamed,
-- moved from the Production module to Reservoir (module/module_id copied from
-- a live Reservoir sibling), reactivated. The SPA carries the matching
-- apps/reservoir/well-test-analyzer route in the same release.
--
-- DEPLOY RULE (honest catalog, R0/G0/W3 precedent): apply this migration
-- WITH the production upload that carries the studio, never before. An
-- Active tile must not open the deleted mock's redirect chain on old code.
--
-- Rows preserved; idempotent and self-skipping.

do $$
declare
  ref public.master_apps%rowtype;
begin
  select * into ref
    from public.master_apps
   where slug = 'forecast-scenario-hub' and lower(module) = 'reservoir'
   limit 1;

  if ref.id is null then
    raise notice 'master_apps: no reservoir reference row found — skipping WT3 tile activation';
    return;
  end if;

  update public.master_apps
     set app_name      = 'Well Test Analysis Studio',
         description   = 'Pressure transient analysis workstation: gauge import and QC, Bourdet derivative diagnostics, analytical model matching with regression (homogeneous, dual porosity, fractured and bounded models), Horner and MDH straight lines, and a consolidated report. Projects save to your account.',
         module        = ref.module,
         module_id     = ref.module_id,
         status        = 'Active',
         is_built      = true,
         is_functional = true,
         updated_at    = now()
   where slug = 'well-test-analyzer'
     and status <> 'Active';

  if not found then
    raise notice 'master_apps: well-test-analyzer already Active — skipping';
  else
    raise notice 'master_apps: well-test-analyzer activated as Well Test Analysis Studio (Reservoir)';
  end if;
end $$;
