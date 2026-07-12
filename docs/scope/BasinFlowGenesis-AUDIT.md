# BasinFlowGenesis — G0 Audit (Geoscience-ROADMAP.md Phase G0)

Audited 2026-07-12. Verdict: **UPGRADE** (do not rebuild, do not retire).

## What it is

1D basin & petroleum-systems modeling app. Live route
`apps/geoscience/basinflow-genesis` → `src/pages/apps/BasinFlowGenesis/`
(~9,959 LOC, ~90 files). Two loose files are dead: `BasinFlowGenesis.jsx`
(unrouted "Coming Soon" placeholder shadowed by the directory) and
`BasinFlowAnalysis.jsx` (411-loc older prototype, lazy-imported but has no
route) — both are retirement candidates in the upgrade pass. **No catalog
tile exists** for `basinflow-genesis` (route-only app; the Coming Soon
"basin-modeling-suite" row is a separate unbuilt marketing tile).

## What's real (~30–35% of the LOC — small but genuinely sound core)

- **Burial history / decompaction** (`services/BurialCompactionEngine.js`):
  Athy/Sclater-Christie exponential porosity with published coefficients,
  solid-thickness conservation, Newton-Raphson decompaction with analytic
  derivative. The strongest part; would survive due diligence.
- **Thermal** (`services/HeatTransportEngine.js` + `PhysicsUtils.tdma`):
  1D **transient** conduction, implicit backward-Euler on a proper
  Thomas/TDMA tridiagonal solver, harmonic-mean interface conductivities,
  Neumann basal-heat-flow BC. Real numerics.
- **Kerogen kinetics framework** (`services/MaturityEngine.js` +
  `KerogenLibrary.js`): EasyRo-style discrete activation-energy
  distribution (34–72 kcal/mol bins, A=1e13 s⁻¹), first-order Arrhenius
  integration, transformation ratio. The machinery is right (but see
  below — its output is discarded).
- **Persistence**: real Supabase CRUD on `bf_wells` with user_id scoping
  and debounced autosave.
- **Workflow**: coherent guided wizard (11 steps with validation) →
  expert mode → results plots wired to real engine output. Usable
  start-to-finish for burial + thermal + maturity.

## What's broken or fake

- **%Ro output is a self-admitted placeholder**: the computed
  transformation ratio is thrown away and Ro comes from a crude
  Lopatin-style TTI correlation (in-code comments: "just distinct place
  holder", "Let's use the TTI correlation for simplicity in V1"). The
  proper Sweeney-Burnham mapping `%Ro = exp(−1.6 + 3.7·F)` is NOT applied
  despite the E-distribution machinery existing. **Fails validation as
  shipped.**
- **Generation/expulsion are normalized curves, not masses**: TOC/HI are
  collected in the UI but never used; generation = ΔTR (dimensionless),
  expulsion = 0.8·ΔTR above Ro 0.7. No volumes.
- **Erosion and heat-flow history are collected but never applied** —
  `SimulationEngine.js` ignores both (constant basal Q, no erosion refs).
- **Two analysis tabs fake results with `Math.random()`**: Sensitivity
  (`SensitivityAnalysisView.jsx:38`) and Calibration auto-tune
  (`CalibrationView.jsx:98`) do not call the real engine.
- **Migration/charge/volumes absent** (phase windows from Ro cutoffs
  only) — the marketing claims are not implemented.
- **Peripheral sprawl**: ~half of the 13 expert-mode tabs are demo-grade
  (Team/Collaboration, Enterprise, Analytics/Reporting, ML, Versioning).
  `@tensorflow/tfjs` — used only by the partly-mock AI/ML tab — dominates
  the app's ~1.9 MB bundle chunk.
- **Zero tests**; no validation against any published benchmark.
- Thermal grid is one node per layer; surface temperature hardcoded 20 °C.

## Recommendation: UPGRADE (bounded fix set)

The hard, easy-to-get-wrong numerics (decompaction solver, transient
tridiagonal heat solver, kinetics framework) already exist and are sound;
a rebuild would discard them for no benefit. The path to a defensible 1D
basin app (burial + thermal + maturity as the credible product):

1. Replace the placeholder Ro correlation with proper Sweeney-Burnham
   EasyRo (machinery exists; small change) + validation test against a
   published maturity benchmark.
2. Wire TOC/HI into real mass generation feeding the existing expulsion
   bucket.
3. Apply erosion events and time-varying heat-flow history in
   `SimulationEngine`.
4. Refine the one-node-per-layer thermal grid; expose surface temperature.
5. Wire Sensitivity and Calibration tabs to the real engine (delete the
   Math.random paths).
6. Retire the enterprise/collab/ML/versioning tabs; drop `@tensorflow/tfjs`
   (reclaims most of the 1.9 MB chunk). Delete the two dead loose files.
7. Add jest goldens for the three core engines (the Seismolord
   validation-first pattern).

Slot in roadmap: Phase G7. A per-app plan (BasinFlow-PLAN.md) should be
written against this audit before work starts.
