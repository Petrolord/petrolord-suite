# ReservoirCalc Pro: comprehensive upgrade

App #8 of the Geoscience upgrade programme (`docs/scope/AppUpgrade-Geoscience-PLAN.md`).
Step 1 (practitioner lens, `docs/scope/AppUpgrade-BestPractices.md`) was run and
fixed on 2026-09-30 and 2026-10-01 on branch `feat/rcp-u1`. Step 2 (advancement
review) is analysis only; batches are chosen before anything is built.

- Route: `/dashboard/apps/geoscience/reservoircalc-pro` (ProtectedAppRoute); Prospect Risking inside Tools; Risked Reserves Valuation downstream.
- Harness: `/dev/reservoircalc-pro` (in-memory backend). New for this upgrade: `?saved=1` seeds one saved project and one prospect per release (`services/savedFixtures.js`). `/dev/prospect-risking` seeds a prospect with a unit and basis.
- Earlier cycles: overhaul (07-09), standards audit (07-31), units and projects (#149/#150), exports (#170), RC0 to RC3 (09-06), T1 (09-26, 2 S1 fixed). Their fixes still hold: 236 jest tests were green on origin/main before this work; the T1 contact and thickness e2e still pass.
- Carried in: PETRO-U1-001 (NTG counted twice, fixed in #815), MAP-U1-029 (surfaceAreaM2 10.76x, fixed in #826), MAP-U1-033 and EM-U1-024 (the surface dialog forced XY metres and accepted TWT rows), the shared `src/lib/readDepthSurface.js`, the Suite unit profile (#830), and plan row 8 (shared map kit, gas-cap fraction constant, condensate unused, dead PPFG/Velocity adapters, `rcp_*` not in `.pld`).

## Evidence kit made for this app

| Kit | Where | What it holds |
|---|---|---|
| Hostile surfaces (PL2, PL3) | `__tests__/upgradeU1Surfaces.test.js` on `e2e/fixtures/map/hostile/` and `e2e/fixtures/map/saved/` | Every geo_surfaces release row (G4 feet/no CRS, MS2 CPS-3, MS5 rotated, MS5 digitized, T1, T1 MD attribute, U1 US-feet state plane), a TWT row, an isochore, a TVD-referenced structure; Petrel CPS-3, Irap in ftUS, ZMAP+ TWT, ZMAP+ lines, depth-first headed CSV, semicolon file, rotated lattice; UTM metres with depths in feet |
| Saved state (PL5) | `services/savedFixtures.js` (+ `?saved=1`) | Projects: 08-02 single reservoir, 08-02 multi-reservoir with a metric case, 08-14 MC with raw samples and no meta, 09-06 registry hybrid with feet-rescaled XY and contact unit m, 09-26 T1 structural MC. Prospects: G5 raw STB, T1 MMSTB without basis, U1 gas recoverable |
| Services (PL1 to PL5, PL7, PL9, PL10) | `__tests__/upgradeU1.test.jsx` (16), `upgradeU1Surfaces.test.js` (17), `upgradeU1Handoff.test.js` (8), `upgradeU1Engine.test.js` (11), `upgradeU1Report.test.js` (2, node, pdftotext), `upgradeU1Saved.test.jsx` (13), `src/lib/portability/__tests__/rcpProspectFamily.test.js` (2) | Every test calls the shipped function; numeric fixes were run against the unfixed files first (negative controls below) |
| Browser (PL4 to PL7, PL11) | `e2e/reservoircalc-pro-upgrade.spec.js` (10) | Every saved release opens; the TWT registry row refused; an open closure said with the gridding line; the MC run hands recoverable volumes on and its PDF reviewer block read back with pdftotext; 1366x768, 1440x900 and 390 wide in light and dark with no page errors and no sideways scroll; key-by-key typing |

Negative controls (the new tests run with the fix files reverted): MC batch 10 of 16 failed; handoff batch 8 of 8; engine and report batch 11 of 13; saved, registry and `.pld` batch 6 of 15 (the 9 PL5 release opens pass on the old code too: PL5 holds). The surface doors carry their control in the test (the US-feet row read with the old forced XY metres gives 10.8x).

## Step 1: the twelve checks

| Check | Result | Findings | Notes |
|---|---|---|---|
| PL1 Labels mean the textbook | Failed, fixed | 001, 003, 006, 018, 024 | Quantity table below. The handoff called in-place volumes prospect volumes; the expectation curve was plotted upside down under its name; GIIP units 1000x in four views; zone averages not volumetric. |
| PL2 Hostile inputs | Failed, fixed | 016, 010, 002 | RCP's own parser read CPS-3, ZMAP+ and Irap grids as 1 to 20 header numbers and refused headed or semicolon CSVs. Files now go through Mapping's door; TWT refused. |
| PL3 Units, datums, frames | Failed, fixed (1 S1) | 002, 009, 011, 017 | A US-feet registry surface gave 10.8x GRV. One unit for XY and Z made UTM-metre grids with feet depths 3.28x off. MC results relabelled by a later toggle. Unit profile (#830) verified: new projects start from the profile (`adoptionProjects.test.jsx` green), saved projects keep their own system. |
| PL4 No claim without the event | Failed, fixed | 012, 020, 021, 022, 028, 029 | Open closures reported as trap volumes; "Fully Validated" when nothing was validated; contacts shown but ignored under Simple; positive contacts gave zero with a generic warning; stale runs unmarked; clamped fractions silent. |
| PL5 Real saved state | Pass, two hardened | 013 | All five project releases and three prospect releases open and recompute (jest and e2e). A 50,000-realization run saved about 25 MB twice. |
| PL6 Real browser | Pass, one S4 kept | 039 | Three viewports, both themes, no page errors, no sideways scroll. Charts on white chartTheme with ChartLogo (unchanged). 390 wide keeps the desktop layout inside the shell (the WDM decision). |
| PL7 Report a reviewer can sign | Failed, fixed | 019, 023 | Both PDFs now carry field, analyst, date, build, units, method, contacts with unit and datum, gridding, open-closure flag and the MC basis; phi, minus signs and bullets were not Latin-1. Read back with pdftotext (jest node test and e2e download). |
| PL8 Practitioner's day | Gaps recorded | 032 to 036 | Persona walks below. |
| PL9 The chain | Failed, fixed (2 S1) | 002, 003, 004, 005, 025, 026, 027 | Upstream: every registry read through `readDepthSurface`; Petrophysics zones weighted and PHIT-flagged; every boundary polygon. Downstream: recoverable, unit-stated, basis-stated prospects; Risked Reserves Valuation kept Pg; `.pld` carries `rcp_prospects`. Verified: PETRO-U1-001 holds (gross thickness with its NTG; new volumetric test), MAP-U1-029 holds (US-feet row equals the metre frame within 1%). |
| PL10 Real scale | Failed, partly fixed | 013, 030, 032 | Kriging at the default 150 x 150 took 5 to 12 s and re-ran on every keystroke in Hybrid; the grid is now reused. MC 50k: 3.0 s, 200k: 11.6 s on the main thread with no progress or cancel (worker is Step 2). |
| PL11 Inputs a person can type | Pass | none | Contacts and NumberFields keep "-", clearing and decimals (e2e key by key). |
| PL12 House standards | Pass after fixes | 019, 020 | Em dashes removed from PDF strings; `EMPTY_VALUE` in the new tables; route protected; dead PPFG/Velocity adapters already deleted (plan row 8 item superseded). |

### PL1 quantity table

| Quantity | Standard meaning | What the code computes | Same? |
|---|---|---|---|
| GRV | Rock volume of the reservoir interval above the contact (within the closure) | Grid integral of the column overlap with each fluid window x cell area; analytic: area x gross thickness | Yes; open closures now said (012) |
| NRV | GRV x NTG | Same | Yes |
| Pore volume | NRV x porosity | Same | Yes |
| HCPV | PV x (1 - Sw) per fluid leg | Gas cap and oil leg apart; a GOC below the OWC now stops at the OWC (007) | Fixed |
| STOIIP | Oil-leg HCPV / Bo (7758 bbl/acre-ft) | Same | Yes |
| GIIP | Free gas HCPV / Bg (43,560 scf/acre-ft) | Free gas only; now labelled "free gas" for oil with a gas cap; solution gas not reported (034) | Fixed label; gap open |
| Condensate | GIIP x CGR | Was unused (yield in presets only); now GIIP/1e6 x CGR, recoverable at the gas RF (017) | Fixed |
| Recoverable | In place x RF | Deterministic yes; MC had no recoverable stream (003) | Fixed |
| Prospective resources (PRMS) | Recoverable, success case, with Pg | The handoff sent in-place STOIIP (003) | Fixed |
| P90 / P50 / P10 | Exceedance percentiles of outcomes | Percentiles of each output stream, P90 low | Yes |
| Expectation curve | Probability of exceeding each volume | Was non-exceedance under that title (006) | Fixed |
| Risked mean | Pg x success-case mean | Same; portfolio now in one unit (005) | Fixed |
| Zone averages | Volumetric (net-weighted phi, pore-weighted Sw, total net / gross) | Were plain means (018) | Fixed |

### Findings

Severity: S1 wrong answer with no warning; S2 wrong or lost data, or a door that misleads; S3 workflow gap or misleading text; S4 polish.

| ID | Sev | Check | Finding | Evidence | Status |
|---|---|---|---|---|---|
| RCP-U1-001 | S1 | PL1, PL3 | Monte Carlo display units: Detailed Statistics divided GIIP (scf) by 1e6 under a "Bscf" header (1000x); metric GIIP over 1e9 read "MMsm3" in the cards, the panel, the slide and the PDF (1000x); metric STOIIP read "MMstb"; the realization tracker divided gas by 1e6. | Render test; negative control fails. | Fixed: `services/volumeDisplay.js`, one divisor and label per stream everywhere. |
| RCP-U1-002 | S1 | PL3, PL9 | Registry surfaces: XY forced to metres, so a US-feet state plane read square feet as square metres (GRV 10.8x in the probe: 297.9 against 27.5 Mm3); with feet depths the feet XY were rescaled again; TWT, isochore and attribute rows entered as depth; rotation dropped. Carried MAP-U1-033, EM-U1-024. | Saved release rows; in-test control 10.8x. | Fixed: `services/surfaceDoor.js` through `readDepthSurface`; the engine uses the row's metres per unit; refusals with reasons; the dialog shows what it read. |
| RCP-U1-003 | S1 | PL1, PL9 | Prospect Risking received STOIIP (in place) from the MC run and Risked Reserves Valuation valued it per recoverable barrel against an MEFS: 4x at RF 25%. MC had no recoverable stream. | Handoff test; control fails. | Fixed: recoverable oil, gas and boe per realization (RF may be a distribution); prospects carry `basis`; older rows flagged in the valuation; panel Basis selector. |
| RCP-U1-004 | S1 | PL9 | Risked Reserves Valuation passed Pg through the volume conversion: a gas prospect's 0.30 became 0.05, a metric one 1.89 (refused), a legacy raw-STB one 3e-7. | Probe and test. | Fixed in `rrvStore.fromRcpProspect`. |
| RCP-U1-005 | S2 | PL9 | The inventory portfolio added MMSTB, Bscf and MMsm3 as one number. | Test. | Fixed: MMboe roll-up; rows with no unit left out and counted. |
| RCP-U1-006 | S2 | PL1 | "Expectation curve" plotted non-exceedance with 90/50/10 guides, so its 90% line met the P10 volume (results view, slide, PDF). | Test reads 90% at the P90. | Fixed: probability of exceeding; titles say so. |
| RCP-U1-007 | S2 | PL1 | A GOC below the OWC booked gas under the water leg (deterministic) and overlapping MC contact ranges did it silently. | Test. | Fixed: gas stops at the OWC; MC counts and warns. |
| RCP-U1-008 | S2 | PL4 | Base-case consistency moved only the triangle mode (a 0.30 mode with max 0.24 sampled silently); the distribution set was fixed at mount, so switching method or fluid ran with the wrong set. | Test. | Fixed: `services/distributions.js` (recentre keeps shape, malformed refused, keys follow the method). |
| RCP-U1-009 | S2 | PL3, PL4 | MC results read the live unit system and fluid: a toggle after the run relabelled STB as sm3. | Test. | Fixed: runs carry `meta`; a banner says when the workspace differs. |
| RCP-U1-010 | S2 | PL2 | A Seismolord TWT export imported as depth with a toast. | Test. | Fixed: refused; depth_ft keeps XY in their CRS with depth ft. |
| RCP-U1-011 | S2 | PL3 | One unit for XY and Z: a UTM grid with feet depths could not be declared (area or depth 3.28x). | Test (control: one unit reads under half). | Fixed: separate depth unit. |
| RCP-U1-012 | S2 | PL4 | A hydrocarbon column reaching the map edge was reported as a trap volume (EM-U1-008 analogue). | Test; e2e. | Fixed: open-closure warning with the shallowest edge depth; MC counts open realizations; PDF flag. Spill-point trapping is Step 2. |
| RCP-U1-013 | S2 | PL5, PL10 | A 50k run saved about 25 MB twice into the project row (200k about 100 MB). | Probe; test. | Fixed: statistics whole, realizations thinned to 2,000 on save, said in the header. |
| RCP-U1-014 | S3 | PL1 | Analytic gas-cap fraction a constant (plan row 8). | Test. | Fixed: a distribution. |
| RCP-U1-015 | S3 | PL8 | NTG could not be uncertain (forced constant). | Test. | Fixed. |
| RCP-U1-016 | S2 | PL2 | Petrel CPS-3, ZMAP+, Irap read as 1 to 20 header numbers; headed depth-first CSV and semicolon files refused. | Probe on the hostile set. | Fixed: Mapping's `readSurfaceFile` first, RCP parser as fallback. |
| RCP-U1-017 | S3 | PL1 | Condensate yield unused (plan row 8). | Test. | Fixed: CGR input, condensate in place and recoverable, unit toggle converts. |
| RCP-U1-018 | S3 | PL1, PL9 | Zone averages were plain means; pre-PT9a total-porosity wells not named (PETRO-U2-013). | Test (a thin wet well halved Sw). | Fixed. Two RC1 tests that pinned plain means were updated. |
| RCP-U1-019 | S3 | PL7 | PDFs had no field, analyst, build, method, datum; contacts printed without unit; non-Latin-1 text. | pdftotext test. | Fixed: `services/reportInfo.js`, Report details fields. |
| RCP-U1-020 | S3 | PL4 | "Fully Validated" when a run had no warnings. | Code read. | Fixed: "No run warnings". |
| RCP-U1-021 | S3 | PL4 | Contacts editable under Simple but ignored. | Code read. | Fixed: note on the card, slide and PDF. |
| RCP-U1-022 | S3 | PL3 | A positive contact gave zero with a generic warning. | Test. | Fixed: named with "did you mean". |
| RCP-U1-023 | S3 | PL5, PL7 | Gridding (interpolation, cells) is a per-browser setting, not recorded with the result. | Test. | Fixed: stamped and printed. Storing it with the project is Step 2 (U2-013). |
| RCP-U1-024 | S4 | PL1 | GIIP for oil with a gas cap not said to be free gas. | Walk. | Fixed. |
| RCP-U1-025 | S2 | PL9 | Oil with a gas cap handed over as the oil leg only. | Test. | Fixed: MMboe. |
| RCP-U1-026 | S3 | PL9 | `rcp_prospects` in no `.pld` family (plan cross-cutting item). | Test. | Fixed: geoscience family, root, backup, manifest, export dialog. `saved_quickvol_projects` already travelled. |
| RCP-U1-027 | S3 | PL9 | A boundary layer gave its first ring only. | Test. | Fixed: one AOI per polygon, largest first. |
| RCP-U1-028 | S3 | PL4 | MC results not marked stale after input edits. | Code read. | Fixed: run signature. |
| RCP-U1-029 | S4 | PL4 | Fractions clamped at 0 or 1 silently. | Test. | Fixed: counted and warned; normal fractions truncated by rejection. |
| RCP-U1-030 | S3 | PL10 | Hybrid re-kriged 5 to 12 s on every input edit. | Spy test. | Fixed: cells cached per surface and geometry. |
| RCP-U1-031 | S3 | PL6 | `e2e/reservoircalc-pro.spec.js` RC1 had been red since #815 (preview gained the gross thickness); e2e is not in CI. | Run on origin. | Fixed (spec). Owner item 1. |
| RCP-U1-032 | S3 | PL10 | MC on the main thread, no progress or cancel (50k 3.0 s, 200k 11.6 s; UI capped at 50k). | Timing. | Open: U2-006. |
| RCP-U1-033 | S3 | PL8 | No correlation editor (only porosity-Sw at -0.8; the engine takes more). | Code read. | Open: U2-002. |
| RCP-U1-034 | S3 | PL1, PL8 | Solution gas (STOIIP x Rs) and free oil in a gas cap not reported. | Walk. | Open: U2-007. |
| RCP-U1-035 | S4 | PL11 | Sample defaults (5,000 acres) applied silently on an empty simple case. | Code read. | Open (low). |
| RCP-U1-036 | S4 | PL9 | Registry grids re-gridded from up to 5,000 points by IDW: 30% low on an 11 x 9 fixture, 2 to 3% at 41 x 41 (kriging 0.1%). | Probe. | Open: U2-005 (sample the registry lattice directly). |
| RCP-U1-037 | S4 | PL9 | A saved project's surface `registryId` and AOI source ids are not soft refs in `.pld` (points travel embedded; only launchers dangle). | Code read. | Open (low). |
| RCP-U1-038 | S3 | PL8 | Earth Modeling U2-009 prospect contract is on `feat/em-u2`, not main. | Branch read. | Carried: consume it once merged (U2-004). |
| RCP-U1-039 | S4 | PL6 | 390 wide keeps the desktop layout inside the shell. | Screenshot. | Kept (WDM decision). |

Totals: 39 findings. Fixed 31 (4 S1, 11 S2, 14 S3, 2 S4; 001 to 031), open 6 (032 to 037: 3 S3, 3 S4), carried 1 (038), kept 1 (039). No S1 or S2 open.

### Persona walks (PL8)

**1. Reserves engineer from GeoX / REP.** Builds a prospect from a Mapping top on the client's state plane. *Before:* GRV 10.8x, the run's GIIP table 1000x, Prospect Risking filled with in-place STOIIP, the valuation 4x high and, for gas, Pg divided by 6. *Now:* metre-correct GRV, units per stream, recoverable volumes with their basis, Pg intact. Would now: an area-depth table input (REP's main GRV route, U2-001), correlation editor (U2-002), segment and dependency aggregation (U2-003), spill-point trapping (U2-008), play-level chance (U2-010).

**2. Geologist.** Imports a Petrel CPS-3 (*before*: 20 header numbers), then a Kingdom TWT horizon (*now* refused if declared time; a ZMAP+ with no header domain still needs the user to know), types the OWC as 1550 (*now* told "did you mean -1550"), draws the contact past the spill (*now* "open closure"). Would now: the Mapping map kit for the 2D view (U2-009), contacts per segment (U2-003).

**3. Asset manager.** Opens the PDF. *Now:* field, analyst, build, units, method, contacts with datum, gridding, MC basis, open-closure flag. Would now: a one-page prospect summary with risked and unrisked side by side (U2-011), economics from the canonical NPV module (U2-012).

## Step 2: advancement review (analysis only)

### 2a. Competitor parity

Sources: [GeoX play and prospect assessment](https://www.software.slb.com/products/geox/geox-software-play-and-prospect-assessment), [GeoX opportunity assessor](https://www.slb.com/products-and-services/delivering-digital-at-scale/software/geox), [REP (LogiCom)](https://www.logicomep.com/products/rep/), [Rose RoseRA](https://www.roseassoc.com/rosera-prospect-risk-assessment/), [Petrel screening volumetrics (AAPG Explorer)](https://explorer.aapg.org/story/articleid/49263/screening-volumetrics-in-petrel-for-quick-resource-evaluations), [Petrel volumetric uncertainty (EarthDoc)](https://www.earthdoc.org/content/papers/10.3997/2214-4609.20149688), Crystal Ball user documentation (Oracle). Rows rest on public product pages and papers, not on the manuals.

| Capability | Leader and how | Ours | Gap | Demo-visible |
|---|---|---|---|---|
| GRV input | REP: one distribution, area x depth x shape factor, or an area/depth table with contact and spill uncertainty; GeoX depth-dependent alternatives | Area x thickness, or grid integration of a surface against sampled contacts (hypsometry) | partial (no area/depth table entry, no shape factor) | yes |
| Fluids | GeoX advanced fluid modelling, saturation height, multiple phases; Petrel Bo, Bg, Rs, Rv | Bo, Bg, gas cap, CGR (now) | partial (no Rs/Rv, no saturation height) | yes |
| Distributions | REP and Crystal Ball: every factor incl. RF; truncation; fitting | All factors incl. NTG, RF, gas cap (now); truncation by rejection | partial (no fitting from data) | no |
| Correlation | Crystal Ball correlation matrix; REP dependencies | Gaussian copula, porosity-Sw fixed; engine accepts more | partial (no UI) | yes |
| Sensitivity | Tornado and spider (REP); Crystal Ball sensitivity chart | Symmetric tornado, variance share | partial (no spider) | yes |
| Segments and zones | Petrel contacts by zone or segment; GeoX segments with risk dependencies; RoseRA multi-zone with chance dependencies | One reservoir per case; several cases per project, not aggregated | missing | yes |
| Risking | GeoX shared play and local risk; RoseRA cards | Four factors and other, Pg product | partial (no play/prospect split, no dependency) | yes |
| Aggregation | GeoX probabilistic aggregation; Rose portfolio | Sum of means in MMboe (now), independent | partial (no MC over the portfolio) | yes |
| Reports | Petrel area/volume vs depth functions and reports; REP reality plots | PDF with reviewer block, slides, volume against contact curve | partial (no area-depth table export) | yes |
| Economics | GeoX value assessment; Rose cash flow | Risked Reserves Valuation with NPV per barrel | partial | yes |
| Integration | Petrel one project | Registry surfaces, zones, polygons, prospects to valuation, `.pld` | ahead in principle | yes |

### 2b. Deferred backlog harvest

| Item | Source | Decision |
|---|---|---|
| E2 shared Mapping map kit (`mapPainter`) | T1, plan row 8 | Still wanted (U2-009) |
| Gas-cap fraction as a distribution | STATUS, plan row 8 | Done (014) |
| Condensate yield unused | STATUS, plan row 8 | Done (017) |
| PPFG/Velocity adapters waiting on shared_data_registry | STATUS, memory | Superseded: already deleted; shared_data_registry retired |
| `rcp_*` not in `.pld` | Plan section 3 | Done (026) |
| Min-curvature gridding, DB-persisted grids | memory | Superseded by U2-005 (read the registry lattice) |
| Simple-method 3D box schematic | memory | Dropped (low value) |
| Live multi-user sharing | memory | Still wanted, schema and RLS (U2-014, owner) |
| Staging tester walk | ROADMAP | Still wanted (owner or tester) |

### 2c. Suite integration

Reads: geo_surfaces (through `readDepthSurface` now), Seismolord legacy exports, geo_wells zones (Petrophysics publish), geo_culture boundaries, the unit profile. Writes: saved_quickvol_projects, rcp_prospects. Deep links: in `?surface=`; out to Mapping, Earth Modeling, Well Data Manager, Risked Reserves Valuation. `.pld`: saved projects (apps family) and prospects (geoscience family).

| Finding | Kind | Detail |
|---|---|---|
| Earth Modeling model as a prospect | upstream not yet consumed | EM U2-009 (`src/lib/earthModelProspect.js`, schema `em-prospect/1`, on `feat/em-u2`) writes a payload and opens RCP with `?emProspect=&zone=`; its two-line mount in RCP's ExpertInputPanel sets simple-method inputs that reproduce the model's volumes. Once merged: show the model's open-edge flags and contacts, and carry the model id as provenance (U2-004). |
| Mapping GRV distribution | upstream ignored | MAP-U2-010 (deferred) would give a stochastic GRV; RCP could take it as a GRV distribution (U2-001 area/depth table first). |
| Registry lattice | handoff loses precision | Points thinned to 5,000 and re-gridded (036); read the lattice (U2-005). |
| SCAL saturation height | upstream ignored | Petrophysics U2-010 inverts J(Sw); Sw above the FWL per cell (U2-007). |
| Economics | downstream | Risked Reserves Valuation uses a typed NPV per barrel; the canonical NPV module (`npvCalculations.js` / epe cash flow) could value the success case (U2-012). No new NPV code. |
| Seismolord legacy exports | upstream | Seismolord U1 publishes to geo_surfaces; the legacy export list can be retired after one release (U2-015). |

### Ranked backlog

Sizes: S under a day, M two to four days, L a week or more.

| Rank | ID | Item | Size | Value in one line | Batch |
|---|---|---|---|---|---|
| 1 | U2-001 | Area/depth (hypsometry) table as a GRV input and export, with contact and spill uncertainty | M | REP's main GRV route; the table a reviewer checks | A |
| 2 | U2-002 | Correlation editor (pairs, matrix, positive-definite check) on the existing copula | S | Crystal Ball and REP parity on dependencies | A |
| 3 | U2-004 | Consume the Earth Modeling prospect contract (flags, contacts, provenance) once merged | S | Model to volumes in one click, honestly labelled | A |
| 4 | U2-005 | Registry grids sampled directly (bilinear on the lattice) instead of thinned and re-gridded | M | Mapping and RCP give the same GRV | A |
| 5 | U2-006 | Monte Carlo in a Web Worker with progress and cancel; 100k and 250k options | M | No frozen page at real N | A |
| 6 | U2-008 | Closure-aware leg: spill point from Mapping's closure engine bounds the column | M | A trap volume, not a frame volume | A |
| 7 | U2-003 | Segments or zones within a case with per-segment contacts, aggregated with dependencies | L | GeoX / Petrel segment volumes | B |
| 8 | U2-007 | Solution gas (Rs) and free oil (Rv); Sw from saturation height above the FWL | M | Complete hydrocarbon accounting | B |
| 9 | U2-009 | Shared Mapping map kit (mapPainter) for the 2D view (E2) | M | One map look across the Suite | B |
| 10 | U2-011 | One-page prospect summary PDF (risked and unrisked, Pg factors, reviewer block) | S | The sheet a committee signs | B |
| 11 | U2-012 | Success-case value through the canonical NPV module into Risked Reserves Valuation | M | Value per barrel from economics, not typed | B |
| 12 | U2-013 | Gridding settings saved with the project (not per browser) | S | Same project, same volume anywhere | B |
| 13 | U2-010 | Play and prospect chance split with shared risk across prospects | M | GeoX and Rose risking structure | C |
| 14 | U2-014 | Org-shared projects and prospects (RLS, second engineer) | M | Team assessment | C (owner) |
| 15 | U2-015 | Retire the Seismolord legacy export list | S | One surface door | C |
| 16 | U2-016 | Portfolio Monte Carlo with dependencies (P90/P10 of a campaign) | L | Aggregation parity | C |
| 17 | U2-017 | Spider plot and distribution fitting from well data | M | REP and Crystal Ball parity | C |

Batches:
- **Batch A** (demo-visible, NAPE-safe, no schema change): U2-001, U2-002, U2-004 (after EM U2 merges), U2-005, U2-006, U2-008.
- **Batch B:** U2-003, U2-007, U2-009, U2-011, U2-012, U2-013.
- **Batch C:** U2-010, U2-014 (owner, migration), U2-015, U2-016, U2-017.

### Owner items

1. Playwright e2e is not in CI: RCP's RC1 e2e was red since #815 unnoticed (RCP-U1-031), as the EM spec was (EM-U1-014).
2. Earth Modeling U2 adds a two-line mount to RCP's ExpertInputPanel; whichever merges second resolves it (no overlap with U1's lines).
3. Saved prospects from before U1 carry in-place volumes; the valuation now flags them. Owners should re-run and re-add them.
4. U2-014 needs a migration and a second engineer.

## Batch decision (programme lead, 2026-10-01)

Recorded verbatim:

> BUILD in order, one commit per item:
> - Batch A: U2-006 Monte Carlo in a worker with progress and cancel (same statistics as before for a fixed seed; the canonical engine moves into the worker, it is not reimplemented); U2-005 sample the registry lattice directly (fixes RCP-U1-036: validate GRV against Mapping's own GRV on the same surface to within 0.1 percent; negative control with the old IDW path); U2-001 area/depth GRV table (validate against an analytic cone and against Mapping's contactVolumes); U2-008 spill-aware hydrocarbon leg (reuse Mapping's closure/spill helpers); U2-002 correlation editor (positive semidefinite check, honest refusal, applied in the canonical engine's correlation path); U2-004 LAST: consume Earth Modeling's prospect contract (`src/lib/earthModelProspect.js`, from Earth Modeling U2-009 on feat/em-u2): if it has merged to main when you reach this item, wire it and resolve the ExpertInputPanel mount; if not, skip it and say so (Earth Modeling's PR will then own the mount).
> - Batch B: U2-007 solution gas (Rs), Rv and saturation height (reuse Petrophysics saturationHeight.js); U2-009 the shared Mapping map kit in RCP; U2-011 one-page prospect PDF with a reviewer header, read back with pdftotext; U2-012 economics through the canonical NPV (calculateEconomics or the EPE cash-flow engine; no new NPV code); U2-013 gridding settings saved with the project.
> - Batch C: U2-015 retire the Seismolord legacy exports (only if nothing still reads them; prove it with a search and the suites); U2-017 spider plot and distribution fitting (fitting validated against known samples, negative control).
> DEFERRED (record reasons): U2-003 segments with dependencies (L, after NAPE); U2-010 play/prospect chance split; U2-014 org sharing (migration + second engineer); U2-016 portfolio Monte Carlo (L).
> Owner item 3 (prospects saved before U1 hold in-place volumes and are flagged): add a one-click "Re-run this prospect" in Risked Reserves for flagged prospects if it is S-sized; otherwise record it.

Built on branch `feat/rcp-u2`, one commit per item.

## Step 2 build (2026-10-01)

| Item | State | Proving test | Notes |
|---|---|---|---|
| U2-006 | Done | `__tests__/upgradeU2Worker.test.js` (8): a seeded run through the worker's own message handler gives the same realizations and statistics as the page engine on the same random stream (and, checked once by hand, as the engine on origin/main with `Math.random` on that stream: identical `stats`); the handler calls `MonteCarloEngine.simulate` (spy); a structural run crosses the boundary as a table and gives the same GRV per realization (negative control: the config with the hypsometry's functions cannot be cloned); progress in order; Cancel terminates the worker and rejects; no Worker falls back to the page with the same numbers. e2e `reservoircalc-pro-u2.spec.js`: a 250k run shows progress and is cancelled, then a 10k run says "seed 123, background worker" | `MonteCarloEngine.simulate` is the old `runSimulation` body, unchanged in its arithmetic, with an injectable random stream; `runSimulation` keeps its API. `services/hypsometry.js` (the model as a table), `mcWorkerProtocol.js`, `workers/monteCarlo.worker.js`, `mcWorkerFactory.js` (imported lazily so jest needs no mapper), `mcClient.js`. Options 100k and 250k added; every run is seeded and records its seed (panel, PDF, audit trail). Timing on this box: 250k in about 10 s with the page live. Found in the browser: the run set "calculating" and then cleared it (SET_ERROR order), invisible while the run was synchronous; fixed. Closes RCP-U1-032. |
