# Nodal Analysis Studio engine validation

Validation-first gate for the nodal engine in `src/utils/nodal/` (plan of
record: `docs/scope/NodalAnalysisStudio-PLAN.md`).

## Pieces

- `oracle.py` - independent Python stdlib implementation. Independence by
  route where the mathematics allows: Colebrook by bisection on 1/sqrt(f)
  (JS uses fixed-point from a Swamee-Jain seed); gas pseudo-pressure by
  composite Simpson quadrature of 2p/(mu z) (JS integrates a trapezoid
  over a 60-point PVT table); black-oil correlations re-derived from their
  published forms in independent code. The IPR family and minimum
  curvature are closed-form algebra transcribed twice and gated for
  equality.
- `genfixtures.py` - regenerates the committed goldens consumed by jest
  and the harness:

      python3 tools/validation/nodal/genfixtures.py
      # writes src/utils/nodal/__tests__/goldens.json

- `run-validation.mjs` - labeled-CASE gate runner (welltest/mbal style),
  exit 0 only on full pass:

      node tools/validation/nodal/run-validation.mjs

- `literature-fixtures.json` - published worked-example anchors. Arming
  rule (owner-amended 2026-07-19): fixtures may arm from web-sourced
  verification; each records its `verification` level (`book-text` =
  read from a full-text copy of the book, `secondary` = reproduced from
  implementations that validate against the book) and its tolerance
  rationale. Unarmed fixtures document why they stay off (see the Takacs
  mHB fixture: chart-read vs standard-fit divergence at low X1).

## Case map (NA1)

| CASE | Gate |
|------|------|
| 1 | Moody/Colebrook vs oracle bisection route, laminar exact |
| 2 | Numerics analytic truths (Brent Dottie number, exact fits) |
| 3 | Vogel dimensionless identity + calibration round trip |
| 4 | Composite Standing / Fetkovich / Jones vs oracle goldens |
| 5 | Black-oil PVT adapter vs oracle across a p, T matrix |
| 6 | Minimum-curvature trajectory vs oracle + exact arc identities |
| 7 | Darcy gas IPR (trapezoid m(p)) vs oracle Simpson route at 1.5 % |
| 8 | Literature fixtures (armed only with book-verified data) |

## Case map (NA2)

| CASE | Gate |
|------|------|
| 9 | All five gradient correlations vs oracle transcription (no-slip, Fancher-Brown chart, Beggs and Brill + Payne, modified Hagedorn-Brown, Gray: holdup exact, dpdz within the Colebrook route difference, pattern equality) |
| 10 | Traverse route independence: JS Heun 50 ft vs oracle RK4 5 ft, <= 0.3 %, oil and wet-gas streams |
| 11 | Cullender-Smith two-step + Simpson vs oracle RK4 of the equivalent ODE, <= 0.5 % |
| 8 | Armed literature anchors: Guo 4.5 (average T&Z), Guo 4.6 + Brill & Mukherjee 2.2 + UTP thesis (Cullender-Smith), Lyons 6.2.5 (Beggs & Brill holdup chain), rNodal Fancher-Brown friction cross-check |

## Case map (NA3)

| CASE | Gate |
|------|------|
| 12 | Operating point (oil composite IPR x B&B traverse, gas back-pressure IPR x C-S column) vs oracle bisection over the RK4 route |
| 13 | Choke correlations (Gilbert family + gas nozzle) vs published coefficients and worked examples |
| 14 | Gas-lift screening response vs oracle route + concavity of incremental gains |

Analytic limits (single-phase reduction, hydrostatic zero-rate,
horizontal zero-head, down-up round trip, Griffith quadratic, chart-fit
ranges, closed-form node intersections, J-curve stability
classification) are enforced in jest (correlations.test.js,
traverse.test.js, correlationsWetGas.test.js, system.test.js,
gasLift.test.js); the armed literature set also runs in CI via
literature.test.js. A perf smoke case lands with NA5.
