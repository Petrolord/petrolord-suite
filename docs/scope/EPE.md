# EPE — Petroleum Economics Studio

**Scope document maintained at:** `docs/scope/EPE.md`

**Last meaningful update:** 2026-08-16 (rename + v3.3/v3.4 capability round)

**Status:** Active — production-ready core, staging-only deployment

> **Naming (2026-08-16):** the app formerly branded "EPE / Enterprise
> Petroleum Economics" is now **Petroleum Economics Studio** (owner
> decision). The failed standalone petroleum-economics-studio app was
> retired the same day (code deleted, tile archived via migration
> 20260816120000, routes redirect here). The slug stays `epe-suite`
> (tile link + entitlement key) and routes stay under
> `/dashboard/apps/economics/epe/`; "EPE" remains the internal
> code/table prefix. Its orphan `econ_*` family was dropped 2026-08-17
> (owner-approved, migration 20260817100000);
> `src/utils/petroleumEconomicsEngine.js` + its test survive as this
> engine's cross-check oracle.

---

## 1. What this app is

Petroleum Economics Studio (internally EPE) is a cash-flow modeling tool for Nigerian upstream oil and gas projects. It computes deterministic year-by-year cash flow, NPV, IRR, and payback under any of three fiscal regimes (JV, PSC, PIA 2021), with full Nigeria Tax Act 2025 framework awareness. It produces presentation-grade visualizations and supports sensitivity analysis via ±20% tornado sweeps.

**Target users:** Nigerian petroleum engineers, asset managers, fiscal analysts, investment evaluators preparing operator submissions, partner reviews, or government-facing economic forecasts.

**What it is not:** It is not a partner-carry mechanics modeler. It is not a tax-advice tool — its outputs are best-interpretation forecasts that should be reviewed by tax counsel. (The "not a Monte Carlo simulator" caveat retired 2026-08-14: D2 of docs/scope/Economics-ROADMAP.md landed probabilistic runs via the `epe-monte-carlo` endpoint and the Risk tab.)

---

## 2. Architecture summary

### 2.1 Engine layer (Supabase Edge Functions)

| Function | Role | Bundle size |
|---|---|---|
| `epe-cash-flow-engine` | Single-run deterministic compute. I/O orchestration only. | ~125 kB |
| `epe-cash-flow-engine-batch` | Sensitivity (tornado) compute. Runs the engine N times in-process. | ~130 kB |
| `epe-monte-carlo` | Probabilistic runs (D2). Samples distributions, runs the engine per iteration, persists summaries to `epe_mc_runs`. | ~119 kB |

The functions delegate math to shared libraries:

| Shared module | Role |
|---|---|
| `supabase/functions/_shared/epe-engine.ts` | Pure compute. All MBAL-style math. No Supabase I/O. Used by all engine endpoints. |
| `supabase/functions/_shared/epe-mc.ts` | Monte Carlo layer (D2): seeded sampling (vendored 1:1 from the canonical `src/lib/monteCarlo.js`, jest anti-drift gated), NPV/IRR distributions, fan bands, tornado swings. No fiscal math of its own. |

**Architectural decision (load-bearing):** the shared library is the single source of truth for math. Both endpoints import `computeCashFlow()`. This prevents the single-run engine and the sensitivity engine from drifting apart mathematically. Any math change must go through this file.

### 2.2 Database schema

Tables in the `public` schema, all with RLS:

| Table | Purpose |
|---|---|
| `epe_cases` | Project containers (case-level metadata) |
| `epe_run_configs` | One row per run configuration — fiscal regime + commercial assumptions |
| `epe_runs` | Per-run records linking configs to results |
| `epe_results` | Result rows with `kpis` (JSONB) and `cash_flow_data` (JSONB) per run |
| `epe_production_volumes` | Uploaded production CSV data |
| `epe_capex` | Uploaded capex CSV data |
| `epe_opex` | Uploaded opex CSV data |
| `epe_sensitivity_runs` | One row per sensitivity invocation |
| `epe_sensitivity_results` | Per-sweep delta NPV records (variable × run) |
| `epe_mc_runs` | One row per Monte Carlo invocation (D2): distribution config + summarized results (percentiles, CDF, fan, tornado, seed). No raw samples. |

**RLS pattern:** users see only their own org's data. Service role (Edge Functions) bypasses RLS.

