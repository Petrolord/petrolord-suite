# Basin & Charge Modeling (BasinFlow Genesis) — STATUS

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

- **Q3 pending**: orphaned `bf_team_members` / `bf_activity_log` /
  `bf_comments` / `bf_projects` tables have zero code references —
  recommend row-count check then drop migration (owner-gated, not
  executed). `bf_wells` stays (core persistence). Its RLS should get a
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
(calibration and import), BF3 (units, links, help) follow.
