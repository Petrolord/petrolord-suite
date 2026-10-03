# Decline Curve Analysis and Forecast Scenario Hub: comprehensive upgrade

App #3 of the Reservoir round of the upgrade programme
(`docs/scope/AppUpgrade-Reservoir-PLAN.md`). Step 1 (the practitioner lens
PL1 to PL12 of `docs/scope/AppUpgrade-BestPractices.md` and the reviewer lens
RL1 to RL12 of `docs/scope/AppUpgrade-Reservoir-FeedbackLessons.md`) was run
and fixed on 2026-10-03 on branch `feat/dca-u1`, on both apps, which share
one Arps engine. Step 2 (advancement review) is analysis only; batches are
chosen by the programme lead before anything is built.

- Routes: `/dashboard/apps/reservoir/decline-curve-analysis` (slug
  `decline-curve-analysis`) and `/dashboard/apps/reservoir/forecast-scenario-hub`
  (slug `forecast-scenario-hub`), both in `ProtectedAppRoute`.
- Harnesses: `/dev/dca` and `/dev/forecast-scenario-hub`, on the in-memory
  Supabase double. Saved DCA projects are kept in the tab's sessionStorage
  (`src/dev/dcaProjectsStore.js`), so the hub harness and the Petroleum
  Economics Studio harness (`/dev/epe/cases/c1`) read a forecast sent from
  `/dev/dca` by id.
- Earlier cycles: multi-stream fix (#169), the 2026-08 bug rounds (#178,
  #179, #182, #243), the Monte Carlo unit, seed and quadrature fixes
  (engines #57 to #59), T1 (2026-09-26), the design system pilot, the Step 0e
  honesty sweep H1, H2 and H3. Their gates hold.
- Finding IDs: `DCA-U1-nnn` (Decline Curve Analysis), `HUB-U1-nnn` (Forecast
  Scenario Hub). Severity: S1 wrong answer with no warning; S2 wrong or lost
  data, or a door that misleads; S3 workflow gap or misleading text; S4 polish.
- **Engines:** one engine change, engines-first:
  Petrolord/petrolord-engines **PR #301** (`engines/dca/groupRollup.js`, the
  group roll-up), NOT merged. The Suite vendors it byte-identical with two
  ledger rows in `packages/engines/VENDOR.json` (group `dca-u1 (engines PR
  #301)`). When #301 merges: re-pin, regenerate the manifest, delete the rows.
- No migration. Both project tables were already under the record sharing
  rules (migration `20261002130000`, applied 2026-10-02).

## What changed, in ten lines

1. **The report.** DCA had none. The Report tab and the PDF print one model on
   the Report Kit: identification, every engine input with unit and source,
   the decline basis, data used and left out with reasons, EUR as produced
   plus remaining closing on the total, life, the regression statement with
   the 95% intervals, Monte Carlo percentiles with the convention, four
   figures drawn from the screen series, and the limits of Arps with flags.
2. **Fits belong to the well (S2).** The fit, forecast, settings and window
   were held once per project: a second well showed the first well's fit, and
   a scenario carried one well's numbers under another's name.
3. **Out of date is said and enforced.** A fit and a forecast record what they
   were made on; an edit withdraws them, they are not reported or sent, and
   putting the input back restores them.
4. **The import door (S2).** A monthly "volume" column was read as a daily
   rate, about 30 times high; day-first dates went through `new Date()`. The
   door now reads with the shared typed reader and shows what it read.
5. **The sender (owner question 10).** `dca-forecast-1`, read by id, into
   Forecast Scenario Hub (a case that reproduces the DCA forecast day for day)
   and Petroleum Economics Studio (calendar-year volumes); both print the
   source and say when it changed.
6. **Group roll-up (S2).** "Group EUR" summed remaining volumes, and the
   combined rate summed a month of daily rates (about 30 times). Engines #301.
7. **Units.** The Suite unit profile for rates, volumes and the decline unit,
   at the doors, axes, tables, exports and the report; one year of 365.25
   days in DCA, the hub and Well Spacing.
8. **Honest screens.** The engine's 95% intervals now show (Diagnostics built
   its own from fields the fit never has, so it showed none); one fit-quality
   scale; the P10 to P90 band on the engine's 1.28 sigma (it was about 2.5
   sigma); the facility limit applies to the deterministic forecast (it was
   shown and ignored); "Most Likely" for a median removed; segment wording.
9. **Saved state and sharing.** Record sharing with check-out in both apps;
   a September project opens with its fit on the right well; JSON round trip
   keeps the report and the contract fingerprint.
10. **Forecast Scenario Hub.** Nominal decline labelled, typable fields, a
    start date, the unit profile, the annual CSV with case, parameters, units
    and source, the DCA intake with "source changed since".

