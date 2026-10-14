# Petroleum Economics Studio (EPE): status

Scope document: `docs/scope/EPE.md`. Programme table: `docs/scope/Economics-ROADMAP.md`.

**Design system:** on the Petrolord design system since pilot 3 (2026-09-27,
branch `feat/ds-pilot-epe`). Every EPE route sits in one `ThemedApp` layout
route; light by default, dark per user through the header toggle. Recipe and
lessons: `docs/scope/DesignSystem-example-EPE.md`. No engine, calculation or
export change.
2026-09-28 design-system follow-up: `epeCheckbox` removed (the shared
Checkbox themes itself); `epeSelect`, `epeCellInput` and `epeSigned`
re-export the shared NativeSelect, compact field and signedTone; links hover
with `primary-text-hover`; toasts and the cold-load spinner follow the theme.

## EC7: PIA 2021 / NTA 2025 compliance (2026-09-26)

**State: MERGED** (Suite #632, 2026-09-26). Engine: engines PR #262 merged as
3778451 (engines 3.12.0); the Suite now vendors 3061acc, which carries it.
Migration `20260926150000_epe_pia_2021_inputs.sql`: **APPLIED** (owner). The
three EPE edge functions redeploy and the build upload go with the single
Wave 1 production zip.

Owner decision D1: the PIA regime follows the gazetted PIA 2021, NTA 2025
(June 2025 gazette), Petroleum Royalty Regulations 2022 and Finance Act 2023
by default; `pia_legacy_pre_audit: true` reproduces the pre-audit engine
(3.11.0) exactly. Sources, decisions D1 to D8 and the repairs:
`packages/engines/tools/validation/economics/AUDIT-PIA-2021.md` and
`FINDINGS-pia2021.md`.

### What changed in the Suite

| Area | Change |
|---|---|
| Vendoring | Engines #259, #260 and #261 first (pin 9187701), then #262 (pin 3778451). Guard: 1029 paths byte for byte, 0 deviations |
| Regression contract | Default path: worked example inputs NPV 141,236,909.83 and 27 line items (text oracle). Legacy switch: NPV 135,185,570.34 and every line item. EPE.md sections 3.1, 3h, 5, 6 and 7 |
| Tests | `epe-engine.test.ts`, `epe-mc.test.ts`, `epe-validation.ts` (101 checks, Cases 1a, 1b, 8), fixture with the flag and the default-path expectations, `economicsDefects.test.js`, new `piaCompliance.test.jsx` and `piaTemplateTypes.test.jsx` |
| Migration (held) | Nine compliance inputs; TET default dropped (NULL = statute); deep offshore reading default and NOT NULL dropped; every saved PIA config stamped legacy |
| Run Console | Compliance inputs with citations; required stated choices; legacy toggle; refusal panel with one-click fixes and run as legacy |
| Results Viewer | `pia_only_then_nta_2025` badge with `nta_first_year`; legacy notice; engine notes; royalty split and rates in the table and exports; refused-run page with fixes |
| Case Detail | Refused runs link "Fix the inputs" and "Run as legacy" |
| Fiscal Regime Designer | Editor and template list for `pia_2021`, `pia_cumulative_production`, `costRecoveryBase` |
| Sensitivity batch | A null config field is unset (no phantom 0% TET sweep) |
| Ekene demo kit | Economics domain regenerated: field NPV10 1.98 MM, increment 2.44 MM, EVPI 0.075 MM |
| Help | EPE guide: royalty tranches, gas royalty, royalty by price, NDDC, CPR scope, TET 3% from 1 May 2023, framework per year from 2026, required choices, legacy runs. Fiscal Designer guide: the template types |

### Owner steps, in order

1. Apply `supabase/migrations/20260926150000_epe_pia_2021_inputs.sql` to staging, then production.
2. Redeploy the edge functions that bundle the engine through `supabase/functions/_shared/epe-engine.ts`:
   `supabase functions deploy epe-cash-flow-engine`, `supabase functions deploy epe-cash-flow-engine-batch`,
   `supabase functions deploy epe-monte-carlo`.
3. Upload the Suite build.

Until step 1 the new Run Console cannot save a run config (unknown columns),
so merge and upload only after the migration. Until step 2 a new run still
computes on the pre-audit engine.

### Open items

- The re-gazetted NTA Certified True Copy was not read (engine D3); figures follow the June 2025 gazette.
- The Finance Act 2021 TET rate (2.5% before 2023) and the NDDC Act base rest on secondary sources.
- Not computed (course concept only): associated vs non-associated gas split, fiscal-price top-up (s.268 / NTA s.73), exploration and appraisal expensing, acquisition allowance, PSC terms inside the cash flow engine, NTA s.85 gas credit, statutory company-level minimum ETR test.
- ~~The Fiscal Regime Designer default regime named "Nigerian PIA (PSC)"~~ renamed "Sample PSC (R-factor split)" in Wave 1 T1 (#641).
- The owner's Ekene kit zip needs a rebuild after merge (economics numbers moved).
- NextGen: the `cashflow` and `fiscal` course re-cuts listed in FINDINGS-pia2021.md section 7 (separate NextGen PR, decision D2).

## 2026-09-26: Senior test T1 (Wave 1 #10)

Report: docs/testing/PetroleumEconomicsStudio-T1.md. Results Viewer:
headline figures to three significant figures (the demo field read "$2M"),
the framework named in chart titles (a PIA-then-NTA run was titled "PIA
2021"), the cumulative line on the flows' axis, sunk history shaded, the
waterfall opens on the first valued year, and the PDF report carries every
chart whichever tab is open. New dev harness `/dev/epe/runs/r1` on the
Ekene demo run computed by the engines cash flow. Engine untouched.

## 2026-10-02: sender to Risked Reserves Valuation (RRV U2-001)

Branch `feat/rrv-u2`. Petroleum Economics Studio now publishes a run as the
`epe-unit-value-1` contract (`src/pages/apps/epe/epeUnitValue.js`, read by id
through `epeUnitValueService.js`): NPV per barrel, the NPV before capex per
barrel and the present value of capex, with the run, case, price deck,
discount rate and basis, date, fiscal regime and engine build. Every figure
is read from the run's own KPIs; nothing is recomputed and no run, engine,
export or policy changes. The results page shows a read-only card "Value per
barrel for a prospect valuation" with a link that opens Risked Reserves
Valuation with the run offered to the selected prospect. Tests:
`src/pages/apps/epe/__tests__/epeUnitValue.test.js` (on the Ekene demo run
the engine computed). Detail: `docs/upgrade/RiskedReservesValuation-UPGRADE.md`,
section "U2-001".

## 2026-10-13: Run Console number fields keep their focus (video programme)

Found while scripting the EPE demo videos: every number field in the Run
Console (prices, discount rate, base year, abandonment, the PIA inputs, 52 in
all) lost its focus after one key, because the field component was declared
inside the console and React remounted it on every render. Typing 2026 into
Base year left 2 and the validation message "Enter a 4-digit year". The field
is now declared at module level. Test: piaScreens.mount.test.jsx types 2026
and 82.5 key by key (fails on the old code). No engine change.
## 2026-10-13: reading the IRR (video programme)

Two IRR readouts found on the Ekene runs while scripting the EPE videos:
- The field without Ekene-11 reports NPV -$459K and IRR 13.53% at 10%: a
  producing field earns first and pays its abandonment last, so its one root
  is a borrowing rate. The Results Viewer now prints a caution under the KPIs
  whenever the NPV and the IRR disagree about the discount rate
  (`epeIrrCaution`, testid `epe-irr-caution`), checked on engine-computed flows
  with a spend-first negative control (`epeIrrCaution.test.js`).
- Monte Carlo showed IRR P90, P50 and P10 all -8.1% from one iteration in a
  thousand (99.9% have no IRR). The IRR cards are held back when fewer than
  half the iterations have an IRR, with a line that says so
  (`irrStatsView`, testid `epe-mc-irr-held`).
No engine change.
## 2026-10-14: incremental economics on the engine valuation; compare across cases (video programme)

Found while scripting the EPE demo videos (Ekene with and without Ekene-11).
The two-run incremental block discounted every year of the delta from the base
run's first year and included the sunk history years. On the Ekene runs
(valuation 2026, history from 2020) it showed 1,377,011 USD for an increment of
1,980,235 - (-459,224) = 2,439,459 USD. The increment now follows the engine
(cashflow.ts): only the valued rows, the PV-basis flow, the exponent
(year - valuation year) + 0.5 on mid-year, at the base run's applied rate, so
it equals the difference of the two NPVs when both runs share their terms. The
mismatch warning also names a different valuation year or convention. The
incremental IRR comes from the shared IRR contract (`solveIrrInBand`); when
several rates zero the increment they are listed (the Ekene increment has two,
24.91% and -11.92%) where the page used to print "undefined". The run picker
now lists the runs of the user's other cases, grouped by case with this case
first, so a with-project run can be compared with a without-project run kept in
its own case. Helper `epeIncremental.js`; gates `epeIncremental.test.js`
(through the vendored engine; the invariant fails on the old discounting) and
`epeCompareCases.mount.test.jsx`. No engine change.

## 2026-10-14: comparison readability (video programme)

Compare Runs printed money in whole compact units, so the Ekene increment of
USD 2,439,459 read "$2.4M", the field "$2M", and the 2026 delta "$0.0037".
Money on the page now reads to three significant figures like the Results
Viewer (`fmtUsd3`: $2.44M, $1.98M, -$459K, $0 for differencing noise), the
incremental block opens with one sentence ("On NPV at 10.00%, With Ekene-11
is worth $2.44M more than Without Ekene-11.", testid `incremental-verdict`),
and the header names the case in place of its id. Tests in
`epeIncremental.test.js`.
## 2026-10-14: PIA water depth in the user's depth unit (video programme)

The Run Console asked for the PIA water depth in metres only. It now follows
the user's unit profile: on the Oilfield preset (feet, the Nigerian default)
it takes feet and states the stored value ("Stored as 34.99 m: the PIA sorts
terrain by water depth in metres."). The config and the engine keep metres
(`pia_water_depth_m`). Component `EpeWaterDepthField.jsx`, tests
`epeWaterDepth.test.jsx`.
## 2026-10-14: a run says when the case data changed after it (video programme)

For the data governance story in the EPE demo videos. The Run Console now
stores, on the epe_runs row, `parameters.inputs`: the input files the run
priced (the production files of its scenario, every CAPEX and OPEX file) as
`{ table, id, file_name, created_at, scenario_label }`. The Results Viewer
compares that list with the case's files now and, when a file was replaced,
added or removed, shows "The case data changed after this run:" with one line
per slot (for example "Production: ekene-production-2p.csv was replaced by
FSH - Ekene-11 low.generated.") and "Re-run to price the current data." with a
Re-run with edits link (testid `epe-run-inputs-changed`). Run History marks
such runs "Out of date" (testid `epe-run-out-of-date`). A run saved before
this change falls back to dates (a file uploaded after the run is named);
otherwise nothing is claimed. Logic: `src/pages/apps/epe/epeRunInputs.js`.
Tests: `epeRunInputs.test.js` (replaced, added, removed, unchanged, other
scenario, legacy dates) and `epeRunInputs.mount.test.jsx` (banner; fails on
the old viewer). No migration, no engine or Edge Function change.

## 2026-10-14: run list readability (video programme)

The Run History strip and the case list badge printed the NPV in whole
compact units ("NPV $2M" for 2,017,000 beside a results page reading $2.02M);
both now use three significant figures. A run whose input was refreshed from
its source (same file name) said "X was replaced by X"; it now says "X was
replaced by a newer version (date)". Test added to `epeRunInputs.test.js`.
    supabase functions deploy epe-cash-flow-engine
    supabase functions deploy epe-cash-flow-engine-batch
    supabase functions deploy epe-monte-carlo

New runs then stamp engine_version 3.12.1. No migration.

## 2026-10-14: mid-year discounting, owner decision option A (engines 3.12.3)

The engine's two conventions disagreed about the valuation date: end of year
used exponent year - V (so the valuation year's cash was undiscounted, a 31
December valuation date) while mid-year added 0.5, which discounted mid-year
cash MORE than year-end cash (Ekene: end of year US$1.98 MM, mid-year
US$1.89 MM). Owner decision 2026-10-14, option A: the valuation date is 31
December of the valuation year; end of year is unchanged; mid-year uses
year - V - 0.5, cash half a year before the year end (Ekene mid-year now
US$2,076,888 = end-of-year x sqrt(1.1)).

- Engines PR #359 (merge a6cb037, ENGINE_VERSION 3.12.3), vendored here with
  #358 (3.12.2, variable opex engine code; its Run Console fields ride #1095,
  held for the owner migration; the engine fields are optional and off by
  default). Goldens moved: mid_year_discounting 20,586,124 -> 22,644,736 and
  multiyear_pia_midyear_real 196,677,221 -> 210,043,634; every end-of-year
  golden unchanged. Gate economics.midYearDiscounting.test.ts on the Ekene kit
  case.
- Suite: the incremental economics (epeIncremental.js) follow the new
  exponent; the wording says "valued at 31 Dec <year>" in Compare Runs, the
  value per barrel card, the NPV against rate chart and the PDF KPI label, and
  the Run Console explains the conventions under the select
  (epeValuation.js). Tests epeMidYear.test.js (fails on the old exponent).
- Owner step (ONCE, at the end of the round, with the other engine PRs):
  redeploy epe-cash-flow-engine, epe-cash-flow-engine-batch and
  epe-monte-carlo. Until then live mid-year runs keep the old exponent.
- Affected elsewhere (not changed, listed for the owner): NextGen course
  "Cash Flow" intermediate (EC1) quotes the old mid-year numbers from its own
  vendored engine copy (mid_year_discounting 20,586,124.09 -> 22,644,736.49;
  AKATA mid-year 69,159,247.46 nominal -> 76,075,172.20 and 70,188,970.32 real
  -> 74,959,094.68; graded field jv_npv_mid_year_usd) and teaches "mid-year
  NPV = end-year / sqrt(1 + r)". It moves only if NextGen re-vendors.
