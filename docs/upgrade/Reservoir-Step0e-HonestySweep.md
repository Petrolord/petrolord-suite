# Reservoir round, Step 0e: the honesty sweep

Date: 2026-10-02. Branch `fix/reservoir-honesty-sweep`. One PR, one commit
per defect, each with a test that failed before the fix.

Source: the thirteen status and honesty defects H1 to H13 of
`docs/scope/AppUpgrade-Reservoir-GapMatrix.md` section 6, pulled forward by
`docs/scope/AppUpgrade-Reservoir-PLAN.md` (Step 0e) so they do not wait for
their app's turn. Owner questions 9 and 10 ran on their defaults.

Every defect was checked against the code before it was touched. Twelve
were as described. One (H13) was wider than described. One (H12) is left to
the Step 0a agent by instruction. One adjacent defect was found and fixed
inside H4 (the gas cap ratio never reached a regression run).

## Summary

| # | App | Verified | Fix | Proving test |
|---|---|---|---|---|
| H1 | Decline Curve Analysis | As described | Both sync cards and the placeholder senders deleted; help says there is no direct send | `src/components/declineCurve/__tests__/h1NoFakeSync.test.jsx` |
| H2 | Decline Curve Analysis | As described | One formatter for Di: nominal percent per year, with the effective first-year decline beside it | `src/components/declineCurve/__tests__/h2DeclineBasis.test.jsx` |
| H3 | Decline Curve Analysis | As described, and wider | XLSX writes EUR = produced + remaining; scenarios keep the three volumes apart | `src/utils/declineCurve/__tests__/h3ScenarioWorkbook.test.js` |
| H4 | Material Balance | As described | A stored run is checked against the current inputs; stale runs lose their status words and are not exported | `src/pages/apps/reservoir-balance/lib/__tests__/runStaleness.test.js`, `src/components/reservoirbalance/__tests__/h4StaleRun.test.jsx`, `e2e/material-balance-t1.spec.js` |
| H5 | Material Balance | As described | Prefill follows the selected correlation; the table carries its origin; the report states the source in words | `src/pages/apps/reservoir-balance/lib/__tests__/h5PvtSource.test.js` |
| H6 | Well Spacing | As described | The export and the engine result name no optimum; a fallback Bo is called a fallback | `src/components/wellspacing/__tests__/h6ExportAgreesWithScreen.test.jsx` |
| H7 | Well Spacing | As described | NPV from the canonical `calculateEconomics`; mid-year convention stated | `src/utils/__tests__/h7WellSpacingCanonicalNpv.test.js` |
| H8 | Risked Reserves | As described | The screen says where the value per barrel came from | `src/pages/apps/riskedreserves/__tests__/h8UnitValueSource.test.jsx` |
| H9 | ReservoirCalc Pro | As described | The audit note prints the run's own correlations | `src/pages/apps/ReservoirCalcPro/components/tools/__tests__/h9AuditCorrelationNote.test.js` |
| H10 | Fluid Systems | Reproduced in a test, then fixed | "Lab tuned" holds only while the fluid is the one the tune was fitted on | `src/components/fluidstudio/__tests__/h10LabTunedBadge.test.jsx` |
| H11 | Waterflood | As described; the engine was right, the chart was wrong | Axes swapped to the Hall (1963) convention | `src/components/waterflood/__tests__/h11HallPlotAxes.test.jsx` |
| H12 | Well Test, Material Balance | Not touched here | Left to Step 0a (`src/lib/tabularFile.js`) | none here |
| H13 | Simulation | Wider than described | Worker records the real counts; the screen prints them | `src/components/simstudio/__tests__/h13StepCount.test.jsx`, `worker/sim-worker/tests/test_results_parse.py` |

## H1. DCA: "Sync" to NPV and FDP showed success and sent nothing

**What was true.** `DCAIntegrationPanel.jsx` drew two cards, "NPV &
Economics" and "FDP Accelerator". Pressing one called
`sendForecastToNPVBuilder` or `sendForecastToFDPAccelerator` in
`dcaIntegration.js`, which logged to the console, waited about a second and
returned `{ success: true }`. The call sites passed an empty payload. The
help guide already carried a red warning that said so.

**Fix (owner question 10, default).** The panel, the two senders and the
unused `receiveDataFromReservoirSimulation` mock are deleted. The help
section "Sending a Forecast Downstream" says the app has no direct send yet
and names the two routes that work: the CSV export and Forecast Scenario
Hub. The help guard test pins the new sentence.

