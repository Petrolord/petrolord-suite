# Petroleum Economics Studio — Industry-Standard Gap Audit

**Date:** 2026-08-21
**Method:** three parallel expert-lens code audits (fiscal/cash-flow engine vs
Merak Peep / ARIES / ValNav practice; probabilistic & decision workflow vs
SPEE / @RISK practice; reporting & enterprise workflow vs operator-submission
practice). All findings verified against code, not doc claims. Companion to
`docs/scope/EPE.md` (feature census) and `docs/scope/Economics-ROADMAP.md`
(the completed D0–D5 program).
**Status:** Wave A APPROVED by owner and IMPLEMENTED 2026-08-21 (engine
v3.5, see EPE.md §3b): findings 1.1–1.8 closed (1.3 shipped with
revenue-share cost apportionment plus the `pia_hct_include_gas_revenue`
escape hatch; a published gas-weighted worked example remains a
literature-gated cross-check). **Wave B (2.1–2.4) APPROVED and IMPLEMENTED
2026-08-21** (engine v3.6, EPE.md §3c): WI on PSC/PIA, per-year price decks
+ differentials with deck-aware tornado/MC sweeps, mid-year discounting,
valuation date + sunk handling. **Wave C APPROVED and IMPLEMENTED
2026-08-21** (engine v3.7, EPE.md §3d): production + first-oil-delay
tornado bars, custom sweep ranges, all four MC distribution types,
correlation editor, IRR/payback distributions, convergence SE, MC CSV
export, Decision Studio S-curve overlay. **Wave D APPROVED and
IMPLEMENTED 2026-08-21** (engine v3.8, EPE.md §3e): one-pager PDF with
assumptions + regime-aware full table, full-life waterfall, NPV-vs-rate
profile, discounted take, run-history KPI strip, comparison overlays +
deltas + CSV. **Wave E APPROVED and IMPLEMENTED 2026-08-21** (EPE.md
§3f): org sharing v1 read-only across the case family, run lock/approve,
corporate assumption library, case search/archive/clone + KPI badges,
Forecast Scenario Hub import. Remaining: Band 2 items 2.5–2.11, 3.6
reserves scenarios, 4.10 in-app data editing (deferred from Wave E), and
Wave F fiscal depth — awaiting owner selection.

## Headline

The validated fiscal core (PIA cascade, royalty tiers, allowance caps, CPR,
67-case oracle) is genuinely strong. The gaps cluster in four bands:

1. **Numbers at risk** — a handful of engine/data behaviors that can produce
   *wrong* results today (not missing features).
2. **Commercial fidelity** — equity, price decks, and time-basis conventions
   that every commercial engine has and EPE lacks.
3. **Risk workbench maturity** — the MC/tornado layer exposes a fraction of
   what the engine already supports.
4. **Submission-grade reporting & enterprise workflow** — outputs and
   collaboration below the bar for partner/government-facing use.

## Band 1 — Numbers at risk (fix before anything else)

| # | Finding | Evidence | Effort |
|---|---|---|---|
| 1.1 | **Re-uploaded datasets double-count.** Engine flatMaps *every* uploaded file per slot (`epe-cash-flow-engine/index.ts:48-59`); a revised production CSV inflates volumes/NPV silently. | NEW, HIGH | S |
| 1.2 | **No tax-loss carryforward in any regime.** Every tax line clamps at zero and discards the loss (JV :329, PSC :344, PIA HCT :548, CIT :555). Greenfield (early-loss) projects overstate tax, understate NPV. Oracle never exercises a loss year. | NEW, HIGH | M (oracle-gated) |
| 1.3 | **PIA HCT charged on gas revenue.** HCT assessable profit uses total `grossRev` incl. gas (:525) though PIA applies HCT to crude/condensate only (gas is CIT-only). Materially over-taxes gas-weighted assets. Verify against PIA text + worked example FIRST; fix behind regression. | NEW, HIGH (literature-gated) | M |
| 1.4 | **IRR solver returns unconverged values.** Single-start Newton falls through to `return r` (:623-643); no bisection fallback, no convergence flag, no multiple-IRR guard. | NEW, MED | S |
| 1.5 | **Alias double-column undercount.** `aggregateAnnualUsd` (:296-315) takes first non-zero preferred column per row instead of summing; a CSV populating two alias columns undercounts. | NEW, MED | S |
| 1.6 | **Economic limit test ignores royalty** (:800-810 revenue minus opex only) — overstates economic life. | NEW, LOW-MED | S |
| 1.7 | **MC runs not reproducible from the UI.** Engine supports `mcConfig.seed` (`epe-mc.ts:320`), panel displays the seed but never sends one (`EpeMonteCarloPanel.jsx:136`). Fails the SPEE/SEC audit-trail bar. | NEW, HIGH (audit trail) | S |
| 1.8 | **No run provenance; failed runs deleted.** Results carry no engine version; `epe_runs` has no status column so the console deletes the row on failure (RECORDED). Stamp `engine_version` (S); add status + locked/approved (M). | NEW/RECORDED | S+M |

