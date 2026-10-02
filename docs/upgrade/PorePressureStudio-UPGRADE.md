# Pore Pressure Studio: comprehensive upgrade

App #9 of the Geoscience upgrade programme (`docs/scope/AppUpgrade-Geoscience-PLAN.md`).
Step 1 (practitioner lens, `docs/scope/AppUpgrade-BestPractices.md`) was run and
fixed on 2026-10-01 on branch `feat/pp-u1`. Step 2 (advancement review) is
analysis only; batches are chosen before anything is built.

- Route: `/dashboard/apps/geoscience/pore-pressure-studio` (ProtectedAppRoute) and its `/help`.
- Harness: `/dev/pore-pressure-studio` (in-memory backend, the oracle goldens' synthetic well). New for this upgrade: the harness well is MD below the rotary table with the mudline at 130 m MD (air gap 30 m, water 100 m), as a real registry well is; `?saved=p3|pp0|t1|u1` opens a project as each release saved it (`services/savedFixtures.js`); `?layercake=1` (Seismolord U2-006) is unchanged.
- Earlier cycles: P0 to P4 (07-14, oracle-locked engines), PP0/PP1 (09-06, display units, launchers, help), T1 (09-26, depth axis, calibration dots, drilling window), W4B theme (09-28), unit profile (#830), Seismolord U2-006 layer cakes (#837). Their fixes hold: the oracle e2e reproduces the goldens to the displayed digit.
- Carried in: plan row 9 (resistivity Eaton, layer-cake velocity, kick/trip margins and casing seats, "Pore Pressure publishes MPa while Drilling reads ppg"); the curve unit normaliser of PETRO-U1 (`src/components/wells/curveUnits.js`, unit families of PETRO-U2-001); the depth frame of PT8 (`makeDepthFrame`); the reviewer-block pattern of RCP-U1-019; the saved-fixture pattern of RCP U1.

## Evidence kit made for this app

| Kit | Where | What it holds |
|---|---|---|
| Services and doors (PL1 to PL4, PL10) | `src/pages/apps/PorePressureStudio/__tests__/upgradeU1.test.js` (17) | Gap placement on publish, deviated well against its vertical twin, datum gate, hostile curves (kg/m3 with no unit, -999 nulls, us/ft under an unknown spelling), notes, misfit, thinning and a 40,000-sample timing, trend depth, the layer cake end to end, pasted calibration tables, the onshore default |
| Saved state (PL5) | `__tests__/upgradeU1Saved.test.jsx` (6) on `services/savedFixtures.js` | Projects as P3 (07-14), PP0 (09-06), T1 (09-26) and U1 saved them: each opens, reopens its well and computes; the P3 project's old datum is said and its publish held |
| Report (PL7) | `__tests__/upgradeU1Report.test.js` (2, node, real jsPDF, pdftotext) | Reviewer block, the 3,500 m row in MPa and ppg, Latin-1 only; the CSV carries the same block |
| Chain (PL9) | `src/pages/apps/well-planning/__tests__/ppfgHandoffU1.test.js` (3), `mudWindowPanelU1.test.jsx` (2), `src/pages/apps/GeomechanicsStudio/__tests__/ppHandoffU1.test.js` (4), `src/lib/portability/__tests__/ppProjectFamily.test.js` (3) | Pore Pressure publish read back by Well Design at the same pressure and EMW; a ppg LAS equals its MPa twin; Geomechanics and Perforation & Sand Control convert by unit and accept pp-1.x; DT aligned to the published grid; a well's `.pld` carries its project with the well remapped |
| Browser (PL4 to PL7, PL11) | `e2e/pore-pressure-upgrade.spec.js` (14) | Notes follow the events (fit, hand edit, calibration); NCT picks drawn; publish held on an unset offshore datum, then published; the PDF downloaded and read with pdftotext; every saved release opens; 1366x768, 1440x900 and 390 wide in light and dark with no page errors and no sideways scroll; key-by-key typing |

Negative controls: the WD/Geomechanics handoff tests run against the files on origin/main fail 6 of 7. The NCT picks on main (staging) drew 0 pick dots and 405 scatter symbols. The services suite does not load against the old prep/publish (missing doors); its numeric tests also carry in-test controls that run the old door (the gap put the 3,700 m value at 3,500 m MD, 2.8 MPa high; MD-as-TVD at 5,000 m MD was 20%+ high; RHOB 2400 with no unit read 2,400,000 kg/m3; one -999 sample threw the whole well; a project with no well ids was not found from its well).

## PP-U1-000: the e2e and the Suite unit profile

`e2e/pore-pressure-studio.spec.js` had 4 failures since #830 (and `pore-pressure-t1.spec.js` 2 more): the harness opens in the profile's units, which signed out is the built-in oilfield preset (ft, psi), and the specs expected SI. Decision per assertion:

| Spec | Assertion | Decision |
|---|---|---|
| Oracle readout, NCT fit recovery, Bowers switch | Golden numbers in MPa and m | **Pin**: select MPa and m with the ribbon selectors (a session view override, what a user does). The oracle is SI; the conversion is tested elsewhere. |
| PP0 units | The default, then conversions | **Follow**: assert the profile default first (ft, psi, the note says "follows", readout 11482.9 ft and psi), then switch to m and MPa and on. |
| T1 depth runs downward (prognosis and NCT) | Tick 1000 above tick 3000 | **Follow**: read every tick in whatever unit is shown and assert deeper ticks sit lower. |
| T1 calibration dots | Points typed as "3000, 34.5" | **Pin** SI, since the typed text is SI. |
| Seismic trend, publish, launchers | No unit content | Unchanged. |

## Step 1: the twelve checks

| Check | Result | Findings | Notes |
|---|---|---|---|
| PL1 Labels mean the textbook | Pass, two kept | 019, 020 | Quantity table below. Engines unchanged and oracle-locked. |
| PL2 Hostile inputs | Failed, fixed (1 S1) | 004, 016, 021 | Density in kg/m3 with no unit read 1000x; a -999 vendor null threw the well; us/ft sonic under an unknown spelling read as us/m. Pasted RFT tables with tabs or semicolons dropped silently. No importer for RFT/MDT, LOT/FIT, mud weights (Step 2). |
| PL3 Units, datums, frames | Failed, fixed (1 S1) | 001, 002, 003, 017, 025 | Published curves shifted by every sonic gap; deviated wells computed at MD; an offshore registry well read with the log MD as depth below mudline; a 100 m water column invented for every new project. Unit profile (#830) verified: depth and pressure start from the profile (`unitProfile.test.jsx`, e2e PP0); a kPa or bar profile shows as MPa. |
| PL4 No claim without the event | Failed, fixed | 009, 010, 003 | A confident curve for any well: NCT default never fitted, density mostly Gardner, calibration drawn but never compared, extrapolation unstated. Notes now say each and change with the event (e2e). Publish is held with its reason. |
| PL5 Real saved state | Failed, fixed | 013 | Every release's project opens and computes; the saved well was not reopened (picks lost on the next click). |
| PL6 Real browser | Failed, fixed | 000, 014, 024 | e2e red since #830; NCT shale picks never drawn. Three viewports, both themes, no page errors, white chartTheme and ChartLogo, depth downward. |
| PL7 Report a reviewer can sign | Failed, fixed | 008 | No report; the CSV had no well, field, analyst, build or datum. PDF and CSV now carry the reviewer block (pdftotext in jest and e2e). |
| PL8 Practitioner's day | Gaps recorded | 021, 022, 023, 026, 029 | Persona walks below. |
| PL9 The chain | Failed, fixed (1 S1, 2 S2) | 005, 006, 007, 015, 018, 027 | Below. |
| PL10 Real scale | Failed, fixed | 011, 012 | A 40,000-sample well computes in about 0.3 s; the plots drew every sample in five series (now at most 1,500 rows). Trends stopped at 4,000 m below mudline. |
| PL11 Inputs a person can type | Pass after one fix | 017 | Dock fields keep "100.5", a cleared field and "0.42" key by key (e2e). The sample default water depth was invented (017). |
| PL12 House standards | Pass after fixes | 031 | The mud window carried an em dash, en dashes and "--" for missing values; copy now plain and `EMPTY_VALUE`. Route protected. |

### PL1 quantity table

| Quantity | Standard meaning | What the code computes | Same? |
|---|---|---|---|
| Hydrostatic (Ph) | Pore fluid column pressure, gauge | rho_sw g wd + rho_f g z_bml | Yes |
| Overburden (OBG) | Vertical stress from water and rock above | Trapezoid integral of the density log (Gardner where absent) plus the water column | Yes; the share from the log is now stated (009). Shown as a stress in pressure units under the drillers' name OBG (020, kept) |
| Pore pressure (PP) | Fluid pressure in the pore space | Eaton sonic S - (S - Ph)(dt_n/dt)^n, or Bowers loading/unloading | Yes; Eaton resistivity missing (022) |
| Fracture pressure (FG/FP) | Minimum horizontal stress estimate | K (S - PP) + PP, K = nu/(1 - nu) | Yes; labelled FG in pressure units (020, kept) |
| EMW | Pressure over g times TVD below the rotary table | ppg = psi / (0.052 x TVD ft); sg = ppg / 8.345404 | Yes; 0.052 is the rule of thumb (exact 0.051948): Pore Pressure's ppg sits 0.1% under Well Design's exact EMW (019, kept, tested) |
| Eaton exponent | 3.0 sonic, 1.2 resistivity | 3.0 sonic; resistivity not offered | Gap (022) |
| Bowers | sigma = ((V - V_ml)/A)^(1/B), unloading with U and sigma_max | Same, published ft/s-psi domain | Yes |
| NCT | Normal trend dt_n(z) = dt_ma + (dt_ml - dt_ma) e^(-cz) | Same; exact log-transform fit | Yes; plotted on a linear dt axis where the trade uses semi-log (026) |
| Depth reference | Depth below mudline = TVD below RKB minus mudline TVD | Was MD minus mudline MD, any well (002) | Fixed |

### Findings

Severity: S1 wrong answer with no warning; S2 wrong or lost data, or a door that misleads; S3 workflow gap or misleading text; S4 polish.

| ID | Sev | Check | Finding | Evidence | Status |
|---|---|---|---|---|---|
| PP-U1-000 | S3 | PL6 | `pore-pressure-studio.spec.js` 4 red and `pore-pressure-t1.spec.js` 2 red since #830 (harness opens oilfield). | Run on origin. | Fixed: pin or follow per assertion (table above). |
| PP-U1-001 | S1 | PL3, PL9 | Publish wrote the below-mudline samples as start + i x step after sonic gaps had been dropped with their depths: every value below a gap moved up by the gap. A 200 m gap put the 3,700 m pressure at 3,500 m MD (2.8 MPa, about 0.5 ppg high) into Well Design's mud window. | Probe and test (in-test control). | Fixed: `mdGrid` writes each value at its own MD, gaps as nulls; pipeline pp-1.1.0 with `depth_reference` in provenance. |
| PP-U1-002 | S2 | PL3 | Deviated wells computed at MD: overburden and hydrostatic integrated along hole (20%+ high at 5,000 m MD on a 45 degree well). | Test against the vertical twin. | Fixed: MD to TVD through the well's survey (`wellDepthFrame`, the canonical welldata frame); upturned samples dropped and counted; publish stays on MD. |
| PP-U1-003 | S2 | PL3, PL4 | An offshore registry well (MD below RKB) with the mudline MD left at 0 was read with the log MD as depth below mudline and the water column added on top; the published curves landed shallow with nothing said. The harness well was built in that very frame. | Code read; test. | Fixed: a datum note and Publish held (aria-disabled, reason as title) until the mudline MD is at least the water depth; harness well now MD below RKB with mudline 130 m. |
| PP-U1-004 | S1 | PL2 | Hostile curves: RHOB in kg/m3 with no unit or an unknown spelling read as g/cc (overburden 1000x); a -999 vendor null threw the whole well; a sonic in us/ft under an unknown spelling (USPF) read as us/m. | Tests (in-test controls). | Fixed: `normalizePpCurves` through the shared normaliser and unit families, plus a us/ft rule (median below 160); every decision said in the status. |
| PP-U1-005 | S2 | PL9 | Well Design read only curves whose unit was exactly MPA and dropped the rest silently (a Drillworks ppg LAS, a kPa table); EMW only in g/cc, TVD only in m; a failed load showed "no prognosis". Plan row 9 "publishes MPa while Drilling reads ppg". | Test (control fails). | Fixed: `src/lib/ppfgUnits.js` (pressure, EMW and gradient units; EMW converted at the trajectory TVD below RKB); ppg mode (default on a feet wellbore), TVD in the wellbore unit, source and unit named, unread curves and load errors said. Casing & Tubing and Hydraulics gain the same reader. |
| PP-U1-006 | S2 | PL9 | Geomechanics and Perforation & Sand Control multiplied any PP/OBG value by 1e6 (assumed MPa) and only knew pipeline pp-1.0.0 (a pp-1.1.0 publish would have vanished). | Test (control fails). | Fixed: by declared unit; any pp-1.x accepted; a mud-weight curve refused with its reason. |
| PP-U1-007 | S3 | PL9 | Geomechanics on published curves: the raw DT was on its own grid, so any UCS correlation refused ("needs a DT curve aligned"). | Test (control fails). | Fixed: `alignToGrid` puts DT on the published grid. |
| PP-U1-008 | S3 | PL7 | No report; the CSV header had no well, field, analyst, build, datum or calibration. | Code read. | Fixed: `services/report.js` PDF (reviewer block, table with EMW ppg) and the same block in the CSV; Field and Analyst in the dock. |
| PP-U1-009 | S3 | PL4 | Nothing said what the prognosis rests on: NCT default never fitted, density share, samples left out, TVD source. | Code read. | Fixed: notes under the ribbon (`services/honesty.js`), each following its event; NCT-fitted state saved with the project. |
| PP-U1-010 | S3 | PL4 | Calibration points drawn but never compared; extrapolation below the deepest point unstated. | Code read. | Fixed: misfit RMS and largest, points outside named, extrapolation said (notes and report). |
| PP-U1-011 | S3 | PL10 | Plots drew every sample in five series (40,000-sample well). | Code read; timing. | Fixed: at most 1,500 rows drawn; readout, window, CSV and publish keep every sample. |
| PP-U1-012 | S3 | PL10 | Velocity trends stopped at 4,000 m below mudline whatever the well. | Code read. | Fixed: to the well TD (layer cake) or 6,000 m. |
| PP-U1-013 | S3 | PL5 | A saved project did not reopen its well; reselecting cleared the saved picks. | Test. | Fixed. |
| PP-U1-014 | S3 | PL6 | NCT shale picks were a Scatter in a vertical-layout chart (T1-002 again): 0 pick dots, 405 stray symbols. | Staging probe. | Fixed: dot-only Line; e2e counts 4. |
| PP-U1-015 | S3 | PL9 | `pp_projects.well_ids` never written: a well's `.pld` left the project behind; a project package arrived without its well. | Test (control). | Fixed: saves record the source well; `source.nctFittedFor` is a remapped soft reference. |
| PP-U1-016 | S3 | PL2, PL4 | Calibration lines separated by tab or semicolon (a pasted RFT table) were dropped silently. | Test. | Fixed: any separator; unread lines counted and quoted. |
| PP-U1-017 | S3 | PL11, PL3 | A new project invented 100 m of seawater over every well, onshore included. | Code read. | Fixed: water depth 0 by default; offshore wells are told to set it. |
| PP-U1-018 | S3 | PL9 | Geomechanics treats the published MD grid (and its own computed path) as TVD: on a deviated well the MEM is placed at MD. | Code read (`gmRun.assembleBaseProfile`). | Open, carried to Geomechanics (Drilling programme): convert with the definitive trajectory it already loads. |
| PP-U1-019 | S4 | PL1 | ppg by 0.052 (Pore Pressure) vs exact g (Well Design): 0.1% apart. | Test pins the agreement. | Kept (drilling convention, stated in the report). |
| PP-U1-020 | S4 | PL1 | OBG and FG labels on stress and pressure values. | Walk. | Kept (trade usage; the glossary says it). |
| PP-U1-021 | S3 | PL2, PL8 | No importers for RFT/MDT points (MD or TVDSS), LOT/FIT/XLOT, mud weight, kicks and losses. | Walk. | Open: U2-002. |
| PP-U1-022 | S3 | PL1, PL8 | Resistivity Eaton (n 1.2) absent. | STATUS since P4. | Open: U2-001. |
| PP-U1-023 | S3 | PL8 | No kick and trip margins, no casing-seat suggestion (T1 E2). | T1. | Open: U2-003. |
| PP-U1-024 | S4 | PL6 | 390 wide keeps the desktop layout inside the shell. | Screenshot. | Kept (WDM decision). |
| PP-U1-025 | S3 | PL3, PL8 | Readout and chart only in depth below mudline; no TVD RKB, TVDSS or MD axis choice. | Walk. | Open: U2-004. |
| PP-U1-026 | S4 | PL8 | NCT on a linear dt axis; one NCT segment; no shale filter (Vsh or GR cutoff) on picks. | Walk. | Open: U2-005. |
| PP-U1-027 | S3 | PL9 | A layer cake is read at the well's surface location (not along a deviated hole), and the seismic datum is taken as sea level. | Code read. | Open: U2-008. |
| PP-U1-028 | S4 | PL8 | The narrowest window usually sits at the 300 m cut-off where PP and FG converge. | Screenshot. | Open: U2-003 reports the window per section. |
| PP-U1-029 | S3 | PL8 | Calibration does not calibrate: no fit of n (or Bowers A, B) to the measured points. | Walk. | Open: U2-006. |
| PP-U1-031 | S4 | PL12 | Mud window copy: em dash, en dashes, "--". | Test. | Fixed. |

(030 was not used.) Totals: 31 findings. Fixed 19 (2 S1, 4 S2, 12 S3, 1 S4: 000 to 017, 031), open 9 (018, 021, 022, 023, 025, 027, 029 S3; 026, 028 S4), kept 3 (019, 020, 024). No S1 or S2 open. WellboreStabilityAnalyzer's hard-coded 0.45 psi/ft (STATUS follow-on) is superseded: the file is gone.

### Seismolord U2-006 layer cakes, verified end to end

Harness: the two-layer cake reads its boundary at 1,000 ms TWT at the well; the profile gives 1,800 m/s above 900 m below sea level and 2,600 + 0.3 (z - 900) below, exactly, runs to the well TD (now 4,000 m below mudline on the harness), and the prognosis is finite with Gardner densities (`upgradeU1.test.js`, and the Seismolord U2 e2e). Registry path read: boundaries from the published time surfaces, CRS converted or refused with a reason, a missing boundary merged with its note. Open: 027.

### The Drilling handoff (plan row 9)

Before: Pore Pressure published MPa, Well Design read MPa only and showed g/cc, the Geomechanics family assumed MPa. Now every reader converts by the curve's declared unit through `src/lib/ppfgUnits.js`; Well Design shows ppg on a feet wellbore. The chain test publishes from Pore Pressure and reads in Well Design: pressure equal to 1e-4 MPa (f32), Well Design EMW equal to P / (g x the same depth Pore Pressure uses), ppg within 0.1% (019). Suites run: Well Design (jest all, e2e), Geomechanics (jest, e2e and T1 e2e; the T1 spec's "curves loaded" selector was stale on main and is fixed), Perforation & Sand Control, Stimulation, Casing & Tubing, Hydraulics (jest).

### Persona walks (PL8)

**1. Pore pressure specialist from Drillworks or Predict.** Loads a deviated offshore well from a Techlog LAS. *Before:* RHOB in kg/m3 with no unit gave a 1000x overburden, the hole was computed at MD, and the mudline was the rotary table. *Now:* the status says what was read; TVD from the survey; the datum note asks for the mudline MD. Picks shale points (*now* drawn) and fits the NCT (*now* stated as fitted). Would now: filter picks by Vsh, a semi-log NCT and several trend segments (U2-005); resistivity Eaton for a sonic-poor section (U2-001); import RFT/MDT and LOT tables (U2-002) and fit n to them (U2-006); Bowers unloading picked on a velocity-density crossplot (U2-007).

**2. Drilling engineer taking the mud window.** *Before:* the Well Design window showed nothing for a Drillworks ppg curve and, for a Pore Pressure publish across a gap, pressures 200 m too shallow. *Now:* ppg against TVD in feet, the source named, gaps as gaps. Would now: kick and trip margins and a casing-seat suggestion on the window (U2-003); TVD RKB or TVDSS axes (U2-004); the window per hole section.

**3. Graduate.** The notes under the ribbon say what is missing (NCT not fitted, not calibrated); the help guide explains the datum. Would now: a worked example project (U2-010).

## Step 2: advancement review (analysis only)

### 2a. Competitor parity

Sources: [Petrel seismic pore pressure modeling](https://www.software.slb.com/products/petrel/petrel-geomechanics/seismic-pore-pressure), [RokDoc shale-based pore pressure workflow](https://www.ikonscience.com/cptresource/defining-the-safe-drilling-window-an-introduction-and-review-of-the-shale-based-pore-pressure-prediction-workflow-in-rokdoc/), [Ikon resistivity-based prediction release (World Oil, 2023)](https://www.worldoil.com/news/2023/9/26/ikon-science-releases-new-geoprediction-software-with-resistivity-based-pore-pressure-prediction/), [RokDoc pore pressure blog](https://rokdoc.ikonscience.com/how-to-drill-with-confidence-and-master-pore-pressure-prediction-with-rokdoc), [CSEG Recorder, velocity determination for pore pressure](https://csegrecorder.com/articles/view/velocity-determination-for-pore-pressure-prediction). Halliburton Drillworks and JewelSuite rows rest on their public product descriptions (Drillworks: pre-drill, real-time and post-well pore pressure and fracture gradient with Eaton, Bowers and d-exponent, calibration to kicks, RFT and LOT; JewelSuite: 1D and 3D mechanical earth models and wellbore stability), not on manuals.

| Capability | Leader and how | Ours | Gap | Demo-visible |
|---|---|---|---|---|
| Methods | Drillworks: Eaton sonic and resistivity, Bowers, d-exponent; Petrel: Eaton, extended Bowers, Dutta; RokDoc: resistivity with temperature, salinity, clay | Eaton sonic, Bowers loading/unloading | partial (no resistivity, d-exponent, Dutta) | yes |
| NCT | Shale-filtered picks, semi-log, multiple segments, interactive drag | Exact fit on typed picks, one segment, linear plot | partial | yes |
| Calibration | RFT/MDT, kicks, LOT/FIT/XLOT plotted and parameters fitted to them (Petrel optimises during calibration) | Typed points, misfit stated (now) | partial (no import, no fit) | yes |
| Fracture gradient | Eaton, Matthews-Kelly, Daines, calibrated to LOTs | Eaton coefficient (Matthews-Kelly as the same identity) | partial | yes |
| Drilling window | Mud weight design with kick and trip margins, casing seats | Window shaded, narrowest stated | partial | yes |
| Seismic | Petrel/RokDoc 3D pressure cube from velocity, multiwell calibration with mapped parameters | 1D from a v0+kz trend or a layer cake at a well (trend-grade) | missing (3D) | yes |
| Real time | Drillworks real-time (WITSML, d-exponent, gas) | none | missing | no |
| Multiwell | Regional trends, parameters mapped across wells | One well at a time, one project | missing | yes |
| Report | Pressure plots and tables for the well plan | PDF reviewer block and table, CSV (now) | partial (no plot in the PDF) | yes |
| Integration | Petrel one project; Drillworks to Landmark well planning | Publishes PP/FP/OBG read by Well Design, Casing & Tubing, Hydraulics, Geomechanics, PSC, Stimulation; `.pld` | ahead in principle | yes |

### 2b. Deferred backlog harvest

| Item | Source | Decision |
|---|---|---|
| Resistivity Eaton | STATUS (P4), T1 E3, plan row 9 | Still wanted (U2-001); WDM resistivity aliases exist in the LAS import kind guesses |
| Layer-cake sampling | STATUS, plan row 9 | Done (Seismolord U2-006, verified here); along-hole sampling and seismic datum open (U2-008) |
| Kick/trip margins, casing seats | T1 E2, plan row 9 | Still wanted (U2-003) |
| EMW/ppg handoff to Drilling | STATUS, plan row 9 | Done (005, 006) |
| WellboreStabilityAnalyzer 0.45 psi/ft | STATUS | Superseded (file removed; Geomechanics Studio reads the published curves) |
| MEM-under-Drilling consumer | STATUS | Done (Geomechanics reads pp-1.x); MD as TVD there open (018) |

### 2c. Suite integration

Reads: geo_wells (survey, KB, TD), geo_wells_logs (DEPT, DT, RHOB), Seismolord velocity models and boundary surfaces, the unit profile. Writes: pp_projects (now with well_ids), PP/FP/OBG in geo_wells_logs (pp-1.1.0). Deep links: Well data, Open in. `.pld`: pp_projects in the geoscience family.

| Finding | Kind | Detail |
|---|---|---|
| Petrophysics Vsh and zones | upstream ignored | Shale picks could be filtered by Petrophysics VSH (`_CND` curves) and zones (U2-005). |
| Resistivity | upstream ignored | WDM imports RT/ILD/LLD; resistivity Eaton would use them (U2-001). |
| Wellsite Studio | upstream ignored | Mud weights, gas, kicks and losses logged there are the calibration a pore pressure specialist uses (U2-002, after Wellsite #12). |
| Well Design mud weights | downstream | The window could take the planned mud weight per section back for the margins (U2-003). |
| Geomechanics | handoff loses the frame | MD grid as TVD (018). |
| Rock Physics | downstream | Effective stress from the prognosis could drive a pressure-dependent rock physics model (Rock Physics #10). |
| Seismolord | upstream | Interval velocities (U2-006 Dix) give a well-calibrated V(z) at any location; 3D pressure cube later (U2-009). |

### Ranked backlog

Sizes: S under a day, M two to four days, L a week or more.

| Rank | ID | Item | Size | Value in one line | Batch |
|---|---|---|---|---|---|
| 1 | U2-003 | Kick and trip margins and casing-seat suggestion on the drilling window, window per section, in Pore Pressure and the Well Design mud window | M | The drilling engineer's deliverable | A |
| 2 | U2-002 | Import calibration tables: RFT/MDT (MD, TVD or TVDSS; psi, kPa, ppg), LOT/FIT/XLOT, mud weights, kicks and losses; plotted by kind | M | The data every specialist overlays | A |
| 3 | U2-001 | Resistivity Eaton (n 1.2, log-resistivity NCT) beside sonic | M | Drillworks and RokDoc parity on the second method | A |
| 4 | U2-004 | Depth reference choice for readout, chart, CSV and PDF: below mudline, TVD RKB, TVDSS, MD | S | Read in the frame the well plan uses | A |
| 5 | U2-005 | NCT on a semi-log axis, picks filtered by Vsh or GR, two or more trend segments, drag to edit | M | The specialist's NCT workflow | A |
| 6 | U2-011 | Prognosis plot in the PDF (vector, house chart standard) | S | A report that shows the curve | A |
| 7 | U2-006 | Fit Eaton n (or Bowers A, B) to the calibration points with the misfit shown | S | Calibration that calibrates | B |
| 8 | U2-007 | Velocity-density crossplot to choose Bowers unloading (U, sigma max) | M | Unloading picked from data | B |
| 9 | U2-008 | Layer cake sampled along the deviated hole; seismic datum (SRD) not assumed sea level | S | Trend correct away from the wellhead | B |
| 10 | U2-012 | Fracture gradient methods: Matthews-Kelly Ki(z), Daines tectonic term, calibrated to LOT | M | FG parity | B |
| 11 | U2-013 | Geomechanics reads the published curves at TVD through its trajectory (PP-U1-018) | S | One frame across the chain | B |
| 12 | U2-010 | Worked example project for graduates (help-linked) | S | Learnability | B |
| 13 | U2-009 | Multiwell and 3D: parameters mapped across wells; pressure from a velocity cube | L | Petrel and RokDoc 3D parity | C |
| 14 | U2-014 | d-exponent and real-time from Wellsite Studio feeds | L | Drillworks real-time parity | C |
| 15 | U2-015 | Projects per well (several named projects; today one per user) | M | Real portfolios | C (schema check: pp_projects.name exists, no DDL expected) |

Batches:
- **Batch A** (demo-visible, NAPE-safe, no schema change): U2-003, U2-002, U2-001, U2-004, U2-005, U2-011.
- **Batch B:** U2-006, U2-007, U2-008, U2-012, U2-013, U2-010.
- **Batch C:** U2-009, U2-014, U2-015.

### Owner items

1. Playwright e2e is still not in CI: this app's e2e was red since #830 unnoticed (PP-U1-000), as RCP's and EM's were; Geomechanics T1 was red on main too.
2. Published curves from before U1 (pp-1.0.0) on wells with sonic gaps are shifted below the first gap, and offshore wells published with the mudline MD at 0 are shallow by the mudline. Republishing from Pore Pressure Studio replaces them (overwrite-own). Live check suggested: `select well_id, count(*) from geo_wells_logs where provenance->>'pipeline_version' = 'pp-1.0.0' group by 1`.
3. No migration in this work.

## Batch decision (programme lead, 2026-10-01)

Recorded verbatim:

> BUILD in order, one commit per item:
> - Batch A: U2-003 kick and trip margins plus casing-seat selection (validate against a published worked casing-seat example; negative control); U2-002 calibration imports (RFT/MDT pressure points, LOT/FIT tables, mud-weight files; hostile-file tested; units declared at the door); U2-001 resistivity Eaton (validate against Eaton's published exponent case; negative control with the sonic exponent); U2-004 depth-reference choice (TVD below RKB, TVDSS, MD; conversion through the survey and datum); U2-005 NCT on a semi-log axis, Vsh-filtered picks, segmented trends; U2-011 prognosis plot in the PDF (read back with pdftotext).
> - Batch B: U2-006 fit the Eaton exponent n to calibration points; U2-008 layer cake sampled along the hole with the seismic datum declared (fixes PP-U1-027); U2-013 Geomechanics reads the published grid at TVD (fixes PP-U1-018; run the Geomechanics suites); U2-010 a worked example project; U2-007 Bowers unloading crossplot; U2-012 fracture-gradient methods (Eaton/Matthews-Kelly/Daines where validated against published examples).
> - DEFERRED (record reasons): U2-009 multiwell and 3D cube (L); U2-014 d-exponent and real time (L; with Wellsite later); U2-015 several projects per user (M; touches the project model: revisit with the Suite Project programme).

Deferred, with reasons:

| ID | Item | Reason |
|---|---|---|
| U2-009 | Multiwell and 3D pressure cube | Size L; needs parameters mapped across wells and a velocity cube reader. After NAPE. |
| U2-014 | d-exponent and real time | Size L; the drilling parameters and gas come from Wellsite Studio (#12), so it is built with Wellsite later. |
| U2-015 | Several projects per user | Size M; it touches the project model, so it is revisited with the Suite Project programme (`docs/scope/SuiteProject-DESIGN.md`). |

## Step 2 build (branch `feat/pp-u2`)

Engines: Petrolord/petrolord-engines PR #293 (`engines/porepressure/{casingSeats,resistivity,calibrationFit}.js`, segments in `nct.js`, methods in `fracgrad.js`, `profile.js` extended; gates in `__tests__/porepressure.u2.test.js`, each with a negative control). `computeProfile` is backward compatible: with no new parameter it reproduces the goldens.

| ID | Status | What was built | Proving test |
|---|---|---|---|
| U2-003 | Done | Trip and kick margins in the dock (0.5 ppg each by default, in the dock's density unit) and a minimum depth for the shallowest string; the planned mud (PP + trip) and design fracture (FG - kick) lines on the chart; the bottom-up casing seats with the window per section above the chart, in the reviewer block of the PDF and CSV; a window closed by the margins is said with its depth. Well Design's mud window carries the same margins and seats on the trajectory (TVD and MD). Engine `casingSeats.js` gated on the published Applied Drilling Engineering example: the EMW table to the printed digit, two protective strings, the intermediate minimum at 11,540 ft against the published chart reading of 11,700 ft and the surface minimum (with the published 110 pcf) at 6,084 ft against 6,600 ft, both at or above the published depths (which are "at least" depths read off a hand-drawn chart; the published seats hold by the engine's own check). Negative controls: no margins moves the intermediate seat 2,000 ft shallow; margins read as ppg in a pcf table close the window. | engines `porepressure.u2.test.js` (U2-003 block); `upgradeU2.test.js` (U2-003); `upgradeU2Ui.test.jsx`; `well-planning/__tests__/mudWindowSeatsU2.test.jsx` |
| U2-002 | Done | Import RFT/MDT, LOT/FIT or mud weights in the dock (`services/calibrationImport.js`, `components/CalibrationImport.jsx`): file or pasted table, any separator, comma decimals, units in the header or a second header line, a Type column, no header. The app shows what it read and asks for the depth column and reference (MD, TVD RKB, TVDSS, below mudline), depth unit, value unit and kind; header units only pre-fill; TVDSS without a KB is refused. MD goes through the survey, TVDSS through the KB, EMW through `src/lib/ppfgUnits.js` at the TVD below RKB. Rows not read are listed with reasons. RFT/MDT and kicks are compared with PP, LOT/FIT/XLOT with FG (note, report), mud weights drawn as a step line. Imported points are kept apart from typed ones. Hostile set: `e2e/fixtures/porepressure/hostile/` (5 files). | `upgradeU2.test.js` (U2-002, 6 tests; negative control: TVDSS read as TVD is 30 m shallow, MD read as TVD on a 45 degree well); `upgradeU2Ui.test.jsx` (U2-002) |
| U2-001 | Done | Eaton resistivity beside Eaton sonic and Bowers (method buttons in the dock): the deep resistivity is found by the WDM aliases (RT, ILD, LLD, AT90 ...), read in ohm.m with nulls and values at or below zero as gaps and a conductivity in mS/m converted, each said; samples kept where there is a resistivity (sonic optional where the density gives the overburden; the engine refuses a sample with neither). The trend is log-linear (R_n = R0 exp(b z)), fitted on shale picks in the NCT view on a log axis; the note, the report, the CSV and the publish description name the method, n and the trend. Engine `resistivity.js` and `profile.js` (`method: 'eaton-resistivity'`): Eaton's published exponent 1.2 recovers the goldens' imposed pore pressure from a resistivity made with it (the harness well now carries that RT), Eaton's Gulf Coast case (1.0 and 0.465 psi/ft, R/Rn 0.5 gives 0.76713 psi/ft). Negative control: the sonic exponent 3.0 on the same resistivity misses the overpressure ramp by more than 2 MPa. | engines `porepressure.u2.test.js` (U2-001 block); `upgradeU2.test.js` (U2-001, harness door to engine with the 3.0 control; hostile resistivity) |
| U2-004 | Done | A depth selector beside Units (`services/depthRef.js`): below mudline, TVD below RKB, TVDSS, MD below RKB, for the readout (typed and shown in the frame), the chart axis, the window and casing seat lines, the PDF table and reviewer block; remembered per browser. TVD below RKB = depth below mudline + the mudline's TVD through the survey; TVDSS = + water depth offshore (TVD - KB onshore); MD = each sample's log MD. A frame the source cannot give is disabled with its reason (offshore with no mudline MD; onshore TVDSS with no KB; a velocity trend has no MD). The CSV carries every supported frame side by side (the PP0 e2e column contract updated). NCT stays below mudline. | `upgradeU2DepthRef.test.js` (negative control: on the 45 degree well MD is 400+ m deep of the TVD); `upgradeU2Ui.test.jsx` (U2-004: 3,500 m bml reads as 3,600 m TVDSS, same pressure) |
| U2-005 | Done | NCT view: semi-log axis (on by default, ticks 1, 1.5, 2, 2.5, 3, 4, 5, 7 per decade); shale picks filtered by the well's VSH (or VCL, `_CND`; GR with a cutoff halfway between the sand and shale lines), one per interval between two depths (`services/shalePicks.js`); a hand pick in sand is flagged; trend breaks start segments (engine `nctSegments`) fitted on their own picks, drawn dashed, saved with the project, listed in the report. The harness well carries a VSH with five sand beds (its sonic stays the oracle's). | `upgradeU2Nct.test.js` (auto picks recover the generating trend exactly; negative control: sand picks 15% fast bend dt_ml by more than 20 us/m; segment fit; hostile VSH in percent, -999, GR cutoff); `upgradeU2Ui.test.jsx` (U2-005); e2e (log tick spacing) |
| U2-011 | Done | The PDF draws the prognosis plot after the reviewer block (`services/reportPlot.js`): vector jsPDF lines on a white panel with the Petrolord mark, depth downward in the chosen depth frame and unit, pressure in the display unit (EMW against the stated datum), overburden, hydrostatic, PP, FG, the margin lines, the casing shoes and the measured points by kind (circles for pressures, squares for LOT/FIT), wrapped legend; the table follows. | `upgradeU2Report.test.js` (node, real jsPDF, pdftotext: legend, axis titles, Shoe 1, every PP sample drawn, depth range from the mudline; negative control: the report without the plot carries none of its words; axes in TVDSS ft and ppg) |
| U2-006 | Done | Fit to calibration above the notes (`services/calibrate.js` on engine `calibrationFit.js`): Eaton n (sonic or resistivity) by a bounded scan plus golden-section search on the pore pressure misfit, Bowers A and B by exact log-space least squares, Bowers U with sigma max held; RFT/MDT and kicks only, each matched to its nearest sample as the misfit is; the fitted value goes into the dock and the status says the misfit before and after (fixes PP-U1-029). | engines `porepressure.u2.test.js` (n = 3 and 1.2 recovered, A and B exact, U, side-dip search); `upgradeU2b.test.js` (U2-006: n from 2.2 back to 3.000, RMS to 0.00 MPa; negative control: points 3 MPa high are not fitted to 3); `upgradeU2Ui.test.jsx` (U2-006) |
| U2-008 | Done | Layer cakes read along the hole (`services/alongHole.js`, registry backend): each boundary time is read where the hole crosses it (start at the wellhead, place the boundary at its depth, move to the hole's position at that depth through the survey, read again until the time settles; CRS transform carried); a vertical well reads the wellhead. The seismic datum is declared in the dock (SRD elevation above sea level); the mudline sits below it by the SRD elevation plus the water depth (onshore, the KB less the mudline MD); a trend with SRD 0 says it is taken at sea level. A new SRD re-reads the layer cake. Fixes PP-U1-027. | `upgradeU2b.test.js` (U2-008: crossing on a 60 degree well with a dipping boundary; negative control: the wellhead reading is more than 20 ms early and the layer top 15+ m shallow; SRD moves a v0+kz trend by k x 50 m/s; registry helper notes); `upgradeU2Ui.test.jsx` (U2-008) |
| U2-013 | Done | Geomechanics places the published PP/OBG grid (and the raw logs of the computed and hydrostatic paths) at TVD through the definitive trajectory it already loads (`gmRun.mdToTvdOnTrajectory`, the drilling engine's exact `tvdAt`); samples past the last station or where the hole turns up are dropped and counted; with no trajectory the well is taken as vertical; the base provenance says which. The wellbore's rotary table is taken to be the registry well's. Fixes PP-U1-018. Geomechanics suites run: gmRun, ppHandoffU1, ppHandoffU2, helpGuide pass; its theme suite timed out on `findBy` under machine load 10 to 28 locally and passes in CI. The Geomechanics harness had served the oracle's TVD profile as if its grid were MD; it now serves it on a regular MD grid along the golden slant trajectory, as Pore Pressure publishes, and the gmRun suite and e2e follow (oracle agreement within 2e-3, the cost of reading the 50 m profile between its nodes). | `GeomechanicsStudio/__tests__/ppHandoffU2.test.js` (TVD through a 40 degree trajectory, mud window PP EMW 1030 kg/m3 at its own TVD; negative controls: MD as TVD reads the overburden 10%+ light and the PP EMW 60+ kg/m3 off; logs past TD dropped) |
| U2-012 | Done (Matthews and Kelly's Ki(z) chart deferred) | Fracture gradient method in the dock: Eaton (nu), Matthews and Kelly (constant k0, default 0.75), Daines (nu + tectonic beta); Calibrate FG to LOT sets nu, k0 or beta from the median over the LOT/XLOT tests (FITs only when no LOT, said); the report, CSV and publish description name the method. Validation: no published numeric worked example of these methods could be read (the textbook pages are images or paywalled), so the gates are the published identities of Zhang and Yin 2017 (Pet. Sci. 14, eqs. 3, 4, 7): Eaton equals Matthews and Kelly at k0 = nu/(1-nu) (nu 3/7 gives their most likely k0 0.75), Daines equals Eaton at beta 0, and the LOT round trip. Matthews and Kelly's depth-varying Ki chart is not built: digitising it unvalidated would break the rule the lead set ("where validated"). Committed before U2-010 and U2-007 because it shares their files (dock, workstation, report). | engines `porepressure.u2.test.js` (U2-012 block; negative control: k0 on the total overburden is 10 MPa off); `upgradeU2b.test.js` (U2-012: nu 0.4, k0 2/3, beta 1/3 recovered from LOTs on the goldens' line; negative control: the uncalibrated line misses by 3+ MPa) |
| U2-007 | Done | A Crossplot view (`components/CrossplotPanel.jsx`, `services/bowersCrossplot.js`): velocity against the logged density, the loading trend (power law, Gardner's form) fitted above the unloading top (default where the smoothed velocity peaks), samples below it more than 3% under the trend marked unloading, V max and the sigma max the loading curve gives there (engine `bowersSigmaLoading`); Use for Bowers unloading sets Bowers with that sigma max and the typed U (Fit U to calibration from U2-006 refines it). White chart, ChartLogo. Committed after U2-012 (shared files). | `upgradeU2b.test.js` (U2-007: a synthetic loading-then-unloading well, sigma max recovered within 3%, the engine's unloading inversion returns the imposed stress; negative control: the loading curve alone reads it 20%+ high; a loading-only well shows no unloading); `upgradeU2Ui.test.jsx` (U2-007) |
| U2-010 | Done | A worked example project (`services/workedExample.js`): `?example=1` on the app route (loaded on demand, in-memory, banner, Save in the tab, Publish off) and on the harness; offered from the empty workstation and the help guide. ORACLE PP-1 with the trend fitted on eleven VSH shale picks, four MDT pressures, three LOTs, five mud weights, 0.5 ppg margins. The help guide's Worked example section walks six steps whose numbers (PP 40.36 MPa or 9.45 ppg at 3,500 m bml, one shoe at least 881 m bml, n back to 3.00 from 2.5) are constants recomputed by the test. Committed after U2-012 and U2-007 (shared files). | `upgradeU2Example.test.js` (the example opens and its quoted numbers equal the app's; any drift fails); `upgradeU2Ui.test.jsx` (U2-010); `helpGuide.test.jsx` |

## U2-004 depth frames and the well datum model (2026-10-02)

With WDM U2-007 (PR #848) the well's reference elevation reaches Pore Pressure through the shared datum module (`refElevOrNull`), and the three places that did their own KB arithmetic (`depthRef.js` onshore TVDSS, `alongHole.js` ground elevation, `calibrationImport.js` TVDSS to TVD) call it. A registry well that states no reference elevation gives no onshore TVDSS and no TVDSS calibration import, with the existing reason; nothing reads it as 0. The water depth and mudline MD stay project parameters here (open: offer the registry well's water depth as the starting value). Evidence: `src/lib/__tests__/wellDatumReaders.test.js`, the existing `upgradeU2DepthRef.test.js`.
