# Reservoir Engineering module — plan of record (R series)

Status: **R0 COMPLETE 2026-07-16** — full runnability audit of all 42
catalog rows, honest-catalog migration applied live, this roadmap.
Owner directive: audit the module and produce a realistic list that
covers the Reservoir Engineering field, the way the Geoscience
roadmap (Geoscience-ROADMAP.md, G0-G8) did for its module.

## 1. R0 audit findings (2026-07-16, three parallel audits)

The catalog had 42 rows: 14 Active, 28 Coming Soon. Reality:

**Real and healthy (KEEP, no phase needed):**
- **Reservoir Balance** — the module flagship. ~6.8k LOC front end on
  the server-side `_shared/mbal-engine.ts` (2.7k LOC), textbook-
  validated (`tools/validation/mbal-validation.ts`: Dake Ex 9.2
  Carter-Tracy, Tarek Ahmed Ex 11-3, Dake Ex 3.4 gas cap). Aquifer
  models pot/Fetkovich/Carter-Tracy, drive indices, Havlena-Odeh /
  Campbell / Cole / p-z diagnostics, real `rb_*` tables.
- **Fluid Systems Studio** — audited black-oil PVT correlation engine
  (759-LOC orchestrator over `pvtCalculations.js`), real persistence,
  ChartFrame charts, honest correlation caveats. PvtQuicklook fully
  removed. Clean.
- **Waterflood Dashboard** — the 2026-07 fake findings are FIXED in
  source: vendored, tested 783-LOC client engine (detrended
  cross-correlation pattern lags, VRR-balanced recommendations, real
  Hall plot from `whp_psi`, Chan diagnostics), honest capability
  gating (`GatedFeatureNotice` instead of fabricated output), real
  `saved_waterflood_projects` persistence, ChartFrame. The old
  `waterflood-engine` edge fn with `Math.random()` internals is now
  DEAD CODE, invoked by nothing (deletion = R2 hygiene).
- **Aquifer Influx Calculator** — benchmark-verified vEH/Fetkovich/
  Carter-Tracy, tested. **Recovery Factor Estimator** — tested.
  Both quick wins from 2026-07, clean.
- **Fractional Flow Calculator / Relative Permeability Designer** —
  one real app (Buckley-Leverett + Corey), two alias tiles. Engine
  has NO unit tests (R2 hygiene).
- **VRR Monitor** — real engine, NO unit tests (R2 hygiene).

**Broken or false advertising (ARCHIVED in R0):**
- **Material Balance Pro** — the app code was deleted 2026-07-07
  (commit b923debac, superseded by Reservoir Balance) but the tile
  stayed Active with no route: it 404'd to home in production. Tile
  archived; the keep-one decision was already made in code.
- **EOR Designer, Uncertainty Analysis, Scenario Planner, Reservoir
  Simulation Connector** — pure UI shells calling edge functions that
  DO NOT EXIST anywhere (`eor-engine`, `scenario-planner-engine`,
  `reservoir-simulation-connector-engine`): every Run button fails,
  every chart is a "Chart removed" placeholder, persistence is
  localStorage at best. Uncertainty Analysis additionally duplicates
  ReservoirCalc Pro's real, tested Monte Carlo. All four tiles
  archived (rows preserved; Scenario Planner's local project-manager
  scaffolding noted for a possible future rebuild).
- **The 28 Coming Soon tiles** — zero code behind every one (no
  route, no page, no engine; only incidental keyword mentions inside
  other apps). All archived, per the Geoscience precedent: future
  apps seed their own tile when they are real.

**Needs a fix phase (KEEP + FIX):**
- **Decline Curve Analysis** — the engine is sound (Arps + OLS with
  standard errors, EUR, Monte Carlo, segment detection, diagnostics)
  but persistence is localStorage-only, charts are raw recharts (no
  ChartFrame), and two components are stubs (`DCAWellFilters`,
  `DCAGroupRollup`). → R1.

**Orphaned code discovered:**
- **RiskedReservesValuation** — a COMPLETE app (page + component set
  + 130-LOC Monte Carlo engine) with no route, no catalog row, no
  importer. Reserves-valuation shaped; a cheap wire-up win. → R3.
