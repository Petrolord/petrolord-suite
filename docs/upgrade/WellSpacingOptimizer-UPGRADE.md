# Well Spacing Optimizer: upgrade (Reservoir round, app 12)

Branch `feat/wsp-u1` (the name `feat/ws-u1` belongs to the Wellsite
round, PR #847), worktree `/root/wt-res-ws`, started 2026-10-04 at
origin/main f81ef8d21. Plan: `docs/scope/AppUpgrade-Reservoir-PLAN.md`
row 12. Lens: PL1 to PL12 (`docs/scope/AppUpgrade-BestPractices.md`) and
RL1 to RL12 (`docs/scope/AppUpgrade-Reservoir-FeedbackLessons.md`).
Finding IDs `WS-U1-nnn`, severities S1 (wrong answer a user would trust)
to S4 (cosmetic).

Route `/dashboard/apps/reservoir/well-spacing-optimizer` (+ `/help`), page
`src/pages/apps/WellSpacingOptimizer.jsx`, engine
`src/utils/wellSpacingCalculations.js` with the new
`src/utils/wellspacing/` (drainage, units, model, intakes, cross-checks,
report), context `src/contexts/WellSpacingContext.jsx`, harness
`/dev/studio/well-spacing`. The engine is not in the canonical engines repo
(it lives in the Suite), so there is **no engines PR**. The NPV is the
canonical `calculateEconomics` (vendored `packages/engines`), unchanged.

## 1. What the app is, read before the checks

A capital and economics comparison of spacing cases at a stated recovery
factor. Each well drains its spacing area at that RF; one exponential
decline per well is anchored on the EUR; NPV comes from the Suite screening
engine. The brief expected drainage radius, radius of investigation,
interference and pattern geometry formulas: **none existed**. The app
asked for a pressure and a flood pattern that entered no equation
(WS-U1-004). This round adds them as diagnostics beside each case, gated
against published worked values, and leaves the EUR and NPV model as it
was (its no-interference reading is stated on screen and in the report).
Interference that changes recovery is Step 2 (U2-002).

## 2. Validation sources (PL1), every formula through the engine

`src/utils/wellspacing/__tests__/wellSpacingValidation.test.js` (25 tests).
Negative control on the engine: dividing the 948 constant by 24 (a
days-based time) fails 4 of them.

| Formula | Source | Published value held | Units pinned and negative control |
|---|---|---|---|
| Drainage radius re = sqrt(43,560 A / pi) | Ahmed and McKinney, *Advanced Reservoir Engineering* (Gulf, 2005), Ch. 1 (publisher's public sample chapter), Ex. 1.5 and 1.6 | 40 acres: 745 ft | area without 43,560 is 209 times short |
| Distance between wells, square sqrt(A); staggered sqrt(2A / sqrt 3) | US Public Land Survey (quarter-quarter section 1,320 ft; section 5,280 ft); hexagon area identity | 40 acres 1,320 ft; 640 acres 5,280 ft | the hexagon closes on A to 1e-6 |
| Pseudosteady rate q = k h (pbar - pwf) / (141.2 B mu (0.5 ln(2.2458 A / (CA rw^2)) + s)) | Ahmed and McKinney Eq. 1.2.124 with the skin of 1.2.125; Ex. 1.18 | 416 STB/d (40-acre square, CA 30.8828) | k typed in darcies (0.05) is 1,000 times low |
| Shape factors and PSS onset tDA | Earlougher (1977) Table C.1, reprinted as Ahmed Table 1.4 | square CA 30.8828, hexagon 31.6, exact from tDA 0.1 | tDA = 0.0002637 k t / (phi mu ct A) closes to 1e-12; a days-based constant is 24 times off |
| Line source (offset-well drop) dp = 70.6 q mu B / (k h) E1(948 phi mu ct r^2 / (k t)) | Ahmed and McKinney Eq. 1.2.134, Ex. 1.21 (three interfering wells) | arguments 1.5168 and 4.645; coefficients 33.888 and 42.36 psi | t in days moves the argument 24 times |
| E1 | Abramowitz and Stegun, Table 5.1 | E1(1) 0.219384, E1(1.5) 0.100020, E1(5) 0.001148 | |
| Radius of investigation ri = sqrt(k t / (948 phi mu ct)) | Lee, *Well Testing* (SPE, 1982) | definition: the Ei argument is 1 at ri (identity to 1e-12) | |
| Standing Bo | Standing (1947), as T1 computed it | 1.2845 RB/STB at 500 scf/STB, 35 API, 0.75, 180 F | |
| EUR and the decline | Arps (1945) exponential, Np = (qi - q) / D nominal | EUR 289.2 Mbbl at 20 acres (T1); closes on (qi - qlim) / Dn to 1e-9 | an effective decline read as nominal moves the EUR by more than 15 Mbbl |
| NPV | `calculateEconomics` (canonical) | the H7 gate (Step 0e) still holds the row to the engine and a mid-year closed form | unchanged |

A finding about the reference itself: Ahmed Ex. 1.21 prints E1(1.5168) as
0.13 and E1(4.645) as 1.84e-3; Table 5.1 brackets the true values at 0.0976
and 1.745e-3. The arguments and coefficients match the book exactly; the
drop follows the tabulated function, so the well 2 drop is 3.31 psi where
the book prints 4.41 (well 3: 0.074 against 0.08). The gate records this.

## 3. Economics (canonical modules)

No private NPV or Monte Carlo remains. The private yearly loop (H7) was
replaced by `calculateEconomics` in Step 0e (PR #856); before and after on
the example field, field NPV in US$ million: 20 acres 1,006.3 to 1,174.6;
40 acres 1,741.1 to 1,885.7; 80 acres 2,095.0 to 2,226.8; 160 acres
2,278.8 to 2,404.9 (now 1,174.8, 1,885.8, 2,226.8, 2,404.9 with the
365.25-day year of DCA-U1-010). This round changes no economics number. It
prints what the same canonical run already returned: revenue, royalty,
opex and capex closing on the undiscounted net cash, payback with its
status word, and the incremental economics (differences of canonical NPVs,
no discounting of its own). The app has no Monte Carlo.

## 4. Step 1 checks

Browser: Playwright (one worker) on the private harness (port 8640), signed
out, 1366x768, 1440x900 and 390 wide, light and dark;
`e2e/well-spacing-upgrade.spec.js` (10 tests) and the T1 spec, all green
locally. Code: every module of the app read.

| Check | Result | Evidence |
|---|---|---|
| PL1 labels and textbook | Fixed: "$M" headed US$ million (001); "Royalties/Taxes" is one royalty on gross revenue (016); decline basis named (009); every formula gated (section 2) | `wellSpacingValidation.test.js` |
| PL2 hostile files | NA: no import door (typed inputs and intakes by id) | |
| PL3 units | Fixed (008): Suite unit profile, oilfield or SI at every door, axis, table and CSV; the engine in oilfield; money US$ in both | `wellSpacingUnits.test.jsx` pins 14 conversions; e2e PL3 |
| PL4 no claim without the event | Fixed (006): the table followed no edit until Calculate, and the JSON paired new inputs with old results; now one pure function of the inputs, and a list of what is missing in place of numbers | `wellSpacingSharing.test.jsx` "the cases follow every edit"; e2e "honest status" |
| PL5 real saved state | Fixed (003): saved projects, record sharing, `.pld` family, a saved fixture of this release; the table is a migration file NOT APPLIED; earlier flood-pattern values map onto a layout | sharing, portability, `wsSavedFixture.test.js` |
| PL6 real browser | Pass after 012 (the mark sat over the last X ticks): no page errors, no sideways scroll, four charts white with the mark in dark | e2e PL6 x6 with the mark-above-ticks geometry; screenshots under `test-results/well-spacing-upgrade/` |
| PL7 report | Fixed (002): the report on the kit | `wellSpacingReport.test.js` |
| PL8 practitioner's day | Walked: bring k and skin from a test, PVT from Fluid, OOIP from MBAL, a decline EUR, the wells on the map; compare cases; hold the plan rate against deliverability; sign the PDF. Gaps to Step 2 (schedule, interference, sensitivity) | section 7 |
| PL9 the chain | Fixed (007): five sources by id, cards "As received", "Edited after intake", "Source changed since" | e2e PL9 chain |
| PL10 real scale | Pass: at most 2,000 cases, closed form; the sample's 15 cases recompute in milliseconds on every key | |
| PL11 typable inputs | Fixed (014): shared draft hook; "18." typed in SI stays; blank stores blank | `wellSpacingUnits.test.jsx`, e2e PL3; unit-draft guard at zero |
| PL12 house standards | Pass: no em dash, `EMPTY_VALUE`, white chart theme and ChartLogo, `ProtectedAppRoute` (unchanged) | e2e em-dash check; help pins |
| RL1 inputs on the page | Fixed: every input with unit, source and what it enters ([case], [diagnostics], [cross-check], [record]); the completeness guard with a negative control | report test |
| RL2 composites | Fixed (005): Bo printed with its correlation or its source; EUR's parts in the methods table; the initial rate each case assumes is printed | report test |
| RL3 lumped results split | Fixed (010, 011): NPV by revenue, royalty, opex, capex closing on net cash; incremental economics per added well | report test closure |
| RL4 identification | Fixed: company (organisation by default), field, licence, reservoir, wells, data date, analyst, analysis type, model, economics engine, build, units | report test |
| RL5 data and operations | NA in the sense of RL5 (no history); the case table and its duration cut-off marks stand in | |
| RL6 plots | Fixed: four figures (EUR per well, NPV against wells, plan against deliverable rate, the registry map), each drawn or replaced by its "does not apply" line | `expectFigureDrawn`, `pointCounts` |
| RL7 basis | Fixed: US$ MM, effective annual decline, mid-year discounting, psia, oilfield or SI on every head | report and units tests |
| RL8 strengths and status | Fixed (004, 006): no optimum nominated (kept), drainage diagnostics as a cross-check of the economics, flags when the plan rate exceeds deliverability or PSS takes over a year, "edited after intake" | report test RL8 |
| RL9 limits | Fixed: six assumptions and the flags | report test |
| RL10 import doors | NA: no file import | |
| RL11 intakes and senders | Fixed (007): pvt-1, wta-1, mbal-1, dca-forecast-1 by id; registry wells; no downstream sender yet (U2-004) | e2e chain, `.pld` refs |
| RL12 one model | Fixed: the screen tables are the report model's rows; the JSON can no longer pair stale results | report and sharing tests |

## 5. Findings

| ID | Sev | Check | Finding | Fix and proving test |
|---|---|---|---|---|
| WS-U1-001 | S2 | RL7, PL1 | NPV and capex were headed "$M" over values in US$ million. In oilfield usage M is a thousand, so the heading read 1,000 times low; the CSV said $MM | "US$ MM" on every head, in the report and the help. `wellSpacingReport.test.js` (row 40 acres 1,885.8 under "NPV (US$ MM)"), e2e "honest status" |
| WS-U1-002 | S2 | RL1, RL4, RL6, PL7 | No report | The report on the kit, 7 pages on the chain case. Goldens and read-back |
| WS-U1-003 | S2 | PL5 | Nothing saved; a reload lost the study | `saved_well_spacing_projects` migration file (NOT APPLIED), context with record sharing and check-out, `.pld` family. `wellSpacingSharing.test.jsx`, `wellSpacingPortability.test.js` |
| WS-U1-004 | S2 | RL8 | Pressure and a flood pattern (5-spot, 7-spot, line drive) were asked for and entered no equation | Pressure enters the deliverable rate and the pvt-1 read; the pattern is replaced by a layout that sets the distance between wells (saved 7-spot maps to staggered). Validation and sharing tests |
| WS-U1-005 | S2 | PL1, RL2 | The initial rate each case assumes was computed and never shown; it grows with the area (139 to 1,039 STB/d on the example, 7.5 times), which no reservoir does at a fixed kh | Printed per case and held against the pseudosteady deliverable rate with a flag. "the deliverability check" tests |
| WS-U1-006 | S2 | PL4, RL12 | Results stayed on screen after an input changed until Calculate; the JSON then paired the new inputs with the old results | One pure function of the inputs, recomputed on each edit; a list of what is missing in place of numbers. Sharing test and e2e |
| WS-U1-007 | S2 | RL11, PL9 | No intake from any app | pvt-1, wta-1, mbal-1, dca-forecast-1 by id, registry wells; cards. e2e chain |
| WS-U1-008 | S2 | PL3 | Oilfield only | Suite unit profile; units test |
| WS-U1-009 | S3 | RL7 | "Well Decline Rate (%)": basis only in the help | "% per year, effective" on the field, the report and the JSON |
| WS-U1-010 | S3 | RL3 | NPV not split | Economics by part with the closure |
| WS-U1-011 | S3 | PL8 | No incremental economics | Added wells, capex, oil and NPV per added well |
| WS-U1-012 | S4 | PL6 | ChartLogo overlapped the last X tick labels on all three charts | The mark inside the plot area; e2e geometry |
| WS-U1-013 | S3 | RL1 | No sources | Source beside every input; `InputSourceControl` |
| WS-U1-014 | S4 | PL11 | `type="number"` inputs with no unit draft | Shared draft hook |
| WS-U1-015 | S3 | RL8 | No cross-check | In place against Material Balance, EUR-implied area against the spacing range, the spacing the registry wells already have |
| WS-U1-016 | S3 | PL1 | "Royalties/Taxes" read as tax; it is one royalty on gross revenue with no income tax | Label and limits |
| WS-U1-017 | S4 | RL9 | Standing's Bo is the bubble-point value; above it Bo is slightly overstated | Stated in the limits; a Bo from Fluid at the reservoir pressure replaces it. Open as stated |
| WS-U1-018 | S4 | PL12 | The OpenStreetMap picker sets coordinates that enter nothing | Labelled "for the record; enters no equation"; kept |

No S1. Totals: 18 findings, 16 fixed, 2 kept and stated (017, 018).

## 6. Gap matrix corrections

- RL12 graded F for H6 and H7: both were closed in Step 0e before this
  round; the matrix row predates them.
- RL7 graded Pa for "$M on screen": a heading that reads 1,000 times low is
  S2 (WS-U1-001).
- Missed: the stale-results defect (006) and the mark over the axis (012).
- The plan says "no STATUS doc exists": `docs/scope/WellSpacingOptimizer-STATUS.md`
  exists (written in Step 0e).

## 7. The report

`Well Spacing Report` on the kit: identification (company, field, licence,
reservoir, wells, data date, analyst, analysis type, model, economics
engine, build, display units); the case table (spacing, wells, distance
between wells, EUR and produced per well, field recovery, capex, NPV, cost
per barrel, initial rate) with the no-optimum sentence and the discounting
convention; economics by part; incremental economics; inputs with unit,
source and what each enters; drainage geometry, timing and deliverability;
cross-checks; methods and references; limits and flags; four figures (EUR
and produced per well against spacing; field NPV and capex against the
number of wells; plan initial rate and deliverable rate; the registry map,
or its "does not apply" line). Sample: `/root/ws-report-sample.pdf`.

## 8. Intakes and senders

| Contract | From | Taken | Used for |
|---|---|---|---|
| pvt-1 | Fluid Systems Studio, by id | Bo and mu_o read from the table at the average pressure, Rsb, API, gas gravity, temperature | Bo in the EUR; mu in the diagnostics |
| wta-1 | Well Test Analysis Studio, by id | k, total skin (with its parts), average pressure | diagnostics |
| mbal-1 | Material Balance Studio, by id | OOIP | in-place cross-check |
| dca-forecast-1 | Decline Curve Analysis, by project and well | oil EUR | EUR-implied drainage area |
| geo_wells | wells registry | names, surface x/y, unit and CRS (mixed units or CRS refused) | map and the existing spacing |
| rf-1 | Recovery Factor Estimator | not on main yet | Step 2 (U2-005) |

Sender: none yet; listed as U2-004 (`ws-case-1` profile to Forecast
Scenario Hub and Petroleum Economics Studio).

## 9. Migration (NOT APPLIED)

`supabase/migrations/20261005010000_saved_well_spacing_projects.sql`: one
new product table under the approved sharing shape, the same as
`saved_eor_screening_projects`; logged in MIGRATIONS.md as not applied. Not
dry-run against a database by this agent. Until applied the page says
saving is not switched on.

## 10. Where validation is weaker than asked

- The radius of investigation and the interference and pseudosteady times
  are held by definition and by Table 1.4, with no published worked time
  value; the line source has published arguments and coefficients, and its
  printed drops carry the book's own E1 reading error.
- The staggered-grid distance is a geometric identity, not a published
  table.
- The exponential EUR is held by its closed form and the T1 number, not a
  textbook worked example.
- Standing's Bo is held at the T1 hand calculation.

## 11. Step 2 analysis

### 2a. Competitor parity (public product documentation; not run hands-on)

| Tool | What it does for spacing that this app does not |
|---|---|
| Petrel (well placement, field development planning with Eclipse/Intersect) | Spacing and placement optimised on a simulation model; recovery responds to spacing |
| tNavigator | Field development planning on the simulator, well placement optimisation, uncertainty runs |
| ResFrac, Novi Labs | Unconventional lateral spacing: coupled fracture and reservoir simulation (ResFrac), EUR against spacing learned from public well data (Novi) |
| whitson+ | Type wells per spacing, parent and child degradation, PVT tied to the forecast |
| IHS Harmony | Type wells and decline per well group; interference read from production |
| PHDwin, ARIES | Drilling schedules, price decks, tax and PSC terms, incremental economics and reserves categories |
| KAPPA Saphir and Topaze | Interference test design and analysis between wells |

### 2b. Deferred backlog

From the gap matrix and STATUS: interference model; intake from DCA and
Recovery Factor (DCA done here, RF waits for rf-1).

### 2c. Suite integration

Senders to Forecast Scenario Hub and Petroleum Economics Studio; rf-1;
wells registry for a proposed grid; Reservoir Simulation Studio for a
spacing run.

### Ranked backlog

| ID | Item | Size | Batch |
|---|---|---|---|
| WS-U2-001 | Deliverability-limited profile: each case produces at min(plan rate, pseudosteady rate) until the decline takes over; the drainage check enters the economics (numbers move for wide spacing) | M | A |
| WS-U2-002 | Recovery that responds to spacing: a cited RF against spacing relation (user-calibrated, from analogs, DCA type wells or simulation), with interference timing feeding it | L | B |
| WS-U2-003 | Drilling schedule: wells per year, capex and on-stream timing through `calculateEconomics` arrays | M | A |
| WS-U2-004 | Sender `ws-case-1`: the chosen case's field profile to Forecast Scenario Hub and Petroleum Economics Studio, read by id | S | A |
| WS-U2-005 | rf-1 intake for the recovery factor with its method, once RF U2 merges | S | A |
| WS-U2-006 | Measurable interference per spacing: the line-source drop at the neighbour after a stated time, against a gauge resolution | S | A |
| WS-U2-007 | Sensitivity tornado per case through the canonical `runSensitivityAnalysis` | M | B |
| WS-U2-008 | Uncertainty on RF, area and price through `src/lib/monteCarlo.js` and `calculateEconomics` (P90 to P10 NPV per spacing) | M | B |
| WS-U2-009 | Empirical EUR against spacing from DCA forecasts of many wells and their registry spacing (the type-well view of Harmony and whitson+) | M | B |
| WS-U2-010 | Fiscal terms: income tax and PSC through `calculateEconomics` (TaxRoyalty taxRate, PSC) | S | B |
| WS-U2-011 | Proposed grid on the map over the registry wells and a field outline (area from the polygon) | M | B |
| WS-U2-012 | Economics-by-part and drainage tables to XLSX | S | C |
| WS-U2-013 | Gas reservoirs (Bg, gas deliverability) | M | C |
| WS-U2-014 | Horizontal and unconventional lateral spacing (SRV, parent and child) | L | C |
| WS-U2-015 | Pressure datum and gauge or absolute stated on the drainage pressures | S | C |

Batch A: 001, 003, 004, 005, 006. Batch B: 002, 007, 008, 009, 010, 011.
Batch C: 012 to 015.

### Owner questions, with the default the programme takes

| # | Question | Recommended default |
|---|---|---|
| 1 | U2-001 makes the deliverability check change NPV for wide spacing. Do it? | Yes, on by default with the before and after printed on the sample, and a switch back to the unlimited decline for comparison |
| 2 | U2-002 needs a source for recovery against spacing. Which? | User-calibrated from analogs, DCA type wells or a simulation run; no built-in curve without a citation |
| 3 | Apply `20261005010000_saved_well_spacing_projects.sql`? | Yes, staging first, same shape as the EOR table; the second engineer only if a policy differs |
| 4 | Drilling schedule default | All wells in year 1 stays the default; a schedule is optional and printed |
| 5 | Unconventional lateral spacing in this app? | No; a separate tool if the market asks (Batch C) |
| 6 | Downstream sender target | Forecast Scenario Hub and Petroleum Economics Studio, as a profile contract like `wf-forecast-1` |
