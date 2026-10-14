# Petroleum Economics with Petrolord: lesson plan

Twelve short lessons (about 2 to 3 minutes each) in Petroleum Economics
Studio on the Ekene demonstration kit (ekene-demo-v4, `12-economics`), US$
and oilfield units. The kit's Run Console settings (`KIT_CONSOLE` in
`epe-common.mjs`): reserves scenario 2P, oil US$75/bbl flat, gas 0
(associated gas is platform fuel), discount 10%, inflation 0, base and
valuation year 2026 with earlier years sunk, economic limit on, abandonment
US$6.8 MM, PIA 2021 shallow water, PML, converted, 35 m (114.8 ft) of water.
That run returns NPV10 US$1.98 MM, the kit's number.

Every case a lesson makes is named "Lesson <id>: ..." and its setup deletes
it first (through the API as the demo user; the app archives cases and has
no delete). The "without Ekene-11" files and the revised AFE come from
`seed/epe_assets.mjs` (derived from the kit files; the script checks the
kit's opex rule first).

| # | Module | Lesson | What it shows |
|---|---|---|---|
| A1 | Data and terms | Cases and the three data slots | Case list, new case, production per well and stream, capex, opex, file name rule and templates, 1P/2P/3P tags, replace or add |
| A2 | Data and terms | Prices and escalation | Marker price, differential, NGN mirror, a yearly deck (65/70/75: NPV US$1.98 MM to US$1.65 MM), escalators, real or nominal, the applied price per year |
| A3 | Data and terms | Discounting and the valuation date | The rate, the NPV against rate curve, history valued versus sunk (US$16.3 MM versus US$1.98 MM) |
| B4 | Fiscal terms | The PIA under the Nigeria Tax Act | Asset profile, royalty tranches and royalty by price, HCT, CIT, TET, levies, framework per year, engine notes, take 93.2% |
| B5 | Fiscal terms | One field, three regimes | Generic JV (US$2.87 MM, take 84.1%) and PSC (US$917K, take 106.8%, US$130K unrecovered) against the PIA, side by side |
| B6 | Fiscal terms | Field life and abandonment | Economic limit (2037; off: US$2.76 MM from deferring the bill), sinking fund from 2027 with the escrow choice (US$2.37 MM) |
| C7 | Reading results | The KPIs | NPV, IRR reasons, payback and discounted payback, PI and DPI, unit costs, breakeven, take, value per barrel, an IRR that reads backwards |
| C8 | Reading results | Charts and reports | Annual cash flow, profile, waterfall (2027: revenue US$10.5 MM, capex US$12.4 MM, net -US$7.9 MM), year table, exports |
| C9 | Reading results | Sensitivity: the tornado | Twelve inputs plus and minus 20%, the readout sentence and table |
| C10 | Reading results | Monte Carlo | Oil, capex and production distributions, seed 20261109, P90 -US$1.05 MM, P50 US$1.57 MM, P10 US$4.1 MM, 78.7% above zero, IRR percentiles held back |
| D11 | Decisions | Comparing runs and the increment | With and without Ekene-11 across two cases: increment US$2.44 MM, two IRR roots, payback 4.68 years |
| D12 | Decisions | Keeping the economics honest | Approve and lock, a revised AFE (US$12.98 MM) that puts the run out of date, assumption set, re-run, sharing |

The three demos: epe-01 plan to decision (case on camera, US$1.98 MM, with
and without, increment US$2.44 MM), epe-02 how sure (breakeven, tornado,
Monte Carlo), epe-03 when the forecast changes (Ekene-11 from Forecast
Scenario Hub, qi 450 to 315, source changed, refresh, out-of-date run, re-run
-US$987K, comparison US$3M less).

Narration is written after a dry run: every number spoken is the number on
screen, and `expectText` steps stop a take that disagrees.
