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
- **V2 — Real import + monthly ledger**: per-well production/injection CSV
  with aliases + unit auto-scale (DataHub recipe), `vrrLedger.js`
  (`buildFieldPeriods`, `computeRollingVRR`, `flagPeriods` with a
  configurable target band, gas injectors recognized), rolling VRR + target
  band on the chart.
- **V3 — PVT + pressure**: per-period FVF overrides in the UI (engine's
  `resolveFvf` already supports them), pressure survey import,
  pressure-dependent FVFs via `nodal/pvt.js` (Suite-side; engine gets only a
  correlation-free `interpolateFvfTrack`), VRR-vs-pressure dual-axis chart +
  fill-up marker (`findFillUp`).
- **V4 — Patterns + allocation**: injector→producer allocation matrix,
  pattern VRR via `buildPatternPeriods` feeding the untouched
  `computeVRRSeries`, per-pattern injection recommendations
  (`recommendPatternInjection`), withheld-with-reason gating when no
  allocation is defined.

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

## Known gaps / next

- V2-V4 above.
- No entry in any file-driven app registry (tile is DB-driven); entitlement
  slug lives in `SupabaseAuthContext.jsx`.