**Deferred.** A real sender to Forecast Scenario Hub and Petroleum
Economics Studio, with the basis and source on the payload, is built in the
DCA round.

## H2. DCA: fit diagnostics printed the per-day Di as "%/yr"

**What was true.** The fit holds Di per day. The KPI card printed
`Di x 365 x 100` as "%/yr" and the Diagnostics card, on the same screen,
printed `Di x 100` under the same label: 365 times smaller. The type curve
footer printed the raw per-day number with no unit, the scenario table said
"Di (%)" and the XLSX wrote the per-day value under "Decline Rate (Di)".

**Fix.** `src/utils/declineCurve/declineDisplay.js` is the one place that
formats Di. Every display states "nominal, %/yr". The KPI and Diagnostics
cards add the effective first-year decline (the share of the initial rate
lost in 365 days), read off the engine's own rate function so it holds for
any b. The XLSX has two columns, "Di (nominal, %/yr)" and "Di (nominal,
1/day)".

**Test.** Renders the two cards together and holds their Di text equal
(43.80 for 0.0012 per day), with the old 0.12 as the negative control; holds
the effective decline to the engine rate for b = 0, 0.5 and 1; and fails if
any DCA component formats Di on its own.

## H3. DCA: the XLSX wrote one field as "EUR" and "Remaining Reserves"

**What was true.** `exportScenarioComparison` wrote `forecastResults.eur`
into both columns. Since the T1 fix that key is the remaining volume, so the
EUR column was short by everything already produced. Wider than described:
a saved scenario kept only that one number, so the comparison table on
screen and the scenario list also showed the remaining volume under "EUR",
and the "Economic Limit" column read a key the scenario never saved (it
always wrote 0).

**Fix.** A saved scenario keeps produced, remaining and EUR apart
(`scenarioForecastSnapshot`). The sheet is built by
`buildScenarioSummaryRows`: Cumulative to date, Remaining Reserves, EUR =
produced + remaining, where the remaining volume ends (economic limit or
horizon), and the economic limit from the saved config. The comparison table
has a Remaining and an EUR column; the scenario list says "Remaining". A
scenario saved before the fix prints `n/a` for EUR.

**Test.** A three-year exponential well through the engine fit and
`forecastFromHistory`: EUR minus Remaining equals the produced volume, the
two differ, and the remaining volume is within 5 percent of the closed form.

## H4. Material Balance: edited inputs beside a stored older run

**What was true.** Opening a case loaded the last completed run from
`rb_results`. Nothing checked it against the PVT, aquifer, case conditions
or data, and the Report tab read today's default config beside that result.
The Report tab said "The report always describes a computed result. It does
not show stored numbers", and the left rail said results "always come from
a fresh engine run". Neither was true.

**Fix.** `lib/runStaleness.js` decides, from what is stored:

1. The run's own config row is a snapshot of the PVT, rock and aquifer
   inputs. It is compared field by field with what the next run would send
   (`buildRunConfigInput`, one function for the run and the check).
2. The result echoes the pressures and cumulatives it ran on. They are
   compared with the Data tab.
3. The case conditions and the columns the result does not echo have no
   snapshot. The case row is stamped when one of them is saved, on the
   server's own time line (one millisecond after the latest run start), so
   a browser clock that is minutes off cannot hide or invent an edit.

When stale: a notice with the reason sits above the Run, Plots, Forecast,
Contacts and Report tabs; the Run card says "Earlier result, inputs changed
since" and withholds the validation tier; the History match card withholds
"Converged"; the PDF and the series CSV are not exported
(`exportMbalPdf` throws as well). The report prints the config of the run
it reports. This follows the Well Test rule for a stale auto-fit
(`resolveMatchMethod`). No schema change.

**Found on the way and fixed here.** The engine reads `gas_cap_ratio_m`
and `excluded_timesteps` from the run's config row. The Run tab never
copied either from the default config, so a gas cap ratio typed on the PVT
tab (the field added on 2026-09-11) did not reach a regression run. Both
are now in `buildRunConfigInput`. An oil case with a gas cap and a stated m
will give a different OOIP on its next run, which is the answer the PVT
tab's hint already promised. A run stored before this fix is flagged stale
against a default that states an m.

