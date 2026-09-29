# Petrophysics Studio: comprehensive upgrade

App #2 of the Geoscience upgrade programme (`docs/scope/AppUpgrade-Geoscience-PLAN.md`).
Step 1 (practitioner lens, `docs/scope/AppUpgrade-BestPractices.md`) run and
fixed 2026-09-28/29 on branch `feat/petro-u1`. Step 2 (advancement review)
is analysis only; the owner picks batches before anything is built.

Route `/dashboard/apps/geoscience/petrophysics-studio` (ProtectedAppRoute),
harness `/dev/petrophysics-studio` (in-memory backend; `?scaleWell=1` adds a
20,000 ft, 0.5 ft, 30-curve well and `?extraWells=<n>` adds n copies of the
type well, both new for PL10).

## Evidence kit made for this app

| Kit | Where | What it holds |
|---|---|---|
| Hostile file set (PL2) | `e2e/fixtures/petro/hostile/` + `generate.mjs` | One physical four-layer well (shale, oil sand at phi 0.25 and Sw 0.25, shale, water sand) written the ways vendors write it: the SI reference; an Interactive Petrophysics export in feet with NPHI in PU, DT in us/ft, IP's own PHIE/SW/VSH riding along, a declared null and an undeclared `-999.00` inside the sand; a Techlog export with a TDEP index, RHOZ in kg/m3, TNPH in m3/m3, AT90 and `-9999` nulls; a Petrel export with the density unit missing and NPHI in percent labelled v/v; LAS 3.0 comma-delimited with NPHI in PU; a bottom-up file in feet with NPHI in %; Geolog/Paradigm names (NEU, DEN, RES_DEEP, SONIC); routine core analysis (12 plugs at irregular depths, CPOR %, CKH mD, grain density); a Techlog zonation CSV (base before top, feet, comment line). |
| Saved state (PL5) | `e2e/fixtures/petro/saved/` | One interpretation per release: G2.5 (2026-07-14, the single-object pre-PS3 payload), PS10 (2026-09-02, named, Waxman-Smits with temperature, a zone override, a layout fork), pre-PT9a (2026-09-04, stored permeability none), PT11 (2026-09-10, state version 2, every underscore extra), and a row stamped by a newer build. |
| Chain (PL9) | `__tests__/hostileChain.test.jsx`, `__tests__/batchZones.test.jsx`, `WellDataManager/__tests__/mergeImportPoints.test.js`, `ReservoirCalcPro/services/__tests__/registryInputs.test.js` | WDM door to the Studio's input path and pipeline for every hostile file; batch publish to ReservoirCalc Pro's registry door; core plugs through the WDM merge. |
| Quantities (PL1) | `__tests__/zoneAverages.test.js`, `__tests__/practitionerQuantities.test.js` | The textbook definition beside the engine for every zone and curve quantity, with the volumetric invariant asserted to 1e-12. |
| Report (PL7) | `__tests__/petroReport.test.js` | The PDF's text read back (header, every parameter, overrides, zone numbers, Latin-1 only). |
| Browser (PL3-PL10) | `e2e/petrophysics-upgrade.spec.js` | 1366x768, 1440x900 and 390 wide in light and dark with canvas ink and white-paper checks, the unit toggle, every deliverable read back (LAS through the Suite parser, PDF through pdftotext, PNG header), and the scale timings. |

## Step 1: the twelve checks

