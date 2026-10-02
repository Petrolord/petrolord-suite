# Reservoir gap matrix: every live app against the reviewer lens

Audit of 2026-10-02 at `origin/main` 8234bdc8c, for
`docs/scope/AppUpgrade-Reservoir-PLAN.md`. The checks are RL1 to RL12 of
`docs/scope/AppUpgrade-Reservoir-FeedbackLessons.md`.

## 1. Which apps are live

From `src/data/suiteCatalog.js` (module `reservoir`, 13 names), the routes in
`src/App.jsx` (lines 635 to 715) and the production `master_apps` snapshot
`src/data/masterAppSlugs.json` (exported 2026-09-30). All 13 are routed,
wrapped in `ProtectedAppRoute` and Active.

| App | Route under `/dashboard/apps/reservoir/` | Licence slug | Saves to | Size (LOC, app code) |
|---|---|---|---|---|
| Fluid Systems Studio | `fluid-systems-studio` | `fluid-systems-studio` | `saved_fluid_studio_projects` | 4,000 |
| SCAL Studio | `scal-studio` | `scal-studio` | `saved_scal_projects` | 2,000 |
| Material Balance Studio | `reservoir-balance` and four aliases | `reservoir-balance` | `rb_cases`, `rb_production_data`, `rb_run_configs`, `rb_runs`, `rb_results` | 9,100 |
| Decline Curve Analysis | `decline-curve-analysis` | `decline-curve-analysis` | `saved_dca_projects` | 5,200 |
| Forecast Scenario Hub | `forecast-scenario-hub` | `forecast-scenario-hub` | `saved_scenario_hub_projects` | 550 |
| Well Test Analysis Studio | `well-test-analysis-studio` | `well-test-analyzer` | `saved_well_test_projects` | 8,600 |
| Reservoir Simulation Studio | `reservoir-simulation-studio` | `reservoir-simulation-studio` | `sim_cases`, `sim_runs`, bucket `sim` | 3,400 |
| Waterflood Design Studio | `waterflood-design-studio` | `fractional-flow-calculator` | `saved_waterflood_design_projects` | 3,500 |
| Voidage Replacement Monitor | `voidage-replacement-monitor` | `voidage-replacement-monitor` | `saved_vrr_projects` | 2,200 |
| Recovery Factor Estimator | `recovery-factor-estimator` | `recovery-factor-estimator` | `saved_rf_projects` | 1,100 |
| EOR Screening | `eor-screening` | `eor-screening` | nothing (state is lost on reload) | 800 |
| Risked Reserves Valuation | `risked-reserves-valuation` | `risked-reserves-valuation` | browser storage `rrv.prospects.v1` only | 530 |
| Well Spacing Optimizer | `well-spacing-optimizer` | `well-spacing-optimizer` | nothing | 1,450 |
| ReservoirCalc Pro (Geoscience) | `apps/geoscience/reservoircalc-pro` | `reservoircalc-pro` | `saved_quickvol_projects`, `rcp_prospects` | done in the Geoscience round; RL re-check only |

Archived and redirected, so out of scope: Waterflood Dashboard (now the
Surveillance tab), Aquifer Influx Calculator (now the Aquifer tab of
Material Balance), Relative Permeability Designer (now SCAL Studio).

## 2. How this was judged

- **Well Test Analysis Studio:** the sample PDF `/root/wta-report-sample.pdf`
  (built 2026-10-02 by the round 2 work) was read back with pdftotext, and
  the report code was read.
- **Material Balance Studio:** the current PDF was built through
  `exportMbalPdf` in a throwaway jest file (not committed) and read back
  with pdfinfo, pdfimages and pdftotext: 2 pages, 0 images, tables only. The
  result object was hand-made in the engine's shape, so the layout and the
  labels are real and the numbers are placeholders.
- **Every other app:** judged from the export code and the screen
  components by reading. No file was exported and no browser was opened.
  Nothing here says how a page looks.
- Grades: P pass, Pa partial, F fail, NA not applicable. RL1, RL4 and RL6
  are graded on the exported report, so an app with no report is F there.
  For the other checks an app with no report gets Pa when the screen
  carries the content and F when the screen does not either.
- Only Well Test Analysis Studio and Material Balance Studio have a PDF
  report. Eleven of thirteen apps have none.

## 3. The matrix

| App | RL1 | RL2 | RL3 | RL4 | RL5 | RL6 | RL7 | RL8 | RL9 | RL10 | RL11 | RL12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Fluid Systems Studio | F | F | Pa | F | F | F | Pa | Pa | Pa | F | Pa | Pa |
| SCAL Studio | F | Pa | NA | F | Pa | F | Pa | Pa | F | Pa | Pa | Pa |
| Material Balance Studio | F | F | Pa | Pa | Pa | F | F | Pa | Pa | Pa | Pa | F |
| Decline Curve Analysis | F | Pa | F | F | F | F | Pa | Pa | F | Pa | F | F |
| Forecast Scenario Hub | F | NA | NA | F | F | F | Pa | Pa | Pa | NA | Pa | Pa |
| Well Test Analysis Studio | P | P | P | Pa | Pa | P | Pa | P | Pa | Pa | Pa | P |
| Reservoir Simulation Studio | F | F | F | F | Pa | F | Pa | Pa | Pa | Pa | F | F |
| Waterflood Design Studio | F | Pa | Pa | F | Pa | F | Pa | Pa | Pa | Pa | Pa | Pa |
| Voidage Replacement Monitor | F | Pa | Pa | F | Pa | F | Pa | Pa | Pa | Pa | F | Pa |
| Recovery Factor Estimator | F | Pa | Pa | F | NA | F | Pa | Pa | Pa | NA | NA | F |
| EOR Screening | F | NA | Pa | F | NA | F | Pa | Pa | Pa | NA | NA | F |
| Risked Reserves Valuation | Pa | Pa | Pa | F | NA | F | Pa | Pa | F | NA | Pa | F |
| Well Spacing Optimizer | Pa | Pa | F | Pa | Pa | F | Pa | F | Pa | NA | NA | F |
| ReservoirCalc Pro (re-check) | Pa | P | Pa | Pa | NA | Pa | P | Pa | Pa | P | Pa | Pa |

