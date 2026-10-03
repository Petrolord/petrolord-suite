# Material Balance Studio: comprehensive upgrade

App #2 of the Reservoir round of the upgrade programme
(`docs/scope/AppUpgrade-Reservoir-PLAN.md`). Step 1 (the practitioner lens
PL1 to PL12 of `docs/scope/AppUpgrade-BestPractices.md` and the reviewer lens
RL1 to RL12 of `docs/scope/AppUpgrade-Reservoir-FeedbackLessons.md`) was run
and fixed on 2026-10-02 on branch `feat/mbal-u1`. Step 2 (advancement
review) is analysis only; batches are chosen by the programme lead before
anything is built.

- Route: `/dashboard/apps/reservoir/reservoir-balance` and its aliases (ProtectedAppRoute, slug `reservoir-balance`).
- Harness: `/dev/material-balance-studio`. It now seeds three published cases (Ahmed Example 11-3, oil depletion; Dake Exercise 9.2, oil with a Carter-Tracy aquifer; Pletcher SPE 75354, gas with a pot aquifer), three saved Fluid Systems Studio projects, one case a colleague shared, and runs the canonical engine in the browser through the edge function's own row mapping (`harness/sampleCases.js`, `harness/engineStandIn.js`). Session storage key `mbal.harness.extra` adds rows a test brings (a case as an earlier release stored it).
- Earlier cycles: Phases 1 to 5 (2026-05), MB1 to MB7 (2026-07-18), the drive index and sanity guard series (engines #165 to #170, 2026-09-11), T1 (2026-09-26), design system 1A, the honesty sweep H4 and H5 (2026-10-02). Their gates hold.
- Carried in: the gap matrix row 4.3 (graded from code reading and one hand-made PDF), the Report Kit and input provenance of Step 0, the unit families and the shared typed table reader of Step 0a, the `pvt-1` contract of the Fluid Systems round (#859), the Reservoir sharing migration (applied 2026-10-02, #858).
- **Engine math is unchanged.** No file of the engines repo was touched and no engines PR exists. One S1 defect was found in how the engine is called (MBAL-U1-003) and fixed in the row mapping, validated against Dake Exercise 9.2.
- **One deploy is owed by the owner:** `supabase functions deploy calculate-mbal`. Until then production keeps the old mapping: the history match of a case whose aquifer flag was never set is wrong (003), and results carry no validation tier, PVT values or dates in `plot_data` (the report then prints n/a for them and takes the tier from the matrix).

## What changed, in eight lines

1. **The report.** Rebuilt on the shared Report Kit: identification, every input with unit and source (guarded against the engine input object), the pressure datum as stated, the data used with the timesteps left out and why, the regression statement, the in-place volume by each method, drive indices closing on 1 with the convention named, the expansion terms, the PVT the engine used, the limits, and seven figures drawn from the screen series. 10 pages for the oil sample, 8 for the gas sample.
2. **One model.** The Plots tab, the Report tab preview, the PDF and the series CSV are built from the same series and plot models (`lib/mbalSeries.js`, `lib/plotModels.js`, `lib/reportModel.js`).
3. **Only what happened is claimed.** A run carries a snapshot of what it was made on. An edited input withdraws the result and the report; a report-only edit does not; putting the input back restores it.
4. **Units.** The Suite unit profile at every door, table, plot axis, the CSV and the report, with the bases named (psia or kPa abs, STB or sm3, RB or rm3).
5. **The import door.** Production data is read by the shared typed reader: columns by name in any order, the unit from the header or chosen at the door, gauge pressure, decimal commas, day-first dates asked and never guessed, and a read-back of what was left out.
6. **PVT from Fluid Systems Studio** through `pvt-1`, with the project, the method of every property, the basis and the range flags printed as the source.
7. **Saved state.** A `.pld` family for the five `rb_*` tables with ids remapped; a backfill file for the one live object that was in no migration; record sharing for viewing.
8. **Defects found on the way:** one S1 and eight S2, listed below.

## Evidence kit made for this app

| Kit | Where | What it holds |
|---|---|---|
| The report, read back from the PDF | `src/components/reservoirbalance/__tests__/mbalReportU1.test.jsx` (47) on `lib/__tests__/mbalTestKit.js` | Four goldens (`__fixtures__/reportGolden/`: oil depletion, oil with aquifer and study record, gas pot, oil history match in SI). RL1 completeness against `buildEngineInputs` for four engine paths, with its negative control. RL2 and RL3 closures. RL4 header. RL5 data table. RL6 captions, point counts against the screen series, `expectFigureDrawn`, the fitted line against a regression of the plotted points. RL7 basis lexicon and SI known values. RL8 statement, cross-check, stale refusal, tier. RL9 limits. RL11 PVT provenance and table coverage. RL12 the CSV. |
| The row mapping the edge function and the harness share | `lib/__tests__/mbalRunMapping.test.js` (11) | MBAL-U1-003 with its negative control (535 against 312 MMSTB); only five correlation keys reach the engine; injection handed over and changing nothing; what is stored with a result. |
| Units | `lib/__tests__/mbalUnits.test.js` (11 blocks, 22 known values) | Every conversion held to a known value from the definition of the unit, and a negative control showing a round trip cannot see a wrong factor. |
| The import door | `lib/__tests__/productionImport.test.js` (19) and `e2e/fixtures/material-balance/hostile/` (12 files) | The same history in twelve shapes against its oilfield twin; refusals and their wording; a known value for every door unit. |
| PVT intake | `lib/__tests__/pvtIntake.test.js` (16) | The block written by Fluid Systems Studio's own writer; Bg from RB/scf to RB/Mscf; a metric block; the gate of the contract; a table that does not cover the case refused; the provenance sentence and rows. |
| Inputs and tabs | `src/components/reservoirbalance/__tests__/mbalInputsU1.test.jsx` (12) | The Carter-Tracy save (005), the case flag (003), the PVT tab of a case with PVT on its rows (011) with its negative control, the Screening example label (022), key by key typing, an empty box. |
| The stale rule | `lib/__tests__/runStaleness.test.js` (9), `__tests__/h4StaleRun.test.jsx` | Snapshot against case and data digest; a rename does not withdraw; a data edit does. |
| Saved state | `__tests__/mbalSavedCase.test.js` (4) on `e2e/fixtures/material-balance/saved/case-2026-09-before-u1.json` | A case as the September release stored it opens, is named an earlier run, and is whole after one run. |
| Packages | `src/lib/portability/__tests__/materialBalanceFamily.test.js` (5) | Round trip with every id remapped, the sharing state left behind, the run current on arrival, the Fluid project id followed or cleared, a run without its config refused. |
| Record sharing | `__tests__/mbalSharing.test.jsx` (9) | The write guard on all eleven write functions of `lib/api.js` with no call reaching the database, and its release; own and shared lists; read-only open; share and unshare; Save a copy. |
| Kit additions | `src/lib/reportKit/__tests__/reportKitStackedBars.test.js` (12) | Stacked bars, the calendar axis, the annotation corner, marker size, read back from the file. |
| Browser | `e2e/material-balance-upgrade.spec.js` (20), `e2e/material-balance-t1.spec.js` | Three viewports in both themes; the PDF downloaded and read with pdftotext and pdfinfo, oil and gas, oilfield and metric; hostile files; the stale run; the unit switch with key by key typing; the `pvt-1` intake and its two refusals; the saved case; sharing. |

## Step 1: the twenty-four checks

Grades: P pass, Pa partial, F fail. "Was" is the gap matrix grade for RL and
the state found here for PL.

| Check | Was | Now | Findings | Notes |
|---|---|---|---|---|
| PL1 Labels mean the textbook | Failed | Fixed, one open | 002, 003, 008, 015 | Quantity table below. Injection is open (008). |
| PL2 Hostile files | Failed | Fixed | 006, 029 | Twelve files, jest and e2e. |
| PL3 Units, datums, frames | Failed | Fixed | 013, 014 | Oilfield only before, and no datum anywhere. The datum is a stated input; no correction is applied and the report says so. |
| PL4 No claim without the event | Partial (H4 fixed by the sweep) | Fixed | 004, 007, 009, 022 | The sweep's rule rested on a time stamp the database does not keep; see 004. |
| PL5 Real saved state | Failed (no fixture) | Pass, with a fixture | 017, 024 | September case fixture; `.pld` family; backfill file. |
| PL6 Real browser | Passed with gaps | Pass | 025, 026, 027 | Three viewports, both themes, charts on white with the mark, no page error, no sideways scroll. |
| PL7 Report a reviewer can sign | Failed | Fixed | 001 | See RL1 to RL12. |
| PL8 Practitioner's day | Gaps recorded | Gaps recorded | 011, 020 and Step 2 | Persona walks below. |
| PL9 The chain | Partial | Fixed inward, open outward | 016, 021, 028 | Fluid and Well Test intakes carry provenance. Nothing is sent out of the app yet (Step 2). |
| PL10 Real scale | Not measured | Pass | | Twenty years of monthly surveys (241 rows), measured in jest on the studio box: the door reads the file in about 25 ms, the engine regression takes about 30 ms, the PDF about 2.4 s and 24 pages (every timestep is printed). The same file is read at the door in the browser (e2e). No customer laptop was used. |
| PL11 Inputs a person can type | Failed | Fixed | 007, 011 | `UnitField`: "2.", "-" and an empty box stay as typed; a cleared field stays cleared. |
| PL12 House standards | Partial | Fixed | 025 | `EMPTY_VALUE`, white chart theme with ChartLogo, no em dash in copy, route protected. |
| RL1 Inputs with unit and source | F | P | 001, 005, 007 | Guard: every key handed to the engine has a row. Defaults print as assumptions. |
| RL2 Composites show components | F | P | 001 | F, Eo, Eg, Efw, Et and We per timestep, closing on Et. |
| RL3 Lumped results split | Pa | P | 001, 015 | Four indices, the energy term of each, the sum, the denominator, and the identity the sum obeys. |
| RL4 Identification | Pa | P | 001 | Company, field, licence, reservoir, zone, analyst, data dates, analysis type, units, engine run, build. |
| RL5 Data and operations summary | Pa | P | 001, 008 | One row per timestep with date, volumes, influx and why a point is out of the fit; injection printed and named as left out. |
| RL6 Every result has its plot | F | P | 001, 002 | Seven figures listed; those that do not apply say why. |
| RL7 The basis is named | F | P | 013, 014, 015 | Absolute pressure, datum and reference, STB against RB, the drive index denominator. |
| RL8 Strengths kept, claims earned | Pa | P | 004, 009 | Regression statement, confidence intervals, cross-check table, tier with its benchmark; stale rule in both directions. |
| RL9 Limits printed | Pa | P | 001, 012 | Tank model, aquifer model, regression, injection, datum; published range of each correlation in use; flags. |
| RL10 Import doors | Pa | P | 006 | |
| RL11 Senders and provenance | Pa | Pa | 016, 021, 028 | Two intakes carry source, method and time. No sender yet. |
| RL12 One model | F | P | 002, 010, 017 | Screen, PDF and CSV from one model; saved case round trip; contacts saved. |

### PL1 quantity table

| Quantity | Standard meaning | What the code computes | Same? |
|---|---|---|---|
| OOIP, N | Stock-tank oil initially in place | Slope of the regression in the space the engine chose; intercept of the pot aquifer plot | Yes. The screen drew another line (002, fixed) |
| OGIP, G | Gas initially in place at standard conditions | As above, per scf | Yes. The axis said RB/Mscf over values in RB/scf (002, fixed) |
| F | Underground withdrawal, reservoir volume | Np (Bo + (Rp - Rs) Bg) + Wp Bw, or Gp Bg + Wp Bw | Without injection terms (008, open, stated) |
| Et | Total expansion per unit of N or G | Eo + m Eg + (1 + m) Efw | Yes, printed with its parts |
| We | Cumulative water influx | Marched (Fetkovich, Carter-Tracy) or solved (pot) | Yes |
| Drive indices | Fractions of the hydrocarbon voidage | Each energy term over F minus Wp Bw | Yes since engines #165; the convention is now printed |
| "CDI" | Rock and connate water expansion | N (1 + m) Efw over the voidage | Yes; it was "EDI" for oil and "CDI" for gas (015, fixed) |
| Matched OOIP | N that reproduces the pressures | Levenberg-Marquardt on a forward tank model | Wrong when the case flag disagreed with the aquifer model (003, fixed) |
| p/z OGIP | X intercept of p/z against Gp | Least squares including the initial point; Ramagost-Farshad corrected line beside it | Yes |
| Validation tier | Which published case backs this engine path | Engine reports it; it was not stored for a regression run | Now stored (009) |

### Findings

Severity: S1 wrong answer with no warning; S2 wrong or lost data, or a door
that misleads; S3 workflow gap or misleading text; S4 polish.

| ID | Sev | Check | Finding | Evidence | Status |
|---|---|---|---|---|---|
| MBAL-U1-001 | S2 | RL1, RL2, RL4, RL6, RL9, PL7 | The report had no plots, no PVT values, no aquifer inputs, no sources, no datum, no dates. | Gap matrix; old PDF. | Fixed: `lib/reportModel.js`, `utils/mbalReportExport.js`, the Report tab. 47 gates and 4 goldens. |
| MBAL-U1-002 | S2 | RL6, PL1 | The Plots tab drew the engine's slope and intercept on F against Et for every run. With a pot, Fetkovich or Carter-Tracy aquifer the engine regresses in another space, so the line shown was a different line from the one fitted. The gas axis said RB/Mscf over values in RB/scf. | Probe; test with the old line as control (it misses the pot aquifer points). | Fixed: one regression plot in the engine's space per run, with its own statement. |
| MBAL-U1-003 | **S1** | PL1, PL4 | The engine reads the aquifer twice: the regression from `aquifer_model`, the history match from the case flag `has_aquifer`. The Aquifer tab saved the model and never the flag. A history match then simulated a closed tank beside an aquifer regression: Dake Exercise 9.2 matched 535 MMSTB against a truth of 312, "converged", with no warning. | `mbalRunMapping.test.js`: 535 with the flag the tab left, within 10 percent of 312 with the mapping. | Fixed in three places: the mapping derives the flag from the model (**needs the function deploy**), the Aquifer tab saves it, the Run action syncs it. |
| MBAL-U1-004 | S2 | PL4, RL8 | The stale rule of the honesty sweep compared time stamps. Live, `rb_cases.updated_at` moves only on a change of content (the sharing guard) and `rb_run_configs.updated_at` on every update (a trigger): a production data edit did not move either, so a result stayed "current" over edited data, and a rename withdrew it. | Live catalog read; `runStaleness.test.js`. | Fixed: the run config carries a snapshot (case inputs and a digest of the data). No time stamp is read. A run from before the snapshot asks for one new run. |
| MBAL-U1-005 | S2 | RL1, PL11 | The Carter-Tracy form had no field for the reservoir radius, the area, the water viscosity or the salinity, and Save rebuilt the parameters without them. A saved radius was lost on the next save and the engine fell back on 2,980 ft. | `mbalInputsU1.test.jsx`. | Fixed: four fields; each model saves its own keys. |
| MBAL-U1-006 | S2 | RL10, PL2, PL3 | The Data door assumed psia, had no unit choice, read "1,5" as 15, guessed day-first dates, and dropped rows with no pressure silently. | Gap matrix; hostile files with the old reading as control. | Fixed: `lib/productionImport.js` on `src/lib/tabularParse.js`; read-back; Excel and paste doors. |
| MBAL-U1-007 | S3 | PL4, PL11 | The PVT tab showed 35 degAPI, 0.75 and 50,000 ppm in fields that were never saved, beside "Saved". | Walk. | Fixed: blanks; a default the run applies prints as an assumption. |
| MBAL-U1-008 | S2 | PL1, RL5 | The engine has no injection term. Injected water and gas are stored, handed to the engine and never read; a reservoir under injection gets an oil in place that is too high, and nothing said so. | Engine read; `mbalRunMapping.test.js` (injection changes no number). | **Open** (engine math, U2-002). Stated on the Data tab, the Run tab, in the data table and the limits of the report. |
| MBAL-U1-009 | S3 | RL8 | The validation tier was never stored for a regression run, so the badge fell back to a table in the app. | Code. | Fixed: stored in `plot_data` with its reference and tolerance (**needs the deploy**); the matrix is the fallback. |
| MBAL-U1-010 | S3 | RL12 | Contact depths and areas lived in component state: lost on a tab switch and never reported. | Walk. | Fixed: saved with the study record, printed beside the datum. |
| MBAL-U1-011 | S2 | PL8, PL11 | A case whose PVT comes on its data rows (the engine accepts it) was called invalid by the PVT tab ("Lab table is empty") and Save was off, so its compressibilities and gravities could not be changed there at all. All three sample cases are of this kind. | e2e; jest with a negative control. | Fixed. |
| MBAL-U1-012 | S2 | RL9, PL4 | At a pressure outside the PVT table the engine uses the correlations, with no word (its header comment says it warns; it does not). When the initial pressure is the one outside, Boi and every later Bo come from different PVT descriptions. | Probe: the Ahmed case on a table ending at 3,500 psia has no valid point. | App side fixed: a warning on the Run tab before the run, a flag at the top of the limits in the report, and the intake refuses such a table. The engine warning is U2-006. |
| MBAL-U1-013 | S3 | PL3 | Oilfield units only. | Gap matrix. | Fixed: `lib/mbalUnits.js` on the Suite registry; state and the database stay oilfield. Three registry units added (MRB, MMRB, 10^3 m3). |
| MBAL-U1-014 | S3 | PL3, RL7 | No pressure datum anywhere. | Gap matrix. | Fixed as stated inputs: datum depth, gauge depth, reference, whether the surveys were referred to the datum, a note. No correction (owner question 6 default). |
| MBAL-U1-015 | S3 | RL7 | One term, two names: "Rock and water (EDI)" for oil, "(CDI)" for gas. | Gap matrix. | Fixed: "Rock and connate water (CDI)" on every surface. |
| MBAL-U1-016 | S3 | RL11 | PVT was recalculated by the app with no record of a fluid study. | Gap matrix. | Fixed: `lib/pvtIntake.js` on the landed contract and `src/lib/pvtSource.js`; `?fluidProject=<id>` preselects. The prefill stays, reported as built from correlations. |
| MBAL-U1-017 | S3 | RL12, PL5 | No `.pld` family for `rb_*`. | Plan. | Fixed: `src/lib/portability/familyMaterialBalance.js`, root kind `rb_case`. |
| MBAL-U1-018 | S3 | PL2 | The PVT table editor refused rows in descending pressure, the order a lab report prints. | Walk. | Fixed: any order. |
| MBAL-U1-019 | S3 | PL5 | Record sharing was not adopted. | Programme lead, 2026-10-02. | Fixed for viewing: picker with "Shared with me", read-only open with the owner's results, a guard on every write, Save a copy. Colleague editing is U2-001. |
| MBAL-U1-020 | S3 | RL5, PL8 | The engine supports excluded timesteps and no screen sets them. | Gap matrix. | Open: U2-003. The report lists the excluded ones a config holds. |
| MBAL-U1-021 | S3 | RL11 | The Well Test handoff carried no method and no time. | Gap matrix. | Fixed: the sender states how the pressure was obtained and when; the case keeps the record and the report cites it, or says the value was edited after. |
| MBAL-U1-022 | S3 | PL4 | The Screening tab opens on the aquifer of a built-in example with nothing saying so. | Walk. | Fixed: named until a value is changed. |
| MBAL-U1-023 | S4 | RL6 | Kit: `tickText` prints one significant figure from 1e5 up, so large axes repeat a label. | Report read-back. | Open in the kit (changing it moves the Well Test goldens). Worked around by scaling the axis. |
| MBAL-U1-024 | S4 | PL5 | The trigger `update_rb_run_configs_updated_at` and its function are live and in no migration. | Live catalog. | Backfill file written, not applied (a no-op live). |
| MBAL-U1-025 | S4 | PL12 | Literal placeholders, unit labels uppercased by the table header style, `Δ` printed raw on the Aquifer tab. | Walk. | Fixed. |
| MBAL-U1-026 | S4 | PL6 | The annotation box of a plot covered data. | Screenshot. | Fixed: `notesAt` in the kit; the screen prints the notes above the chart. |
| MBAL-U1-027 | S4 | PL6 | PVT chart colours chosen for a dark background on a white chart. | Screenshot. | Fixed. |
| MBAL-U1-028 | S3 | RL11, PL9 | Fluid Systems Studio ends its table at the larger of 1.4 Pb and Pb plus 2,000 psi and has no control for it. A case further above its bubble point (the Ahmed example: 3,685 against 1,500 psia) cannot take its PVT. | `pvtIntake.test.js`; e2e. | Open, in the Fluid Systems app: U2-005. The intake refuses with the reason. |
| MBAL-U1-029 | S4 | RL10 | The door's count line did not add up ("13 of 14 rows read, 6 left out"). | e2e. | Fixed. |

### What the report contains

`buildMbalPdf` (`src/utils/mbalReportExport.js`), in order: header
(identification, data dates, analysis type, display units, engine run,
build); headline results with the validation tier and its benchmark; the
regression statement; the in-place volume by each method (regression,
history match where run, p/z for gas, Campbell or Cole level, volumetric
where entered) with the difference against the headline; drive indices at
the last timestep with energy terms, sum, denominator and the closure
identity; the history match with status, intervals and misfit; inputs of the
analysis with unit and source; pressure datum and contacts; the data table
with dates, injection and the reason a point is out of the fit; expansion
terms per timestep; PVT used by the engine and the table as entered; PVT
provenance when the table came from Fluid Systems Studio; drive indices
against time; limits of the analysis with correlation ranges and flags;
engine warnings; then the figures: the regression plot with the fitted line
and used and excluded points, Campbell or Cole, p/z, measured against
simulated pressure, aquifer influx, drive indices against time as stacked
bars on a calendar axis. A figure that does not apply prints its reason. A
stale run is refused.

### Kit additions

`plot.js`: stacked bars as a series type, `barWidth`, a calendar X axis
(`xDate`, `dateTicks`, `dateTickText`), `notesAt`, `markerSize`. The limits
block and the completeness guard were taken as written from the Fluid
Systems round. On the merge with the Risked Reserves round, which added its
own `bars.js` for named categories, the test kit keeps that round's contract
(bars counted outside `total`). Well Test goldens byte-identical.

### Migration and owner commands

- `supabase/migrations/20260718220500_backfill_rb_run_configs_updated_at_trigger.sql`: backfill, back-dated to sort after the `rb_*` DDL backfill. Creates the function and the trigger only where absent, so it changes nothing live. **Not applied.** Optional, for the record: `supabase db query --linked -f supabase/migrations/20260718220500_backfill_rb_run_configs_updated_at_trigger.sql`. Logged in `MIGRATIONS.md`.
- `supabase functions deploy calculate-mbal`: owed (003, 009, and the PVT values and dates stored with a result).
- No DDL was needed for the study record or the run snapshot: both live in `rb_run_configs.pvt_correlations` (jsonb), and the mapping hands the engine only its five correlation keys.

### What the gap matrix and the plan had wrong or missed

- "`rb_*` tables have no migrations in the repo": the DDL backfill has existed since 2026-09-11 (`20260718220000`). One trigger and its function were missing (024).
- "`aquifer_params` ignores unknown keys": the engine has warned on unknown keys since engines #170.
- "Fetkovich delta-p convention (paused, needs a sourced example)": settled by MB1 on 2026-07-18 (Ahmed Example 10-10).
- "`gas_cap_ratio_m` has no direct writer": the PVT tab writes it.
- H4 was recorded as fixed by the honesty sweep. Its rule rested on `updated_at`, which the live database does not move the way the rule assumed (004).
- The sharing migration was described to this round as held; it was applied during the round, and sharing for viewing was adopted on the lead's instruction.
- Not in the matrix: 002, 003, 005, 008, 011, 012.

### Where validation is weaker than asked

- **The edge function was not run.** The mapping is tested in jest and in the browser harness, which imports the same module; the deployed function was not invoked and Deno did not type-check the new file (no Deno on the studio box). The first deploy is the check.
- **MBAL-U1-003** is validated on one published case (Dake 9.2). The gas path is covered by an identity (the pot aquifer volume is reported without the flag), with no second published history match.
- **Record sharing** is tested against a small transport over the harness rows that lets only the owner write, and against the store's own rules for the owner. No two-account walk on staging; the child-table policies were read in the migration and on the live catalog, and no write was attempted as a colleague.
- **`.pld`** round trip runs on an in-memory source and sink with UUID keys. No package was imported into the live project.
- **Unit conversions** are held to known values typed from the definitions; the registry factors were not re-derived from a standard.
- **Goldens** depend on the regression reproducing to the printed digit on the CI runner, as the Well Test goldens do.
- **The injection gap (008)** is stated, with no estimate of its size on a real field.
- **Fluid Systems change FLUID-U1-007** (Bo above the bubble point) moves prefilled rows by about half a percent at 2,000 psi above Pb. No test here froze the old numbers, so nothing was re-pinned. A case prefilled before that change keeps its stored rows; prefill again to take the corrected curve.

### Persona walks (PL8)

**1. Reservoir engineer from Petex MBAL.** Loads a tank history exported by
the other tool (a units row, gauge pressure, millions). *Before:* read as
psia and STB. *Now:* the door reads the units row, raises the gauge
pressures and lists the title line it left out. Runs the regression, then
the history match. *Before:* with a Carter-Tracy aquifer set on the Aquifer
tab the match could ignore it (003). Would now: exclude the two early
points on the plot (U2-003), enter injection (U2-002), match several tanks
(U2-012), run a prediction with well constraints (U2-013).

**2. Engineer with a fluid study.** Opens the PVT tab and takes the table of
the saved Fluid Systems project. *Now:* the report names the project and the
method of each property. Would now: take a table that reaches the initial
pressure of a deeply undersaturated oil (U2-005).

**3. Manager or partner reading the report.** *Before:* two pages of tables.
*Now:* what was analysed, on which inputs and from where, the answer by each
method, the plots and the limits. Would now: a one page summary first
(U2-016), and the forecast in the same file (U2-009).

**4. Colleague in the same organisation.** *Now:* opens a shared case
read-only and saves a copy. Would now: edit the same case under a check-out
(U2-001).

## Step 2: advancement review (analysis only)

### 2a. Competitor parity

From public documentation only, read on 2026-10-02: the Petex MBAL product
page and its 2024 insert (petex.com), an IPM brochure of 2014 on a
third-party host (the only public page that names the aquifer models and the
regression, so it is older and weaker), the Harmony and Harmony Enterprise
online help (ihsenergy.ca) and the 2023 Harmony Enterprise brochure. The S&P
Global product page and the root of the Harmony help returned 403. "NF"
means not found in the pages read, which is no proof of absence.

| Capability | Petex MBAL | Harmony | Ours | Gap |
|---|---|---|---|---|
| Tanks | Single and multi-tank with transmissibilities | Single; two connected gas reservoirs | Single | Multi-tank missing |
| Fluids | Oil, gas, tight gas, condensate, CBM (Langmuir) | Oil, gas, CBM as separate analyses; volatile oil (Walsh, with Rv); overpressured gas | Oil, gas, oil with gas cap; overpressured gas by the Ramagost-Farshad line | Condensate, volatile oil, CBM missing |
| PVT | Black oil or compositional, correlations matched to data, PVT by depth and by tank | Gravity or composition; Rv | Correlations, a table, per-row values, `pvt-1` intake | Matching lives in Fluid Systems; no compositional tracking |
| Aquifers | Small pot, Schilthuis, Hurst simplified, Hurst-van Everdingen, Vogt-Wang, Fetkovich (two forms), Carter-Tracy; linear, radial, bottom | Schilthuis, Fetkovich; transient and PSS in the typecurve theory | Pot, Fetkovich, Carter-Tracy (radial); van Everdingen-Hurst in Screening | Linear and bottom drive, Schilthuis missing |
| Graphical methods | Havlena-Odeh, F/Et against We/Et, F/Et against F, F-We against Et, p/z, Cole, Campbell | p/z, Havlena-Odeh, F against Et, Campbell, Dake, N against time | Havlena-Odeh in three spaces, p/z, Cole, Campbell | Par; N against time is small |
| Regression | Non-linear on aquifer and reservoir parameters; history simulation | Best fit of OOIP; advanced gas models matched by hand | Levenberg-Marquardt with 95 percent intervals and bounds named | We print intervals; neither public page shows them |
| Drive indices | NF (energy plots not found) | Depletion, gas cap, water, formation and connate water | Same four, convention printed | Par |
| Relative permeability, contacts | Fw, Fg, Fo matching; Corey; contacts; gas coning | NF for static balance | Contact movement screening | Fractional flow matching missing |
| Prediction | Wells with lift curves, constraints, DCQ, link to GAP | Forecast by declines, volumetrics and balance; IPR and TPC elsewhere | Arps decline reconciled with the balance | Tank prediction mode missing |
| Injection | Voidage replacement, gas recycling | Voidage replacement ratio | Stored, left out of the balance | **Missing (008)** |
| Flowing material balance | NF (type curves for tight gas) | Headline feature, with aquifer and multiphase options | None | Missing; belongs with Well Test or DCA data |
| Uncertainty | Monte Carlo tool | NF for material balance | Confidence intervals of the match | Monte Carlo on inputs missing (canonical engine only) |
| Import, report | Import filter, templates, ODBC | Shared database, imports | Hostile-file door with read-back; a report with sources and limits | Our report is the stronger one on the public evidence |

### 2b. Deferred backlog

| Item | Source | Now |
|---|---|---|
| Injection terms in F | 008 | U2-002 |
| Excluded timesteps in the UI | Gap matrix RL5, 020 | U2-003 |
| Colleague editing under a check-out | 019 | U2-001 |
| Engine warning outside the PVT table | 012 | U2-006 |
| EPE forecast handoff | STATUS MB6 | U2-009 |
| Multi-tank | Plan | U2-012 |
| History-match assist | Plan | U2-008 |
| Prediction mode | Plan | U2-013 |
| `final_sdi` retirement (backfill held, then drop) | STATUS 2026-09-11 | U2-015 |
| Fetkovich delta-p convention | Plan | Closed by MB1; removed |
| `aquifer_params` unknown keys | Plan | Closed by engines #170; removed |

### 2c. Suite integration

| App | Today | Proposed |
|---|---|---|
| Fluid Systems Studio | `pvt-1` intake by project | A pressure range control on the Fluid side (U2-005); a "Send to Material Balance" button that opens the PVT tab with `?fluidProject=` |
| SCAL Studio | None | Residual saturations for the Contacts tab through `kr-1` when SCAL's round lands (U2-014) |
| Voidage Replacement Monitor | None | Average pressure against date out of, and into, the data table (U2-010) |
| Reservoir Simulation Studio | Simulation pulls cumulatives with no source | A sender: in-place volume, aquifer model and parameters, with method and run time (U2-011) |
| Petroleum Economics Studio | None | The forecast profile as a production stream (U2-009) |
| ReservoirCalc Pro | A typed volumetric estimate | Intake of the volumetric in-place volume with its source for the cross-check row (U2-007) |
| Well Test Analysis Studio | Average pressure intake with method and time | Later static pressures as rows of the data table (U2-010) |

### One ranked backlog

Size: S under two days, M under a week, L more.

| Rank | ID | Item | Size | Why | Batch |
|---|---|---|---|---|---|
| 1 | U2-001 | Colleague editing: check-out, version on save, history, on all `rb_*` writes | M | Sharing is half adopted; the database already enforces it | A |
| 2 | U2-002 | Injection in the balance (Winj Bw and Ginj Bginj in F), engines first, validated on a published waterflood example | M | The one known wrong answer left (008) | A |
| 3 | U2-003 | Exclude and restore timesteps from the plot and the data table, with a reason | S | Every competitor has it; the engine already does | A |
| 4 | U2-004 | A sender out of the app: in-place volume, drive, aquifer, with method and time | S | RL11 is Pa until something leaves the app | A |
| 5 | U2-005 | Fluid Systems: pressure range of the table set by the user or asked by the consumer | S | Unblocks the intake for undersaturated oils (028) | A |
| 6 | U2-006 | Engine warning when a pressure falls outside the PVT table | S | The engine's own comment promises it (012) | A |
| 7 | U2-007 | Volumetric in-place volume from ReservoirCalc Pro, with source | S | Fills the cross-check row | B |
| 8 | U2-008 | History-match assist: sensitivity of the misfit to each parameter, a suggested set to fit | M | Short histories overfit | B |
| 9 | U2-009 | Forecast to Petroleum Economics Studio, and the forecast in the report | M | Closes the chain for a development audience | B |
| 10 | U2-010 | Pressure rows from VRR Monitor and Well Test | S | Two apps hold the pressures this one needs | B |
| 11 | U2-011 | Sender to Reservoir Simulation Studio | S | Its intake exists with no source | B |
| 12 | U2-012 | Multi-tank with transmissibility | L | Headline gap against Petex MBAL | C |
| 13 | U2-013 | Prediction mode: tank forecast under rate or pressure constraints | L | Headline gap; needs well models | C |
| 14 | U2-014 | Linear and bottom-drive aquifers, Schilthuis; SCAL intake for the contacts | M | Parity | C |
| 15 | U2-015 | Retire `final_sdi` (the held backfill, then the drop) | S | Schema debt | C |
| 16 | U2-016 | A one page summary at the front of the report | S | Manager persona | B |
| 17 | U2-017 | Gas condensate and volatile oil (Rv) | L | Parity; engines first | C |
| 18 | U2-018 | Monte Carlo on inputs through the canonical MonteCarloEngine | M | Parity; no new implementation | C |
| 19 | U2-019 | Kit: `tickText` precision for large axes, with the Well Test goldens regenerated on purpose | S | 023 | C |

### Owner questions

| # | Question | Recommended default |
|---|---|---|
| 1 | Deploy `calculate-mbal` now? Until then production history matches can ignore the aquifer (003). | Yes, with this merge |
| 2 | Injection (U2-002) changes engine math. Build it engines-first against a published example before NAPE? | Yes; it is the one wrong answer left |
| 3 | Colleague editing (U2-001) before the freeze, or viewing only for NAPE? | Viewing for NAPE; editing in Batch A after the two-account walk |
| 4 | A run made before this release asks for one new run before it reports. Acceptable for the 33 live runs? | Yes: the app cannot tell what they were made on |
| 5 | The pressure datum is stated and no correction is applied. Add a gradient correction later? | Keep as stated; a correction needs a fluid gradient per survey |
| 6 | Apply the trigger backfill file for the record? | Optional; it is a no-op |
| 7 | May a colleague's shared Fluid project feed my case? | Yes, by the view permission of the project, as the Fluid round proposed |

## Batch decision (programme lead, 2026-10-02)

Recorded verbatim:

> BUILD in this order, one commit per item:
> - Batch A: (1) water and gas injection in the balance (MBAL-U1-008): F gains the injection terms of the Havlena-Odeh form (cumulative water injected times Bw, cumulative gas injected times Bg), on the regression and every derived quantity; validated against a published worked example with injection that you can actually read (cite it; if none is readable, an independent hand calculation and a negative control, and say so); the Data tab, the report's inputs and data tables and the limits block follow; the "no injection term" statements are removed only when this is true. (2) the engine warns when it uses correlations outside the range of the lab PVT table (MBAL-U1-012 engine half), and the warning reaches the run result, the screen and the report. (3) excluded timesteps UI: pick and unpick points on the regression plot and the data table with a reason; the report lists them; saved; stale rule respected. (4) colleague editing with check-out on rb_cases (the owner granted edit rights with decorum on 2026-10-01): use the shared `src/lib/recordSharing` lock, version and history; child tables follow the case lock as the database enforces; Run and Save refused without the hold; the History panel; tests with two users in the in-memory store. (5) a sender out: send the case's in-place volume, drive mechanism and forecastable pressure to ReservoirCalc Pro (volumetric cross-check) and to the Petroleum Economics Studio or Forecast Scenario Hub if a typed intake exists, with provenance; document each contract.
> - Batch B: ReservoirCalc Pro volumetric intake (the volumetric estimate on the case comes from a saved RCP project by id with its source printed, not typed); pressure rows from VRR Monitor or Well Test where a saved source exists (by id, provenance printed, edits marked); a one-page summary at the front of the report.
> - DEFERRED (record reasons): history-match assist (M), forecast to Economics inside the report (M), sender to Simulation, multi-tank, prediction mode, more aquifer models with SCAL intake, condensate and volatile oil, Monte Carlo through the canonical engine, retiring `final_sdi`, kit tickText.
> Owner-question defaults in force: datum stays a stated input without correction; a legacy run needs one rerun; a colleague's Fluid project can feed a case.

### Deferred, with reasons

| Item | Reason |
|---|---|
| U2-008 history-match assist | M; the match already prints 95 percent intervals; a sensitivity tool is safer after NAPE |
| U2-009 forecast to Economics inside the report | M; Petroleum Economics Studio has no typed production-stream intake (it reads CSV columns), so there is no contract to send to yet |
| U2-011 sender to Simulation | Simulation's intake has no source record to fill; it belongs with Simulation's own round (app 8) |
| U2-012 multi-tank, U2-013 prediction mode | L each; engine work with no published benchmark readable before the freeze |
| U2-014 more aquifer models with SCAL intake | Waits for SCAL's round and its `kr-1` contract |
| U2-017 condensate and volatile oil | L; engines first, needs Rv in the PVT contract |
| U2-018 Monte Carlo through the canonical engine | M; no change of method before NAPE |
| U2-015 retiring `final_sdi` | A shared-schema drop; the deprecated mirror costs nothing meanwhile |
| U2-019 kit tickText | Moves the Well Test goldens; not worth it before the freeze |

### How the work landed in git

A session restart interrupted the build before any commit. The programme lead
saved the working tree as one commit, `fc659f9db` ("wip"), which holds the
first pass of items 1 to 5 (engine, mapping, app, tests). The commits after it
finish each item one at a time; history is not rewritten.

## Step 2 build (branch `feat/mbal-u2`)

### U2-002 Injection in the balance (MBAL-U1-008 closed)

- **Engine** (engines PR #300, vendored byte-identical with `mbal-u2` ledger rows in `packages/engines/VENDOR.json` until the lead merges it): F is the net withdrawal of the Havlena-Odeh form, `Np[Bt + (Rp - Rsi)Bg] + Wp Bw - Winj Bw - Ginj Bginj` for oil and `Gp Bg + Wp Bw - Winj Bw - Ginj Bg` for gas. Every derived quantity reads it: the three regressions, the pressure history match (its forward model calls the same per-timestep functions), the drive indices (two new ones, WIDI = Winj Bw / A and GIDI = Ginj Bginj / A, over A = F + Winj Bw + Ginj Bginj - Wp Bw, so the sum stays an identity) and the classification (`injection_pressure_maintenance` when injection supplies more than half the voidage). Injected gas is taken to be the produced gas, at its Bg at each pressure. Injection on the initial row, or a negative cumulative, is refused.
- **Validation.** No published worked example with injection could be read (searched 2026-10-02: the open lecture notes reproduce Ahmed's equation without numbers; the textbook examples are not open). So, as the brief allows: an independent stdlib Python oracle (`packages/engines/test-data/mbal/injection/oracle.py`) that first reproduces Ahmed Example 11-1's printed influx (413,081 against 411,281 bbl; the book rounds Bt) and then gives F, We and all six indices with 100,000 STB of water and 100 MMscf of gas injection added; and exact synthetic oil (N = 50 MMSTB, water and gas injection) and gas (G = 100 Bscf, cycling) tanks. Engine gate `__tests__/mbalInjection.test.ts` GATE 11 (I-0 to I-9): F to 1e-12, We to 1e-9, N and G to round-off, closure to 1e-12, the history match within 1 percent. Negative controls: the same rows without the injection columns give N five times too high and G 1.5 times; re-breaking F in the engine fails 5 of the 10 injection gates (I-1, I-2, I-4, I-6, I-7).
- **Honest tier.** A run with injection is capped at `published_method` with the reason in its reference, since the benchmarks of each path were reproduced on data without injection.
- **Numbers that change:** only cases with injection on their rows (none of the seven live cases had any on 2026-10-02 as far as the U1 read showed; their runs need one rerun anyway). Zero injection is bit for bit unchanged (gate I-8).
- **App.** The row mapping hands both columns to the engine (`PRODUCTION_UNUSED_COLUMNS` is empty) and stores `winj_bw_rb`, `ginj_bg_rb`, `winj_di`, `ginj_di` and the final injection indices in `plot_data` (no migration). The Data tab, the Run tab and the help say injection is in the balance; a run stored before this says it left injection out. The report prints Winj Bw and Ginj Bginj beside F, the formula with the injection terms, WIDI and GIDI in both drive index tables with the convention, and the limits line on the assumption. Tests: `mbalRunMapping.test.js`, `mbalReportU1.test.jsx` (two new, read back from the PDF).

### U2-007 (found on the way, S1): Bo above the bubble point

- An undersaturated case with no Bo on its initial row (correlations, or a PVT table) took Boi = Bob, the volume factor AT the bubble point, while each later row above Pb took Bob(1 - co(p - Pb)). Eo came out negative above Pb, those points were dropped from the fit or the run refused, and points below Pb carried an Eo too small, overstating N. Also the rows of a PVT table above Pb were never read (the table was consulted at Pb only). Fixed in the engine: Boi is Bo at pi by the rule of every row above Pb, and a table that covers p gives Bo at p.
- Gate GATE 12: the published Ahmed Example 11-3 (13 points, all above Pb) supplied as a PVT table gives exactly its per-row answer (291.3 MMSTB); before the fix it refused to run. Negative control B-3 reproduces the old Boi and every Eo goes negative.
- **Numbers that change:** undersaturated cases whose rows carry no Bo. In the Suite harness: CASE 4 and 5 (correlation substitution on Pletcher's oil data) move by 3 percent; CASE 7 (the lab-table path) moves toward the truth, OOIP error 4.90 to 2.63 percent and W 14.6 to 9.6 percent. The three published sample cases carry Bo on their rows and do not move.

### U2-006 Engine warning outside the PVT table (MBAL-U1-012 closed)

- Every table lookup goes through one recorder, so the engine reports the lookups that actually fell outside the table (no re-derivation): `pvt_table_coverage` on the result (table range, each fallback with its timestep, pressure, property and what was used: a correlation, or the fixed co above Pb) and one warning that starts "PVT table coverage:". Gate GATE 13 (C-1 to C-5), oil and gas.
- The coverage is stored in `plot_data`; the Run tab shows it after a run; the report puts the engine's sentence at the top of the limits flags. A run stored before this falls back to the app's own check, which says it is the app's.