| Check | Result | Findings | Notes |
|---|---|---|---|
| PL1 Labels mean the textbook | Failed, fixed; three engine-side items open | 002, 004, 005, 019, 020, 021 | Quantity table below. The zone Sw was thickness-weighted, total-porosity models mixed PHIE with Swt, net pay was along hole only. |
| PL2 Hostile file set | Failed, fixed | 006, 007, 011, 030, 023 | 9 files. Before: 5 of the 6 log variants gave wrong porosity (NPHI in percent, RHOB in kg/m3, an undeclared -999 as data); core plugs were smeared into 47 interpolated samples. |
| PL3 Units, datums and frames at every door | Pass after fixes, one open | 005, 006, 022 | Depth toggle converts (e2e); inputs normalised at the read door; TVT through the survey. Parameter doors are SI only (us/m, degC, BHT depth in m). |
| PL4 No claim without the event | Failed, fixed | 003, 014 | A zone cut from tops said "published summary on record"; a published zone kept that claim after the numbers moved; a publish wrote numbers from the base cutoffs. |
| PL5 Real saved state | Pass | 026, 027 | All five release fixtures open through the real workstation; the newer-build row is refused with the reload sentence. Two semantic carry-overs from PT9a recorded. |
| PL6 Real browser | Failed, fixed; two cosmetic open | 015, 017, 018, 028, 029 | Split view was unusable at 1280 and clipped at 1366 (two e2e specs had been red on main since the design-system rollout); crossplot labels and watermarks clipped. Tracks are white chart paper in both themes, depth increases downward (asserted). |
| PL7 Report a reviewer can sign | Failed, fixed; one open | 009, 010, 024 | The PDF now carries company, field, analyst, well, UWI, location and CRS, datum, interpretation, units, build, every parameter and the zone overrides; it has no log plot page yet. |
| PL8 Practitioner's day | Gaps recorded | 012, 013, 022, 023, 024, 031, 032 | Three persona walks below. |
| PL9 The chain | Failed, fixed | 001, 003, 012 | ReservoirCalc Pro applied NTG twice to the published net pay (S1). `.pld` round trip green (91 portability tests); the duplicate-name import failure is fixed (2026-09-03). Deep links and Open in green (existing e2e). |
| PL10 Real scale | Pass, one open | 033 | 40,001 samples x 30 curves open in 1.3 s, longest main-thread task 0.49 s; a 23-well batch (curves and zone summaries) in 1.4 s. Probabilistic: 100 draws on that well take 53.5 s in the worker (progress and Cancel work). |
| PL11 Inputs a person can type | Pass | none | Parameter fields are text drafts applied on Apply or Enter, so "-", "2." and clearing work; the layout range boxes use NumText (PT8); report header fields are plain text. |
| PL12 House standards | Pass after fix | 016 | ProtectedAppRoute, white chartTheme + ChartLogo, copy style hold; the shared track painter printed an em dash for a missing value and two export errors carried em dashes. |

### PL1 quantity table

Tests: `zoneAverages.test.js` (Z), `practitionerQuantities.test.js` (Q), existing goldens (G, `petroGoldens`, `petroAnalytic`, `perm`, `swClay`).

| Quantity on screen | Textbook meaning | What the code computes | Same? | Test |
|---|---|---|---|---|
| IGR, Vsh (linear, Larionov tertiary/older, Clavier, Steiber) | Gamma-ray index clamped 0..1 and the cited transforms | Same, cited in METHOD_CITATIONS | Yes | G, Q |
| PHIT | Total porosity from the selected tool as read (density (rho_ma - rho_b)/(rho_ma - rho_fl); Wyllie or RHG sonic; N-D average or the RMS gas form) | Same | Yes (PT9a renamed it from "PHIE") | Q shaly sand, gas case |
| PHIE | Effective porosity: PHIT - Vsh x phi_sh (shale-point correction) | Same | Yes | Q shaly sand |
| N-D combination in gas | Density porosity reads high, neutron low; sqrt((phiN^2 + phiD^2)/2) is the gas form | `rms`; default `avg` | Yes; the default is the oil/water form and says so | Q gas |
| Sw (Archie, Simandoux, Indonesia, modified Simandoux) | Effective-system Sw on PHIE | Same | Yes | G, Q |
| Sw (Waxman-Smits, dual water) | Total Swt on PHIT | Swt on PHIT, displayed and published as "SW" | Partly: the curve and track still say Sw (020) | Q, swClay |
| Rw at formation T | Arps, degF inside: Rw2 = Rw1 (T1 + 6.77)/(T2 + 6.77) | Same | Yes | Q |
| KPERM | Timur 0.136 phi%^4.4/Swi%^2 (fractions: 8581, which is 8581.03 rounded, 2 ppm); Tixier; Coates-Denoo; Wyllie-Rose with Morris-Biggs presets | Same, mD | Yes | Q, perm |
| BVW | phi x Sw in one porosity system | PHIE x SW; for total models PHIE x Swt (mixed) | No for WS/dual water (019, engine) | Q |
| PAY | phi >= cut AND Vsh <= cut AND Sw <= cut, any missing input not pay | Same | Yes | Q |
| Gross | Zone thickness | Midpoint sample thickness along hole | Yes (MD) | G |
| Net pay | Pay thickness | Along hole only | Was MD only in deviated wells; now also TVT (005) | Z |
| Net reservoir | phi and Vsh cutoffs only | Did not exist | Added (005) | Z |
| NTG | Net pay / gross | Same | Yes | G |
| phi avg | Net-pay-thickness weighted | Same | Yes | G |
| Sw avg | Pore-volume weighted, so net x phi x (1 - Sw) = HCPV | Was net-thickness weighted: 0.35 against 0.275 in the hand case, HCPV 10 percent low; for total models PHIE mixed with Swt, 20 percent low in the dual-water case | Fixed (002, 004); thickness-weighted kept as `sw_avg_h` | Z invariant to 1e-12 |
| HCPV | sum h phi (1 - Sw) in one porosity system | Did not exist | Added (`hcpv_m`, TVT twin) | Z |
| k gm | Thickness-weighted geometric mean over pay | Same | Yes | perm |
| Histogram and probabilistic percentiles | Parameters as percentiles; outcomes P90/P50/P10 as exceedance (SPE PRMS) | Same (PT10 decision 1) | Yes; the probabilistic Sw statistics are still thickness-weighted (021) | percentileConventions gates |