## Evidence kit made for this app

| Kit | Where | What it holds |
|---|---|---|
| The report, read back from the PDF | `src/utils/declineCurve/__tests__/dcaReportU1.test.js` (13) | Built from the sample well through the app's own path (`fitWell`, `forecastWell`, `collectDcaReportArgs`, `buildDcaPdf`). The sample truth (planted qi 120 bopd, Di 0.0012 per day, EUR to 10 bopd 91,666.7 bbl): the fit returns it and the EUR lands within 0.013 percent. RL1 completeness against the engine inputs with its negative control; RL3 closure from the PDF text; RL4 header; RL5 counts; RL6 captions, point counts against the screen series, `expectFigureDrawn` with the mark, the fit window band; RL7 basis lexicon (43.83 %/yr nominal, 35.49 % effective, 365.25 days); RL8 stale and missing refusals; RL9 limits and flags; SI known value (120 bbl/d = 19.08 sm3/d); two goldens (`__fixtures__/reportGolden/`: oilfield deterministic, metric probabilistic). |
| The per-well model and the stale rule | `src/contexts/__tests__/dcaPerWellAnalysis.test.jsx` (7) | Through the real context: a second well shows nothing of the first (fails on the old context: verified), scenarios carry the right well, a September payload moves its fit onto its well, window and setting edits withdraw and restore, exclusions counted. |
| The import door | `src/utils/declineCurve/__tests__/productionImport.test.js` (15) and `e2e/fixtures/dca/hostile/` (11 files) | Every file is Ekene-1 in another shape and reads to the twin or says why: semicolons with decimal commas, day-first asked and answered, monthly volumes, a bare volume unit asked, SI rates with registry factors, title and totals rows, two wells refused, zero, negative, blank and n/a counted, tab columns with month names. Negative controls: the old reader read "15/02/2020" as no date and a monthly `volume` column as a 3,720 bbl/d rate. |
| The sender and its receivers | `src/utils/__tests__/forecastScenarioIntake.test.js` (8), `src/pages/apps/epe/__tests__/epeDcaIntake.test.js` (2) | Contract fields; refusals; the hub's own engine (`runCase`) reproduces DCA's forecast of a hyperbolic well to 1e-9 with the retyped parameters as the negative control (more than 50 percent off); "edited after the handoff"; "source changed since" by fingerprint; the EPE cash-flow engine gives the same KPIs and cash flow with and without the provenance record, and counts a dated trailing row (negative control). |
| One year length | `src/utils/declineCurve/__tests__/dcaYearLength.test.js` (4) | The constant in the registry, DCA, the hub, the unit view and Well Spacing; known values; the 365-day number as negative control. |
| Group roll-up | engines `__tests__/dca.groupRollup.volumes.test.js` (4), vendored | Through `rollupGroup`, with the old arithmetic as negative control (10,240 for a 60,000 EUR; 4,340 for a 140 bbl/d month). |
| Saved state | `src/utils/declineCurve/__tests__/dcaSavedState.test.js` (3) on `e2e/fixtures/dca/saved/project-2026-09-before-u1.json` | A September project opens with its fit on Ekene-1, refuses a report until one new fit, keeps its scenario; a project saved now round-trips with the same report rows and contract fingerprint. |
| Record sharing | `src/contexts/__tests__/dcaSharing.test.jsx` (3) | On the in-memory mirror of the database rules: own then shared, view-only never written, edit-shared written only with the check-out, Save a copy. |
| Browser | `e2e/dca-upgrade.spec.js` (10), `e2e/dca-t1.spec.js` | Three viewports in both themes; the PDF downloaded and read with pdftotext and pdfinfo; the stale fit; the hostile door; the sender into the hub harness with the source printed and kept through a reload. |

## Step 1: the twenty-four checks

Grades: P pass, Pa partial, F fail. "Was" is the gap matrix grade for RL and
the state found here for PL; DCA first, hub second where they differ.

