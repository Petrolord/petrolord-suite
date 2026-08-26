# Voidage Replacement Monitor — status

App: `src/pages/apps/VoidageReplacementMonitor.jsx` (Reservoir module), on the
shared Studio shell since V1. Context: `src/contexts/VrrMonitorContext.jsx`;
panels in `src/components/vrrmonitor/`; engine vendored at
`packages/engines/engines/waterflood/vrr.js` behind the
`src/utils/vrrCalculations.js` shim (edits to engine math go to
Petrolord/petrolord-engines, not here). Route
`/dashboard/apps/reservoir/voidage-replacement-monitor`; tile is DB-driven
(`master_apps`, Active since the R0 honest catalog).

## The upgrade program (owner-directed, 2026-08-28)

Owner: "needs serious upgrade — it doesn't even import." Benchmarked against
the tools experts use (SLB OFM, Sahara by Interfaces, IHS Harmony's
surveillance module): the VRR math core was already right (reservoir-barrel
voidage with the free-gas term, instantaneous + cumulative, unified with the
Waterflood Design Studio surveillance engine), but the application around it
was manual-entry-only with a toy exact-header CSV parser, no persistence, no
dates/wells/patterns, one global FVF set, no pressure track, no target bands.

Waves (each an independently shippable PR; `vrr.js` stays byte-stable as the
future NextGen course oracle; new math goes in `vrrLedger.js` beside it,
central engines repo first):

- **V1 — Studio shell + persistence (DONE, this PR)**: kit adoption
  (StudioLayout/Header/AutoSave/ProjectManager/Help), `saved_vrr_projects`
  with 10s debounced autosave, page split into panels
  (FvfPanel/PeriodGridPanel/VrrChartsPanel/VrrKpiPanel), `?tab=` deep links,
  chart PNG export, smoke test. Math unchanged. This closes the
  WaterfloodDesignStudio-STATUS.md W5 kit-adoption queue item.
- **V2 — Real import + monthly ledger (DONE, this PR)**: per-well
  production/injection CSV with aliases + unit auto-scale (DataHub recipe),
  `vrrLedger.js` (`buildFieldPeriods`, `computeRollingVRR`, `flagPeriods`
  with a configurable target band, gas injectors recognized), rolling VRR +
  shaded target band on the chart. See V2 notes below.
- **V3 — PVT + pressure (DONE, this PR)**: per-period FVF overrides in the
  UI, pressure survey entry/import, pressure-dependent FVFs via
  `nodal/pvt.js` (Suite-side; engine gets only a correlation-free
  `interpolateFvfTrack`), VRR-vs-pressure dual-axis chart + fill-up marker
  (`findFillUp`). See V3 notes below.
- **V4 — Patterns + allocation (DONE, this PR — PROGRAM COMPLETE)**:
  injector→producer allocation matrix, pattern VRR via
  `buildPatternPeriods` feeding the untouched `computeVRRSeries`,
  per-pattern injection recommendations (`recommendPatternInjection`),
  withheld-with-reason gating when no allocation is defined. See V4
  notes below.

Full plan of record: the approved 2026-08-28 upgrade plan (V1-V4 details,
industry benchmark, decisions taken).

## V1 notes (2026-08-28)

- Persistence follows the `useFluidStudioProjects` lifecycle recipe but as a
  context (`VrrMonitorContext`) because V2-V4 add tabs sharing this state.
  Payload `{id, name, schema: 1, inputs, modified}`; `inputsFromPayload`
  tolerates older/partial rows; 42P01 maps to a friendly
  "run the migration" message so the app works before the table exists.
- Migration `20260828010000_create_saved_vrr_projects.sql` (owner-RLS,
  idempotent, safe pre-deploy). Rollback-wrapped dry run green, then
  APPLIED LIVE 2026-08-28 (owner-authorized; post-apply probe: table
  present and queryable; RLS + policy DDL ran clean). MIGRATIONS.md row
  updated.