### 2.3 Frontend (React)

| Page | Path | Role |
|---|---|---|
| EpeCaseList | `/dashboard/apps/economics/epe/cases` | Case management dashboard |
| EpeCaseDetail | `/dashboard/apps/economics/epe/cases/:caseId` | Single case view with file uploads |
| EpeRunConsole | `/dashboard/apps/economics/epe/cases/:caseId/run` | Run configuration UI |
| EpeResultsViewer | `/dashboard/apps/economics/epe/runs/:runId` | 5-tab results display |
| EpeHelpGuide | `/dashboard/apps/economics/epe/help` | First-time user guide |
| EpeRunComparison | `/dashboard/apps/economics/epe/cases/:caseId/compare` | Side-by-side run comparison |

Sub-components live in `src/pages/apps/epe/` and `src/components/charts/` (shared chart primitives).

---

## 3. What is BUILT — current capabilities

### 3.1 Fiscal regimes

**Joint Venture (JV):**
- Working interest, royalty rate, tax rate configurable
- Standard Nigerian JV calculation (royalty → tax → net to interest holder)
- Validation status: matches conventional formulae, no published worked example used

**Production Sharing Contract (PSC):**
- Royalty, cost oil cap percentage, contractor profit share, tax rate configurable
- Cost recovery with carryforward
- Profit oil split with tax on contractor share
- Validation status: matches conventional formulae, no published worked example used

**PIA 2021:**
- Full hydrocarbon tax (HCT), companies income tax (CIT), tertiary education tax (TET) cascade
- Hydrocarbon development trust (HCDT) at 3% prior-year OPEX
- NDDC levy (fixed or % of opex)
- Production allowance with terrain-aware caps (per-bbl with $/bbl ceiling)
- Cost price ratio (CPR) cap with carryforward
- Royalties: production royalty (terrain-derived rate) + price royalty (price-tiered)
- Capital allowance over configurable recovery years
- **Validation status: ✓ byte-for-byte against PIA 2021 worked example** (all 17 line items within ±$10,000 tolerance; max deviation $3,162 from price-royalty rate rounding)

**NTA 2025 framework (post-Jan 2026):**
- Auto-detection: when `base_year >= 2026`, NTA framework applies
- Per-config override: `force_pia` / `force_nta` / `auto`
- TET 2.5% replaced by Development Levy 4% on assessable profit
- Deep offshore HCT user-configurable interpretation (conservative 0% / aggressive 30% / custom)
- Validation status: ✓ synthetic worked example (mathematical extension of PIA validation case). No NUPRC-published NTA worked example yet exists; ours is best-interpretation.

### 3.2 Engine features

- Inflation-aware: real vs nominal NPV basis selectable
- Separate escalators for oil price, gas price, condensate price, OPEX, CAPEX
- Production allowance volume cap tracking (PIA Sixth Schedule: 50M onshore / 100M shallow / 500M deep offshore)
- Mid-year cap split (allowance applies pro-rata when production crosses the cap mid-year)
- CPR cessation forfeiture diagnostic (final-year unrecovered costs flagged in output)
- Brownfield support (configurable starting cumulative production)
- Per-config minimum effective tax rate floor (NTA Section 57) — schema present, not yet implemented in engine math
- CSV ingestion (v3.3, 2026-08-16): headers matched case-insensitively;
  production accepts per-well `*_oil_bbl`-style columns (preferred), bare
  `oil_bbl`/`gas_mscf`/`condensate_bbl`/`water_bbl` aliases, or `total_*`
  rollups; capex accepts `amount_usd`/`cost_usd`/`capex_usd`/`total_capex_usd`/
  `value_usd` plus a `*_usd` fallback; opex prefers `total_opex_usd` with
  `opex_usd`/`cost_usd`/`amount_usd` aliases and a `*_usd` parts fallback.
  computeCashFlow throws an ingestion validation error (naming the headers it
  saw) when uploads have no recognizable columns, no usable dates, or a price
  is unset for a stream with volumes — a run can no longer "succeed" at $0
  because a header didn't match. Run Console requires oil price > 0 and
  surfaces the engine's error body on 500s.
