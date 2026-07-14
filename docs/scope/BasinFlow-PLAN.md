# BasinFlow Genesis — G7 Upgrade Plan (Geoscience-ROADMAP.md Phase G7)

Drafted 2026-07-14 against BasinFlowGenesis-AUDIT.md (verdict: UPGRADE).
Branch: `feat/basinflow-g7`.

## 0. Findings that supersede the audit

Deep-dive re-verification before planning found the app is in worse shape
than the audit recorded — the audit's "usable start-to-finish" was wrong:

1. **The shipped simulation is 100% NaN.** `SimulationEngine.run` calls
   `BurialCompactionEngine.initializeSolidThickness(layers)` but discards
   the returned array (the function maps to new objects, mutates nothing),
   so every layer's `solidThickness` is `undefined`. Newton-Raphson then
   produces NaN geometry, NaN temperatures, and Ro pinned at its 0.2
   initial value. Empirically confirmed with a jest probe. No valid
   number has ever come out of the routed app.
2. **The results contract is inconsistent.** The engine returns
   `{meta, data}`; `ResultsPanel` and all six plots read `results.data.*`
   (correct), but `CalibrationView` reads `state.results.burial` etc.
   (undefined) — calibration misfit statistics have always been vacuous.
3. **CalibrationView has two "Chart removed" placeholder panels** where
   the Ro-vs-depth and T-vs-depth profile charts should be.
4. **Per-layer `thermal` and `compaction` objects are collected in state
   (LayerPropertyEditor) but the engines ignore them**, always reading
   the lithology libraries. `lithologyMix` is likewise unused.
5. **The heat solver uses matrix conductivity only** — no
   porosity-dependent effective conductivity, so shallow (high-φ) rocks
   conduct like fully compacted rock.
6. **Routing correction to the audit**: the routed page is
   `src/pages/apps/BasinFlowGenesis/BasinFlowGenesis.jsx` (the real app).
   The dead files are the *top-level* `src/pages/apps/BasinFlowGenesis.jsx`
   ("Coming Soon" placeholder, imported nowhere) and
   `src/pages/apps/BasinFlowAnalysis.jsx` (lazy-imported in App.jsx line
   98 but never rendered by any route).
7. **Blast radius**: `src/pages/apps/MechanicalEarthModel/ExpertMode.jsx`
   (routed at `apps/geoscience/mechanical-earth-model/expert`, tile
   archived at G0) imports `BasinFlowContext`, `StratigraphyPanel`, and
   `VisualizationPanel` — these three survive any cleanup. The MEM
   route's own fate belongs to the Drilling MEM rebuild, not G7.
8. **TFJS blast radius confirmed**: `@tensorflow/tfjs` is imported only
   by `services/ml/{MLEngine,CalibrationPredictor}.js` — dropping the
   ml tab lets the package leave `package.json` entirely.
9. **The Arrhenius gas constant is off by 1000×.** `MaturityEngine` uses
   `R = 1.987` commented as kcal/(mol·K) — that is the *cal* value
   (kcal is 0.0019872). With E = 34–72 kcal/mol the exponent
   −E/(R·T) is ~1000× too small, so every kinetic bin fully reacts in
   the first time step at any temperature. Currently masked by the NaN
   temperatures from finding 1; would surface the moment that is fixed.
   The G7 spec pins E×4184 J/mol with R = 8.314 J/(mol·K)
   (PyBasin-aligned).

## 1. Scope

Execute the audit fix set (1–7) plus the wiring bugs above, on the
existing engines (they are individually sound: Athy/Sclater-Christie
decompaction with Newton-Raphson, implicit TDMA transient heat, EasyRo
kinetics machinery). Credible product = **burial + thermal + maturity +
mass-based generation/expulsion, oracle-validated**, with the demo-grade
periphery deleted.

**Out of scope (deferred, cuttable §7-style):**
- Seismic-velocity-driven pore-pressure prediction ("here or later" per
  roadmap) — **defer to a G7 follow-on**: it depends on Seismolord
  velocity models and is a separable app surface. Recorded as owner
  question Q4.
- Migration/charge volumetrics beyond the 1D expulsion bucket (Darcy
  migration, trap charge) — out of the defensible-1D-app envelope.
