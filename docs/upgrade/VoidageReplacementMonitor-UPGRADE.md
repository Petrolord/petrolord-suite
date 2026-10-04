# Voidage Replacement Monitor: comprehensive upgrade

App #7 of the Reservoir round of the upgrade programme
(`docs/scope/AppUpgrade-Reservoir-PLAN.md`). Step 1 (the practitioner lens
PL1 to PL12 of `docs/scope/AppUpgrade-BestPractices.md` and the reviewer lens
RL1 to RL12 of `docs/scope/AppUpgrade-Reservoir-FeedbackLessons.md`) was run
and fixed on 2026-10-04 on branch `feat/vrr-u1`. Step 2 (advancement review)
is analysis only; the programme lead chooses the batches.

- Route: `/dashboard/apps/reservoir/voidage-replacement-monitor` (ProtectedAppRoute, slug `voidage-replacement-monitor`).
- Harness: `/dev/studio/vrr` (in-memory Supabase double). New for this upgrade: the Fluid Systems projects saved on `/dev/fluid-systems-studio` in the same tab are visible to the VRR harness, so the `pvt-1` chain runs by id.
- Engine: `packages/engines/engines/waterflood/vrr.js` is byte-identical (the course oracle). New math is in `vrrLedger.js` beside it, engines PR #305 (open, not merged), vendored byte-identical with two `vrr-u1` rows in `packages/engines/VENDOR.json`.
- Earlier cycles: V1 to V4 (2026-08-28), senior test T1 (2026-09-27), design system pilot 5.
- Live data: not read (no database access from this run). `saved_vrr_projects` is under the record-sharing rules since migration 20261002130000 (applied).

## What changed, in eight lines

1. **Two S1 in the import door.** "Water Inj (bbl)" was dropped with no word (VRR 0); a daily-rate column on monthly rows was summed as the month's volume (VRR 31.6 for 1.02). The three doors now read through `src/lib/tabularParse.js` with units at the door and a read-back.
2. **The report.** The app had none. A Voidage Replacement Report on the shared Report Kit: identification, every input with unit and source, the voidage ledger by period and by term closing on its totals, the FVFs of every period, patterns, basis, limits and six figures on the calendar axis. A ledger CSV with a provenance header.
3. **The `pvt-1` intake.** The FVFs can come from a Fluid Systems Studio project read by id: its table is kept with the project and read at each period's pressure (a third FVF mode), never extrapolated; the shared PVT intake card says "edited after intake" and "source changed since".
4. **Two S2 in the analysis.** A blank or mistyped FVF read as zero and raised VRR with no word; patterns and their injection advice ignored the pressure track the field used. Both fixed, the second engines-first.
5. **Units.** The Suite unit profile at every field, door, table, axis, report and CSV; stored values stay oilfield, which Material Balance reads.
6. **The Material Balance contract** (`inputs.pressureSurveys[].p_psia` read by id) is kept and pinned by a test, including surveys typed in kPa.
7. **Record sharing** with view and check-out editing, Save a copy, and `.pld` (the family already carried the table).
8. **Honest inputs**: the correlation track needs every fluid input, settings say what was used, the datum is stated, `n/a` for missing values, a help guide rewritten for all of it.

## Evidence kit made for this app

