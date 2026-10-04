# Voidage Replacement Monitor — status

App: `src/pages/apps/VoidageReplacementMonitor.jsx` (Reservoir module), on the
shared Studio shell since V1. Context: `src/contexts/VrrMonitorContext.jsx`;
panels in `src/components/vrrmonitor/`; engine vendored at
`packages/engines/engines/waterflood/vrr.js` behind the
`src/utils/vrrCalculations.js` shim (edits to engine math go to
Petrolord/petrolord-engines, not here). Route
`/dashboard/apps/reservoir/voidage-replacement-monitor`; tile is DB-driven
(`master_apps`, Active since the R0 honest catalog).

Design system: pilot 5 (2026-09-27, branch `feat/ds-pilot-vrr`). The route
is wrapped in `<ThemedApp>`: light by default, dark by the header toggle,
remembered per user in the browser. The Studio kit is theme-aware and inert
outside a theme scope, so the other Studio-kit apps are unchanged until they
opt in. Charts keep the white chart standard in both themes. Tests:
`src/pages/apps/__tests__/VoidageReplacementMonitor.theme.test.jsx` and
`src/components/studio/__tests__/studioKitOptIn.test.jsx`.
2026-09-28 design-system follow-up: VRR now wraps itself in `ThemedApp`
(like DCA) and dropped its legacy class branch, which only existed so the
non-pilot proofs could mount it; those proofs now mount Waterflood Design
Studio.

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

## 2026-08-27 — help guide refresh (branch `docs/reservoir-help-refresh`)

Guide had no phase drift (it was rewritten with every V wave). One real
error and two omissions:

- **PVT section said the FVF set "applies to every period"**, untrue
  since V3 added per-period PVT override columns. Rewritten to describe
  defaults plus overrides and the blank-falls-back-to-default rule.
- Tab-name drift fixed: "Data tab" and "Dashboard tab" are labelled
  **Data & PVT** and **VRR Dashboard**.
- Added the V4 weakest-pattern KPI to the Patterns section.

## 2026-10-04 — Reservoir upgrade round, Step 1 (VRR-U1, branch `feat/vrr-u1`)

Working doc: `docs/upgrade/VoidageReplacementMonitor-UPGRADE.md` (28
findings, the Step 1 table, the Step 2 ranked backlog). In short:

- **Two S1 in the import door, fixed**: "Water Inj (bbl)" was dropped with
  no word (VRR 0); a daily-rate column on monthly rows was summed as the
  month's volume (VRR 31.6 for 1.02). The ledger, pressure and grid doors
  now read through `src/lib/tabularParse.js` with units at the door, a
  read-back and questions for what a file cannot settle (hostile set in
  `e2e/fixtures/vrr/hostile/`).
- **The report** on the shared Report Kit (`src/utils/vrr/reportModel.js`,
  `reportFigures.js`, `vrrReportExport.js`, the Report tab) and a ledger CSV
  with a provenance header (`ledgerCsv.js`). One derived model for screen,
  report and CSV: `src/utils/vrr/workspace.js` (`deriveVrr`).
- **Engine** (engines PR #305, merged; pinned at engines 4f91416):
  `resolvePeriodFvf`, `voidageTerms`, `buildVoidageLedger`, `applyPeriodFvf`
  and a `periodFvf` option of `recommendPatternInjection` in `vrrLedger.js`.
  `vrr.js` is byte-identical.
- **S2 fixed**: blank FVFs read as zero (now withheld with the reason);
  patterns and advice ignored the pressure track (now the same per-period
  FVFs as the field).
- **`pvt-1` intake**: a Fluid Systems Studio table read by id
  (`src/utils/vrr/pvtIntake.js`, `FluidPvtIntake.jsx`), a third FVF mode
  ("Fluid table"), the shared PVT intake card.
- **Units** (`src/utils/vrr/units.js`, `UnitInput.jsx`), **record sharing**
  (view, check-out editing, Save a copy), the **datum** stated (no
  correction), the correlation track needs every fluid input.
- **Material Balance contract kept**: `inputs.pressureSurveys[].p_psia` in
  psia whatever the display units; payload `{ id, name, schema: 1, inputs }`;
  pinned by `src/utils/vrr/__tests__/vrrMbalContract.test.js`.
- Payload additions (schema stays 1): `unitSystem`, `identification`,
  `inputMeta`, `pvtIntake`, `importInfo`, `pressureImportInfo`, `datum`,
  `sampleNote`. A project saved before opens in oilfield, unchanged.

## 2026-10-04 — Reservoir upgrade round, Step 2 (VRR-U2, branch `feat/vrr-u2`)

Batch A all six and two of Batch B, per the programme lead's batch decision
(recorded verbatim in `docs/upgrade/VoidageReplacementMonitor-UPGRADE.md`).

- **U2-001 the `vrr-1` contract** (`src/utils/vrr/vrrLedgerContract.js`):
  one read-by-id contract for the ledger and the pressure rows, converged
  with Waterflood's `vrr-ledger-1` (same shape, `version` 1, readers accept
  both names, same fingerprint). Material Balance reads its pressure rows
  through it (numbers identical, its tests green); the send panel names the
  contract and both receivers.
- **U2-002 per-well free gas** beside the field figure (engines PR #307
  `buildWellVoidage`, not merged by the build agent; vendored byte-identical
  with `vrr-u2` ledger rows). The headline stays field level.
- **U2-003 producing days** at the ledger door; **U2-006 Excel workbooks**
  at the ledger and pressure doors (shared `readTabularFile`).
- **U2-004 the Map tab**: voidage by well on the wells registry locations
  through a match table the user confirms; nothing placed by guess; a
  figure and a table in the report.
- **U2-005 the demo field** (24 months, 10 wells) beside the template.
- **U2-018** the pressure track's Z on Dranchuk-Abou-Kassem from the
  engines (track projects move slightly: demo field 0.78034 to 0.77904).
- **U2-011** a target band per pattern.
- Payload additions (schema stays 1): `wellMap`, `patterns[].band`.
- Deferred: U2-007 CRM (needs a published validation case), U2-008,
  U2-009, U2-010 (datum stated, not corrected), Batch C.
- Owner/lead items: merge engines PR #307, then re-pin the Suite and delete
  the two `vrr-u2` ledger rows.
- Sample: `/root/vrr-report-sample.pdf` (9 pages, the demo field with its map).