Counts over the 13 Reservoir apps: RL1 fails in 10, RL4 in 10, RL6 in 12.
Well Test is the only app that passes RL6.

### The three worst gaps per app

| App | 1 | 2 | 3 |
|---|---|---|---|
| Fluid Systems Studio | No report and no identification | The handoff and both CSVs drop correlation names, ranges, tuning and time; four consumers recompute with Standing hardcoded | The Material Balance CSV has no door to receive it |
| SCAL Studio | No report; CSVs are bare numbers | No sample pedigree (lab, method, wettability, analog) and no fitted or entered trail | Waterflood discards the source on arrival; Simulation says "SCAL Studio model" with no link |
| Material Balance Studio | PDF has no plots, no PVT values, no aquifer inputs | The report can print an old run beside edited inputs and still say "converged" | No pressure datum, no dates in the step table, drive index convention unstated |
| Decline Curve Analysis | No report; the XLSX writes the same number as "EUR" and "Remaining Reserves" | Di shown on two bases on one screen (365 times apart); no fit window or economic limit on the plot | The NPV and FDP "sync" cards show success and send nothing |
| Forecast Scenario Hub | CSV carries no parameters, units or identity | Decline basis unlabelled; no intake from DCA | The stated NPV Scenario Builder handoff has no receiver |
| Well Test Analysis Studio | No gauge depth or pressure datum; no company or build | Import can misread comma decimals and day-first dates | Excluded points not in the report; the Fluid Systems source survives a later edit |
| Reservoir Simulation Studio | No report and no record of which PVT, SCAL, grid and schedule made a run | No material balance or convergence statement beside "complete" | Builder inputs are not saved, so a deck cannot be traced to its inputs |
| Waterflood Design Studio | No report; kr and k sources dropped on arrival | Hall plot: no slope windows, no fitted lines, axes swapped, pressure basis unnamed | Surveillance import misreads day-first dates and comma decimals |
| Voidage Replacement Monitor | No report and no export of the ledger in RB with the FVFs used | FVF source unstated: correlations unnamed, per-period values hidden, no pressure datum | No column or unit read-back on a clean import |
| Recovery Factor Estimator | No export of any kind | Sample inputs open as the case with no label and no sources | RF silently clamped to 1 to 95 percent; analog bands uncited |
| EOR Screening | Nothing saved, nothing exported | No identification | Sample defaults unlabelled; composition criteria shown and never screened |
| Risked Reserves Valuation | Economics live in one browser only | No signable report; the CSV drops basis and provenance | Default economics applied silently; "from the Petroleum Economics Studio" with no such handoff |
| Well Spacing Optimizer | Its own NPV loop (breaks the canonical NPV rule) | The JSON export names an optimum the screen says it does not nominate | Nothing saved; no report |
| ReservoirCalc Pro | Probabilistic PDF has no input distribution table; deterministic PDF has no plot | The audit note always says "correlation of -0.8 is applied" | The prospect PDF drops charge, economics and run provenance |

## 4. Evidence per app

Paths are relative to the repo root. C = `src/components`, U = `src/utils`,
P = `src/pages/apps`.

### 4.1 Fluid Systems Studio

Exports: "Export PVT CSV" (`C/fluidstudio/FluidStudioResults.jsx:37`, header
`pressure,Rs,Bo,Bg,Z,mu_o,mu_g,co,phase`, no units) and "Export CSV (MB
schema)" (`U/fluidstudio/eosAnalysis.js:388`, units in the headers). No PDF,
no simulator tables, no project file.

| RL | Grade | Evidence and the app's equivalent |
|---|---|---|
| RL1 | F | The exports carry no inputs. The screen shows KPI cards with units and no sources. |
| RL2 | F | Separator GOR against stock-tank GOR, and Bod and Rsd against the flash values, are on screen only. |
| RL3 | Pa | "Bo (single stage)" against "Bo (multistage, approx)" on screen. |
| RL4 | F | No well, field, sample, lab, analyst or build anywhere. The saved row is a name and the inputs. |
| RL5 | F | Separator stage table on screen only. The equivalent here is the sample and lab test record: sample depth, sampling method, contamination, lab report number. No such fields exist. |
| RL6 | F | No report. Screen: PVT curves with a dashed bubble point line; lab tuning shows a before and after table and no lab against model plot. |
| RL7 | Pa | Units good on screen ("implicit stock-tank stage (14.7 psia, 60 degF)"). Bg is rb/scf on screen and rb/Mscf in the MB CSV. Whether the black-oil Bo is flash or differential is unstated. |
| RL8 | Pa | Tier badges, "Error after tune", a not-converged warning. Tuned-parameter uncertainty is computed and not shown (STATUS). The "Lab tuned" badge reads `tuning` and nothing clears it when the composition is edited (read from code, not run). |
| RL9 | Pa | `CORRELATION_RANGES` warnings on screen only; added after the Wave 2 finding that Glaso Rs read about 100 times low. Nothing in an export. |
| RL10 | F | No import door: composition, lab targets and the P-T profile are typed. A lab PVT report cannot be loaded. |
| RL11 | Pa | See the provenance picture below. |
| RL12 | Pa | Two CSVs with different Bg units; `EosPvtTableCard` prints a literal 'n/a' where the rest uses `EMPTY_VALUE`. |