| Kit | Where | What it holds |
|---|---|---|
| Import doors | `src/utils/vrr/__tests__/vrrImportDoor.test.js` (19), `csvImport.test.js` (5) | The hostile set read to its twins; the importer as it stood (`legacyCsvImport.js`, verbatim) as the negative control of every finding; known values (1 sm3 = 6.289811 bbl; 20,684.27 kPa = 3,000 psia) |
| Hostile files | `e2e/fixtures/vrr/hostile/` | 8 ledger files and their twin (semicolons and decimal commas, ambiguous dates, rates on monthly rows, metric units, a preamble with shuffled columns and a totals row, tab with month names and Excel serials, daily rows, split and duplicate rows), 3 pressure files and their twin (kPa, psig with day-first dates, bar gauge) |
| Engine gates | `packages/engines/__tests__/waterflood.vrrvoidage.test.js` (9) | Hand oracle on the V2 fixture; closure against `vrr.js` where free gas dominates; the one-pattern-equals-field invariant under per-period FVFs; negative controls run (free gas without the solution gas fails 4 of 9; advice ignoring `periodFvf` fails 1 of 9) |
| Derived model | `vrrWorkspace.test.js` (18) | 008, 009, 016, 017 with the old behaviour as control; units with one known value per conversion; typing in SI |
| `pvt-1` intake | `vrrPvtIntake.test.js` (11) | Bg RB/scf x 1,000; values at the bubble point; no extrapolation; per-period FVFs from the table; the intake card states |
| Material Balance contract | `vrrMbalContract.test.js` (6) | Material Balance's own `vrrSurveys` and `takeSurveys` on a VRR payload typed in SI; an old payload; `.pld` and sharing membership |
| The report | `vrrReport.test.jsx` (30) on `vrrTestKit.js` | Five goldens (`__fixtures__/reportGolden/`), RL1 completeness guard with negative control, RL2 ledger closure, RL4 header, RL6 captions, ink, marks and point counts against the screen series, RL7 SI known values, RL8 edited after intake, RL9 limits and a withheld VRR, RL11 the block, RL12 the CSV |
| Sharing | `src/contexts/__tests__/vrrSharing.test.jsx` (5) | Own and shared lists, view only, check-out, newer save refused, Save a copy, before the migration |
| Browser | `e2e/vrr-upgrade.spec.js` (10) | Three viewports in both themes, the PDF and the CSV downloaded and read back, the hostile files through the door, the `pvt-1` chain from a Fluid project saved in the same tab, SI typing key by key |

## Step 1: the twenty-four checks

Grades: P pass, Pa partial, F fail. "Was" is the gap matrix grade (from code
reading) or, for PL checks, the state found here.

| Check | Was | Now | Findings | Notes |
|---|---|---|---|---|
| PL1 Labels mean the textbook | Pa | P | 003, 008, 009, 024 | Quantity table below. Free gas is netted at field level (stated). |
| PL2 Hostile files | Pa | P | 001 to 007 | Eight ledger and three pressure files read to their twins or ask. |
| PL3 Units, datums, frames | F | P | 002, 006, 013, 015 | Oilfield only before; no datum; psig and kPa read as psia. |
| PL4 No claim without the event | Pa | P | 016, 017, 028 | The track used silent default fluids; a 0 band became 1.0; the help described the old door. |
| PL5 Real saved state | Pa | P | 012 | Old payloads open (jest); record sharing adopted; `.pld` family present. |
| PL6 Real browser | P | P | 022 | Three viewports, both themes, white charts with the mark, no sideways scroll, no page errors. Title truncates beside the unit switch (kept). |
| PL7 Report a reviewer can sign | F | P | 010 | See RL1 to RL12. |
| PL8 Practitioner's day | gaps | gaps recorded | Step 2 | Persona walk below. |
| PL9 The chain | Pa | P | 014, 027 | Fluid to VRR by id (new); VRR to Material Balance by id (kept, pinned). |
| PL10 Real scale | not run | P | 023 | 54,800 daily rows (50 wells, 3 years, 1.5 MB): read 2 to 4 s (shared reader), derive 0.8 s, report 1.6 s, 8 pages. |
| PL11 Inputs a person can type | Pa | P | 008, 019 | "1,25" was read as 1; SI fields keep "20684." key by key. |
| PL12 House standards | Pa | P | 018 | '-' replaced by `EMPTY_VALUE`; no em dashes or contrastives in new copy; route protected. |
| RL1 Inputs with unit and source | F | P | 010 | Completeness guard over the engine input object, negative control. |
| RL2 Composites show components | Pa | P | 010, 011 | Produced = oil + water + free gas, injected = water + gas, by period, closing on the totals to the printed digits. |
| RL3 Lumped results split | Pa | P | 011 | Voidage was one number per side; now by term. |
| RL4 Identification | F | P | 010 | Seven typed fields, company from the organisation, periods, cut-off and wells from the data. |
| RL5 Data and operations summary | Pa | P | 020 | What the import read (column, unit, where the unit came from, values), rows left out, volumes and FVFs by period. |
| RL6 Every result has its plot | F | P | 010 | Six figures from the screen series; the ones that do not apply say why. |
| RL7 The basis is named | Pa | P | 013, 015 | RB basis, free gas rule, injected fluid FVFs, FVF basis from the block, pressure absolute and its datum. |
| RL8 Strengths kept, claims earned | Pa | P | 014 | Withheld-with-reason gating, conservation audit and target band kept; edits after an intake are marked. |
| RL9 Limits printed | Pa | P | 010 | Constant FVFs, free gas, injected fluid, aquifer and sweep, allocation; flags. |
| RL10 Import doors | Pa | P | 001 to 007, 020 | The gap matrix called this the best importer of the module; it held two S1. |
| RL11 Senders and provenance | F | P | 014 | `pvt-1` read by id with the card; the Material Balance contract pinned. No VRR sender yet (Step 2). |
| RL12 One model | Pa | P | 011 | `deriveVrr` feeds the screen, the report and the CSV; the dashboard charts and the figures share `series.js`. |

