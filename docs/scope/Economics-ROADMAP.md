# Economics / Decision Analysis module — plan of record (D series)

Status: **APPROVED by owner 2026-08-14. D0 COMPLETE (this branch).**
Owner directive: build a senior-management decision-analysis flagship
("Petrolord Decision Studio") that sets a mark in the industry, the way
Geoscience-ROADMAP.md (G0-G8) and Reservoir-ROADMAP.md (R0-R5) did for
their modules. Compose the Suite's existing proven engines; do not fork
new math (ReservoirEngineering-Module.md §5 canonical-module rule).

Positioning: incumbents (Palisade @RISK / PrecisionTree, Merak Peep,
Aucerna Planning Space) are desktop-era, fiscal-shallow on Nigeria, and
disconnected from subsurface tools. Petrolord can uniquely close the
chain prospect risking → probabilistic volumes → decline forecasts →
full-fiscal probabilistic economics → decision trees → portfolio →
executive decision brief, because every link already exists in this
repo. The PIA 2021 + Nigeria Tax Act 2025 depth of the EPE engine is a
moat no global tool has.

## 1. D0 audit findings (2026-08-14, full code audit)

13 economics/decision apps audited entry-to-engine. Verdicts:

**Real and solid (KEEP, reuse as building blocks):**
- **EPE** (`src/pages/apps/epe/` + `supabase/functions/_shared/`
  `epe-engine.ts`, 820 LOC) — the module's crown jewel. Deterministic
  cash flow under JV / PSC / PIA 2021 with NTA 2025 framework switch,
  terrain + price-based royalties, HCT/CIT/TET/Dev Levy/NDDC/HCDT,
  production allowances with cap tracking, CPR carryforward, real vs
  nominal discounting, Newton-Raphson IRR. Single-source-of-truth
  shared lib consumed by single-run + batch (tornado) edge functions.
  Gap: deterministic only; ZERO tests on 820 LOC of tax law (D1).
- **Value of Information Analyzer** — genuine decision-tree EMV + EVPI
  math (`src/utils/voiCalculations.js`), the only decision tree in the
  repo. Product gaps: no persistence, no-op export button, fake
  1500 ms "analyzing" delay, verdict sentence hardcoded to "positive"
  regardless of sign (D0), no Bayes-consistency check on inputs (D3).
- **Capital Portfolio Studio** — real 0/1 knapsack DP under a CAPEX
  limit + real efficient frontier sweep; Supabase CRUD on
  `portfolio_projects`/`portfolios`. Gap: the NPVs it optimizes are
  hand-typed, never computed (D4). Perf hazard: DP array sized by raw
  dollar CAPEX limit (D4).
- **Risked Reserves Valuation** — tested (9 cases, seeded LCG) MC with
  correct petroleum P90/P50/P10 convention. R3 of the Reservoir
  roadmap. Stale "this app simulates a mock API" EmptyState copy
  defames a real engine (D0).
