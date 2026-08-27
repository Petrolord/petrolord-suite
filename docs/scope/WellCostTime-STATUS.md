# Well Cost & Time Estimator — status

Drilling D11 (Drilling-ROADMAP.md §4), the LAST app of the 12-app D&C
program. Fresh slug `well-cost-time`, route
`/dashboard/apps/drilling/well-cost-time` (gated ProtectedAppRoute).
SHIPPED 2026-08-29.

## What it is

Probabilistic time-depth scheduling and AFE-grade cost estimation on the
wp data spine: an activity-based drilling schedule, an auditable AFE
rollup, and a seeded Monte Carlo risk model whose sampling runs ONLY
through the canonical suite module (`src/lib/monteCarlo.js`, the
CLAUDE.md single-implementation rule).

- **Engine** (@petrolord/engines `engines/drilling/wellCost.js` +
  `data/costBenchmarks.js`, engines PR #53 stacked on #51 — merge order
  #48 → #49 → #51 → #53; all deterministic closed forms):
  - Activity schedule: drill (Δmd/ROP), trip (2·md/speed), casing
    (md/speed + flat), flat; depth continuity enforced; NPT as one
    uniform (1+frac) stretch; the piecewise-linear time-depth curve.
  - AFE rollup: per-day / per-meter / lump bases, tangible/intangible
    split, contingency as its own line on the base subtotal.
  - Cumulative cost-time accrual (per-day with time, per-meter with
    drilled length, lump at its linked activity's end) with the exact
    endpoint identity: final accrual == base subtotal.
  - ADE ch.1 cost-per-depth form (bit economics calculator).
  - `programFromSections`: starter program from the module-wide
    wp_wellbore_geometry hole-section spine.
  - Benchmarks: the ONE salvaged piece of the retired WellCostIQ app
    (regional rate/days table, provenance-commented, indicative-only;
    its fake percentile spread p10 = 0.8 p50 was discarded).
- **Risk model (app side, services/wctRun.js)**: uncertainties overlay
  dists on activity/cost fields; `createCorrelatedSampler` with a
  stored seed (mulberry32) makes runs bit-reproducible; results carry
  P10/P50/P90 (AFE convention: P10 LOW, P90 HIGH — documented in-app),
  histogram, S-curve and a Spearman tornado. The probabilistic total is
  the BASE cost: the risk model replaces the contingency provision.
- **Data spine**: `wp_wct_cases` + immutable `wp_wct_runs` (migration
  20260829010000, applied live, RLS probed). Optional ct_case_id link
  to the D6 casing design for tangibles context.
- **Workstation** (WctWorkstation on WorkspaceShell, injected backend):
  Time Program (activity editor, geometry prefill, benchmark card,
  time-depth chart), AFE Cost (item editor, rollup, accrual chart,
  cost-per-metre calculator), Risk (dist editor, seeded MC run,
  histogram/S-curve/tornado), Report (AFE PDF via jsPDF named import,
  AFE Cost Control Manager + Economics Studio cross-links, immutable
  run history). White chartTheme + ChartLogo.

## Validation

- Independent oracle `oracle_wellcost.py` (exact fractions)
  self-asserts BEFORE writing `wellcost_cases.json`: the 3-section hand
  well (384 productive h, 12.5% NPT → exactly 18.000 days), the exact
  AFE (base 5,380,000 / total 5,918,000 USD), the 2,260,000 USD accrual
  checkpoint + endpoint identity, 770 USD/m cost per metre, the
  benchmark fixture, and the ANALYTIC mean/variance of the linear
  triangular MC fixture.
- Runner gates **A32 + A33 ACTIVE (33/33 total)**: A32 replays every
  closed form vs the golden; A33 pushes 20,000 seeded samples through
  the CANONICAL sampler + engine evaluators and must land within 5
  standard errors of the analytic mean and 5% of the analytic variance.
  **L21** (ADE ch.1 worked example) **ARMED** on the owner PDF.
- Suite jest: wctRun closed loop (10) + help gates (3); engines jest 8.
  Playwright `e2e/well-cost-time.spec.js` (5 specs) recomputes
  expectations through wctRun + vendored engines on `/dev/well-cost`,
  including an EXACT seeded Monte Carlo percentile match off the UI.

## Honesty markers (also in the /help guide)

- A planning estimate from user-entered rates, not a market quotation.
- Benchmarks are indicative order-of-magnitude prefill only and never
  enter the AFE unless applied.
- P10/P50/P90 use the AFE low/median/high convention, stated in-app
  (opposite of the volumes exceedance labeling).
- The probabilistic total excludes the contingency line (no double
  counting); invalid realizations are skipped and counted, not clamped.
- NPT is a uniform stretch; discrete NPT events belong in the risk
  model as uncertain durations.

## Held for the program launch (single-upload gate)

- Tile migration `20260829030000_seed_well_cost_time_tile.sql` (seed
  Active Drilling tile; no repoint needed — the WellCostIQ mock never
  had a live tile) — apply with the ONE prod upload that ships all 12
  D&C apps. Dry-run proven 2026-08-29.

## Out of scope (v1, documented in help)

- Currency conversion and inflation/escalation, learning-curve
  modeling across a campaign, discrete NPT event simulation, vendor
  quote ingestion, batch drilling optimization, correlation matrix UI
  between uncertainties (the sampler supports it; exposed later if
  asked), casing tangible auto-pricing from the D6 string design.

## Staging E2E checklist (owner)

1. Open Drilling -> Well Cost & Time Estimator on a wellbore with hole
   sections; create an estimate and confirm the starter program drills,
   trips and cases each section.
2. Change an ROP and watch the time-depth curve and total days move;
   set NPT to 0 and confirm the WARN banner and warning strip.
3. AFE Cost: change the rig dayrate, confirm the rollup and the accrual
   chart endpoint; check tangible vs intangible subtotals.
4. Risk: add an ROP and a dayrate uncertainty, run the Monte Carlo
   twice with the same seed and confirm identical percentiles; clear
   the seed and confirm they differ.
5. Report: export the AFE PDF; save a run; open the AFE Cost Control
   Manager and Economics Studio cross-links.
6. Save, duplicate, reload round-trip on the case.
