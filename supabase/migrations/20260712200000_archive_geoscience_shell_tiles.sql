-- Geoscience Phase G0 (docs/scope/Geoscience-ROADMAP.md §4): archive the
-- Active catalog tiles whose apps are shells, so the hub only shows
-- geoscience apps that actually work.
--
-- Archived (owner-confirmed list, sign-off 2026-07-12):
--   well-correlation-tool           98-line shell; successor = Well
--                                   Correlation (Phase G3)
--   log-facies-analysis             superseded by Petrophysics Studio (G2)
--   petrophysical-integration-suite superseded by Petrophysics Studio (G2)
--   earthmodel-studio               consolidated into the single Earth
--   earthmodel-pro                  Modeling slot (Phase G8)
--   material-balance-volumetrics    Active tile with NO route in the SPA —
--                                   clicking it hits the catch-all redirect;
--                                   volumetrics is ReservoirCalc Pro
--
-- ARCHIVE, not DELETE: useMasterApps only shows rows with status IN
-- ('Active','Coming Soon') AND is_functional AND is_built, so
-- status='Archived' removes the tile while preserving the row and any
-- entitlement/history references. Idempotent. Kept Active on purpose:
-- seismolord, reservoircalc-pro, 1d-mechanical-earth-model (MEM stays
-- pending the G0 audit decision).

do $$
declare
  shell_slugs text[] := array[
    'well-correlation-tool',
    'log-facies-analysis',
    'petrophysical-integration-suite',
    'earthmodel-studio',
    'earthmodel-pro',
    'material-balance-volumetrics'
  ];
  n int;
begin
  update public.master_apps
     set status = 'Archived', updated_at = now()
   where slug = any(shell_slugs)
     and status <> 'Archived';
  get diagnostics n = row_count;
  raise notice 'master_apps: archived % geoscience shell tile(s)', n;
end $$;