### Findings

Severity: S1 wrong answer with no warning at scale; S2 wrong or lost data, or a door that misleads; S3 workflow gap or misleading text; S4 polish.

| ID | Sev | Check | Finding | Evidence | Status |
|---|---|---|---|---|---|
| PETRO-U1-001 | S1 | PL9, PL1 | ReservoirCalc Pro's Wells tab put a zone's published NET pay into its GROSS thickness and also set NTG, so GRV x NTG applied net-to-gross twice: 20 m of pay at NTG 0.5 went into volumetrics as 10 m. Every registry-driven volume was low by the NTG factor. | Code read; `registryInputs.test.js` negative control (5 fail on the old mapping). | Fixed: thickness is the published gross (vertical when present) with its NTG; legacy net-only rows reconstruct gross. |
| PETRO-U1-002 | S2 | PL1 | Zone Sw averaged by net thickness, so net x phi x (1 - Sw) was not the hydrocarbon pore thickness (HCPV 10 percent low in the hand case). | `zoneAverages.test.js`. | Fixed: pore-volume weighting (`services/zoneAverages.js`); card, CSV, PDF, field view, scenarios, publish. |
| PETRO-U1-003 | S2 | PL4, PL9 | A zone publish computed its numbers with the BASE cutoffs while recording the zone's own: with an override cutPhi the registry row said 18 m where the card said 0 m. | `zoneAverages.test.js` negative control. | Fixed (`zonePublishProperties`). |
| PETRO-U1-004 | S2 | PL1 | Waxman-Smits and dual water return Swt on PHIT, but the zone porosity is PHIE: the averages understated hydrocarbons by PHIE/PHIT (20 percent in the test case). | `zoneAverages.test.js` (hand and pipeline cases). | Fixed: HCPV = PHIT (1 - Swt), sw_avg its effective-system equivalent. |
| PETRO-U1-005 | S2 | PL1, PL3 | Net pay and gross were along hole only: in the harness well (about 21 degrees at SAND A) and any deviated well the thickness volumetrics need is shorter by cos(inclination). No net reservoir. | `zoneAverages.test.js` (30 degree hold, TVT = MD cos 30). | Fixed: TVT through the survey (card line, CSV, PDF, publish), net reservoir. |
| PETRO-U1-006 | S2 | PL2, PL3 | Inputs were read as stored: NPHI in PU or %, RHOB in kg/m3, NPHI in percent labelled v/v all reached the engines, which expect v/v and g/cc. | `hostileChain.test.jsx` (5 of 6 variants fail without the fix). | Fixed at the shared layer: `src/components/wells/curveUnits.js` in the Studio, the curves cache (Field view, Well Correlation, Earth Modeling) and batch; by unit, else by physical range; the status line names each change; derived curves and exports carry the pipeline unit. |
| PETRO-U1-007 | S2 | PL2 | A vendor null that differs from the declared NULL (-999.00 in a -999.25 file) was data: an RHOB of -999 is a density porosity of 607, it passed every cutoff and the zone porosity averaged about 12. | Same test. | Fixed: -999 or below in GR, RHOB, NPHI, DT, RT, CAL, DRHO, PEF is null, and said. |
| PETRO-U1-009 | S2 | PL7 | The PDF carried the well name and a project id only; its parameter table omitted phi shale, permeability, temperature and the shaly-sand models, and a zone with its own cutoffs was reported under the base values. | `petroReport.test.js` negative control. | Fixed: header block (company, field, analyst typed in Export and remembered, well, UWI, location with CRS, datum, interpretation, units, build), every applied parameter, a zone override table, net reservoir, net pay TVT and HCPV. |
| PETRO-U1-010 | S3 | PL7 | Greek labels printed as mojibake in the PDF ("P o r o s i t y :  Æ  s h a l e"). | pdftotext of the export. | Fixed (`latin1Safe`). |
| PETRO-U1-011 | S2 | PL2, PL9 | Core plugs merged into an existing well (the WDM door) were linearly resampled: 12 plugs became 47 samples of interpolated core porosity and no measured value survived, so core-log calibration read invented numbers. | `mergeImportPoints.test.js` negative control (47). | Fixed in WDM `mergeImport.js`: point data lands on the nearest grid sample with its measured value; regular logs unchanged. |
| PETRO-U1-012 | S3 | PL8, PL9 | Batch runs published curves only; a field's zone averages reached ReservoirCalc Pro one well and one click at a time. | `batchZones.test.jsx`. | Fixed: batch publishes each well's zone summaries (own overrides). |
| PETRO-U1-013 | S4 | PL8, PL10 | The batch dialog had no select-all (23 checkboxes for the scale test). | e2e PL10. | Fixed. |
| PETRO-U1-014 | S3 | PL4 | "published summary on record" showed for any non-empty properties (a zone cut from tops carries only `from_tops`) and stayed green after the numbers moved. | `zoneAverages.test.js`, e2e publish test. | Fixed: nothing, "published; matches these numbers", or "published with different numbers; publish again". |
| PETRO-U1-015 | S4 | PL6 | Sandstone and Limestone labels fell off the density-neutron plot; the ChartLogo sat on the crossplot and histogram tick labels. | Screenshot 1440. | Fixed (`overlayLabelAnchor`, tested). |
| PETRO-U1-016 | S4 | PL12 | The shared track painter printed an em dash for a missing value (Petrophysics, Well Correlation, WDM); two export errors carried em dashes. | Code read. | Fixed: EMPTY_VALUE. |
| PETRO-U1-017 | S3 | PL6 | Split view: at 1366 the crossplot toolbar clipped Select, PNG and the zone chips; at 1280 the tracks canvas covered the crossplot, so no selection could be brushed. The PS10 e2e had been red on main since the design-system rollout. | Screenshots 1280/1366; PS10 fails on staging main. | Fixed: toolbar wraps, panes keep their widths (tracks scroll sideways). |
| PETRO-U1-018 | S4 | PL6 | Mineral model Apply to tracks left the modal over the tracks it had just changed (PT11d e2e red on main). | e2e. | Fixed: closes like the probabilistic dialog. |
| PETRO-U1-019 | S3 | PL1 | BVW for Waxman-Smits and dual water is PHIE x Swt (mixed systems); the Buckles plot and BVW track read it. | Code read (engine `pipeline.js`). | Open: engines-first (U2-012). |
| PETRO-U1-020 | S3 | PL1 | With a total-porosity model the curve, track and published row are named SW, not Swt. | Code read. | Open (U2-012). |
| PETRO-U1-021 | S3 | PL1 | The probabilistic zone statistics use the engine's thickness-weighted Sw, so its 50th percentile Sw is not comparable with the card's pore-volume Sw. | Code read (engine `probabilistic.js`). | Open: engines-first (U2-012). |
| PETRO-U1-022 | S3 | PL3, PL8 | Parameter doors are SI only: matrix and fluid slowness in us/m, temperatures in degC, BHT depth in m, even in a feet session. A US or Techlog-in-feet user converts 55.5 us/ft by hand. | Persona walk. | Open, Step 2 batch A (U2-002). |
| PETRO-U1-023 | S3 | PL2, PL8 | No zone import: a Techlog or IP zonation (`zones_techlog_export_ft.csv`) cannot be loaded; zones are typed, cut from tops or clicked. | Hostile file I. | Open, Step 2 batch A (U2-004). |
| PETRO-U1-024 | S3 | PL7, PL8 | The PDF has no log plot (CPI) page; the PNG exists separately. | Persona walk. | Open, Step 2 batch A (U2-003). |
| PETRO-U1-025 | S3 | PL4 | Published curves carry no "stale" state after the parameters move (the zone card now does). | Walk. | Open, batch B (U2-009). |
| PETRO-U1-026 | S3 | PL5 | Curves published as PHIE before PT9a (pipeline_version below 5, before 2026-09-07) are total porosity; Rock Physics, Earth Modeling and Data AI read them as PHIE until the next Studio publish overwrites them. | Code read; provenance carries the version. | Open: owner decision (republish the tester wells, or flag by version) (U2-013). |
| PETRO-U1-027 | S4 | PL5 | A layout saved before PT9a with `output:PHIE` now draws the shale-corrected PHIE under the same title. | PS10 fixture. | Open (documented in the help guide since PT9a). |
| PETRO-U1-028 | S3 | PL6 | At 390 wide the workstation keeps its minimum width and scrolls inside the shell (same as WDM-U1-023, shared WorkspaceShell). | Screenshot 390. | Open: product decision on phone support for workstation apps. |
| PETRO-U1-029 | S4 | PL6 | Pickett iso-Sw labels overlap at the top edge; the Pickett toolbar wraps into narrow columns at 1440. | Screenshot. | Open (cosmetic). |
| PETRO-U1-030 | S4 | PL2 | Geolog/Paradigm names NEU and RES_DEEP are not auto-mapped (the picker offers them by description). | `hostileChain.test.jsx`. | Open: alias table is shared with the concurrent WDM work; add with U2-001. |
| PETRO-U1-031 | S3 | PL8 | No cutoff sensitivity plot (net pay or HCPV against each cutoff), the first thing a reviewer asks for. | Persona walk; IP Cutoff Sensitivity. | Open, batch A (U2-005). |
| PETRO-U1-032 | S3 | PL8 | No core door in the Studio: core porosity and permeability cannot be drawn as points on the tracks or used to fit a poro-perm transform. | Persona walk. | Open, batch B (U2-007). |
| PETRO-U1-033 | S3 | PL10 | Probabilistic on a 20,000 ft well: 100 draws take 53.5 s (worker, progress, Cancel). | e2e timing. | Open: vectorised engine (U2-011). |

