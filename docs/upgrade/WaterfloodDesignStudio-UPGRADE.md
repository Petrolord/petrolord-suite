# Waterflood Design Studio: upgrade (Reservoir round, app 6)

Step 1 (the two lenses, PL1 to PL12 and RL1 to RL12, with fixes) and the
Step 2 analysis. Branch `feat/waterflood-u1`, worktree `/root/wt-res-wf`.
Started 2026-10-04.

Read first: `docs/scope/AppUpgrade-Reservoir-PLAN.md`,
`docs/scope/AppUpgrade-Reservoir-GapMatrix.md` (section 4.8),
`docs/scope/AppUpgrade-Reservoir-FeedbackLessons.md`,
`docs/scope/ReportKit-DESIGN-AND-STATUS.md`,
`docs/upgrade/SCALStudio-UPGRADE.md` (kr-1),
`docs/upgrade/FluidSystemsStudio-UPGRADE.md` (pvt-1),
`docs/scope/WaterfloodDesignStudio-STATUS.md`.

- Harness: `/dev/studio/waterflood` (in-memory Supabase double).
- Status: Step 1 done 2026-10-04; Step 2 Batch A building on `feat/waterflood-u2`
  (worktree `/root/wt-res-wf2`), see section 9.

## 1. Step 1 checks

Walked in a real browser (Playwright, 1366x768, 1440x900, 390 wide, light and
dark) on the harness and in the code. Before = the app at main 832b4608d;
after = this branch.

| Check | Before | After | Findings | Evidence |
|---|---|---|---|---|
| PL1 Labels mean the textbook | Pa | P | 004, 005, 018, 019 | The areal sweep correlation now takes Craig's M; ER is of the pattern OOIP; ED x EA x EV closes. Sgi stated, not changed. |
| PL2 Hostile file set | F | P | 008 | Eight files in `e2e/fixtures/waterflood/hostile`, one dataset; every twin reads to the same rows; jest and e2e. |
| PL3 Units, datums, frames | F | Pa | 011, 021, 023 | Oilfield and SI on the registry with pinned values; storage oilfield; the Uncertainty distributions and the layer cells are the gaps. No datum applies (no depth). |
| PL4 No claim without the event | Pa | P | 001, 014 | Alert count; the saved Monte Carlo summary says "changed since" when the inputs moved. |
| PL5 Real saved state | Pa | P | 017 | Version 1 fixture opens on the endpoint basis and says so; `.pld` round trip (015). |
| PL6 Real browser | Pa | P | 003, 012, 024 | `e2e/waterflood-upgrade.spec.js` six viewport and theme runs: white charts with the mark, no sideways scroll, no em dash, no page error. Header title truncation open (024). |
| PL7 / RL The report | F | P | 016 | Section 4. |
| PL8 The practitioner's day | Pa | Pa | | Persona walks in section 5. |
| PL9 The chain | Pa | P | 009, 015, 026 | SCAL kr-1 and Fluid pvt-1 by id with cards; Well Test k kept; `.pld` carries the intakes. |
| PL10 Real scale | NA | NA | | Analytical engines; the surveillance door read the 80-row hostile files instantly; a 10-year daily field file (about 36,500 rows a well) was not timed. |
| PL11 Typable inputs | Pa | Pa | 023 | Unit-aware fields keep "-" and "2." in oilfield and keep a draft in SI; layer cells open. |
| PL12 House standards | Pa | P | 002, 007, 020 | EMPTY_VALUE, copy without em dashes, white chartTheme with ChartLogo, route already protected. |
| RL1 Inputs with unit and source | F | P | 009, 016, 026 | Every engine input has a row (completeness guard with negative control); starting values print as assumptions. |
| RL2 Components | Pa | P | 013 | Mobility ratio by its parts (endpoint and Craig); Stiles A from M x Bo / Bw. |
| RL3 Lumped results split | Pa | P | 004 | ED x EA x EV closing on Np over the pattern OOIP. |
| RL4 Identification | F | P | 016 | Company (organisation fallback), field, licence, reservoir, pattern, wells, analyst, data dates, analysis type, build, units. |
| RL5 Data and operations | Pa | P | 005, 008 | Forecast year by year summing to Np; the surveillance file as read; the wells with dates, days and volumes closing on the engine totals. |
| RL6 Every result has its plot | F | P | 006, 016 | kr with source, fw with the Welge tangent, ED against PV, rates and WOR, Np and EA, Dykstra-Parsons, rates and VRR on the calendar, Hall per injector with shaded windows and fitted lines; conditional figures say why. |
| RL7 Basis named | Pa | P | 003, 010, 012, 025 | FVF RB/STB, Bg RB/Mscf, surface WOR, VRR in reservoir barrels, calendar time, pressure basis, percentile convention. |
| RL8 Strengths kept, claims honest | Pa | P | 006, 014, 022 | Hall slopes with 95 percent intervals; rejection accounting kept; MC summary state. Seed open (022). |
| RL9 Limits printed | Pa | P | 019 | Assumptions, published ranges (Craig M 0.15 to 10), flags. |
| RL10 Import doors | Pa | P | 008 | The shared typed reader, units at the door, questions, read-back. |
| RL11 Senders and provenance | Pa | P | 009, 026 | kr-1 and pvt-1 by id with "source changed since" and "edited after intake"; FVF basis stated. |
| RL12 One model | Pa | P | 014, 015, 016 | The Report tab rows are the PDF rows (test); figures from the screen series builders (point counts); `.pld` round trip. |

