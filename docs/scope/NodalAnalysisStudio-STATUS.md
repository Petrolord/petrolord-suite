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

Next: NA2 pressure traverse + VLP correlation set (see PLAN §3).
