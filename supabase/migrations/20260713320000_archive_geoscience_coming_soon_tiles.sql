-- Geoscience catalog truth, continued (docs/scope/Geoscience-ROADMAP.md §2):
-- archive the 18 remaining 'Coming Soon' geoscience tiles. The approved
-- target portfolio is 10 tiles; these rows are aspirational catalog
-- entries with no app, no route and no plan-of-record phase behind them
-- (owner request 2026-07-13, after the PR #65 Archived-tile filter fix).
--
-- When a roadmap phase ships a real app in this space (e.g. G6 Rock
-- Physics Studio), it seeds its own tile via a seed migration — same as
-- well-data-manager / petrophysics-studio / well-correlation /
-- mapping-surface-studio — rather than reviving one of these rows.
--
-- ARCHIVE, not DELETE (G0 pattern, 20260712200000): status='Archived'
-- hides the tile from both catalog hooks (useMasterApps filters status;
-- useAppsFromDatabase excludes Archived since PR #65) while preserving
-- the row and any entitlement/history references. Idempotent.

do $$
declare
  coming_soon_slugs text[] := array[
    'basin-modeling-suite',
    'charge-migration-modeler',
    'checkshot-vsp-processor',
    'fault-fracture-analyzer',
    'fluid-contact-mapper',
    'geothermal-gradient-calculator',
    'migration-risk-analyzer',
    'pressure-compartment-analyzer',
    'pressure-prediction-system',
    'reservoir-characterization-tool',
    'rock-physics-analyzer',
    'seal-integrity-analyzer',
    'sonic-log-analyzer',
    'source-rock-analyzer',
    'structural-mapping-suite',
    'thermal-maturity-analyzer',
    'trap-definition-tool',
    'wavelet-analysis-tool'
  ];
  n int;
begin
  update public.master_apps
     set status = 'Archived', updated_at = now()
   where slug = any(coming_soon_slugs)
     and lower(module) = 'geoscience'
     and status <> 'Archived';
  get diagnostics n = row_count;
  raise notice 'master_apps: archived % geoscience Coming Soon tile(s)', n;
end $$;