**Not verified.** Whether production has a trigger that sets
`rb_cases.updated_at` on every update. If it has, renaming a case also
marks the run stale; a new run clears it.

## H5. Material Balance: a correlation-built table reported as `lab_table`

**What was true.** "Prefill from correlations" built the table with
Standing and Beggs-Robinson whatever the PVT tab had selected, the rows
landed in the lab table, and the report printed the raw column value
`lab_table`.

**Fix.** The prefill runs the selected Pb, Rs and Bo correlation and names
every method it used. Where the Fluid Systems engine cannot follow the
selection it says so (it has no Beal-Standing, and it computes Z by Papay
with Sutton pseudo-criticals whatever Z correlation is selected). That
origin is stored with the table under one extra key of the
`pvt_correlations` jsonb, which the engine does not read; the
`pvt_source` check constraint is untouched. `describePvtSource` gives the
report and the PVT tab one sentence: correlations with their names, a table
built from correlations (and whether rows were edited by hand afterwards),
or a table entered on the tab. The selector option is "PVT table".

**Deferred.** The `pvt-1` contract (a real handoff from a saved Fluid
Systems project, with tuning state and range flags) replaces this prefill
in the Material Balance round.

## H6. Well Spacing: the export named an optimum the screen disclaims

**What was true.** The screen says no optimum is nominated. The JSON
carried `optimalSpacing`, "This spacing maximizes NPV at ..." and three
`optimal*` metadata fields. Separately, with oil gravity, gas gravity or
temperature blank, `standingBo` fell back to 1 and the note printed "Bo
1.000 rb/stb, from Standing's correlation".

**Fix.** The engine result and the JSON name no case. Both carry
`NO_OPTIMUM_NOTE`, the sentence the screen shows. `standingBo` returns its
source; the note and the JSON say "fallback" and what that does to the
volumes. The heading "Optimization Results" is "Spacing cases"; the empty
state and the busy label no longer promise an optimal spacing.

## H7. Well Spacing: a private NPV loop

**What was true.** `evaluateSpacing` discounted its own cash flow at year
end with the well cost undiscounted at time zero, against the rule that the
Suite has one screening NPV.

**Fix (owner question 9, default).** Each case builds `calculateEconomics`
inputs for the field (royalties and taxes as the royalty rate, opex of a
part year pro-rated, well cost in the first year) and reads `metrics.npv`.
No discounting is done in the app's file.

**The convention changed, and is labelled.** The plan's default said to
"keep year-end discounting labelled". The canonical engine discounts at
mid-year, so moving onto it means the app is now mid-year. That is what the
screen, the NPV chart, the CSV header, the JSON and the help guide say.

**Before and after on the app's sample ("Load example field"), field NPV in
$MM.**

| Spacing (acres) | Wells | Before | After | Change |
|---|---|---|---|---|
| 20 | 250 | 1,006.3 | 1,174.6 | +16.7 % |
| 40 | 125 | 1,741.1 | 1,885.7 | +8.3 % |
| 80 | 62 | 2,095.0 | 2,226.8 | +6.3 % |
| 160 | 31 | 2,278.8 | 2,404.9 | +5.5 % |

The order of the cases is unchanged. Volumes, capex, cost per barrel and
life do not move. The test holds each row to `calculateEconomics`, to a
closed form at mid-year, and carries the year-end figure as the negative
control.

## H8. Risked Reserves: value per barrel "comes from the Petroleum Economics Studio"

**What was true.** The readout and the `$/bbl` tooltip said so. No handoff
from that app exists. The number is the starting default (8 $/bbl), a value
sent with a prospect valued in ReservoirCalc Pro (RCP-U2-012), or typed.

**Fix.** `unitValueSource` reads which of the three it is for the selected
prospect, and the readout prints it with "Nothing is received from the
Petroleum Economics Studio". A prospect keeps what ReservoirCalc Pro sent,
so a later edit is told apart. Tooltip and help guide say the same.

**Deferred.** A real value per barrel by field size from the economics
engine is in the Risked Reserves round, with its saved-valuation table
(owner question 3).

## H9. ReservoirCalc Pro: the audit note hard-coded the -0.8 correlation

**Fix.** `correlationSentence(meta)` prints the run's own record
(`results.meta.correlations`, written by the Monte Carlo engine): the pairs
and their values, "none", or that the run has no record. One builder serves
the reviewer block and the audit note. The test runs the engine with a user
correlation, with none and with the default.

