# SCAL Studio — Status

> Program ledger for the fourth Reservoir studio-class build (after
> Waterflood W1-W6, Well Test WT1-WT10, Material Balance MB1-MB7).
> Governing decisions: `ReservoirEngineering-Module.md` §3 (dcaEngine
> oracle gate, elevated near-term) and §4.2 (SCAL Studio locked 2026-07-17
> as THIN-REAL: Corey relative permeability + capillary pressure via the
> Leverett J-function, golden reference Leverett 1941 — no LET, no
> hysteresis, no network models until the thin core is validated and
> used). Owner re-confirmed 2026-07-18: thin-real scope honored, executed
> at studio-class quality (lab-data import, fitting to core data,
> multi-sample averaging, saturation-height, handoffs).
> Last updated: 2026-07-18 · SC1-SC4 done.

## Phase ledger

| Phase | Scope | Status |
|---|---|---|
| SC1 | dcaEngine oracle gate (§3) + EUR sign fix | **DONE 2026-07-18** |
| SC2 | `scalCalculations.js` engine + Leverett 1941 golden | **DONE 2026-07-18** |
| SC3 | Studio app skeleton + `saved_scal_projects` persistence | **DONE 2026-07-18** |
| SC4 | Lab Data tab: import, Corey fit, multi-sample averaging | **DONE 2026-07-18** |
| SC5 | Height & Saturation tab + Waterflood handoff + exports | pending |
| SC6 | Tile migrations (deploy-gated pair) + close-out | pending |

## SC1 deliverables (2026-07-18) — dcaEngine oracle gate

The §3 gate: `src/utils/declineCurve/dcaEngine.js` had NO direct tests
(exercised only indirectly). Two suites now pin it:

- **Layer 0** (`__tests__/dcaEngine.oracle.test.js`, 25 tests, closed-form
  self-consistency, no book required): exact synthetic Arps recovery for
  all three models (qi/Di to 1e-6 relative; b exact on the engine's 0.05
  grid, ±0.05 off-grid, both documented); Auto-Select picks the
  generating model; `calculateEUR` against the closed forms AND an
  independent Simpson quadrature for b in {0, 0.3, 0.5, 0.9, 1.0, 1.3}
  plus a hand-arithmetic pin; `generateForecast` round-trips (refit
  recovery, timeToLimit vs the analytic inversion within 1 day, and the
  daily right-rectangle cumulative bias pinned as UNDERSHOOT within 1%,
  deliberately not changed — DeclineCurveContext and Forecast Scenario
  Hub consume the sum as-is); fit window and b-constraint contracts;
  the <3-points empty-fit contract.
- **BUG FOUND AND FIXED under oracle cover**: `calculateEUR`'s hyperbolic
  branch divided by `Di * (b - 1)` instead of `(1 - b)`, returning a
  NEGATIVE EUR for every b != 1 (e.g. -1.8 MM bbl where +1.8 MM is
  correct). Verified zero consumers outside dcaEngine.js before fixing
  (the DCA app derives EUR from generateForecast's cumulative sum), so no
  stored results were poisoned — but the NextGen course and the
  @petrolord/engines extraction would have inherited it. This is exactly
  the failure mode §3 predicted for an engine whose fits were only
  property-tested.
- **Layer 1** (`__tests__/dcaEngine.literature.test.js` +
  `fixtures/dca-literature-fixtures.json`, armed-fixture doctrine:
  missing/unarmed fixture is a hard failure, values typed from the source
  with citations and access dates, never recalled): four cases from
  Weaver, "Forecasting Oil and Gas Using Decline Curves" (CED Engineering
  course P03-004, publicly served PDF, fetched and read page-by-page
  2026-07-18) — exponential oil (printed q and Np at 3 years), shale-gas
  hyperbolic b = 1.2 (the sign-bug branch; both printed cumulative forms),
  the full 11-row printed harmonic rate-cumulative table, and the b = 1.15
  monthly-form cumulative. All pass with tolerances that name each printed
  rounding quirk. **Still pending (jest todo entries, visible in every
  run): SPEE Recommended Evaluation Practice #6 and Poston & Poe (SPE
  2008) are paid documents — the owner supplies the PDFs and their example
  tables are typed as additional cases.** The §3 gate is cleared for the
  course/extraction on the strength of Layer 0 + the armed cases; the two
  named references complete the set when sourced.
- **Sibling modules**: `dcaDiagnostics.js` got a hand-computed smoke suite
  (5 tests: R2/RMSE identities, normalized-residual contract, verdict
  bands). `dcaMonteCarlo.js` and `dcaSegmentDetection.js` are explicitly
  DEFERRED per Module §5 (grandfathered; consolidation happens at engine
  extraction, not before).

### SC2 deliverables (2026-07-18) — `src/utils/scalCalculations.js`

- Corey oil-water and gas-oil sets (gas-oil normalized on
  (Sg − Sgc)/(1 − Swc − Sorg − Sgc), krog at connate water, no
  three-phase), parameter validation, endpoint normalization
  (denormalization stays the existing `scaleKrTable`). Corey primitives
  IMPORTED from `fractionalFlowCalculations.js` (locked one-way
  dependency).
- Corey exponent fitting to lab kr tables via the WTA LM kernel: joint
  log10 residuals over both curves (near-endpoint decades weighted
  fairly), kr floor for definitional zeros, optional endpoint fitting,
  95% CIs. Exact-synthetic recovery to 1e-5; noisy-draw test asserts
  recovery-within-tolerance plus CI sanity (a single fixed draw carries
  no 95% coverage guarantee — documented in the test).