- **Forecast Scenario Hub** — tested, reuses the canonical dcaEngine,
  honest scope split ("Reservoir owns forecasting, Economics owns
  valuation"), CSV handoff to NPV Scenario Builder. The structural
  model for Decision Studio integration (D2/D4).
- **Risk Register** (`src/pages/apps/risk-register/`, ~2.2k LOC) —
  real Supabase CRUD, real scoring, real CSV/XLSX/PDF export.
- Adjacent reusable gems: `src/lib/monteCarlo.js` (canonical
  correlated MC, tested) + `tornadoSwings()`; ReservoirCalc Pro's
  `ProspectRiskEngine.js` (bimodal risked volumes, portfolio
  roll-up, tested); RC Pro branded slide/PDF export machinery.

**Real math wrapped in partly fake product (FIX in D0, extend later):**
- **NPV Scenario Builder** — real `calculateEconomics` engine
  (tax/royalty + PSC branches, mid-year discounting, NR IRR, tornado,
  MC) and real XLSX/jsPDF export, BUT: PortfolioView renders five
  hardcoded fake projects as if computed; IntegrationHub fakes
  "connected / synced 10 mins ago" sources with setTimeout; EmptyState
  copy admits the app "simulates a connection". All D0.
- **Probabilistic Breakeven Analyzer** — real MC + per-iteration
  bisection breakeven vs discounted cash flow; refuses to run without
  real production data (good). No tests, no persistence, synchronous
  main-thread compute, fake delay (delay = D0; rest = D2 scope).
- **Fiscal Regime Designer** — most capable client-side fiscal
  modeler (sliding-scale royalty, R-factor split, cost-recovery pool
  with carryforward, 2-D sensitivity), Supabase persistence. BUT:
  self-described non-robust IRR "guess adjustment" capped at 50%,
  invented `opex/2` deduction, invented RRT uplift, fake delay
  (delay = D0; math repairs = D1).
- **Petroleum Economics Studio** — deep `econ_*` persistence, 13 tabs,
  real XLSX/PDF export, BUT the engine
  (`src/utils/petroleumEconomicsEngine.js`) fabricates its breakeven
  KPI (`unitTechCost * 1.1` presented as a computed number — D0),
  loses PSC unrecovered costs, expenses CAPEX immediately (D1).
- **FDP Accelerator** (33-LOC entry + `src/components/fdp/`, 93 files)
  — real DCF/IRR/scenario/optimization utils but 8.8k LOC of UI over
  745 LOC of math, localStorage-only persistence, and a Math.random()
  analytics scatter (scatter = D0; persistence = later scope).

**Mock shells / dead code (DELETE in D0):**
- **Fiscal Regime Comparator** — ORPHAN (not routed, not in allApps);
  self-labeled "placeholder for a complex backend economics engine";
  two dashboard pages still tile-link to its nonexistent route (live
  dead link). Strictly a worse duplicate of Fiscal Regime Designer.
- **Oil Block Bid Optimizer** — ORPHAN; "NPV" is undiscounted gross
  margin; tornado bars are single fresh random samples (pure noise);
  insight string hardcoded.
- **FdpAccelerator.jsx** (204-LOC duplicate of the live
  FDPAccelerator.jsx) + `src/components/fdpaccelerator/` — dead, and
  broken if revived (invokes a `generate-fdp` edge function that does
  not exist). Its Supabase table wiring is noted for future FDP
  persistence work before deletion.
- **RiskHeatmap.jsx** (413 LOC) — hardcoded `MOCK_RISKS` fake risks +
  fake trend data + no-op export, routed live. A real Supabase-backed
  heatmap already exists inside Risk Register.

**Cross-cutting defects:**
- FOUR parallel client fiscal engines (`npvCalculations.js`,
  `petroleumEconomicsEngine.js`, `fiscalDesignerCalculations.js`,
  `fiscalComparatorCalculations.js`) + `epe-engine.ts` server-side;
  the §5 canonical rule is unenforced in Economics.
- Discounting convention clash: `npvCalculations.js` mid-year (t+0.5)
  vs `epe-engine.ts` year-end; no reconciliation note anywhere.
- Entitlement id mismatches between route `appId`s and `allApps`
  (`voi-analyzer` vs `value-of-information-analyzer`,
  `breakeven-analyzer` vs `probabilistic-breakeven-analyzer`, `epe`
  vs `epe-suite`; `petroleum-economics-studio`, `risk-register`,
  `risk-heatmap` absent entirely) with no alias normalization.
- Tests: only Risked Reserves + Forecast Scenario Hub have any.
- Catalog: `decision-tree-builder`, `portfolio-optimization`,
  `efficient-frontier`, `monte-carlo-economics` are Coming Soon stubs
  (D3/D4 fill the first two; the last two land inside Decision
  Studio rather than as separate tiles).

## 2. Phase plan

Each phase is independently shippable, branch + PR per phase (or per
sub-phase where large). Validation-first: engine math gates on
published worked examples before promotion, per repo doctrine.

### D0 — Truth and cleanup — DONE 2026-08-14
Credibility prerequisite: an executive tool cannot share a module with
fabricated numbers.
- D0.1 Delete the three orphan mock apps (Fiscal Regime Comparator,
  Oil Block Bid Optimizer, duplicate FdpAccelerator) and their
  component/util trees.
- D0.2 Repoint the two dashboard tiles that dead-link to
  `fiscal-regime-comparator` at Fiscal Regime Designer; replace the
  mock RiskHeatmap route with a redirect to Risk Register's real
  heatmap.
- D0.3 Reconcile entitlement ids (route `appId` vs `allApps`).
- D0.4 Remove every fabricated output: PES fabricated breakeven KPI,
  NPV PortfolioView fake projects, NPV IntegrationHub fake sync, FDP
  Math.random analytics scatter, VOI always-positive verdict.
- D0.5 Remove fake-latency setTimeouts and stale "this is a mock"
  user-facing copy on real apps; make VOI's export button real or
  remove it.
- Acceptance: jest + build green; no `Math.random()` in any rendered
  economics result path; no user-facing copy describing a live app as
  simulated; no dead links from dashboard tiles.

### D1 — One fiscal truth (3-5 days)
- Canonical decision recorded: `epe-engine.ts` is THE fiscal engine.
- Oracle test harness for `epe-engine.ts` (tools/validation/ pattern,
  mbal-validation.ts as exemplar): PIA published example, JV + PSC
  worked examples from Mian / SPE literature, NTA synthetic case;
  close EPE.md §4.1 untested paths (allowance cap mid-year crossing,
  CPR cessation forfeiture).
- Repair or retire client engines: add PSC unrecovered-cost
  carryforward + depreciation to `npvCalculations.js` (it stays as
  the client-side screening engine) or route its consumers at EPE;
  fix Fiscal Regime Designer's IRR (reuse the canonical NR solver)
  and its invented deductions; delete
  `fiscalComparatorCalculations.js` (D0 already removes its app).
- Document the discounting conventions (mid-year screening vs
  year-end full-fiscal) in this file and in code.

### D2 — Probabilistic economics (4-6 days) — EPE backlog B4 landed
- Distribution inputs (price decks, CAPEX, OPEX, volumes) over the
  deterministic EPE engine; sampling via canonical
  `src/lib/monteCarlo.js` (correlations included); execution through
  the existing `epe-cash-flow-engine-batch` pattern.
- Outputs: NPV CDF + histogram, P(NPV>0), P90/P50/P10 KPI band,
  production/cash-flow fan charts, symmetric tornado via
  `tornadoSwings()`. White ChartFrame + ChartLogo standard.
- Persistence in `epe_*` tables (new run type), no schema change to
  shared tables.

### D3 — Decision trees, EMV and VOI (4-6 days)
- Generalize `voiCalculations.js` into a decision-tree engine:
  multi-stage chance/decision nodes, EMV rollback, EVPI/EVII,
  Bayes-consistency validation of user-entered probabilities.
- Validation gates: Newendorp & Schuyler and Mian worked examples
  reproduced before tile promotion.
- Fills the `decision-tree-builder` Coming Soon tile; VOI Analyzer
  becomes a preset of it (aliased route, single engine).
- Tree nodes can reference D2 probabilistic runs as payoff
  distributions (EMV on distributions, not just point values).

### D4 — Portfolio that computes (3-5 days)
- Capital Portfolio Studio consumes computed valuations: EPE runs
  (D2 distributions), Forecast Scenario Hub cases, and risked
  prospect EMVs via the ProspectRiskEngine pattern, replacing
  hand-typed NPVs (manual entry stays as a fallback).
- Risk-weighted EMV portfolio, efficient frontier under capital
  constraint, P(portfolio NPV < 0). Fix the raw-dollar DP sizing
  (scale to $MM).
- Fills the `portfolio-optimization` Coming Soon tile by absorbing
  it into Decision Studio (tile archived, not duplicated).

### D5 — The executive layer (3-4 days)
- Decision Studio shell app: scenario comparison view, one-page
  "decision brief" PDF (RC Pro slide-export machinery), provenance on
  every number (which run, which assumptions, when, by whom).
- Boardroom-grade visuals per the chart template standard; owner copy
  rule (no em dashes / AI-styled contrastives) applies to all copy.
- Catalog: one new `decision-studio` tile Active; constituent Coming
  Soon stubs archived. Tile flips ship WITH the code per the
  master_apps deploy lesson.

## 3. Rules for this module (binding)
- No new NPV / MC / IRR implementations: import `epe-engine.ts`
  (server), `npvCalculations.js` (client screening),
  `src/lib/monteCarlo.js`, `tornadoSwings()`. Extending the canonical
  modules is allowed; forking is not.
- Every engine change gates on its oracle tests.
- Per-phase STATUS updates land in this file (single doc for the D
  series unless a phase grows its own STATUS.md).
- Migrations staging-first, logged in MIGRATIONS.md; master_apps flips
  ship with their routes.

## 4. Phase status

| Phase | Status | Landed |
|---|---|---|
| D0 truth & cleanup | **DONE 2026-08-14** | branch feat/economics-d0-truth-cleanup. Deltas vs plan: the two dashboard pages tile-linking to the comparator (EconomicEvaluation, EconomicAndRisk) were themselves unrouted orphans and were deleted rather than repointed. The entitlement issue was deeper than id aliases: get-user-entitlements returned only master_apps UUIDs while all 78 ProtectedAppRoute guards check slugs, so every guarded app denied licensed non-superadmin users; the function now grants both forms (deployed 2026-08-14). Six route appIds pointed at nonexistent catalog slugs and were repointed (quickvol→reservoircalc-pro, cementing-simulation→cementing-simulation-app, mechanical-earth-model→1d-mechanical-earth-model, iso-compliance→iso-compliance-tool, lessons-learned→lesson-learned-db, qa-plan→quality-assurance-plan). PES breakeven is now a real bisection solve (NPV=0 verified exact). NPV Portfolio/Integration tabs and the FDP Advanced Analytics facade were deleted outright. Follow-up noted: apps/geoscience/hub gates on a nonexistent geoscience-hub app id (should be a module gate); PM Pro has its own untouched IntegrationHub (unaudited). Jest 2229 green, build clean. |
| D1 one fiscal truth | pending | |
| D2 probabilistic economics | pending | |
| D3 decision trees / VOI | pending | |
| D4 computed portfolio | pending | |
| D5 executive layer | pending | |
