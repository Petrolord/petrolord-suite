# Nodal Analysis Studio — Program Plan (plan of record)

Status: NA1 complete on `feat/nodal-na1-ipr-engine`. NA2+ phases below are
the program structure the NA1 harness was built against; owner sign-off on
NA2+ scope happens at each phase PR as usual.

## 1. Context

Nodal analysis (IPR vs VLP system analysis) is the production engineering
workhorse the Suite does not yet have real. The existing footprint is dead
weight: `src/pages/apps/NodalAnalysisEngine.jsx` is an empty file and
`src/pages/apps/NodalPerformanceOptimizer.jsx` is an 88-line setTimeout
mock. This program replaces them with a validated **Nodal Analysis
Studio**: Prosper-class core workflow (fluid model, IPR, wellbore pressure
traverse, operating point, sensitivities, chokes, gas lift screening).

Doctrine (all established in the repo):
- **Validation-first / thin-real**: engine math gates against an
  independent oracle and published worked examples before any UI or tile
  work (`tools/validation/nodal/`, modeled on welltest/mbal).
- **Reuse audited math, never fork it**: PVT delegates to the Fluid
  Systems Studio layer (`src/utils/fluidStudioCalculations.js`); gas
  pseudo-pressure reuses the harness-validated welltest gas layer
  (`src/utils/welltest/gas.js`).
- **Studio shell kit** + context provider + `createSavedProjectsService`
  (persist inputs, recompute on load).
- **White chart standard** (chartTheme + ChartFrame/ChartLogo).
- **Honest catalog**: tile migration ships with the prod build.
- **No em dashes / AI contrastives in user-facing copy.**
- Literature fixtures arm only from owner-provided, book-verified sources
  (`tools/validation/nodal/literature-fixtures.json`); until armed, the
  affected quantities stay at oracle-validated tier.

## 2. Engine layout

`src/utils/nodal/` — pure functions, oilfield units, no React. Runtime
coupling only to the audited PVT layer and the welltest gas layer.

| Module | Contents |
|--------|----------|
| numerics.js | linspace/logspace, interp, linear fit, clamp, Brent solver |
| units.js | field-unit conversion helpers |
| friction.js | Moody/Colebrook (fixed-point from Swamee-Jain seed), laminar |
| temperature.js | linear geothermal profile along the well |
| pvt.js | black-oil adapter over Fluid Studio + water FVF/viscosity (McCain), brine density, surface tensions (Baker-Swerdloff, Hough) |
| flows.js | surface rates → in-situ superficial velocities, no-slip mixture props |
| trajectory.js | vertical/deviated well, minimum-curvature TVD(MD) |
| ipr.js | oil IPR family: PI, Vogel, composite Standing, Fetkovich, Jones; test-point calibration |
| iprGas.js | gas deliverability: Darcy m(p), back-pressure (C, n), LIT (a, b) |

## 3. Phases

### NA1 — Engine foundation + validation harness (DONE)
Modules above, 56 jest tests (incl. `goldens.test.js` oracle gate), and
the labeled-CASE harness `tools/validation/nodal/run-validation.mjs`
(430 gates green): Colebrook vs oracle bisection route, numerics analytic
truths, Vogel identity + calibration round trip, composite/Fetkovich/Jones
vs oracle, PVT adapter across a p,T matrix, minimum-curvature vs oracle,
Darcy gas IPR trapezoid-vs-Simpson at 1.5%, literature CASE skeleton.

### NA2 — Pressure traverse + VLP correlations (DONE)
Heun-marching traverse (`traverse.js`: bhpFromWhp / whpFromBhp /
vlpCurve, oil and wet-gas streams) over the correlation registry
(`correlations/`): no-slip, genuine Fancher-Brown (Brown Fig. 2.41
GLR-banded chart friction, QC lower bound), Beggs & Brill 1973 + Payne
(pattern map, transition interpolation, single-phase guards), modified
Hagedorn-Brown (Economides-family chart fits, Griffith bubble flow,
no-slip floor, rhoNs^2/rhoS friction), Gray 1974 (Fekete-verified
equations, pseudo-roughness). Gas columns: Cullender-Smith two-step +
Simpson and average T&Z (both with deviated H/MD handling and fMoody
override). Gates: oracle transcription equality per correlation, RK4
route independence for traverse and C-S, analytic limits in jest, and
the armed literature set (Guo 4.5/4.6, Brill & Mukherjee 2.2, UTP
thesis, Lyons 6.2.5 holdup chain). Owner amended the fixture-arming rule
2026-07-19: web-sourced verification allowed, recorded per fixture as
book-text or secondary. Known open point: the mHB low-X1 chart region
(Takacs 2.24 reads HL/psi 0.44 where both standard fit families give
~0.28); fixture committed unarmed pending a re-anchor against the
original Hagedorn & Brown figure.

### NA3 — System solve
IPR × VLP operating-point intersection (robust bracketing, no-solution
and unstable-branch detection), sensitivity sweeps (tubing ID, wellhead
pressure, water cut, GOR, skin, reservoir pressure), choke performance
(critical/subcritical), gas-lift screening (injection-rate response
curve). Gates: operating-point closed-form cases, choke coefficient
identities, gas-lift response concavity.

### NA4 — Studio UI
`src/pages/apps/NodalAnalysisStudio.jsx` + context provider on the studio
shell kit: fluid/reservoir/well/completion inputs, IPR tab, VLP tab,
system plot with operating point, sensitivity tornado/family curves,
saved projects, help content. Legacy `NodalPerformanceOptimizer.jsx` and
the empty `NodalAnalysisEngine.jsx` are deleted; their tiles resolved in
the catalog (archive or replace per owner call).

### NA5 — Hardening + ship
Perf smoke case in the harness, full-suite jest + build + e2e, STATUS
doc close-out, prod upload, deploy-gated tile migration.

## 4. Validation tiers

- **oracle-validated**: agrees with the independent Python oracle
  (`tools/validation/nodal/oracle.py`) — current tier for all NA1 math.
- **literature-anchored**: additionally reproduces a book-verified worked
  example (Economides, Beggs, Brown, Guo & Ghalambor, Takacs). Fixtures
  arm only when the owner provides the source pages.
