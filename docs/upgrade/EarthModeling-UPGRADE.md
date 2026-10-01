# Earth Modeling: comprehensive upgrade

App #7 of the Geoscience upgrade programme (`docs/scope/AppUpgrade-Geoscience-PLAN.md`).
Step 1 (practitioner lens, `docs/scope/AppUpgrade-BestPractices.md`) was run and
fixed on 2026-09-30 on branch `feat/em-u1`. Step 2 (advancement review) is
analysis only; batches are chosen before anything is built.

- Route: `/dashboard/apps/geoscience/earth-modeling` (ProtectedAppRoute), help at `.../help`.
- Harness: `/dev/earth-modeling` (in-memory backend, the oracle fixture). New for this upgrade: `?saved=1` lists one saved model per release (`services/savedFixtures.js`).
- The T1 cycle (`docs/testing/EarthModeling-T1.md`) was closed on 2026-09-26. Its fixes still hold: the 16 existing e2e tests are green (after EM-U1-014).
- Carried in from Mapping (MAP-U1-030 to 032) and the programme plan (row 7): the shared surface door, `em_models` in `.pld`, stale "EarthModel Pro" wording, Seismolord fault sticks, Sw from a saturation-height function.

## Evidence kit made for this app

| Kit | Where | What it holds |
|---|---|---|
| Hostile surfaces (PL2, PL3) | `__tests__/upgradeU1.test.js` | The oracle fixture re-expressed on a feet frame (XY and z in ft, wells in ft); a TWT row, a porosity attribute row, an isochore in ft; two stacked rows in different XY units; a rotated top; wells and a fault polygon in another CRS (`upgradeU1Saved.test.jsx`) |
| Saved state (PL5) | `services/savedFixtures.js` (+ `?saved=1`) | One em_models definition per release: G8 (vertices as `{x, y}`, legacy simple kriging, no frame), EM0 to EM6 (derived horizon, boundary, adjustment, fitted kriging), T1 (both contacts in one `unit`, ft), U1 (per-field units, Bg in RB/Mscf, gas zone) |
| Services (PL1 to PL5, PL9, PL10) | `upgradeU1.test.js` (15), `upgradeU1Saved.test.jsx` (10), `propertyKriging.test.js` (+4), `volumesCsv.test.js` (+1); `src/lib/portability/__tests__/earthModelFamily.test.js` (3); `well-planning/__tests__/targetFromSurface.test.js` (4); `src/utils/__tests__/simS4Import.test.js` (+2, fixture corrected) | Every test calls the shipped function; numeric fixes carry a negative control |
| Browser (PL3 to PL7) | `e2e/earth-modeling-upgrade.spec.js` (9) | Every saved release loads and builds; contacts and Bg read back; gas zone and open leg said in QC; the CSV reviewer header read back from the download; 1366x768, 1440x900 and 390 wide, light and dark: the map has ink, no sideways page scroll, no page errors |

## Step 1: the twelve checks

