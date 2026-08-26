# Recovery Factor Estimator (slug `recovery-factor-estimator`) — STATUS

Screening tool closing the volumetrics-to-reserves bridge:
Recoverable Reserves = RF × OOIP/OGIP, with RF from published
drive-mechanism analog bands or empirical correlations (API 1967
solution-gas / water drive; exact gas p/z depletion; water-drive gas
trapping). Shipped 2026-07-08 as a quick-win one-shot calculator
(commit 64d51d13); engine `src/utils/recoveryFactorCalculations.js`
is jest-tested (analog table, exact p/z, trapping, gated
correlations, volumetric in-place).

## Studio-kit upgrade (2026-08-26)

Second app in the locked one-app-at-a-time kit-adoption queue (owner
decision at the W-series close-out: VRR Monitor → Recovery Factor
Estimator → Aquifer Influx Calculator; VRR completed V1-V4
2026-08-26). Follows the VRR V1 recipe exactly; **engine math
untouched**.

- Studio shell: StudioLayout/StudioHeader/StudioAutoSave/
  StudioProjectManager/StudioHelp; single view (no tabs) — left rail
  = Project + In-place Volume (phase toggle, direct vs volumetric) +
  Method (chips, drive select, correlation inputs), right rail = RF
  KPI cards + correlation warnings, main = reserves-range chart
  (white ChartFrame, unchanged markup) + drive-mechanism reference
  table. Sample button in the header actions.
- `RfEstimatorContext` (src/contexts/): useFluidStudioProjects
  lifecycle recipe — createSavedProjectsService + hydrated guard +
  10 s debounced autosave; payload {id, name, schema: 1, inputs,
  modified}; results recomputed on load; 42P01 mapped to a friendly
  "run the migration" message.
- Migration `20260826101500_create_saved_rf_projects.sql` APPLIED
  LIVE 2026-08-26 (verbatim mirror of saved_vrr_projects; probe:
  table + RLS + rf_owner_all policy). Logged in MIGRATIONS.md.
- Help re-housed from a standalone Dialog into StudioHelp content
  (`RecoveryFactorHelpGuide.jsx` now exports the accordion content;
  added a projects/auto-save section).
- Panels live in `src/components/rfestimator/` (shared field specs +
  formatters in `rfFields.js`); page smoke test
  `RecoveryFactorEstimator.smoke.test.jsx` (shell render, phase
  switch, direct in-place entry, sample reload).

## Not done / future (uncommitted ideas)

- Optional depth waves (would need an owner decision): multi-zone /
  stacked-reservoir cases, analog benchmarking against published RF
  distributions, RF handoff into ReservoirCalc Pro or Forecast
  Scenario Hub.
- The kit-adoption queue is CLOSED with this app: the Aquifer Influx
  Calculator item needed no work — the standalone app was retired when
  Material Balance Studio absorbed aquifer influx as its Aquifer tab
  (tile Archived 2026-07-19; route redirects to
  reservoir-balance?tab=aquifer; rb_* case persistence).
