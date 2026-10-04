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

## 2026-08-27 — help guide refresh (branch `docs/reservoir-help-refresh`)

Guide was written with the kit adoption so had no phase drift, but it
under-documented the pre-existing engine. Added:

- The **Water-drive gas (trapping)** method, which shipped and was
  missing from the correlations section entirely.
- That the method menu is phase-gated, and what each phase offers.
- All seven drive mechanisms with their bands (the guide named three),
  and the drive-mechanism reference table as an on-screen panel.
- The gas volumetric OGIP relation (Bgi); only the oil OOIP relation was
  given.
- The header Sample button.

4 em dashes removed, including two contrastives (owner copy rule).

## 2026-09-28: design system rollout, batch 2A (branch `feat/ds-w2a`)

The estimator opts in to the Petrolord design system. No engine change.

- `RecoveryFactorEstimator.jsx` wraps itself in `<ThemedApp data-testid="rf-theme-scope">`;
  the route is registered in `src/design/rollout/w2a.js`.
- `src/components/rfestimator/*` and the help content moved to theme roles:
  phase, in-place mode and method choices use the primary fill, KPI values
  are mono, the analog warning uses the warning role, the selected drive row
  a light primary tint. The reserves chart keeps the white chart standard.
- Test: `src/pages/apps/__tests__/RecoveryFactorEstimator.theme.test.jsx`.

## 2026-10-04: Reservoir upgrade round, app 10, Step 1 (branch `feat/rf-u1`)

Working doc: `docs/upgrade/RecoveryFactorEstimator-UPGRADE.md` (21 findings,
19 fixed, 2 open S3 carried into Step 2; Step 2 analysis and ranked backlog).

- **S1 fixed (numbers change):** the API (Arps et al. 1967) correlations take
  permeability in darcies; the engine used the typed md value, so API
  estimates were 1.97 (solution gas) and 1.70 (water drive) times too high.
  Sample water drive 72.0 to 42.3 percent. k is still typed in md and is
  divided by 1,000 in the engine. A project saved before this says so when it
  opens. Release note: every saved API estimate falls by those factors.
- No silent clamp: a value outside 0 to 100 percent is withheld with its
  reason; above or below the analog range is flagged. Inputs are checked
  against the domain of each method; a correlation used under another drive
  is flagged.
- The analog ranges are labelled as transcribed and not validated; Low and
  High are range edges, not P90 and P10.
- The report on the shared kit (Report tab, PDF): identification, headline
  with its basis, OOIP and the correlation by their parts, inputs with units
  and sources, method and validation state, basis, limits and flags, intake
  records, three figures. Read back in jest (3 goldens) and in the e2e.
- Intakes by id: OOIP/OGIP from a Material Balance case (mbal-1,
  `?mbalCase=`) or a ReservoirCalc Pro saved project; PVT from a Fluid
  Systems Studio project (pvt-1, `?fluidProject=`), with "edited after
  intake" and "source changed since".
- Suite unit profile (oilfield and SI, values stored oilfield, typed decimals
  kept through the shared draft hook); record sharing with check-out; the
  sample labelled as the sample; payload version 2 travels in `.pld` with its
  intake ids declared.
- No migration. Engine stays Suite-side (`src/utils/recoveryFactorCalculations.js`);
  no engines PR.
- Tests: `src/utils/__tests__/recoveryFactorValidation.test.js` (gates calling
  the engine, negative control 9 of 15 failing on the pre-fix engine),
  `src/utils/rfestimator/__tests__/*`, `src/contexts/__tests__/rfSharing.test.jsx`,
  e2e `e2e/recovery-factor-upgrade.spec.js`; T1 e2e re-pinned to 42.3 percent.
