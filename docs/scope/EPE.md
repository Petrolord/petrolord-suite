# EPE — Enterprise Petroleum Economics

**Scope document maintained at:** `docs/scope/EPE.md`

**Last meaningful update:** 2026-05-12 (end of Day 10)

**Status:** Active — production-ready core, staging-only deployment

---

## 1. What this app is

EPE is a cash-flow modeling tool for Nigerian upstream oil and gas projects. It computes deterministic year-by-year cash flow, NPV, IRR, and payback under any of three fiscal regimes (JV, PSC, PIA 2021), with full Nigeria Tax Act 2025 framework awareness. It produces presentation-grade visualizations and supports sensitivity analysis via ±20% tornado sweeps.

**Target users:** Nigerian petroleum engineers, asset managers, fiscal analysts, investment evaluators preparing operator submissions, partner reviews, or government-facing economic forecasts.

**What it is not:** It is not a probabilistic / Monte Carlo simulator. It is not a partner-carry mechanics modeler. It is not a tax-advice tool — its outputs are best-interpretation forecasts that should be reviewed by tax counsel.

---

## 2. Architecture summary

### 2.1 Engine layer (Supabase Edge Functions)

| Function | Role | Bundle size |
|---|---|---|
| `epe-cash-flow-engine` | Single-run deterministic compute. I/O orchestration only. | ~125 kB |
| `epe-cash-flow-engine-batch` | Sensitivity (tornado) compute. Runs the engine N times in-process. | ~130 kB |

Both functions delegate math to a shared library:

| Shared module | Role |
|---|---|
| `supabase/functions/_shared/epe-engine.ts` | Pure compute. All MBAL-style math. No Supabase I/O. Used by both engine endpoints. |

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

## 4. What is NOT YET BUILT — known gaps

### 4.1 Untested code paths (engine code exists but no validation case)

These were implemented during the B2.5 sprint but never exercised against a synthetic test case:

- **Production allowance volume cap mid-year crossing** — the math is implemented for the case where production crosses 50M/100M/500M mid-year, splitting allowance proportionally. Never tested with a multi-year case that actually crosses the threshold.
- **CPR cessation forfeiture** — diagnostic field appears in final-year output if `cpr_carryforward > 0`. Never tested with a case that ends with unrecovered costs.

Risk level: low (math is straightforward). But a future Reservoir Balance-style diagnostic with a 15-year new-lease shallow-water case crossing 100M bbl cumulative would close this gap.

### 4.2 Schema present, engine math not implemented

- **Minimum 15% effective tax rate (NTA Section 57)** — `pia_apply_minimum_etr` and `pia_minimum_etr_pct` columns exist in `epe_run_configs`. Engine reads them but does not apply the floor. Rationale: ETR check requires evaluating total taxes vs total profit across all years plus turnover threshold checks (NGN-denominated, company-level) that don't fit the project-level engine cleanly. Implementation requires further design.

### 4.3 Backlog items not yet started

In rough priority order, with rough sizing estimates:

| Item | Description | Estimated effort |
|---|---|---|
| **B2.6** | Sliding-scale weighted-average royalty for boundary-straddling fields (multi-terrain split) | 6-8 hours |
| **B2.6** | Marginal field monthly volumetric split for royalty rate transitions (5k/10k bopd crossings) | 6-8 hours |
| **B4** | Monte Carlo simulation. Adds stochastic distributions over the deterministic tornado we already have. Requires probability distribution UI, multi-sample batch engine, fan-chart visualization. | 12-18 hours |
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

| Component | Validation | Status |
|---|---|---|
| PIA 2021 math (worked example) | Byte-for-byte against published example, 17 line items | ✓ Validated |
| NTA 2025 framework | Synthetic example mathematically derived from PIA example | ✓ Internally consistent, NOT NUPRC-validated |
| JV math | Conventional formulae | ⚠ No worked example used |
| PSC math | Conventional formulae | ⚠ No worked example used |
| Sensitivity (tornado) | Direction and magnitude sane; specific numbers not validated | ⚠ Sanity-checked, not validated |
| Production allowance cap math | Code present | ✗ Untested against synthetic case |
| CPR cessation forfeiture | Code present | ✗ Untested against synthetic case |
| Min ETR (NTA §57) | Schema only | ✗ Math not implemented |

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
