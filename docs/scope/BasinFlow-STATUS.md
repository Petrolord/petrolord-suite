# Basin & Charge Modeling (BasinFlow Genesis) — STATUS

Updated 2026-10-01 — **UPGRADE U2 BUILT** (branch `feat/bf-u2`, engines PR #295
merged, vendored at engines main 2ad4fe0; detail in `docs/upgrade/BasinFlowGenesis-UPGRADE.md`).
What the app does now that it did not:
- the eroded section is drawn on the burial history; plots are keyed by layer id;
- Ro and temperature run through the whole column (slices about 100 m), and
  calibration, the fit and the report compare against it;
- BHT corrections (Horner, AAPG, Harrison) with raw and used values;
- scenarios compare side by side; a template, tops or registry replacement can be undone;
- the PDF report carries the burial, maturity and events plots;
- runs go to a Web Worker with progress and cancel;
- maximum-burial (irreversible) compaction is a model setting (elastic stays the default);
- Pepper and Corvi organofacies and custom kinetics; mixed lithologies;
- a 1D compaction-disequilibrium pressure with a handoff to Pore Pressure Studio;
- Petrophysics porosity and TOC read from the tied registry well;
- a worked example model and help walk;
- contracts out: `src/lib/basinDecompaction.js` (Stratigraphy rates),
  `src/lib/basinPressure.js` (Pore Pressure), `src/lib/basinCharge.js`
  (ReservoirCalc Pro Prospect Risking and Risked Reserves).
Still v1 limits: 1D (no trap, migration or maps: U2-014); basal heat flow is
typed (no lithosphere model: U2-002); the overpressure does not feed back into
compaction; `bf_wells` RLS is one policy with no WITH CHECK (U2-019, owner).