## Band 2 — Commercial fidelity

| # | Finding | Status | Effort |
|---|---|---|---|
| 2.1 | **No working interest on PSC/PIA** — equity share impossible on the regimes that matter most post-PIA (`applyPSC` :334, `applyPIA` :490 have no WI concept; JV has it :321). RECORDED §4.2b. Post-fiscal contractor-share scaling first; partner tables later. | RECORDED, CRITICAL | M |
| 2.2 | **Flat price + single escalator only** — no per-year decks, crude differentials, or contracted gas prices (:768-772). Deck vector overrides flat+escalator; tornado/MC scale the deck. | RECORDED, HIGH | M |
| 2.3 | **End-year annual discounting only** — no mid-year convention (industry default; ~5% NPV understatement at 10%). Config flag, default preserves regression. | NEW, MED-HIGH | S |
| 2.4 | **No valuation/effective date or sunk-cost cutoff** — history before `base_year` compounds forward into NPV (:614-621). `valuation_year` + `treat_prior_as_sunk`. | NEW, MED | S-M |
| 2.5 | **Depreciation: straight-line only; 10-year hardcoded for JV/PSC** (:833-846). Per-regime allowance schedules with statutory presets. | NEW (partly), MED | M |
| 2.6 | **PSC is generic, not Nigerian** — flat profit split, no cum-production/R-factor/IRR tranches, no ITC/ITA, no DMO (:334-347). Tranche tables, worked-example-gated. | PART-RECORDED, MED | M-L |
| 2.7 | **No incremental (with/without) economics** — the defining infill/workover workflow. Paired-run diff mode. | RECORDED, MED | M |
| 2.8 | **Minimum ETR (NTA §57)** unimplemented (columns exist; controls honestly removed). | RECORDED, MED | M-L |
| 2.9 | **USD-only; no FX/NGN reporting** (min-ETR thresholds are NGN-denominated). | NEW, LOW-MED | M |
| 2.10 | **Abandonment lump-sum only; no decom fund accrual/tax relief** (deliberate, literature-gated). | RECORDED, LOW | M |
| 2.11 | **Carried interests / farm-in-out unmodelable** (B5 recorded). | RECORDED, LOW | M |

## Band 3 — Risk workbench

| # | Finding | Status | Effort |
|---|---|---|---|
| 3.1 | **Tornado omits production volume and schedule delay** — reserves is usually the longest industry bar; batch sweep list (batch index.ts:62-99) has neither; MC already has `production_scale`. Add `__production_multiplier` (S) + engine start-shift field (M). | NEW, HIGH | S+M |
| 3.2 | **Fixed ±20% sweeps; no per-variable ranges, spider, or two-way** (batch :42-47). | PART-RECORDED, MED-HIGH | S-M |
| 3.3 | **Triangular-only in UI** though engine supports normal/lognormal/uniform/triangular with truncation (`epe-mc.ts:65,144-164` vs `EpeMonteCarloPanel.jsx:123`). | NEW, MED-HIGH | S-M |
| 3.4 | **Correlation: one hard-coded pair (oil-gas rho 0.7)**; engine accepts arbitrary pairs (:166-188), UI exposes none. | NEW, HIGH | S-M |
| 3.5 | **IRR distribution computed but never displayed** (`epe-mc.ts:396` vs panel); payback/breakeven distributions not collected. | NEW, MED | S (+M) |
| 3.6 | **No 1P/2P/3P reserves scenarios or SEC/PRMS price runs** — one production dataset per case, no scenario tagging. | NEW, MED | M-L |
| 3.7 | **No convergence diagnostics** (SE on mean/P50, trace); plain MC only. | NEW, LOW | S |
| 3.8 | **Decision Studio compares percentile tables, not overlaid S-curves**; `npv.cdf` arrays already persisted per run. | PART-RECORDED, MED | S |
| 3.9 | **No raw-iteration export for auditors** (summaries only; acceptable interim once 1.7 lands). | RECORDED, LOW-MED | S-M |

## Band 4 — Reporting & enterprise

