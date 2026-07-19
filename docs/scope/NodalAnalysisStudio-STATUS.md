# Nodal Analysis Studio — STATUS

Plan of record: `NodalAnalysisStudio-PLAN.md`.

## 2026-07-19 — NA1 complete (branch `feat/nodal-na1-ipr-engine`)

- Engine foundation in `src/utils/nodal/`: numerics, units, friction,
  temperature, PVT adapter over Fluid Studio (+ water/brine/surface
  tension), in-situ flows, minimum-curvature trajectory, oil IPR family
  (PI/Vogel/composite Standing/Fetkovich/Jones), gas deliverability
  (Darcy m(p)/back-pressure/LIT over the welltest gas layer).
- Validation harness `tools/validation/nodal/`: independent Python oracle
  (independence by route: Colebrook bisection, Simpson m(p)), goldens
  generator, labeled-CASE runner. **430 gates green.**
- Jest: 9 suites, 56 tests green, including `goldens.test.js` enforcing
  the oracle goldens in CI.
- Literature fixtures (CASE 8) present but unarmed: awaiting
  owner-provided book-verified worked examples (Economides, Beggs, Brown,
  Guo & Ghalambor, Takacs). Until then all NA1 math is oracle-validated
  tier.

## 2026-07-19 — NA2 complete (branch `feat/nodal-na2-vlp-traverse`)

- Traverse engine (`traverse.js`): Heun marching with local (p, T) PVT
  per stage, oil and wet-gas streams, bhpFromWhp / whpFromBhp / vlpCurve,
  unliftable-column detection.
- Correlation registry (`src/utils/nodal/correlations/`): no-slip,
  Fancher-Brown (genuine GLR-banded chart), Beggs & Brill + Payne,
  modified Hagedorn-Brown (Economides-family fits + Griffith), Gray.
- Gas columns (`cullenderSmith.js`): Cullender-Smith two-step + Simpson
  and average T&Z, deviated H/MD handling, fMoody override for book
  fixtures.
- Harness: **943 gates green** (CASE 9 transcription equality for all
  five correlations, CASE 10 traverse vs RK4 route, CASE 11 C-S vs RK4
  ODE, CASE 8 literature anchors armed). Jest: 14 suites, 105 tests,
  including the CI literature gate.
- Literature tier: C-S/average T&Z and the B&B holdup chain are
  literature-anchored (Guo 4.5/4.6 book-text, B&M 2.2 book-text at 2%
  with the Papay-vs-Standing-Katz z caveat, UTP thesis secondary, Lyons
  6.2.5 book-text). mHB and Gray are oracle-validated tier: Gray has no
  published worked example anywhere accessible; the Takacs mHB fixture
  is committed unarmed (chart-fit divergence at X1 ~ 7e-5, documented in
  literature-fixtures.json).

## 2026-07-19 — NA3 complete (branch `feat/nodal-na3-system-solve`)

- `system.js`: operating-point solve with stability classification
  (stable/unstable crossings, dead and no-stable-solution states), oil
  and gas wrappers, sensitivity sweeps.
- `gasLift.js`: injection response screening; validation case is a
  naturally dead 70% water-cut well revived to ~500 stb/d at 200 Mscf/d
  with textbook diminishing returns.
- `chokes.js`: Gilbert/Ros/Baxendell/Achong/Pilehvari critical two-phase
  chokes + gas sonic/subsonic chokes with upstream inversion and
  Joule-Thomson downstream temperature.
- Harness: **1022 gates green** (CASE 12 operating points vs oracle
  bisection+RK4 ≤0.23%, CASE 13 choke transcription equality, CASE 14
  gas-lift response ≤0.04% + concavity). Jest: 17 suites, 134 tests.
- Literature: 11 armed fixtures (adds PEH Gilbert/Ros choke example and
  Guo Examples 5.1/5.2/5.3, all book-text). Sachdeva subcritical
  two-phase choke parked unarmed pending SPE 15657 primary text.

Next: NA4 studio UI on the shell kit (PLAN §3).