- Field life (v3.4, 2026-08-16, both config-gated/default-off): economic
  limit test (`apply_economic_limit` trims trailing years whose escalated
  revenue no longer covers inflated opex; `economic_limit_year` KPI) and
  abandonment cost (`abandonment_cost_usd`/`abandonment_year`: lump-sum
  post-tax outflow, deliberately NOT tax-deducted/depreciated/cost-recovered —
  regime-specific decom-fund deductibility is literature-gated future work).
- Decision KPIs (v3.4): total volumes + BOE (6:1 gas), unit technical cost
  ($/boe), opex/boe, government take % (pre-take value minus contractor NCF
  over pre-take value), PV(capex) + DPI, numeric payback + discounted
  payback, and `breakeven_oil_price_usd_bbl` (bisection to NPV=0 rerunning
  the full engine per trial price; computed in the single-run edge fn).
- Workflow (v3.4): saved run configs load back into the Run Console
  ("Start from saved scenario" + `?fromConfig` deep link / "Re-run with
  edits"); results export as CSV, XLSX (KPIs/Cash Flow/Assumptions sheets)
  and a branded PDF report; all five deterministic charts sit on the shared
  ChartFrame (watermark band + per-chart PNG download); per-slot template
  CSV downloads and a one-click example case ("Ilara Field") fix the cold
  start.

### 3.3 Visualization (EpeResultsViewer)

Five-tab interface:

1. **Annual Cash Flow** — Recharts bar chart, net cash flow series default with revenue/CAPEX/OPEX toggleable
2. **Cash Flow Profile** — Stacked area chart with regime-aware breakdown (PIA shows 8 outflow components: CAPEX, OPEX, royalty, HCDT, NDDC, HCT, CIT, TET/DevLevy; JV/PSC shows 4)
3. **Waterfall** — Single-year cascade from gross revenue to ATCF using floating-bar technique; year selector dropdown
4. **Sensitivity (Tornado)** — Horizontal bar chart of NPV deltas from ±20% sweeps, sorted by impact magnitude
5. **Year-by-Year Detail** — Horizontal-scroll table with sticky metric column, regime-aware rows

All charts use shared theme tokens (`src/utils/chartTheme.js`), Petrolord watermark (`src/components/charts/ChartLogo.jsx`), and white-background presentation style.

Framework badge appears beneath case name for PIA runs ("Computed under PIA 2021" / "Computed under NTA 2025").

### 3.4 Sensitivity analysis

Tornado sweeps ±20% on:
- **All regimes:** Oil Price, Gas Price, Discount Rate, Inflation, CAPEX (CSV row scaling), OPEX (CSV row scaling)
- **JV-specific:** Working Interest, JV Royalty, JV Tax Rate
- **PSC-specific:** PSC Royalty, Cost Oil Cap, Contractor Profit Share, PSC Tax Rate
- **PIA-specific:** CIT Rate, TET Rate, CPR Cap, Production Allowance per bbl

Typical sweep set: 16-20 variables per regime, completes in ~300ms server-side.

### 3.5 First-time user guide

EpeHelpGuide component covers 9 sections: overview, quick start, case setup, data upload, fiscal regime, run configuration, reading results, sensitivity analysis, pitfalls & FAQ.

---

## 3b. Engine v3.5 — Wave A correctness round (2026-08-21)

Per `docs/scope/EPE-Industry-Audit.md` Band 1, all validated in
`epe-engine.test.ts` with the PIA worked example byte-identical:

- **Tax-loss carryforward** (default ON): JV taxable income and PIA HCT/CIT
  chargeable profits each carry a loss pool; a negative year banks its loss
  and offsets the next positive year. Kill switch
  `apply_loss_carryforward=false` reproduces pre-3.5 clamp-at-zero runs.
  PSC needs no pool (its tax base is structurally non-negative; cost losses
  ride cost recovery). TET/Dev-Levy assessable bases deliberately get no
  loss relief. KPI `tax_losses_unused_at_cessation` mirrors CPR forfeiture.
- **HCT base = crude + condensate only** (PIA charges HCT on liquids; gas
  profits are CIT-only). Directly attributable oil royalties deducted in
  full; shared costs (claimed opex, HCDT, capital allowance) apportioned by
  liquids revenue share. Escape hatch `pia_hct_include_gas_revenue=true`.
  Gas-weighted PIA numbers changed (they were over-taxed); oil-only cases
  identical. Revenue-share apportionment is the practical convention; a
  cross-check against the PIA text for a published gas-weighted example
  remains a literature-gated to-do.
- **IRR solver**: Newton fast path unchanged; unconverged cases fall back to
  bisection and return null when no sign change brackets a root.
- **Ambiguous cost aliases fail loudly**: a row populating two different
  cost columns (e.g. `amount_usd` and `cost_usd` with different values)
  throws instead of silently taking the first; identical duplicates pass.
- **Economic limit test** nets the regime's royalty out of the tail check
  (net operating income convention).
- **Provenance**: `kpis.engine_version` stamps every result; `epe_runs`
  carries `status`/`error_message` (see §4.2b closure).
- **Ingestion**: uploads replace the slot's files by default (opt-out kept
  for complementary files); multi-file slots warn about double-counting.
