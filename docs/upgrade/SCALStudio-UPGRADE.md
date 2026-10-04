# SCAL Studio: comprehensive upgrade

App #5 of the Reservoir round of the upgrade programme
(`docs/scope/AppUpgrade-Reservoir-PLAN.md`). Step 1 (the practitioner lens
PL1 to PL12 of `docs/scope/AppUpgrade-BestPractices.md` and the reviewer lens
RL1 to RL12 of `docs/scope/AppUpgrade-Reservoir-FeedbackLessons.md`) was run
and fixed on 2026-10-03 on branch `feat/scal-u1`. Step 2 (advancement
review) is analysis only; the programme lead chooses the batches.

- Route: `/dashboard/apps/reservoir/scal-studio` (ProtectedAppRoute, slug `scal-studio`).
- Harness: `/dev/studio/scal` (in-memory Supabase double). New for this upgrade: saved SCAL projects are kept in sessionStorage (`src/dev/scalProjectsStore.js`) so the Waterflood harness `/dev/studio/waterflood` reads them by id; `?saved=1` seeds two projects shaped like the live rows.
- Scope lock: thin-real (owner, 2026-07-17 and 2026-07-18; plan owner question 13): Corey and Leverett J only. No new physics was added in Step 1; every engine call is the SC2 engine, unchanged (no engines PR).
- Earlier cycles: SC1 to SC7 (2026-07-18), senior test T1 (2026-09-26), design system 1D.
- Live data read (2026-10-03, read only): 3 rows in `saved_scal_projects`, all schema 1; 2 in samples mode, both with samples starting at the same Sw (so SCAL-U1-001 moves no live number); 0 rows carry a kr block.

## What changed, in eight lines