**The PVT provenance picture.** The handoff object ("backbone") is built by
`buildBackbone` (`U/fluidStudioCalculations.js:642`) or the EOS builder
(`U/fluidstudio/eosAnalysis.js:366`) and travels as react-router navigate
state, so it is lost on refresh. It carries `source`, `correlations
{pb_rs_bo, viscosity}`, the fluid inputs and the PVT table. It does not
carry units, a timestamp, the project or well, the Z, gas viscosity, co and
undersaturated viscosity correlation names, range warnings, a typed bubble
point flag, the silent Standing fallback in `solveBubblePoint`, separator or
standard conditions, or (for EOS) the tuning state and the EOS name.

| Consumer | How PVT arrives | Correlation names | Sender in Fluid Systems |
|---|---|---|---|
| Well Test Analysis | backbone, `pvtIntakeFromBackbone` | kept and printed; tuned state and time dropped | yes |
| Line Sizing | backbone | dropped | yes |
| Material Balance | calls the engine functions in `P/reservoir-balance/lib/fluidStudioPvtPrefill.js`, Standing and Beggs-Robinson hardcoded (line 89) whatever the PVT tab selected; rows land as a "lab table" | named in a passing note only; the PDF prints `PVT source: lab_table` for a correlation-built table | no |
| Simulation | `U/simDeckBuilder.js:71` calls `computePvtTable` | hardcoded; a caption on the Builder; not in the deck | no |
| VRR Monitor | `U/vrr/pvtTrack.js` through `U/nodal/pvt.js` | "black-oil correlations", unnamed | no |
| Nodal Analysis | `U/nodal/pvt.js` | defaults | no |
| Waterflood Design | muO, muW, Bo, Bw typed | not applicable | no intake |

### 4.2 SCAL Studio

Exports (`C/scalstudio/exports.js`, `ExportTab.jsx`): kr table CSV
(`Sw,krw,kro`, oil-water only), reservoir Pc CSV, saturation-height CSV,
project JSON, chart PNGs. No PDF, no SWOF or SGOF keywords.

| RL | Grade | Evidence and the app's equivalent |
|---|---|---|
| RL1 | F | The CSVs carry none of: Corey end points and exponents, fitted or typed, sample, J parameters, IFT, contact angle, k, phi, FWL, project, date. Missing prints '-' on screen. |
| RL2 | Pa | "J source" (Manual or N samples), a, b, Swirr on screen. sigma cos(theta) and sqrt(k/phi) are not shown as components. |
| RL3 | NA | |
| RL4 | F | No well, field, core, lab or analyst. A sample holds name, depth, k, phi, sigma, theta. No wettability, lab or analog flag, test method or normalisation basis. |
| RL5 | Pa | Import notice gives rows read and skipped. No table of points used or excluded per fit. |
| RL6 | F | No report. Screen is good: lab points with the fitted Corey curve, normalised overlay, J with the sample band, Pc, Sw against height. |
| RL7 | Pa | "Height above FWL (ft)", "Free water level TVDSS (ft, optional)", IFT in dyn/cm. Drainage or imbibition is not stated on the exports. |
| RL8 | Pa | "nw (fit) ... CI", RMS, r2, "The fit stopped at the iteration cap". After "Use fit on the Curves tab" the working curve keeps no record that it was fitted or from which sample. |
| RL9 | F | Corey only, no hysteresis, no three-phase: in the help text only. |
| RL10 | Pa | `parseCsvRows` finds header aliases in any order and reports skipped rows. Header required, comma split only, Pc in psi only, no read-back panel. |
| RL11 | Pa | One sender ("Send curves to Waterflood", payload: source name, Corey set, viscosities; no fitted flag, sample or time). Waterflood shows the source in a toast and does not store it. Earth Modeling, Rock Physics, Petrophysics and ReservoirCalc Pro pull `saved_scal_projects` by id and print the project name and FWL only. Simulation's "Relative permeability (Corey, SCAL Studio model)" is a typed form with no link. |
| RL12 | Pa | Project JSON exports the whole project, and import reads samples only. |

### 4.3 Material Balance Studio

