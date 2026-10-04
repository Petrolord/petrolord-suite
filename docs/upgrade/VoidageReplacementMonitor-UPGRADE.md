# Voidage Replacement Monitor: comprehensive upgrade

App #7 of the Reservoir round of the upgrade programme
(`docs/scope/AppUpgrade-Reservoir-PLAN.md`). Step 1 (the practitioner lens
PL1 to PL12 of `docs/scope/AppUpgrade-BestPractices.md` and the reviewer lens
RL1 to RL12 of `docs/scope/AppUpgrade-Reservoir-FeedbackLessons.md`) was run
and fixed on 2026-10-04 on branch `feat/vrr-u1`. Step 2 (advancement review)
is analysis only; the programme lead chooses the batches.

- Route: `/dashboard/apps/reservoir/voidage-replacement-monitor` (ProtectedAppRoute, slug `voidage-replacement-monitor`).
- Harness: `/dev/studio/vrr` (in-memory Supabase double). New for this upgrade: the Fluid Systems projects saved on `/dev/fluid-systems-studio` in the same tab are visible to the VRR harness, so the `pvt-1` chain runs by id.
- Engine: `packages/engines/engines/waterflood/vrr.js` is byte-identical (the course oracle). New math is in `vrrLedger.js` beside it, engines PR #305, merged; the Suite is pinned at engines main 4f91416 with no recorded deviation.
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
| `.pld` | `src/lib/portability/__tests__/vrrPortability.test.js` (1) | A project with a `pvt-1` intake round-trips; the Fluid project id is cleared, never dangling |
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
| PL5 Real saved state | Pa | P | 012, 029 | Old payloads open (jest); record sharing adopted; `.pld` round trip with the intake (jest). |
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
| VRR-U1-029 | S3 | PL5, RL12 | A project that took a `pvt-1` table could not be exported in `.pld`: the intake names the Fluid project by id, and the package refused the reference it did not carry ("Nothing was written"). Found after merging WF-U1, which fixed the same for Waterflood and SCAL. | `src/lib/portability/__tests__/vrrPortability.test.js`, failing first. | Fixed: `saved_vrr_projects` declares the intake ids as optional references (`INTAKE_SOFT_REFS`); exported alone they are cleared and the card says the source cannot be read again. |

Totals: 29 findings (2 S1, 6 S2, 15 S3, 6 S4). Fixed 24: both S1 (001, 003), all six S2 (002, 004, 006, 008, 009, 010), twelve S3 (005, 007, 011 to 016, 019, 020, 027, 029) and four S4 (017, 018, 021, 028). Kept and stated 4 (024, 025 S3; 022, 023 S4). Open 1 (026 S3, Step 2 U2-001). No S1 or S2 is open.

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

## Batch decision (programme lead, 2026-10-04)

Recorded verbatim:

> Owner-question defaults in force: free gas stays field level with the per-well figure printed beside it; the pressure datum stays stated, not corrected; bubble-map coordinates come from the wells registry through an explicit match table the user confirms; CRM only after validation on a published case (deferred here); a richer second sample beside the template (U2-005).
> BUILD in this order, one commit per item:
> - Batch A: U2-001 the `vrr-1` sender as one documented read-by-id contract for the ledger and the pressure rows, consumed by Material Balance (replace its current direct read with the contract, keeping its numbers identical and its existing test green) and aligned with Waterflood's `vrr-ledger-1` (one contract, not two: if they differ, converge on one with a version field and keep both readers working); U2-002 per-well free gas printed beside the field figure; U2-003 a producing-days column at the import door (volumes over producing days, stated); U2-006 xlsx at the import door through the existing shared xlsx reader; U2-004 bubble map (VRR or voidage by well on the map, coordinates from geo_wells through a confirmed match table, white chartTheme + ChartLogo, in the report as a figure); U2-005 a 24-month demo field as a second sample.
> - From Batch B: U2-018 the pressure track's Z on Dranchuk-Abou-Kassem from the engines (Fluid's default since Fluid U2), engines-first if needed, before and after stated on the sample; U2-011 per-pattern band.
> - DEFERRED (record reasons): U2-007 CRM allocation (L; needs a published validation case first), U2-008 pattern templates, U2-009 worker parse, U2-010 datum correction (owner default: stated, not corrected), and all of Batch C.

## Step 2 build (branch `feat/vrr-u2`)

Engines PR #307 (`buildWellVoidage`), not merged by the build agent; the
Suite vendors it byte-identical with `vrr-u2` ledger rows in
`packages/engines/VENDOR.json` until the lead merges it. `vrr.js` is
byte-identical.