- Gradual intra-layer deposition (layers still appear at `ageStart`;
  deposition-rate refinement is a later nicety). dt stays 1 Ma.

## 2. Kinetics facts locked for the fix (published sources)

- **Easy%Ro (Sweeney & Burnham 1990, AAPG Bull. 74/10)**: single
  A = 1.0e13 s⁻¹; 20 activation energies E = 34–72 kcal/mol step 2;
  vitrinite stoichiometric weights
  [0.03, 0.03, 0.04, 0.04, 0.05, 0.05, 0.06, 0.04, 0.04, 0.07,
   0.06, 0.06, 0.06, 0.05, 0.05, 0.04, 0.03, 0.02, 0.02, 0.01]
  (Σ = 0.85); **%Ro = exp(−1.6 + 3.7·F)** where F is the unnormalized
  weighted reacted fraction (max 0.85) → Ro range 0.20–4.69, matching
  the published 0.2–4.7 validity range. Cross-checked against the
  PyBasin open-source implementation (lib/easyRo.py).
- The app already has A = 1e13 and the E array; its error is (a) using
  kerogen-type *generation* potentials as if they were vitrinite weights
  and (b) discarding F for a hand-rolled TTI correlation.
- **Fix shape**: MaturityEngine carries TWO parallel first-order
  integrations per source layer: a *vitrinite* state (fixed S&B weights)
  → F → %Ro, and the *kerogen-type* state (existing type1/2/3
  potentials) → TR → generation. Non-source layers only need the
  vitrinite state.

## 3. Phases

### G7.0 — Validation oracle + goldens (`tools/validation/basinflow/`)
Independent stdlib-Python oracle, dual-implementation rule (written from
the published equations, never from the app JS):
- Decompaction: Athy solid-thickness conservation; oracle uses
  closed-form bisection on the same integral; analytic anchor — a layer
  at surface with φ0=0 must return thickness = Hs exactly; plus
  known-integral checks.
- Transient heat: oracle TDMA written independently; analytic anchors —
  steady state with constant k and no radiogenic heat must give the
  exact linear profile T(z) = T_s + Q·z/k; radiogenic steady state has
  the exact quadratic solution.
- EasyRo: oracle integrates the S&B system under constant heating-rate
  ramps; anchors — isothermal closed form x_i = exp(−k_i·t); published
  behavioral checks (oil-window Ro at geologically sensible T for
  1–10 °C/Ma ramps); cross-check numbers vs PyBasin values.
- Full-sim golden: one reference basin (3–4 layers, source rock, erosion
  event, variable heat flow) — committed JSON goldens, byte-identical
  regeneration, self-asserting generator (fixture-v2 lesson: anchors
  asserted in the generator before writing).

### G7.1 — Engine fixes (audit 1–4 + wiring bugs)
- Fix `solidThickness` wiring (assign the initialized array). This alone
  takes the app from NaN to numbers.
- Standardize the results contract on `{meta, data}`; fix
  CalibrationView's reads.
- MaturityEngine → proper Easy%Ro as §2; TTI kept as a secondary output
  only if free, otherwise deleted.
- Mass-based generation: per source layer, HC potential per unit area
  = ρ_grain·Hs·TOC·(HI/1000) [kg HC/m²]; generated = potential·TR;
  expulsion through the existing saturation-bucket `ExpulsionEngine`
  (porosity-dependent retention) instead of the 0.8·ΔTR heuristic.
- Erosion events `{age, amount}`: modeled as a phantom section deposited
  before the event and removed at the event age (preserves the
  present-day-thickness input contract; deeper layers see the deeper
  pre-erosion burial and hotter history — the whole point of erosion in
  maturity modeling).
- Time-varying heat flow: interpolate `heatFlow.history` at each step
  (existing `PhysicsUtils.interpolate`).
- Thermal grid: subdivide layers to a max node spacing (~100 m), surface
  node at z = 0 (the current top-node-at-layer-center Dirichlet BC is
  off by half a layer), effective conductivity
  k_eff = k_matrix^(1−φ)·k_water^φ (geometric mean), surface temperature
  from `settings` instead of hardcoded 20 °C.