## H10. Fluid Systems: "Lab tuned" after a later composition edit

**Reproduced first.** On the real components and engine: tune to a measured
saturation pressure, then change methane from 40 to 45 mol%. Every card
kept the "Lab tuned" badge while the tuned C7+ properties were applied to a
fluid they were never fitted to.

**Fix.** The applied knobs travel with a record of what the regression
consumed (feed, C7+ description, lab values, flash conditions, enabled
separator stages). `tuningStatus()` compares it with the current inputs.
"Lab tuned" shows only on a match. Otherwise the cards show "Tuned on
earlier inputs", and the Lab tuning card says the properties are still
applied and to tune again or reset. A tune saved before the record existed
shows "Tuned, not confirmed" until it is run again. The tuned properties
are kept, as Well Test keeps a working match and withdraws the claim.

**Deferred.** The handoff to Well Test and Line Sizing does not carry the
tuning status. It travels with the `pvt-1` contract in the Fluid Systems
round.

## H11. Waterflood: Hall plot axes against the slope quoted

**Checked against Hall (1963).** The cumulative pressure-time integral goes
on y and cumulative water injected on x; the slope is p/q and rises when
the well plugs. The engine (`computeHallPlots`) computes exactly that. On a
known case (1,000 bbl/d; 2,000 psi for 15 days, then 3,000 psi) it gives 2
and 3 psi-day/bbl, a ratio of 1.5 and the alert "declining injectivity".
The engine is not changed.

**What was wrong.** The chart drew the integral on x and injection on y, so
a plugging well bent down under a caption that said a steepening slope
means declining injectivity, beside a legend slope that went up.

**Fix.** Axes swapped (`hallPlotPoints`); the legend states the slope with
its unit and which window it is; the caption names the axes. The test holds
the drawn points to the engine slope and carries the old mapping as the
negative control (slope 1/3, flattening).

**Deferred to the Waterflood round.** The baseline and recent windows are
not drawn and there is no fitted line (gap matrix RL6); the pressure column
accepts wellhead or bottomhole pressure with no basis stated (RL7).

## H12. Comma decimals read as thousands separators

Not fixed here, by instruction. The Well Test gauge import
(`src/utils/welltest/gaugeImport.js`) and the Material Balance data hub
(`src/components/reservoirbalance/DataHub.jsx`) move onto the shared parser
the Step 0a agent is writing in `src/lib/tabularFile.js`. This PR does not
touch either file.

## H13. Simulation: "report steps" counted the downsampled series

**Wider than described.** The Results tab printed `summary.days.length`.
That series is thinned by the worker to at most 5,000 rows, as the survey
said. Its rows are also simulator time steps and not report steps: the SPE1
reference has 123 rows for 120 report steps. And the worker stored the same
thinned length in `sim_runs.report_steps`.

**Fix.** The worker's summary document carries `steps` (report steps, time
steps before thinning, stride, points), and `sim_runs.report_steps` holds
the report steps. The Results tab prints "120 report steps, 123 simulator
time steps", and for a thinned run how many time steps one plotted point
stands for. A summary written by the worker build running today has no
`steps`; the screen then says what it holds without claiming a count it
cannot know. Run rows are labelled "Steps" with a note on what an older run
stored.

**Owner action.** The worker change takes effect when the simulation worker
is redeployed (`worker/sim-worker/deploy.sh`). Until then the screen takes
the older-summary path, which is already honest.

**Tests.** jest for the screen. The worker tests were run in a scratch
virtualenv with `resdata` against the SPE1 fixture (6 passed); they are not
part of CI.

**Deferred to the Simulation round.** The CSV is the thinned series and has
no units row.

## What stays open

| Item | Where it goes |
|---|---|
| H12 comma decimals | Step 0a, `src/lib/tabularFile.js` |
| A real DCA sender | DCA round |
| `pvt-1` handoff replacing the Material Balance prefill, and tuning status on the PVT handoff | Fluid Systems and Material Balance rounds |
| Value per barrel from the economics engine | Risked Reserves round |
| Hall plot windows and fitted line; pressure basis | Waterflood round |
| Simulation CSV units and thinning note; worker redeploy | Simulation round; owner |
| Whether production stamps `rb_cases.updated_at` by trigger | Material Balance round |
