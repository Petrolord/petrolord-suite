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

## 2026-07-19 — NA4 complete (branch `feat/nodal-na4-studio-ui`)

- Studio UI live: `NodalAnalysisStudio.jsx` + `NodalAnalysisStudioContext`
  on the shell kit, six tabs (System / Inflow / Outflow / Sensitivity /
  Gas lift / Chokes), oil and gas well modes, oilfield/SI display
  toggle, saved projects with debounced autosave, help drawer.
- Persistence migration applied live 2026-07-19 (additive over the
  legacy Horizons-era table; MIGRATIONS.md row added).
- Routes registered (`apps/production/nodal-analysis-studio` + legacy
  slug aliases + `/dev/nodal-analysis-studio`); production build green;
  e2e on live staging: default well flows and the UI operating point
  matches the committed oracle golden within 2 percent.
- Legacy cleanup: empty `NodalAnalysisEngine.jsx`, mock
  `NodalPerformanceOptimizer.jsx`, `components/nodaloptimizer/` and
  `utils/nodalCalculations.js` deleted. `components/nodalanalysis/`
  retained for the routed Integrated Asset Modeler (NA5/owner call,
  along with the `nodal-analysis-engine` edge function it invokes).

## 2026-07-19 — NA5 complete (branch `feat/nodal-na5-ship`) — PROGRAM CLOSED

- Perf smoke armed (harness CASE 15): single traverse 8 ms, operating
  point solve 49 ms, gas-lift screening 168 ms, C-S 0.2 ms, 1000 choke
  evaluations 4 ms. **Harness total: 1027 gates green.**
- Tile: `20260719210000_activate_nodal_analysis_studio_tile.sql`
  activates the legacy `nodal-analysis-engine` "Coming Soon" slug in
  place (slug kept as entitlement key, Production module). DEPLOY-GATED:
  apply with the prod upload, never before.
- Full jest, production build and the staging e2e re-verified on the
  final stack.

## 2026-07-19 — PROD LIVE + retirement follow-on

- Owner uploaded `/root/suite-upload-20260719-c7bc9e99b.zip`; the
  deploy-gated tile migration applied and verified: **Nodal Analysis
  Studio is Active in the Production module** (the same apply pass also
  cleared the backlog: Material Balance Studio rename, SCAL Studio seed,
  aquifer + rel-perm archives).
- Integrated Asset Modeler RETIRED (owner decision 2026-07-19): page and
  `components/nodalanalysis/` deleted (CollapsibleSection moved to
  `components/artificiallift/`), route redirects to the studio, tile
  Archived, `nodal-analysis-engine` edge function deleted (sole
  consumer).

### Open items for the owner
- Unarmed fixtures: Takacs mHB low-X1 chart anchor (needs the original
  Hagedorn & Brown 1965 figure, SPE 940-PA) and Guo Table 5.4 Sachdeva
  subcritical choke (needs SPE 15657 primary text).

## 2026-09-04 — engine extraction to @petrolord/engines (branch `refactor/nodal-engine-extraction`)

Nodal analysis is the path root of the Production course series, and
course authoring in that programme is extraction-gated: the math lands in
the central repo with goldens and an independent Python oracle before any
lesson is written.

- **Engines PR:** `Petrolord/petrolord-engines#106` —
  `engines/production/nodal.js`,
  `test-data/production/goldens/nodal_cases.json`,
  `tools/validation/production/oracle_nodal.py`,
  `__tests__/production.nodal.test.js` (35 gates; full engines suite
  2270 passing).
- Suite side is shims only, no behaviour change. `src/utils/nodal/ipr.js`
  re-exports the oil IPR family; `iprGas.js` re-exports Rawlins-Schellhardt
  and Houpeurt and keeps the pseudo-pressure route (m(p) is a welltest
  table); `cullenderSmith.js` re-exports the march with the Suite's Papay
  z injected; `system.js` re-exports `solveNodeCore`/`gasPwfAtRate` and
  keeps the two wrappers that bind the NA2 multiphase traverse, which is
  a Suite-side engine and was not extracted. Verified bit-identical
  across every extracted function before the swap.
- `src/utils/nodalAnalysisCalculations.js` deleted. It had no importers
  anywhere in the app and was never wired to this studio: a 62-line stub
  with a hardcoded 500 + 0.1q "VLP", a hardcoded $80/bbl and a hardcoded
  60% choke. Extracting it would have put fake physics in the course
  path.

### What the oracle found

The oracle is written from the published method statements, not from the
JS: closed-form IPR inverses against the engine's Brent root find, the
Cullender and Smith defining integral marched as an ODE in depth by RK4
against the engine's two-half-step trapezoid and Simpson, a 300-to-4000
point crossing scan with bisection against the engine's 40-point scan,
and analytic residual slopes against the engine's central difference.
Everything agreed to machine precision except two things, and both are
real:

1. **The two-station Cullender and Smith march is 11.6 psi low on a
   friction-dominated gas well** (1.3 psi at 9 MMscf/d, 11.6 psi at
   13.3 MMscf/d on an 8000 ft, 2.441 in string), which moves that well's
   nodal operating rate by about half a per cent. The published method
   assumes the integrand is near-linear over the whole column and that
   stops holding when friction rivals gravity. The engine now takes a
   `steps` input; the error falls with its square. **The studio still
   runs the published default of two stations** — raising it is a
   behaviour change and is a follow-on with its own gate.
2. **A 40-point crossing scan loses a well whose two intersections have
   pinched to less than one grid interval apart**, which is exactly the
   shape a well takes as it approaches loading up. Gated in the engine as
   a documented resolution requirement.

Also fixed in the extracted copy: the crossing scan only ever treated a
sample as the LEFT end of a bracket, so an exact zero residual landing on
the last sample was dropped.

### Follow-ons
- Raise the studio's Cullender-Smith `steps` off the published two (needs
  a re-verified staging pass; it moves displayed BHP).
- Switch `solveGasOperatingPoint` to `gasPwfAtRateExact` for the
  empirical families (worth about 0.6 Mscf/d in 11,000 on the gated well).