## 2. Findings

| ID | Sev | Check | Finding | How found | State |
|---|---|---|---|---|---|
| WF-U1-001 | S3 | PL4 | The right rail's Surveillance "Alerts" read `.length` of the alerts object and always printed 0, while the sample carries a Hall injectivity alert. | Browser walk (rail showed 0 beside an alert badge); code. | Fixed: `countAlerts`; `wfU1Honesty.test.jsx` (negative control: the old reading gives 0). |
| WF-U1-002 | S4 | PL12 | Missing values printed '-' (studio `fmt`, rail) and 'N/A' (Surveillance KPIs). | Code. | Fixed: `EMPTY_VALUE` everywhere in the app's own files. |
| WF-U1-003 | S3 | RL7, PL1 | "Avg VRR" in the KPI panel was the cumulative reservoir-barrel ratio ("Cumulative VRR" in the rail); KPI titles were truncated at 1366 ("Avg W...", "Total I..."). | Browser walk at 1366x768. | Fixed: "Cumulative VRR"; titles wrap, six tiles in a row only from 2xl. |
| WF-U1-004 | S2 | PL1, RL7 | The five-spot areal sweep correlation (Craig's data, Willhite's regression) was entered with the endpoint mobility ratio (krw at Sor). Craig correlated the sweep with M taken with krw at the average water saturation behind the front at breakthrough. On the sample M 4.00 against 1.53, EA at breakthrough 53.9% against 62.5%: the forecast understated areal sweep and put pattern breakthrough early. | PL1 quantity table against Craig (1971) and Ahmed ch. 14. | Fixed engines-first (PR #304): `arealSweepMobilityRatio`, `pattern.mobilityBasis: 'craig'`; the engine default stays 'endpoint' for the course fixtures. The app: new projects use Craig, saved projects keep the endpoint basis with a note and a switch (see 2.x). Gate `waterflood.wfu1.test.js` block 1; negative control fails 2. **Moves numbers.** |
| WF-U1-005 | S2 | PL1, RL5 | Surveillance totals (oil, water, injection) and the cumulative VRR summed the daily RATES of the rows: right on a daily file, about 30 times low on a monthly file (totals), and rate-weighted VRR on an irregular one; the rolling window counted rows. | Code; the Ekene course fixture records the same defect ("rows as days"). | Fixed engines-first (PR #304): `time_weighting: 'calendar'` (rate x days to the next row; calendar-day window), passed by the app; engine default unchanged for the course fixture. Daily files unchanged; the Ekene monthly file comes back to its ledger VRR within 1.2e-5. **Moves numbers for non-daily files.** |
| WF-U1-006 | S3 | RL6, RL8 | Hall plot: the baseline and recent slope windows were not drawn, no fitted lines, slopes with no interval (H11 fixed the axes only). | Gap matrix; code. | Fixed: engine returns both windows (line, 95 percent interval, r2, dates); drawn on screen and in the report (see the report item). |
| WF-U1-007 | S4 | PL12 | Chan mechanism labels and one recommendation note carried em dashes. | Browser walk (Surveillance tab). | Fixed in the engine copy (PR #304). |
| WF-U1-008 | S2 | PL2, RL10 | Surveillance import: a decimal comma was truncated ("1000,5" read as 1000, a quoted "1,5" as 1), day-first dates were read month-first or dropped with only a count (on the hostile day-first file 32 of 80 rows vanished), no unit at the door (an m3/d or kPa file was read as bbl/d and psi), monthly volumes and cumulatives had no refusal by name, and the read-back was a toast. | Hostile file set (`e2e/fixtures/waterflood/hostile`, eight files, one dataset); old door as negative control. | Fixed: `surveillanceImport.js` on `src/lib/tabularParse.js`: columns by header in any order, decimal mark and date order from the file or asked, units from the header or chosen at the door, volumes refused by name, a read-back kept with the project and printed in the report. `wfSurveillanceImport.test.js` (8). |
| WF-U1-009 | S2 | RL11, PL9 | No PVT intake: Bo, Bw, muO, muW, Bg and Rs were typed in three tabs with no source; Surveillance defaulted Bo 1.25 and Bw 1.02 silently. | Gap matrix; code. | Fixed: `pvt-1` read by id from a saved Fluid Systems Studio project at one stated reservoir pressure (or the bubble point), never extrapolated; Bg converted RB/scf to RB/Mscf through the registry; the shared PVT intake card with "source changed since" (content) and "edited after intake"; the methods print in the report. `wfPvt.test.js` (6). |
| WF-U1-010 | S3 | RL7 | The voidage basis was not stated: Bo and Bw as RB/STB at which pressure, the free-gas term, the pressure column wellhead or bottomhole. | Gap matrix; code. | Fixed: the basis sentence on the Surveillance panel and in the report; injection pressure basis chosen (wellhead or bottomhole) and printed on the Hall axis, caption and report. |
| WF-U1-011 | S3 | PL3 | No unit system: oilfield labels only, the Suite unit profile ignored. | Code. | Fixed: `units.js` on the registry (one known value pinned per conversion, `wfUnits.test.js`); inputs, KPIs, axes and the report in the display units; storage stays oilfield; new projects follow the profile, saved ones keep their system. The Uncertainty distributions stay in oilfield units (stated on the tab). |
| WF-U1-012 | S3 | RL7 | Surveillance rate chart had a category axis printing MM-DD with no year. | Browser walk. | Fixed: calendar axis (numeric time, year in every tick). |
| WF-U1-013 | S3 | RL2 | The Stiles capacity ratio A was typed beside its formula with no link to M, Bo, Bw. | Gap matrix. | Fixed: "From M and Bo/Bw" option printing the components; manual stays the default (numbers unchanged). |
| WF-U1-014 | S3 | RL12, PL5 | Record sharing not adopted; Monte Carlo results never saved. | Plan Step 0a; code. | Fixed: `useSharedSavedProjects` with the sharing bar, check-out and "save a copy"; the run summary of the canonical module saved with a fingerprint of its inputs ("current" or "changed since"). |
| WF-U1-015 | S2 | RL12, PL9 | A Waterflood project that had taken a kr-1 set from SCAL Studio (live since SCAL U1, #869) could not be exported to `.pld` at all: the intake record names the SCAL project by id, the package gate found a reference to data it does not carry and wrote nothing. The same for a pvt-1 intake, and for SCAL (gravities from Fluid, SCAL U2) and Well Test projects with a pvt-1 intake. | `.pld` round-trip test of a version 2 payload. | Fixed: the intake ids are declared optional soft references in `familiesCore.js` (`INTAKE_SOFT_REFS`): kept when the source travels, cleared when it does not. `waterfloodPortability.test.js` (2); negative control: without the declarations the export throws `PackageIntegrityError`. |
| WF-U1-016 | S3 | RL1, RL4, RL6, RL9, RL12 | No report of any kind; exports were the annual CSV and a template. | Gap matrix; code. | Fixed: the report on the kit (section 4 below), a Report tab with the same rows, read back in jest (`wfReport.test.js`, `wfReportPage.test.jsx`) and the e2e. |
| WF-U1-017 | S3 | PL5 | No fixture of a project saved by an earlier release. | Code. | Fixed: `__fixtures__/savedProjects.js` (version 1 payload), opened in jest and on the harness (`?saved=1`); keeps its endpoint M and says so. |
| WF-U1-018 | S3 | PL1 | "RF of flooded OOIP" divided by the OOIP after the vertical sweep multiplier, so with EV below 1 it was the recovery of the swept layers, not of the pattern. | PL1 quantity table. | Fixed: the KPI is "Recovery of pattern OOIP" (ER = ED x EA x EV); the rail shows both OOIPs by name. **The KPI moves when EV is below 1.** |
| WF-U1-019 | S3 | PL1, RL9 | With an initial gas saturation the forecast takes the oil in place on 1 - Swc and treats fill-up as a delay only (Craig's simplification); recovery can be overstated by up to PV x Sgi. | Code reading. | Stated: a flag in the report's limits whenever Sgi > 0. Open as U2-012. |
| WF-U1-020 | S4 | PL12 | Final WOR printed an infinity sign when the oil rate is zero. | Code. | Fixed: "no oil rate". |
| WF-U1-021 | S3 | PL3 | The Uncertainty distributions stay in oilfield units in an SI project. | Unit walk. | Stated in the help. Open (S, U2-014). |
| WF-U1-022 | S3 | RL8 | The Monte Carlo run draws from Math.random: two runs of the same case differ and a reported P50 cannot be reproduced (DCA fixed the same with a seed). | Code. | Open (S, U2-005). |
| WF-U1-023 | S4 | PL11 | The layer table cells take SI thickness only as whole numbers while typing ("2." is dropped in SI); the other inputs keep the draft. | Unit walk. | Open (S, U2-014). |
| WF-U1-024 | S4 | PL6 | The header truncates the title at 1366 wide ("Waterfloo...") with eight tabs. | Browser walk. | Open (cosmetic; the tab bar scrolls). |
| WF-U1-025 | S3 | RL7 | The annual CSV for NPV Scenario Builder says production_bbl without the barrel basis. | Gap matrix. | Fixed in the copy: stock-tank barrels whatever the display units (the column name is the receiver's format and stays). |
| WF-U1-027 | S3 | RL11 | The new PVT intake had no sender in Fluid Systems Studio (the RL11 static guard caught the new reader on CI). | CI jest shard 3 on PR #873. | Fixed: "Send to Waterflood Design Studio" in Fluid's Integration Suite (saved projects only, opens the Pattern tab with the project named); the guard lists the reader. |
| WF-U1-026 | S3 | RL11 | The Well Test permeability intake showed its source in a toast and kept nothing. | Gap matrix; code. | Fixed: the intake record is kept and printed, with "edited after the intake"; method and interval are not in the handoff (the sender's round). |

## 3. Step 2 analysis

### 2a. Competitor parity

Read from public pages: the SLB OFM product sheet and release notes and the
NExT "OFM Waterflood Monitoring and Surveillance" course outline; the
Interfaces (Argentina) Sahara tools page as indexed (the page itself
redirected); tNavigator from general knowledge of the product, no page read.

| Capability | OFM | Sahara | tNavigator | Here after Step 1 |
|---|---|---|---|---|
| Pattern definition from wells, allocation factors | Yes | Yes, per layer, changing over time | Yes (streamline allocation) | No: one idealised five-spot; field-level surveillance; VRR Monitor holds allocation |
| Patterns beyond five-spot (line drive, inverted nine-spot) | n/a (surveillance) | Yes | Any geometry (simulation) | Five-spot only |
| Analytical predictive models | No | Buckley-Leverett, Craig-Geffen-Morse, segregated flow, statistical curve, WOR-Np | Full simulation | Buckley-Leverett with Craig areal sweep, Dykstra-Parsons, Stiles |
| Hall plot with windows and slopes | Yes | Yes | Through the simulator | Yes, with fitted windows and 95 percent intervals; fixed thirds only |
| Chan WOR diagnostics | Yes (diagnostic plots) | Yes | n/a | Yes, field and per producer, indicative |
| Heterogeneity index plots | Yes | Yes | n/a | No |
| Bubble maps of cumulative injection and production | Yes | Yes (3D) | Yes | No (no map) |
| VRR by pattern, fill-up | Yes | Yes | Yes | Field VRR here; by pattern in VRR Monitor |
| Optimisation of injection rates | Limited | Yes | Yes (streamline optimisation) | Field balance to a target VRR |
| Uncertainty | No | Limited | Yes (ensembles) | Monte Carlo on the five-spot forecast |
| Report a reviewer can sign | Plots and tables export | Reports | Reports | Yes, on the kit |

### 2b. The deferred backlog and what Step 1 found

Carried in: patterns beyond five-spot; Hall and Chan windows (Hall done in
Step 1; window choice open); PVT intake (done); MC results saved (summary
done). Found: the Sgi oil-in-place simplification (019), the MC seed (022),
SI in the Uncertainty tab and layer cells (021, 023), the injection pressure
taken as given (no head or friction correction), a per-period FVF track.

### 2c. Suite integration

| Pair | Today | Gap |
|---|---|---|
| SCAL Studio to here | kr-1 by id, card, report | Gas-oil set unused (no gas injection here); Pc ignored by design |
| Fluid Systems Studio to here | pvt-1 by id at one pressure | One pressure for the whole history; VRR Monitor has a pressure track |
| VRR Monitor | Same voidage core (`vrr.js`) | No exchange: the surveillance file and the VRR ledger are typed twice; pattern allocation lives only in VRR Monitor |
| Reservoir Simulation | None | No sender of the design (kr, PVT, pattern) as a deck; no history to compare |
| Material Balance | None | The waterflood forecast's injection and production could feed the injection term MBAL U2 added |
| Economics (NPV Scenario Builder, Petroleum Economics Studio, Forecast Scenario Hub) | Annual CSV by hand | No typed sender with its basis (the `dca-forecast-1` pattern) |
| Well Test | k by router state, kept | No method or interval in the handoff (the sender's round) |

### The ranked backlog

S small (a day or less), M medium (two to four days), L large.

| ID | Item | Size | Batch | Why this rank |
|---|---|---|---|---|
| WF-U2-001 | Typed sender of the pattern forecast to Forecast Scenario Hub and Petroleum Economics Studio (`wf-forecast-1`: rates, volumes, basis, source, read by id), the DCA pattern | M | A | Closes the last hand-typed step to economics; NAPE chain |
| WF-U2-002 | Line drive, staggered line drive and inverted nine-spot areal sweep (published Craig and Willhite charts as regressions, each gated against digitised points) | M | A | The most-asked design gap; five-spot only today |
| WF-U2-003 | Hall plot windows chosen by the user (dates or points) with the slope and interval, kept with the project and in the report | S | A | The thirds are arbitrary; a reviewer picks the windows |
| WF-U2-004 | Surveillance to VRR Monitor and back: send the imported history (one door) and read pattern allocation factors by id | M | A | Two apps, one family of data typed twice |
| WF-U2-005 | Seeded Monte Carlo (seed in the config, saved with the summary) | S | A | A P50 that can be reproduced (022) |
| WF-U2-006 | Chan windows: the late-time window chosen and shown, slope with its interval | S | B | Matches the Hall work |
| WF-U2-007 | Heterogeneity index plot (oil and water rate index per producer against the field average) | S | B | OFM and Sahara both have it; data already imported |
| WF-U2-008 | FVF by period: a Bo, Bw track against pressure from the pvt-1 table and a pressure column | M | B | One FVF for a history whose pressure moved is the VRR question shared with VRR Monitor |
| WF-U2-009 | Craig-Geffen-Morse prediction (stabilised zone, fill-up, areal sweep after breakthrough by Craig's method) as a second five-spot model beside the current composite | M | B | The textbook method a Sahara user expects; cross-check of methods (RL8) |
| WF-U2-010 | Send the design to Reservoir Simulation Studio (SWOF from kr-1, PVTO from pvt-1, a five-spot quarter-pattern deck) | L | C | Moves from screening to simulation in one step |
| WF-U2-011 | Bubble map of cumulative injection and production by well (needs well coordinates from the wells registry) | M | C | Common surveillance view; needs coordinates |
| WF-U2-012 | Initial gas: oil in place on 1 - Swc - Sgi and the Craig fill-up response (oil bank) instead of a delay | S | B | Removes the overstatement flagged in 019 |
| WF-U2-013 | Injection pressure to bottomhole: hydrostatic head and tubing friction from a stated well (depth, tubing) | M | C | Wellhead Hall slopes carry friction |
| WF-U2-014 | SI in the Uncertainty distributions and the layer cells | S | A | Finishes PL3 (021, 023) |
| WF-U2-015 | Per-pattern forecast for several patterns with their own geometry and kr, summed to a field profile | L | C | Field development view |

Batches proposed: A = 001, 002, 003, 004, 005, 014. B = 006, 007, 008, 009, 012.
C = 010, 011, 013, 015.

### Owner questions, with the default the programme takes

| # | Question | Recommended default |
|---|---|---|
| 1 | WF-U1-004 moves the five-spot numbers of every NEW project (sample: EA at breakthrough 53.9 to 62.5 percent, breakthrough 1.17 to 1.35 years, Np at the WOR limit unchanged in this case). Saved projects keep the endpoint basis until switched. Accept, and announce in the release note? | Accept; release note; saved projects keep their numbers |
| 2 | The engine default stays 'endpoint' so the NextGen Ekene course fixtures keep their recorded values. Move the courses to Craig's M later? | Leave the courses; revisit in the NextGen Reservoir course round |
| 3 | Surveillance totals and VRR are now calendar volumes (WF-U1-005); daily files are unchanged, monthly files move (totals up about 30 times, VRR slightly). Announce? | Yes, one line in the release note |
| 4 | Batch A for Step 2 as above? | Yes |
| 5 | One pressure for all PVT values of a project, or a pressure per tab (forecast at current pressure, surveillance by period)? | One pressure now; by period in U2-008 |

## 4. The report

`src/utils/waterflooddesign/reportModel.js` (rows), `reportFigures.js`
(figures from `series.js`, the builders of the screen charts),
`reportExport.js` (the kit), `components/waterflooddesign/ReportTab.jsx`
(the same rows on screen, identification and sources, the export).

1. Header: project, company (organisation fallback), field, licence,
   reservoir, pattern, injectors, producers, analyst, surveillance data
   dates, analysis type, build, display units, generated time.
2. Headline results with unit and basis: displacement (M, Swf, fw, average
   Sw behind the front, PV and ED at breakthrough, ED at Sor), the pattern
   (M entered in the correlation and its basis, EA at breakthrough,
   breakthrough time as on screen, Wi at breakthrough, Np, ER, final WOR,
   stop reason), V, VRR, water cut, alerts, Monte Carlo P90/P50/P10 with its
   state.
3. Recovery of the pattern by its parts, ED x EA x EV, with the closure line.
4. Mobility ratio by its components, endpoint and Craig.
5. Inputs and their sources: every engine input (completeness guard with a
   negative control), kr-1 and pvt-1 sources with the project and method,
   edits after an intake marked, starting values as assumptions.
6. Injection plan and forecast year by year (sums to Np).
7. Surveillance: the file as read (read-back), data quality, wells with
   first and last dates, days and volumes closing on the engine totals.
8. Hall slope windows: dates, points, slope, 95 percent interval, r2, ratio.
9. Layered sweep stages; model; basis and conventions; limits (assumptions,
   published ranges, flags); the kr-1 and pvt-1 blocks; notes.
10. Figures (11 in the reviewer case): kr with source, fw with the Welge
    tangent, ED against PV, rates and WOR, Np and EA, Dykstra-Parsons, rates
    on the calendar, VRR with target, one Hall plot per injector with shaded
    windows and fitted lines, Monte Carlo (statement: realizations not kept).

Sample: `/root/waterflood-report-sample.pdf`, built by the final code from
the reviewer case of the test kit (the app's samples, kr-1 from the SCAL
demo fit, pvt-1 from the Good Oil fluid at 2,500 psia, identified).

## 5. Persona walks (PL8)

**OFM surveillance engineer.** Imports a monthly CSV in m3/d with day-first
dates. Before: rows dropped, rates read as bbl/d, totals the sum of rates.
Now: read with units and order stated, calendar volumes, Hall windows drawn
with intervals. Would next: pick the windows (U2-003), see a heterogeneity
plot (U2-007) and a bubble map (U2-011).

**Graduate engineer designing a flood.** Takes kr from SCAL and PVT from
Fluid, reads the split ED x EA x EV and Craig's M by its parts. Would next:
try a line drive (U2-002) and send the profile to economics (U2-001).

**Manager reading the report.** Finds the identification, the headline, the
split closing on the recovery, the sources and the limits. Would next: one
summary page (not built; small).

## 6. What changes numbers

- WF-U1-004: new projects enter the areal sweep correlation with Craig's M.
  Sample case: EA at breakthrough 53.9 to 62.5 percent; pattern breakthrough
  1.17 to 1.35 years; Np and the stop at the WOR limit (8.58 years) unchanged in this case because EA reaches 1 before the limit. Saved
  projects keep the endpoint basis until switched. The Monte Carlo of a new
  project moves with it.
- WF-U1-005: surveillance totals and VRR on calendar volumes. Daily files
  unchanged (proved identical); weekly or monthly files move.
- WF-U1-018: the recovery KPI includes EV (moves only when EV is below 1).
- Engine defaults are unchanged: NextGen and every other caller of
  `forecastPattern` and `analyzeWaterflood` get the old numbers unless they
  ask.

## 7. What the gap matrix had wrong or missed

- RL6 "the chart puts the Hall integral on x": already fixed by H11.
- RL11 "SCAL and Well Test senders exist; the source shows in a toast and is
  not stored": SCAL U1 had already stored kr-1; the Well Test k was still
  toast-only (fixed, 026).
- RL10 "comma decimals truncated": also day-first rows dropped (32 of 80 on
  the hostile file) and no unit at all at the door.
- Not in the matrix: the areal sweep entered with the wrong mobility ratio
  (004, S2), totals as sums of rates (005, S2), `.pld` export refused for any
  project with an intake (015, S2, also SCAL and Well Test), the alert count
  always 0 (001), ER of the swept layers (018).

## 8. Where validation is weaker than asked

- Craig's mobility ratio: the definition is cited (Craig 1971; Ahmed ch. 14)
  and checked by hand arithmetic through the engine on the sample Corey set;
  no published worked example with Craig's M was readable here, so the
  numbers are not held against a book table.
- Calendar volumes: held against the Ekene course fixture's ledger VRR
  (1.2e-5, the residual is December's 31st day) and synthetic cases; not a
  field file with a published answer.
- Hall windows and intervals: exact synthetic lines and a Student t table;
  no published Hall interpretation reproduced.
- Units: pinned known values on the registry; no second source.
- Record sharing: the shared hook as in DCA and SCAL, tested in jest without
  a store and in the browser for the owner only; no two-account walk.
- Competitor parity: OFM and Sahara from public pages and search abstracts;
  tNavigator from general knowledge.


## 9. Step 2 build

### Batch decision (programme lead, 2026-10-04)

Recorded verbatim:

> BUILD in this order, one commit per item:
> - Batch A, all six: U2-001 typed forecast sender (a `wf-forecast-1` contract read by id: the pattern forecast with units and basis, the displacement and sweep model used, the kr-1 and pvt-1 sources behind it, the build and a fingerprint) with receivers in Forecast Scenario Hub and Petroleum Economics Studio, following the dca-forecast-1 pattern ("source changed since", edited marks, the cash-flow engine gated to ignore the provenance record); U2-002 line drive and nine-spot patterns (engines-first; areal sweep correlations from a published source you can actually read, with their mobility-ratio basis stated; validated against a published worked value; negative control); U2-003 user-chosen Hall windows (pick on the plot or by date, a reason saved, the report shows them); U2-004 link to VRR Monitor (send the surveillance or pattern injection and production to VRR by id, or read VRR's ledger, whichever direction the code supports cleanly; document the contract); U2-005 seeded Monte Carlo through the canonical module, the seed and realisation count saved and printed; U2-014 SI units in the Uncertainty tab and the layer cells (pin known values).
> - Batch B if time remains: U2-006 Chan windows; U2-008 FVF by period from pvt-1 at each period's pressure.
> - DEFERRED (record reasons): U2-007, U2-009, U2-012, and all of Batch C (deck to Simulation goes to the Simulation round; bubble map; bottomhole correction; multi-pattern field).
> Owner-question defaults in force: Craig M for new projects (announced), NextGen courses unchanged, one PVT pressure per project until U2-008.

### Items

| ID | State | What was built | Proving test |
|---|---|---|---|
| WF-U2-001 | Done | `wf-forecast-1` (`src/utils/waterflooddesign/wfForecastContract.js`, read by id through `wfForecastService.js`): the pattern forecast step by step and by calendar year (oil and water STB, injection RB), its basis (flood start, step, FVF and the pressure it was read at), the displacement and areal sweep model with M and its basis, the kr-1 and pvt-1 sources with values edited after the intake, the build and a fingerprint. A flood start date (Pattern tab, "Send this forecast") places it on the calendar; without it the send is refused with the reason. Forecast Scenario Hub takes it as a new case kind, a profile (day-for-day integral of the step rates, EUR = the sender's Np, horizon and start editable and marked when edited), with "source changed since" and Refresh, in the hub report and in its `fsh-case-1` sender to EPE. Petroleum Economics Studio: "Import from Waterflood Design Studio" writes calendar-year `oil_bbl` and `water_bbl` with the contract last under `wf_forecast_1`; the file card prints the source and re-reads it by id. | `wfForecastContract.test.js` (11): years sum to Np and Wp to 1e-12; a hand split across a year end; fingerprint; edited kr marks; read by id; hub day for day (EUR = Np, the cumulative at a step end = the engine Np there); hub report rows; hub to EPE carries the waterflood source; EPE rows and `computeCashFlow` identical with and without the record. Negative controls: the old volume filter counts the record as a row; the case without its profile kind is refused as Arps. |
| WF-U2-002 | Partial (line drives done; nine-spot not built) | Engines-first, engines PR #306 (not merged; vendored byte-identical with two `waterflood-u2` ledger rows). `forecastPattern` takes `pattern.patternType`: five-spot (default, series unchanged), direct line drive, staggered line drive. The line drives use Fassihi (1986), the regression of the Dyes, Caudle and Erickson (1954) charts, as printed in Ahmed, Reservoir Engineering Handbook 3rd ed. (2006), eq. 14-67 and its coefficient table, read in full from the archive.org copy: EA = 1 / (1 + A), A = [a1 ln(M + a2) + a3] fw + a4 ln(M + a5) + a6. EA at breakthrough at fw = 0; after breakthrough each step solves EA = EA_F(M, fw(EA)) by bisection, fw the producing reservoir water cut of the step. Mobility-ratio basis: the M of the app's basis switch; Ahmed's procedure takes Craig's M (eq. 14-61) for the areal sweep methods, the app default. App: a pattern select on the Pattern tab (not in the starting values, so saved Monte Carlo summaries keep their fingerprint), the report (input row, analysis type, model, recovery split, limits and range rows by pattern), the contract, help. **Nine-spot not built**: no published correlation could be read (Ahmed cites Muskat's nine-spot theory without a usable form; Kimbler, Caudle and Cooper 1964 behind a paywall), so it is not offered and the screen says why. | Engine `waterflood.wfu2.test.js` (14): **Ahmed Example 14-11** (Craig 1971 p. 116) through `forecastPattern` with Craig's M: M 0.8, EA at breakthrough 0.717 (book 0.71702), WiBT 103,020 bbl, 383 days and Np at breakthrough 85,850 STB within 2 percent; the coefficient table as printed; a hand value; the five-spot member of the Fassihi fit within 0.03 of Willhite eq. 14-64 and within 0.015 of Example 14-11; the fixed point after breakthrough to 1e-6; material balance; direct line breaks through first, staggered last. Negative controls: the endpoint M misses Example 14-11 by more than 0.05; freezing EA after breakthrough breaks the fixed-point gate. App `wfPatterns.test.js` (3); `wfReport.test.js` completeness guard now takes the builder's own keys. Goldens: one new input row (Flood pattern), deliberate. |
| WF-U2-003 | Done | Hall windows chosen per injector, by date or by clicking two points on the plot ("Pick on the plot"), with a reason that is required and kept with the project (`hallWindows`, top level of the payload). `src/utils/waterflooddesign/hallWindows.js` refits each chosen window with the engine's `olsLine` (slope, 95 percent interval, r2), replaces the thirds, recomputes the ratio and decides the injectivity alert again on the engine thresholds (1.2 and 0.8); a window left blank stays the engine third; a choice that cannot be fitted (no reason, fewer than 3 points, end before start) is not applied and says why. Screen: the editor under the Hall table; the lines and the table name the window as chosen. Report: "Baseline (chosen)" and "Recent (chosen)" rows with their dates, points and slopes, a "Why these windows" row with the date and reason, the figure caption names the chosen windows. The default report is unchanged. No engine change. | `wfHallWindows.test.js` (5): the known case (1,000 bbl/d at 2,000 psi for 8 days, then 3,000 psi, Hall 1963 slope p/q) through `analyzeWaterflood`: chosen windows give 2 and 3 exactly, r2 1, ratio 1.5 and the declining alert; one window keeps the other third; refusals by name; the report rows and the reason. Negative control: the engine thirds straddle the change and miss the baseline slope by more than 0.1. |
| WF-U2-004 | Done on the Waterflood side; the VRR-side "Send to Waterflood" link waits for VRR U1 (#874) | Direction chosen: Waterflood reads VRR Monitor's ledger by id (the direction MBAL already uses for VRR pressure surveys); it needs no change to VRR Monitor's files, which the open VRR U1 PR is rewriting. Contract `vrr-ledger-1` (sender side `src/utils/vrr/vrrLedgerContract.js`, a new file): the saved `inputs.wellRows` of an imported-ledger project, summed per well per calendar month exactly as VRR's `buildFieldPeriods`, the wells as VRR classifies them, totals, the VRR project's FVF set and a fingerprint; a period-grid project is refused by name. Receiver `src/utils/waterflooddesign/vrrIntake.js` and "From VRR Monitor" on the Surveillance tab: one row per well per month dated on the 1st, rate = volume over the engine's own calendar weight of that date, so every month (the last one too), the totals and the cumulative VRR are VRR Monitor's. The intake record (project, id, fingerprint, months, wells, notes, the VRR FVFs printed for comparison and not applied) is kept with the project, printed as the read-back in the report, re-read by id on every visit ("changed since", "Take again"); `?vrrProject=<id>` opens it from a link. Not carried: injection pressure (no Hall plot from this source), gas injection (no gas injection term in the surveillance voidage; named when present). Contract documented in the module header. | `wfVrrIntake.test.js` (7): both engines on one ledger (daily January rows, monthly rows after, a well that starts in March): Waterflood totals and cumulative VRR equal VRR Monitor's `computeVRRSeries` on `buildFieldPeriods` to 1e-12; fingerprint and "changed"; refusal; read by id; the read-back. Negative control: the obvious conversion (volume over the days of its own month) misses the last month by more than 1e-3. |
| WF-U2-005 | Done (closes WF-U1-022) | Every run draws from the canonical module's seeded generator (`mulberry32` of `src/lib/monteCarlo.js` into `createCorrelatedSampler`; no new Monte Carlo). A seed field on the Uncertainty tab (blank: a 32-bit seed is drawn at run time and recorded; entered: a whole number 0 to 4,294,967,295, refused otherwise); "Keep this seed" after a drawn run. The seed, where it came from and the realization count are saved with the summary (`mcSummary.seed`, `seedFrom`, `iterations`), shown on the tab and printed in the report's headline basis and the Monte Carlo figure statement. A saved summary from before has no seed and says so. The seed sits in the uncertainty config only when entered, so saved summaries keep their fingerprint. | `wfSeededMc.test.js` (5): same seed, same percentiles to the last digit; another seed differs; the seeded run equals a run handed `mulberry32(seed)` (the canonical generator, not a copy); refusals; the summary and the report print seed and count. Negative control: two unseeded runs draw different seeds and different P50s, and the drawn seed reproduces its run. |
| WF-U2-014 | Done (closes WF-U1-021, WF-U1-023) | Each Monte Carlo parameter carries its unit kind (`UNCERTAINTY_PARAMS[].kind`, `name`); the Uncertainty tab shows and takes min, mode, max, mean and standard deviation in the display units through the unit-aware field, and the config stays oilfield (every kind converts by a factor, so a standard deviation converts as a value). The tornado names the parameters without a unit (a rank correlation has none). The layer thickness cells use a new label-less `UInput` primitive that keeps the SI draft ("2.") while the stored ft follows each complete number. The help no longer says the distributions are oilfield only. | `wfSiInputs.test.jsx` (6): pinned conversions (40 acres = 16.1874256896 ha, 25 ft = 7.62 m, 800 RB/d = 127.18983594 rm3/d, FVF and viscosity unchanged); a stored triangular shown in ha and a typed 20 ha stored as 49.42 acres; oilfield unchanged; a standard deviation 2.5 ft shown 0.762 m; the SI layer cell keeps "2." and stores 2.5 m as 8.2021 ft. Negative control: the old cell drops the decimal point. |
| WF-U2-006 | Done (Batch B) | `src/utils/waterflooddesign/chanWindows.js`: the engine's late-time window (the last 40 percent of the points, WOR' > 0) reproduced and shown, shaded on the plot, its log-log slope with the 95 percent interval of the engine's `olsLine`; a window chosen in days since water onset (the plot's own time axis) with a required reason, kept per series (`chanWindows`, 'field' or a producer), the mechanism decided again by the engine's `classifyChan`. Report: a Chan table (window, points, slope, interval, indicative reading) and a log-log Chan figure per series with the window shaded and its fitted line (the report printed no Chan result before); a limits flag when the slope interval spans both regimes. **Goldens change deliberately** (reviewer: the Chan table, three figures, three "not resolved" flags: the sample's 90-day history cannot separate the regimes). | `wfChanWindows.test.js` (5): the known case WOR = 0.01 t^2 to day 85 then t^0.5 through `analyzeWaterflood`: the engine slope reproduced to 1e-12 with its interval; a window on the late segment reads about -0.5 and coning, on the early segment about +1 and channeling; refusals; the report rows and figures. Negative control: the engine window straddles the change and misses -0.5. e2e U2-006. |
