# Fluid Systems Studio: comprehensive upgrade

App #1 of the Reservoir round of the upgrade programme
(`docs/scope/AppUpgrade-Reservoir-PLAN.md`). Step 1 (the practitioner lens
PL1 to PL12 of `docs/scope/AppUpgrade-BestPractices.md` and the reviewer lens
RL1 to RL12 of `docs/scope/AppUpgrade-Reservoir-FeedbackLessons.md`) was run
and fixed on 2026-10-02 on branch `feat/fluid-u1`. Step 2 (advancement
review) is analysis only; batches are chosen by the programme lead before
anything is built.

- Route: `/dashboard/apps/reservoir/fluid-systems-studio` (ProtectedAppRoute, slug `fluid-systems-studio`).
- Harness: `/dev/fluid-systems-studio`. New for this upgrade: it runs on the in-memory Supabase double (`src/dev/FluidStudioHarness.jsx`), keeps saved projects in sessionStorage so they survive a refresh and can be read by id from the Well Test harness, and `?saved=1` seeds two projects as earlier releases saved them.
- Earlier cycles: Phases 1 to 3 (2026-07, black-oil, blending, flow assurance, persistence), FS1 to FS8 (PR78 compositional engine, oracle and literature gates), ET1 to ET4 (lab tuning), Studio shell, T1 (2026-09-26), design system 1D. Their gates hold; the default black-oil sample is unchanged except for the three deliberate changes listed under FLUID-U1-005, -007 and -008.
- Carried in: the gap matrix row 4.1 (graded from code reading, confirmed or corrected below), the report kit and input provenance of Step 0 (`docs/scope/ReportKit-DESIGN-AND-STATUS.md`).
- Merged in on the way (main at #858): Step 0e (H10, the "Lab tuned" badge, fixed by the honesty sweep; the report and the contract here follow its `tuningStatus`, so the app has one staleness check; H5, the Material Balance prefill) and Step 0a (unit families, `src/lib/tabularParse.js`, the Reservoir sharing migration, applied by the owner). Both are adopted in this PR.

## What changed, in seven lines

1. **The report.** The app had none. It now prints a Fluid Properties Report on the shared Report Kit: identification, every input with unit and source, the method behind every property (written by the engine beside the call), basis and conventions, separator stages closing on their total, the lab tuning record, the limits of the methods with published ranges and out-of-range flags, the PVT table, the `pvt-1` block, and the plots drawn from the screen series.
2. **The PVT contract.** Fluid Systems Studio writes the full `pvt-1` block, stores it with the saved project and sends it with every handoff. Well Test Analysis Studio prints the method of each property it takes, with the source project and time.
3. **Units.** The Suite unit profile at every door, card, plot, table, CSV file and in the report. One Bg basis everywhere.
4. **One model.** The project carries identification, input sources, the unit system and the record of the lab tuning; the screen, the report, both CSV files, the handoff and the saved project are built from it.
5. **The import door.** The P-T profile paste reads any separator, a header in either column order, the unit at the door, gauge pressure, and reads back what it read and what it did not.
6. **Record sharing.** The project picker lists own projects, then "Shared with me"; a shared project is viewed, or edited by one person at a time; a save carries the version it was opened at.
7. **Three engine corrections** found on the way: an entered bubble point is honoured by the table (S2), Bo above the bubble point is the integral of the compressibility the table prints (S2), separator totals close on the printed digit (S4).

## Evidence kit made for this app

| Kit | Where | What it holds |
|---|---|---|
| Engine provenance and the three corrections | `src/utils/__tests__/fluidStudioProvenance.test.js` (28) | The method named is the method called, for every selectable correlation; the bubble point source (solved, entered, Standing fallback); the entered bubble point continuity; Bo above Pb against the co of the same row; range flags; water properties |
| The report, read back from the PDF | `src/components/fluidstudio/__tests__/fluidReport.test.jsx` (32) on `fluidTestKit.js` | Five goldens (`__fixtures__/reportGolden/`), RL1 completeness and sources, RL2 closure, RL4 header and old projects, RL6 captions, point counts against the screen series and `expectFigureDrawn`, RL7 basis lexicon and SI, RL8 status words, RL9 limits, RL12 Report tab rows against the PDF |
| The `pvt-1` contract, the chain, the CSV files, the door, the units | `src/components/fluidstudio/__tests__/fluidContract.test.jsx` (28) | The gate (every property names its method) with its negative control; Well Test intake by state and by project id; a value edited after the handoff; both CSV headers; six hostile P-T files against their twin; unit round trips |
| The page | `src/components/fluidstudio/__tests__/fluidUpgradeUi.test.jsx` (8) | Sample label, unit profile, Report tab, P-T read-back, handoff note, compositional mode; a static guard that every PVT intake has a sender |
| Kit additions | `src/lib/reportKit/__tests__/reportKitLimits.test.js` (5) | The "Limits of this analysis" block and the completeness guard |
| Record sharing | `src/components/fluidstudio/__tests__/fluidSharing.test.jsx` (6) | The project hook on the in-memory mirror of the database rules: own and shared lists, view only, check-out, a stale save refused, Save a copy, before the migration |
| Saved state | `src/components/fluidstudio/__fixtures__/savedProjects.js` | A pre-shell row (2026-07) and a schema 1 compositional project with applied tuning (2026-09) |
| Hostile files | `e2e/fixtures/fluid-systems/hostile/` (7 files and a README) | The same six points in seven shapes |
| Browser | `e2e/fluid-systems-upgrade.spec.js` (12) | Three viewports in both themes; the PDF downloaded and read with pdftotext, pdfinfo and pdfimages; unit switch with key by key typing; hostile files; both old projects; the chain to Well Test by router state and by project id; the tuned claim withdrawn |

Negative controls are in the tests beside each gate: the old table form
re-created in the test jumps by a third at an entered bubble point; the old
Bo form understates the compressibility by more than a third; dropping any
one of the twelve method names fails the contract gate with the property
named; a bar and degC profile read as psia and degF is 14.5 times low;
removing an input row fails the completeness guard; an emptied series fails
`expectFigureDrawn`; an empty figure list is refused by the export.

## Step 1: the twenty-four checks

Grades: P pass, Pa partial, F fail. "Was" is the gap matrix grade (from code
reading) or, for PL checks, the state found here.

| Check | Was | Now | Findings | Notes |
|---|---|---|---|---|
| PL1 Labels mean the textbook | Failed | Fixed, three kept or open | 005, 007, 016, 020, 021, 022, 023 | Quantity table below. Two S2 found in the table itself. |
| PL2 Hostile files | Failed | Fixed for the one door | 009, 024 | The P-T profile is the only import door; it now reads its table with the shared typed reader. Composition and lab data are typed (Step 2). |
| PL3 Units, datums, frames | Failed | Fixed | 004, 010, 016 | Oilfield only before. Pressures stated absolute; no depth in this app except the free-text sample depth, which asks for its reference. |
| PL4 No claim without the event | Partial | Fixed | 013, 019, 025 | The record of the tune is saved and printed only while the app's one status (`tuningStatus`, H10 of the honesty sweep) says the fit still describes the fluid. |
| PL5 Real saved state | Passed | Pass, with fixtures | 011, 026 | Pre-shell and schema 1 projects open, compute and report with n/a (jest and e2e). Record sharing adopted: a save from another tab or person is refused with the reason. |
| PL6 Real browser | Passed with gaps | Pass | 016, 018, 029 | Three viewports, both themes, no page errors, no sideways scroll, charts on white with ChartLogo, PDF and CSV opened and read. |
| PL7 Report a reviewer can sign | Failed | Fixed | 001 | See RL1 to RL12. |
| PL8 Practitioner's day | Gaps recorded | Gaps recorded | 024 and Step 2 | Persona walks below. |
| PL9 The chain | Partial | Fixed for the two consumers that exist | 002, 003, 028 | Well Test reads `pvt-1`; Line Sizing keeps working on the version 1 keys. The other consumers are built in their rounds. |
| PL10 Real scale | Passed | Pass | | The table is 41 rows. Measured in jest on the studio box: the black-oil analysis about 3 ms, the compositional pipeline about 140 ms on its first run, the report model a few tens of ms on each edit (it is rebuilt with the results, whether or not the Report tab is open), the PDF about 2.5 s, a tune 2 to 3 s in the worker. No finding. |
| PL11 Inputs a person can type | Failed | Fixed | 006, 012 | Fields keep "93.5" key by key and a cleared field (e2e); the sample is labelled; a bubble point of zero is blank. |
| PL12 House standards | Failed | Fixed | 017 | Em dashes and "X, not Y" in engine messages and cards; literal 'n/a' and 'N/A'. Route protected. |
| RL1 Inputs with unit and source | F | P | 001, 012, 015 | Completeness guard over the engine input object, both fluid models and blending. |
| RL2 Composites show components | F | P | 007, 008 | Separator plus stock-tank GOR closes on the total; Bo above Pb closes on co. |
| RL3 Lumped results split | Pa | P | 001 | Surface gas by stage; single-flash against multistage Bo, each named; differential against separator-basis Bo and Rs in compositional mode. |
| RL4 Identification | F | P | 011 | Thirteen fields saved with the project; company from the organisation. |
| RL5 Data and operations summary | F | P | 001, 011 | The equivalent here is the sample and lab record (sample, depth, date, method, laboratory, report number) and the separator stage table. Contamination is a free-text note on the composition source. |
| RL6 Every result has its plot | F | P | 001, 018 | Eight figures listed; five always drawn; lab, envelope and hydrate conditional with their reason. |
| RL7 The basis is named | Pa | P | 004, 016 | Liberation basis, standard conditions, absolute pressure, Bg basis, how Pb was obtained. |
| RL8 Strengths kept, claims earned | Pa | Pa | 013 | The tuning record is saved and withdrawn when stale. Still open: tuned-parameter uncertainty is computed by the engine and not shown (U2-008). |
| RL9 Limits printed | Pa | P | 014, 022 | Published range of every correlation used; a flag on every input outside one. Papay's Z has no verified range and says so. |
| RL10 Import doors | F | Pa | 009, 024 | The existing door is fixed. A lab PVT report still cannot be loaded (U2-001). |
| RL11 Senders and provenance | Pa | Pa | 002, 003, 028 | The writer is complete and gated. Two of the six consumers read it; four are their own rounds. |
| RL12 One model | Pa | P | 011, 016 | Report tab rows are the PDF rows; the saved payload reads back to the same report. |

### PL1 quantity table

| Quantity | Standard meaning | What the code computes | Same? |
|---|---|---|---|
| Bubble point Pb | Pressure at which the first gas leaves solution at reservoir temperature | The pressure where the selected Rs correlation equals the entered solution GOR; or the entered value; or Standing's explicit form when the correlation cannot reach the GOR | Yes, and the report now says which (the fallback was silent) |
| Solution GOR Rs | Standard gas dissolved per stock-tank oil volume | Selected correlation, held at Rsb above Pb | Yes. With an entered Pb the curve did not reach Rsb at Pb (005, fixed) |
| Oil FVF Bo | Reservoir oil volume per stock-tank volume | Selected correlation on Rs below Pb; above Pb from the Vasquez-Beggs compressibility | Above Pb it was not the integral of its own co (007, fixed) |
| Oil compressibility co | -(1/Bo) dBo/dp above Pb | Vasquez-Beggs, A / p, floored at 1e-6 1/psi | Yes |
| Oil viscosity | Dead, live at Rs, undersaturated above Pb | Beggs-Robinson (or the simplified Beal-Cook-Spillman), Vasquez-Beggs above Pb | Yes |
| Gas Z | Real gas deviation factor | Papay on Sutton pseudo-critical properties, held in 0.25 to 1.15 | Yes as labelled; a screening form with no verified range (022, open) |
| Gas FVF Bg | Reservoir gas volume per standard volume | 0.00504 Z T / p in RB/scf | Yes; shown in RB/Mscf everywhere now (004) |
| Gas properties above Pb | There is no free gas above Pb | Computed at every pressure | Kept, stated in the limits (023) |
| Water FVF, viscosity | Bw, mu_w | Were not computed although salinity is asked for | Added from the engines library (015) |
| Separator GOR, stock-tank GOR | Gas liberated per stage, per stock-tank barrel | Staged liberation by the Rs correlation; telescopes to Rsb | Yes as labelled (an approximation, said on screen and in the report) |
| "Bo (multistage, approx)" | Bo by multistage separation | Single-flash Bo reduced by 1.5 percent of its excess per stage, capped | Kept and named an estimate; the compositional card has the flash value |
| Vasquez-Beggs gas gravity | Gas gravity at the 114.7 psia reference separator | Corrected with a fixed 100 psia separator at the reservoir temperature | Open (021): stated in the methods note |
| KPI row in compositional mode | | The black-oil stream, while the handoff and report use the EOS table | Said under the cards now (020) |
| Stock-tank API, surface gas gravity (EOS) | | Separator train flash | Yes |

### Findings

Severity: S1 wrong answer with no warning; S2 wrong or lost data, or a door
that misleads; S3 workflow gap or misleading text; S4 polish.

| ID | Sev | Check | Finding | Evidence | Status |
|---|---|---|---|---|---|
| FLUID-U1-001 | S2 | RL1, RL4, RL6, RL9, PL7 | No report of any kind: two CSV files of bare numbers. | Gap matrix; code. | Fixed: `utils/fluidstudio/reportModel.js`, `reportFigures.js`, `fluidReportExport.js`, the Report tab (`FluidReportTab.jsx`). 32 gates and 5 goldens. |
| FLUID-U1-002 | S2 | RL11 | The handoff named two correlation groups and nothing else: no units, time, project, bubble point source, tuning, range flags; Z, gas viscosity, co and undersaturated viscosity methods never travelled. | Gap matrix; code. | Fixed: the `pvt-1` block (below). The gate fails when any property names no method. |
| FLUID-U1-003 | S3 | RL11, PL9 | The handoff lives in router state only. A reload keeps it (the browser history holds it), but a fresh visit of the address, a copied link or a new tab has nothing. | Browser probe: `history.state` after reload and after a fresh visit. | Fixed: the block is stored with the saved project; the sender puts `?fluidProject=<id>` in the address; `src/lib/pvtSource.js` reads it by id. e2e walks both. |
| FLUID-U1-004 | S2 | RL7, PL3 | Bg in RB/scf on screen and RB/Mscf in the Material Balance CSV; the PVT CSV had no units at all. | Code; CSV. | Fixed: RB/Mscf (or m3/m3) on every screen, in both CSV files and the report; both CSV files open with the same provenance header and name the unit of every column. |
| FLUID-U1-005 | S2 | PL1, PL4 | An entered bubble point was not honoured by the table. With Pb entered as 2,000 psia on the sample, Rs at 2,000 psia was 401 scf/STB and 650 just above; Bo 1.247 against a headline (and a handoff `bo_at_pb`) of 1.372. The only word was "bubble point is user-specified". | Probe; test with the old form as control. | Fixed: below an entered Pb the Rs correlation is multiplied by one constant (Rsb over its own Rs at Pb) so Rs, Bo and viscosity are continuous there. The banner and the report state the multiplier and the correlation's own Pb. Exactly 1 when Pb is solved (default sample unchanged). |
| FLUID-U1-006 | S3 | PL11 | A bubble point typed as 0 was used: KPI 0 psia and a table with no saturated branch. | Probe. | Fixed: a bubble point that is not above zero is blank. |
| FLUID-U1-007 | S2 | PL1, RL2 | Bo above the bubble point was `Bo(Pb) exp(-co(p) (p - Pb))`: the compressibility at p times the whole step. Since co = A / p, its Bo fell too slowly: the compressibility of the curve was 10 to 38 percent below the co printed in the same row (0.62 of it at 4,870 psia on the sample), and the oil expansion from there to Pb more than 25 percent low. The same function feeds the Material Balance prefill and the Simulation deck. | Probe: numerical derivative of the table against its co column; test with the old form as control. | Fixed: `undersaturatedBo` integrates co = A / p to Bo(Pb) (Pb / p)^A, the Vasquez-Beggs form, with the floor of co handled piecewise. Gate: the numerical compressibility of the Bo curve equals co to 4 decimals for all three correlations. Changes numbers above Pb in this app, in the Material Balance prefill and in the Simulation PVTO rows (owner question 2). |
| FLUID-U1-008 | S4 | RL2 | Separator totals were summed from the rounded stage values: 650.1 scf/STB for a 650.0 solution GOR. | Report read-back. | Fixed: totals from the unrounded values. The black-oil snapshot pin is updated on purpose (four totals and `backbone.gor`). |
| FLUID-U1-009 | S2 | RL10, PL2 | The P-T profile door split on commas only and read psia and degF whatever the text held: a tab or semicolon table vanished with no word, a header vanished, a bar and degC profile was read 14.5 times low in pressure, "1500,5,80,2" became 1,500 psia and 5 degF. | Tests with the old reading as control. | Fixed: `utils/fluidstudio/ptProfileImport.js` on the shared typed reader (`src/lib/tabularParse.js`): any separator, comma decimals, a header in either order with its units, the unit chosen at the door, gauge to absolute with the atmosphere stated, and a read-back with every line not read. |
| FLUID-U1-010 | S3 | PL3 | Oilfield units only; the Suite unit profile was not followed. | Gap matrix section 5. | Fixed: `utils/fluidstudio/units.js` on the Suite registry; a header selector; a new workspace follows the profile (`useProfileSystem`), a saved project keeps its own, an old project opens in oilfield. |
| FLUID-U1-011 | S3 | RL4, RL12 | The saved project was a name and the inputs: no field, well, sample, laboratory, analyst. | Gap matrix. | Fixed: `inputs.identification` (13 fields), `inputs.inputMeta`, `inputs.unitSystem` and the tuning record are saved with the project (jsonb, no migration); payload schema 2 with the `pvt` block. |
| FLUID-U1-012 | S3 | PL11, RL1 | The app opens on a sample fluid with nothing saying so. | Walk. | Fixed: a banner in the rail and "Assumed. Sample fluid value, not field data" in the report, per input, until the value is edited or its source is stated. |
| FLUID-U1-013 | S3 | RL8, PL4 | The record of a lab tune (what was matched, before and after, the errors) lived in component state: gone on reload, so no report could print it. | Code; test. | Fixed: the fit record is saved with the project (`tuning.fit`). The report and the contract say tuned only while `tuningStatus` (H10: the request the regression consumed, kept as `tuning.fittedOn`) says the fit is current; otherwise "changed after the fit" or "saved before the app kept the record". |
| FLUID-U1-014 | S3 | RL9 | Range warnings covered the Pb, Rs and Bo correlation only. Viscosity, compressibility, gas and water correlations had none. | Code. | Fixed: published ranges for every correlation used (from the engines library and the app); structured flags; the banner names them in the display unit. |
| FLUID-U1-015 | S3 | RL1, RL11 | Salinity was asked for and entered no calculation; the table had no water properties although three consumers need Bw. | Code ("does not enter any PVT primitive"). | Fixed: Bw and water viscosity from the canonical engines library (McCain), in the table, the CSV and the contract. Salinity enters the viscosity; the engine's Bw is the pure-water form and the report says so. |
| FLUID-U1-016 | S3 | RL12 | The bubble point was shown two ways: the card from the rounded value, the plot from the unrounded one (20,670 against 20,669 kPa in SI). | e2e. | Fixed: one value on every surface. |
| FLUID-U1-017 | S4 | PL12 | Em dashes and "X, not Y" in engine warnings and card copy; literal 'n/a' in four cards, 'N/A' in one. | Grep. | Fixed. |
| FLUID-U1-018 | S3 | RL6 | No Bg plot; the compositional table had no plot; lab values were never drawn against the model. | Walk. | Fixed: five property plots from one series builder (`pvtSeries.js`), also for the EOS table; lab values against the model on screen and in the PDF. |
| FLUID-U1-019 | S4 | PL4 | The help said "Send to Pipeline Sizer" (the button is Line Sizing Studio) and "nothing can go stale". | Read. | Fixed in the help guide. |
| FLUID-U1-020 | S3 | PL1 | In compositional mode the six cards at the top show the black-oil stream while the handoff uses the EOS table, with nothing saying so. | Walk. | Fixed: a line under the cards says which stream they are and which table the report and handoffs use. |
| FLUID-U1-021 | S3 | PL1 | The Vasquez-Beggs gas gravity correction uses a fixed 100 psia separator at the reservoir temperature; the Separator Train does not enter. | Code (`pvtCalculations.js`). | Fixed in Step 2 (U2-007): the first separator stage. |
| FLUID-U1-022 | S3 | PL1, RL9 | Z is Papay, a screening form, held in 0.25 to 1.15; no published range could be verified. The engines library holds Hall-Yarborough and Dranchuk-Abou-Kassem. | Code. | Open: U2-006. The report says so and flags rows on the limit. |
| FLUID-U1-023 | S4 | PL1 | Gas Z, Bg and viscosity are computed above the bubble point, where there is no free gas. | Table. | Kept: stated in the limits. |
| FLUID-U1-024 | S3 | RL10, PL8 | No file door for a composition or for lab PVT tables (CCE, DL, separator test, viscosity). | Walk. | Open: U2-001, U2-009. |
| FLUID-U1-025 | S4 | PL4 | Flowline length, diameter, outlet pressure and ambient temperature are asked for and enter no calculation ("carried for Phase-3"). | Code. | Kept, and said plainly beside the fields and in the report. |
| FLUID-U1-026 | S3 | 0a | Record sharing and the shared tabular reader were not adopted (they merged while this work was under way). | Plan Step 0a. | Fixed: `useFluidStudioProjects` takes a sharing store (own projects, then "Shared with me"; saves through the store with the opened version; no write while read-only; Save a copy); `RecordSharingBar` under the picker; `createSavedProjectsService` gained `listRows` and `loadRow` and `StudioProjectManager` a "Shared with me" group, both additive, for the other Studio-shell apps. The P-T door reads with `parseTabular`. |
| FLUID-U1-027 | S4 | RL6 | The sensitivity sweep is a table in the report with no figure. | Report. | Open: U2-021. |
| FLUID-U1-028 | S3 | RL11 | Line Sizing drops the method names on arrival; Material Balance, Simulation, VRR and Nodal recompute PVT themselves; Waterflood has no intake. | Gap matrix. | Open, each in its own round; the intake each will use is written below. H5 is the honesty sweep's. |
| FLUID-U1-029 | S4 | PL6 | At 390 wide the header shows the icon without the app title. | Screenshot. | Kept (shared StudioHeader). |
| FLUID-U1-030 | S4 | PL12 | `pvtCalcs.generatePvtTable` (constant Z of 0.9, a fixed co) is dead code beside the live engine. | Grep. | Kept, not called by this app; remove with the next engine pass. |
| H10 | S3 | RL8 | The "Lab tuned" badge was not cleared by a later composition edit. | Gap matrix. | Fixed by the honesty sweep (#856), merged in. One status for the cards, the report and the contract. |

Totals: 30 findings. Fixed 21 (6 S2: 001, 002, 004, 005, 007, 009; 12 S3:
003, 006, 010 to 016, 018, 020, 026; 3 S4: 008, 017, 019), open 5 (021, 022,
024, 028 S3; 027 S4), kept 4 (023, 025, 029, 030 S4). No S1 was found. No S2
is open.

### The report

Built by `buildFluidPdf(collectFluidReportArgs(...))`, the function the
Export button calls. Sections in order:

1. Header: project, company (from the organisation unless typed), field, licence or block, well, reservoir or zone, sample or fluid, sample depth, sampling date and method, laboratory, lab report, analyst, analysis date, analysis type, build, display units, generated time.
2. Headline results with the method beside each value.
3. Inputs and their sources: one row per engine input, the unit, the source and quality; a note says which inputs entered the calculation.
4. Method used for each property: bubble point, Rs, Bo, co, dead, live and undersaturated oil viscosity, Z, gas viscosity, Bg, Bw, water viscosity. Read from `results.meta.methods` (black oil) or `eos.pvtTable.methods` (compositional).
5. Basis and conventions: liberation basis, standard conditions, table temperature, how the bubble point was obtained, absolute pressure, the definition of each volume factor, and in compositional mode the equation of state, the C7+ scheme and the viscosity model.
6. Separator train with its total.
7. Lab tuning: none, or what was matched with measured, before, after and both errors, the regression statement, the parameters before and applied; or the reason the record is withdrawn.
8. Limits of this analysis: what the method does not cover, the published range of each correlation, every input and table stretch outside one.
9. Notes from the engine; flow assurance screening and the sensitivity sweep when they are engaged.
10. PVT table (pressure, Rs, Bo, Bg, Z, oil and gas viscosity, co, Bw, water viscosity, region).
11. The `pvt-1` block as other apps receive it.
12. Plots: Bo, Rs, oil viscosity, Z and Bg against pressure with the bubble point marked; laboratory values against the model; the phase envelope; hydrate screening. The last three are drawn when they apply and otherwise say why.

Sample: `/root/fluid-report-sample.pdf` (how it was produced is in the PR).

### The `pvt-1` contract as written

Writer: `src/utils/fluidstudio/pvtHandoff.js` (`buildFluidPvtContract`),
through `buildPvtContract` in `src/lib/inputProvenance/pvtContract.js`.
Validator and gate: `validatePvtContract`.

| Field | Content |
|---|---|
| `schema`, `source_app`, `project_id`, `project_name`, `generated_at`, `app_build` | `pvt-1`, "Fluid Systems Studio", the saved project, ISO time, the Suite build |
| `model`, `model_detail` | `black-oil-correlations` or `eos`; for an entered bubble point the Rs multiplier and the correlation's own Pb; for the EOS its name, the C7+ scheme, the viscosity model, the components and the plus fraction |
| `units`, `columns` | The unit of every column and scalar, as the engine holds them (psia, degF, scf/STB, RB/STB, Bg in RB/scf, cP, 1/psi); the columns of the table |
| `standard_conditions`, `separator_conditions` | 14.7 psia and 60 degF (black oil), 14.696 psia and 60 degF (EOS); the enabled stages |
| `methods` | One entry per property (`pb`, `rs`, `bo`, `co`, `mu_od`, `mu_o`, `mu_o_undersaturated`, `z`, `mu_g`, `bg`, `bw`, `mu_w`): method, reference, kind, note |
| `basis` | Flash (separator) basis of the correlations, or differential adjusted to the separator train |
| `pb_source` | `solved`, `entered`, `standing-explicit`, `no-solution-gas` or `eos` |
| `tuning` | `none`; or `tuned` with the parameters, what was matched (measured, before, after, errors), convergence and bounds; or `stale` or `tuned-unrecorded` |
| `range_flags` | Each input, and each stretch of the table, outside a published range, with the properties it reaches |
| `inputs`, `at_saturation`, `identification` | The fluid inputs; values at the saturation pressure; the project identification |
| `table` | The engine's rows |

Delivery: router state (`fluidStudioData`, the version 1 keys where they
were, the block under `contract`), and the saved project (`inputs_data.pvt`),
read by id with `readFluidProjectPvt` in `src/lib/pvtSource.js`. The sender
saves the project before navigating and puts `?fluidProject=<id>` in the
address. `.pld` packages carry the block with the project.

| Consumer | Today | Intake it will use |
|---|---|---|
| Well Test Analysis Studio | **Reads `pvt-1`** (this PR): Bo and viscosity with the method of each, the project and the time; API, GOR, gas gravity and temperature as inputs of the fluid model; a value edited later is marked; the block (without the table) is stored with the Well Test project | `pvtIntake` with its field map; `?fluidProject=` read by id |
| Line Sizing Studio | Reads the version 1 keys, unchanged; method names dropped | Its round: `pvtIntake(handoff, fieldMap)` for gravities, GOR, temperature and WAT; print `pvtContractSourceText` |
| Material Balance Studio | Recomputes with its own prefill (H5, honesty sweep) | App 2: a project picker over `saved_fluid_studio_projects`, `readFluidProjectPvt(id)`, the `table` rows as the PVT table with `methods` and `basis` printed as the PVT source; undersaturated Bo and co from the same block; Bw and water viscosity for the aquifer |
| Reservoir Simulation Studio | Calls `computePvtTable` with fixed correlations | App 8: `readFluidProjectPvt(id)`; PVTO and PVDG from `table`, PVTW from `at_saturation.Bw` and `mu_w`; the block's origin, methods and basis as deck comment lines |
| Voidage Replacement Monitor | Own correlations on typed inputs | App 7: Bo, Bg, Bw and Rs against pressure by interpolation in `table`; `units.Bg` read from the block; FVF source printed from `methods` |
| Waterflood Design Studio | Viscosities and FVFs typed | App 6: `at_saturation` or the table at the flood pressure for oil and water viscosity, Bo and Bw, each with `pvtContractSourceText` |
| Nodal Analysis Studio | `nodal/pvt.js` defaults | Production round: inputs and correlation names from `inputs` and `methods`, or the table by interpolation |

Sharing: with the Reservoir sharing migration applied (#858), a fluid a
colleague shared with the organisation is readable by a consumer through
`readFluidProjectPvt` under the same view permission as the project; a
private one answers "not found, or it is not yours to read".

### Where validation is weaker than asked

- **McCain Bw and water viscosity.** The engines gates are monotonicity only. The gate added here is a second transcription of the published coefficients and one hand value; no published worked example could be read (PetroWiki, which carries one, redirects to a landing page). Stated range of Bw: to 260 degF and 5,000 psia, from a search summary of the same page, not from the primary source.
- **The entered bubble point multiplier** (005). One-point matching of a correlation by a multiplier is common practice in black-oil matching, but no published numeric example was read. The gates are identities: continuity of Rs, Bo and viscosity at Pb, monotonic Rs, and a multiplier of exactly 1 when Pb is solved.
- **Bo above Pb** (007). Validated by its defining identity (co = -(1/Bo) dBo/dp) against the co the same engine prints, not against a published table.
- **Published ranges.** Taken from the engines library comments and the app's own table (Standing from Ahmed). Sutton (0.57 to 1.68) and the Standing pressure range (130 to 7,000 psia) are from memory of the standard tabulations and were not re-read. Papay has none.
- **Simulation deck.** The Bo correction (007) moves the 14 undersaturated PVTO rows of `worker/sim-worker/tests/integration/fixtures/generated/BUILT.DATA` and `BUILT_S4.DATA`. Both fixtures were regenerated; the OPM flow acceptance that consumes it is a worker test outside the Suite CI and was not re-run.
- **Record sharing** is tested on the in-memory mirror of the database rules and, in the browser, only for the owner of a private project in the harness (no organisation there). No two-account walk was made.
- **Golden hashes** of the tuned compositional report depend on the regression reproducing to the printed digit on the CI runner; the Well Test goldens already rest on the same assumption.

### What the gap matrix had wrong or missed

- "The handoff is lost on a page refresh": a refresh keeps router state (the browser history holds it). It is lost on a fresh visit, a copied link or a new tab (003).
- RL8 was graded Pa with "tier badges, error after tune": the error after tune was not saved, so after a reload it could not be shown or printed (013).
- RL7 "whether the black-oil Bo is flash or differential is unstated": confirmed, now stated.
- Not in the matrix: the entered bubble point defect (005), the Bo and co inconsistency above Pb (007), salinity entering nothing (015), the P-T door reading bar as psia (009; the matrix said "no import door").
- "Composition, lab targets and the P-T profile are typed": the P-T profile is pasted text, which is an import door, and it was the worst one in the module.

### Persona walks (PL8)

**1. PVT specialist from PVTsim or PVTP.** Opens the compositional model,
types the composition from the lab report (would now: paste it, U2-009),
enters measured Psat and a separator test, tunes. *Before:* the match table
vanished on reload and nothing printed. *Now:* the report carries what was
matched and the errors, and withdraws it when the fluid moves. Would now:
load the CCE and DL tables and tune to them (U2-001, U2-002); see the
viscosity tuned to data (U2-002); split C7+ (U2-011); run a CVD for a
condensate (U2-010); export PVTO and PVDG (U2-003); see the uncertainty of
the tuned parameters (U2-008).

**2. Reservoir engineer with no lab report.** Types API, GOR, gas gravity,
temperature and a measured bubble point. *Before:* the table jumped at the
entered Pb and Bo above it did not follow its own compressibility. *Now:*
the curve meets the GOR at the entered pressure and says by how much the
correlation was moved. Sends the fluid to Well Test, whose report names
Standing and the project. Would now: match Bo and viscosity as well as Pb
(U2-004); send the same fluid to Material Balance and Simulation (their
rounds).

**3. Manager reading the report.** *Before:* a CSV. *Now:* a nine page PDF
with the sample identified, the method of each number and the limits. Would
now: a one page summary first (U2-023).

## Step 2: advancement review (analysis only)

### 2a. Competitor parity

From public documentation only, read on 2026-10-02: the PVTsim Nova
Technical Overview 2025 (calsep.com), the PVTP product page and insert
(petex.com), a third-party excerpt of the Multiflash 6.0 User Guide (KBC's
own pages returned 403, so Multiflash is the weakest column), and the
whitson+ manuals (manual.pvt.whitson.com, manual.whitson.com). "NF" means
not found in the pages read, which is no proof of absence.

| Capability | PVTsim Nova | PVTP | Multiflash | whitson+ | Ours | Gap |
|---|---|---|---|---|---|---|
| Equations of state | PR and SRK variants, PC-SAFT, GERG-2008, CPA | PR and SRK with volume shift | PR, SRK, CPA, PC-SAFT, GERG | PR and SRK with Peneloux | PR78 with Peneloux | SRK missing |
| C7+ splitting and lumping | Exponential split, lumping schemes | Exponential and gamma (Whitson), lumping and delumping | Split method NF; delumping | Gamma model to C36+, lumping | One pseudo-component | Missing |
| Experiments simulated | CME, CVD, DL, separator, viscosity, swelling, multi-contact, slim tube | CCE, CVD, DL, separator, swelling, slim tube | CME, DL, CVD, separator | CCE, DLE, CVD, separator, viscosity | CCE, DL, separator | CVD, viscosity experiment, swelling |
| Regression | Tc, Pc, acentric, LBC; weights; multi-fluid common EOS | Matches CCE, CVD, DL, separator | Tuning to lab tests | BIPs, Tc, Pc, Tb, weights | Four C7+ parameters to Psat and one separator test | Tune to CCE, DL, CVD and viscosity rows |
| Tuned-parameter uncertainty | NF (history and before/after only) | NF | NF | NF (deviation plots) | Computed, not shown | Showing it would be ahead |
| Lab report import | PRODML and Excel | NF | Imports PVTsim files | Manual entry as a digital twin of the report | None | Missing |
| Lab data QC | QC module: mass balance, OBM, separator equilibrium | NF | Validation against lab tests | Hoffman, recombination, material balance, Y-function | None | Missing |
| Simulator and app export | 30+ interfaces (Eclipse, IMEX, tNavigator, OPM, Prosper, MBAL, OLGA) | MBAL, PROSPER, simulation tables | PIPESIM, OLGA, PROSPER | Eclipse PVTO, PVTG, PVDG, CMG, tNavigator, PROSPER | CSV, the Material Balance schema, `pvt-1` inside the Suite | Simulator keywords missing |
| Black-oil correlations matched to lab | NF | Black oil model matching | Black oil analysis | NF | One-point Pb match (new) | Bo, Rs and viscosity matching |
| Viscosity models | CSP (Pedersen) or LBC | LBC and Pedersen | SuperTRAPP, Pedersen | LBC and Pedersen, tuned | LBC untuned | Tuning; a corresponding-states option |
| Flow assurance and water | Hydrates with inhibitors, wax, asphaltene, scale, water analysis | Hydrates with inhibitors, wax | Hydrates, wax, asphaltene, scale | Water PVT | Motiee hydrate screen; McCain water (new) | Inhibitors, wax model |
| Plots and report | Phase envelope; one-click compare with experimental data; Word QC report | Phase and hydrate envelopes | Envelope with phase-fraction lines | Envelope; lab-style Excel and PDF study; multi-sample plots | Envelope; property plots; lab against model; the PDF report (new) | Lab against model per experiment; quality lines |
| Depth gradient | Yes | Yes | NF | NF | None | Missing |
| Mixing and recombination | Recombination, mixing of up to 100 fluids | NF | Blending | Recombination GOR adjustment | Two-stream black-oil blend | Recombination to a GOR |

Read across the four tools, a practitioner expects, in this order: SRK
beside PR; CVD beside CCE, DL and separator; regression to full experiment
tables; a viscosity model tuned to data; export to named downstream tools; a
phase envelope with exportable data (all four); C7+ splitting, lab data
validation, contamination cleaning, hydrates with inhibitors, recombination
(three of four); lab against model plots with a lab-style report, regression
weights with an audit trail (two of four).

### 2b. Deferred backlog harvest

| Item | Source | Decision |
|---|---|---|
| Lab PVT report import for CCE and DL | Plan row 1, owner question 14 | Wanted: U2-001 |
| CCE and DL row-matching targets | ET out-of-scope register | Wanted: U2-002 |
| LBC critical-volume tuning to viscosity | STATUS (transport) | Wanted: U2-002 |
| Tuned-parameter uncertainty in the UI | ET register ("covariance computed and logged, not surfaced") | Wanted: U2-008 |
| Lab against model plots | Plan row 1 | Started here (Psat, Bo, GOR); per experiment in U2-001 |
| CVD | FS and ET registers | Wanted: U2-010 |
| C7+ splitting (gamma or Pedersen) | FS register | Wanted: U2-011 |
| SRK | FS register | Wanted, lower: U2-012 |
| Material Balance side CSV importer | STATUS FS7 | Superseded by the `pvt-1` intake of app 2 |
| Per-component regression variables, omega regression, multi-fluid tuning | ET register | Deferred: U2-024 |
| Three-phase flash, full Newton flash | FS register | Deferred (no user-visible gap today) |
| Asphaltene and wax thermodynamics | FS register | Deferred: U2-013 covers hydrate inhibitors only |
| Compositional batch sweeps | FS register | U2-021 |
| Compositional gradient with depth | FS register | U2-016 |
| Flowline heat-loss and pressure-drop | fluid-studio-rebuild memory ("Phase 4+") | Not here: Line Sizing and Nodal own hydraulics. The unused flowline inputs should then go (FLUID-U1-025) |
| Nodal handoff | fluid-studio-rebuild memory | The Nodal intake of `pvt-1` (table above) |
| "PVT QuickLook" card in ProductionOptimization.jsx | STATUS | Cosmetic, not routed; leave |
| Good Oil stock-tank at 75 degF | ET2 finding | Covered: a stage can be added; say it in U2-001 |

### 2c. Suite integration

Reads: the organisation name (report header), the Suite unit profile.
Writes: `saved_fluid_studio_projects` (inputs, identification, sources, the
`pvt-1` block). Sends: router state with the block to Well Test and Line
Sizing. `.pld`: the apps family carries the table.

| Finding | Kind | Detail |
|---|---|---|
| Six consumers, two wired | downstream | The intake of each is in the contract table above. Every consumer should store the block with its own project and show "the source project changed since" when the saved block's `generated_at` moved. |
| Wells registry | upstream ignored | The sample's well and field are typed; a well picked from the registry could propose them, as Well Test does. U2-025. |
| Well Test gas PVT | downstream | Well Test computes gas Z itself (Papay twin in `utils/welltest/gas.js`). One Z in the Suite: U2-006. |
| ReservoirCalc Pro | downstream | Bo and Bg for volumetrics are typed there; a `pvt-1` intake at initial pressure would give them a source. Not in the plan's list. U2-005. |
| Petroleum Economics Studio, Flare gas | downstream | Take GOR and gas gravity as typed inputs; low value, no item. |
| Record sharing | platform | Adopted here (FLUID-U1-026). |

### Ranked backlog

Sizes: S under a day, M two to four days, L a week or more.

| Rank | ID | Item | Size | Value in one line | Batch |
|---|---|---|---|---|---|
| 1 | U2-001 | Lab PVT tables in: CCE, DL, separator test and viscosity as CSV or xlsx through `src/lib/tabularFile.js` (header detected, units at the door, read-back), saved with the project; each drawn against the model on screen and in the report | M | The first thing every PVT practitioner brings | A |
| 2 | U2-004 | Black-oil correlations matched to measured Pb, Bo, Rs and viscosity (multiplier and shift per property, stated in the methods and the contract) | S-M | The engineer with a lab summary and no composition | A |
| 3 | U2-003 | Simulator export: PVTO, PVDG and PVTW keywords with the `pvt-1` origin, methods and basis as comment lines; a `pvt-1` JSON download | S | Parity with all four tools on export, and what Simulation will read | A |
| 4 | U2-006 | Z from the canonical engines (Dranchuk-Abou-Kassem or Hall-Yarborough, selectable) with a Standing-Katz check; one Z for Fluid Systems and Well Test | S (engines-first) | Retires an unverified correlation in the keystone table | A |
| 5 | U2-008 | Tuned-parameter uncertainty shown: 95 percent intervals from the covariance the engine already computes, in the card, the report and the contract | S | A strength none of the four tools documents | A |
| 6 | U2-009 | Composition door: paste or file (component, mol% or mole fraction), aliases, read-back | S | Twelve numbers typed today | A |
| 7 | U2-007 | Vasquez-Beggs gas gravity corrected at the first Separator Train stage | S | The stated separator basis becomes the real one | A |
| 9 | U2-005 | A shared PVT intake card (`PvtIntakeCard`: pick a saved Fluid project, show methods and basis, mark edited values, "source changed since") for the consumer rounds; ReservoirCalc Pro as an extra consumer | S-M | Each consumer round becomes wiring | A |
| 10 | U2-002 | Tuning to CCE and DL rows and to measured viscosity (LBC critical volumes), with weights | M-L (engines) | Regression parity | B |
| 11 | U2-010 | CVD simulation for gas condensates, with liquid dropout plot and PVTG export | M (engines) | The condensate workflow | B |
| 12 | U2-018 | Lab data checks at the door: Y-function, material balance of DL, Hoffman plot | M | Catches a bad lab table before it is tuned to | B |
| 13 | U2-020 | Recombination of separator oil and gas to a target GOR | M | Samples arrive as separator pairs | B |
| 14 | U2-022 | Water: salinity in Bw, gas-saturated water, water compressibility | S | Complete PVTW | B |
| 15 | U2-021 | Sensitivity sweep figure in the report; a compositional sweep | S | Closes FLUID-U1-027 | B |
| 16 | U2-023 | A one page summary sheet as page 1 of the report | S | The manager's page | B |
| 17 | U2-025 | Identification proposed from the wells registry | S | Less typing, one source of well names | B |
| 18 | U2-011 | C7+ splitting (gamma model, lumping) | L (engines) | Heavy-end fidelity; needed before CVD is trusted for lean condensates | C |
| 19 | U2-012 | SRK equation of state | M (engines) | Parity; low user value beside PR78 | C |
| 20 | U2-013 | Hydrate curve with inhibitor dosing | M | Flow assurance parity; belongs with Flow Assurance in Production | C |
| 21 | U2-016 | Compositional gradient with depth | L | PVTsim and PVTP parity | C |
| 22 | U2-017 | Quality lines on the phase envelope | S-M | Multiflash parity | C |
| 23 | U2-019 | Oil-based mud decontamination | L | PVTsim and whitson parity | C |
| 24 | U2-024 | Per-component regression variables, multi-fluid common EOS | L | Specialist depth | C |

Batches:
- **Batch A** (NAPE-safe, no schema change, makes the consumer rounds easier): U2-001, 004, 003, 006, 008, 009, 007, 005.
- **Batch B:** U2-002, 010, 018, 020, 022, 021, 023, 025.
- **Batch C:** U2-011, 012, 013, 016, 017, 019, 024.

### Owner questions

| # | Question | Recommended default |
|---|---|---|
| 1 | Lab PVT import: which formats do customers hold? (plan question 14) | A plain table (CSV and xlsx, header detected, units at the door) for CCE, DL, separator test and viscosity; vendor formats when a customer file arrives |
| 2 | The Bo correction above the bubble point (FLUID-U1-007) moves numbers in this app, in the Material Balance prefill and in the Simulation PVTO rows (the worker's BUILT.DATA fixture is regenerated; its OPM acceptance was not re-run). | Accept: it is a correction, the old curve contradicted its own compressibility. Saved Material Balance cases that were prefilled keep the rows they stored; a note in the Material Balance round says to prefill again. Run the worker's flow acceptance once before the next worker deploy |
| 3 | Bg is now shown in RB/Mscf in oilfield units (it was RB/scf on screen). | Keep RB/Mscf: it is the Suite registry unit and the Material Balance schema. The contract table stays RB/scf and says so |
| 4 | SI pressure is kPa, as in Well Test, even when a profile says bar or MPa. | Keep the two-system switch for now; per-family units when the consumer apps do the same |
| 5 | Replacing Papay's Z (U2-006) changes Z, Bg and gas viscosity in the black-oil table. | Do it in Batch A, engines-first, with a Standing-Katz check and the before and after on the sample in the PR |
| 6 | Should a consumer read the fluid as it was when sent, or as it is now? | The block as sent is stored with the consumer's project; the consumer shows "the source project changed since" and offers to read it again. Never silently |
| 7 | Sharing: may a colleague's Fluid project be read by my Material Balance case? | Yes, by the same view permission as the project itself (the migration is applied). A two-account walk on staging is still owed, with the Geoscience one |
| 8 | Will a reviewer read the sample report before NAPE? (plan question 11) | Send `/root/fluid-report-sample.pdf` with the RL checklist as the review form |

## Batch decision (programme lead, 2026-10-02)

Recorded verbatim from the build brief of `feat/fluid-u2`.

BUILD in this order, one commit per item:

- Batch A, all eight: (1) lab PVT table import for CCE and differential liberation as plain tables (CSV and xlsx through the shared readers, header-detected, units at the door, hostile file set; lab rows stored with the project, shown against the model on every PVT plot and in the report's "lab against model" figure with the misfit per property stated); (2) correlation matching to the lab Bo, Rs and viscosity (a stated shift or multiplier per property, what was matched and the error before and after recorded in `pvt-1.tuning`, the report and the handoff; honest status: "matched to lab" only while it holds); (3) PVTO / PVDG / PVTW keyword export for the simulator, units and conventions stated in comment lines, round-trip tested against the Simulation Studio deck builder's own reader, and the worker fixtures untouched unless you mean to change them; (4) Z factor from the canonical engines library with a Standing-Katz check against published chart values (engines-first if the engine lacks it; this replaces Papay and MOVES Z, Bg and gas viscosity: state before and after on the sample in the PR and the doc, re-pin tests, regenerate the Fluid report goldens deliberately); (5) tuned-parameter uncertainty shown where the tuning produces it; (6) the composition door on the shared typed reader with units and hostile files; (7) the Vasquez-Beggs separator gas-gravity correction made to follow the entered separator stage instead of the fixed 100 psia (validated against the published correction formula with a worked value; negative control); (8) a shared PVT intake card component (`src/lib/inputProvenance` or beside it) that any consuming app mounts: shows the source project, time, methods, range flags, "source changed since" and "edited after intake", with tests; adopt it in Well Test's intake as the first user without changing Well Test's report output unless deliberate.
- Batch B: water salinity applied in Bw (published correlation with its reference and a worked value; today salinity enters water viscosity only); lab data QC (monotonic checks, material-balance style consistency of the DL data, flagged, never silently corrected); identification proposed from the wells registry (user confirms); the one-page summary and the sweep figure if time remains.
- DEFERRED (record reasons): tuning to CCE/DL/viscosity rows for the EOS path, CVD, recombination (M to L each, after NAPE); all of Batch C (C7+ splitting, SRK, hydrate inhibitors, depth gradient, quality lines, OBM cleaning, per-component regression).

Owner-question defaults in force: lab formats are plain CSV/xlsx tables; Bg shown in RB/Mscf; SI pressure stays kPa; consumers keep the block as sent and flag "source changed"; a colleague's shared fluid is readable by consumers.

Backlog ids of the chosen items: A1 = U2-001, A2 = U2-004, A3 = U2-003, A4 = U2-006, A5 = U2-008, A6 = U2-009, A7 = U2-007, A8 = U2-005; Batch B = U2-022, U2-018, U2-025, U2-023, U2-021.

| Deferred | Reason |
|---|---|
| U2-002 tuning to CCE, DL and viscosity rows for the EOS path | M to L, engine work in the regression; after NAPE |
| U2-010 CVD | M, a new experiment in the engines with its oracle; after NAPE |
| U2-020 recombination | M; after NAPE |
| Batch C (U2-011, 012, 013, 016, 017, 019, 024) | L or specialist depth; none is needed by a consumer round |

## Step 2 as built (`feat/fluid-u2`)

One row per item is added below as it is built.

| Item | What was built | Proving tests |
|---|---|---|
| A1, U2-001 lab PVT tables | The lab data door (`LabDataDoor.jsx`, the "Lab data" tab of the setup panel) on `src/utils/fluidstudio/labData.js`: a CSV or text file, an Excel sheet (through `readTabularFile`) or a pasted block, read by the shared typed reader. Columns are found by header in any order (the laboratory's own names are known: "Relative Oil Volume, Bod", "Relative Total Volume", "Deviation Factor, Z"); the unit of each column comes from the header or from the choice at the door; gauge pressure is brought to absolute with the atmosphere stated; the door reads back what it read and every line it did not, asks the reader's decimal mark question, and stores nothing until Load is pressed. Three tables: constant composition expansion, differential liberation, viscosity. Rows are stored with the project (`inputs.labData`, jsonb, no migration) in engine units. Differential rows are adjusted to the separator basis with the separator test Bofb and Rsfb (Bo = Bod Bofb / Bodb, Rs = Rsfb - (Rsdb - Rsd) Bofb / Bodb, Bo above Pb = Vrel Bofb); without them they are drawn as differential and said so. The model table is carried up to the highest lab pressure. Lab points are on every PVT plot (black-oil and compositional), with a sixth plot, relative volume, when a CCE table is loaded. The report gains input rows per table with the file and the read-back, "Laboratory tables loaded", "Laboratory data against the model" (points, mean deviation, bias, largest deviation and where, basis), notes (saturation pressure of the lab against the model, temperature mismatch, rows left out), and two lab figures (oil properties; gas properties and relative volume) with the misfit in the caption. `pvt-1` gains `lab_data` (tables, basis, separator test, saturation pressure, misfit). | `fluidLabData.test.jsx` (22): the hostile set of `e2e/fixtures/fluid-systems/lab/` (eight files of one published study, Good Oil Co. Well No. 4, Core Laboratories RFL 88001) against its twin, one pinned value per unit conversion, a negative control (read as psia and RB/scf), refusals with their reason, the adjustment gated on Ahmed Example 3-5 (Bo 1.379, Rs 371, Bt 1.916) with a negative control. `fluidLabReport.test.jsx` (16): plots, report rows read back from the PDF, point counts of the lab panels against the screen series, `expectFigureDrawn` with a negative control, the contract block, the door on the page. Golden `black-oil-lab-good-oil`. |
| A2, U2-004 correlations matched to lab | `src/utils/fluidstudio/labMatch.js` and the "Match the correlations to the laboratory data" card on the PVT tab. One stated linear adjustment per property, value = multiplier x correlation + shift (the two-parameter match of commercial black-oil packages): the bubble point is set to the laboratory saturation pressure; Rs is fitted to the lab Rs rows below it and still meets the solution GOR there (below the lowest lab pressure the shift is tapered out, so Rs returns toward zero with the correlation); Bo is fitted over every lab row, above and below Pb, in one least-squares fit; the oil viscosity takes a multiplier fitted in logarithms. The engine applies them inside `boAt`, `muObAt`, `muOdAt` and `saturatedRs`, so the table, the separator card, the handoff and the simulator export all carry the matched values, and `blackOilMethods` writes the multiplier and shift beside the correlation name. A fluid with no match is unchanged to the last digit (the black-oil snapshot pin holds). Recorded in `pvt-1.tuning` (`kind: black-oil-correlation-match`: parameters, what was matched with the mean and largest deviation before and after, the uncertainty), in the report ("Lab tuning": text, "Lab values matched", "Tuning parameters") and in the consumer's source words ("correlations matched to lab data"). Honest status: `labMatchState` is `matched` only while the fingerprint of the fluid inputs, the correlation choice, the first separator stage (Vasquez-Beggs only) and the lab tables is the one the fit consumed; otherwise the card, the report, the contract and the consumer text say "Matched, not confirmed" and withdraw the table. A blend is never matched. Differential rows with no separator test are not fitted (the bubble point and the viscosity still are). On Good Oil Well No. 4 with Standing and Beggs-Robinson: Pb 2,503 to 2,635 psia (lab 2,635); mean deviation of Rs 22.1 to 3.2 percent, Bo 1.9 to 0.3 percent, viscosity 8.3 to 5.0 percent; Bob 1.4873 to 1.4754 against the lab 1.474. | `fluidLabMatch.test.jsx` (36): the least-squares routines against the certified values of the NIST Statistical Reference Datasets NoInt1 and Norris (estimates and standard deviations, with a negative control); a laboratory table made from the engine with known parameters is recovered, and with the shift applied the wrong way round it is not; Rs meets Rsb at the lab Pb, Bo and viscosity are continuous there, Rs is monotonic; no neighbouring parameter value fits better; every property improves for all three correlation sets; eight edits each turn the status stale in the card, the report, the contract and the consumer text; the report rows read back from the PDF; the completeness guard. Mutation check: removing the shift in `boAt` or in `saturatedRs` fails 7 and 9 tests. Golden `black-oil-lab-good-oil` now holds the matched study. |
| A3, U2-003 simulator keywords | `src/utils/fluidstudio/simKeywords.js` and two buttons beside "Export PVT CSV": "Simulator keywords" (an `.INC` file) and "pvt-1 JSON". PVTO, PVDG and PVTW in FIELD units from the pvt-1 table, through the emitters and the record builder the Simulation Studio deck builder uses (`emitPVTO`, `emitPVDG`, `emitPVTW`, `pvtoRecordsFromTable`), so for the same fluid the PVTO and PVDG blocks are the builder's own. Comment lines carry the origin (project, time, build), the fluid model, the liberation basis, the bubble point and its source, the lab tuning or match, the method of all twelve properties, the separator stages, the range flags, the units (psia absolute, Rs Mscf/STB, Bo and Bw RB/STB, Bg RB/Mscf, cP, 1/psi, standard conditions) and the conventions of each keyword. PVTW is written at the bubble point with Bw and the water viscosity from the table and the compressibility and viscosibility from the slope of their columns. A dew-point fluid is refused with the reason (it needs PVTG). Plain ASCII. A small reader of the three keywords sits beside the writer. | `fluidSimExport.test.jsx` (11): for the builder's default fluid the exported PVTO and PVDG equal the builder's blocks character for character and appear in its deck, with a negative control (Rs or Bg in the wrong unit); the export read back gives every table row in deck units; the water compressibility and viscosibility against the slope of the engine's own water functions (within 5 percent, the table prints Bw to four decimals); the comment lines; the refusals; the compositional table. The simulator as the reader: `worker/sim-worker/tests/integration/test_fluid_export_deck.py` runs `FLUID_EXPORT.DATA` (the builder deck with its PVT keywords replaced by this export) through validation and OPM Flow; the fixture is generated and pinned by the jest test. The worker gate is run once in an isolated compose project (see the A4 row, which regenerates the deck fixtures). |
| A4, U2-006 Z from the engines library | Engines first: engines PR #299 (`gasZDetail` / `gasZFactor`: Sutton pseudo-criticals into Dranchuk-Abou-Kassem or Hall-Yarborough, gated on 204 readings of the Standing-Katz chart; both solvers now return the first root where their Newton walk left the curve). The black-oil table, its KPIs and everything built on `computePvtRow` (the report, the CSV files, the pvt-1 block, the simulator export, the Simulation deck builder and the Material Balance prefill) use it: Dranchuk-Abou-Kassem by default, Hall-Yarborough selectable on the Correlations tab (`correlations.z_factor`, saved with the project; an old project opens on the default). The method row names the method, its reference and the window it was checked over; the range flags now say when the gas is below pseudo-reduced temperature 1.2 or a table row above pseudo-reduced pressure 15 (the Papay clamp flag is gone). The Material Balance prefill follows the PVT tab's z-factor choice, which it could not before. Before and after on the sample (API 32, GOR 650 scf/STB, gas gravity 0.75, 200 degF, Pb 2,998 psia): Z at Pb 0.8873 to 0.8710 (-1.8 percent), Bg at Pb 0.9845 to 0.9660 RB/Mscf (-1.9 percent), gas viscosity at Pb 0.02051 to 0.02075 cP (+1.2 percent); at 4,000 psia Z 0.9555 to 0.9213; the largest change of Z in the table 7.6 percent. Papay against the chart: 2.5 percent mean and up to 10 percent off from Tpr 1.4 to 2.0. Not moved, and said: the legacy `zFactor` (Papay) stays exported, unchanged, for Nodal Analysis (`utils/nodal/pvt.js`, `cullenderSmith.js`) and the gas well deliverability of Production Operations (`utils/production/gasWell.js`); Well Test has its own Papay twin in `engines/welltest/gas.js`. One Z for the Suite is their rounds' work. | `fluidZFactor.test.js`: every table row is the engine call at its pseudo-reduced state; Hall-Yarborough when selected; the app path against Ahmed Example 2-5 (z = 0.85 read from the chart) within 1.5 percent, with Papay as the negative control (more than 3 percent off); the before and after pinned. Engines: `fluid.blackOilU2.test.js` (the chart gate, its negative controls, the solver repairs bit-identical where they were right). Re-pinned on purpose: the black-oil snapshot, the five Fluid report goldens, the pvt-1 gate, the ranges table, the deck fixtures `BUILT.DATA`, `BUILT_S4.DATA` and `FLUID_EXPORT.DATA` (PVDG only), the Material Balance prefill label test. |
| A9, U2-026 table top pressure (added by the programme lead, 2026-10-03, from the Material Balance round) | The table ended at max(1.4 Pb, Pb + 2,000 psi), so a deeply undersaturated reservoir could not take its PVT and the Material Balance intake refused it. Now `inputs.tableRange` ("Highest table pressure (optional)" on the Stream A tab) carries the table at least to a set pressure; the default is unchanged and a set top never shortens the table. A consumer asks for it through the address: `/dashboard/apps/reservoir/fluid-systems-studio?fluidProject=<id>&pvtPMax=<psia>&pvtFor=<app>` (`rangeRequestUrl` in `src/utils/fluidstudio/tableRange.js`, re-exported from `src/lib/pvtSource.js`); the page opens the project, applies the request and says so; the user saves; the consumer reads the block again. `pvt-1` gains `pressure_range` (min, max, requested max, source `default`/`entered`/`consumer`, who asked). The published pressure ranges still flag the rows above them (Standing 7,000, Vasquez-Beggs 5,250, Lee-Gonzalez-Eakin 8,000, McCain Bw 5,000 psia). The report prints the set top as an input with its source. | `fluidTableRange.test.js` (6, written before the code and failing on the missing module): default unchanged, a 9,000 psia top, no shortening, the range flags above the published limits for Standing and Vasquez-Beggs, the address request and its refusals, the contract block. |
| A5, U2-008 tuned-parameter uncertainty | Where the tuning produces it. The compositional C7+ regression: the engine (engines PR #299) returns standard errors and Student t 95 percent intervals of the four knobs from the regression covariance, withheld for a knob at a bound and when a target cannot be evaluated; the record of the fit keeps them (`tuning.fit.uncertainty`, no matrix), the Lab tuning card shows a "95 percent interval" table while the tune is current, the report's "Tuning parameters" table gains the column and a note on how it was obtained and what it does not mean, `pvt-1.tuning.uncertainty` carries it by addition, and all three withdraw it with the record when the fluid moves. An interval wider than the regression bounds says the data do not pin the knob. The black-oil correlation match (A2) states its own intervals the same way. | Engines `fluid.labTuneUncertainty.test.js` (the curvature identity on the Good Oil joint tune with a scaled-covariance negative control); `fluidTuneUncertainty.test.jsx` (5): the record, the report, the block, the withdrawal, the card. |
| A6, U2-009 composition door | `src/utils/fluidstudio/compositionImport.js` and "Load a composition" on the Composition tab (`CompositionDoor.jsx`): a CSV or text file, the first sheet of a workbook, or a pasted block, on the shared typed reader. Laboratory names are understood (methane, CH4, C1; i-Butane, iso-Butane; Heptanes plus, C7+); the basis comes from the header (mol%, mole fraction), from the choice at the door or from the total (100 or 1), and says which; the C7+ molecular weight and gravity are read as columns of the C7+ row or as rows of their own; a weight percent column beside the mole percent is left alone; totals, titles and comments are left out and listed; rows whose MW and SG cells are empty keep the width of the table. Refused with the reason: weight percent only, a heavy end split into carbon numbers with no C7+ row, a total of neither 100 nor 1, no names. The read-back shows before "Use this composition" replaces the feed (the pressure, temperature and envelope settings are kept). | `fluidCompositionDoor.test.jsx` (10): the hostile set `e2e/fixtures/fluid-systems/composition/` (the Good Oil reservoir fluid in five shapes) against the engines literature fixture, a negative control (a mole percent table taken as fractions), the refusals, the names, the door on the tab feeding a valid flash. |
| A7, U2-007 Vasquez-Beggs separator gravity | The engines function `vasquezBeggsReferenceGasGravity` (engines PR #299: gamma_gs = gamma_g [1 + 5.912e-5 API Tsep log10(psep / 114.7)], Tsep in degF) on the first (highest pressure) enabled separator stage, in place of the fixed 100 psia at the reservoir temperature; with no stage the gravity is taken as given (Vasquez and Beggs allow it) and the methods table says which. The Rs and Bo of the correlation then apply no correction of their own. Only Vasquez-Beggs reads the stage (Standing and Glaso are unchanged; the sample is unchanged). The report lists the stage used and the corrected gravity as an input row. Worked value, Ahmed oil 1: 0.851 [1 + 5.912e-5 (47.1)(60) log10(164.7 / 114.7)] = 0.8733 (printed 0.8731). | `fluidVbSeparator.test.js` (7): the reference gravity of all six oils of Ahmed Examples 2-18 and 2-19 through the app, the printed Rs of five within 1.5 scf/STB (oil 4's printed Rs belongs to another gravity, see the engines PR), the negative control (the old fixed separator misses at least four), the worked value, the notes. The `legacy-pre-shell` golden (a Vasquez-Beggs project) is regenerated on purpose. |
| A8, U2-005 shared PVT intake card | `src/lib/inputProvenance/PvtIntakeCard.jsx` on the pure model `pvtIntakeCard.js`: any app that took its PVT from Fluid Systems Studio mounts it with the intake it stored (`pvtIntake(...).intake`), its current values and its field map. It shows the source project and time, the build, the fluid model, the bubble point and its source, the lab tuning or match, each value received against the value now with the method behind it, the range flags, "edited after intake" (a value changed in the consumer) and "source changed since" (the project, read again by id through `readFluidProjectPvt`, was saved after the intake; the values stay as received and a "Read it again" action can be offered). Well Test Analysis Studio is the first user: the card sits at the head of "Reservoir and fluid" in the Data panel (`WELLTEST_PVT_FIELDS` exported for it); its report output is unchanged (the Well Test goldens are untouched). | `pvtIntakeCard.test.jsx` (5): the model on a matched Good Oil handoff, edited after intake, source changed since with a negative control (the same block read again is no change), both together, range flags, the card on the page reading the source again by id. |
| B1, U2-022 salinity in Bw | `bwAt(p, T, salinity)` is the engines `brineBw`: McCain's Bw of gas-free water times the brine ratio of Numbere, Brigham and Standing (1977), Equation 10, read from the Stanford report scan (engines PR #299, gated on readings of the report's Figures 6 and 7). Before, salinity entered the water viscosity only. In the black-oil and the compositional tables, the CSV, the report, pvt-1 and the PVTW export. The method names the correction and the brine ratio's own range (to 10,000 psia, 60 to 400 degF, 250,000 ppm) is flagged. Worked value on the sample (35,000 ppm, 200 degF, at Pb 2,998 psia): ratio 1.00078, Bw 1.0339 to 1.0347 RB/STB. With no salinity Bw is McCain's exactly. | `fluidBrineBw.test.js` (4): the worked value, every row, no salinity, the direction at high and low temperature (the figure's crossover near 230 degF), the method and the range flag. Re-pinned on purpose: the snapshot, the Fluid goldens, `FLUID_EXPORT.DATA` (PVTW). |
| B2, U2-018 lab data QC | `src/utils/fluidstudio/labQc.js`: monotonic trends (relative volume falls with pressure; Rsd and Bod rise; the relative total volume, Bg and the oil density fall; Z within 0.2 to 1.2; oil viscosity falls below Pb and rises above it), the Y function against its straight line (3 percent), and the mass balance of the differential liberation stage by stage (oil mass from density x Bod per residual barrel against the stage below plus 0.0764 lb/scf x incremental gas gravity x the drop in Rsd; 1 percent). Flagged in the lab door, the Report tab, the PDF ("Quality checks of the laboratory tables" and "Mass balance of the differential liberation") and `pvt-1.lab_data.qc`; no row is ever changed. On the published Good Oil study every stage closes within 0.07 percent and only the Y function next to the saturation pressure is flagged, as is usual there. | `fluidLabQc.test.jsx` (6): the published study passes, a worked stage, a corrupted Bod caught by the trend and the mass balance with the data unchanged, three other corruptions, the report and the contract. |
| B3, U2-025 identification from the wells registry | "Propose from the wells registry" at the head of the Identification section of the Report tab (`FluidRegistryProposal.jsx` on `registryIdentification.js`, the Well Test pattern): choose a registry well and, if it has zones, the zone sampled; the well with its identifier, the reservoir or zone and the depth of the zone with its reference are shown beside what is typed, each ticked or not, and nothing changes until "Apply the ticked values". The registry well id is remembered with the project (not printed). | `fluidRegistryIdentification.test.jsx` (4): the proposal, apply only what is ticked, a value already set, the empty registry. |
| B4 one-page summary, B5 sweep figure | Not built: time went to the table-range item the lead added and to the restarts. Both stay on the backlog (U2-023, U2-021). | |

### Not done, and why

- **Engines.** No change to `packages/engines` and no engines PR: the black-oil table of this app lives in the Suite (`src/utils/fluidStudioCalculations.js`, `pvtCalculations.js`), and the water properties call the vendored library as it is.
- **New unit families of Step 0a** are not needed here: pressure, temperature, GOR, both FVF families, viscosity, compressibility and the rates were in the registry already.
- **A file picker for the P-T profile** (xlsx): the door is pasted text; `readTabularFile` can be put in front of it with U2-001.
- **No DDL.** The block and the identification ride in the project jsonb.