Updated 2026-07-16 — **ENGINES CENTRALIZED** (petrolord-engines PR #1
+ Suite branch `feat/basin-central-engines`): the eleven live G7 math
modules now live in the central `@petrolord/engines` `basin` domain
(vendored at `packages/engines`, synced), with the Python oracle and
byte-identical goldens alongside. The app's `services/` files are
re-export shims (the WellDataManager/Petrophysics pattern); the app's
jest suites validate the vendored central copy against the Suite's
committed goldens unchanged. The dead `VectorizedSolver` (wrong-units
Arrhenius — the exact bug G7.1 fixed) and placeholder
`PhaseBehaviorEngine` were DELETED, zero references. The NextGen
Basin & Charge course (nextgen PR #30) teaches from this same domain.

Previously: **PHASE G7 COMPLETE** (branch `feat/basinflow-g7`).
Plan: BasinFlow-PLAN.md (drafted against BasinFlowGenesis-AUDIT.md).
Tile: `basinflow-genesis` → **Basin & Charge Modeling**, Geoscience,
Active (migration `20260714120000`, applied live).

## What shipped in G7

- **G7.0** — Independent stdlib-Python oracle
  (`tools/validation/basinflow/`) + self-asserted goldens
  (`test-data/basinflow/`, 12 anchors, byte-identical reruns). Pins the
  model spec: Athy/Sclater-Christie decompaction, cell-centred implicit
  heat with geometric-mean effective conductivity, published
  Sweeney-Burnham Easy%Ro (A=1e13/s, E 34–72 kcal/mol, weights Σ0.85,
  %Ro=exp(−1.6+3.7F); cross-checked vs PyBasin), TOC/HI mass-based
  generation, monotone saturation-bucket expulsion, erosion phantom
  sections, piecewise-linear heat-flow history.
- **G7.1** — Engines rewritten to spec and locked to the goldens
  (37 jest tests). Fixed three fatal pre-G7 defects the audit under-
  reported: (1) `initializeSolidThickness` return discarded → the
  shipped simulation was **100% NaN** (empirically confirmed);
  (2) kerogen generation potentials used as vitrinite weights and Ro
  taken from a hand-rolled TTI placeholder; (3) Arrhenius R=1.987
  labeled kcal (that's cal) → exponent 1000× off. Also: per-layer
  thermal/compaction overrides honored (re-synced on lithology change),
  surface node at z=0, {meta,data} results contract cleaned up.
- **G7.2** — Analysis tabs are real: sensitivity sweeps
  (heat flow / erosion / conductivity scale) run the engine; heat-flow
  auto-fit is a golden-section optimizer on Ro+BHT misfit (recovers a
  known Q to <2 mW/m² in tests; scale-fits variable histories
  shape-preserved); calibration profile charts replace the
  "Chart removed" placeholders. All charts converted to the shared
  white `chartTheme` + `ChartLogo`, with age-correct series alignment
  (plots + CSV export previously shifted younger layers to older ages).
- **G7.3** — Demo periphery deleted (ml/, collaboration/ +
  CollaborationContext, enterprise/, versioning/, analytics/,
  reporting/; dead top-level `BasinFlowGenesis.jsx` placeholder and
  unrouted `BasinFlowAnalysis.jsx`). `@tensorflow/tfjs` dropped from
  package.json — app chunk 1.9 MB → 260 KB. Expert tabs now:
  Properties, Calibration, Scenarios, Sensitivity, Analysis, Templates,
  Batch, Import.
- **G7.4** — Tile seeded (functional name per roadmap tile #8),
  MIGRATIONS.md logged (incl. two retroactive G6 entries), docs.

## Deliberate v1 limitations (documented in the oracle spec)

- Compaction is Athy-elastic (porosity = f(current depth)); max-burial
  hysteresis is a recorded follow-on.
- Layers deposit instantaneously at `ageStart`; dt = 1 Ma.
- Erosion `amount` = deposited-at-surface phantom thickness (shale).
- Expulsion is a retention-bucket, no migration/trap modeling.

## Open items / owner decisions (plan §4)

- ~~**Q3 pending**: orphaned bf_* tables~~ DONE: dropped by
  `20260714150000_drop_orphan_legacy_tables.sql` (applied 2026-07-14);
  verified live 2026-10-01, `bf_wells` is the only bf_* table. `bf_wells` stays (core persistence). Its RLS should get a
  pentest block when next touched.
- **Q4 (deferred)**: seismic-velocity-driven pore-pressure prediction
  (fed by Seismolord velocity models) — separable G7 follow-on.
- MEM `/expert` route still imports BasinFlowContext /
  StratigraphyPanel / VisualizationPanel — resolved at the Drilling MEM
  rebuild, not G7.
- ~~Prod build upload to petrolord.com pending (covers G1–G7).~~
  **DONE 2026-07-14** — prod is current (source zip from main
  `e84f8a181`, Hostinger upload confirmed by owner).

## 2026-09-06: BF series (Petrel and PetroMod tester readiness) BF0

Plan of record: docs/scope/BasinFlow-ROADMAP.md, drafted from a walk
through the shell that found it far behind the oracle-locked engines
(erosion dropped by the wizard and never persisted, Expert-mode "Phase
2" placeholders for heat-flow history and erosion, no way to enter
calibration points, a mock Import that fabricates data, no harness).
BF0 built the backend pair and the `/dev/basinflow-genesis` harness
seeded with the reference basin, fixed the persistence of erosion
events and the surface temperature (bf_wells columns added, migration
20260906150000 applied), removed the run dialog's fake delays, and
added the present-day table to the summary. e2e reproduces the golden.
BF1 made Expert mode's heat-flow history, surface temperature and
erosion events real editors (the "Phase 2" placeholders are gone), gave
the wizard a working custom erosion and its preview chart back, and
fixed the run dialog that never re-ran after its first success. BF2
gave the Calibration tab its points editor and replaced the mock
Import with real calibration and tops parsers plus a registry-well
door for the stratigraphy. BF3 added display units (depth in the
account's unit, temperature C or F) across both modes, the Well data
and Open in launchers for a registry-tied model, and the help guide at
`/dashboard/apps/geoscience/basinflow-genesis/help` in place of the
legacy help sheet. BF0 to BF3 are merged; the series is closed.

## 2026-09-26: Senior test T1 (Wave 1 #6)

Report: docs/testing/BasinFlowGenesis-T1.md. Results read the industry
way: numeric geological time axis, oldest left, on every plot; maturity
windows 0.55 / 1.3 / 2.0 %Ro labelled; a Magoon-style events chart
(source, reservoir, seal, overburden, generation, expulsion, critical
moment); %Ro isolines and isotherms on the burial history; transformation
ratio in the Expulsion tab. View layer only (`services/resultsView.js`);
engines untouched.

## 2026-09-28: Design system rollout W4C

The app is on the Petrolord design system (plan of record
`docs/scope/DesignSystem-Rollout.md`, batch 4C). It opens light (grey
panel) and dark stays a per-user choice through the header toggle.

- `BasinFlowShell` wraps the app in `ThemedApp`
  (`data-testid="bf-theme-scope"`), so the page and the `/dev` harness
  share the scope; the help guide wraps itself
  (`bf-help-theme-scope`). The route prefix is registered in
  `src/design/rollout/w4c.js`, so `/help` is covered too.
- Toggle: top right of the mode selector, in the Expert header beside
  Help, and in the Guided wizard toolbar beside Units and Help.
- All own classes moved to `pl-*` roles; status colour only for status
  (validation alerts use the `Alert` status variants, calibration misfit
  pass or warn, batch and well status, sim success or error, workflow
  step done or in error). Decorative icon, heading and tab-underline
  hues and every gradient are gone; primary actions use the default
  `Button`.
- Canvas choice: every plot (burial history with isolines, temperature,
  maturity windows, transformation ratio, generation and expulsion, the
  events chart, calibration profiles and residuals, heat-flow history,
  sensitivity) is a white `chartTheme` chart and sits in
  `data-canvas="chart"`, white in both themes. BasinFlow has no 2D or 3D
  basin view drawn for a dark ground, so there is no
  `data-canvas="dark"` region. Lithology and series colours are
  unchanged.
- Phone width (390): guided template, heat-flow and erosion side panels
  stack under the choices; the Expert header drops the Open in menu
  and the Home label on phones and shows the wells toggle there (it was
  desktop only, so the sidebar could not be closed on a phone); the
  wizard content clears the floating toolbar on desktop.
- Test: `__tests__/BasinFlowGenesis.theme.test.jsx` (the shared four
  checks, every Expert tab and import sub-tab, a dark Expert render, the
  export, scenario and new-well dialogs, a full run with every results
  tab, the Guided wizard steps and the help guide). Engines and
  calculations untouched; the existing suites pass unchanged.

## 2026-10-01: Upgrade programme U1 (practitioner lens), app #11

Doc: docs/upgrade/BasinFlowGenesis-UPGRADE.md. 32 findings, 23 fixed (1 S1,
10 S2), no S1/S2 open; Step 2 ranked backlog with batches A/B/C.

- S1 (engines first, engines PR #294, vendored aeddb4b): a basal age not on a
  whole 1 Ma step (every ICS column) stopped the run at the fraction, so
  "present day" was 0.5 Ma and the youngest layer never deposited. The run
  now ends at 0 Ma; oracle anchor A13; existing goldens byte-identical.
- State: saved scenarios were wiped on every open and a switch carried the
  previous model's result and scenarios; a guided run overwrote the active
  model and ran the previous inputs; batch runs dropped erosion and the
  surface temperature.
- Chain: Send to Basin was refused by `bf_wells.location_coords` (a point)
  for any well with coordinates; a re-send erased the source rock and typed
  erosion; the registry door now uses the same TVD, dated, log-typed build;
  chart versions travel and older-chart ages are flagged; `bf_wells` is in
  `.pld` (bf_model root, the tied well comes along).
- Expert mode edits the source rock (TOC, HI, kerogen) and layer thermal and
  compaction properties; notes say when a result is out of date, erosion
  has no amount, ages are placeholders or on an older chart, or a layer
  carries an earlier release's preset; the reviewer PDF report.
- Open (Step 2): eroded section on the burial plot (BF-T1-E3), Ro through
  the column, maximum-burial compaction, BHT correction, worker, pressure,
  traps and migration.