- **Risk tab**: seed round-trip (set/reuse) makes MC runs reproducible.

## 3c. Engine v3.6 — Wave B equity + price realism (2026-08-21)

Per `docs/scope/EPE-Industry-Audit.md` Band 2 (2.1–2.4), defaults byte-identical:

- **Working interest on PSC/PIA** (`psc_working_interest_pct` /
  `pia_working_interest_pct`, default 100): fiscal math runs at 100% field
  level (royalty rate tiers, price-royalty thresholds, allowance volume caps
  and CPR caps are field-level), then monetary lines + entitlement volumes
  scale to the WI share. Oracle: deep-offshore tier case proves the field
  rate (7.5% at 60k bopd) survives a 50% WI where naive pre-scaling would
  drop to the 5% tier. Tornado gains capped WI sweeps for all regimes.
- **Per-year price decks** (`price_deck` jsonb: `[{year, oil, gas,
  condensate}]`): step-hold between entries, first value before, last value
  escalated beyond; per-stream differentials add after resolution; resolved
  prices honor `*_price_scale` hooks so tornado/MC stay meaningful under a
  deck (batch sets the scale; MC converts sampled absolute prices to a
  scale). Breakeven oil price is null under an oil deck.
- **Mid-year discounting** (`discounting_convention`), and **valuation
  date** (`valuation_year` + `treat_prior_as_sunk`: pre-valuation years stay
  modeled for fiscal state, excluded from value metrics, reported as
  `kpis.sunk_net_cash_flow`).
- Run Console: WI fields on PSC/PIA panels, differential inputs, deck
  editor table, convention select, valuation-year + sunk controls; all
  round-trip through saved scenarios.

## 3d. Engine v3.7 — Wave C risk workbench (2026-08-21)

Per `docs/scope/EPE-Industry-Audit.md` Band 3 (3.1–3.5, 3.7–3.9; 3.6
reserves scenarios stays in Wave F):

- **Schedule delay** (`schedule_shift_years`): production and opex shift
  together; capex and the allowances it seeds stay on the committed
  schedule (first-oil-delay convention; hand-derived oracle).
- **Tornado**: new Production bar (scales the engine-recognized volume
  columns) and one-sided First Oil Delay (+1 yr) bar; user-set ranges via
  the batch request's `sweep_options` (global `factor_low`/`factor_high`
  plus per-variable `overrides`), surfaced in the results viewer as Low/High
  percentage controls.
- **Monte Carlo**: payback distribution (+`neverShare`), NPV standard error,
  20-point running-mean convergence trace; Risk tab exposes all four
  sampler distribution types (triangular/uniform/normal/lognormal with
  truncation), an editable correlation list (arbitrary enabled-variable
  pairs), IRR and payback stat cards, and a CSV results export (summary +
  CDF + fan table). Old saved MC runs without the new fields render
  guarded.
- **Decision Studio**: overlaid NPV S-curves from each compared run's
  stored `npv.cdf`.

## 3e. Engine v3.8 — Wave D submission-grade reporting (2026-08-21)

Per `docs/scope/EPE-Industry-Audit.md` Band 4 (4.1, 4.4–4.9):

- **Engine**: `kpis.npv_profile` (NPV at 0/5/8/10/12/15/20% plus the applied
  rate, same basis/convention; passes through the headline NPV) and
  `kpis.government_take_pct_discounted` (PV terms, closed-form oracle).
- **Config labels**: `epeConfigLabels.js` maps every run-config field to a
  report-grade label/unit/formatter; single source for the PDF assumptions
  block, the XLSX Assumptions sheet, and comparison config rows.
