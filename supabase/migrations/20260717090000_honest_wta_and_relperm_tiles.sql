-- Production-integrity hygiene (precursor to ReservoirEngineering-Module.md).
--
-- 1. Well Test Analyzer (Production module) presents as a working PTA tool
--    but the app is a UI mock: "Run Analysis" is a 1.5 s setTimeout and every
--    reported result is hardcoded (kh=123.4 md, skin=5.6, Pi=3510 psia in
--    src/utils/wellTestCalculations.js) regardless of the uploaded data.
--    Honest-catalog rule (G0/R0 precedent): the tile is archived until a
--    validated engine exists. PTA remains future scope, planned against this
--    app (Reservoir-ROADMAP.md section 4); route left in place.
--
-- 2. Relative Permeability Designer is an alias tile whose route opens the
--    Fractional Flow Analyzer, while its copy ("Generate and normalize
--    rel-perm curves") claimed a standalone designer with normalization the
--    app does not have. Renamed so the tile says exactly what it opens. Real
--    SCAL scope is the planned thin-real SCAL Studio, which seeds its own
--    tile when built (ReservoirEngineering-Module.md).
--
-- Rows preserved (status/copy flip only); idempotent.

update public.master_apps
   set status = 'Archived', is_functional = false, is_built = false
 where slug = 'well-test-analyzer'
   and lower(module) = 'production'
   and status <> 'Archived';

update public.master_apps
   set app_name = 'Relative Permeability & Fractional Flow',
       description = 'Corey relative permeability curve design driving Buckley-Leverett fractional flow analysis. Opens the Fractional Flow Analyzer.'
 where slug = 'relative-permeability-designer'
   and lower(module) = 'reservoir'
   and app_name = 'Relative Permeability Designer';
