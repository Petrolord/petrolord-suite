# Economics / Decision Analysis module — plan of record (D series + E series)

Status: **D SERIES COMPLETE + LAUNCHED** (D0-D5 merged 2026-08-14, PRs
#171-#176; prod upload + deploy-gated tile migrations applied
2026-08-14/15). **EPE WAVES A-F COMPLETE 2026-08-21** (engine v3.9;
recorded in §5 below, detail in EPE.md §3b-§3g). **E SERIES COMPLETE
2026-08-29** (E0-E5 all merged, PRs #309-#315; §6 below carries the
per-phase record). All four E-series migrations are APPLIED and the
`epe-monte-carlo` edge function is redeployed.

Open after the E series:
- ~~**OWNER DECISION: Technical Report Autopilot's backend is gone.**~~
  **RESOLVED 2026-08-29: owner chose REBUILD, and it shipped the same
  day.** Templates and the DOCX export moved client-side (they never
  needed a server; the document is now assembled in the browser from
  the sections on screen with JSZip). Generation moved to the new
  `report-autopilot` edge function, deployed and smoke-tested, with a
  prompt built around refusing to invent figures. The fake file upload
  became real client-side reading of text and CSV attachments, which
  now actually reach the writer. Detail: AssuranceApps-STATUS.md.
- **Prod upload** of the E-series build (nothing is tile-gated; the
  migrations are applied and safe ahead of it).
- Owner PDFs (Newendorp & Schuyler; Mian) for literature
  byte-verification, and a staging browser E2E pass with a logged-in
  user.
- The EPE engine items E5 left open with what each needs: DMO, carried
  interests, monthly evaluation, in-app data editing.
- `src/utils/digitizerApi.js` points at the same dead Heroku host and
  has zero importers; it belongs to Geoscience.
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

## 5. Interim record: EPE Waves A-F (2026-08-16 to 2026-08-21)

This roadmap previously carried no record of the EPE audit program that
ran between the D series and the E series. Summary (full detail in
EPE.md §3b-§3g and EPE-Industry-Audit.md):

