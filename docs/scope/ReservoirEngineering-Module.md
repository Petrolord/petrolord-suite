# Reservoir Engineering module — engine-credibility plan (post-R5)

Status: **plan of record, approved 2026-07-17.** Extends
`Reservoir-ROADMAP.md` (R0–R5, all shipped to production 2026-07-16 at
841724df5). The R series made the catalog honest and the tiles real;
this doc governs what comes next: engine credibility gates, the two
approved app builds, and the canonical-module rules that stop math
from being re-implemented per app.

## 1. Current state (12 Active reservoir tiles)

R0–R5 left the module at 12 Active / 33 Archived. Every Active tile
has a routed app and a jest-tested client engine (or the
textbook-validated server MBAL engine behind Reservoir Balance). See
`Reservoir-ROADMAP.md` §2–3 for the audit and phase record.

One tile changed copy in the 2026-07-17 hygiene pass (§2): the
`relative-permeability-designer` alias is now named **Relative
Permeability & Fractional Flow** and says it opens the Fractional
Flow Analyzer.

## 2. Hygiene record (2026-07-17, PR #93 — precursor to this doc)

Three production-integrity items fixed on a dedicated branch BEFORE
this doc landed, plus one finding reported:

1. **Well Test Analyzer tile archived** (Production module; migration
   `20260717090000`, applied live + logged in MIGRATIONS.md). The app
   is a UI mock: "Run Analysis" is a 1.5 s `setTimeout`, and every
   result is hardcoded in `src/utils/wellTestCalculations.js`
   (kh=123.4 md, skin=5.6, Pi=3510 psia) regardless of the uploaded
   data. The tile must not present as a working analyzer. Route kept;
   real PTA is future scope planned against this app (§6).
2. **The four R0-archived shells derouted** (`App.jsx` 484–487 →
   `<Navigate replace>` redirects to their successors:
   scenario-planner → forecast-scenario-hub, eor-designer →
   eor-screening, uncertainty-analysis → ReservoirCalc Pro,
   reservoir-simulation-connector → reservoir dashboard). Their page
   files, whose compute called the nonexistent
   `scenario-planner-engine`, are deleted (salvage pointer: parent of
   the PR #93 hygiene commit, 5d478d2d4). Also removed: Reservoir
   Balance's ReportsExport "Push to Scenario Planner" button, which
   invoked the same nonexistent engine from an ACTIVE app and
   deep-linked the dead route.
3. **Rel-perm alias tile renamed** (same migration) so no tile
   misrepresents what it opens; the standalone-designer claim
   ("generate and normalize") is gone. Real SCAL scope is §4.3.

**Mock-PRCC finding (reported, no code change):** nothing user-facing
calls the `reservoir-engine` edge function's `run_uncertainty` action
(its PRCC output is literally `Math.random()`). The only
uncertainty-shaped caller was the archived Uncertainty Analysis
shell, and it called `scenario-planner-engine` instead. Live callers
of `reservoir-engine` (Waterflood Dashboard, ReservoirContext) use
only `get` / `list` / `dashboard`. **Follow-on:** strip the dead
`run_uncertainty` action (and its mock samplers) at the next
`reservoir-engine` touch — it is an edge function, so removal
requires a redeploy, and it must not survive to be re-wired.

## 3. Near-term: dcaEngine.js direct oracle tests

> **GATE CLEARED 2026-07-18 (SCAL program SC1, see SCALStudio-STATUS.md):**
> 25 closed-form oracle tests + armed literature fixtures (Weaver CED
> P03-004 worked examples, typed with provenance; SPEE REP #6 and
> Poston & Poe remain visible jest-todo entries until the owner supplies
> the PDFs). The suite caught and fixed a real defect: calculateEUR's
> hyperbolic branch returned NEGATIVE EUR for every b != 1 (sign error in
> the (1 - b) denominator; zero consumers, nothing stored was poisoned).

**Elevated to near-term. Hard requirement before the NextGen "DCA &
Forecasting" course ships** (the engine-extraction runway starts with
`dca`, and a course must never teach against an engine whose fits are
only property-tested).

`src/utils/declineCurve/dcaEngine.js` (Arps exponential / hyperbolic
/ harmonic, OLS fitting with standard errors, EUR, forecast
generation) currently has NO direct test file — it is exercised only
indirectly (closed-form Arps checks through
`forecastScenarioCalculations.test.js`, plus `dcaGroupRollup.test.js`
downstream). Required:

- A dedicated jest suite against **published oracle fixtures: SPEE
  Recommended Evaluation Practice #6 (decline-curve estimation) and
  Poston & Poe, "Analysis of Production Decline Curves" (SPE)** —
  known rate histories in, published qi/Di/b and EUR out, stated
  tolerances.
- Covers `fitArpsModel` (all three model types), `calculateEUR`
  (economic-limit cutoff), and `generateForecast` round-trips.
- Ships BEFORE the course; also unblocks the `dca` extraction into
  `@petrolord/engines` with the same fixtures as goldens.

## 4. Approved builds and their gates

### 4.1 Reservoir Balance aquifer tab (client + server engines)