17 findings fixed (1 S1, 8 S2, 4 S3, 4 S4; the number 008 is unused), 15 left open (12 S3, 3 S4). No S1 or S2 is open.

### Persona walks (PL8)

**1. Techlog / IP petrophysicist (evaluates a field for a partner meeting).**
Loads the partner's IP exports through WDM. *Before*: NPHI in PU read as 25 v/v, a -999.00 in the sand read as 607 porosity, and the zone porosity averaged about 12; *now* the status line says what was converted and nulled, and the numbers match the SI reference file. Picks Waxman-Smits: the zone Sw now keeps PHIT (1 - Swt) where it used to lose 20 percent of the hydrocarbons. Sets per-zone cutoffs, publishes: *before*, the registry row used the base cutoffs; *now* it matches the card. Exports the PDF: header, every parameter and the override table. Would now: load the IP zonation (missing, U2-004); see a cutoff sensitivity plot (missing, U2-005); type matrix slowness in us/ft (missing, U2-002); put a CPI page in the report (missing, U2-003); run a weighted multi-mineral solve with reconstructed logs (missing, U2-014); calibrate k to core (missing, U2-007).

**2. Graduate geologist (first evaluation, from a supervisor's LAS).**
Opens the help guide's zones section: net pay, net reservoir, the averaging rule and TVT are defined in one table. Deviated well: the zone card's TVT line shows the vertical thickness beside the along-hole one. Opens Split view on a 1366 laptop: *before* the Select button was off the pane; *now* it wraps into reach. Would now: be warned when a parameter set is far from the well's own histograms (missing; a QC hint, U2-015 candidate); see a worked example well in the help (partial).

**3. Reservoir engineer (takes net pay averages into ReservoirCalc Pro and Earth Modeling).**
Runs Batch over the field: *before* only curves were published and each zone had to be published by hand; *now* one pass publishes every zone's summary. In ReservoirCalc Pro's Wells tab pulls the zone: *before* thickness = net pay AND NTG applied, so volumes were low by the NTG factor (S1); *now* gross (vertical) x NTG equals the published net, and Sw conserves HCPV. Would now: see HCPV per zone mapped (Mapping grids phi_avg and ntg today, U2-008), weight the cross-well average by net (RCP averages wells equally; RCP Step 2), and get Sw from saturation-height instead of a zone average (U2-010).

## Step 2: advancement review (analysis only)

### 2a. Competitor parity

Sources: SLB Techlog product pages (Base, Quanti, Quanti.Elan, TechCore, NMR, SHM, Ipsom, K.mod, Python) [slb.com](https://www.slb.com/products-and-services/delivering-digital-at-scale/software/techlog-wellbore-software/techlog/techlog-core-systems/techlog-base), [Quanti](https://www.software.slb.com/products/techlog/techlog-petrophysics/quanti), [SHM](https://www.software.slb.com/products/techlog/techlog-reservoir-engineering/saturation-height-modeling), [TechCore](https://www.slb.com/products-and-services/delivering-digital-at-scale/software/techlog-wellbore-software/techlog/techlog-petrophysics/techlog-techcore); Interactive Petrophysics pages from the distributor [geoactive.com IP for formation evaluation](https://www.geoactive.com/ip-for-formation-evaluation), [IP 2024](https://www.geoactive.com/ip-2024), [IP for foundation](https://www.geoactive.com/ip-for-foundation); the AspenTech Geolog brochure [pdf](https://home.aspentech.com/-/media/aspentech/home/resources/brochure/pdfs/fy25/q4/at3812brogeologv7425.pdf); the averaging convention from Crain's handbook [net pay with cutoffs](https://www.scribd.com/document/723399574/Crain-s-Petrophysical-Handbook-CALCULATING-NET-PAY-WITH-CUTOFFS) and AAPG [thickness for volumetrics](https://www.aapg.org/news-and-media/divisions/thickness-determinations-for-volumetric-calcuations/). Public pages do not state IP's or Techlog's Sw weighting or TVT reporting; we follow the textbook convention.

| Capability | Leader and how | Ours | Gap | Demo-visible |
|---|---|---|---|---|
| Data loading and unit families | Techlog Base: DLIS, LIS, LAS 2/3, WITSML; families and aliases align names, units and scales project-wide | LAS 1.2/2.0/3.0 via WDM; unit normalisation at the read door (new); alias table plus description picker | partial (no DLIS/WITSML, no editable family table) | yes |
| Log QC and environmental corrections | Quanti bad-hole/rugosity flags; Geolog vendor-specific borehole corrections | Despike, smooth, block and tie-point shift, bad-hole repair, normalisation; no chartbook borehole corrections | partial | yes |
| Deterministic models | All three: full Vsh, porosity, Sw model sets; IP silty-sand model | Five Vsh, three porosity routes with gas form, six Sw models, temperature, Rw tools | none | no |
| Cutoff and summation | IP net reservoir and pay averages, Cutoff Sensitivity plot per zone and well | Net pay, net reservoir, NTG, PV-weighted Sw, HCPV, TVT (new); draggable histogram cutoffs | partial (no sensitivity plot) | yes |
| Multi-mineral solver | Quanti.Elan, Multimin, IP Mineral Solver: weighted least squares, tool uncertainties, reconstructed logs, quality curve, multiple models | Determined 3 minerals + porosity, refusal flags | worse | yes |
| Uncertainty | Geolog Monte Carlo in all modules; IP Monte Carlo with tornado | Parameter Monte Carlo, P90/P50/P10 net pay, tornado, pay probability | partial (no HCPV outcome; 53 s on a long well) | yes |
| Permeability and rock typing | IP HFU (Winland R35, FZI, Lucia); Techlog NMR (Coates, SDR), K.mod | Timur, Tixier, Coates-Denoo, Wyllie-Rose from Swirr | missing (core transform, rock typing, NMR) | yes |
| Core integration | TechCore: core DB, rock types, upscaling; Geolog core and SCAL | Core LAS lands as curves (point placement now correct); no core overlay or transform | missing | yes |
| Saturation-height | Techlog SHM (Brooks-Corey, Lambda, Thomeer, Leverett J, FWL per well or zone); IP SHM | none in the Studio (SCAL Studio exists separately) | missing | yes |
| Facies | Facimage (MRGC), Ipsom (SOM), IP ML | Crossplot polygons, rule facies; Data AI Electrofacies does clustering separately | partial (not joined up) | yes |
| Multi-well | IP global and tilted parameters; Geolog multi-well | Batch (now with zones), Field view to 8 wells, multi-well histograms | partial (no parameter-by-well table) | no |
| Deliverables | Geolog report templates, audit trail; CPI prints | CSV, LAS 2.0, PDF (header, parameters, overrides, zones), PNG, `.pld` | partial (no CPI page, no LAS 3.0/DLIS out) | yes |
| Scripting | Techlog Python, Geolog Loglan, IP Python | Curve calculator (no eval) | worse | no |
| Geomodel handoff | Techlog link to Petrel zones; Geolog to SKUA | Registry zones to RCP, Earth Modeling, Mapping (fixed chain) | none within the Suite | yes (our strength) |
| Data management | Studio/OSDU, Epos with audit | Shared registry, provenance on every curve and zone, named interpretations | partial (no OSDU) | no |

### 2b. Deferred backlog harvest

| Item | Source | Decision |
|---|---|---|
| Multi-mineral stage two (PT11e: WLS, per-tool sigma, bounds, reconstructed logs) | ROADMAP PT11e, memory | Still wanted (competitor gap), batch C (U2-014) |
| Bateman-Konen chart readings at 150 and 300 degF inside the band | ROADMAP decision 6, memory | Still wanted: owner reads the chart; no build |
| Bateman-Konen equation page verified in the copy in hand | Audit B5, memory | Still wanted: owner item |
| Studio preferences in a table (cross-device) | PT11b, memory | Still wanted, batch C (U2-016; the report header now lives in these prefs) |
| Vectorised probabilistic engine | PT10 memory | Still wanted, batch B (U2-011; PL10 measured 53 s) |
| `useProjectState` extraction from PetroWorkstation (now 1,624 lines) | ROADMAP close-out | Still wanted as maintenance, batch C (U2-017) |
| Retire `src/utils/trackUtils.js`, `depthTrackUtils.js` | ROADMAP close-out | Superseded: already removed |
| Digitizer follow-ups: wrapped and backup scales, black-on-black, skew, ROI from the proposal | PT7 | Still wanted, low (batch C) |
| Per-user daily cap on AI scan reads | PT7 cost note | Still wanted, batch B (U2-018, small) |
| Hover cross-highlighting between tracks and crossplot | PS10 trimmed | Dropped: the selection brush does the job |
| Per-view crossplot domain persistence | PS10 optional | Dropped (low value) |
| TVD-linear resampling | PS10 | Superseded by the PT8 MD/TVD/TVDSS depth columns |
| `grCutoff` pipeline parameter | PT6 | Superseded: the editable fill row |
| Per-zone probabilistic spreads | PT10 | Still wanted if testers ask (batch C) |
| `.pld` import fails on duplicate names | Inputs to Step 2 | Superseded: fixed 2026-09-03, covered by portability tests |
| Staging walks of PT10b/d, owner E2E | STATUS | Still wanted: owner run |

### 2c. Suite integration

**Reads:** `geo_wells` (header, deviation, KB, checkshots), `geo_wells_logs` + f32 curves (any mnemonic), `geo_wells_tops`, `geo_wells_zones`, `geo_wells_intervals` (core, lithology, facies strips), `petro_projects`.
**Writes:** computed curves (VSH, PHIT, PHIE, SW, PAY, KPERM; `_LOW/_HIGH`, `_Q10..90`, PAY_PROB, mineral curves, `_CND`, `_DS`, `_DIG`, calculator curves) with provenance; zone summaries (now with net reservoir, TVT, HCPV, PV-weighted Sw and the cutoffs used); tops; zones; facies and electrofacies intervals; `petro_projects`. `.pld`: all of these families.
**Readers:** ReservoirCalc Pro (zone averages, fixed), Earth Modeling (phi_avg, sw_avg, ntg per zone), Mapping (zone properties gridded; tops mapped), Well Correlation (computed curves through `log:`), Rock Physics (PHIE/VSH/SW by its own alias list), Data AI (registry curves), WDM (zones tab and computed badges, from the concurrent WDM Step 2).

| Finding | Kind | Detail |
|---|---|---|
| RCP applied NTG twice | handoff lost meaning | Fixed in Step 1 (001). RCP still averages wells equally, not by net thickness (RCP Step 2). |
| Zone Sw not volumetric; total models mixed | handoff lost meaning | Fixed (002, 004); Earth Modeling and RCP read the corrected sw_avg. |
| Sw to SCAL / saturation-height | downstream unused | SCAL Studio fits Pc and saturation-height, but neither side reads the other: log Sw is not compared with the SHM Sw, and Earth Modeling fills Sw from a zone constant. U2-010. |
| Facies to Data AI | two representations | The Studio publishes rule facies as `electrofacies` intervals; Data AI Electrofacies writes a facies CURVE and trains on curves, and neither reads the other's. U2-006. |
| Rock Physics unit handling | parallel logic | Rock Physics converts units in its own `prep.js`; the Studio's new `curveUnits.js` could serve both. U2-001. |
| Pre-PT9a PHIE rows | stored state | 026: downstream apps read total porosity as PHIE until republished. U2-013. |
| Core intervals and plugs | upstream unused | WDM stores core intervals and (now correctly placed) core curves; the Studio shows intervals as strips but cannot calibrate to them. U2-007. |
| Zone HCPV to Mapping | downstream unused | Mapping grids phi_avg and ntg; `hcpv_m` (new) is the property a volumetric map wants. U2-008. |

### Ranked backlog

Sizes: S under a day, M two to four days, L a week or more.

| Rank | ID | Item | Size | Value in one line | Batch |
|---|---|---|---|---|---|
| 1 | U2-005 | Cutoff sensitivity plot (net pay, HCPV, averages against each cutoff, per zone, with the current cutoff marked) | S | The reviewer's first question answered on screen and in the PDF | A |
| 2 | U2-003 | CPI page in the PDF: the track plot over each zone with the header and zone table | S | The deliverable a partner expects, from the composer that already exists | A |
| 3 | U2-002 | Unit doors for parameters (us/ft, degF, ft BHT depth) following the session unit | M | Techlog-in-feet and US users type their own numbers | A |
| 4 | U2-004 | Zone import from Techlog/IP/Petrel zonation CSV (any column order, units in headers, base before top) | S | A partner's zonation in one paste | A |
| 5 | U2-001 | Unit family table (editable NPHI/RHOB/DT unit per curve, shared with Rock Physics and WDM) and the NEU/RES_DEEP aliases | S | Conversions visible and correctable in one place | A |
| 6 | U2-007 | Core overlay and core-calibrated poro-perm (core points on tracks, k-phi crossplot with core, fit a transform per zone) | M | Removes the "can it use my core?" objection | B |
| 7 | U2-012 | Engines: BVW and Swt naming in one porosity system; probabilistic Sw pore-volume weighted | S | Closes 019 to 021, oracle-gated | B |
| 8 | U2-011 | Vectorised probabilistic pipeline (engines-first) | M | 53 s to a few seconds on a real well; a live demo | B |
| 9 | U2-009 | Stale badges on published curves and facies | S | Other apps never read an outdated interpretation unknowingly | B |
| 10 | U2-013 | Flag or republish pre-PT9a PHIE rows (by pipeline_version) | S | Downstream apps stop reading total porosity as PHIE | B |
| 11 | U2-010 | Saturation-height link: SCAL Studio's SHM Sw on the tracks beside log Sw; FWL from the pair; Earth Modeling reads it | M | The integrated-platform story: logs and SCAL agree or say why | B |
| 12 | U2-008 | HCPV and net-weighted zone properties to Mapping (net pay and HCPV maps) | S | Volumetric maps from the registry | B |
| 13 | U2-006 | Facies interchange with Data AI (read each other's facies; one representation) | M | ML facies and rule facies compare on one track | B |
| 14 | U2-014 | Multi-mineral stage two (WLS, tool sigmas, reconstructed logs, quality curve) | L | Parity with Elan-class solvers | C |
| 15 | U2-016 | Studio preferences table (cross-device), migration staged | S | Report header and layout choices follow the user | C |
| 16 | U2-017 | Extract `useProjectState` from PetroWorkstation | M | Maintainability before the next wave | C |
| 17 | U2-018 | Per-user daily cap on AI scan reads; digitizer follow-ups | S | Cost control and scan robustness | C |
| 18 | U2-015 | Parameter QC hints (cutoffs or GR lines far from the well's own histograms) | S | Graduates get told before they publish | C |

Batch A (demo-visible, NAPE-safe, no schema change): U2-005, U2-003, U2-002, U2-004, U2-001.
Batch B: U2-007, U2-012, U2-011, U2-009, U2-013, U2-010, U2-008, U2-006 (U2-011 and U2-012 are engines-first).
Batch C: U2-014, U2-016 (needs a migration, staging first), U2-017, U2-018, U2-015.

## Batch decision (programme lead, 2026-09-29)

Recorded verbatim.

BUILD in this order, one commit per item:
- Batch A: U2-005 cutoff sensitivity; U2-003 CPI page in the PDF; U2-002 parameter entry in us/ft and degF (display-layer conversion, state stays in engine units, exact round trip); U2-004 zone import (hostile-file tested); U2-001 unit family table + NEU/RES_DEEP aliases.
- Batch B: U2-012 engine fixes for 019-021 (BVW/Swt naming for total-porosity models, pore-volume Sw in probabilistic stats), done engines-first per the vendoring recipe so the CI check vendored-engines-match-canonical stays green; if the canonical engines repo cannot be updated from here, stop that item and report; U2-009 stale badges on published curves; U2-013 old PHIE rows (decision on PETRO-U1-026: do not rewrite data; flag PHIE rows published before PT9a by pipeline version wherever they are read, and offer an explicit Republish action to the owner of the well); U2-008 HCPV to Mapping; U2-007 core overlay + poro-perm fit; U2-010 saturation-height link with SCAL Studio (read SCAL Studio's saved saturation-height functions; validate against a published example); U2-011 vectorised probabilistic engine (target: 100 draws on the 20k ft well well under 10 s; same statistics as before within Monte Carlo tolerance; use the canonical MonteCarloEngine per CLAUDE.md if sampling is touched, no new MC implementation); U2-006 facies interchange with Data AI (last in B; drop to deferred if it cannot be finished cleanly).
- Batch C: U2-015 parameter QC hints; U2-018 AI read cap and digitizer follow-ups.

DEFERRED: U2-014 multi-mineral stage two (L, waits for a customer case); U2-016 preferences table (needs a migration); U2-017 useProjectState extraction (refactor, no user value before NAPE).

Owner question decided: PETRO-U1-028 workstation at 390 px stays desktop-first like WDM (narrow layout must stay readable, no horizontal page scroll).

Still owed by the owner (list only): Bateman-Konen 150/300 F chart readings; equation page check.

## Step 2 build log (branch `feat/petro-u2`)

| Item | Status | What was built | Proving test |
|---|---|---|---|
| U2-005 cutoff sensitivity (031) | Done | `services/cutoffSensitivity.js` sweeps each cutoff through the Studio's own zone report (one cutoff replaced, the zone's overrides kept; Worthington and Cosentino 2005, SPE 84387); `SensitivityDialog` (Zones panel, `Cutoff sensitivity…`): three white-paper charts with net pay, net reservoir and HCPV, current cutoff dashed, a swing column; the PDF carries the table per zone. | `cutoffSensitivity.test.js` (hand-counted ten-sample case, invariant at every point, monotone on the type well, override negative control), `sensitivityDialog.test.jsx`, `petroReportU2.test.js` (pdftotext; negative control without the argument) |