- `src/utils/aquiferCalculations.js` — dead superseded duplicate of
  the live aquifer engine, zero consumers. → R2 delete.

**Catalog flag fixes (R0):** `is_functional` was FALSE on three real,
shipped apps (fractional-flow-calculator, relative-permeability-
designer, voidage-replacement-monitor) while TRUE on the four dead
shells. Fixed in the R0 migration.

## 2. The honest catalog after R0 (9 Active tiles)

| Tile | Covers |
|---|---|
| Fluid Systems Studio | PVT / fluid properties |
| Reservoir Balance | material balance (oil + gas cap + aquifer), drive diagnostics |
| Aquifer Influx Calculator | analytic water influx |
| Fractional Flow Calculator | Buckley-Leverett displacement |
| Relative Permeability Designer | Corey rel-perm design (same app) |
| Waterflood Dashboard | injection surveillance, pattern response, Hall/Chan |
| VRR Monitor | voidage replacement |
| Decline Curve Analysis | rate forecasting / EUR |
| Recovery Factor Estimator | screening-level RF |

Volumetrics and probabilistic resources deliberately live in the
Geoscience module (**ReservoirCalc Pro**, the flagship consolidation
of 2026-07-08) — referenced, not duplicated.

## 3. Phases

One PR per phase, each independently shippable; migrations
staging-first, logged in MIGRATIONS.md; validation-first engine work.

- **R0 — Honest catalog (THIS PHASE, done).** Audit; archive the 5
  broken Active tiles + 28 zero-code Coming Soon rows; fix the three
  `is_functional` flags. 42 rows → 9 Active / 33 Archived.
- **R1 — Decline Curve Analysis fix.** `saved_dca_projects` table +
  RLS + live pentest (the saved_waterflood pattern), ChartFrame
  adoption across the DCA chart set, finish or honestly gate
  `DCAWellFilters` and `DCAGroupRollup`.
- **R2 — Hygiene sweep.** Delete the dead `waterflood-engine` edge
  function (repo + deployed function), delete the orphaned
  `aquiferCalculations.js`, add the missing unit tests for
  `vrrCalculations.js` and `fractionalFlowCalculations.js`.
- **R3 — Risked Reserves Valuation wire-up.** Audit the orphaned
  engine's math, add tests, route it, seed its tile (%ROWTYPE
  template copy). Decision point: Reservoir vs Economics module
  placement (recommend Reservoir; it consumes volumetric + RF
  inputs).
- **R4 (owner-optional) — EOR Screening, rebuilt real.** A small
  client-side screening tool on the published Taber-Martin-Seright
  criteria tables would honestly replace the archived EOR Designer
  shell; seeds a fresh tile when real.
- **R5 (owner-optional) — Forecast & Scenario hub.** If wanted,
  rebuild Scenario Planner client-side (Arps forecast + simple NPV
  per case) on a real table; overlaps NpvScenarioBuilder (Economics)
  — reconcile scope first.
- **Engine extraction runway** (mirrors the Geoscience → NextGen
  path): as each domain stabilizes, its math moves to
  `@petrolord/engines` with a Python oracle + goldens — candidates in
  order: `dca` (after R1), `aquifer`, `fractionalflow` + `relperm`,
  `vrr`, `waterflood`, `mbal` (the server engine, largest). That
  runway is what later becomes the NextGen Reservoir course series.

## 4. Known coverage gaps (deliberately NOT tiles yet)

- **Well test / PTA / RTA** — a Well Test Analyzer app exists in the
  PRODUCTION module (unaudited there). Pressure/rate-transient
  analysis as validated engines is real future scope; it should be
  planned against that app, not as a fresh Reservoir shell.
- **Simulation connectivity** (deck import / history-match scoring) —
  the archived connector shell shows the ambition; building it for
  real is a large, owner-gated project.
- **Coning, capillary pressure, EOS/compositional, tracer, CO2/H2
  storage** — genuine field topics from the archived aspirational
  list; each earns a tile only when built on a validated engine.

## 5. Non-goals

- No rebuilding volumetrics/uncertainty in this module (ReservoirCalc
  Pro owns it).
- No reviving archived shells by flipping status — a tile returns
  only with working code behind it (the G-series rule).
- No new test framework; engines follow the util-engine + jest
  pattern, server engines the mbal-validation pattern.