| Check | Was | Now | Findings | Notes |
|---|---|---|---|---|
| PL1 Labels mean the textbook | Partial | Pass | 005, 012, 013, 014, 016, 021 | Quantity table below. |
| PL2 Hostile files | Failed | Pass | 004, 009 | Eleven files, jest and e2e. |
| PL3 Units, datums, frames | Failed | Pass | 010, 018; HUB-006 | Rates, volumes and the decline unit on the profile; state stays oilfield; one 365.25-day year. No depth or pressure in either app. |
| PL4 No claim without the event | Partial | Pass | 001, 003, 007, 014 | Stale rule in both directions; facility limit applied. |
| PL5 Real saved state | Failed | Pass | 001, 011; HUB-007 | September fixture; round trip; sharing. |
| PL6 Real browser | Passed with gaps | Pass | 020, 022 | Three viewports, both themes, white charts with the mark, no page error, no sideways scroll (e2e). |
| PL7 Report a reviewer can sign | Failed | Pass | 002 | See RL1 to RL12. |
| PL8 Practitioner's day | Gaps | Gaps recorded | 023, 024 and Step 2 | Persona walks below. |
| PL9 The chain | Failed | Pass | 008; HUB-004 | DCA to the hub and to Petroleum Economics Studio, read by id. |
| PL10 Real scale | Not measured | Measured, small | | A 20-year daily history (7,300 rows) reads at the door in about 0.4 s in jest on the studio box; the fit about 0.2 s; the PDF caps the data table at 120 rows and says so. No customer laptop was used. |
| PL11 Inputs a person can type | Failed | Pass | 017; HUB-005 | `DcaNumberField`: "2.", "-" and an empty box stay as typed. |
| PL12 House standards | Partial | Pass | 019, 022 | `EMPTY_VALUE` in the report and tables, white chart theme with ChartLogo, no em dash in new copy, routes protected, dead code removed. |
| RL1 Inputs with unit and source | F | P | 002, 015; HUB-001 | Guard: every key handed to the fit and the forecast has a row. Defaults print as the app's default. |
| RL2 Composites show components | Pa | P | 002 | EUR is the one composite: produced plus remaining, printed with how each was made. |
| RL3 Lumped results split | F | P | 002, 016 | EUR in its parts, closing on the total; the fit is one segment and says so (segmented fitting is Step 2). |
| RL4 Identification | F | P | 002, 025 | Company (from the organisation, editable), field, licence, well, reservoir, stream, data dates, cut-off, analysis type, analyst, project, fit date, build, sample flag. |
| RL5 Data and operations summary | F | P | 002, 023 | Every row counted; points left out with the reason; the import door's read-back kept with the well and printed. |
| RL6 Every result has its plot | F | P | 002, 012, 021 | Rate-time (log rate, window shaded, limit, cut-off), rate-cumulative, cumulative-time, EUR distribution or its statement. Same series on screen and in the PDF. |
| RL7 The basis is named | Pa | P | 010, 012, 013; HUB-002, HUB-003 | Nominal per day at the fit start, per year of 365.25 days, effective beside it; exceedance percentiles; calendar-day rates; volume units. |
| RL8 Strengths kept, claims earned | Pa | P | 003, 005, 014 | The engine's intervals shown with the method; regression statement; seed; stale rule; out-of-date refused. |
| RL9 Limits printed | F | P | 002 | Arps assumptions, b above 1, extrapolation, interval method, economic limit, units; flags on this analysis. |
| RL10 Import doors | Pa | P | 004, 009 | |
| RL11 Senders and provenance | F | P | 008; HUB-004 | One real sender, two receivers, read by id, "source changed since". |
| RL12 One model | F | P | 001, 002, 015 | Report tab and PDF from one model; screen and PDF from one series builder; saved project round trip. |

Forecast Scenario Hub on the same lens: RL1 F to P (CSV), RL4 F to Pa
(a case names its source well; the hub has no report, Step 2), RL5 and RL6
F to Pa (screen only: no report), RL7 Pa to P, RL8 Pa to P, RL9 Pa to Pa (the
indicative economics statement; no report), RL11 Pa to P, RL12 Pa to P.

### PL1 quantity table