| # | Finding | Status | Effort |
|---|---|---|---|
| 4.1 | **No economics one-pager; PDF far below submission grade** — two tables, 7 columns, no assumptions block, no charts, omits royalty/PIA lines (`EpeResultsViewer.jsx:972-1044`). | NEW, HIGH | M |
| 4.2 | **Per-user silo; no org sharing** — case list and comparison filter `user_id`; a reviewer cannot open an analyst's case. Seismolord org-sharing pattern exists to copy. | RECORDED, HIGH | M-L |
| 4.3 | **No corporate assumption library / org price decks** — scenarios are per-case rows only. | NEW, MED | M-L |
| 4.4 | **Run history shows name + timestamp only** — no KPI columns, rename, delete, notes (`EpeCaseDetail.jsx:185-198`). | NEW, MED | S-M |
| 4.5 | **No NPV-vs-discount-rate profile** (single-rate NPV; industry standard exhibit incl. NPV@5/10/15). | NEW, MED | S |
| 4.6 | **Comparison is table-only** — no cumulative-NCF overlay, no delta waterfall, deltas only on currency rows, no export, no MC join, no run cap (`EpeRunComparison.jsx:161-227`). | NEW, MED | M |
| 4.7 | **Waterfall is single-year only** — no full-life government-take exhibit (data exists per row). | NEW, MED-LOW | S |
| 4.8 | **Government take nominal-only** — no discounted take or per-instrument profile (:1077-1079). | NEW, LOW | S |
| 4.9 | **XLSX Assumptions sheet dumps raw config keys** (`configRowsForExport` :899-905); label map exists for KPIs. | NEW, LOW-MED | S |
| 4.10 | **No in-app data editing** — one-cell CAPEX tweak requires offline CSV edit + re-upload (and hits 1.1). | NEW, LOW-MED | M-L |
| 4.11 | **Case management basics** — no clone-as-what-if, archive, search, last-run KPI badge; file delete unconfirmed. | NEW, LOW | S-M |
| 4.12 | **MC exports are chart PNGs only** — no percentile/CDF table download. | NEW, LOW | S |
| 4.13 | **No production import from DCA Studio / Forecast Scenario Hub** — help guide punts to DCA but nothing carries the forecast across. | NEW, MED | S-M |

Healthy and confirmed: chart standard compliance (white theme + watermark
throughout), saved-scenario reload + `?fromConfig`, shared column spec across
CSV/XLSX/engine, templates + Ilara example, current help guide with honest
min-ETR flag, real D2–D5 decision-chain wiring through `epe_mc_runs`.

## Proposed program (owner to approve/trim)

Validation-first rule applies throughout: every engine-math change lands with
oracle cases (extend the 67-case suite), and 1.3 + 2.6 + 2.10 are
literature-gated like the Seismolord/SCAL precedents.

- **Wave A — Correctness & audit trail** (all of Band 1). Small, high-trust:
  replace-on-upload + multi-file warning, loss carryforward, HCT gas-base
  verification (report finding to owner before changing math), IRR solver
  hardening, alias-sum fix, ELT royalty, MC seed round-trip, engine-version
  stamp + run status column. Mostly S efforts; the two M's are oracle work.
- **Wave B — Equity & price realism**: WI on PSC/PIA, per-year price decks +
  differentials + gas price, mid-year discounting option, valuation date /
  sunk-cost handling. This is what makes single-asset runs bankable.
- **Wave C — Risk workbench**: production + schedule tornado bars, per-variable
  ranges, distribution types, correlation editing, IRR/payback distributions,
  convergence SE, MC table export, CDF overlay in Decision Studio.
- **Wave D — Submission-grade reporting**: economics one-pager PDF (assumptions
  block, regime-aware full columns, embedded charts), full-life gov-take
  waterfall, NPV-vs-rate profile, discounted take, run-history KPIs,
  comparison overlays/deltas/export, XLSX labels.
- **Wave E — Enterprise workflow**: org sharing (Seismolord pattern),
  assumption/price-deck library, case clone/archive/search, run lock/approve,
  DCA/Forecast Hub import, in-app data editing.
- **Wave F — Fiscal depth (literature-gated)**: Nigerian PSC tranches +
  ITC/ITA + DMO, statutory depreciation presets, minimum ETR, decom fund,
  incremental-economics mode, 1P/2P/3P scenario management, NGN/FX.

Recommended order: A first (small and protects trust in every number the app
already produces), then B, then C/D in either order, E when a second
economics user exists, F as literature and demand arrive.