### PL1 quantity table

| Quantity | Standard meaning | What the code computes | Same? |
|---|---|---|---|
| Produced reservoir voidage | Np Bo + Wp Bw + (Gp - Np Rs) Bg | `computePeriodVoidage` (vrr.js), free gas floored at zero | Yes; floor stated |
| Injected reservoir volume | Wi Bw + Gi Bg | Same | Yes; injected water at the produced-water Bw, injected gas at the produced-gas Bg (stated) |
| Instantaneous VRR | Injected over produced, one period | Same | Yes |
| Cumulative VRR | Sums to date, injected over produced | Same | Yes |
| Rolling VRR | Sums over a trailing window | `computeRollingVRR` | Yes |
| Free gas | Per well in some tools, per field in others | Per period at field (or pattern) level | Stated as a limit; per-well option is U2-003 |
| Period FVFs | At the period's average pressure | Constant, correlation track at mid-month pressure, or the `pvt-1` table at mid-month pressure | Yes; the patterns now use the same (009) |
| Rates in a file | Calendar-day average rate | Was summed as a volume (003) | Fixed |

### Persona walk (PL8)

A surveillance engineer closes the month: exports the allocation (oil in BOPD, injection in barrels per month), drops it in, reads VRR by pattern, checks pressure, sends the pressure to the material balance and prints for the asset review. Before this round the first step gave VRR 31.6 with no warning. Now the door says what it read and converts the rates; the report prints. Gaps that remain: no bubble map of the patterns, allocation factors typed by hand (no CRM suggestion), no sender of the VRR series to Material Balance or Waterflood, free gas only at field level, rates per producing day are not read. All in Step 2.

### Findings

Severity: S1 wrong answer with no warning; S2 wrong or lost data, or a door
that misleads; S3 workflow gap or misleading text; S4 polish.