- Honor per-layer `thermal`/`compaction` overrides when present (they
  are already collected by LayerPropertyEditor).
- Jest suite for all engines against the G7.0 goldens.

### G7.2 — Real analysis tabs
- SensitivityAnalysisView: sweep heat flow / erosion amount /
  conductivity scale through real `SimulationEngine` runs (JobScheduler
  already exists for progress); delete the mock processor.
- CalibrationView auto-fit: 1-D minimization (golden-section on constant
  basal heat flow) of combined Ro+T RMS against the entered calibration
  points; delete the `Math.random()` step. Replace the two
  "Chart removed" placeholders with real modeled-vs-measured Ro/T depth
  profiles.
- Convert analytic charts (6 plot components + sensitivity + new
  calibration charts) to the shared white `chartTheme` + `ChartLogo`
  standard (suite chart rule; currently ad-hoc dark Recharts).

### G7.3 — Periphery retirement (audit fix 6)
- Delete tabs + trees: `ml/` + `services/ml/` (+ drop `@tensorflow/tfjs`
  from package.json), `collaboration/` + `CollaborationContext`,
  `enterprise/` + `services/enterprise/`, `versioning/`, `analytics/` +
  `reporting/`. Expert tab bar shrinks to: Properties, Calibration,
  Scenarios, Sensitivity, Analysis, Templates, Batch, Import.
- Delete dead files: top-level `BasinFlowGenesis.jsx` placeholder,
  `BasinFlowAnalysis.jsx` + its App.jsx lazy import.
- File-by-file importer verification before every deletion (G2.6
  discipline); keep `BasinFlowContext` / `StratigraphyPanel` /
  `VisualizationPanel` (MEM /expert imports them).
- Code stops referencing `bf_team_members` / `bf_activity_log` /
  `bf_comments` / `bf_projects`. **Table drops are a separate decision**
  (Q3) — no DDL in this phase without sign-off. `bf_wells` stays (core
  persistence) and gets an RLS review + live pentest block.

### G7.4 — Close-out
- Seed the master_apps tile (%ROWTYPE copy pattern; the archived
  `basin-modeling-suite` marketing row stays archived — never revive).
  Proposed tile name per roadmap tile #8: **Basin & Charge Modeling**
  (Q1); route stays `apps/geoscience/basinflow-genesis`.
- docs/scope/BasinFlow-STATUS.md; jest + e2e + build green; PR to main.

## 4. Owner questions (defaults applied if unanswered; none block G7.0–G7.2)

- **Q1 — Tile name**: "Basin & Charge Modeling" (recommended, functional
  per §6 naming decision) vs keeping "BasinFlow Genesis" as user-facing
  name.
- **Q2 — Retirement list**: confirm all five demo tabs go
  (Team/Collaboration, Enterprise, AI/ML, Versioning,
  Analytics/Reporting). Recommended: yes, all — matches the audit the
  roadmap ratified.
- **Q3 — Legacy `bf_*` tables**: after G7.3 nothing references
  `bf_team_members`, `bf_activity_log`, `bf_comments`, `bf_projects`.
  Recommended: check live row counts, then drop via migration in a
  follow-up (staging-first, logged). Not executed without sign-off.
- **Q4 — Pore pressure**: defer seismic-velocity-driven pore-pressure
  prediction to a G7 follow-on fed by Seismolord velocity models
  (recommended) vs in-scope now.

## 5. Acceptance

- Oracle goldens committed + byte-identical regeneration; jest engine
  suites green at tight tolerance vs goldens.
- Reference-basin run produces finite, physically sensible output
  (monotone burial, T increasing with depth, Ro in 0.2–4.7 and
  increasing with depth, source-rock generation mass > 0).
- Easy%Ro under a 3 °C/Ma ramp hits the oil window (Ro 0.5–0.7) in the
  ~95–120 °C band (published behavior).
- Sensitivity and calibration tabs display engine-derived numbers only;
  no `Math.random()` anywhere in the app.
- Bundle: TFJS chunk gone (~1.9 MB reclaimed).
- All charts on white `chartTheme` + `ChartLogo`.
