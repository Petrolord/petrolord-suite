# Economics / Decision Analysis module — plan of record (D series)

Status: **PROGRAM COMPLETE 2026-08-14: D0 through D5 all landed** (PR
stack #171 through #176, merge in order, retarget bases as each lands).
Post-merge launch checklist: (1) prod upload from main; (2) apply the two
deploy-gated tile migrations (decision-tree-builder flip 20260814220000,
decision-studio seed 20260815000000) and mark them applied in
MIGRATIONS.md; (3) owner decisions still open: Newendorp & Schuyler /
Mian PDFs for literature byte-verification (D3 gate note), and a
staging browser E2E pass over the new surfaces (EPE Risk tab, Decision
Tree Builder, Decision Studio) with a logged-in user.
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
  [RETIRED 2026-08-16 by owner decision: the standalone app never
  worked (workspace route param mismatch, dead nav links, undefined
  context functions) — code deleted, tile archived, routes redirect to
  EPE, which now carries the name "Petroleum Economics Studio"
  (migration 20260816120000). `petroleumEconomicsEngine.js` + its test
  survive as the EPE cross-check oracle.]
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
| D1 one fiscal truth | **DONE 2026-08-14** | branch feat/economics-d1-fiscal-truth (stacked on D0). Canonical decision recorded in engine headers: epe-engine.ts is THE fiscal engine; npvCalculations.js stays as the client screening engine with its mid-year convention documented against EPE's year-end. Oracle harness tools/validation/epe-validation.ts (60 checks: PIA worked example frozen locally from the byte-validated DB case, NPV $135,185,570.34 ±$0.01 + all line items; JV + PSC hand-derived closed forms; NTA force_pia/force_nta delta = TET→DevLevy 1.6x on same base; §4.1 allowance mid-year cap crossing + CPR cessation forfeiture both PASS, closing EPE.md §4.1) + jest CI gate under supabase/functions/_shared/__tests__/. Client repairs: npvCalculations PSC carryforward + opt-in straight-line depreciation + IRR sign guard; fiscalDesigner bisection IRR (uncapped), tax base = contractor profit share (opex/2 halving removed), RRT uplift now a regime parameter; petroleumEconomicsEngine PSC carryforward via its dormant costPool. Cross-engine agreement proven: all three engines reproduce the same hand-derived PSC case. 22 new client-engine tests + 11 CI-gate tests. Open (unchanged): Mian/SPE literature byte-verification awaits owner PDFs; Min ETR (NTA §57) math still unimplemented. |
| D2 probabilistic economics | **DONE 2026-08-14** | branch feat/economics-d2-probabilistic (stacked on D1). EPE backlog B4 landed. supabase/functions/_shared/epe-mc.ts: seeded MC over computeCashFlow (variables oil/gas price absolute + capex/opex/production CSV-row multipliers, Gaussian-copula correlations, petroleum percentiles, decile tornado); sampling primitives vendored 1:1 from src/lib/monteCarlo.js with a jest ANTI-DRIFT gate requiring bit-identical samples on shared seeded RNG streams (the §5 rule enforced across runtimes). epe-monte-carlo edge fn deployed (thin I/O, smoke-tested); epe_mc_runs table live (owner RLS, MIGRATIONS.md logged). Risk (Monte Carlo) tab in EpeResultsViewer: distribution config, P90/P50/P10 + P(NPV>0) + base KPIs, NPV CDF S-curve, cumulative cash-flow fan, shared TornadoChart, all on ChartFrame/ChartLogo standard with PNG export. Harness Case 7 (67 checks total) + 13 jest tests. Note: fan bands are nominal cash flow; NPV honors the run's real/nominal basis. Follow-up parked: browser E2E of the Risk tab with a logged-in user (staging), raw-sample export for auditors. |
| D3 decision trees / VOI | **DONE 2026-08-14** | branch feat/economics-d3-decision-trees (stacked on D2). src/lib/decisionTree.js is the canonical DA engine: EMV rollback over arbitrary decision/chance/terminal trees (branch costs, optimal-path marking, probability validation), EVPI, Bayes-derived EVII (posteriors from priors + likelihoods, inconsistency impossible by construction; 0≤EVII≤EVPI tested incl. useless-signal=0 and perfect-signal=EVPI), impliedPriors consistency check, buildInformationTree (tree rollback ≡ closed forms, tested). 16 hand-derived oracle tests. VOI Analyzer refactored to delegate to the engine (4 parity tests on its default inputs: EMV 15/VOI 33/EVPI 63) + now warns on Bayes-inconsistent entries. New Decision Tree Builder app (apps/economics/decision-tree-builder): outline editor + conventional SVG diagram (squares/circles/triangles, optimal path emerald, ChartLogo standard), templates (blank, drill-vs-farm-out, Bayes-consistent VOI), JSON export/import, saved_decision_tree_projects persistence (migration 20260814210000 APPLIED live), terminal payoffs linkable to saved EPE MC runs (mean NPV in $MM = EMV basis, closing the D2 integration bullet). Tile flip 20260814220000 is DEPLOY-GATED (NOT applied; also see gate note below). DEVIATION FROM PLAN, OWNER TO CONFIRM: the plan gated tile promotion on reproducing Newendorp & Schuyler / Mian published worked examples; those PDFs are not on hand, so validation is via exact hand-derived closed forms (same D1 approach as JV/PSC). Literature byte-verification stays an open gate; owner may either provide the references before the tile flips or accept the analytic gates. |
| D4 computed portfolio | **DONE 2026-08-14** | branch feat/economics-d4-computed-portfolio (stacked on D3). Optimizer extracted to src/utils/portfolioOptimizer.js and upgraded: risked-EMV objective (EMV = pos·NPV − (1−pos)·fail_cost, ProspectRiskEngine convention of risked vs success-case kept separate), step-scaled knapsack DP (exact 1-$MM table for integer inputs, ~2000-cell quantization otherwise — the raw-dollar memory hazard is gone), efficient frontier, negative-EMV projects never forced in, and a portfolio risk summary (exact success/failure mixture moments per project, independent-normal approximation for the sum, P(portfolio NPV<0) via canonical normalCDF; assumption stated in the UI). 15 hand-derived tests. UI: Add Project button + per-row edit/delete finally wired (the dialog existed but NOTHING invoked it — users could not create projects at all), POS/EMV columns + EPE-MC provenance badges, ProjectForm links a saved EPE Monte Carlo run (percentiles + stdDev arrive in $MM, manual entry stays as fallback), results show risked EMV / success NPV / P(loss) / P90-P10 band and the frontier moved to the white ChartFrame standard with PNG export; comparison relabeled to risked EMV. Migrations both APPLIED live: 20260814230000 (additive risking/provenance columns) + 20260814235000 (archive absorbed stubs portfolio-optimization, efficient-frontier, monte-carlo-economics). Parked: correlation between projects (roll-up treats them as independent, as ProspectRiskEngine does; note shown in UI), Forecast Scenario Hub as a third valuation source. |
| D5 executive layer | **DONE 2026-08-14** | branch feat/economics-d5-executive-layer (stacked on D4). New Decision Studio app (apps/economics/decision-studio): pulls the user's saved artifacts across the chain (epe_mc_runs with config names, saved_decision_tree_projects, portfolios + projects), side-by-side comparison of up to 4 Monte Carlo cases (percentiles, P(NPV>0), base, seed/iterations), and a one-page decision brief PDF where EVERY section carries a provenance line (source name + id + timestamp + seed/iterations + stated assumptions; screening-grade analyses labeled). Brief content built by a pure, tested model (briefModel.js, 7 tests reusing the D3/D4 hand-derived cases; decision EMV and portfolio optimization recomputed by the canonical engines at brief time) and rendered by briefPdf.js over the new shared src/lib/pdfBrand.js banner (extracted from RC Pro's ReportGenerator; RC Pro still carries its own copy, consolidation parked to avoid disturbing its export test suite). No new math anywhere in D5 by design. Tile seed 20260815000000 DEPLOY-GATED (NOT applied), %ROWTYPE sibling copy. Route/allApps wired. |