| ID | Status | What was built | Proving test |
|---|---|---|---|
| U2-002 | Done | Engines-first (`buildWellVoidage`, PR #307): each well's free gas floored on its own, month by month, at the FVF set of the month (the pressure track or the Fluid table included). The headline stays at field level (owner default); the per-well figure is printed beside it: a KPI tile with its cumulative VRR, a headline row of the report ("Free gas floored well by well") with both free gas volumes, the produced voidage and both VRRs, and a sentence in the limits. On the sample ledger: 550 Mscf (495 RB) well by well against 0 at field level; cumulative VRR 0.9384 beside 0.9458. | Engine `waterflood.vrrwells.test.js` (8): hand oracle on the V2 fixture (1,700 against 550 Mscf), one producer identical to `vrr.js`, oil, water and injection summing to the field ledger; negative control (the field floor) fails 3 of 8. App `vrrFreeGasByWell.test.js` (5): the derived model equals the engine; under the track the field figure closes on the ledger month by month (negative control: the constant set misses by more than 100 RB); none for a grid or a withheld VRR; the report row read back from the PDF. |
| U2-003 | Done | A producing-time column at the ledger door (`days_on`: "Days On", "Producing days", "Hours on", and similar, found by name and never read as a stream). With a rate column present, each rate becomes the row's volume by the producing days of its row (hours over 24), and the door says so; the user may choose calendar-day averages instead (the U1 rule). A producing time above the days of the row's period is capped at the period and counted; a blank uses the calendar days and is counted; with no rate column the column is listed as not needed. The read-back (screen and report) shows the column, its unit and the basis. New hostile file `h09-rates-per-producing-day.csv` (P-1 on 25 days at 1,240 BOPD = 31,000 bbl) reads to the twin. | `vrrProducingDays.test.js` (7): the twin from h09; negative control (calendar basis gives 38,440 bbl for 31,000); hours; the cap and the blank; not needed with volumes; the PDF read-back. |
| U2-006 | Done | Excel workbooks (xlsx, xlsm, xls) at the ledger door and the pressure door through the shared reader (`readTabularFile`, `parseWorkbook` in `src/lib/tabularFile.js`): the sheets are tried in order until one holds the table (a title line and a blank row above the header are fine; Excel date cells read as dates), the sheet is named in the read-back and in the file name the project keeps; a workbook with no such sheet is refused naming the sheets looked at. Fixture `e2e/fixtures/vrr/twin-ledger.xlsx` (a notes sheet, then the twin ledger under a title). | `vrrWorkbookDoor.test.js` (5): the workbook reads to the twin, dates included; negative control (the workbook read as text, the door before) holds no table; text passes through; the refusal; the pressure door. e2e U2-006. |
| U2-001 | Done | The `vrr-1` contract (`src/utils/vrr/vrrLedgerContract.js`): one read-by-id contract of a saved VRR project for the ledger and the pressure rows, converged with Waterflood's `vrr-ledger-1` (WF-U2-004, same shape; `schema` `vrr-1` with `version` 1; readers accept both names). Material Balance's reader (`vrrPressureIntake.js` `vrrSurveys`) now reads the contract's `pressureRows` instead of `inputs_data.inputs.pressureSurveys`, with the same cleaning and order, and its handoff records the schema, version and fingerprint it read. Waterflood's receiver accepts `vrr-1` and `vrr-ledger-1` contracts and intakes saved under either name; the fingerprint keeps the `vrr-ledger-1` composition, so an intake taken before does not read as changed. A period-grid project now sends its pressure rows (the ledger part says why it is absent). The send panel names the contract, both receivers and the datum (stated, not corrected). | `vrrContract.test.js` (7): the contract of a ledger and of a grid project; Material Balance's numbers identical to its old direct read (the old reader verbatim as control) on oilfield, grid and SI-typed payloads; the handoff records the contract; one fingerprint; Waterflood reads `vrr-1` and `vrr-ledger-1` the same and refuses another schema (negative control); read by id. Material Balance's own `vrrPressureIntake.test.js` (5) and goldens unchanged and green; `wfVrrIntake.test.js` (7) green with the schema now `vrr-1`. |

### The `vrr-1` contract as converged (U2-001)

| Field | Meaning |
|---|---|
| `schema`, `version` | `'vrr-1'`, `1`. A reader also accepts `'vrr-ledger-1'` (the Waterflood-era name of the same shape, no version) |
| `app`, `table`, `projectId`, `projectName`, `projectSavedAt` | Read by id from `saved_vrr_projects`; nothing typed again |
| `units` | Volumes STB (oil, water produced), bbl (water injected), Mscf (gas), by calendar month; pressure psia absolute as saved, not corrected to the datum |
| `hasLedger`, `ledgerRefusal` | A period-grid project has no wells: `false` with the reason; its pressure rows still travel |
| `wells`, `months`, `volumes`, `totals` | The per-well ledger by calendar month as VRR sums it (`buildFieldPeriods` rule), wells as VRR classifies them |
| `fvf` | The VRR project's FVF set as stored, for comparison (receivers use their own) |
| `pressureSurveys` | Dated surveys, cleaned, in saved order (Waterflood's FVF by period) |
| `pressureRows` | The same by date (Material Balance takes them onto its dated rows) |
| `datum` | `{ depth_ft, reference, corrected: false }`, stated only (owner default) |
| `fingerprint` | FNV-1a over projectId, wells, months, volumes, fvf, pressureSurveys (the `vrr-ledger-1` composition) |

Receivers: Waterflood Design Studio (Surveillance tab, `?vrrProject=<id>`,
ledger and surveys), Material Balance Studio (Data tab, pressure rows).
Not carried yet: injection volumes as Material Balance injection rows (its
injection term reads cumulative injection from the case table; a reader of
the ledger's monthly injection is a Material Balance follow-up).
| U2-004 | Done | A Map tab (`WellMapPanel.jsx`, `src/utils/vrr/wellMap.js`): voidage by well (the engine's `buildWellVoidage`: a producer's produced voidage with its own free gas, an injector's injected volume) as bubbles at the surface locations of the wells registry (`geo_wells`), with each pattern's cumulative VRR at the centre of its placed producers. Owner default: an explicit match table the user confirms. Proposals by the same name, the same UWI, or the same letters and digits (named as such, "check it is the same well"); two candidates give no proposal; nothing is placed until the table is confirmed; an unmatched well is listed, never placed. The confirmed table keeps each well's coordinates, CRS and unit with the project (the registry id too), so the map does not move when the registry is edited; "Read the registry again" names wells that moved or are gone. Wells in two CRSs or units: no map, the reason named. White chartTheme + ChartLogo (ChartFrame). Report: figure 7 "Voidage by well on the well locations" (marker size by thirds of the largest value; the kit draws one marker size per series), a "Voidage by well" table (registry well, X, Y, value, own-floor free gas) and an input row for the well locations with their source. | `vrrWellMap.test.js` (9): proposals and the ambiguous case; negative control (proposals place nothing before confirmation); values equal the engine at the registry coordinates, the unmatched well listed; two CRSs refused; the pattern centre and its VRR; the snapshot and registry changes; the figure drawn from the points with the mark and the table read back from the PDF; the statement without a table. |
| U2-005 | Done | A second sample beside the template (owner default; the template stays the engine fixture the T1 test pins): "Demo field (24 months)" on the import door (`src/utils/vrr/demoField.js`): 6 producers, 3 water injectors and 1 gas injector, January 2024 to December 2025, volumes built by a stated rule (no random numbers), free gas once the producing GOR rises above Rs, one producer below its solution GOR (so the per-well free gas differs from the field figure), water injection ramping and gas injection from month 9, nine quarterly surveys falling below the bubble point and recovering, two patterns with an allocation, a stated datum, and line-drive locations for the map (seeded in the `/dev/studio/vrr` registry). Cumulative VRR 0.7793 at the cut-off (instantaneous in the band in the second year); the report draws all seven figures with the map. New golden case `demo-field`. | `vrrDemoField.test.js` (6): shape; the volumes reproduce the rule; free gas, gas injection, per-well above field; the numbers through the engine (closure, 0.7793); the template still the T1 oracle; the report draws every figure with the mark. Golden `demo-field`. |
| U2-018 | Done | The pressure track's Bg now takes Z by Dranchuk-Abou-Kassem (1975) with Sutton pseudo-criticals from the canonical engines (`engines/fluid/blackOil` `gasZDetail`, already vendored and gated on Standing-Katz readings; Fluid Systems Studio's default since FLUID-U2-006), so no engines change was needed. Bo, Bw and Rs are unchanged (the nodal route). Named in the screen, the help, the inputs table and the limits. **Numbers that move (track mode only):** on the demo field with the pressure track, Bg at 3,047 psia 0.9405 to 0.9231 RB/Mscf (-1.9 percent), free gas 558,998 to 550,674 RB, produced voidage 7,417,448 to 7,409,125 RB, injected 5,788,104 to 5,771,994 RB (gas injection uses the same Bg), cumulative VRR 0.78034 to 0.77904. Constant and Fluid-table modes are unchanged. | `vrrTrackZ.test.js` (5): Bg equals 0.00504 Z T / p with the engine's Z at five pressures; negative control (the Papay route differs by more than 1 percent at 3,500 psia); Bo, Bw, Rs unchanged; the method named; after value pinned on the demo field. `pvtTrack.test.js` updated (Bg on the engine Z). |
| U2-011 | Done | A target band per pattern (Patterns tab, two fields under each pattern; blank follows the field band). A pattern with its own band is flagged against it and its water injection advice aims at its own lower edge, through the engine's `flagPeriods` and `recommendPatternInjection`; a mistyped band falls back to the field band and says so, a reversed band is swapped and said. The report's Patterns table gains a "Target band" column with "(pattern)" or "(field)" and the count of periods outside it; the notes go to the flags. No engines change. | `vrrPatternBand.test.js` (4): flags and advice equal the engine with the pattern band; negative control (the field band flags the same pattern differently and scales the advice differently); blank, mistyped, reversed; the report read back from the PDF. |