1. **The report.** The app had none (CSV files of bare numbers). It now prints a Special Core Analysis Report on the shared Report Kit, built from one model the Report tab shows (section "The report" below).
2. **The `kr-1` contract.** SCAL writes the block through `src/lib/inputProvenance/krContract.js`, saves it with the project (payload key `kr`), sends it with the Waterflood handoff and lets any app read it by id (`src/lib/krSource.js`, `?scalProject=<id>`).
3. **Waterflood keeps the source** it used to show in a toast and discard, on the shared kr intake card (`KrIntakeCard`), with "source changed since" and "edited after intake".
4. **An S1 in the averaged J** (SCAL-U1-001) and **an S2 in the four saturation-height readers** (SCAL-U1-015), both fixed with failing-first tests.
5. **Units.** The Suite unit profile at every field, card, chart, CSV and in the report; stored values stay in field units, which four other apps read.
6. **The lab doors.** kr and Pc tables on the shared typed reader with the unit at the door and a read-back kept with the sample; a hostile file set.
7. **Datum and pedigree.** The FWL through `src/lib/wellDatum.js` (TVD below a registry well's reference, or TVDSS); a sample pedigree on every core sample.
8. **Record sharing**, a project file that is the saved payload and reads back whole, and an honest help guide.

## Evidence kit made for this app

| Kit | Where | What it holds |
|---|---|---|
| The report, read back | `src/components/scalstudio/__tests__/scalReport.test.jsx` (21) on `scalTestKit.js` | Four goldens (`__tests__/__fixtures__/reportGolden/`), RL1 completeness guard with negative control, sources and assumptions, RL2 closure of the Leverett scaling, RL4 header and old projects, RL6 captions, marks and point counts against the screen series, RL7 SI conversion with a known value, RL8 edited-after-fit, RL9 limits and flags, RL11 block printed, RL12 rows |
| The `kr-1` contract and the chain | `scalContract.test.js` (13) | The writer, the gate with negative controls, Waterflood by router state and by id, the intake card states, the saturation-height readers on a samples-mode project, a static guard writer to reader |
| The averaged J | `scalU1Swirr.test.js` (5) | SCAL-U1-001 with the old path rebuilt as negative control |
| The lab doors | `scalLabImport.test.js` (18) | Eight hostile files against their twins, the old parsers as negative control, the shared reader's last-column rule |
| Datum | `scalDatum.test.js` (4) | 8,682.02 ft TVD below KB 25 m = 8,600.0 ft TVDSS; an unset reference refused; the report and the SHM readers take it |
| Page model | `scalUpgradeUi.test.jsx` (5), `scalU1Crossover.test.js` (3) | Profile system, old project in oilfield, "2621." key by key in SI, fit trail, file round trip, `.pld` family, crossover solved |
| Record sharing | `scalSharing.test.jsx` (6) | Own and shared lists, view only, check-out, stale save refused, Save a copy, before the migration |
| Hostile files | `e2e/fixtures/scal/hostile/` (10 files and a README) | One kr table and one Pc table in eight shapes, and their twins |
| Browser | `e2e/scal-upgrade.spec.js` (11) | Three viewports in both themes, the PDF downloaded and read with pdftotext, pdfinfo and pdfimages, hostile tables, the chain into Waterflood by state and by a fresh visit, SI typing, old projects |

## Step 1: the twenty-four checks

Grades: P pass, Pa partial, F fail. "Was" is the gap matrix grade (from code
reading) or, for PL checks, the state found here.

| Check | Was | Now | Findings | Notes |
|---|---|---|---|---|
| PL1 Labels mean the textbook | Pa | P | 001, 006, 017 | Quantity table below. One S1 (the averaged J), one S4 (crossover read off the grid). |
| PL2 Hostile files | F | P | 007, 012 | Two doors (kr, Pc); eight hostile files read to their twins or are refused with a reason. |
| PL3 Units, datums, frames | F | P | 005, 014 | Oilfield only before; FWL a typed TVDSS with no datum; sample depth with no reference. |
| PL4 No claim without the event | Pa | P | 004, 016 | A fitted set says so only while its values are the fit's; the help guide claimed a golden that does not exist. |
| PL5 Real saved state | Pa | P | 010, 011 | Schema 1 rows open (jest and e2e); record sharing adopted; the project file reads back whole. |
| PL6 Real browser | P | P | 018 | Three viewports, both themes, white charts with the mark, no sideways scroll, no page errors; the FWL label overprinted a tick (fixed). |
| PL7 Report a reviewer can sign | F | P | 002 | See RL1 to RL12. |
| PL8 Practitioner's day | gaps | gaps recorded | 019, 020, Step 2 | Persona walks below. |
| PL9 The chain | Pa | P | 003, 015 | Waterflood by state and by id; the four SHM readers now read samples-mode projects and print the source. |
| PL10 Real scale | P | P | | 13 kr rows, 8 Pc rows per sample; fits in milliseconds; the report about 1 s in jest. No finding. |
| PL11 Inputs a person can type | Pa | P | 005 | Fields keep "2621." and "-" key by key in SI; a cleared field stays cleared. |
| PL12 House standards | Pa | P | 013, 016 | '-' and literal 'n/a' replaced by `EMPTY_VALUE`; no em dashes; route protected. |
| RL1 Inputs with unit and source | F | P | 002, 008 | Completeness guard over the engine input object; starting values print as assumptions. |
| RL2 Composites show components | Pa | P | 002 | sigma cos theta, sqrt(k/phi), Pc per unit J, J(0.5), Pc(0.5), the gradient and the height, closing to the printed digits. |
| RL3 Lumped results split | NA | NA | | Nothing lumped: each phase has its own curve. |
| RL4 Identification | F | P | 009 | Eleven fields saved with the project; company from the organisation; a sample pedigree on every sample. |
| RL5 Data and operations summary | Pa | P | 007 | Lab tables imported: file, rows read, rows left out with reasons, units read; points used per fit. |
| RL6 Every result has its plot | F | P | 002 | Eight figures from the screen series; the ones that do not apply say why. |
| RL7 The basis is named | Pa | P | 005, 014 | TVDSS and its datum, Pc a difference, kr base, saturation basis, drainage or imbibition per sample. |
| RL8 Strengths kept, claims earned | Pa | P | 004 | CIs, RMS, r2 and the regression statement kept; the working set's origin travels and is withdrawn on edit. |
| RL9 Limits printed | F | P | 002 | Corey form, two-phase, no hysteresis, one J, height basis; flags on pedigree gaps, analogs, bound exponents, poor fits, extrapolation. |
| RL10 Import doors | Pa | P | 007, 012 | Header in any order or none, units at the door, read-back. |
| RL11 Senders and provenance | Pa | P | 003, 015 | `kr-1` written and gated; Waterflood stores it; the SHM readers print it. Simulation has no SCAL intake yet (its round). |
| RL12 One model | Pa | P | 010 | Report tab rows are the PDF rows; the screen and the PDF share `series.js`; the project file is the payload. |

### PL1 quantity table

| Quantity | Standard meaning | What the code computes | Same? |
|---|---|---|---|
| krw, kro (Corey) | krw = krw(Sor) Swn^nw, kro = kro(Swc) (1 - Swn)^no, Swn = (Sw - Swc)/(1 - Swc - Sor) | `coreyKr` in the engine | Yes |
| krg, krog (Corey, gas-oil) | at connate water, Sgn = (Sg - Sgc)/(1 - Swc - Sorg - Sgc) | `coreyKrGasOil` | Yes; at connate water only, stated |
| Crossover Sw | Sw where krw = kro | Was the first row of the chart grid past the crossing (0.554 for 0.5530) | Fixed (006) |
| Leverett J | J = C Pc sqrt(k/phi)/(sigma cos theta), C = 0.21645 field units | `computeJTable` | Yes; C stated |
| Averaged J | One normalised Sw* axis for all samples | Two different Swirr in and out | Fixed (001, S1) |
| Swirr (data-driven) | The irreducible saturation | Lowest lab Sw less 0.02, a heuristic | Kept, named everywhere it prints (019) |
| Reservoir Pc | Pc = J sigma cos theta / (C sqrt(k/phi)) with reservoir values | `pcFromJ` | Yes |
| Height above FWL | h = Pc / (0.4335 (gamma_w - gamma_hc)) | `heightFromPc` | Yes; FWL is Pc = 0, not the OWC when there is a threshold pressure (stated) |
| Fit exponents | LM on log10 kr of both curves, end points from the table | `fitCoreyToKrTable` | Yes; only the exponents are fitted, said in the report |

### Findings

Severity: S1 wrong answer with no warning; S2 wrong or lost data, or a door
that misleads; S3 workflow gap or misleading text; S4 polish.

| ID | Sev | Check | Finding | Evidence | Status |
|---|---|---|---|---|---|
| SCAL-U1-001 | S1 | PL1, RL8 | The averaged J of several samples normalised each sample with its own Swirr and mapped the fit back with one Swirr. Two rocks from one true J curve whose data start at Sw 0.15 and 0.30 came back 16 percent low at Sw 0.5 and 49 percent low at Sw 0.2, refit r2 0.989, no warning. Pc, the height profile and the Sw of the four SHM readers follow it. An override at or above one sample's lowest Sw was silently ignored for that sample. | Probe; `scalU1Swirr.test.js`, old path as negative control. | Fixed: one Swirr both ways; an override not below every sample's lowest Sw is refused with the sample named. Same-start samples unchanged to 1e-12; no live project moves. |
| SCAL-U1-002 | S2 | RL1, RL4, RL6, RL9, PL7 | No report: CSV files of bare numbers. | Gap matrix; code. | Fixed: `utils/scalstudio/reportModel.js`, `reportFigures.js`, `scalReportExport.js`, the Report tab. 21 gates, 4 goldens. |
| SCAL-U1-003 | S2 | RL11, PL9 | The Waterflood handoff carried a name, the Corey set and two viscosities: no fitted flag, sample, time or project; Waterflood showed it in a toast and stored nothing; router state only. | Code. | Fixed: `kr-1` sent and saved; Waterflood stores `krIntake` with its project and shows `KrIntakeCard`; `?scalProject=<id>` read by id on a fresh visit. |
| SCAL-U1-004 | S3 | RL8, PL4 | "Use fit on the Curves tab" kept no record; the working set could not say it was fitted, to what, or that it was edited after. | Gap matrix; code. | Fixed: `owOrigin` saved with the set; origin derived from the values (fitted, entered, edited after fit) on the Curves tab, the report and the block. |
| SCAL-U1-005 | S3 | PL3, PL11 | Oilfield only; Pc psi, IFT dyn/cm, ft fixed in labels. | Gap matrix section 5. | Fixed: `utils/scalstudio/units.js` on the Suite registry; header selector; new workspace follows the profile; saved project keeps its own; stored units unchanged. |
| SCAL-U1-006 | S4 | PL1 | "Crossover Sw" read the first chart-grid row past the crossing (0.554 for 0.5530). | Test with the grid value as control. | Fixed: bisection on the engine curve. T1 spec now reads 0.553. |
| SCAL-U1-007 | S2 | RL10, PL2 | The doors split on commas only, needed an alias header, read Pc as psi whatever the file said: a "Pc" column in kPa was read 6.9 times high; a percent Sw, a semicolon or tab file, no header and comma decimals were refused. | Tests with the old parsers as control. | Fixed: `utils/scalstudio/labImport.js` on `src/lib/tabularParse.js`, units from the header or chosen at the door, read-back on the rail and in the report. |
| SCAL-U1-008 | S3 | RL1 | CSV files carried no provenance or units. | Code. | Fixed: `#` lines from the `kr-1` block and the display units; Pc and height in the display units, named in the column heads; old shape without options. |
| SCAL-U1-009 | S3 | RL4 | No identification; a sample held name, depth, k, phi, sigma, theta only: no lab or analog, method, wettability, drainage or imbibition, temperature. | Gap matrix. | Fixed: identification (11 fields) and the sample pedigree (13 fields), saved in the jsonb, printed and carried in the block. |
| SCAL-U1-010 | S3 | RL12 | Project JSON import read the samples only. | Code; help said so. | Fixed: the file is the saved payload; import restores the whole project. |
| SCAL-U1-011 | S3 | PL5 | Record sharing not adopted (the table is under the rules since 20261002130000). | Plan 0a. | Fixed: `useScalProjects` with the sharing store, `RecordSharingBar`, own and shared lists. |
| SCAL-U1-012 | S3 | PL2 | The shared typed reader dropped a mostly empty last column (a lab Comment column) and with it the header row, so the table read by position as nonsense. | Test. | Fixed in `tabularParse.js`: the first row's width is kept when it names the column and 80 percent of rows carry it. Its own tests pass. |
| SCAL-U1-013 | S4 | PL12 | '-' for a missing height KPI, literal 'n/a' in the fit card. | Grep. | Fixed: `EMPTY_VALUE`. |
| SCAL-U1-014 | S3 | PL3, RL7 | FWL a typed "TVDSS (ft)" with no datum; sample depth with no reference. | Gap matrix. | Fixed: FWL entered as TVDSS, or as TVD below a registry well's reference through `src/lib/wellDatum.js` (refused with the registry reason when unset); depth reference per sample; basis printed. |
| SCAL-U1-015 | S2 | PL9, RL11 | `shmFromScalProject` (Petrophysics, Earth Modeling, Rock Physics, ReservoirCalc Pro) passed the saved samples, which hold no J rows, to `buildJSpec`: every samples-mode project was refused ("Include at least one sample with a computed J table"). Two of the three live projects are in samples mode. | Failing test on the schema 1 fixture. | Fixed: samples derived through SCAL's own pipeline; the readers also get the `kr-1` source words (printed in Petrophysics). No number moves: these projects were refused before. |
| SCAL-U1-016 | S3 | PL4, PL12 | The help guide claimed committed literature goldens for "a textbook Corey construction and a J-function averaging case from the SPEE reserves literature"; the SPEE golden is decline curves and the SCAL golden is Leverett 1941 from Ahmed. | Read. | Fixed: guide rewritten for the upgrade. |
| SCAL-U1-017 | S3 | PL1, RL9 | The power-law J tends to infinity at Swirr; a Sw window below the lowest lab Sw extrapolates. Nothing said so. | Code. | Fixed: flags in the report. |
| SCAL-U1-018 | S4 | PL6 | The FWL label overprinted the 1.0 tick. | Screenshot. | Fixed. |
| SCAL-U1-019 | S3 | PL1, PL8 | The data-driven Swirr (lowest Sw less 0.02) is a heuristic: on the demo pair it gives b 1.15 against a generating 1.45 (with the true Swirr: 1.467). | Probe. | Kept and named wherever it prints; Step 2 U2-006 (fit Swirr). |
| SCAL-U1-020 | S3 | PL8 | The Corey fit needs a lab table with both end points (krw 0 at the first row, kro 0 at the last); real unsteady-state data seldom reach residual oil, and the fit refuses. | Code (`validateKrTable`). | Open: U2-003 (engines change). |
| SCAL-U1-021 | S3 | RL11 | Gas-oil sets and capillary pressure are not handed to any simulator keyword; Simulation's "SCAL Studio model" is a typed form with no intake. | Gap matrix. | Open: U2-001, U2-002 (Simulation round). |
| SCAL-U1-023 | S3 | PL4, RL11 | The new intake card said "source changed since" whenever the source project was saved later, but every save (autosave too) re-stamps the block: the e2e chain showed it straight after a send. The PVT card (`pvtIntakeCard.js`, Fluid U2) compares times the same way. | e2e PL9; test. | Fixed for kr: the card compares the received parameters and origin with the source's. The PVT card is carried to the Fluid owner (not changed here). |
| SCAL-U1-024 | S3 | RL11, PL4 | The sender saved first only when it believed it could write, and cited the project id whether or not the save landed; in a fast CI run the cited project still held its creation-time curves, so Waterflood rightly said the source differed. | CI shard 4 on PR #869. | Fixed: the sender always tries the save and cites the project only when it landed; otherwise it says so and sends the curves without an id. |
| SCAL-U1-022 | S4 | PL6 | At 390 wide the header shows the icon without the title. | Screenshot. | Kept (shared StudioHeader, as Fluid). |

Totals: 24 findings. Fixed 20 (1 S1: 001; 4 S2: 002, 003, 007, 015; 12 S3:
004, 005, 008 to 012, 014, 016, 017, 023, 024; 3 S4: 006, 013, 018), kept 2 (019 S3
stated, 022 S4), open 2 (020, 021 S3, Step 2). No S1 or S2 is open.

### The report

Built by `buildScalPdf(collectScalReportArgs(...))`, the function the Export
button calls. Sections in order:

1. Header: project, company (organisation unless typed), field, licence or block, well, reservoir or zone, cored interval, core samples, laboratory, lab report number, test dates, analyst, analysis date, analysis type, software build, display units, generated time.
2. Headline results with their basis: Swc and Sor, end points, exponents, mobile span, crossover Sw, end point mobility ratio (when the fw preview is on), gas-oil set, J parameters, Pc and height at Sw 0.5, FWL.
3. Inputs and their sources: every engine input with unit and source; a fitted set names its sample and r2; starting values print as assumptions; the shared Swirr says whether it was entered or derived.
4. Leverett scaling and height conversion by component, closing to the printed digits.
5. Core samples (depth with reference, k, porosity, lab IFT and angle, sigma cos theta, fluids, points), sample pedigree, lab tables imported (file, rows read, rows left out, units), Corey fits (points used, end points, exponents with 95% CI, RMS, r2, regression statement).
6. Leverett J from the samples (the average, one Swirr, the refit with its CI) and the Pc data by sample.
7. Model (normalisations, J and height definitions, the origin of each set) and basis and conventions (saturation, kr base, Pc a difference, IFT, TVDSS and its datum, heights, units).
8. Limits of this analysis (Corey form, two-phase, no hysteresis, one J, the power law at Swirr, the height basis, no end-point scaling) and flags (pedigree gaps, analogs, bound exponents, poor fits, edits after a fit, extrapolation, no FWL).
9. Tables: oil-water and gas-oil kr (25 intervals), Pc and height (every 4th row of the screen's 62).
10. The `kr-1` block as other apps receive it.
11. Figures: working oil-water kr with the fitted sample's lab points; lab kr with the Corey fit, one per sample; normalised curves across samples; gas-oil kr; Leverett J with the samples' lab J; reservoir Pc with the J-function overlay (each sample's lab J scaled to the reservoir); Sw against height with the FWL marked. A figure that does not apply prints its reason.

Sample: `/root/scal-report-sample.pdf` (the app's demo pair with sample A's fit applied, both samples averaged, FWL 8,600 ft TVDSS, identified; built by the final code through `buildScalPdf`).

### The `kr-1` contract as written

Writer: `src/utils/scalstudio/krHandoff.js` (`buildScalKrContract`), through
`buildKrContract` in `src/lib/inputProvenance/krContract.js`. Gate:
`validateKrContract`.

| Field | Content |
|---|---|
| `schema`, `source_app`, `project_id`, `project_name`, `generated_at`, `app_build` | `kr-1`, "SCAL Studio", the saved project, ISO time, the Suite build |
| `units` | saturation and kr fractions, Pc psi, IFT dyn/cm, permeability md, porosity fraction, angle deg, length ft, temperature degF, gravity water = 1, J dimensionless: as the engine holds them whatever the display units |
| `oil_water`, `gas_oil` | `{ model: 'corey', params, origin, normalisation, table }`; `origin.kind` entered, fitted or edited-after-fit, with the sample id and name, the time applied, the fit (exponents, CIs, RMS, r2, points, convergence, how the end points were taken) and the edited keys |
| `capillary` | `j` (power law a, b, Swirr; origin entered or samples; the samples; whether Swirr was entered or derived; the refit r2, RMS and CIs; the definition), `reservoir` (k, porosity, sigma, theta), `leverett_c`, `height` (gravities, FWL TVDSS in ft, definition), `table` (Sw, Pc psi, h ft) |
| `samples` | per sample: id, name, depth and reference, lab or analog, laboratory and report, kr and Pc methods and processes, wettability, condition, temperature, fluids, k, porosity, sigma, theta, point counts |
| `scope` | `{ three_phase: false, hysteresis: false, text }` |
| `identification` | the project header |

Delivery: saved with the project (`inputs_data.kr`, schema 2); router state
`scalKr` (the version 1 keys Waterflood already mapped, with `contract`
beside them); `?scalProject=<id>` read with `readScalProjectKr`
(`src/lib/krSource.js`). `.pld` carries it with the project (the table is in
the apps family).

| Consumer | Today | Notes |
|---|---|---|
| Waterflood Design Studio | **Reads `kr-1`**: applies the oil-water set, stores `krIntake` with its project, shows `KrIntakeCard` (as received, edited after intake, source changed since); fresh visit by id | Waterflood has no report yet; its round prints the source |
| Petrophysics Studio | **Reads the saved project by id** (as before) and now prints the `kr-1` source of the J; samples-mode projects no longer refused (015) | The dialog line "Source: ..." |
| Earth Modeling, Rock Physics, ReservoirCalc Pro | Read through the same `shmFromScalProject`; get `sourceText`; refusal fixed | Printing it in their reports is their rounds' item |
| Reservoir Simulation Studio | No intake (typed Corey form) | Its round: SWOF/SGOF from `oil_water`/`gas_oil` tables and `capillary.table` (U2-001, U2-002) |

### What changes numbers in other apps

- SCAL-U1-001 moves the J, Pc, height and the Sw of the four SHM readers for a samples-mode project whose samples start at different Sw. No live project is of that kind (read 2026-10-03).
- SCAL-U1-015 makes samples-mode projects readable by the four SHM readers; they were refused, so a result appears where there was none.
- Nothing else: the engine, the stored units and the payload keys the readers use are unchanged; `shmFromScalProject` gives the same J, rock and FWL for a schema 1 project and its schema 2 save (test).

### Where validation is weaker than asked

- **The averaged-J fix** is validated against a synthetic truth (two rocks from one J curve) and a negative control, not a published multi-sample case.
- **The Corey fit and the Leverett constant** keep their SC2 and SC7 gates (exact synthetic recovery, the Leverett collapse, Ahmed Figure 4-18 and Example 4-7). No published lab kr table with a published Corey fit was found to hold the fit against; Poston and Poe and the original Leverett scan still await the owner's PDFs.
- **Units** are anchored on known values (8,600 ft = 2,621.28 m; 18.5 psi typed as kPa = 2.683 psi; Pc kPa/psi = 6.8948) and on the registry, not on a second source.
- **Record sharing** is tested on the in-memory mirror of the rules and in the browser for the owner only; no two-account walk.
- **The Waterflood chain** is walked in the harness; Waterflood's own displacement with the received set is its existing engine, not re-validated here.
- **Competitor features (2a)** for Petrel are from general knowledge of the product; only CYDAR and Sendra were read from public pages.

### What the gap matrix had wrong or missed

- RL3 NA: confirmed.
- RL11 said Earth Modeling, Rock Physics, Petrophysics and ReservoirCalc Pro "pull saved_scal_projects by id and print the project name and FWL only". They pull it, but **refused every samples-mode project** (015): the matrix read the call, not its result.
- RL10 "Pc in psi only": worse, a Pc column in kPa under an unnamed header was read as psi, 6.9 times high (007).
- Not in the matrix: the averaged-J S1 (001), the crossover read off the grid (006), the help guide's false golden (016), the shared reader's last-column defect (012).
- RL2 "sigma cos theta and sqrt(k/phi) are not shown as components": confirmed and fixed.

### Persona walks (PL8)

**1. SCAL specialist from CYDAR or Sendra.** Loads unsteady-state kr and
porous-plate Pc per plug, fits, compares. *Before:* a kPa file read as psi, a
percent file refused, the fit not recorded. *Now:* the doors read the files and
say how, the pedigree is stated, the fit travels. Would now: history-match the
coreflood with capillary end effects (outside the lock); fit LET; fit tables
without both end points (U2-003); fit Swirr (U2-006).

**2. Reservoir engineer building a simulation deck.** *Before:* typed Corey
numbers into Simulation by hand. Would now: SWOF and SGOF from the working sets
with Pc (U2-001, U2-002), end-point scaling by rock type (U2-008), a gas-oil
fit (U2-004).

**3. Petrophysicist on saturation height.** *Before:* a samples-mode project
was refused in Petrophysics. *Now:* it reads, with its source. Would now: a
J function by rock type or by permeability class (U2-007), Thomeer or Brooks-Corey
forms (outside the lock).

**4. Manager reading the report.** *Before:* CSVs. *Now:* an 11-page PDF with
identification, sources, pedigree and limits. Would now: a one-page summary
(U2-012).

## Step 2: advancement review (analysis only)

### 2a. Competitor parity (public documentation)

| Capability | Petrel RE (saturation functions) | CYDAR | Sendra | SCAL Studio |
|---|---|---|---|---|
| Corey kr | yes | yes, and modified Corey | yes | yes |
| LET kr | yes | yes | yes (default) | no (lock) |
| Coreflood history matching (SS, USS, centrifuge) with Pc end effects | no | yes, manual and automatic | yes (1D two-phase simulator) | no (lock) |
| JBN / Jones-Roszelle analytical USS | no | yes | via simulation | no |
| Fit Corey to tabulated lab kr | yes | yes | yes | yes (both end points needed) |
| J function, averaging, saturation height | yes (J, SHF by rock type) | Pc models | Pc correlations | yes (one J, power law) |
| End-point scaling by rock type or depth | yes (SWL, SWCR, SOWCR...) | n/a | n/a | no |
| Hysteresis (Killough, Carlson) | yes | imbibition and drainage both measured | yes | no (lock) |
| Three-phase (Stone I, II, Baker) | yes, in the simulator | n/a | n/a | no (lock) |
| Simulator keywords (SWOF, SGOF, SOF3, SWFN) | yes | export of tables | export of tables | no (U2-001, U2-002) |
| Report with provenance | project documentation | report | report | yes (this round) |

Sources read: [CYDAR-SCAL manual](http://cydarex.fr/files/CYDAR_SCAL.pdf), [Cydarex](http://www.cydarex.fr/), [Maas 2019 SCA short course](https://www.scaweb.org/wp-content/uploads/SCA2019_short_course_1b.pdf), [SCA2016-006 comparison of four SCAL simulators](https://www.jgmaas.com/SCA/2016/SCA2016-006.pdf), [SCA2024-1026 (Sendra, PRORES)](https://jgmaas.com/SCA/2024/SCA2024_1026.pdf). Petrel: general knowledge of the product, not re-read.

### 2b. The deferred backlog

- Poston and Poe (SPE 2008) and the original Leverett 1941 scan: await the owner's PDFs (unchanged since SC7).
- Outside the thin-real lock, listed for the owner: LET kr; coreflood history matching with capillary end effects; JBN analysis; hysteresis (Killough, Carlson); three-phase kro (Stone I and II, Baker); Thomeer and Brooks-Corey Pc; end-point scaling; J by rock type. What a practitioner misses most, in order: SWOF/SGOF export (inside the lock), fitting without end points (inside), end-point scaling (outside), hysteresis for gas or WAG studies (outside), LET (outside).

### 2c. Suite integration

| Pair | State | Item |
|---|---|---|
| SCAL to Waterflood | `kr-1` read, stored, card | Waterflood report prints it (its round) |
| SCAL to Simulation | none | U2-001, U2-002 |
| SCAL to Petrophysics, Earth Modeling, Rock Physics, RCP | by id, source words | print the source in EM and RCP reports (their rounds), U2-009 |
| Petrophysics to SCAL | none | U2-010: core k and porosity of a zone into the reservoir rock inputs |
| Fluid Systems to SCAL | none | U2-005: IFT and densities at reservoir conditions from `pvt-1` for the height conversion |
| Material Balance aquifer, Well Test | no use of kr or Pc | none needed |

### The ranked backlog

| ID | Item | Size | Batch | Inside the lock? |
|---|---|---|---|---|
| SCAL-U2-001 | SWOF and SGOF (and SOF3 note) export from the working sets with Pc, Eclipse/OPM keywords with `kr-1` comment lines; Simulation reads them by id | M | A | yes |
| SCAL-U2-002 | Gas-oil CSV and gas-oil handoff (Simulation, Fluid) | S | A | yes |
| SCAL-U2-003 | Corey fit with entered Swc and Sor when the lab table lacks an end point (engines change: `fixedEndpoints` past `validateKrTable`) | S | A | yes |
| SCAL-U2-004 | Corey fit for gas-oil lab tables | S | A | yes |
| SCAL-U2-005 | IFT and fluid gravities at reservoir conditions from a Fluid Systems project (`pvt-1` intake) | M | B | yes |
| SCAL-U2-006 | Fit Swirr with a and b (three-parameter J), with its CI; the data-driven heuristic as the start | S | B | yes |
| SCAL-U2-007 | J by permeability class or rock type: several working J curves, SHM readers choose | M | B | yes |
| SCAL-U2-008 | End-point scaling (SWL, SWCR, SOWCR) by rock type | M | C | no |
| SCAL-U2-009 | Earth Modeling and RCP reports print the `kr-1` source | S | B | yes |
| SCAL-U2-010 | Core k and porosity of a zone from Petrophysics into the reservoir rock inputs | S | B | yes |
| SCAL-U2-011 | Lab xlsx at the doors (`readTabularFile` workbook path) | S | A | yes |
| SCAL-U2-012 | One-page summary first in the report | S | B | yes |
| SCAL-U2-013 | LET kr | M | C | no |
| SCAL-U2-014 | Hysteresis (Killough) and imbibition Pc branch | L | C | no |
| SCAL-U2-015 | Three-phase kro (Stone II, Baker) for Simulation | M | C | no |
| SCAL-U2-016 | Coreflood history matching (1D two-phase with Pc end effects) | L | C | no |

Batch A (inside the lock, before NAPE): 001, 002, 003, 004, 011. Batch B
(inside the lock, after A): 005, 006, 007, 009, 010, 012. Batch C (outside the
lock, owner decides): 008, 013, 014, 015, 016.

### Owner questions

| # | Question | Recommended default |
|---|---|---|
| 1 | SWOF/SGOF export (U2-001): Eclipse/OPM keyword tables only, or also a Simulation intake by id in this round? | Keywords now, Simulation intake in the Simulation round |
| 2 | The thin-real lock: lift it for LET (U2-013) and end-point scaling (U2-008) after NAPE? | Keep the lock to NAPE; decide LET and end-point scaling after NAPE with a published validation case each |
| 3 | Hysteresis and three-phase (U2-014, U2-015) | Leave in the simulator round, not SCAL, unless a customer study asks |
| 4 | Poston and Poe and the Leverett scan | Owner supplies the PDFs when convenient; gates stay pending and say so |
| 5 | Coreflood history matching (U2-016) | Not before NAPE; it is the CYDAR and Sendra core and a large build |
| 6 | Waterflood's report printing the `kr-1` source | In the Waterflood round (app 6), already planned |

## Batch decision (programme lead, 2026-10-03)

Recorded verbatim:

> Stay INSIDE the owner's thin-real lock (Corey and Leverett J). BUILD in this order, one commit per item:
> - Batch A, all five: U2-002 gas-oil export (S); U2-004 gas-oil fit (S); U2-003 Corey fit with entered Swc and Sor when the lab table lacks an end point (S, engines-first; validated with a negative control); U2-001 SWOF and SGOF keyword export with capillary pressure (M; units and conventions in comment lines; round-trip tested against the Simulation deck builder's own reader; the Simulation intake itself stays for the Simulation round, the owner's default); U2-011 xlsx at the lab doors (S, through the existing shared xlsx reader).
> - Batch B: U2-005 IFT and densities from `pvt-1` (M: the Leverett and saturation-height inputs taken from a saved Fluid project by id with provenance, edits marked); U2-006 fit Swirr (S); U2-012 one-page summary (S); U2-009 Earth Modeling and ReservoirCalc Pro reports print the kr-1 source (S); U2-010 core k and porosity from Petrophysics (S) if time remains; U2-007 J by rock type (M) only if time remains.
> - Also fix, in its own commit with a failing-first test: the same "source changed since" flaw SCAL-U1-023 fixed in SCAL also exists in Fluid's PVT intake card (it compares save times, so any re-save shows "changed"); make it compare the content fingerprint the way SCAL now does.
> - DEFERRED (record reasons): all of Batch C (end-point scaling, LET, hysteresis, three-phase, coreflood history matching): outside the lock; hysteresis and three-phase go to the Simulation round; the owner decides on LET and end-point scaling after NAPE with a published validation case each.
>
> Owner-question defaults in force: keyword export now, Simulation intake in the Simulation round; Poston and Poe and the Leverett scan stay pending until the owner supplies the PDFs; the Waterflood report prints the kr-1 source in the Waterflood round.

Deferred, with reasons:

| ID | Item | Why deferred |
|---|---|---|
| SCAL-U2-008 | End-point scaling by rock type | Outside the thin-real lock; the owner decides after NAPE with a published validation case |
| SCAL-U2-013 | LET kr | Outside the lock; the owner decides after NAPE with a published validation case |
| SCAL-U2-014 | Hysteresis and the imbibition Pc branch | Outside the lock; goes to the Simulation round |
| SCAL-U2-015 | Three-phase kro | Outside the lock; goes to the Simulation round |
| SCAL-U2-016 | Coreflood history matching | Outside the lock; a large build, not before NAPE |

## Step 2 build (branch `feat/scal-u2`)

Progress per item, in build order. Each row names the test that proves it.

| ID | State | Proving test | Notes |
|---|---|---|---|
| SCAL-U2-002 | Done | `scalU2GasOil.test.js` (5): the CSV rows are `buildCoreyGasOil` at the stated precision with the end points pinned; the kr-1 provenance lines name the gas-oil set; a consumer stores the gas-oil set with `krIntakeRecord({ set: "gas_oil" })` and sees a content change at the source | Export tab "Gas-oil kr table" (Sg, krg, krog at connate water, 26 rows, `#` provenance lines). The handoff is the `gas_oil` set of the kr-1 block, read by id; the Simulation intake is its round (owner default). No new handoff to Fluid: Fluid has no use for kr. |
| SCAL-U2-004 | Done | Engines `scal.u2fits.test.js` (gas-oil block: the mapped-axis identity to 1e-14, seven-parameter recovery, a short table with stated end points, swapped columns refused, a wrong Swc moves only Sorg); Suite `scalU2GoFit.test.js` (10): the door, the pipeline fit equals the engine call, the stated Swc, the block, the report and the status say "fitted", entered stays "entered" | `fitCoreyGasOilToKrTable` (engines PR #303) through the oil-water fit on the gas axis. A sample holds a gas-oil table (Sg, krg, krog) from its own door and a Swc of the test (blank: the working gas-oil Swc). "Use gas-oil fit on the Curves tab" keeps the fit record (`goOrigin`). Report: gas-oil fits table, the gas-oil figure with the lab points, one lab figure per sample. Demo core A now carries a gas-oil table, so the report goldens were regenerated on purpose. |