- The planned `get_all_my_projects` UNION arm was dropped from V1:
  `src/database/functions/get_all_my_projects.sql` is explicitly flagged
  "ASPIRATIONAL MIRROR, NOT LIVE" (no such function exists in production;
  copying it into a migration was a caught mistake in 20260718120000).
  Revisit only if that aggregator ever becomes real.
- Drive-by fix: WDS `SurveillancePanel.jsx` labeled Bg as `rb/scf` while the
  unified VRR core takes RB/Mscf — label corrected.
- Help content re-housed from a standalone Dialog into the StudioHelp sheet
  (`src/components/reservoir/VrrHelpGuide.jsx` now exports content only);
  copy cleaned per the owner no-em-dash rule; added a Projects/auto-save
  section.
- Legacy exact-header CSV import/export kept verbatim in PeriodGridPanel for
  V1 (no behavior change wave); V2 replaces it with the real importer.

## V2 notes (2026-08-28)

- Engine: NEW `packages/engines/engines/waterflood/vrrLedger.js` — landed
  in the central repo first (petrolord-engines PR #42, branch
  feat/waterflood-vrr-ledger), vendored copy synced byte-identical from the
  pushed ref. `vrr.js` untouched (oracle guard suites pass unchanged).
  Ledger API: `monthKeyOf` (YYYY-MM prefix keying, no Date parsing),
  `classifyLedgerWells` (injection wins; gas-only injectors recognized),
  `buildFieldPeriods` (daily/monthly rows aggregate to ordered monthly
  periods feeding the untouched `computeVRRSeries`), `computeRollingVRR`
  (partial trailing windows; null when no produced voidage), `flagPeriods`
  (operator band, default 1.0-1.2; `classifyVRR` 0.9/1.1 interpretation
  defaults untouched), `analyzeLedger`. 13 gates vs a hand-computed
  3-month, 4-well fixture — creates `packages/engines/test-data/waterflood/`.
- Importer: `src/utils/vrr/csvImport.js` (papaparse, Suite-side by design) —
  claim-once aliases with injection columns resolving BEFORE their
  production twins (the csvParser 'wp'-in-'bwpd' lesson applied to
  'water'-in-'water_inj'), unit auto-scale from headers (MMscf/Bscf→Mscf,
  Mbbl→bbl, scf→Mscf), DD/MM vs MM/DD inference with an explicit
  ambiguity warning, well-less files import as one FIELD well, negatives
  zeroed and counted — every drop/adjustment lands in the report, nothing
  silent. 11 jest gates. The template CSV's sample volumes ARE the engine
  fixture, so Sample wells reproduces the jest-pinned oracle end to end.
- UI: ImportPanel (dropzone + report + template + Sample wells),
  LedgerSummaryPanel (read-only monthly aggregation w/ flags),
  AnalysisSettingsPanel (target band + rolling window, left rail);
  chart gains the rolling line + shaded ReferenceArea target band; KPI
  rail gains rolling VRR, out-of-band count, well counts. Imported mode
  replaces the manual grid until cleared; project payload persists
  `mode`/`wellRows`/`settings` (additive, schema stays 1).
- No DDL in V2.

## V3 notes (2026-08-28)

