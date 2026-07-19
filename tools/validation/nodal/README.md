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

- `literature-fixtures.json` - published worked-example anchors
  (Economides, Beggs, Brown, Guo and Ghalambor, Takacs). Repo rule: a
  fixture arms only when its numbers are book-verified from an
  owner-provided source; until then CASE 8 skips it and the affected
  quantities stay at oracle-validated tier, not literature-anchored tier.

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
| 9 | Gradient correlations vs oracle transcription (no-slip, Beggs and Brill + Payne: holdup exact, dpdz within the Colebrook route difference, pattern equality) |
| 10 | Traverse route independence: JS Heun 50 ft vs oracle RK4 5 ft, <= 0.3 % |

Analytic limits (single-phase reduction, hydrostatic zero-rate,
horizontal zero-head, down-up round trip) are enforced in jest
(correlations.test.js, traverse.test.js). Remaining NA2 gates land with
their engines: Cullender-Smith gas column, modified Hagedorn-Brown,
Gray. NA3 adds operating-point, choke coefficient and gas-lift concavity
gates. A perf smoke case lands with NA5.