| ID | Sev | Check | Finding | Evidence | Status |
|---|---|---|---|---|---|
| VRR-U1-001 | S1 | PL2, RL10 | The ledger door missed "Water Inj (bbl)" (its alias list had an underscore) and dropped the injection column with no word: VRR 0 and every injector a dead well. "Water inj (m3)" was worse: with no other water column it was claimed as water PRODUCED. | Probe; `vrrImportDoor.test.js` with the old importer as control. | Fixed: columns placed by name on the shared reader, injection first, a production column never holds "inj"; unused columns listed with the reason. |
| VRR-U1-002 | S2 | PL2, PL3 | Metric volumes read as oilfield: "Oil (sm3)" as bbl (6.29 times low), "Gas (10^3 sm3)" as Mscf (35.3 times high); no warning. | Same. | Fixed: units from the header on the Suite registry, chosen at the door, or assumed in the display system and said so. |
| VRR-U1-003 | S1 | PL1, PL2 | A rate column (BOPD, BWPD, Mscf/d) on monthly rows was summed as the month's volume, 28 to 31 times low. With production as rates and injection as volumes (a common allocation export) the cumulative VRR was 31.6 for a true 1.02, with no warning. | Same. | Fixed: a rate becomes the row's volume by the days of its period (one for daily rows, the calendar month for monthly rows, the gap to the well's next row otherwise), stated in the read-back. |
| VRR-U1-004 | S2 | PL2 | Comma decimals: "31.000,00" read as 31, "1.234,5" as 1.234. | Same. | Fixed: one decimal mark per file from the shared reader; an unsettled file says which reading it took and offers the other. |
| VRR-U1-005 | S3 | PL2 | The manual grid import split on commas and needed the exact headers label,Np,Wp,Gp,Wi,Gi. | Code. | Fixed: the grid file on the shared reader, any separator and decimal mark, columns in any order, units in the heads; Export writes the same format. |
| VRR-U1-006 | S2 | PL2, PL3 | The pressure door read every number as psia: a kPa file 6.9 times high, bar 14.5 times high, psig 14.7 psi low. | Same. | Fixed: unit from the header or chosen (psia, psig, kPa, kPag, bar, barg, MPa); a gauge reading gets the atmosphere (14.696 psi) added and says so. |
| VRR-U1-007 | S3 | PL2 | A file nothing settled was read day first with a warning (a guess). Month names ("Jan-2025") and Excel serial dates were refused. A second row for the same well and date was summed with no word. | Same. | Fixed: the door asks and the rows wait; month names and serials read; a second row that repeats a stream is left out and listed (one that only adds a stream is merged). |
| VRR-U1-008 | S2 | PL1, PL11 | A blank FVF read as 0 (vrr.js `num('')`): a cleared Bo dropped the oil term and the sample VRR rose above 4 with no word; "1,25" read as 1. | `vrrWorkspace.test.js`, the engine call as control. | Fixed: the constant set must be typed and positive; otherwise the VRR is withheld with the reason in the rail, the KPIs, the charts and the report. |
| VRR-U1-009 | S2 | PL1, RL12 | With the pressure track on, the field used per-period FVFs and the patterns and their injection advice used the constant set: one pattern holding every producer disagreed with the field, and the advice divided by a voidage the screen did not show. | `vrrWorkspace.test.js`, engine gates. | Fixed engines-first (`applyPeriodFvf`, `periodFvf` option of `recommendPatternInjection`, PR #305); the invariant holds under per-period FVFs. |
| VRR-U1-010 | S2 | RL1, RL4, RL6, RL9, PL7 | No report. | Gap matrix; code. | Fixed: `reportModel.js`, `reportFigures.js`, `vrrReportExport.js`, the Report tab. 30 gates, 5 goldens. |
| VRR-U1-011 | S3 | RL2, RL3, RL12 | No export of the ledger in RB with the FVFs used; voidage shown as one number per side. | Gap matrix. | Fixed: `buildVoidageLedger` (engine) by term; the ledger CSV with a provenance header; the Report tab and the PDF ledger. |
| VRR-U1-012 | S3 | PL5 | Record sharing not adopted (the table is under the rules since 20261002130000). | Plan 0a. | Fixed: the shared-projects hook, the sharing bar, read-only saves refused, Save a copy. |
| VRR-U1-013 | S3 | PL3, RL7 | Oilfield only. | Gap matrix section 5. | Fixed: `src/utils/vrr/units.js` on the Suite registry; header switch; a new project follows the profile; stored units unchanged. |
| VRR-U1-014 | S3 | RL11 | No `pvt-1` intake; the track's correlations were named nowhere. | Gap matrix. | Fixed: the Fluid project table read by id, a third FVF mode, the shared intake card; the track names Standing, Papay Z and McCain Bw in the UI and the report. |
| VRR-U1-015 | S3 | PL3, RL7 | No pressure datum. | Gap matrix. | Fixed as the plan's owner default: a datum depth and reference stated and printed, no correction applied (the report says so). |
| VRR-U1-016 | S3 | PL4 | The correlation track filled a blank fluid input with a default (35 API, gas gravity 0.7, 500 scf/STB, 30,000 ppm, 180 degF) and said nothing. | Test with the old bridge as control. | Fixed: the track needs every fluid input; otherwise the constant set applies and the reason shows. |
| VRR-U1-017 | S4 | PL4 | A target band minimum of 0 became 1.0, a rolling window of 0 became 3, a reversed band was taken as typed; no word. | Test. | Fixed: what was used is said under the settings and in the report flags; a reversed band is swapped and said. |
| VRR-U1-018 | S4 | PL12 | '-' for missing values in the KPIs, grid, ledger, patterns and matrix. | Grep. | Fixed: `EMPTY_VALUE`. |
| VRR-U1-019 | S3 | PL11 | Fields accepted any text with no unit and no check. | Code. | Fixed with 008 and the unit-aware fields (`UnitInput`: what is typed stays while the field has focus). |
| VRR-U1-020 | S3 | RL5, RL10 | The column map was built and never shown; the import report showed only when something was wrong. | Gap matrix. | Fixed: the read-back is shown before the import and kept with the project for the report. |
| VRR-U1-021 | S4 | PL6 | Pressure, rates and calendar figures need YYYY-MM labels, but the grid placeholder suggested "P1". | Code. | Fixed: placeholder YYYY-MM and a sentence under the grid; the report says why an undated grid has no rate or pressure figure. |
| VRR-U1-022 | S4 | PL6 | At 1366 and 1440 the header title truncates beside the unit switch; at 390 it shows the icon only. | Screenshot. | Kept (shared StudioHeader, as SCAL and Fluid). |
| VRR-U1-023 | S4 | PL10 | A 1.5 MB daily file (54,800 rows) takes 2 to 4 s to read on the main thread through the shared reader. | Probe. | Kept: Step 2 U2-009. |
| VRR-U1-024 | S3 | PL1 | Free gas is netted at field (or pattern) level before the floor at zero; a well below its solution GOR offsets one producing free gas. | Code. | Stated in the limits and the help; per-well option is U2-003 (owner question 1). No number changed. |
| VRR-U1-025 | S3 | PL1 | The correlation track computes Z by Papay (through `nodal/pvt.js`); Fluid Systems Studio moved its default to Dranchuk-Abou-Kassem in its U2. The two disagree by up to about 7 percent in Z near 4,000 psia. | Code; Fluid U2 notes. | Kept and named in the report; the Fluid table mode carries Fluid's own Z. U2-018. |
| VRR-U1-026 | S3 | RL11 | The app sends nothing: its VRR series, ledger and pressure reach Material Balance only as the pressure rows Material Balance reads. | Code. | Open: U2-005. |
| VRR-U1-027 | S3 | PL9 | The Material Balance reader is pinned only by its own module; nothing in VRR guarded the shape it reads. | Code. | Fixed: `vrrMbalContract.test.js` calls Material Balance's reader on VRR payloads. |
| VRR-U1-028 | S4 | PL4 | The help guide described the old doors (exact-header grid, "units auto-scale", day-first guess). | Read. | Fixed: guide rewritten (projects and sharing, FVF sources, the Fluid table, units, the import door, the Report tab, limits). |

Totals: 28 findings (2 S1, 6 S2, 14 S3, 6 S4). Fixed 23: both S1 (001, 003), all six S2 (002, 004, 006, 008, 009, 010), eleven S3 (005, 007, 011 to 016, 019, 020, 027) and four S4 (017, 018, 021, 028). Kept and stated 4 (024, 025 S3; 022, 023 S4). Open 1 (026 S3, Step 2 U2-001). No S1 or S2 is open.

### Numbers that change

- Files that hit 001, 002, 003, 004 or 006 now read correctly; their VRR changes (by design).
- A project with a blank or non-numeric FVF now shows no VRR (it showed a wrong one).
- With the pressure track on, pattern VRR and the injection advice change to agree with the field.
- A track project with a blank fluid input now uses the constant set (it used silent defaults).
- Everything else, including the T1 sample (62,865 RB, 59,460 RB, 0.946) and every constant-FVF analysis of a clean file, is unchanged. `vrr.js` is byte-identical.

### The report

Built by `buildVrrPdf(collectVrrReportArgs(...))`, the function the Export
button calls. Sections in order:

1. Header: project, company (organisation unless typed), field, licence or block, reservoir or zone, pattern area, production data source, analyst, periods, data cut-off, wells, analysis type, software build, voidage basis, display units, generated time.
2. Headline results with their basis: cumulative, latest instantaneous and rolling VRR, periods outside the band, produced voidage by term, injected volume by term, net voidage, fill-up, pressure change over the record, weakest pattern. A withheld VRR prints `n/a` with the reason.
3. Inputs and their sources: Bo, Bw, Bg, Rs (stated source, handoff with method and project, edited after intake, or "Assumed: the starting value of the app"), the FVF mode with its method, the fluid inputs of the track, the `pvt-1` table, the pressure surveys (file, column, unit read, gauge correction), the datum, the production and injection data (file, rows, wells, span, rows left out), the band and window, the allocation.
4. Voidage ledger by period: oil, water, free gas, produced, water injected, gas injected, injected (RB), instantaneous and cumulative VRR, a totals row; the closure statement.
5. Volumes and FVFs by period: surface volumes, Bo, Bw, Bg, Rs, pressure and where the FVF set came from.
6. What the import read; patterns, allocation factors and injection advice (when there are patterns).
7. Model, basis and conventions; limits of this analysis and flags.
8. The `pvt-1` block the FVFs were taken from (when taken); notes.
9. Figures: VRR by period (instantaneous, rolling, cumulative, 1.0 line, target band); reservoir voidage by term (produced and injected stacks); pressure history (surveys, period pressure, cumulative VRR); production and injection rates; FVFs by period; cumulative VRR by pattern. A figure that does not apply prints its reason.

Sample: `/root/vrr-report-sample.pdf`, 8 pages, 6 figures drawn (the app's Sample wells ledger, identified, two surveys below the bubble point with the datum stated, two patterns with an allocation, the FVFs from the `pvt-1` table of the Fluid test kit's Good Oil Co. Well No. 4 fluid; the `fluid-table-patterns` case of `vrrTestKit.js`, built by the final code through `buildVrrPdf`).

### The `pvt-1` intake and the Material Balance contract

- **Intake** (`src/utils/vrr/pvtIntake.js`, `FluidPvtIntake.jsx`): a saved Fluid Systems Studio project is read by id (`src/lib/pvtSource.js`; `?fluidProject=<id>` preselects it). The block's table is kept with the VRR project (`inputs.pvtIntake.table`: pressure, Bo, Bw, Bg in RB/Mscf, Rs) with the block without its table; the constant set is filled at a stated pressure (blank: the bubble point) and the FVF mode becomes "Fluid table": each period with a pressure takes the table at its mid-month pressure, a period outside the table keeps the constant set and is named. The shared `PvtIntakeCard` compares content (not save times) for "source changed since" and the received values with the current set for "edited after intake".
- **Material Balance reads VRR** (`src/pages/apps/reservoir-balance/lib/vrrPressureIntake.js`, unchanged): `saved_vrr_projects.inputs_data.inputs.pressureSurveys`, a list of `{ date: 'YYYY-MM-DD' | 'YYYY-MM', p_psia }`, absolute psia, matched to case rows by day or month. VRR-U1 keeps the payload `{ id, name, schema: 1, inputs }` and stores pressures in psia whatever the display units (a survey typed in kPa, or a kPa file, is saved in psia). Pinned by `vrrMbalContract.test.js`, which calls Material Balance's own reader. With record sharing, Material Balance's list also shows projects colleagues shared.

### FVF basis (shared with Waterflood)

Bo and Rs are per stock-tank barrel, Bw per barrel, Bg per Mscf at standard
conditions; in SI all three are rm3/sm3 (Bo and Bw keep their number, Bg is
0.0056146 times its RB/Mscf value). A `pvt-1` table carries its own basis
statement (flash or differential liberation), printed in the report; typed
values carry the basis the analyst states in the source note. Voidage is at
the reservoir pressure of each period, and injected fluids are converted at
the produced-water Bw and produced-gas Bg of that period.

### Where validation is weaker than asked

- No published worked VRR example was found to run; the engine gates use a hand-computed oracle on the V2 fixture and assert the identity of the terms against `vrr.js` to float noise, with negative controls.
- The `pvt-1` table intake is checked against the block's own values (bubble point, Bg x 1,000), which is self-consistency with Fluid Systems Studio, not against a laboratory study.
- The correlation track keeps Papay Z (VRR-U1-025).
- Live projects were not read: no count of saved projects whose numbers move.

## Step 2: advancement review (analysis only)

### 2a. Competitor parity (public product descriptions)

| Capability | OFM (SLB) | Sahara (Interfaces) | IHS Harmony (S&P Global) | This app after U1 |
|---|---|---|---|---|
| VRR by field, pattern, well, with cumulative and instantaneous | Yes, pattern-based waterflood surveillance | Yes, pattern balancing | Waterflood and surveillance views | Field and pattern; no well-level VRR |
| Bubble and grid maps of VRR, injection, pressure | Yes (bubble maps on the well base map) | Yes | Maps in the surveillance module | None |
| Allocation factors from geometry or streamlines, CRM | Geometric pattern factors; streamline links via other SLB tools | Streamline and analytical allocation | Not its focus | Typed by hand, conservation audit |
| Hall plots, injectivity | Yes | Yes | Yes | In Waterflood Design Studio, not here |
| Pressure tie-in | Pressure surveys on the map and plots | Yes | Yes | Surveys, interpolation, datum stated |
| Report | Templated plots and tables | Pattern reports | Report packs | Reviewer report with sources and limits (ahead on provenance) |

### 2b. Deferred backlog

From the STATUS doc: bubble maps, CRM-derived allocation suggestions, gas-injection advice, NextGen course teaching to `vrr.js`/`vrrLedger.js`. From this round: 023 to 026.

### 2c. Suite integration

Waterflood Design Studio (daily surveillance, Hall plots; shares the FVF question), Material Balance (pressure rows, now pinned; a VRR sender could carry the injection volumes Material Balance U2 added to the balance), Fluid Systems Studio (`pvt-1`, done), Reservoir Simulation (simulated field VRR from the summary file against the measured one), Well Test (static pressures as surveys), the wells registry (coordinates for maps).

### One ranked backlog

| Rank | ID | Item | Size | Why | Batch |
|---|---|---|---|---|---|
| 1 | U2-001 | `vrr-1` sender: the monthly ledger, pressure and injection to Material Balance (injection rows of a case) and to Waterflood Design Studio surveillance, read by id with provenance | M | Closes 026; Material Balance U2 has an injection term with no source | A |
| 2 | U2-002 | Per-well free gas, printed beside the field value | S | Closes 024 with a stated choice | A |
| 3 | U2-003 | Producing-days column at the door: rates per producing day become volumes by days on | S | Allocation reports quote rates per producing day | A |
| 4 | U2-004 | Bubble map of patterns and wells (VRR, injection, pressure) from wells registry coordinates | M | The view every competitor opens with; NAPE-visible | A |
| 5 | U2-005 | A 24-month demo field with free gas, gas injection and surveys beside the template fixture | S | The sample shows no free gas and three months | A |
| 6 | U2-006 | Workbook door (xlsx) through `src/lib/tabularFile.js` | S | Allocation exports are workbooks | A |
| 7 | U2-007 | CRM allocation factor suggestions (capacitance-resistance model fitted to injection and production rates), shown beside the typed factors, never applied unseen | L | Allocation is the weakest input; published method (Yousef 2006, Sayarpour 2008) to validate against | B |
| 8 | U2-008 | Pattern templates (five-spot, line drive) proposing geometric factors from coordinates | M | Faster first pass than typing | B |
| 9 | U2-009 | Read large files in a worker with progress | S | Closes 023 | B |
| 10 | U2-010 | Pressure corrected to datum with a fluid gradient (plan owner question 6) | S | Today stated only | B |
| 11 | U2-011 | Target band per pattern | S | Patterns run at different targets | B |
| 12 | U2-018 | Track on the canonical engines Z (Dranchuk-Abou-Kassem) or retire the track in favour of the Fluid table | S | Closes 025 | B |
| 13 | U2-012 | Simulated against measured VRR from a Reservoir Simulation run (FVIR, FVPR, FPR) | M | Ties surveillance to the model | C |
| 14 | U2-013 | Gas-injection advice with a compression limit | M | Today reported, never scaled | C |
| 15 | U2-014 | Injection efficiency by pattern (oil recovered per barrel injected) and a heterogeneity index | M | Common in competitors | C |
| 16 | U2-015 | Static pressures from Well Test projects as surveys | S | When Well Test saves an average pressure | C |
| 17 | U2-016 | Zone allocation for commingled injectors | L | Multi-zone floods | C |

Recommended: Batch A (six items, about two days), then B as NAPE allows; C deferred.

### Owner questions

| # | Question | Recommended default |
|---|---|---|
| 1 | Free gas: field level (today) or per well? | Keep field level as the headline (it does not count a measurement shortfall as voidage) and print the per-well value beside it (U2-002) |
| 2 | Pressure correction to datum | Keep "stated, not corrected" until U2-010; then correct with a gradient the analyst states, both pressures printed |
| 3 | Engines PR #305 | Lead reviews and merges; the Suite then re-pins and drops the two `vrr-u1` ledger rows |
| 4 | Bubble map coordinates | Wells registry by name with an explicit match table; unmatched wells listed, never placed by guess |
| 5 | CRM build (L, new engine math) | Batch B, engines-first, validated on a published synthetic case before it is shown |
| 6 | A second, richer sample | Add it beside the template; the template stays the engine fixture the T1 test pins |