| Quantity | Standard meaning | What the code computes | Same? |
|---|---|---|---|
| qi | Rate at the start of the decline | Fitted rate at the first point of the fit window (`t0`) | Yes; now printed with its date |
| Di | Nominal (instantaneous) decline, -dq/dt / q at t0 | Per day from the regression; shown per year as x 365.25 | Yes; the basis is now named everywhere (H2 kept) |
| Effective decline | Share of rate lost over a period, 1 - q(T)/qi | Over the first year, read off the fitted curve | Yes |
| b | Arps exponent | Grid search in 0.05 steps between the limits for the hyperbolic; 0 and 1 fixed | Yes; b above 1 flagged |
| EUR | Cumulative to the economic limit from first production | Produced (trapezoids of the rate history) plus remaining (daily sum after the cut-off) | Yes; to the horizon when the limit is not reached, and said so |
| Remaining reserves | Volume after the cut-off to the limit | Daily sum after the last data | Yes (T1 fix kept) |
| P90, P50, P10 | Exceedance percentiles of EUR | Sorted EUR draws; P10 the high case | Yes; "Most Likely" for the median removed (013) |
| P10 to P90 band on the plot | Analytic 1.28 sigma parameter offsets | Was 1.28 x the 95% half width (about 2.5 sigma) | Fixed (012) |
| 95% intervals | From the regression's standard errors | Engine: delta method; Diagnostics built its own from absent fields | Fixed (005) |
| R2 tiers | One scale | Engine 0.95/0.90/0.80; Diagnostics badge 0.95/0.85; verdict 0.95/0.85 | Fixed (014) |
| Group EUR | Sum of member EURs | Sum of remaining volumes | Fixed (006, engines #301) |
| Group rate | Sum of member daily rates in a month | Sum of every daily point in the month | Fixed (006) |
| Hub decline | Nominal %/yr at the case start | `declineAnnualPct / 100 / 365` per day | Yes; labelled now, year 365.25 |

### Findings

| ID | Sev | Check | Finding | Evidence | Status |
|---|---|---|---|---|---|
| DCA-U1-001 | **S2** | PL4, PL5, RL12 | The fit, the forecast, their settings and the fit window were held once per project and per stream. Opening a second well showed the first well's fit and forecast over the second well's data; a scenario saved there carried the first well's numbers under the second well's name; the help told users to "re-fit immediately after every well change". | `dcaPerWellAnalysis.test.jsx`, verified failing on the old context. | Fixed: `well.analysis` per well (`dcaModel.js`); a version 1 project moves its analysis onto the well it was fitted on and says so. |
| DCA-U1-002 | **S2** | RL1, RL3 to RL9, PL7 | No report. | Gap matrix. | Fixed: `dcaReport.js`, Report tab, PDF on the kit. |
| DCA-U1-003 | S3 | RL8, PL4 | A fit and a forecast stayed on screen and in exports after the data, window, model, b limits or settings changed. | Gap matrix. | Fixed: `analysisStatus` from recorded bases; out-of-date results say why, are not forecast from, saved as scenarios, reported or sent. |
| DCA-U1-004 | **S2** | RL10, PL2 | A column named `volume` (monthly volume) was taken as the daily rate, about 30 times high; dates went through `new Date()` (day-first misread or refused); decimal commas failed; negative-rate warnings were computed and never shown; no read-back. | `productionImport.test.js` negative controls. | Fixed: `productionImport.js` on `tabularParse`; read-back; questions; monthly volumes to calendar-day rates. |
| DCA-U1-005 | S3 | RL8 | Diagnostics computed its own "95% intervals" from `actualData` and `predictedData`, which a fit never carries, so it never showed the engine's intervals; the function behind it used invented relative errors (10, 15, 20 percent). | Code; h2 test fixture. | Fixed: the engine's intervals with the method named; the invented function deleted. |
| DCA-U1-006 | **S2** | PL1, RL3 | Group roll-up: "Group EUR" was the sum of remaining volumes; the combined rate summed every daily point of a month (about 30 times) and counted days as wells. | Engines gate with the old arithmetic. | Fixed engines-first (PR #301, not merged; vendored with ledger rows); the panel names the basis and flags pre-H3 scenarios. |
| DCA-U1-007 | **S2** | PL4 | The facility limit field was shown for every forecast and only the Monte Carlo applied it. | Code: `generateForecast` never reads it. | Fixed in `forecastFromHistory` (the cap the Monte Carlo applies). |
| DCA-U1-008 | S3 | RL11, PL9 | No sender: the sync cards were removed by H1; a forecast reached the hub or economics only by retyping across a basis 365 times apart. | Owner question 10. | Built: `dca-forecast-1`, two receivers. |
| DCA-U1-009 | S3 | RL10 | CSV only; no Excel; no read-back of columns, units or skipped rows. | Gap matrix. | Fixed with 004. |
| DCA-U1-010 | S3 | RL7, PL3 | DCA, the hub and Well Spacing counted a year as 365 days; the registry as 365.25. | Step 0a note. | Decided: 365.25 everywhere (see the decision below). |
| DCA-U1-011 | S3 | PL5 | Record sharing not adopted, though the table is under the rules. While adopting it, a colleague's project would have saved as "Untitled project" (the name was looked up in my own list): fixed before it shipped. | Programme lead; `dcaSharing.test.jsx`. | Fixed: viewing and editing with check-out, Save a copy. |
| DCA-U1-012 | S3 | RL6, RL7 | The P10 to P90 band on the plot used 1.28 times the whole 95% half width, about 2.5 sigma (close to a 99% band), under a P10 to P90 label; the engine's own curves use 1.28 sigma. | Code. | Fixed: one series builder on the engine's convention. |
| DCA-U1-013 | S3 | RL7, PL1 | "P50 EUR (Most Likely)" called the median the mode; P10 "Optimistic" and P90 "Conservative" without the exceedance statement. | Gap matrix. | Fixed. |
| DCA-U1-014 | S3 | PL4 | Three fit-quality scales: the notification said "Fair" from 0.80, the badge "Good" from 0.85, the verdict "Reasonable" from 0.85. | Code. | Fixed: one scale. |
| DCA-U1-015 | S3 | RL1, RL7 | Forecast CSV had four bare columns; the scenario workbook had no units. | Gap matrix. | Fixed: header lines with well, parameters, basis, units, limits and build; unit columns in the workbook. |
| DCA-U1-016 | S3 | RL3 | "N-segment decline pattern detected" with no segmented fit; "slope change" printed an R2 improvement. | Gap matrix; code. | Fixed wording; segmented fitting is Step 2. |
| DCA-U1-017 | S4 | PL11 | Number fields parsed on every keystroke: a cleared b limit became NaN and silently removed the hyperbolic search; "0." snapped. | Walk. | Fixed: `DcaNumberField`. |
| DCA-U1-018 | S3 | PL3 | Oilfield units only. | Gap matrix. | Fixed: `dcaUnits.js` on the registry; display unit for the decline. |
| DCA-U1-019 | S4 | PL12 | Dead code: a keyboard shortcut hook never called, an undo manager made and never used, LAS and CSV writers in the engine shim, a type-curve CSV writer reading a key that never exists, the invented intervals. | Code. | Removed. The three unmounted legacy panels the plan names were already deleted (commit 9ac787d56). |
| DCA-U1-020 | S4 | PL6 | The forecast table showed every sixth day under a comment saying every sixth month. | Code. | Fixed: one row a month. |
| DCA-U1-021 | S3 | RL6 | No rate-cumulative or cumulative-time plot; no fit window, limit or cut-off on the plot. | Gap matrix. | Fixed. |
| DCA-U1-022 | S4 | PL12 | Gas units printed "Mcf/d" and "Mcf" in two panels, "Mscf/d" elsewhere. | Code. | Fixed. |
| DCA-U1-023 | S3 | RL5, PL8 | Outliers were flagged and could not be excluded. | Gap matrix. | Fixed: exclude with a reason, restore; counted and printed. |
| DCA-U1-024 | S4 | PL11 | No sample data in the app. | Walk. | Fixed: "Add the sample well" (Ekene-1 primary decline, labelled sample everywhere). |
| DCA-U1-025 | S3 | RL4 | A well had tags and notes only. | Gap matrix. | Fixed: identification on the Report tab. |
| DCA-U1-026 | S3 | PL1, RL9 | No terminal (minimum) decline: a hyperbolic with b above 1 runs to the horizon; the b upper limit defaults to 1. | Code. | Open: flagged in the report; modified hyperbolic is U2. |
| DCA-U1-027 | S3 | PL8 | Type curves: not walked in depth this round; the normalisation and "apply" path are unchanged. | | Open: noted for Step 2. |
| HUB-U1-001 | S3 | RL1 | The annual CSV was `year,production_bbl`: no case, parameters, units, start or source. | Gap matrix. | Fixed: `forecastScenarioExport.js`. |
| HUB-U1-002 | S3 | RL7 | "Decline (%/yr)" with no basis. | Gap matrix. | Fixed: nominal at the case start, a year of 365.25 days. |
| HUB-U1-003 | S3 | RL7 | The start date was a fixed 2026-01-01, shown nowhere. | Gap matrix. | Fixed: a set start and a case start; the table prints it. |
| HUB-U1-004 | S3 | RL11 | No intake from DCA. | Gap matrix. | Fixed: `forecastScenarioIntake.js`, the dialog and the deep link. |
| HUB-U1-005 | S4 | PL11 | Fields snapped to 0 when cleared. | Walk. | Fixed. |
| HUB-U1-006 | S3 | PL3 | Oilfield only. | Gap matrix. | Fixed: rates and volumes on the profile. |
| HUB-U1-007 | S3 | PL5 | No record sharing. | Plan. | Fixed: own and shared sets, check-out, Save a copy. |
| HUB-U1-008 | S4 | PL4 | The export toast sent people to NPV Scenario Builder, which has no CSV import. | Gap matrix. | Fixed: names the working route. |
| HUB-U1-009 | S3 | RL6, RL4 | No report. | | Open: U2. |
| HUB-U1-010 | S3 | RL11 | The Petroleum Economics Studio import from the hub recomputes the case and keeps no source. | Code. | Open: U2 (the DCA route carries it today). |

### What the report contains

Page 1: the header (14 identification pairs, the display units, generated
time), Headline results (produced to the cut-off, remaining to the limit or
the horizon, EUR closing on the two), Life (the fitted rate at the cut-off,
time to the end, how the forecast ends). Then Inputs (17 rows: the data and
where it came from, the model and how it was chosen, the b limits, the fit
window, exclusions, the cut-off, qi with its date, Di with its basis, b, the
economic limit with its basis, the horizon, the facility limit, Monte Carlo,
seed, limit uncertainty), Decline rate and its basis (per day, per year,
display unit, effective first year), Regression (model, method, choice,
points, R2, RMSE, the three intervals and the method), Monte Carlo EUR
(P90, P50, P10, mean with the convention) or the sentence that it was not
run, Data used and left out (six counts and the import notes), Points left
out and why, Production data (120 rows at most), Limits of this analysis
(eight assumptions, flags on this analysis), and the figures: 1 rate against
time on log rate with the fit window shaded, the fitted line, the forecast,
the economic limit and the cut-off; 2 rate against cumulative with EUR
marked; 3 cumulative against time with EUR; 4 the EUR distribution with P90,
P50 and P10, or the line that says it does not apply. The fit is one segment
and the rate-time caption says there is no boundary to mark. Sample: 6 pages
for the sample well (deterministic).

### The sender contract `dca-forecast-1`

`src/utils/declineCurve/dcaForecastContract.js`, read by id through
`dcaForecastService.js` (`getDcaForecast(supabase, {projectId, wellId,
stream})`, `listDcaForecasts`).

| Field | Meaning |
|---|---|
| `schema`, `app`, `table` | `dca-forecast-1`, Decline Curve Analysis, `saved_dca_projects` |
| `projectId`, `projectName`, `projectSavedAt` | the saved project read |
| `source` | `{kind: 'well', wellId, wellName, sample, field, reservoir, company}` |
| `stream` | oil, gas or water |
| `units` | `rate` bbl/d or Mscf/d, `volume` bbl or Mscf, `time` day; calendar-day rates at stock-tank conditions |
| `decline` | model, qi and its date, Di per day, nominal %/yr, effective first-year %, b, the basis sentence, `daysPerYear` 365.25 |
| `atCutoff` | the same curve restarted at the data cut-off: date, days from the fit start, the rate, the nominal decline there |
| `fit` | fitted at, window, points used, exclusions with reasons, R2, RMSE, intervals |
| `forecast` | forecast at, first day, economic and facility limits, horizon, how it ends, time to limit, produced, remaining, EUR, calendar-year volumes |
| `probabilistic` | P90, P50, P10, mean, runs, seed, convention; or null |
| `sentBuild`, `fingerprint` | the build that sent it (not fingerprinted); FNV-1a over everything the forecast says |

Refused with the reason: no fit, no forecast, an out-of-date fit or forecast,
a missing well. Receivers: **Forecast Scenario Hub** (oil; a case starting
the day after the cut-off with `atCutoff` values; the hub's engine reproduces
the DCA forecast day for day; prints the source and basis, flags fields
edited after the handoff, re-reads by id on load and offers Refresh) and
**Petroleum Economics Studio** (Production, Import from Decline Curve
Analysis: calendar-year rows in `oil_bbl`, `gas_mscf` or `water_bbl`, the
contract as the last record of the file's data, printed on the file card
with "source changed since"; the cash-flow engine ignores the record, gated).
The DCA side shows what would be sent and saves before sending.

### The year-length decision

One year is **365.25 days** in Decline Curve Analysis, Forecast Scenario Hub
and Well Spacing, the Suite registry's year (the Julian year of the SPE
metric standard). Why: the DCA engine fits on calendar dates, so its day is a
calendar day and a calendar year averages 365.2425 days; 365 was a quarter of
a day short, and with the registry at 365.25 the same decline printed two
numbers in two apps. What moved: every printed nominal %/yr in DCA rose by
0.068 percent (Ekene-1: 43.80 to 43.83); no fitted number changed. In the
hub, a typed %/yr is now divided by 365.25 (a slightly slower daily decline),
horizons are 365.25-day years (20 years = 7,305 days, was 7,300), the 50-year
cap is 18,263 days: a saved scenario set shows numbers about 0.1 percent
different. Well Spacing: the economic rate a year moves by a quarter day; the
sample NPVs move by at most 0.012 percent (80 ac 2,226.778 to 2,226.812
$MM). Pinned: `dcaYearLength.test.js`.

### What changes numbers for saved projects

- **Per-well fits:** a project saved before opens with its fit on the well it
  was fitted on; other wells open with no fit. The fit is marked "saved by an
  earlier release" and must be refitted once before a report or a send.
- **Facility limit:** a saved project with a facility limit set gets a lower
  deterministic forecast the next time it is forecast (it was ignored).
- **Group roll-up:** "Group EUR" now includes produced volumes (larger); the
  combined rate is about a thirtieth of what it showed.
- **P10 to P90 band:** narrower on screen (1.28 sigma, was about 2.5 sigma).
  The Monte Carlo P10, P50, P90 numbers do not change.
- **Default horizon** for a new stream is 3,653 days (ten years of 365.25),
  was 3,650. Saved settings keep theirs.
- **Decline display:** +0.068 percent (365.25). Hub saved sets: about 0.1
  percent (365.25 in the forecast).
- **The import door:** files are no longer imported without a read-back; a
  file that names its volumes now becomes calendar-day rates.

### What the gap matrix and the plan had wrong or missed

- The plan lists "unmounted legacy panels" (DCASegmentsPanel,
  DCAForecastSettings, DCAParametersPanel) to remove or mount: they were
  already deleted by the design programme (commit 9ac787d56).
- The matrix graded RL8 Pa on the strength of "95% Confidence Intervals" on
  screen: Diagnostics never showed them (005).
- Missed entirely: the per-well fit defect (001, S2), the group roll-up
  (006, S2), the `volume` alias read as a rate (004, S2), the ignored
  facility limit (007, S2), the band width (012), three fit-quality scales
  (014).
- Step 0a says "A year is 365 days in the DCA ... engines": the DCA engine
  works in calendar days; only its display used 365.
- RL2 Pa: DCA has one composite (EUR); it is now printed with its parts. No
  other composite exists in the app.

### Where validation is weaker than asked

- **Arps against a published worked example:** the existing literature gate
  (`dcaEngine.literature.test.js`) is kept; this round's truth is the
  planted Ekene-1 decline (engines test data), which is a closed form, not an
  independent field case. No published hyperbolic field example with a
  stated fit was read.
- **The 95% intervals** are first-order delta-method estimates; the b
  interval is an assumed 10 percent. They are printed as such and not
  validated against a nonlinear regression.
- **EUR quadrature:** remaining volume is a daily right-endpoint sum; on the
  sample it is 0.1 percent below the closed form (19,507 against 19,526
  bbl); not corrected (engine change, U2-019).
- **Live data:** nothing was run against a customer file or the live
  database; the sender was exercised on the in-memory double and harnesses.
  A first live send and EPE import are owner items.
- **Real scale:** timings are jest on the studio box, not a customer laptop.

### Persona walks (PL8)

**ARIES or PHDwin user.** Imports a monthly volumes export (now read as
calendar-day rates with the read-back), sets the fit window to the last
decline, excludes a choke change with a reason, fits Auto, sets a 10 bopd
limit, forecasts, prints the report. Would now: fit a modified hyperbolic
with a terminal decline (U2-001), see a rate-cumulative fit (U2-002), batch
fit a field (U2-005), roll groups to an economics run (U2-007).

**Graduate engineer.** Adds the sample well, fits, sees the window shaded and
the limit drawn, reads the KPI with the nominal and effective declines. Would
now: switch a fit to effective decline input (the display is there; typed
input U2), read a b above 1 warning on screen before the report.

**Manager reading the report.** Reads EUR as produced plus remaining, the
limits and flags, the figures. Would now: compare scenarios in the report
(U2-008).

## Step 2: advancement review (analysis only)

### 2a. Competitor parity (public documentation)

Sources read for this round: the Harmony decline theory and Arps analysis
help pages (ihsenergy.ca documentation), the whitson+ user manual (Decline
Curve Analysis, Type Well), and secondary descriptions of the ARIES and
PHDwin modified hyperbolic (a hyperbolic that switches to exponential at a
limiting decline). ARIES and PHDwin help is not public: their rows are from
those secondary sources and general practice, not checked feature by feature.
Nothing was installed.

| Capability | Harmony | ARIES | PHDwin | whitson+ | Petrolord now | Gap |
|---|---|---|---|---|---|---|
| Modified hyperbolic (terminal Dmin) | Yes | Yes | Yes | Yes | No | U2-001 |
| Segmented (multi-segment) forecast | Yes | Yes (segments) | Yes | Yes | One segment | U2-003 |
| Rate-cumulative fitting | Yes | Yes | Yes | Yes | Plot only | U2-002 |
| Effective decline input (tangent/secant) | Yes | Yes (secant) | Yes | Yes | Display only | U2-004 |
| Type wells (P10/P50/P90 normalised) | Yes | Yes | Yes | Yes | Type curve, one fit | U2-006 |
| Probabilistic decline | Yes | Via add-ons | Limited | Yes | Parameter MC | U2-009 |
| Multi-well grouping and batch fitting | Yes | Yes | Yes | Yes | Groups of saved scenarios | U2-005 |
| Ratio forecasts (GOR, WOR, yield) | Yes | Yes | Yes | Yes | No | U2-010 |
| Downtime and uptime factors | Yes | Yes | Yes | Yes | Facility cap only | U2-011 |
| Reserves categories and audit trail | Yes | Yes | Yes | Partial | Report only | U2-012 |

### 2b. Deferred backlog

From the STATUS docs, memory and this round: segmented fitting (detection
util exists, unwired); MC sample curves computed and not plotted; terminal
decline; the EUR right-endpoint quadrature (0.1 percent low); the hub has
no report; the hub to EPE route keeps no source; type curves not walked;
Fetkovich-style type curve matching not present.

### 2c. Suite integration

| Pair | Today | Gap |
|---|---|---|
| DCA to Forecast Scenario Hub | `dca-forecast-1` (this round) | Group forecasts (U2-007) |
| DCA to Petroleum Economics Studio | `dca-forecast-1` (this round) | Multi-stream in one file; well groups (U2-007) |
| Hub to Petroleum Economics Studio | Recomputes, no source | Carry the case's source (U2-013) |
| DCA and Material Balance | None | MBAL forecast or rate history as a DCA input, and DCA EUR beside MBAL recovery (U2-014) |
| DCA to Well Spacing | None (Well Spacing retypes a decline) | Send a type well's decline and EUR per well (U2-015) |
| DCA to Risked Reserves and Capital Portfolio | None | P90/P50/P10 EUR of a group as reserves per category (U2-016) |
| Wells registry | DCA wells are names | Pick the well from the registry, bring its identity (U2-017) |

### One ranked backlog

Size: S under a day, M two to four days, L a week or more. Batch A is
NAPE-safe and highest value; B next; C after NAPE.

| Rank | ID | Item | Size | Batch |
|---|---|---|---|---|
| 1 | U2-001 | Modified hyperbolic: a terminal decline (Dmin, effective %/yr) switching to exponential; engines-first with a published check | M | A |
| 2 | U2-002 | Rate-cumulative fitting (and plotting the fit in rate-cum space), useful on noisy rate-time | M | A |
| 3 | U2-008 | Scenario comparison in the report, and a one-page summary | S | A |
| 4 | U2-004 | Typed decline on either basis (nominal or effective, per year or month) for the hub and DCA forecasts | S | A |
| 5 | U2-018 | Hub report on the kit (cases, parameters with sources, profiles, the indicative economics) | M | A |
| 6 | U2-013 | Hub to EPE import keeps the case source (and the DCA source behind it) | S | A |
| 7 | U2-003 | Segmented fitting: user-placed segment boundaries, one fit per segment, segment table and boundaries on the plots | L | B |
| 8 | U2-005 | Batch fit a group of wells with one window rule; review grid | M | B |
| 9 | U2-007 | Group forecast sender (sum of member forecasts, with members listed) | M | B |
| 10 | U2-006 | Type wells: P10/P50/P90 normalised type curve with well count, applied to a new well with a start date | L | B |
| 11 | U2-011 | Downtime and uptime factor in the forecast | S | B |
| 12 | U2-010 | Ratio forecasts (GOR, WOR) to forecast gas and water from oil | M | C |
| 13 | U2-009 | Probabilistic decline on the canonical Monte Carlo with correlated parameters, sample curves plotted | M | C |
| 14 | U2-014 | Material Balance link (rate history in, recovery beside EUR) | M | C |
| 15 | U2-015 | Well Spacing intake of a type well | S | C |
| 16 | U2-016 | Reserves by category to Risked Reserves and Capital Portfolio | M | C |
| 17 | U2-017 | Wells registry pick and identity | S | C |
| 18 | U2-012 | Reserves categories and a change log of forecasts | L | C |
| 19 | U2-019 | EUR quadrature: closed-form integral per day (0.1 percent) | S | C |

### Owner questions

| # | Question | Recommended default |
|---|---|---|
| 1 | Terminal decline: a default Dmin? | None by default; the user sets it, the report prints it; a b above 1 without one stays flagged |
| 2 | Group roll-up now counts produced volumes in "Group EUR"; users who read it as remaining will see larger numbers. Announce it? | Yes: one line in the release note; the panel shows remaining beside EUR |
| 3 | Petroleum Economics Studio receives one stream per file. Gas and oil from one well as two files, or one file with two columns? | Two files today (one per stream, each with its source); a two-column file in U2-007 |
| 4 | The hub holds oil only. Add gas cases? | Not before NAPE; gas forecasts go to Petroleum Economics Studio |
| 5 | Should the sample well be offered in production, or only in the harness? | In production, labelled sample everywhere (as Fluid Systems Studio does) |
| 6 | Engines #301 (group roll-up) merge | Merge after review; then re-pin and delete the two ledger rows |