| Check | Result | Findings | Notes |
|---|---|---|---|
| PL1 Labels mean the textbook | Pass after fixes | 007, 017 | Quantity table below. GIIP counted free gas only and a gas zone read GIIP 0. |
| PL2 Hostile inputs | Failed, fixed | 002, 004, 012 | Time, attribute and isochore rows entered the stack as depth; a rotated top misplaced properties and blocks; multi-polygon fault rows kept their first ring. |
| PL3 Units, datums and frames | Failed, fixed | 001 (S1), 002, 003, 006, 007 | On a feet frame GRV to HCPV were 10.76x; typed metres (cell, radius, range) were used as feet; survey offsets in metres were added to feet wellheads; VE was 3.28x off. Bg typed in RB/Mscf (the field profile unit) was read as rm3/sm3. Unit profile adoption (#830) verified: depth and the volume set start from the profile; Bg now does too. |
| PL4 No claim without the event | Failed, fixed | 008, 009, 016 | Volumes of a leg open to the frame edge read as a trap volume. Save inserted a new row every time. The no-OWC warning vanished when only Bo was typed. |
| PL5 Real saved state | Pass after hardening | 010 | All four release rows open and build (jest and e2e); `upgradeDefinition` normalises old shapes, idempotent. |
| PL6 Real browser | Pass | 014, 023 | Three viewports, two themes: ink, no page scroll. 390 wide keeps the desktop layout inside the shell (the WDM decision). The existing EM e2e had been red since #830 (the profile opens on field volumes); fixed. |
| PL7 Report a reviewer can sign | Failed, partly fixed | 011, 021 | The CSV now carries field, analyst, date, build, depth reference, XY unit, contacts and FVFs as used, open and held flags, door notes. A PDF report is Step 2 (U2-003). |
| PL8 Practitioner's day | Gaps recorded | 019, 020, 021 | Persona walks below. |
| PL9 The chain | Failed, fixed; carried | 003, 012, 013, 024, MAP-U1-031, MAP-U1-032 | Mapping and Seismolord surfaces now enter through `readDepthSurface`. Published layers carry CRS, XY unit and depth reference. `.pld` carries em_models with the surfaces and polygons they name. Petrophysics zone properties (PETRO-U2-013 total-porosity flag) hold. Downstream: RCP's import dialog forces xyUnit m (MAP-U1-033, carried to #8). Side fixes: Well Design targets and Simulation structure import route through the door. |
| PL10 Real scale | Failed, partly fixed | 015, 022 | 401 x 401 nodes (10 x 10 km at 25 m), three surfaces, two zones: constant and trend 2 s; ordinary kriging took 202 s (50 wells) and 293 s (200 wells) on the main thread. Grouped systems: 26 s and 32 s. A worker with progress and cancel is Step 2 (U2-004). |
| PL11 Inputs a person can type | Pass | none | Contacts and FVFs are text; cell, radius and variogram fields keep clearing and decimals (React number inputs). |
| PL12 House standards | Pass after fix | 025 | No em dashes in UI strings (help test guards it); `EMPTY_VALUE` in the tables; route protected; canvases follow the Seismolord rule (dark ground in both themes). The "EarthModel Pro" help content and `formatForEarthModelPro` were already gone; one stale comment fixed. |

### PL1 quantity table

| Quantity | Standard meaning | What the code computes | Same? |
|---|---|---|---|
| Zone | Interval between two consecutive framework horizons | Clamped stack i to i+1 | Yes |
| Segment / fault block | Area bounded by fault polygons | `labelBlocks` census; block 0 outside every polygon | Yes (vertical polygons only, 019) |
| GRV (Bulk) | Rock volume between top and base (above the contact for the trap) | Thickness x cell area; per block and total. Now metres on any frame (001) | Yes, labelled "Bulk" with the GRV definition in its tooltip |
| NRV (Net) | GRV x NTG | Same | Yes |
| PV (Pore) | NRV x porosity (effective after PT9a) | Same; pre-PT9a PHIT flagged (PETRO-U2-013) | Yes |
| HCPV | PV x (1 - Sw) above the contact, reservoir conditions | Split at GOC and OWC; without an OWC the whole zone (amber) | Yes |
| STOIIP | Oil-leg HCPV / Bo | Same, Bo in rb/stb | Yes |
| GIIP | Gas HCPV / Bg (free gas); solution gas separately | Gas-cap HCPV / Bg. Now labelled "free gas"; Bg converted from its unit (007); a gas zone (Bg, no Bo, no GOC) counts gas to the contact | Fixed |
| Property range P90/P50/P10 | Exceedance percentiles of outcomes | Fully correlated kriging-variance shift, labelled so | Yes (as labelled) |
| Tie residual | Pick TVDSS minus surface | Same, metres, now with the survey on a feet frame placed right (001) | Yes |

### Findings

Severity: S1 wrong answer with no warning; S2 wrong or lost data, or a door that misleads; S3 workflow gap or misleading text; S4 polish.

| ID | Sev | Check | Finding | Evidence | Status |
|---|---|---|---|---|---|
| EM-U1-001 | S1 | PL3 | On a feet or US-feet frame the volume engine multiplied `dx·dy` in ft² as m²: GRV, NRV, PV, HCPV, STOIIP and GIIP 10.76x. The dock's metre cell, adjustment radius and variogram range were used as feet; minimum-curvature offsets (metres) were added to feet wellheads; the section and 3D exaggeration compared feet with metres; the status said "m". | Negative control: the feet fixture gave 9.76 relative error. | Fixed: the engine runs on a metre frame (`specM`, wells and polygons scaled at the door); `spec` stays native for the map, section and publish; `xyToM` drives the section and 3D. Volumes, ties and census equal the metre frame (1e-4, 0.01 m). |
| EM-U1-002 | S2 | PL2, PL3 | Stacked rows were read by `surfaceZToDepthDown` with no domain check: a TWT row, an MD/porosity attribute or an isochore entered as depth (an isochore in ft as metres). | Test on origin: none refused. | Fixed: every row goes through `readDepthSurface` (accept elevation, as depth); derived-horizon isochores through the isochore door; refusals name the row and the way out; mixed XY units refused. |
| EM-U1-003 | S2 | PL3, PL9 | Published layers had no CRS or XY unit (amber "no CRS" everywhere downstream), no depth reference, attributes with no unit. | Code read. | Fixed: `publishPayload` (crs, xyUnit, `depth_ref: tvdss`, fraction units). |
| EM-U1-004 | S2 | PL2 | A rotated top (Petrel/Irap lattice) became the model frame with its rotation, while property population, fault blocks and the painters assume an unrotated lattice. | Code read. | Fixed: `modelFrame` takes the axis-aligned extent at the smaller cell; the stack resamples honouring rotation; a note says so. |
| EM-U1-005 | S2 | PL4, PL1 | Trend and kriging extrapolated past the wells gave Sw above 1 or porosity below 0, so HCPV cells went negative. | Test: steep Sw trend. | Fixed: fractions held to 0..1, counted in the status, QC Build notes and CSV. |
| EM-U1-006 | S2 | PL3 | Both contacts of a zone shared one `unit`, rewritten on each keystroke: a GOC typed in ft read as metres after the OWC was typed in m. A negative contact (Mapping's elevation sign) put the contact above the zone. | Test. | Fixed: per-field units (`gocUnit`, `owcUnit`, legacy `unit` still read); a negative value read as elevation with a note; the dock shows how each value was read. |
| EM-U1-007 | S2 | PL3, PL1 | Bg had no unit at the input (tooltip only); a field user typing 0.8 RB/Mscf got GIIP 178x low. Bg with no GOC booked the whole zone as oil (GIIP 0). | Test. | Fixed: Bg unit selector from the profile's fvfGas unit (rm3/sm3, rcf/scf, RB/Mscf), converted with the unit registry; Bg with no Bo and no GOC makes a gas zone. |
| EM-U1-008 | S2 | PL4 | A hydrocarbon leg that reaches the frame or boundary edge (no closure inside the model) was reported as a volume with no warning. | Test: OWC 1700 m on the fixture. | Fixed: `contactEdgeReport`; amber line in QC, status and CSV. Spill-aware trapping is Step 2 (U2-006). |
| EM-U1-009 | S3 | PL4 | "Save model definition" inserted a new row every time; loaded models could not be updated. | jsdom test. | Fixed: Save overwrites the open model; "Save as a new model" copies. |
| EM-U1-010 | S3 | PL5 | Saved rows from earlier releases relied on optional chaining in scattered places; G8 vertex objects and missing arrays were not normalised. | Saved fixtures. | Fixed: `upgradeDefinition` on load (idempotent; the row is not rewritten until saved). |
| EM-U1-011 | S3 | PL7 | The volumes CSV had no field, analyst, date, build, depth reference or the contacts used. | Test. | Fixed: reviewer header (Latin-1), field and analyst in the dock. |
| EM-U1-012 | S2 | PL9 | Fault polygon rows from Mapping (U2-004 imports many faults per row) contributed their first ring only; boundaries likewise; polygons carried no CRS. | Test (three rings). | Fixed: every ring (fault rows split into `id`, `id#2`...; boundaries as a union); polygons and wells in another known CRS refused or left out, said. |
| EM-U1-013 | S2 | PL9, PL5 | `em_models` was in no `.pld` family: packages and backups dropped every earth model (plan cross-cutting item). | Test. | Fixed: geoscience family table and `em_model` root, hook collecting the named surfaces and polygons, id rewrite on import, backup kind, export dialog section, manifest schema enum. |
| EM-U1-014 | S3 | PL6 | `e2e/earth-modeling.spec.js` had been red since #830: the profile opens on field volumes and three oracle assertions read acre-ft. Not in CI (Playwright is not a CI job). | Run on origin/main: fails. | Fixed: the spec picks metric. |
| EM-U1-015 | S2 | PL10 | Ordinary kriging at 401 x 401 froze the page for 3 to 5 minutes. | Timings above. | Partly fixed: `krigeTargetsGrouped` (one system per nearest-well set; equals the engine to 1e-9, negative control) is 8 to 9x faster. The worker is U2-004. |
| EM-U1-016 | S3 | PL4 | The no-OWC warning showed only when no fluid value at all was typed. | Code read. | Fixed: keyed on the OWC. |
| EM-U1-017 | S4 | PL1 | Volume headers without definitions; GIIP not said to be free gas. | Walk. | Fixed: tooltips and label. |
| EM-U1-018 | S4 | PL7 | Door notes (no CRS, positive elevations) had nowhere to go. | Walk. | Fixed: QC Build notes card. |
| EM-U1-019 | S3 | PL8 | Faults are vertical polygons; Seismolord sticks and throws cannot be used (EM-T1-010). | T1. | Open: Step 2 U2-001. |
| EM-U1-020 | S3 | PL8 | Sw is a zone average, not a saturation-height function above the FWL (T1 E2). | T1. | Open: Step 2 U2-002. |
| EM-U1-021 | S3 | PL7, PL8 | No PDF report; one layer per zone (no fine layering), no facies. | Walk. | Open: Step 2 U2-003, U2-007. |
| EM-U1-022 | S3 | PL10 | The build runs on the main thread with no progress or cancel; `variogramParams` is re-validated on every covariance call in the engine. | Profile. | Open: Step 2 U2-004 (engines-first hoist). |
| EM-U1-023 | S4 | PL6 | Colour-bar end labels are the data min and max (5180.4), not round. | Screenshot. | Open (low). |
| EM-U1-024 | S3 | PL9 | RCP's Surface import forces xyUnit m, so a published EM layer on a feet frame reads wrong there. | MAP-U1-033. | Carried to ReservoirCalc Pro (#8). |
| EM-U1-025 | S4 | PL12 | One stale "EarthModel Pro" comment (GeoscienceAnalytics). The help-centre content and `formatForEarthModelPro` named in the plan are already gone. | grep. | Fixed. |
| EM-U1-026 | S3 | PL9 | A model's `.pld` does not carry the wells whose zone properties populate it (the definition names zones by name, not wells). | Code read. | Open: noted in the family spec; export the wells too. Step 2 U2-009 records the wells used. |

Cross-app fixes in this PR (same door):
- **MAP-U1-031 Well Design** `TargetFromRegistryDialog.jsx`: `targetDepthFromSurface` reads through `readDepthSurface`; feet elevations become metres TVDSS (before: 8,202 ft stored as 8,202 m), attribute and isochore rows are no longer listed or accepted, rotation honoured, the typed E/N labelled in the surface's XY unit, CRS kept in the provenance.
- **MAP-U1-032 Simulation** `simStructureImport.js`: every registry elevation row threw "looks like elevation"; ftUS was read as metres. Now through the door (metres depth, metre frame); the S4 test fixture itself pinned the old positive-down convention and was corrected; 9 of 18 sim tests fail on the old import. `StructureCard` lists depth structures only.

Totals: 26 findings. Fixed 18 (1 S1, 9 S2, 5 S3, 3 S4), partly fixed 1 (015, S2: 9x faster, the worker is open), open 6 (019 to 023 and 026; S3 and S4), carried 1 (024). No S1 open; the one S2 left partly open is PL10 (U2-004, Batch A).

### Persona walks (PL8)

**1. Petrel / SKUA modeller (brings a US state-plane project, faults from Seismolord).**
Stacks three Mapping horizons in EPSG:2274. *Before*: GRV 10.8x, deviated ties 3.28x too close to the wellhead, a "25 m" cell that was 25 ft. *Now*: the metre answer, the status names both cells. Adds the fault file imported in Mapping: *before* one fault of five; *now* five. Would now: sloping faults from sticks with throw (U2-001), layering inside zones and upscaled logs (U2-007), a corner-point grid for simulation (U2-011).

**2. Graduate geologist (first model, tops from Well Correlation, field units profile).**
Types the OWC in ft, switches to m to type the GOC: *before* the OWC silently became metres; *now* each value keeps its unit and the dock prints how it read them. Types Bg 0.8 as the textbook gives (RB/Mscf): *before* GIIP 178x low; *now* converted. Leaves the OWC deep: *now* told the leg reaches the model edge. Would now: a PDF report to hand in (U2-003), help on choosing a variogram.

**3. Reserves engineer (reads the volumes).**
Opens the CSV: *now* field, analyst, date, build, datum, contacts and FVFs as used and any open-edge flag. Would now: per-block contacts (U2-005, the engine already takes them), a volume distribution from the canonical Monte Carlo (U2-010), the model handed to ReservoirCalc Pro as a prospect with its zones rather than one surface (U2-009), Sw from saturation height (U2-002).

## Step 2: advancement review (analysis only)

### 2a. Competitor parity

Sources: [Petrel structural modeling (petrofaq)](https://petrofaq.net/wiki/Fault_Modeling_in_Petrel), [Petrel structural modeling guide](https://www.scribd.com/document/408120863/PETREL-1-Structural-Modeling-pdf), [SKUA-GOCAD brochure](https://www.geoforce.com.tw/pdf/SKUA-GOCAD_2019.pdf), [UVT transform](https://www.researchgate.net/publication/291860750_The_need_for_a_correct_geological_modelling_support_The_advent_of_the_UVT-transform), [Aspen RMS](https://www.aspentech.com/en/products/sse/aspen-rms), [RMS structural uncertainty course](https://esupport.aspentech.com/T_course?id=a3p4P000000VmyjQAC), [JewelSuite Subsurface Modeling](https://www.bakerhughes.com/oilfield-services-and-equipment-digital/well-planning/jewelsuite-subsurface-modeling). Rows rest on public brochures and course outlines, not on product manuals.

| Capability | Leader and how | Ours | Gap | Demo-visible |
|---|---|---|---|---|
| Fault framework | Petrel key pillars from sticks; SKUA sealed implicit framework; JewelSuite gridding through complex faults | Vertical fault polygons (drawn or from Mapping) | missing (sloping faults, throw) | yes |
| Horizons in the framework | Petrel make horizons honouring faults and well tops; SKUA UVT | Registry surfaces, derived horizons, well adjustment, monotonic clamp | partial (no truncation rules, no fault throw) | yes |
| Gridding | Petrel pillar grid; SKUA geologic and flow grids; JewelSuite patented gridding | One 2D lattice per surface, one layer per zone | missing (3D cells, layering) | yes |
| Layering | Petrel proportional / follow top / follow base, cell thickness | none | missing | yes |
| Property modelling | Petrel/RMS upscaled logs, SGS, facies (SIS, object), trends, co-kriging | Constant, trend, simple and ordinary kriging per block, variance | partial (no simulation, no facies) | yes |
| Saturation | RMS / Petrel saturation-height functions above the FWL | Zone average Sw | missing (U2-002) | yes |
| Contacts | Per zone and segment; FWL | Per zone GOC/OWC; engine takes per block, UI does not | partial (U2-005) | yes |
| Volumetrics | Petrel volume calculation per zone/segment/fluid; RMS volumetrics with uncertainty | GRV to STOIIP/GIIP per zone and block, fully correlated range | partial (no distribution) | yes |
| Structural uncertainty | RMS HUM and FUM feeding volumes | none | missing (U2-012) | no |
| Report | Petrel volume reports, plots | CSV with a reviewer header; PNGs | partial (U2-003) | yes |
| Simulation handoff | Petrel/SKUA/RMS export corner-point grids | Surfaces to Simulation structure import | partial (U2-011) | no |
| Integration | One project | Registry surfaces, polygons, zones, CRS, `.pld` | ahead in principle (the Suite story) | yes |

### 2b. Deferred backlog harvest

| Item | Source | Decision |
|---|---|---|
| EM-T1-010 sloping faults / Seismolord sticks | T1, plan row 7, SEIS-U1-022 | Still wanted, first (U2-001) |
| T1 E2 Sw from saturation height | T1, plan row 7, PETRO-U2-010 | Still wanted (U2-002); Petrophysics `services/saturationHeight.js` already inverts SCAL's chain |
| `em_models` in `.pld` | Plan section 3 | Done (EM-U1-013) |
| Stale "EarthModel Pro" help, `formatForEarthModelPro` | STATUS open items, plan row 7 | Superseded: already gone; one comment fixed (EM-U1-025) |
| G8.5 3D window | STATUS | Superseded: EM6 |
| MEM chart files on mock data | STATUS G8.4 | Dropped here (Drilling MEM rebuild owns them) |
| Staging tester walk | ROADMAP close-out | Still wanted (owner or tester) |
| Org-shared models | em_models RLS owner-only | Still wanted (U2-014), migration + second engineer |

### 2c. Suite integration

Reads: geo_surfaces (through `readDepthSurface`), geo_culture (fault and boundary polygons, every ring), geo_wells with tops, zones and zone properties, logs (GR for the section), the unit profile. Writes: geo_surfaces (structure, isochore, attributes with CRS), em_models. Deep links: in `?surface=`, `?sample=1`; out to ReservoirCalc Pro and Mapping. `.pld`: em_models with named rows.

| Finding | Kind | Detail |
|---|---|---|
| Seismolord faults | upstream ignored | `seismic_faults` sticks and polygons never reach the framework. SEIS-U2-003 (branch `feat/seis-u2`, not on main 2026-09-30). Contract expected: a read-only list of faults per project `{id, name, crs, z_domain ('depth' or 'time'), sticks: [[x, y, z]...][], polygons_by_horizon?: {horizonSurfaceId: ring}}`, depth in metres positive down or TWT; EM would take polygons per horizon (sloping faults as a polygon per zone top) and throw from sticks. |
| SCAL saturation height | upstream ignored | Petrophysics U2-010 reads `saved_scal_projects` and inverts J(Sw); EM could fill Sw per node from height above the FWL (= OWC + threshold height). |
| Petrophysics HCPV and net pay maps | upstream partly used | EM populates phi, Sw, NTG from zone averages; the net-pay and HCPV sources (PETRO-U2-008) could guide NTG as a trend. |
| RCP | downstream loses context | RCP takes one surface; the zones, contacts, blocks and FVFs are rebuilt by hand (U2-009). RCP forces xyUnit m (024, #8). |
| Simulation | downstream not fed | Simulation imports one structure; the layer cake with properties could be a corner-point grid (U2-011). |
| Mapping closure | downstream/upstream | The closure and spill engine in Mapping could bound the hydrocarbon leg (U2-006). |

### Ranked backlog

Sizes: S under a day, M two to four days, L a week or more.

| Rank | ID | Item | Size | Value in one line | Batch |
|---|---|---|---|---|---|
| 1 | U2-001 | Faults from Seismolord (read-only `seismic_faults`): sticks to a fault polygon per zone top, so blocks follow a sloping fault; a named hook with the contract above if SEIS-U2-003 is not on main | M | Interpreted faults shape the model without re-digitising | A |
| 2 | U2-002 | Sw from a SCAL saturation-height function above the FWL per node (reuse Petrophysics `saturationHeight.js` and SCAL's chain), validated on the U2-010 worked example | M | The integrated-platform demo: logs, SCAL and the model agree | A |
| 3 | U2-003 | PDF model report: reviewer header, zone table, maps, section, contacts and FVFs, read back with pdftotext | M | The document a reserves reviewer signs | A |
| 4 | U2-004 | Build in a Web Worker with progress and cancel; engines-first hoist of `variogramParams` out of the covariance loop | M | No frozen page on a real-size model | A |
| 5 | U2-005 | Contacts per fault block in the dock (the engine already accepts them) | S | Segment volumes as Petrel reports them | A |
| 6 | U2-006 | Closure-aware hydrocarbon leg: Mapping's closure and spill engine bounds the leg, spill point shown | M | A trap volume, not a frame volume | A |
| 7 | U2-007 | Layering inside zones (proportional, follow top, follow base) with upscaled logs as control | L | The step every modeller takes next | B |
| 8 | U2-009 | Model to ReservoirCalc Pro as a prospect (zones, blocks, contacts, FVFs, wells used) with its units | M | One click from model to reserves | B (with RCP #8) |
| 9 | U2-010 | Volume distribution from the canonical MonteCarloEngine (contacts, FVFs, property shifts) | M | P90/P50/P10 that are percentiles of outcomes | B |
| 10 | U2-011 | Corner-point export (GRDECL: COORD, ZCORN, PORO, NTG, SWAT) to Simulation | M | Model to simulator without Petrel | B |
| 11 | U2-018 | 3D: properties on surfaces, fault planes, a fence section | M | The 3D picture a demo visitor expects | B |
| 12 | U2-008 | NTG and HCPV maps from Petrophysics as property trends | S | Uses the published net pay | B |
| 13 | U2-015 | Truncation rules (erosional, base-conformable) beside the clamp | M | Unconformities modelled, not clamped | C |
| 14 | U2-016 | Fault throw on horizons from sticks | L | Offsets across faults | C |
| 15 | U2-012 | Structural uncertainty (horizon perturbation) feeding U2-010 | L | RMS-style HUM | C |
| 16 | U2-013 | Sequential Gaussian simulation of properties (engines-first) | L | Geostatistical realisations | C |
| 17 | U2-014 | Org-shared models (migration, RLS, second engineer) | M | Team modelling | C (owner) |
| 18 | U2-017 | Isopach (TST) zones from Mapping U2-009 | S | Dipping-bed thickness | C |

Batches:
- **Batch A** (demo-visible, NAPE-safe, no schema change): U2-001 (hook if SEIS-U2-003 is not merged), U2-002, U2-003, U2-004, U2-005, U2-006.
- **Batch B:** U2-007, U2-009, U2-010, U2-011, U2-018, U2-008.
- **Batch C:** U2-015, U2-016, U2-012, U2-013, U2-014 (owner, migration), U2-017.

### Owner items

1. Playwright e2e is not in CI; the Earth Modeling spec went red with #830 unnoticed (EM-U1-014). Consider an e2e job on the harness routes.
2. U2-014 org-shared models needs a migration and a second engineer (later).

## Batch decision (programme lead, 2026-09-30)

Recorded verbatim:

> BUILD in order, one commit per item:
> - Batch A: U2-004 build in a worker with progress and cancel, plus the engines fix (variogram parameters checked once, not per covariance call), engines-first; U2-005 contacts per fault block; U2-006 hydrocarbon leg bounded by Mapping's closure and spill (reuse Mapping's helpers); U2-002 Sw from SCAL saturation-height reusing Petrophysics saturationHeight.js (validate against its published example; negative control); U2-003 PDF model report with a reviewer header, read back with pdftotext; U2-001 Seismolord faults as polygons per zone top: if Seismolord U2-003 (feat/seis-u2, in progress) has merged to main, consume its contract; otherwise build against the contract recorded in your UPGRADE doc with a clearly named hook and a test fixture, and say so.
> - Batch B: U2-009 model to ReservoirCalc Pro as a prospect (ReservoirCalc Pro is app #8 and is starting its Step 1 in /root/wt-upg-rcp right now: write the handoff through a small documented contract module, keep RCP-side edits minimal, and note them); U2-010 volume distribution through the canonical Monte Carlo module; U2-008 Petrophysics net pay and HCPV maps as property trends; U2-011 GRDECL export to Simulation (validate by re-reading it through Simulation's own importer); U2-018 3D properties and fence view.
> - Batch C: U2-017 isopach zones.
> DEFERRED (record reasons): U2-007 layering and upscaled logs (L, after NAPE); U2-015 truncation rules; U2-016 fault throw; U2-012 structural uncertainty; U2-013 SGS; U2-014 org-shared models (migration + second engineer); EM-U1-026 .pld carrying a model's wells (note for the Project programme).

Deferred, with reasons:

| Item | Reason |
|---|---|
| U2-007 layering and upscaled logs | Size L; after NAPE. The one-layer-per-zone model stays, said in the help. |
| U2-015 truncation rules | Batch C; the monotonic clamp stays the stacking rule and marks clamped nodes. |
| U2-016 fault throw | Size L; needs sticks with throw on main (Seismolord U2-003) and a horizon offset engine. |
| U2-012 structural uncertainty | Size L; U2-010 samples contacts, FVFs and property shifts first. |
| U2-013 sequential Gaussian simulation | Size L; engines-first geostatistics after NAPE. |
| U2-014 org-shared models | Needs a migration on em_models and a second engineer's review (shared-table rule). |
| EM-U1-026 `.pld` carrying a model's wells | A note for the Suite Project programme (docs/scope/SuiteProject-DESIGN.md): a model package names zones, not wells; U2-009 records the wells used in the handoff. |

## Step 2 build (2026-10-01)

Branch `feat/em-u2`. One row per item in build order; each row names the test that proves it.

| Item | State | Proving test | Notes |
|---|---|---|---|
| U2-004 | Done (engines-first) | `__tests__/upgradeU2.test.js` U2-004 (the worker build equals the inline build to the last node through an in-process worker pair with structured clones; 12 progress steps to 100%; cancel rejects and terminates; backend and build errors come back as the error; inline fallback keeps progress and cancel). Engines `earthmodel.u2.test.js` (covarianceFn equals variogramCovariance exactly; parameters read once for 1000 calls against 1000 on the old path, the negative control). e2e `earth-modeling-u2.spec.js` U2-004: the build reports `worker` in a real browser; a 1 m cell (1.1 million nodes, ordinary kriging) shows progress, the page answers clicks, Cancel stops it | Engines PR #291: `covarianceFn` checks the variogram once per system (EM-U1-022). Suite: `services/buildWorkerProtocol.js` (the worker asks the page's backend for grids by message, so every backend keeps one interface), `workers/buildModel.worker.js`, `services/emBuildWorkerFactory.js` (jest maps it to a null factory), `services/buildClient.js`; `buildModel` takes `{onProgress, signal}`. The ribbon shows a progress bar, the percentage and Cancel; the status bar names the step. |
| U2-005 | Done | `upgradeU2.test.js` U2-005: on the oracle fixture with the L-shaped fault, block 1 with its own OWC (1540 m) and the zone OWC (1580 m) for block 0 give each block the volumes of a build with that contact for the whole zone (1e-6), blocks summing to the total; negative control: one zone contact books block 1 more than 10% high. A block OWC typed in ft keeps its unit; a block GOC below the effective OWC is refused; a block with no contact while the zone has none counts its whole column; the open-edge report reads each node's own block contact | `parseFluidsInput` reads `fluidsInput[i].blocks` (`{[block]: {goc, owc, gocUnit, owcUnit}}`, block 0 outside every fault polygon); `contactGrid` gives the engine one contact per node (engines PR #291), the block's own or the zone's. Dock: "Contacts per fault block" under each zone when the model has fault polygons; the read-back line names each block's contact. QC and the CSV header list the block contacts. |
| U2-006 | Done | `upgradeU2.test.js` U2-006: a cone (1800 + 0.1 r m) meeting a monocline that shallows to the east spills through a saddle at 1933 m (x = 1333 m); an OWC at 2000 m is filled to the spill only, and the leg equals the analytic cone volume above the spill within 2%; negative control: the plain contact books the flank to the east edge more than 3x larger. An OWC above the spill keeps its contact on the dome and cuts the up-dip edge sliver (said); a cone cut by the frame spills at the edge at 1900 m and is flagged open; through `buildModel` the tick removes the open-edge flag and STOIIP drops more than 3x | `services/trapBound.js` runs Mapping's closure engine (`closuresAtContact`, `spillAnalysis`, `closureAt` from `lib/gridding/closure.js`) on the zone top: closed closures keep the contact, open ones are filled to their spill point, and nodes above the contact outside the trap hold no hydrocarbon; the result is a contact per node for the volume engine (engines PR #291). Per contact, so it composes with U2-005. Dock: "bound the leg by the closure and spill" per zone. QC and the CSV header say where each trap spills, or that it spills at the model edge (amber). |