- **PDF**: rebuilt as a submission one-pager (assumptions + full KPI panel
  incl. discounted take and engine version) + regime-aware full annual
  table (PIA royalty/HCDT/NDDC/allowance/HCT/CIT/levies now included) +
  chart capture.
- **Waterfall**: "All years" full-life government-take exhibit.
- **NPV-vs-rate chart** on the overview; discounted-take KPI beside the
  nominal one.
- **Run History**: per-run KPI strip (NPV/IRR/payback/regime/engine
  version) joined from `epe_results`, delete-with-confirm for any run.
- **Comparison**: capped at 6 runs, deltas on all numeric rows, cumulative
  NCF overlay chart, labeled config rows, CSV download.

## 3f. Wave E — enterprise workflow (2026-08-21)

Per `docs/scope/EPE-Industry-Audit.md` Band 4 (4.2, 4.3, 4.11, 4.13 + run
locking). Migration `20260821230000` (applied live):

- **Org sharing v1 (read-only)**, Seismolord W4.1 pattern: sharing a case
  makes the WHOLE family (uploads, configs, runs, results, MC, sensitivity)
  readable by the owner's organization; all writes stay owner-scoped.
  Case list splits My Cases / Shared with your organization; shared cases
  open read-only (no uploads, runs, or deletes); Run Console blocks running
  on shared cases and points at Clone.
- **Run lock/approve**: `epe_runs.locked` (RLS-enforced: locked runs cannot
  be deleted until unlocked) + `approved_by/approved_at` badges.
- **Corporate assumption library** (`epe_assumption_sets`): save the
  pricing + economics subset of a run config (prices, differentials, deck,
  escalators, discounting) as a named set, personal or org-shared; apply it
  to any case from the Run Console.