- **v3.3/v3.4 (PRs #183/#184, merged 2026-08-16):** ingestion
  hardening (loud validation, header aliases), PES retirement + EPE
  renamed "Petroleum Economics Studio" (slug `epe-suite` kept),
  economic limit test, post-tax abandonment, decision KPIs, breakeven
  bisection, exports, help guide. `econ_*` family dropped and `epe_*`
  DDL backfilled (PR #185, 2026-08-17).
- **Waves A-F (PRs #221-#226, merged 2026-08-21, engine v3.9):**
  loss carryforward + HCT gas exclusion + audit trail (A); WI on
  PSC/PIA, per-year price decks, mid-year discounting, valuation
  year/sunk treatment (B); schedule shift, tornado ranges, MC payback +
  correlations (C); NPV profile, submission one-pager PDF, waterfall,
  comparison deltas (D); org sharing v1, locking, assumption library,
  FSH import (E); PSC tranches, ITC carryforward, min-ETR top-up
  approximation, decom sinking fund, 1P/2P/3P scenarios, NGN mirror
  KPIs, incremental economics (F). All edge functions redeployed; prod
  UI live at a4e7d6211 2026-08-21.
- **Still open post-program:** §4.10 in-app data editing, DMO, carried
  interests, monthly evaluation, literature cross-checks awaiting
  owner PDFs. These fold into E5.

Note: the §1 audit text above is the historical D0 record; figures
like "epe-engine.ts, 820 LOC" describe 2026-08-14 (the engine is
1,740 LOC at v3.9).

## 6. The E series — cleanup completion (APPROVED 2026-08-29)

Full-code re-audit 2026-08-29 (post D series, post Waves A-F): the 12
routed economics apps are the right portfolio; no new apps are needed.
The work is engine reconciliation, de-mocking, gating, and product
floor. Findings the D series left behind or never scoped:

- **A FIFTH fiscal engine the D series missed:**
  `src/utils/breakevenCalculations.js` powers the gated, sold
  Probabilistic Breakeven Analyzer with its own flat-royalty/flat-tax
  NPV, an unseeded `Math.random()` triangular sampler
  (non-reproducible results), and zero tests.
- **A sixth de-facto NPV/IRR implementation** in
  `src/utils/fdp/costCalculations.js` (+ `scenarioCalculations.js`),
  untested, never audited.
- **FDP Accelerator is the largest liability:** ~11k LOC,
  localStorage-only persistence, zero tests, and still-reachable
  fabrication (`OptimizationService.js` returns `Math.random()` well
  counts + hardcoded "+15.4% NPV" behind a 2.5 s fake delay;
  `CostOptimization.jsx` fully hardcoded; live state seeded from mock
  collaboration/workflow data; ~1,639 LOC of product-theatre modules).
- **PM Pro's IntegrationHub** still fakes PPFG/Geomech syncs — the D0
  follow-up that was never done.
- **Five unguarded routes:** project-management-pro,
  npv-scenario-builder, fiscal-regime-designer,
  capital-portfolio-studio, fdp-accelerator.
- **Dead fabrication still in tree:** unrouted CompetitorIntelligenceHub
  + DealDataRoomAutomator (~805 LOC), `hubApps.js` economicsApps (40
  entries, 30 fictional, zero importers), the dead MC trio
  (`monteCarloEngine.js`/`riskMetricsEngine.js`/
  `portfolioRiskCalculator.js` held only by two zero-importer hooks),
  `petroleumEconomicsValidation.js`.
- **Product floor:** zero studio-kit adoption, zero page smoke tests,
  help guides missing on 7 of 12 apps, no persistence at all on NPV
  Scenario Builder / VOI / Breakeven.
- **Stale records:** PETROLORD_APPLICATION_CATALOG.md §5 lists a
  deleted app as Coming Soon and misses Decision Studio/Tree Builder;
  `src/data/applications.js` (consumed by quote/billing surfaces) is
  missing 7 routed economics apps; 5 tiles predate the migrations dir
  with no in-repo catalog record.

### E-series dispositions (all 12 apps kept)

| App | Disposition |
|---|---|
| EPE | Flagship; parked engine items close as owner gates clear (E5). |
| Decision Studio | Keep; pdfBrand consolidation with RC Pro (E5). |
| Decision Tree Builder | Keep; help guide (E2). |
| VOI Analyzer | KEPT STANDALONE (owner decision); persistence + ChartFrame + export + help (E2). |
| Capital Portfolio Studio | Gate (E0); correlation parked item when feasible (E5). |
| NPV Scenario Builder | Sanctioned quick-screening tier; gate + persistence + studio kit + ChartFrame (E0/E2). |
| Fiscal Regime Designer | Re-platform onto epe-engine semantics or prove parity per case, becoming a regime sandbox that hands designed regimes to EPE (E1). |
| Probabilistic Breakeven Analyzer | Engine REBUILT: retire the private NPV in favor of npvCalculations/epe primitives, seeded MC via src/lib/monteCarlo.js, tests, persistence (E1/E2). |
| FDP Accelerator | SLIM REBUILD (owner decision): theatre modules + mock seams deleted, real cost/scenario core kept, Supabase persistence, economics wired to EPE, gated (E3). |
| Project Management Pro | Fix or honestly remove the fake IntegrationHub; gate; smoke tests (E4). |
| AFE Cost Control Manager | Tests + help guide (E4). |
| Technical Report Autopilot | AUDIT THEN HARDEN (owner decision): verify the generation path is real first; archive decision returns to owner only if it proves a shell (E4). |

Adjacent apps stay put: Risked Reserves Valuation + Forecast Scenario
Hub (Reservoir), Risk Register (Assurance).

### E-series phases

| Phase | Delivers |
|---|---|
| **E0 — Truth & records** | Delete orphans/dead code/hubApps fiction; gate the 5 unguarded routes (+ entitlement slugs in allApps); backfill applications.js registry; catalog-doc refresh; in-repo catalog migration recording the 5 pre-migrations tiles. |
| **E1 — Fiscal truth completion** | Breakeven engine rebuild (retires the 5th engine), Fiscal Regime Designer reconciliation, FDP economics onto EPE (retires the 6th), convention headers everywhere, D1-style parity tests. |
| **E2 — Product floor** | Studio kit + persistence (NPV, VOI, Breakeven), help guides for the 7 apps missing one, ChartFrame adoption, page smoke tests module-wide (Production pattern). |
| **E3 — FDP slim rebuild** | The biggest single phase (see disposition above). |
| **E4 — PM Pro + AFE + Report Autopilot** | IntegrationHub fix, tests/help, Report Autopilot audit-then-harden. |
| **E5 — Parked close-outs** | Raw MC sample export, portfolio correlation, pdfBrand consolidation; owner-gated literature checks when PDFs arrive; EPE parked engine items. |

### E-series locked decisions (owner sign-off 2026-08-29)

1. FDP Accelerator: SLIM REBUILD, not archived.
2. VOI Analyzer: KEPT STANDALONE; product-floor work only.
3. Technical Report Autopilot: AUDIT THEN HARDEN.

### E-series phase status

| Phase | Status | Landed |
|---|---|---|
| E0 | **SHIPPED 2026-08-29** (branch feat/economics-e0) | **Truth and records.** Five unguarded routes gated (`project-management-pro`, `npv-scenario-builder`, `fiscal-regime-designer`, `capital-portfolio-studio`, `fdp-accelerator`) — all five had live, sold tiles and an open door. **19 files / ~1,020 LOC of dead fabrication deleted** with zero dangling references: the unrouted Competitor Intelligence Hub (which returned invented competitor activity, named operators with invented well counts and capex, as though it were intelligence) and Deal Data Room Automator (fabricated document view and download analytics), both with their whole component and util trees; the dead Monte Carlo trio (`monteCarloEngine.js`, `riskMetricsEngine.js`, `portfolioRiskCalculator.js` — NOT the canonical RC Pro engine) together with the two zero-importer hooks that were the only thing keeping them alive; and `petroleumEconomicsValidation.js`. **Seven routed economics apps backfilled into `src/data/applications.js`** — the registry feeds the quote, billing and module-access surfaces, so an app missing there cannot be quoted or licensed however Active its tile is. Catalog doc §5 rewritten against the live catalog (it had listed a deleted app and both fabricated ones as Coming Soon, and omitted Decision Studio and Decision Tree Builder entirely). **First in-repo record of the Economics catalog**: migration 20260829800000 asserts the twelve real tiles and archives all 25 zero-code Coming Soon rows on the G0/R0/D0/P0/F0 precedent. Applied after a rolled-back dry run; live state now **12 Active / 0 Coming Soon / 29 Archived**. Note for the record: the D0 audit said five tiles predated the migrations directory; the honest count is **eight**. Build clean. |
| E1 | **SHIPPED 2026-08-29** (branch feat/economics-e1) | **Fiscal truth completion.** Retired the fifth and sixth NPV implementations and reconciled the Fiscal Regime Designer, with every claim gated as a LEDGER IDENTITY or a PARITY RELATION rather than a remembered number. **Five defects, all real:** (1) the Fiscal Regime Designer was losing the cost oil entirely - recovered cost was taken out of profit oil and credited to nobody, so contractor take plus government take fell short of revenue minus costs by exactly the amount recovered, every year, biasing every regime comparison against the contractor; (2) the same engine could never recover opex, because its cost pool was seeded with capex and never fed again; (3) **payback was reported one full year early module-wide** - the screening engine counted from the year before the crossing year, so a project paying back at 1.67 years was shown as 0.67, and both FDP copies had the same off-by-one; (4) FDP economics applied NO fiscal terms at all, computing revenue minus opex and printing it on a card labelled NPV at 10 percent, roughly forty percent too high, with an unbracketed Newton-Raphson IRR that returned whatever it drifted to; (5) the sold Breakeven Analyzer sampled with a bare Math.random() so no result was reproducible, treated stated percentiles as triangular endpoints (deleting the outer twenty percent of the distribution and understating every downside), and drew one-sided tornadoes. **Parity proven:** the Fiscal Regime Designer and the screening engine now produce IDENTICAL annual contractor cash flows on a regime both can express, with NPVs differing by exactly (1+r)^0.5, the documented year-end versus mid-year convention, gated so it can never be mistaken for drift; FDP agrees to 9 dp; the solved breakeven price zeroes the engine NPV to 6 dp. **New shared primitives** in src/lib/monteCarlo.js: `mulberry32` seeded RNG, and `fitTriangularToPercentiles` which solves the triangular through three stated percentiles in shape-then-scale form and clamps-and-says-so outside the reachable 0.382 to 0.618 band. Also deleted two zero-importer FDP utils: a `calculateNPVObjective` whose comment promised a discounted sum and whose body computed one year of revenue minus twenty of opex undiscounted, and a Math.random() correlation matrix. Breakeven's three Chart removed placeholders replaced with real ChartFrame charts and its fake PDF/CSV toast replaced with a real CSV carrying the seed and the full sample. Jest 386 suites / 5429 green; build clean. Detail: FiscalTruth-STATUS.md. |
| E2 | **SHIPPED 2026-08-29** (branch feat/economics-e2) | **Product floor.** **Persistence for the three sold apps that had none** (NPV Scenario Builder, VOI Analyzer, Probabilistic Breakeven Analyzer): migration 20260829810000 adds `saved_npv_projects`/`saved_voi_projects`/`saved_breakeven_projects` on the saved_<app>_projects convention; the Breakeven study stores its production profile, because that app rightly refuses to run without one and a saved study without it could never be re-run. The studio-kit persistence recipe had been hand-copied into ~20 app contexts identically, so its state machine now lives in `src/hooks/useSavedProjects.js`. **Six help guides** for the apps whose surface is stable after E1; the roadmap's "7 of 12 missing" was understated, the honest count was **ten** (FDP is E3, PM Pro/AFE/Report Autopilot are E4). Each states which fiscal tier its numbers come from, quantifies the year-end versus mid-year gap at ~4.9 percent, and names the assumption it would most like you to forget; the guard test also proves each guide is actually reachable from a routed page. **Every economics chart moved onto ChartFrame**, which surfaced two fabrications: the **VOI Analyzer drew nothing** (its decision tree panel was a "Chart removed" placeholder, so the app computed a tree and showed an empty box) and now draws the real tree through the canonical builder and rollback, with an exact Bayes inversion gated so the picture cannot disagree with the KPIs; and the **Fiscal Regime Designer asserted three conclusions it never computed** (sorted by NPV, it declared the top-NPV regime also had the fastest payback, that the runner-up maximized government revenue "significantly higher than other options", and invented a capex-resilience and price-response ranking) which are now derived, and omitted when unsupported. Dead node/link plot data deleted; the spider chart's "mocking plotting data" comment corrected (the endpoints are real, the interpolation is the approximation). **Page smoke tests for all twelve apps**, the module's first. **Finding for E4: Technical Report Autopilot's backend is gone** - it calls a hardcoded Heroku host that returns "No such app" on every path including root, so report generation, the report-type list and DOCX export are all unreachable on an Active tile; archive-or-rebuild is the owner's call. `src/lib/epeApi.js` (zero importers, same dead host) deleted; `src/utils/digitizerApi.js` reported for Geoscience. Jest full src sweep 278 suites / 3179 green; build clean. Detail: ProductFloor-STATUS.md. |
| E3 | **SHIPPED 2026-08-29** (branch feat/economics-e3) | **FDP Accelerator slim rebuild** (owner-locked decision: rebuild, not archive). The module's largest liability: a 33-line page over ~11k LOC, no tests, no server persistence, fabrication reachable from the first screen. **Seven theatre modules deleted**: Mobile App (a mobile app that does not exist, reporting 45 daily active users and a 99.8 percent crash-free rate, all four numbers literals in a service file), API Integration (a REST/GraphQL API that does not exist, with a request tester that "called" it), Optimization (`Math.random()` well counts, a hardcoded "+15.4 percent NPV" and a fixed 35/25/15 Pareto chart behind a 2.5 s wait that existed to look like computation), Collaboration and Workflow (mock team, comments, notifications, tasks, approvals and an invented AUDIT LOG), Training Academy and Help Center (mock courses, FAQs, articles and videos). **Seven fake cross-app imports deleted** - the most serious finding: every remaining module had a button that announced it was contacting Geoscience, the reservoir engines, Well Design Studio, AFE, Project Management Pro or the HSE system, waited behind a simulated latency, and returned hardcoded values, so a user could take a porosity of 0.22 or a $250k/day rig rate into a development decision believing it came from their own work. The data is kept as clearly labelled example data (`exampleData.js`, buttons now say "Load example", nothing names a source). **Three more fabrications in the chrome**: an "Active Integrations" panel with green connected dots from a registry that contacted nothing, a Validation box that always read "pending validation from the engineering team", and Save/Export buttons with no onClick beside a permanently-lit notification dot. Right panel now lists what the plan is actually missing, computed from the plan; **a real bug surfaced there too** - it read `reserves.p50` where the state keeps `reserves.summary.p50`, so the Reserves stat had been rendering undefined. **Added**: Supabase persistence (migration 20260829820000, `saved_fdp_projects`; the localStorage draft is kept deliberately as a scratch buffer and the help guide says it is not a home), a real help guide replacing the mock Help Center, and **the first tests this app has ever had** (14, two of which read the source tree so the deleted seams cannot return and no string may claim a sync that does not happen). Dead legacy chain deleted (HelpContext/TrainingContext + their services + the zero-importer test helper that was their only root). FDP JSX 8,547 to 6,660 lines; route bundle **262.7 kB to 187.9 kB**. Build clean. Detail: FdpSlimRebuild-STATUS.md. |
| E4 | **SHIPPED 2026-08-29** (branch feat/economics-e4) | **PM Pro, AFE and Report Autopilot.** **PM Pro's External Systems hub removed** (the D0 follow-up never done): it offered Jira/SAP/Slack/SharePoint/Salesforce, and Connect waited 1.5 s, wrote `pm_integrations` with `status: 'connected'` and a config of `{apiKey: '*****'}`, and showed a green Connected badge, having contacted nothing - it PERSISTED the false state rather than only displaying it. `pm_integrations` verified **empty (0 rows, 0 projects)** before removal, so nothing was stranded; the table is left in place per the DB rules. **The five app integration panels were worse and are corrected**: PPFG inserted two risks into the user's register reading "High Overpressure Zone Detected" and "ramp in pore pressure at 3200m based on Eaton calculation", scored 20 and tagged `ppfg_source: true` (removed entirely - inventing engineering findings in a register people act on is the worst thing found in this phase); Geomech inserted an **Approved** MEM deliverable after a wait commented "simulate verifying MEM completion" that verified nothing, and pushed a mud window of "1.20 - 1.45 SG" written into the source; Log Facies, BasinFlow and Velocity inserted deliverables pre-set Approved or Under Review. All now create drafts, all five say plainly there is no live link, and the honest template actions are kept. **AFE**: JV partners were held in React state seeded with two invented companies ("Partner A Corp" 30 percent, "Partner B Ltd" 15 percent) that every user met and could bill against, and lost on reload - migration 20260829830000 adds `afe_partners` scoped through the parent AFE, and the tab opens empty. **A billing hazard closed**: `calculatePartnerCosts` gave a NEGATIVE operator share when interests summed past 100, billing out more than the cost, silently; it now reports validity and says what is wrong. **First tests on this app's math**: 19 over EVM metrics, the S curve and the split, including the identity that the allocation accounts for every currency unit exactly once. Help guide added. **Report Autopilot**: the archive-or-rebuild decision stays with the owner; what is fixed is that a dead backend no longer dumps a 404 page's HTML under the heading "Autopilot crashed". It now distinguishes an absent service from a real error and says nothing you entered caused this, the brief is still saveable, and disables Generate. 12 guard tests. Build clean. Detail: AssuranceApps-STATUS.md. |
| E5 | **SHIPPED 2026-08-29** (branch feat/economics-e5) | **Parked close-outs.** Three parked items closed, two stated honestly as still open, and one record correction that was itself a defect. **(1) Raw Monte Carlo sample export** (parked at D2): `runEpeMonteCarlo` records one row per iteration - the values drawn and the NPV, IRR and payback they produced, INCLUDING the iterations where IRR or payback does not exist, which the percentile arrays drop by design. It travels to the caller and is NOT stored (five thousand rows on every saved run would bloat `epe_mc_runs`, and a seeded run reproduces without them), so the button appears for the run you just made and not one reloaded from history. Gated by five tests, the useful one being that **the reported percentiles re-derive from the exported sample**. `epe-monte-carlo` redeployed; persisted payload unchanged. **(2) Portfolio correlation** (parked at D4): the roll-up treated projects as strictly independent, the most flattering assumption a portfolio can be given. `portfolioRiskMetrics` now takes an average pairwise correlation, `Var = sum var_i + rho((sum sd_i)^2 - sum var_i)`, which collapses to the independent sum at rho=0 (so the default is exactly the old behaviour) and reaches `(sum sd_i)^2` at rho=1 where diversification buys nothing; means are untouched. The panel reports what independence WOULD have said beside the correlated figure, so the cost of the assumption is visible. 10 tests. **(3) pdfBrand consolidation** (parked at D5): RC Pro's fork of `fitText`/`loadPetrolordLogo`/`drawBrandHeader` deleted in favour of `src/lib/pdfBrand.js`; **RC Pro's export test suite passes unchanged** (the concern that parked it) and three new tests there pin the banner text. **(4) The record correction**: EpeHelpGuide told users the Studio could not apply the NTA s.57 minimum ETR "which is not implemented in the engine" (it shipped in Wave F, is jest-gated, and its checkbox is on the same screen), could not support per-year price decks (Wave B) and could not run incremental economics (Wave F); EPE.md §4.2 and its validation table carried the same stale claim. **Understating the app is the same failure as overstating it.** Both corrected, and min ETR is now described as what it is: a project-level approximation reported on its own strippable line, because the statutory test is company-level against NGN turnover a project model cannot see. **(5) Still open, with what each needs**: literature byte-verification (blocked on owner PDFs); DMO (needs a fiscal design decision on price basis and whether the shortfall is a volume diversion or a price haircut - implementing on a guess would produce exactly the authoritative-looking arithmetic this programme spent five phases removing); carried interests (a carry model, not a parameter); monthly evaluation (annual fiscal year logic, allowance caps and carryforwards end to end, not a resolution setting); in-app data editing (a product feature; the help guide now states the re-upload path). Jest 392 suites / 5553 green; build clean. Detail: ParkedCloseouts-STATUS.md. |