- Engine: V3 additions to `vrrLedger.js` — landed centrally first
  (petrolord-engines PR #44, branch feat/waterflood-vrr-pressure), vendored
  copy synced byte-identical; built in a TEMP GIT WORKTREE of the engines
  clone so the parked/active drilling branch there was never touched.
  `monthCoordOf` (pure string month coordinates, (day-1)/31 fraction, no
  Date parsing), `attachPressure` (survey linear interpolation onto
  mid-month coordinates, flat clamp outside range, dp/dt psi/month),
  `findFillUp` (first cum-VRR >= 1 crossing; `startedAbove` for records
  beginning mid-flood), `interpolateFvfTrack` (correlation-free table
  interpolation for future course use). 13 gates (75 psi/month hand
  oracle); vrr.js + V2 ledger suites pass unchanged.
- PVT bridge: `src/utils/vrr/pvtTrack.js` — `derivePeriodFvf(fluid,
  pressures)` via the goldened `nodal/pvt.js` (`buildFluidModel`/`pvtAt`);
  **the unit seam is explicit: pvtAt bg is rb/scf, x1000 to RB/Mscf**
  (same unit class as the V1 WDS label bug). Rs clamps at the model GOR
  above Pb. 6 gates incl. physics-direction (falling p below Pb: Bg up,
  Rs down) and magnitude sanity.
- Importer: `parsePressureCSV` added to `csvImport.js` (same claim-once /
  date machinery; date + psia columns).
- UI: new Pressure tab — left rail PressurePanel (manual survey rows +
  CSV import + Constant FVF / Pressure track mode + fluid inputs +
  correlation-band warnings), main PressureChartPanel (dual-axis VRR vs
  psia, fill-up ReferenceLine, dp/dt in tooltip), withheld-with-reason
  GatedNotice until pressure actually attaches (manual free-text period
  labels honestly yield no pressure; imported ledgers attach
  automatically). Manual grid gains a "PVT overrides" toggle revealing
  per-period Bo/Bw/Bg/Rs columns (blank = global; track mode wins over
  manual overrides). Track state persists in the project payload
  (`pressureSurveys`/`pvtMode`/`fluid`, additive, schema stays 1).
- Series rows carry `pressure`/`dpdt` through `computeVRRSeries`
  automatically (it spreads period props).
- No DDL in V3.

## V4 notes (2026-08-28) — program complete

- Engine: V4 additions to `vrrLedger.js`, central first (petrolord-engines
  PR #46, feat/waterflood-vrr-patterns; temp-worktree build again),
  vendored copy synced byte-identical. `validateAllocation` (row sums > 1
  error, shortfall = out-of-zone warning), `allocateInjection`
  (conservation audit: allocated + unallocated == injected exactly),
  `patternHasAllocation` (the withholding predicate — even splits never
  assumed by the engine), `buildPatternPeriods` (allocation-weighted
  monthly pattern periods; jest-pinned invariant: one pattern holding all
  producers with rows summing to 1 reproduces the field series exactly),
  `recommendPatternInjection` (target/current rolling VRR scale, clamped
  0.5–2.0 with the clamp reported; per-injector split by allocated share;
  gas injection reported, not scaled — compression-constrained). 9 gates.
- UI: Patterns tab — PatternManagerPanel (left rail: create/delete
  patterns, producer chips), AllocationMatrixEditor (injector×producer
  grid, live row sums, error/warning surfacing, conservation audit line,
  explicit per-injector Even split button = user action not engine
  assumption), PatternResultsPanel (field/pattern rollup table +
  per-pattern VRR chart + recommendation block). Gating ladder: no
  import → tab gated; no producers → withheld; no allocation → withheld;
  matrix errors → withheld. KPI rail gains the weakest-pattern card.
  Recommendation target = the operator band minimum.
- `patterns`/`allocation` persist in the project payload (additive,
  schema stays 1). No DDL in V4.
- WaterfloodDesignStudio-STATUS.md W5 queue item CLOSED with the scope
  boundary restated (WDS = design + daily diagnostics; VRR Monitor =
  monthly voidage/pressure-maintenance ledger).

## Known gaps / next

- Program V1-V4 COMPLETE. Possible future waves (not committed): bubble
  maps for pattern balance, CRM-derived allocation factor suggestions,
  gas-injection recommendation logic, NextGen Reservoir course teaching
  to vrr.js/vrrLedger.js (the oracle-stability doctrine exists for
  this).
- No entry in any file-driven app registry (tile is DB-driven); entitlement
  slug lives in `SupabaseAuthContext.jsx`.