- Leverett J: `LEVERETT_C = 0.21645` (published field-unit constant;
  exact CGS derivation 0.21665 documented, 0.09% delta), lab Pc → J,
  power-law J fit on normalized Sw* (log-space LM), tabulated J with
  log-linear interpolation, geometric-mean multi-sample averaging with
  min/max band and an explicit shared-Swirr override (the data-min
  heuristic distorts Sw* when true Swirr sits lower; the refit r2Log
  exposes it), J → reservoir Pc, saturation-height
  (h = Pc/(0.4335·Δγ)). Pc↔J round trip pinned at 1e-12.
- **Leverett-principle suite** (`scalCalculations.leverett.test.js`): the
  1941 paper's machine-testable claim tested EXACTLY — synthetic Pc for
  three rocks (850 md air-brine, 8 md air-mercury, 120 md oil-brine)
  generated from one J curve collapses back to it within 1e-9; averaging
  returns the source; a 4x permeability typo breaks the collapse by
  exactly sqrt(4) (the diagnostic the Capillary plot will show); power-law
  refit recovers the generating parameters to 1e-6. The paper's
  figure-read correlation points remain a visible jest todo until the
  owner supplies the paywalled paper (armed-fixture doctrine, same as
  SPEE / Poston & Poe).
- CSV parsers for kr and Pc tables with header aliases and per-row error
  messages. 27 tests across the two suites; jest 1511 total.

### SC3 deliverables (2026-07-18) — studio app skeleton

- `src/pages/apps/ScalStudio.jsx` on the shared Studio shell
  (StudioLayout/Header/AutoSave/Help/ProjectManager), tabs
  Curves | Capillary with ?tab= deep links; the tab list grows per phase
  (Lab Data in SC4, Height & Saturation and Export in SC5) so every
  shipped tab is fully functional, never a placeholder.
- `src/contexts/ScalStudioContext.jsx` (WaterfloodDesignContext pattern):
  string form state, ALL engine results useMemo-derived and never
  persisted, `saved_scal_projects` via createSavedProjectsService, 10 s
  debounced autosave, studio notifications. Exported pure builders
  (buildOwParams/buildGoParams/buildReservoirProps/buildJSpec) are
  jest-guarded.
- Curves tab: Corey oil-water and gas-oil parameter rails with engine
  validator messages, kr chart (linear/semilog toggle, PNG export via
  ChartFrame), KPI row, curves-only fw preview (displacement stays in
  Waterflood, said in copy).
- Capillary tab: working J spec (manual power law now; averaged samples
  once SC4 lands), shared-Swirr override with refit-quality hint,
  reservoir rock inputs, J chart (log axis, per-sample scatter ready) and
  reservoir Pc chart. The Leverett-collapse diagnostic note ships with
  the chart copy.
- Routes: `apps/reservoir/scal-studio` (lazy) + `/dev/scal-studio`
  harness. The `relative-permeability-designer` alias is untouched until
  SC6.
- Migration `20260719100000_create_saved_scal_projects.sql` APPLIED live
  (RLS verified: relrowsecurity true, policy `scal_owner_all`) and
  logged; safe pre-deploy (no tile).
- Tests: full-page smoke walking both tabs + 6 wiring tests on the pure
  builders (the samples-mode averaging tolerance documents the
  resample-then-refit bias). Staging vite transforms green.

### SC4 deliverables (2026-07-18) — Lab Data tab

- Sample CRUD in the left rail: rock/fluid properties with lab-system
  sigma-cos-theta presets (air-brine 72/0, air-mercury 480/40, oil-brine
  30/30, all editable), per-sample kr and Pc CSV import through the
  engine parsers with per-row skip messages, downloadable templates that
  themselves parse and validate through the real engine path (jest-pinned).
- Per-sample Corey fit card: exponents with 95% CIs, log-space RMS and
  r2, iteration-cap warning, one-click "Use fit on the Curves tab"
  (context action, values land as studio form strings). Lab points +
  fitted curves chart; endpoint-normalized overlay across samples for
  exponent-consistency judgment. Averaging stays a human decision: the
  studio shows the spread and never silently blends (said in copy).
- Synthetic demo pair (inline deterministic seed, clearly labeled): two
  rocks generated from ONE true J curve, so the Capillary tab
  demonstrates the Leverett collapse live; jest pins that the demo data
  validates, collapses within Pc-rounding, and fits back near its
  generating exponents.
- Capillary samples mode now has real data to average; the Curves,
  Lab Data and Capillary tabs form the full lab-to-model loop.
- Smoke test extended (demo pair loads, fit KPIs render); jest 1523.

## Scope discipline (standing)

Thin-real lock: Corey + Leverett J only. LET, hysteresis, Thomeer,
three-phase models, and any displacement calculation inside SCAL
(Buckley-Leverett stays in the Waterflood Design Studio) are scope creep
against the owner lock and get rejected in review.

## Where things live

- Engine (SC2): `src/utils/scalCalculations.js` — imports Corey primitives
  from `src/utils/fractionalFlowCalculations.js` (dependency direction is
  locked one-way), fitting via `src/utils/welltest/lmFit.js`.
- App (SC3): `src/pages/apps/ScalStudio.jsx`,
  `src/contexts/ScalStudioContext.jsx`, `src/components/scalstudio/`.
- Persistence: `saved_scal_projects` (migration 20260719100000, SC3).
- Tiles (SC6, deploy-gated pair): seed `scal-studio`, archive the
  `relative-permeability-designer` alias.