Recommendation (approved): surface analytic aquifer influx inside
Reservoir Balance as an aquifer tab powered by the client engine
(`src/utils/aquiferInfluxCalculations.js`), alongside the server MBAL
engine's aquifer models — screening in the tab, history-matching in
the engine.

**HARD GATE — no shipping both engines until this exists:** a
committed cross-validation test in which the client Carter-Tracy
reproduces the **Dake Exercise 9.2** benchmark within stated
tolerance, i.e. the same fixture the server engine validates against
in `tools/validation/mbal-validation.ts` (CASE 2C): truth N = 312
MMSTB, engine OOIP 301.0 MMSTB (inside the ±10% gate that absorbs the
documented Carter-Tracy vs Hurst-van-Everdingen method spread), final
cumulative We ≈ 88–89 MM rb (Dake reD=5 solution: 89.2 MM rb). The
client series must match the server engine's We history on that
fixture within a tolerance stated in the test file itself.

- **Δp convention: VERIFIED 2026-07-17.** The client Carter-Tracy
  uses the cumulative total drawdown `Δp_n = pi − p_n`
  (`aquiferInfluxCalculations.js:297`, explicitly commented "NOT
  incremental"), not the vEH centred-average increments (those are
  correctly confined to `vanEverdingenHurst`). Correct per
  Carter-Tracy (1960) / Dake §9.6.
- **Known blocker the gate is designed to force:** the client pD is
  the infinite-acting line-source solution (½·E1(1/4tD)) with no
  finite-reD support, while Dake 9.2 is a finite aquifer (reD = 5).
  Late-time We from an infinite aquifer will overshoot the finite
  benchmark, so passing the gate almost certainly requires adding
  finite-aquifer pD(tD, reD) to the client engine first. That work
  happens BEFORE the tab ships, not after.
- Current client tests (`aquiferInfluxCalculations.test.js`) are
  internal-consistency only (WD table match, limits, monotonicity,
  CT-vs-vEH ~15% agreement); they do not satisfy the gate.

### 4.2 SCAL Studio — DECISION: build thin-real

**Locked 2026-07-17: build SCAL Studio as a thin-real app** — Corey
relative-permeability curve design plus capillary pressure via the
Leverett J-function, **golden reference: Leverett (1941)** — nothing
speculative (no LET, no hysteresis, no network models) until the thin
core is validated and used.

- **Phasing: after the hygiene pass (done, §2) and after the
  dcaEngine oracle tests (§3).** It is third in line, not concurrent.
- Follows the util-engine + jest pattern (`scalCalculations.js` +
  golden tests against Leverett 1941 J-function data), white-standard
  ChartFrame charts, `saved_scal_projects` persistence per the
  saved_<app>_projects convention.
- Seeds its own tile when real (G-series rule). The renamed
  "Relative Permeability & Fractional Flow" alias tile is then
  archived — SCAL Studio becomes the rel-perm home, and the
  Fractional Flow Calculator keeps Buckley-Leverett.

## 5. Monte Carlo / NPV canonical modules (decision recorded)

The repo has grown parallel implementations of the same math. Locked
choices, now also enforced by a CLAUDE.md rule ("No new Monte Carlo
or NPV implementations; import canonical modules."):

- **Canonical Monte Carlo:**
  `src/pages/apps/ReservoirCalcPro/services/MonteCarloEngine.js`
  (jest-tested, the volumetrics flagship's sampler). Any new
  probabilistic feature imports it (extracting it to a shared
  `src/lib` module when first needed outside ReservoirCalc Pro is the
  sanctioned move).
- **Canonical NPV / cash-flow:** client-side full-fiscal economics is
  `calculateEconomics` in `src/utils/npvCalculations.js` (NPV
  Scenario Builder — Economics owns valuation per the R5 split);
  server-side batch economics is the `epe-cash-flow-engine` edge
  function. Reservoir apps do not grow their own valuation: they hand
  off profiles (the R5 CSV handoff) or reuse the deliberately-labeled
  indicative helper in `forecastScenarioCalculations.js`.
- **Grandfathered (no rewrites, consolidate during engine
  extraction):** `dcaMonteCarlo.js` (EUR distributions),
  `riskedReservesCalculations.js` (tested triangular MC + NPV),
  `monteCarloEngine.js` in utils (single consumer, usePhase4State),
  and the many fdp/fiscal utils. None of these is a template for new
  work.
- The mock `run_uncertainty` in `reservoir-engine` (§2) is dead code
  slated for removal, not a canonical anything.

## 6. Coverage gaps (unchanged from Reservoir-ROADMAP.md §4)

- **PTA/RTA:** the archived Well Test Analyzer tile (§2) is the
  placeholder; a real pressure-transient engine (validated against
  published buildup/drawdown examples) is future, owner-gated scope
  planned against that app.
- **Simulation connectivity:** owner-gated, large.
- **Coning, EOS/compositional, tracer, CO2/H2 storage:** each earns a
  tile only when built on a validated engine.

## 7. Non-goals

Reservoir-ROADMAP.md §5 stands: no volumetrics duplication
(ReservoirCalc Pro owns it), no shell revivals, no new test
frameworks — and per §5 above, no new Monte Carlo or NPV
implementations anywhere in the Suite.