Report: `U/mbalReportExport.js` (`exportMbalPdf`), built on the pre-round-2
Well Test pattern. Read back: title, one identity line ("Sample tank | Field
Ekene | Reservoir E-2000 | Oil"), "Generated ... | Petrolord Material
Balance Studio", then the tables Case summary, Headline results, Drive
indices at the final timestep, Pressure history match, Match quality,
Pressure and production history, Engine warnings. No figure.

| RL | Grade | Evidence and the app's equivalent |
|---|---|---|
| RL1 | F | Case summary prints initial pressure, temperature, Swi, bubble point, row count, "Aquifer model", "Solver method" and "PVT source" as the raw enum (`lab_table`). No PVT values, no correlation names (saved as `pvt_correlations`), no API, gas gravity, salinity, cf, cw or m. No aquifer inputs at all (W, J, k, h, phi, angle, radius ratio, ct). Defaults cf 6e-6, cw 3e-6, salinity 50,000 are not printed as assumptions. Missing prints '-'. |
| RL2 | F | F, Et, Eo, Eg, Efw and We are in the CSV and the on-screen point detail only. |
| RL3 | Pa | OOIP or OGIP, aquifer W, cumulative We, drive index sum and DDI, GDI, WDI and the rock and water index at the final step. m is not printed; the method that produced N is not named beside it. |
| RL4 | Pa | Case, field, reservoir, fluid system, generated time. No licence, analyst, company, data dates, build or unit system. |
| RL5 | Pa | Step table: Step, p, Np or Gp, Wp, We, p simulated, first 60 rows. No dates although `observation_date` exists, no injection, no cut-off. "Fit points" is a count; excluded rows are not listed. The engine supports `excluded_timesteps` and no screen sets it. |
| RL6 | F | No plots in the PDF. On screen: Havlena-Odeh with the regression line, in-fit and excluded markers and a slope box; p/z with the extrapolation and the Ramagost-Farshad line; Cole and Campbell with a reference line only; drive index bars; pressure history match on a timestep axis. No fit window shading. |
| RL7 | F | Pressures are psia with no datum anywhere in the app. The drive index denominator (hydrocarbon voidage F minus Wp Bw since engines #165) is not stated. The same term is "Rock and water (EDI)" for oil and "(CDI)" for gas and on screen. Contacts are "ft TVD" with no reference. |
| RL8 | Pa | Kept: 95 percent confidence, "[at bound]", "(converged in N iterations)" against "(stopped at the iteration cap, N)", RMS and largest miss, validation tier and reference. No cross-check table of regression against history match against p/z. **Status risk:** `lastResult` is loaded from the last stored run when a case opens (`src/contexts/MaterialBalanceStudioContext.jsx:95-100`) and nothing clears it when PVT, aquifer or data change, so the PDF can print current inputs beside an older result. The Report tab says "The report always describes a computed result. It does not show stored numbers." |
| RL9 | Pa | Engine warnings table and one footer sentence. Correlation ranges on screen only. |
| RL10 | Pa | `C/reservoirbalance/DataHub.jsx`: header aliases in any order, volume units read from headers, day-first dates inferred with a warning, a column mapping panel. No unit choice at the door, pressure assumed psia, a comma decimal "1,5" becomes 15, rows with blank pressure dropped silently. |
| RL11 | Pa | Well Test to Material Balance has a sender (average pressure, k, skin, source; no method or time) and it writes the well test average pressure into the case's initial pressure. The Fluid Systems prefill is described in 4.1. Nothing is sent out of Material Balance. |
| RL12 | F | The stale-run risk above; CSV and PDF are built by separate code; `rb_*` tables have no `.pld` family and no migrations in the repo. |

### 4.4 Decline Curve Analysis

Exports (`U/declineCurve/dcaExport.js`): forecast CSV
(`Date,Days,Rate,Cumulative`), scenario comparison XLSX, a PNG of the main
plot, type curve CSV. No PDF.

| RL | Grade | Evidence and the app's equivalent |
|---|---|---|
| RL1 | F | The CSV has no units, parameters or well. The XLSX has "Initial Rate (qi)", "Decline Rate (Di)" as the raw per-day value with no label, "b-Factor", "EUR", "Remaining Reserves", "Economic Limit"; "EUR" and "Remaining Reserves" are written from the same field (lines 43 and 44). Missing prints 0 or 'N/A'. |
| RL2 | Pa | On screen EUR is split ("EUR x incl. y produced", "Rem. Reserves ... after the last data"). Not exported. |
| RL3 | F | "N-segment decline pattern detected" is shown; there is no segmented fit and no segment table. |
| RL4 | F | The well name is in the file name only. Well metadata is tags and notes. |
| RL5 | F | Importer shows file, record count and date range. No count of points used. The engine drops rates at or below zero silently. Outliers beyond 2 sigma are flagged and cannot be excluded. |
| RL6 | F | No report. Screen: rate against time with Historical, Fitted Model, Forecast and a P10 to P90 band. No fit window marking, no economic limit line, no rate against cumulative plot. |
| RL7 | Pa | The KPI card says "Decline (Di)" in %/yr, "Nominal Annual". The plot note says "Di: x%/yr" with no qualifier. Fit diagnostics print the per-day Di times 100 with the label "%/yr" (`C/declineCurve/DCAFitDiagnostics.jsx:194`), 365 times smaller than the KPI on the same screen. Percentiles are stated ("90% chance >="). "P50 EUR (Most Likely)" calls the median the mode. Units fixed at bbl/d and Mscf/d. |
| RL8 | Pa | R2, RMSE, "95% Confidence Intervals" (the b interval is a plus or minus 10 percent placeholder), seed and limit uncertainty under the histogram. Fit and forecast results are not cleared when the fit window, model or data change. |
| RL9 | F | Nothing exported; no limits statement on screen beyond the help. |
| RL10 | Pa | `U/declineCurve/csvParser.js`: header aliases in any order. No unit choice, dates through `new Date()` (day-first misread), no comma decimals, negative-rate warnings computed and never shown, read-back is "Loaded N records" with no column map or skipped count. |
| RL11 | F | The "NPV & Economics" and "FDP Accelerator" cards call `U/declineCurve/dcaIntegration.js`, which waits and returns success with an empty payload. No intake. No sender into Forecast Scenario Hub. |
| RL12 | F | The XLSX and the screen disagree on EUR; Di on two bases; no project file export. |

### 4.5 Forecast Scenario Hub

One export: annual CSV `year,production_bbl` (`P/ForecastScenarioHub.jsx:163`).

| RL | Grade | Evidence |
|---|---|---|
| RL1 | F | No qi, decline, b, limit, start date or case name in the file. |
| RL4 | F | A scenario set name only. |
| RL5 | F | The comparison table is screen only. |
| RL6 | F | "Rate profiles" chart on screen; no history, so no fit to mark. |
| RL7 | Pa | "Decline (%/yr)" with no "nominal" (the code treats it as nominal annual). Start date is a fixed default. Year-end discounting stated in a code comment only. |
| RL8 | Pa | "50 yr max life" and "past horizon" flags; results always recomputed from inputs. |
| RL9 | Pa | "Indicative NPV is flat price minus flat opex at a single discount rate, for ranking cases only." on screen. |
| RL11 | Pa | The toast says "Feed it to NPV Scenario Builder"; no CSV import was found there. Petroleum Economics Studio reads saved sets from the table. DCA parameters are retyped, and DCA holds Di per day while the hub takes %/yr. |
| RL12 | Pa | Results recomputed from saved inputs; the CSV is a subset of the screen. |
| RL2, RL3, RL10 | NA | |

### 4.6 Well Test Analysis Studio (residual gaps after round 2)

RL1, RL2, RL3, RL6, RL8 and RL12 pass (sample PDF read back: inputs with
sources, ct mode, skin components with the formula, cross-check of methods,
regime windows, five pages).

| RL | Grade | Residual gap |
|---|---|---|
| RL4 | Pa | No company or operator, no software build. |
| RL5 | Pa | "Analysis points" is a count. Spike-filter removals and readings set aside before the shut-in are warnings on screen and are not in the report. |
| RL7 | Pa | No gauge depth or pressure datum input or statement. Gauge pressures add one standard atmosphere and the report does not print that assumption. |
| RL9 | Pa | Limits are printed for the skin split only. No general block (single phase, no limited-entry model, vertical well). |
| RL10 | Pa | `U/welltest/gaugeImport.js`: `num()` strips every comma, so "3500,5" reads 35005; `stamp()` uses `Date.parse`, so day-first dates are read month-first or skipped (read from code). |
| RL11 | Pa | The Fluid Systems source text stays after the user edits Bo or mu. The sends to Material Balance and Waterflood carry k, skin and average pressure with no method, interval or regression status. |

Also open from round 2: a lab PVT table input; the limited-entry model.

### 4.7 Reservoir Simulation Studio

Exports: results CSV (`C/simstudio/ResultsPanel.jsx:112`, header
`days,FOPR,...`, no units row, downsampled above 5,000 points without
saying so); the deck through the Deck tab. No PDF, PNG or project file.

| RL | Grade | Evidence and the app's equivalent |
|---|---|---|
| RL1 | F | PVT source is one sentence on the Builder ("PVTO/PVDG tables come from the Standing and Beggs-Robinson correlation set"). Blank inputs fall back to hidden defaults (`U/simDeckBuilder.js:74-78`). The builder form is component state and is lost on reload. |
| RL2 | F | PVTO and PVDG from API, gas gravity, T, GOR; SWOF and SGOF from Corey end points; Pc from J. The solved bubble point appears in a toast. |
| RL3 | F | History allocation fractions per well are not kept; no field against well split of the result. |
| RL4 | F | Case name, deck hash and OPM version. The deck is in FIELD units and the Results tab does not say so. |
| RL5 | Pa | History preview table capped at 8 rows and a per-well table on the Builder. No schedule summary on Results. |
| RL6 | F | No report. Screen overlays observed rates as dashed lines; no pressure observations, no mismatch statistic. |
| RL7 | Pa | Units on chart titles; "Datum depth (ft)"; time is days from start. |
| RL8 | Pa | Honest queue states, failure text verbatim, deck hash per run. No convergence, timestep or material balance error statement: "Latest run complete." means the process exited and the summary parsed. "{n} report steps" is the downsampled count on long runs. |
| RL9 | Pa | A limits line on the Deck tab and the help guide. |
| RL10 | Pa | `U/simWellHistoryImport.js`: header aliases, rate against volume and Mscf against scf at the door, per-line errors. ISO dates only, no comma decimals, header required, first three errors shown. |
| RL11 | F | Pulls a structure surface and Material Balance cumulatives; neither source reaches the deck or the CSV. "Fluid Studio" and "SCAL Studio" appear in titles of typed forms with no intake. The deck's provenance is two comment lines. |
| RL12 | F | A generated deck cannot be traced to its inputs; the CSV is not the screen series for long runs. |

### 4.8 Waterflood Design Studio (with Surveillance)

Exports: "Annual CSV" `year,production_bbl`
(`C/waterflooddesign/PatternResults.jsx:62`), `pattern_response.csv`, a
template. No PDF, no PNG, no export of displacement, layered, Hall, Chan or
Monte Carlo results.

| RL | Grade | Evidence and the app's equivalent |
|---|---|---|
| RL1 | F | Inputs live in the left rail. Missing prints '-', 'N/A' and an infinity sign. Surveillance defaults Bo 1.25 and Bw 1.02 silently. |
| RL2 | Pa | "Endpoint mobility ratio M = x" without its four inputs beside it. |
| RL3 | Pa | "EA @ breakthrough", "RF of flooded OOIP", the stop reason. Np is not split into displacement, areal and vertical efficiency. |
| RL4 | F | Project name only. |
| RL5 | Pa | Data quality panel (rows in and out, duplicates, negatives zeroed). No period ledger. |
| RL6 | F | No report. Screen: fractional flow with the Welge tangent and Swf marked (good). Hall plot: baseline and recent slope windows (first and last third) are not drawn, no fitted line, and the chart puts the Hall integral on x and cumulative injection on y (`C/waterflood/HallPlotPanel.jsx:67-72`) while the slope is of the integral against injection. Chan: the late-time window is not marked. |
| RL7 | Pa | Good: "Bg (rb/Mscf)", "Percentiles follow the petroleum convention: P90 is the low case." Weak: one quantity is "Avg VRR" in the KPI panel and "Cumulative VRR" in the rail; the Hall pressure column accepts wellhead or bottomhole pressure with no basis stated; "production_bbl" does not say STB. |
| RL8 | Pa | Monte Carlo "Stale / Current / Not run" with rejection accounting; no interval on Hall or Chan slopes. |
| RL9 | Pa | "1-D Buckley-Leverett displacement, capillary pressure neglected"; "screening-level analytical composite"; five-spot only. The mobility range of the areal sweep correlation is in an engine comment only. |
| RL10 | Pa | Header aliases and a read-back toast. Dates through `new Date()`, comma decimals truncated, no unit choice, invalid rows counted and not listed. |
| RL11 | Pa | SCAL and Well Test senders exist. The source shows in a toast and is not stored. No Fluid Systems intake. |
| RL12 | Pa | Monte Carlo results are never saved; the export is a small subset of the screen. |

### 4.9 Voidage Replacement Monitor

Exports: `vrr_data.csv` of the manual grid inputs
(`C/vrrmonitor/PeriodGridPanel.jsx:45`), hidden once a ledger is imported;
three chart PNGs. No PDF, no ledger export.

| RL | Grade | Evidence and the app's equivalent |
|---|---|---|
| RL1 | F | FVFs are on screen with no source field; the pressure track's fluid inputs default silently; missing prints '-'. |
| RL2 | Pa | Total produced and injected voidage in RB. Per-period RB, the free gas term and the FVFs applied to each period are not shown. |
| RL3 | Pa | Instantaneous, rolling and cumulative VRR; field, pattern and weakest pattern; allocation audit. Voidage is not split by oil, free gas and water. |
| RL4 | F | Project name only. |
| RL5 | Pa | The monthly ledger is good. Import counts show only when something went wrong. |
| RL6 | F | No report. Screen is good: three charts with the target band and the fill-up marker. |
| RL7 | Pa | RB, STB and Mscf labelled throughout, and the basis sentence "All volumes convert to reservoir barrels before the ratio is taken". No pressure datum for the surveys. |
| RL8 | Pa | Status against the user's band. The older "Screening bands (0.9 to 1.1)" line can contradict the headline. |
| RL9 | Pa | Correlation range warnings on the track. |
| RL10 | Pa | `U/vrr/csvImport.js` is the best importer in the module: aliases, unit scaling from header text, day-first inference with a warning, skipped rows listed. No unit choice, comma decimals truncated, the column map is built and never shown, the report is hidden on a clean import. The manual grid import is exact-header. |
| RL11 | F | No intake and no sender. FVFs are not read from Fluid Systems Studio; the track runs the same correlations on locally typed fluid inputs. |
| RL12 | Pa | Imported mode has no data export. |

### 4.10 Recovery Factor Estimator

No export. Saves inputs to `saved_rf_projects`.

| RL | Grade | Evidence |
|---|---|---|
| RL1 | F | The form opens filled with `sampleRecoveryData` (1,200 acres, 45 ft, water drive) with no sample label. Missing prints '-'. |
| RL2 | Pa | OOIP formula printed; GRV, PV and HCPV not shown. |
| RL3 | Pa | Low, Estimate, High. No recovery by mechanism. |
| RL4, RL6 | F | Project name only; a three-bar chart on screen. |
| RL7 | Pa | Units labelled. The band is "Low / High" on screen and "P90 to P10" in the help. |
| RL8 | Pa | Correlation warnings shown; `clampFraction` clamps RF to 1 to 95 percent without saying so. |
| RL9 | Pa | "empirical fit with wide scatter". The API (1967) correlations are named; the analog bands cite "industry literature"; no data ranges. |
| RL12 | F | Nothing leaves the app. |

### 4.11 EOR Screening

No export and nothing saved.

| RL | Grade | Evidence |
|---|---|---|
| RL1 | F | Opens on a sample candidate with no label. `EMPTY_VALUE` used on screen. |
| RL3 | Pa | Good on screen: per method "Criterion / Required (Taber et al. 1997) / This reservoir / Verdict" with pass, fail, not scored. Not in any report. |
| RL4, RL6 | F | No identification; a ranking bar chart on screen. |
| RL7 | Pa | "Depth (ft)" has no reference. |
| RL8 | Pa | Honest on screen: blank inputs leave criteria unscored. |
| RL9 | Pa | Good on screen: "Screening shortlists candidate methods; it does not design or predict recovery." with the full Taber, Martin and Seright (1997) citation. |
| RL12 | F | State is lost on reload. |

### 4.12 Risked Reserves Valuation

Export: `risked-valuation.csv` (`P/riskedreserves/services/rrvStore.js:92`).
Saves to browser storage only.

| RL | Grade | Evidence |
|---|---|---|
| RL1 | Pa | Inputs are in the CSV with units in the column names. `DEFAULT_ECONOMICS` (MEFS 10, 8 $/bbl, development 100, well 25) is applied to every imported prospect with no assumption label. |
| RL2 | Pa | Pc = Pg times P(V >= MEFS), both printed. The chance factors behind Pg are not carried. |
| RL3 | Pa | The screen shows value if commercial and mean if commercial; the CSV omits both. |
| RL4 | F | No field, licence, analyst, date or build. |
| RL6 | F | The screen's expectation curve marks MEFS and P90, P50, P10. Nothing in the export. |
| RL7 | Pa | P90 is the low case, stated in tooltips and an error message, absent from the CSV. Volumes are converted to MMboe and labelled MMbbl. In-place or recoverable basis is not in the CSV. |
| RL8 | Pa | Swanson mean as a cross-check. "Value per barrel comes from the Petroleum Economics Studio" (`RrvWorkstation.jsx:173`) with no such handoff. |
| RL9 | F | No limits in the CSV (independence of prospects, lognormal assumption). |
| RL11 | Pa | ReservoirCalc Pro sends prospects; notes, basis and the Basin charge record do not reach the CSV. A prospect re-risked in ReservoirCalc Pro is skipped on re-import. |
| RL12 | F | The economics exist in one browser. |

Checked in Step 1 (2026-10-02, `docs/upgrade/RiskedReservesValuation-UPGRADE.md`):
the grades held. Corrections: under RL11 an in-place edit upstream was
skipped, and a prospect added again was imported as a duplicate; the matrix
missed that a cleared Pg was valued as zero (S2) and that the starting
defaults contradict each other. All but two S3 items are fixed; the app now
grades P on every applicable check except RL6 (no sensitivity plot, stated).

### 4.13 Well Spacing Optimizer

Exports: `well_spacing_results.csv` and `well_spacing_summary.json`
(`U/wellSpacingCalculations.js:303-338`). Nothing saved.

| RL | Grade | Evidence |
|---|---|---|
| RL1 | Pa | The JSON echoes inputs with no units or sources; the CSV has none. |
| RL2 | Pa | Bo and coverage shown; OOIP per well and initial rate computed and not printed. |
| RL3 | F | NPV is not split into revenue, opex, capex and tax. |
| RL4 | Pa | Field name and timestamp in the JSON. |
| RL6 | F | Three line charts on screen. |
| RL7 | Pa | "Well Decline Rate (%)" (effective annual per the help only); "$M" on screen and "$MM" in the CSV; "Pressure (psi)" with no basis. |
| RL8 | F | The JSON carries `optimalSpacing` and "This spacing maximizes NPV" while the screen says no optimum is nominated. `standingBo` falls back to 1 on blank PVT and the note prints "Bo 1.000 rb/stb, from Standing's correlation". Pressure and pattern type are asked for and enter no equation. |
| RL9 | Pa | The fixed-recovery, no-interference model is stated on screen and in the JSON. |
| RL12 | F | The export contradicts the screen. NPV is a private yearly loop (lines 165 to 190) in place of `calculateEconomics`, against the CLAUDE.md rule. |

### 4.14 ReservoirCalc Pro (RL re-check only)

Reports: `P/ReservoirCalcPro/components/tools/ReportGenerator.jsx`,
`services/reportInfo.js`, `services/prospectSummaryPdf.js`. Residual gaps:

| RL | Grade | Residual gap |
|---|---|---|
| RL1 | Pa | The deterministic table prints NTG, porosity, Sw, Bo, contacts and RF with no per-row unit or source; the probabilistic PDF has no input distribution table. |
| RL3 | Pa | Solution gas, condensate and vaporised oil are on screen and not in the PDF. |
| RL4 | Pa | Field, analyst, date, build, units, method. No licence, well or company. |
| RL6 | Pa | No plot in the deterministic PDF. Probabilistic charts are html2canvas captures that are skipped silently when a chart is not mounted. |
| RL8 | Pa | The audit note always prints "A default porosity-water-saturation correlation of -0.8 is applied" (line 295) whatever the correlation editor holds. |
| RL9 | Pa | "Screening estimate" lines only. |
| RL11 | Pa | The prospect PDF does not print the Basin charge record or the economics; a prospect row holds no source project, seed or run signature. |
| RL12 | Pa | Follows from RL6 and RL8. |

Checked in the RL re-check (2026-10-02, `docs/upgrade/ReservoirCalcPro-UPGRADE.md`):
confirmed, and one addition: the deterministic PDF did not print area and
gross thickness for the Simple method. RL1, RL3, RL4, RL8, RL9 and RL11 are
now P; RL6 and RL12 stay Pa (two charts are still screen captures; the
reports are not on the kit).

## 5. Platform contracts today

| App | Unit profile (`src/lib/units`) | Record sharing | Well datum module | e2e in CI | `.pld` family | Harness |
|---|---|---|---|---|---|---|
| Fluid Systems | no, oilfield only | no | not needed | `fluid-systems-t1` | yes | `/dev/fluid-systems-studio` |
| SCAL | no | no | no (FWL is a typed TVDSS) | `scal-studio-t1` | yes | `/dev/scal-studio` |
| Material Balance | no | no | no (contacts, no pressure datum) | `material-balance-t1` | **no** | `/dev/material-balance-studio` |
| DCA | no | no | not needed | `dca-t1` | yes | `/dev/dca` |
| Forecast Scenario Hub | no | no | not needed | `forecast-scenario-hub-t1` | yes | `/dev/forecast-scenario-hub` |
| Well Test | yes (`useProfileSystem`, new projects) | no | yes (registry proposal) | three specs | yes | `/dev/well-test-analysis-studio` |
| Simulation | no | no | no (own "KB to datum" field) | `reservoir-simulation-t1` | yes (`sim_cases`) | `/dev/reservoir-simulation-studio` |
| Waterflood Design | no | no | not needed | `waterflood-t1` | yes | `/dev/studio/waterflood` |
| VRR Monitor | no | no | no (no pressure datum) | `vrr-monitor-t1` | yes | `/dev/studio/vrr` |
| Recovery Factor | no | no | no | `recovery-factor-t1` | yes | `/dev/studio/recovery-factor` |
| EOR Screening | no | nothing saved | no | `eor-screening-t1` | nothing saved | `/dev/studio/eor` |
| Risked Reserves | no | nothing saved | not needed | `risked-reserves` | nothing saved | `/dev/risked-reserves` |
| Well Spacing | no | nothing saved | not needed | `well-spacing-t1` | nothing saved | `/dev/studio/well-spacing` |

All 13 routes carry `ProtectedAppRoute` (PR #828, guard test
`src/__tests__/appRouteProtection.test.js`). One app of 13 follows the Suite
unit profile. None uses record sharing.

Report tests today: only the Well Test suite reads a PDF back. The Material
Balance PDF has no test of its content. No test reads the DCA, Fluid
Systems, Simulation, Waterflood or VRR exports for what a reviewer needs.

## 6. Status and honesty defects found on the way

Small, each with an obvious test. The plan pulls them into Step 0e so they
do not wait for their app's turn.

| # | App | Defect | Where |
|---|---|---|---|
| H1 | DCA | "Sync" to NPV and FDP shows success and sends nothing | `U/declineCurve/dcaIntegration.js`, `C/declineCurve/DCAIntegrationPanel.jsx:67-72` |
| H2 | DCA | Fit diagnostics print the per-day Di as "%/yr" | `C/declineCurve/DCAFitDiagnostics.jsx:194` |
| H3 | DCA | XLSX "EUR" and "Remaining Reserves" are the same field | `U/declineCurve/dcaExport.js:43-44` |
| H4 | Material Balance | The report can pair edited inputs with a stored older run | `src/contexts/MaterialBalanceStudioContext.jsx:95-100` |
| H5 | Material Balance | A correlation-built PVT table is reported as `lab_table`; the prefill ignores the selected correlations | `P/reservoir-balance/lib/fluidStudioPvtPrefill.js:89` |
| H6 | Well Spacing | The JSON names an optimum the screen disclaims; Bo fallback 1.000 printed as "from Standing's correlation" | `U/wellSpacingCalculations.js:266-292, 123-126` |
| H7 | Well Spacing | Private NPV loop | `U/wellSpacingCalculations.js:165-190` |
| H8 | Risked Reserves | "Value per barrel comes from the Petroleum Economics Studio" with no handoff | `RrvWorkstation.jsx:32, 173` |
| H9 | ReservoirCalc Pro | Audit note hard-codes the -0.8 correlation | `ReportGenerator.jsx:295` |
| H10 | Fluid Systems | "Lab tuned" badge is not cleared by a later composition edit (read from code) | `C/fluidstudio/CompositionInput.jsx` |
| H11 | Waterflood | Hall plot axes swapped against the slope it quotes | `C/waterflood/HallPlotPanel.jsx:67-72` |
| H12 | Well Test, Material Balance | A comma decimal is read as a thousands separator | `U/welltest/gaugeImport.js:56`, `C/reservoirbalance/DataHub.jsx:166` |
| H13 | Simulation | "report steps" counts the downsampled series | `C/simstudio/ResultsPanel.jsx:166` |

## 7. Not verified

- No export was run except the Material Balance PDF (hand-made result
  object) and the existing Well Test sample. Page fit and overlap in any
  future report are unknown.
- H10 and the day-first and comma-decimal readings in section 4 come from
  reading the parsers. None was run against a file.
- `masterAppSlugs.json` is a snapshot of 2026-09-30. Production was not
  queried.
- Whether production RLS lets a colleague's Earth Modeling or Rock Physics
  read another user's SCAL project was not checked.
- The Petroleum Economics Studio reader of Forecast Scenario Hub sets was
  found and not read for what provenance it keeps.
