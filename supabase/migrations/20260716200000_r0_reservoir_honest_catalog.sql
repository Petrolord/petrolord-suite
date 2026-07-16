-- R0 — Reservoir module honest catalog (Reservoir-ROADMAP.md §1/§3).
-- Audit of all 42 Reservoir rows (2026-07-16, three parallel audits):
--
-- 1. ARCHIVE five Active tiles that misadvertise:
--    * material-balance-pro — app code deleted 2026-07-07 (b923debac,
--      superseded by Reservoir Balance) but the tile stayed Active
--      with NO route: it 404'd to home in production.
--    * eor-designer, uncertainty-analysis, scenario-planner,
--      reservoir-simulation-connector — UI shells whose compute all
--      delegates to edge functions that DO NOT EXIST (eor-engine,
--      scenario-planner-engine, reservoir-simulation-connector-engine
--      are absent from supabase/functions/ and were never deployed);
--      every chart is a "Chart removed" placeholder. Uncertainty
--      Analysis also duplicates ReservoirCalc Pro's real Monte Carlo.
--
-- 2. ARCHIVE the 28 zero-code 'Coming Soon' rows (no route, no page,
--    no engine behind any of them) — the Geoscience G-series
--    precedent: future apps seed their own tile when they are real.
--
-- 3. FIX is_functional flags: three REAL shipped apps carried
--    is_functional=false (fractional-flow-calculator,
--    relative-permeability-designer, voidage-replacement-monitor)
--    while the four dead shells carried true.
--
-- Rows preserved (status flip only, the G0 archive pattern);
-- idempotent. Post-state: Reservoir = 9 Active / 33 Archived.

update public.master_apps
   set status = 'Archived', is_functional = false, is_built = false
 where lower(module) = 'reservoir'
   and slug in ('material-balance-pro', 'eor-designer',
                'uncertainty-analysis', 'scenario-planner',
                'reservoir-simulation-connector')
   and status <> 'Archived';

update public.master_apps
   set status = 'Archived'
 where lower(module) = 'reservoir'
   and status = 'Coming Soon';

update public.master_apps
   set is_functional = true
 where lower(module) = 'reservoir'
   and slug in ('fractional-flow-calculator',
                'relative-permeability-designer',
                'voidage-replacement-monitor')
   and status = 'Active';