- **Case management**: search, soft archive (`archived_at`), clone-as-
  what-if (case + data files copied into the cloner's workspace, unshared),
  last-run KPI badge on case cards, file-delete confirm.
- **Forecast Scenario Hub import**: pick a saved FSH scenario, EPE rebuilds
  its annual profile with FSH's own Arps math and files it as a generated
  production dataset (replace-on-upload semantics honored).
- Deferred from the wave (still open): in-app data editing (4.10).

---

## 4. What is NOT YET BUILT — known gaps

### 4.1 Untested code paths (engine code exists but no validation case)

These were implemented during the B2.5 sprint but never exercised against a synthetic test case:

- **Production allowance volume cap mid-year crossing** — the math is implemented for the case where production crosses 50M/100M/500M mid-year, splitting allowance proportionally. Never tested with a multi-year case that actually crosses the threshold.
- **CPR cessation forfeiture** — diagnostic field appears in final-year output if `cpr_carryforward > 0`. Never tested with a case that ends with unrecovered costs.

Risk level: low (math is straightforward). But a future Reservoir Balance-style diagnostic with a 15-year new-lease shallow-water case crossing 100M bbl cumulative would close this gap.

### 4.2 Schema present, engine math not implemented

- **Minimum 15% effective tax rate (NTA Section 57)** — `pia_apply_minimum_etr` and `pia_minimum_etr_pct` columns exist in `epe_run_configs`. Engine does not apply the floor. Rationale: ETR check requires evaluating total taxes vs total profit across all years plus turnover threshold checks (NGN-denominated, company-level) that don't fit the project-level engine cleanly. Implementation requires further design. **2026-08-16: the Run Console controls were removed** (the checkbox shipped before the math and changed nothing — honesty rule); a one-line note remains in the PIA panel. Columns stay for forward compatibility.

### 4.2b Known structural debt (2026-08-16 audit)

- ~~No repo DDL for 9 of the 10 `epe_*` tables~~ — **CLOSED 2026-08-17**:
  `20260814185000_backfill_epe_tables_ddl.sql` captures the live shape
  (filename back-dated so it sorts before epe_mc_runs' FKs on fresh
  rebuilds); fresh-rebuild proven in a rollback-wrapped transaction with
  byte-count parity against live. The retired PES `econ_*` family (17
  tables + view + `integration_snapshots`) was dropped the same day
  (`20260817100000`).
- ~~`epe_runs` has no status/error columns~~ — **CLOSED 2026-08-21 (Wave A)**:
  `20260821170000_epe_runs_status.sql` added `status`/`error_message`; the
  engine stamps complete/failed and failed runs are kept and surfaced in
  Run History instead of being deleted.
- ~~Working interest applies only to JV~~ — **CLOSED 2026-08-21 (Wave B)**:
  WI on PSC/PIA with field-level fiscal math (§3c).
- ~~Flat price + escalator only~~ — **PARTLY CLOSED 2026-08-21 (Wave B)**:
  per-year decks + differentials shipped (§3c); contracted gas price
  structures (take-or-pay etc.) remain future work.
- **No incremental (with vs without) economics**; comparison is KPI-level
  (though Wave D added deltas and a cumulative NCF overlay).
- ~~RLS is per-user, no sharing~~ — **CLOSED 2026-08-21 (Wave E)**: org
  sharing v1 read-only across the case family (§3f).

### 4.3 Backlog items not yet started

In rough priority order, with rough sizing estimates:

| Item | Description | Estimated effort |
|---|---|---|
| **B2.6** | Sliding-scale weighted-average royalty for boundary-straddling fields (multi-terrain split) | 6-8 hours |
| **B2.6** | Marginal field monthly volumetric split for royalty rate transitions (5k/10k bopd crossings) | 6-8 hours |
| ~~B4~~ | ~~Monte Carlo simulation~~ — **LANDED 2026-08-14** (D2, Economics-ROADMAP.md): `epe-monte-carlo` fn + `_shared/epe-mc.ts` + Risk tab (distribution UI, NPV CDF, P(NPV>0), fan chart, decile tornado); validated in harness Case 7 + 13 jest tests | done |
| **B5** | Carry/promote partner mechanics. Models pre-payout and post-payout splits with carry arrangements. | 8-12 hours |
| **B5** | Multi-partner working-interest tracking with separate cash flow per partner. | 4-6 hours |
| **B6** | Real options modeling (decision trees for expand/abandon/extend choices under uncertainty). | 15-25 hours (deferred indefinitely — large scope, unclear demand) |

### 4.4 Validation gaps

- No NUPRC-published NTA-era worked example exists; our NTA validation is synthetic (mathematically derived from the PIA example). Will need to re-verify when NUPRC issues NTA-era guidance.
- JV and PSC math has no published worked example validation. Conventional and likely correct but not byte-verified.
- The PIA Amendment Bill 2025 (separate from NTA 2025) is still pending in legislature. Not implemented; will need to be addressed if enacted.

### 4.5 Production deployment

- All work from Days 8-10 is on staging only (`plstudio-suite-dev` container, port 5173)
- petrolord.com production site still runs an older zipped build
- Production deploy decision pending — affects users who would access the tool externally

---

## 5. Validation status snapshot

Updated 2026-08-14 (D1, docs/scope/Economics-ROADMAP.md). The engine now
has a standing oracle harness (`tools/validation/epe-validation.ts`, run
with `npx tsx`; 60 checks) plus a CI gate
(`supabase/functions/_shared/__tests__/epe-engine.test.ts`) that re-asserts
the same numbers under jest. The worked-example inputs are frozen locally
in `tools/validation/fixtures/epe-pia-worked-example.ts` so the regression
contract no longer depends on database access.

| Component | Validation | Status |
|---|---|---|
| PIA 2021 math (worked example) | Byte-for-byte against published example, 17 line items; inputs frozen locally, NPV + every line item locked to ±$0.01 in harness and CI | ✓ Validated + regression-gated |
| NTA 2025 framework | Synthetic example mathematically derived from PIA example; harness additionally proves force_nta differs from force_pia only by TET→Dev Levy on the same assessable base | ✓ Internally consistent, NOT NUPRC-validated |
| JV math | Hand-derived closed-form two-year case (royalty, tax, NCF, NPV, IRR 200%, payback) asserted in harness + CI | ✓ Analytically validated |
| PSC math | Hand-derived two-year carryforward case (cost-oil cap binding, pool consumed in year 2) asserted in harness + CI | ✓ Analytically validated |
| Sensitivity (tornado) | Direction and magnitude sane; specific numbers not validated | ⚠ Sanity-checked, not validated |
| Production allowance cap math | Mid-year crossing case (99→101 MMbbl over the shallow-water cap): eligible-bbl split, allowance, and exhaustion asserted exactly | ✓ Validated (closes §4.1) |
| CPR cessation forfeiture | Single-year case with 8M unrecovered pool: final-row flag + KPI asserted | ✓ Validated (closes §4.1) |
| Min ETR (NTA §57) | Schema only | ✗ Math not implemented |
| Monte Carlo layer (D2) | Harness Case 7 (degenerate = deterministic, seeded reproducibility, spread brackets base) + 13 jest tests incl. bit-identical anti-drift vs canonical `src/lib/monteCarlo.js` | ✓ Validated as a pure wrapper |

Literature byte-verification of JV/PSC against published worked examples
(Mian; SPE) remains open pending owner-provided references; the analytic
cases above are independently hand-derived, not literature-traced.

---

## 6. Architectural decisions (load-bearing)

These choices shape the codebase. A future change that violates one of these should be made deliberately, not accidentally.

1. **Shared engine library pattern.** `_shared/epe-engine.ts` is the single math source. Both single-run and batch endpoints import `computeCashFlow()`. Math changes propagate to both automatically.

2. **Framework detection by date trigger with override.** `determineFiscalFramework(cfg)` checks `pia_under_nta_2025_override` (auto/force_pia/force_nta). Default 'auto' uses `base_year >= 2026 ? 'nta_2025' : 'pia_only'`. Both pre-NTA and post-NTA must be supported indefinitely (operators reviewing historical cases need pre-NTA accuracy).

3. **Either-or tax field structure.** Under PIA-only, `tet_tax > 0` and `dev_levy_tax = 0`. Under NTA, the reverse. UI rendering shows whichever is non-zero. This keeps the data model clean while supporting both frameworks.

4. **Real vs nominal as user choice.** Default is `real` (industry convention). Engine computes both. KPI display matches the user's chosen basis. Don't quietly switch defaults.

5. **CSV row scaling for CAPEX/OPEX sensitivity.** Tornado scales CSV-loaded amounts (not config fields) because CAPEX/OPEX live in uploaded files, not config. This is a v1 simplification; future enhancement could let users scale per-year independently.

6. **Five-tab results structure with profile as default landing.** Cash Flow Profile is the "what is this project?" view. Bar chart is "drill into one metric." Detail is "raw numbers for QC." Order matters for executive presentation.

7. **Pre-NTA regression must be byte-identical.** Any engine change must preserve the PIA worked example output to within $10,000 on all 17 line items. This is enforced by the validation harness.

8. **Help guide as first-class artifact.** New users hit this before doing real work. Content quality matters. Living document, expected to be revised based on user feedback.

---

## 7. Engineering invariants (don't break these)

- PIA-only mode (`base_year < 2026`, override = 'auto') must produce `total_dev_levy = 0` and `fiscal_framework = 'pia_only'` in KPIs
- NTA mode must produce `total_tet = 0` and `fiscal_framework = 'nta_2025'` in KPIs
- The PIA worked example NPV must remain at $135,185,570.34 (±$0.01)
- Sensitivity results must include `ordinal` field for stable sort order in chart display
- All chart components must include `<ChartLogo />` overlay and use `chartTheme.js` tokens
- Engine must never persist results without `fiscal_framework` field in KPIs

---

## 8. When to revisit this document

- After every B-numbered work item completes
- After any production deployment
- When a NUPRC NTA-era worked example is published
- When the PIA Amendment Bill 2025 progresses to law
- When user feedback identifies a real-world fiscal scenario we don't handle

---

## 9. Quick orientation for future-us

If you (or a future Claude session) need to extend EPE, start here:

1. Read this document end-to-end (~10 minutes)
2. Pull up the PIA validation case (`run_config_id: 53828290-e35b-47b1-9779-5a71434d55e4`) and verify the engine still produces NPV = $135,185,570.34 via curl. If yes, the engine is healthy.
3. Open `_shared/epe-engine.ts` if you're touching math, `EpeResultsViewer.jsx` if you're touching UI, `EpeRunConsole.jsx` if you're touching config.
4. For new features that need persistence: add a column to `epe_run_configs` with sensible default, update the engine to read it, update the run console to set it, validate.
5. Test against the PIA worked example BEFORE testing against your new case. The regression is the safety net.

---

_Document maintained by the active development team. Last full review: 2026-05-13._
