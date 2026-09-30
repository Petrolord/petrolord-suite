# Mapping & Surface Studio (with the Contour Map Digitizer): comprehensive upgrade

App #6 of the Geoscience upgrade programme (`docs/scope/AppUpgrade-Geoscience-PLAN.md`).
Step 1 (practitioner lens, `docs/scope/AppUpgrade-BestPractices.md`) was run and
fixed on 2026-09-30 on branch `feat/map-u1`. Step 2 (advancement review) is
analysis only. Batches are chosen before anything is built.

- Routes:
  - `/dashboard/apps/geoscience/mapping-surface-studio` (ProtectedAppRoute), help at `.../help`.
  - `/dashboard/apps/geoscience/contour-map-digitizer`. This is now in ProtectedAppRoute, on its own licence or a Mapping licence.
- Harness: `/dev/mapping-surface-studio` (in-memory backend). New for this upgrade:
  - `?scaleWells=<n>` adds n vertical wells on a 10 x 10 km dome.
  - `window.__MAP_SEED__` seeds geo_surfaces rows saved by earlier releases.
- The T1 cycle (`docs/testing/MappingSurfaceStudio-T1.md`, 18 findings plus E1 to E5) was closed on 2026-09-26. Every lens check below was run fresh.
- The T1 fixes still hold: the existing 14 e2e tests are green. They cover:
  - one-closure GRV with the open-closure warning, merged sidetracks, positive contacts read as depth, MD maps as attributes;
  - tension and map-beyond-wells, the well velocity tie, undo and restore, the kriged range, the prospect card.

## Evidence kit made for this app

| Kit | Where | What it holds |
|---|---|---|
| Hostile files (PL2) | `e2e/fixtures/map/hostile/` + `generate.mjs` | One analytic dome (crest -1500 m at 502000, 6700000) in every dialect: <br>- Petrel CPS-3 with its `->` name line and a `1E+030` null, depth positive down in m <br>- Kingdom ZMAP+ in negative TWT with -99999 nulls and a comment banner <br>- XYZ with a header row <br>- Petrel points with attributes (BEGIN/END HEADER) <br>- a semicolon file with comma decimals <br>- depth-first columns with units in the header (ft) <br>- a horizon on a rotated seismic lattice (irregular XY) <br>- Irap classic in feet on a US-survey-feet state plane (EPSG:2274) with the 9999900 null <br>- two fault polygons in one GeoJSON, a lease boundary <br>- Petrel fault polygons in ZMAP+ lines format |
| Saved state (PL5) | `e2e/fixtures/map/saved/surfaces.json` + `generate.mjs` | One geo_surfaces row per release, each with its grid: <br>- G4 Seismolord export (ft, no CRS, no display) <br>- MS2 imported CPS-3 with a CRS and a null <br>- MS5 rotated Irap <br>- MS5 digitized surface <br>- T1 re-gridded top map (display, points, tension, a kept previous grid) <br>- T1 MD attribute <br>- U1 state-plane surface in US feet |
| Services (PL1 to PL4, PL9) | `__tests__/upgradeU1.test.js`, `hostileImport.test.js`, `savedState.test.js`; `src/lib/digitizer/__tests__/georeference.test.js`; `src/components/maps/__tests__/mapPainter.test.js`; `src/components/__tests__/ProtectedAppRoute.test.jsx`; `ReservoirCalcPro/services/__tests__/registryInputs.test.js` | Every fix calls the shipped function, with a negative control where the defect was numeric. |
| Browser (PL2 to PL10) | `e2e/mapping-surface-studio-upgrade.spec.js` (13 tests) | - Every saved release opens with ink on the canvas and no page errors. <br>- The feet frame and the metre frame give one GRV. <br>- The Petrel CPS-3 imports through the dialog. <br>- A TVD map publishes as an attribute. <br>- The PNG header band is read back. <br>- 1366x768, 1440x900 and 390 wide, light and dark: ink, no sideways page scroll. <br>- 505 and 2,005 wells grid. |

## Step 1: the twelve checks

| Check | Result | Findings | Notes |
|---|---|---|---|
| PL1 Labels mean the textbook | Failed, fixed | 002, 015 | Quantity table below. A TVD top map was published as TVDSS elevation. The status called MD and TVD maps "elevation". |
| PL2 Hostile file set | Failed, fixed; two open | 003, 018, 020, 021 | 12 files. Before the fix, a Petrel CPS-3 export, any XYZ with a header, Petrel points and semicolon files were all refused as broken grids. A rotated seismic lattice is refused with the reason (021 open). Fault polygon files cannot become fault blocks (020 open). |
| PL3 Units, datums and frames at every door | Failed, fixed; one carried | 001, 019, 008, 029 to 033 | The worst finding of the check: on a US-feet frame, the GRV and area read square feet as square metres (10.76x). Cells, extents and the kriging range typed in metres were used as feet. The scale bar read feet as metres. Mixed-CRS wells were gridded together, and borehole offsets in metres were added to feet wellheads. TWT and depth surfaces keep their domains (e2e). The site datum-transform override (WDM U2-014) reaches Mapping through the overlay guard. TVDSS assumes MSL (WDM U2-007, owner). |
| PL4 No claim without the event | Pass after fixes | 011, 014, 017 | The T1 open-closure warnings hold: a contact below the map is "Not a trap volume ... only a minimum" (e2e). Fixed: <br>- the prospect card dropped the "fully correlated" caveat; <br>- the digitizer's fault lines were silently unused; <br>- Restore after a `.pld` import failed with a bare error. |
| PL5 Real saved state | Pass, one fixed | 006 | All seven release rows open, export in every format they allow and caption correctly (jest and e2e). A saved digitizer project could not be resumed (006). |
| PL6 Real browser | Pass, one open | 025 | Three viewports, light and dark: the map has ink, and the dark screen keeps a dark map ground. 390 wide keeps the desktop layout inside the shell (the WDM decision). The mask edge is still a staircase at the hull (025). |
| PL7 Report a reviewer can sign | Failed, fixed | 013, 016 | The PNG header read "structure · ft · date". It now carries three lines: source and method, values and contour interval with the CRS and XY unit, and field, analyst, date and build. The band is read back in the e2e. There is no PDF plotted to scale (Step 2). |
| PL8 Practitioner's day | Gaps recorded | 020, 021, 022, 023, 024, 026 | Three persona walks below. |
| PL9 The chain | Upstream holds; downstream defects | 029 to 034 | Upstream holds: <br>- Petrophysics U2-008: net_m and hcpv_m publish with `z_unit` m. <br>- Well Correlation U2-013: the isochore launcher opens the vertical-thickness door; its tooltip says TVD. <br>- Stratigraphy U2-011: vertical thickness, with MD wells named. <br>- Seismolord TWT horizons convert. <br>Downstream readers lose units and domain; see the 2c table. The RCP area defect (029, S1) is fixed here. The rest are carried to their apps. `.pld` carries surfaces, grids and every polygon kind, but not the re-grid archives (034). |
| PL10 Real scale | Pass | none | Gridding runs in the worker (headless Chromium, 50 m cells): <br>- 505 wells, 202 x 201 grid: 1.5 s; <br>- 2,005 wells, 205 x 204 grid: 2.9 s, with a sidetrack-style merge named. |
| PL11 Inputs a person can type | Pass after fix | 010 | Contact, cell, guide value and interval hold typed text. The digitizer cell size snapped to 50 on clearing. |
| PL12 House standards | Failed, fixed; one owner item | 004, 009, 018, 035 | - The Digitizer route was unprotected. <br>- "AI Trace" / "let our AI detect contours" described OpenCV edge tracing. <br>- Import errors carried em dashes from the vendored readers. <br>- 25 other app routes (mostly Reservoir, plus Basin) still lack ProtectedAppRoute (owner item 035). <br>- The chart standard holds: the closure curve is on white chartTheme with ChartLogo, and the map is a viewport with the logo in the export band. |

### PL1 quantity table

| Quantity on screen | Standard meaning | What the code computes | Same? |
|---|---|---|---|
| Structure map (TVDSS) | Depth of a horizon below one datum (MSL), stored as elevation, negative down | Tops through each survey and KB at the borehole (golden-tested engine), `-tvdss` | Yes |
| TVD map | Depth below each well's KB | Was published as `structure` elevation. Now an attribute, "TVD (below KB, m)" (002) | Fixed |
| MD map | Along-hole depth | Attribute since T1; now keeps `z_unit` m | Yes |
| Isochore | Vertical thickness between two surfaces | `thickness` = top minus base of two elevations; strat net maps use vertical thickness through the survey (ST U2-011) | Yes |
| Isopach | True stratigraphic thickness, perpendicular to bedding | Not computed. The word is not used in the app | n/a (Step 2 U2-009) |
| GRV | Rock volume between the top surface and a contact, inside one closure | Sum of (z minus contact) · cell area over one closure's nodes (closure engine) | Yes. The cell area now uses the frame's XY unit (001) |
| Closure / mapped area | Area inside the closing contour at the contact | Nodes above the contact inside the closure · cell area. "Open" when the closure touches the map edge or the null mask | Yes (T1 holds) |
| Spill point | Deepest closing contour, where the trap leaks | `spillAnalysis` saddle or the map edge (named) | Yes |
| Contact | GOC/OWC or free water level | One contact per read-out, typed as elevation or depth | Partial: no separate GOC and OWC (024) |
| P90/P50/P10 GRV | Exceedance percentiles of GRV outcomes | z ∓ 1.2816 σ(kriging) with every node moving together | Labelled "fully correlated" in the read-out and now on the prospect card (014). A stochastic distribution is Step 2 (023) |
| Minimum curvature | Briggs biharmonic surface | The thin-plate spline is its continuous form (Sandwell 1987; T1 reframing) | Yes by method. Named "thin-plate spline" |
| Spline in tension | Wessel and Bercovici Green's function | `tensionSpline.js` (engines #259 oracle) | Yes |
| Ordinary kriging | BLUE with a fitted variogram | `kriging.js` (engines #138 oracle); the range is now converted from metres to map units (001) | Yes |
| Scale bar | Metres on the ground | Now metres on any frame (001) | Fixed |

### Findings

Severity:
- S1: wrong answer with no warning.
- S2: wrong or lost data, or a door that misleads.
- S3: workflow gap or misleading text.
- S4: polish.

| ID | Sev | Check | Finding | Evidence | Status |
|---|---|---|---|---|---|
| MAP-U1-001 | S1 | PL3 | On a US-survey-feet (or feet) frame, Quick GRV and its curve measured `dx·dy` in square feet and reported square metres, so the GRV and area were 10.76x. The cell size, map-beyond distance and kriging range typed in metres were used as feet. The scale bar read feet as metres. | Negative control in `upgradeU1.test.js` (10.76x). The hostile Irap in EPSG:2274 against the metric CPS-3. | Fixed: `xyUnits.js`. quickGrv takes `xyToM` and refuses a geographic frame. Cells, extent and range are converted. The scale bar uses metres. The read-out names the frame, or says "no CRS: map units taken as metres". e2e: one GRV on both frames. |
| MAP-U1-002 | S2 | PL1 | A top gridded in TVD was published as `structure` elevation. TVD is below each well's KB, so wells with different KBs disagree about one horizon, and RCP, EM, Well Design and Simulation read it as TVDSS. | Two wells, KBs 90 m apart: TVD differs by 90 m, TVDSS agrees. | Fixed: `topMapKind`. TVD is an attribute of positive metres, "(TVD below KB, m)", with `z_unit` m. e2e publishes one and reads the "attr" badge. |
| MAP-U1-003 | S2 | PL2 | The import door refused a Petrel CPS-3 export (its `->` line), any XYZ with a header row, Petrel points with attributes and semicolon files, each as a "non-numeric" error. Columns in another order were read as X, Y, Z. | Bare-reader negative controls in `hostileImport.test.js`. | Fixed: `surfaceFileDoor.js`. It reads these dialects, remaps columns by their header names, suggests the unit and domain the header states, and lists every change in the dialog (`map-import-notes`). |
| MAP-U1-004 | S2 | PL12 | The Contour Map Digitizer route was served to anyone signed in. | App.jsx | Fixed: ProtectedAppRoute with `['contour-map-digitizer', 'mapping-surface-studio']`. `appId` now accepts a list. |
| MAP-U1-005 | S2 | PL3 | The digitizer georeference used the first two control points only, with no rotation or shear, and ignored the third and every later point. A scan 7° off the grid put a far corner more than 300 m away with no warning. Two points in one pixel column divided by zero. | Negative control in `georeference.test.js`. | Fixed: a least-squares affine through every point, with per-point misfit, RMS, rotation and scale shown. Collinear or blank points are refused. Three points say there is no check. |
| MAP-U1-006 | S2 | PL5 | A saved digitizer project could not be resumed. The image was never stored, dropping the image again wiped the loaded lines and control points, the georeference had to be set again, and the value convention, unit and name were lost. | Code read. | Fixed: settings and image name and size ride in the existing `contours` jsonb (no DDL). Dropping the image keeps the work, and a size mismatch warns. The georeference is rebuilt on load. Older row shapes are read (`savedProject.js`). |
| MAP-U1-007 | S2 | PL3 | GeoJSON, DXF and CSV were written in image pixels (y down). Fault lines were dropped from GeoJSON and DXF, and every DXF vertex was at Z 0. | Code read. | Fixed: `contourExport.js` writes world coordinates, CONTOURS and FAULTS layers, Z as elevation, and a GeoJSON `crs` member. Export is refused without a georeference. |
| MAP-U1-008 | S3 | PL3 | Digitized surfaces were published with no CRS, so they showed the amber "no CRS" badge. | Code read. | Fixed: the map CRS defaults to the Project CRS, is published with the surface, and labels the cell size unit. |
| MAP-U1-009 | S3 | PL12 | "AI Trace", "AI Engine" and "let our AI detect contours" on OpenCV tracing. "3D Grid" on a summary table. | Guard test. | Fixed. |
| MAP-U1-010 | S3 | PL11 | Clearing the digitizer cell size snapped it to 50. | Code read. | Fixed: kept as typed and checked at Grid. |
| MAP-U1-011 | S3 | PL4 | Fault lines digitized on the scan were silently ignored by gridding. | Code read. | Fixed: said in the panel and the grid toast. Using them as barriers is Step 2. |
| MAP-U1-012 | S4 | PL8 | Clicks after the fourth control point did nothing, and a misplaced point could not be removed. | Code read. | Fixed: up to 12 points, each removable. |
| MAP-U1-013 | S3 | PL7 | The PNG header had no source, method, cell, contour interval, CRS/XY unit, field, analyst or build. | PNG read back. | Fixed: `mapReport.js`, three caption lines (clipped to the width). Field and analyst are kept per browser. |
| MAP-U1-014 | S3 | PL4 | The prospect card's P90/P50/P10 row dropped the "fully correlated" caveat the read-out gives. | Code read. | Fixed. |
| MAP-U1-015 | S4 | PL1 | The status called MD and TVD maps "MD elevation". | gridStatus test pinned the mislabel. | Fixed with 002. |
| MAP-U1-016 | S4 | PL7 | The export source line read "Top Top Dome". | Screenshot. | Fixed. |
| MAP-U1-017 | S3 | PL4, PL9 | Restore on a surface imported from a `.pld` failed with a bare download error. The package does not carry re-grid archives (034). | savedState test. | Fixed: the message says why. The archive gap is carried to 034. |
| MAP-U1-018 | S4 | PL12 | Import errors from the vendored readers carried em dashes. | Test. | Fixed at the door. |
| MAP-U1-019 | S2 | PL3 | Two defects in the well frame: <br>- Wells in two CRSs (UTM and state plane) were gridded together in raw coordinates. <br>- On a feet frame, borehole offsets from the survey (metres) were added to feet wellheads, placing deviated tops 3.28x too close to the wellhead. | Negative control in `upgradeU1.test.js`. | Fixed: `controlPointsInWellFrame` refuses mixed CRSs, naming them, and scales the offsets. |
| MAP-U1-020 | S3 | PL2, PL8 | A fault polygon file cannot become a fault block or boundary: <br>- Culture import has no fault_polygon or boundary kinds. <br>- Only the first ring of a multi-polygon row is used. <br>- Petrel ZMAP+ lines and Irap lines polygon files are not read. The door now names a ZMAP+ lines file. | Hostile files. | Open: Step 2 U2-004. |
| MAP-U1-021 | S3 | PL2 | Scattered XYZ points, or a horizon on a rotated seismic lattice, cannot be imported or gridded from a file. They are refused with the reason. | Hostile file. | Open: Step 2 U2-003. |
| MAP-U1-022 | S3 | PL8 | The spline in tension and kriging grid without fault blocks, and kriging maps inside the wells only. Both are stated in the status (T1 known limits). | T1 | Open: Step 2 U2-001, U2-012. |
| MAP-U1-023 | S3 | PL1 | The GRV range is one fully correlated shift of the kriging sigma; there is no GRV distribution. The read-out says so. | T1 | Open: Step 2 U2-010. |
| MAP-U1-024 | S3 | PL1, PL8 | One contact per read-out: no separate GOC and OWC, and no per-segment (fault block) volumes. | Walk. | Open: Step 2 U2-005. |
| MAP-U1-025 | S4 | PL6 | The raster edge at the hull or null mask is a cell staircase on screen and in the export. | Screenshot. | Open (low). |
| MAP-U1-026 | S3 | PL7 | No PDF plotted to scale with a title block and coordinate grid. | Walk. | Open: Step 2 U2-002. |
| MAP-U1-027 | S3 | PL8 | Digitizer: affine only (no polynomial or rubber-sheet warp), and contour values are typed line by line (no drag-assign with an increment). | Walk. | Open: Step 2 U2-006, U2-015. |
| MAP-U1-028 | S4 | PL6 | The Digitizer has no /dev harness, so its browser path is covered by jest and the theme test only. | Harness list. | Open (S). |
| MAP-U1-029 | S1 | PL9 | ReservoirCalc Pro `surfaceAreaM2` read `dx·dy` as m² whatever the surface's xy_unit (10.76x on a feet frame). | Negative control in `registryInputs.test.js`. | Fixed here (one line, S1). The rest of RCP's door is carried below. |
| MAP-U1-030 | S2 | PL9 | Earth Modeling (`modelBuild.js`) has three defects: <br>- an isochore stored in ft is used as m; <br>- time and attribute rows enter the stack as positive-down metres (no kind or domain check); <br>- `frameSpec` divides a metre cell into a feet dx, and published rows carry no CRS. | Consumer audit. | Carried to Earth Modeling (#7). |
| MAP-U1-031 | S2 | PL9 | Well Design `TargetFromRegistryDialog.jsx:112` takes `tvdss_m: Math.abs(z)` with no ft to m conversion, and accepts attribute (MD/TVD) and isochore rows as TVDSS. | Consumer audit. | Carried to Well Design (owner, drilling). |
| MAP-U1-032 | S2 | PL9 | Simulation `simStructureImport.js:104` expects positive-down depth, so it throws "looks like elevation" on every registry structure row: the feature is broken on real data. It also treats ftUS as metres. | Consumer audit. | Carried to Reservoir Simulation. |
| MAP-U1-033 | S2 | PL9 | Two defects: <br>- RCP `SurfaceImportDialog` forces xyUnit 'm', accepts TWT rows as depth and drops rotation_deg. <br>- Seismolord's reader negated every non-attribute row, including TWT. | Consumer audit. | RCP part carried to RCP (#8). The Seismolord part was fixed on main by SEIS-U1-008 (#824), merged into this branch: time rows are read as positive TWT everywhere (`surfaceTimeToPositiveMs`). |
| MAP-U1-034 | S3 | PL9 | `.pld` export carries geo_surfaces rows, their grids and every geo_culture kind, but not the `.prev-<ts>.f32` re-grid archives (no `companions`), so restore dangles after an import. | Consumer audit. | Carried to portability (Step 2 U2-017). |
| MAP-U1-035 | S3 | PL12 | 25 app routes that are not redirects still lack ProtectedAppRoute (Reservoir apps, Basin). | App.jsx count (249 app routes, 164 protected). | Owner item (Suite-wide). |

Totals:
- Fixed: 20 (2 S1, 7 S2, 7 S3, 4 S4): 001 to 019 and 029, with 015 fixed together with 002.
- Open in this app: 9 (020 to 028).
- Carried to other apps: 5 (030 to 034).
- Owner items: 1 (035).
- No S1 or S2 is open in Mapping or the Digitizer.

### Persona walks (PL8)

**1. Petrel mapping geologist (brings a CPS-3, fault polygons and a Kingdom horizon).**
1. Imports the Petrel CPS-3. *Before*, it was refused at line 6. *Now* it imports, and the dialog says it skipped the Petrel name line.
2. Imports the Kingdom ZMAP+ in negative TWT: it reads as positive time.
3. Brings the fault polygons as a GeoJSON. They land as "other culture" and cannot split the gridding, so the geologist redraws them by hand (020).
4. Brings a horizon exported as points on the survey lattice: refused, with the way out named (021).
5. Grids Top Dome in TVDSS with fault blocks: good. Switches to tension to stop overshoot: the fault blocks are dropped, and the status says so (022).
6. Would now: fault-aware tension and kriging, fault polygon files, a PDF plot at 1:25,000 (026), and a grid editor.

**2. Graduate geologist on a US client's state-plane project.**
1. Grids tops from wells in EPSG:2274 at "150 m". *Before*: 150 ft cells, deviated tops placed 3.28x too close to the wellhead, a scale bar reading feet as metres, and a GRV 10.8x too large with no warning. *Now*: 150 m cells (the status gives 492 ft in the wells' frame), the tops sit at the borehole, and the GRV matches the metric map. The read-out says the frame is in US survey feet.
2. Adds a UTM well by mistake: *now* refused, with both CRSs named.
3. Picks TVD because the tops sheet shows TVD. *Before*, it was published as a structure that RCP would read as TVDSS. *Now* it is an attribute that says "below KB".

**3. Reserves engineer consuming the GRV.**
1. Reads the prospect card. *Before*, the P90/P10 row did not say the range was one fully correlated shift. *Now* it does.
2. Exports the map for the reserves file. *Now* the header names the source, method, cell, contour interval, CRS, field, analyst, date and build.
3. Takes the surface into ReservoirCalc Pro. On a feet frame, the area was 10.76x before 029.
4. Would now: separate GOC and OWC and per-fault-block volumes (024), a real GRV distribution fed to RCP's Monte Carlo (023), and an area-depth table in the PDF.

## Step 2: advancement review (analysis only)

### 2a. Competitor parity

Sources:
- Petrel:
  - [SCA mapping course](https://scacompanies.com/courses/principles-of-mapping-with-petrel)
  - Petrel 2014.6 What's New (software.slb.com PDF)
  - [AAPG Explorer on Petrel map-based volumes](https://www.aapg.org/news-and-media/details/explorer/articleid/49263/)
- Kingdom:
  - Kingdom 2016 Geology and Geophysics brochures (cdn.ihsmarkit.com)
  - [Flex Gridding algorithm](https://onlinehelp.ihs.com/)
- Surfer:
  - [Surfer specifications sheet](https://www.goldensoftware.com/wp-content/uploads/2025/03/Golden-Software-Surfer-Specifications-Sheet.pdf)
  - surferhelp.goldensoftware.com: breaklines, gridding overview, grid menu, isopach map, digitize, georeference image, spatial transformations
- Didger:
  - [Retired products](https://www.goldensoftware.com/products/retired-products/)
  - Didger newsletter #72, "Digitizing historic contour maps"
  - [sciexperts Didger features](https://sciexperts.com/didger/features/)

Didger is retired; its georeferencing and digitizing live on in Surfer. ZMAP+ / DecisionSpace has almost no public documentation (snippet only). Rows marked (snippet) rest on search results.

| Capability | Leader and how | Ours | Gap | Demo-visible |
|---|---|---|---|---|
| Gridding algorithm set | Petrel: convergent, minimum curvature, moving average, kriging, isochore, trend. Surfer: 13 methods | Thin-plate spline, spline in tension with smoothing, ordinary kriging | partial | yes |
| Minimum curvature / convergent | Petrel convergent: multigrid biharmonic (snippet). Kingdom Flex Gridding: Laplacian and biharmonic blend | Thin-plate spline (the continuous minimum curvature). No multigrid | partial | yes (the name they look for) |
| Fault-honouring gridding | Petrel and Kingdom: fault polygons drive the gridding. Surfer: faults in MinCurv, IDW, NN (not kriging) | Fault blocks with the thin-plate spline only (022) | partial | yes |
| Breaklines / soft barriers | Surfer: breaklines in most methods | none | missing | no |
| Extent and blanking | Surfer: blank inside or outside a polygon, convex hull inflate. Petrel boundary | Hull, map-beyond by distance with the hull drawn, boundary clip | none | no |
| Well adjustment / residuals | Petrel residual-from-well correction. Surfer grid residuals | Residual table, velocity correction to tops | none | yes |
| Isochore vs isopach | Surfer separate isopach (TST) and isochore. Petrel isochore gridding | Isochore (vertical); no isopach | partial | no |
| Grid calculator | Petrel surface operations. Surfer grid math and calculus | Arithmetic set (sum, difference, product, min/max, k, clip) | partial (no calculus, no expression) | no |
| Depth conversion | Petrel V0, V0+kZ, V0+k(Z-Z0), V0+kT, interval velocities per layer, tops correction. Kingdom many methods, VelPAK | Linear V0+kZ from Seismolord, well average velocity, residual correction | partial | yes |
| Live remapping | Kingdom maps rebuild when interpretation changes | Re-grid in place from the recorded source (manual) | partial | yes |
| Volumetrics with contacts | Petrel zones, O/W and G/O contacts, volume-height maps | One closure, one contact, spill, area-depth and GRV curves | partial (024) | yes |
| Segments / fault blocks | Petrel contacts by zone, segment or region | none | missing | yes |
| Structural uncertainty | Petrel U&O stochastic surfaces feed volumes | Kriging-variance shift, fully correlated (023) | worse | yes |
| Surface editing | Surfer grid editor. Petrel edit surface | Guide points, move a contour | partial | yes |
| Print layout | Petrel plot window. Surfer layouts, graticule, PDF | PNG with a reviewer header (013) | partial (026) | yes |
| Formats | Petrel: Irap, CPS-3, EarthVision, ZMAP+, Charisma. Surfer: GRD, TIF, SHP, DXF | CPS-3, ZMAP+, Irap, XYZ in and out, Petrel points in; GeoJSON and shapefile culture | partial (no EarthVision, GeoTIFF, lines formats) | no |
| CRS | Petrel stores each surface's original CRS. Surfer 2,500+ systems | Declared CRS, reprojection on import, consensus tags, frame-aware areas (001) | none | no |
| Cross-section / 3D | Surfer grid slice and 3D. Petrel and Kingdom sections | Surfaces in Well Correlation sections (WC U2-003) and Earth Modeling 3D | partial | yes |
| Attribute maps, co-kriging | Surfer co-kriging. Petrel property mapping | Zone attributes (PHIE, net, HCPV with units), contours over an attribute | partial (no co-kriging) | no |
| Performance / batch | Surfer multithreaded, scripting. Petrel workflows | Worker gridding (2,005 wells in 2.9 s) | partial (no batch) | no |
| Integration | Petrel one project | Every surface is a registry row RCP, EM, Well Design, Simulation and sections read | ahead in principle, but the readers lose units (030 to 033) | yes (our story) |

**Digitizer (against Didger and Surfer):**

| Capability | Leader and how | Ours | Gap | Demo-visible |
|---|---|---|---|---|
| Multi-point georeference | Surfer: 3 or more points (affine), 6 or more (2nd order), 10 or more (3rd). Didger up to 256 | Least-squares affine through 3 to 12 points (005) | partial | yes |
| Warp / rectify | Ten transforms incl. polynomial and thin-plate spline rubber sheet | Affine only (027) | missing | no |
| Accuracy report | RMS per point and overall | Per-point misfit and RMS (005) | none | yes |
| Projections | 2,500+ systems | Suite CRS catalog, Project CRS default (008) | partial | no |
| Auto-trace | Didger line detection, then edit | OpenCV trace in a box, manual polylines | partial | yes |
| Assign contour values | Didger drag across contours with a start and an increment | Typed per line (027) | missing | yes |
| Georeferenced export | SHP, DXF, GeoPDF, KML in world coordinates; GeoTIFF of the warped image | GeoJSON, DXF, CSV in world coordinates (007) | partial (no SHP, GeoTIFF) | no |
| Grid from contours | Surfer grid from contours | TPS gridding, published to the registry | none | yes |

### 2b. Deferred backlog harvest

| Item | Source | Decision |
|---|---|---|
| Fold the Contour Map Digitizer into Mapping as a raster import wizard | PLAN §7, STATUS G4.4 | Still wanted (U2-006). Now safer, since the digitizer georeferences and exports properly |
| Tension and kriging ignore fault blocks | T1 known limits, programme plan row 6 | Still wanted, first (U2-001) |
| Kriging maps inside the wells only | T1 known limits | Still wanted (U2-012) |
| GRV range fully correlated | T1 known limits, plan row 6 | Still wanted (U2-010), using the canonical Monte Carlo module |
| Discrete minimum curvature (prototyped, dropped at 37 s to 2.5 min) | T1 outcomes | Still wanted as a fast multigrid "convergent" option (U2-011), engines-first with an oracle |
| Extrapolation control | Plan row 6 | Superseded: built in T1 (map beyond the wells) |
| Well-based depth conversion | Plan row 6 | Superseded: built in T1. More methods stay wanted (U2-008) |
| `geo_wells.status` migration (well symbols) | T1 015 | Still wanted: owner apply (U2-018) |
| Per-user depth unit column | MS0 decision | Superseded: MS5 migration applied |
| Earth Modeling keeps its own fault polygons | MS decisions | Superseded: EM reads geo_culture since MS5 |
| Staging tester walk | MS5 close-out | Still wanted: owner or tester run |
| Stale Vite cache cleared at container start | T1 P01 | Still wanted (platform, owner) |
| Digitizer image kept with the project | new (006) | Still wanted (U2-020); needs a storage policy (RLS review) |

### 2c. Suite integration

**Reads:**
- `geo_wells`: header, survey, KB, CRS, tops, zones with published properties, interval logs.
- `geo_surfaces`: Seismolord horizons, imports, digitized surfaces.
- `geo_culture`: culture, and fault, boundary, facies and paleogeography polygons.
- Seismolord velocity models (volume manifests).
- `geoscience_settings.depth_unit`.

**Writes:**
- `geo_surfaces`: structure, isochore and attribute rows, with provenance, display and points.
- `geo_culture`: drawn polygons.
- The digitizer writes `geo_surfaces` too.

**Deep links:**
- In: `?surface=`, `?top=&wells=`, `?net=`.
- Out: RCP, Earth Modeling (`?surface=`), Seismolord.

`.pld` carries rows, grids and polygons (not the archives, 034).

| Finding | Kind | Detail |
|---|---|---|
| Readers lose units and domain | handoff loses context | Registry rows carry `z_unit`, `xy_unit`, `kind`, `z_domain` and `provenance.depth_ref`. Of the readers: <br>- None reads depth_ref. <br>- RCP (029 fixed, 033), EM (030), Well Design (031), Simulation (032) and Seismolord (033) each drop at least one of the others. <br>- Only the section horizons (WC/Strat) read all of them. <br>Recommended: one shared reader door, `readDepthSurface(row, grid)` in `src/lib/surfaceConvention.js`, returning metres, positive-down depth, metres per XY unit, or a refusal with the reason. Each app adopts it in its own upgrade. |
| Seismolord fault sticks and polygons not used as fault blocks | upstream ignored | Faults interpreted in Seismolord never reach Mapping's gridding; the mapper redraws them (020). |
| Checkshots unused in depth conversion | upstream ignored | The well velocity tie uses tops and TWT picks only. Checkshots in the registry could give interval velocities (U2-008). |
| Published PAY and zone net pay | upstream used | Petrophysics U2-008 net_m and hcpv_m map with units. Good. |
| Contacts from RCP or Material Balance | downstream not fed | Mapping's closure, spill and GRV do not reach RCP as a prospect record; the prospect card is a PNG only (U2-005, U2-010). |
| Well Design targets | handoff loses units | 031. |
| Site datum and SRD | handoff loses context | TVDSS assumes MSL (WDM U2-007, owner). |

### Ranked backlog

Sizes: S is under a day, M is two to four days, L is a week or more.

| Rank | ID | Item | Size | Value in one line | Batch |
|---|---|---|---|---|---|
| 1 | U2-001 | Fault blocks honoured by the spline in tension and kriging (blocked variants, engines-first, oracle) | M | The first thing a Petrel mapper tests: contours stop at faults whatever the algorithm | A |
| 2 | U2-004 | Fault polygon files become fault blocks: culture kinds fault_polygon and boundary in the import dialog, every polygon in a file used, ZMAP+ lines and Irap lines readers | M | Bring the Petrel fault polygons instead of redrawing them | A |
| 3 | U2-002 | PDF map plotted to scale (1:N), title block, coordinate grid, legend, scale bar, north arrow, vector contours | M | The map a reviewer signs and prints | A |
| 4 | U2-005 | Volumetrics: separate GOC and OWC (gas cap and oil leg GRV), per fault block segments, area-depth table in the card | M | What a reserves engineer asks for next | A |
| 5 | U2-003 | Scattered points and rotated lattices from a file as a gridding source | S | Kingdom and Petrel point exports map directly | A |
| 6 | U2-006 | Digitizer: drag to assign contour values with an increment; open it as Mapping's "Import scanned map" | M | Legacy paper maps in minutes (Didger's best feature) | A |
| 7 | U2-007 | Shared reader door `readDepthSurface` in surfaceConvention, with the carried consumer fixes scheduled in their apps | S (door) | One place that stops unit and domain loss in every consumer | A (door only) |
| 8 | U2-008 | Depth conversion: V0+k(Z-Z0), V0+kT, layer cake of interval velocities per zone, velocity QC plot, checkshots as input | M | Parity with Petrel Make Velocity Model | B |
| 9 | U2-009 | Isopach (true stratigraphic thickness from dip) beside the isochore | S | The textbook distinction, on screen | B |
| 10 | U2-012 | Kriging beyond the wells (extent control) | S | Kriged maps show the flanks | B |
| 11 | U2-013 | Surfaces and wells on a section line drawn on the map | M | Quick structural QC without leaving Mapping | B |
| 12 | U2-014 | Grid editor: smooth, raise or lower an area, set nodes, with undo | M | Petrel and Surfer editing parity | B |
| 13 | U2-011 | Fast multigrid minimum curvature ("convergent") as a named method, engines-first with an oracle | L | The algorithm name users search for | B |
| 14 | U2-010 | Structural uncertainty by stochastic realisations feeding a GRV distribution to RCP (canonical MonteCarloEngine) | L | Replaces the fully correlated shift | C |
| 15 | U2-015 | Digitizer polynomial and thin-plate spline warp with per-point RMS | M | Rectifies distorted scans | C |
| 16 | U2-016 | Collocated co-kriging with a seismic attribute | L | Attribute-guided property maps | C |
| 17 | U2-017 | `.pld` companions for re-grid archives | S | Restore works after a package import | C |
| 18 | U2-018 | Apply the held `geo_wells.status` migration (owner) | S | Oil, gas and dry symbols on every map | C (owner) |
| 19 | U2-019 | Live remap when tops or horizons change (stale flag and one-click re-grid of dependants) | L | Kingdom's live mapping | C |
| 20 | U2-020 | Digitizer image stored with the project (storage bucket and policy) | M | Resume without finding the scan again | C (RLS review) |

The batches:
- **Batch A** (demo-visible, NAPE-safe, no schema change): U2-001, U2-004, U2-002, U2-005, U2-003, U2-006, U2-007 (door only).
- **Batch B:** U2-008, U2-009, U2-012, U2-013, U2-014, U2-011.
- **Batch C:** U2-010, U2-015, U2-016, U2-017, U2-018 (owner apply), U2-019, U2-020 (storage policy, second-engineer review).

Consumer fixes 030 to 033 are scheduled in their own apps: Earth Modeling (#7), RCP (#8), Seismolord follow-up, Well Design and Simulation (owner).

### Owner questions

1. Does master_apps have a `contour-map-digitizer` row? The read-only check was not permitted from here. The route now also opens on a Mapping licence, so either answer is safe.
2. For the 25 unprotected app routes (035), should one Suite-wide pass wrap them, each with its catalog slug?
3. Should U2-007 (the shared reader door) land with Mapping batch A, so that Earth Modeling and RCP adopt it in their upgrades?

## Batch decision (programme lead, 2026-09-30)

Recorded verbatim:

> BUILD in this order, one commit per item:
> - Batch A: U2-007 FIRST: one shared "read a depth surface" helper (src/lib, next to surfacesRegistry) that returns a surface in canonical metres with its domain (elevation/depth/TWT/attribute/isochore), xy unit converted, rotation honoured, and refuses rows a consumer cannot use with the reason; Earth Modeling (#7) and ReservoirCalc Pro (#8) will adopt it in their own upgrades, so document its contract; adopt it inside Mapping now. Then U2-001 fault blocks in the tension spline and kriging; U2-004 fault polygon files as fault blocks; U2-002 PDF map plotted to scale (reviewer header, read back with pdftotext); U2-005 separate GOC/OWC and per-fault-block volumes (validate against an analytic geometry, negative control); U2-003 scattered points as a gridding source; U2-006 Digitizer drag-to-assign contour values. Also the small ones: MAP-U1-028 Digitizer /dev harness; MAP-U1-025 staircase map edge if S-sized.
> - Batch B: U2-009 isopach; U2-012 kriging beyond the wells (with an honest extrapolation note); U2-013 section line across surfaces; U2-008 more depth-conversion methods LAST in B: it should consume Seismolord's layer-cake velocity models (Seismolord U2-006, being built now on feat/seis-u2): if that is merged to main by the time you get here, read its published contract; if not, build the other depth-conversion methods (average velocity from well tops, V0+kZ fitted to tops, velocity map) and leave a clearly named hook for the layer cake, and say so.
> - Batch C: U2-017 .pld carries the re-grid archives.
> DEFERRED (record reasons): U2-011 multigrid minimum curvature (L; the tension spline covers the demo; after NAPE, engines-first); U2-014 grid editor (M, after NAPE); U2-010 stochastic structural uncertainty (L; canonical Monte Carlo module when built); U2-015 Digitizer warp; U2-016 co-kriging; U2-019 live remapping; U2-020 storing the Digitizer image (RLS review); U2-018 the held geo_wells.status migration is the owner's apply.
> Units: do not add new app-local unit preferences. If the Suite unit profile PR (branch feat/suite-unit-profile) has merged to main before you open your PR, adopt it in Mapping (initial depth unit from useUnitProfile; the in-app toggle becomes a view override) as a final item; otherwise leave Mapping's current behaviour and note it.

Built on branch `feat/map-u2`. The build log per item follows in "Step 2 build (2026-09-30)".

## The shared surface door: `readDepthSurface` (U2-007 contract)

`src/lib/readDepthSurface.js`, beside `surfacesRegistry.js`. Earth Modeling (#7) and ReservoirCalc Pro (#8) adopt it in their own upgrades; Well Design and Simulation can take it for MAP-U1-031 and 032.

```js
readDepthSurface(row, grid, { accept, as = 'elevation', xy = 'native', requireProjected = true })
// ok:      { ok: true, domain, grid, zUnit, spec, xyUnit, xyToM, cellAreaM2, crs, depthRef, nodeXY, sampleAt, live, notes }
// refused: { ok: false, code, reason }
```

- `domain`:
  - `elevation`: a depth row, negative below datum. `as: 'depth'` returns it positive down as `depth`.
  - `time`: positive TWT in ms, whatever sign it was stored in.
  - `isochore`: kind `isochore`, a positive vertical thickness.
  - `attribute`: raw values. A `z_unit` of `ft` is converted to metres.
- `grid` is a new Float32Array in metres for every length. `zUnit` is `m`, `ms` or the attribute's own unit.
- `spec` keeps the row's frame (`xy: 'native'`) or is scaled to metres (`xy: 'm'`). `rotation_deg` is kept, and `nodeXY` and `sampleAt` honour it. `xyToM` is metres per map unit and `cellAreaM2` is the cell area in square metres.
- Refusal codes:
  - `grid`, `frame`: the grid or its frame is not usable.
  - `domain`: the row is not in `accept`. The reason names the row's domain, the one needed and the way out.
  - `z-unit`: a length in an unknown unit.
  - `xy-unit`: an unknown unit, or a geographic frame when `requireProjected`.
  - `empty`: no live node.
- `notes` says what was assumed: no z domain, no depth unit, no CRS, or positive values on an elevation row. Show them to the user.

## Step 2 build (2026-09-30)

| Item | State | Proving test | Notes |
|---|---|---|---|
| U2-007 | Done | `src/lib/__tests__/readDepthSurface.test.js` (22): every saved release reads; feet and US-feet rows give one cell area in m² (negative control: dx·dy is 10.76x); rotation honoured (negative control: unrotated arithmetic is 100 m off); isochores stay positive (negative control: `surfaceZToDepthDown` negates them); TWT refused by a depth-only consumer with the way out; 8 hostile rows refused with reasons | `src/lib/readDepthSurface.js`. Mapping loads every registry grid through it (`loadSurfaceM`), and the status shows what it assumed about a legacy row. The contract is below. |
| U2-001 | Done | Engines `mapping.u2.test.js` (gridBlocked reproduces each block's plane to float32 precision; negative control: unblocked tension and kriging smear the 100 m throw by more than 20 m). Suite `upgradeU2.test.js` through `gridSync` and the polygon tools: a 95 m-plus step one cell across the fault | Engines PR #289 (`blockedGridding.js`, `nodeMask` on both gridders), vendored at 15d907f. The workstation grids tension and kriging per fault block; the old refusals are gone; provenance method `tension-blocked` / `kriging-blocked`. |
| U2-004 | Done | `upgradeU2.test.js`: the hostile Petrel ZMAP+ lines file reads as one closed polygon; ids, null rows and Irap `999` separators split polygons; the two-fault GeoJSON makes three block labels (negative control: the first feature alone makes two); a two-polygon boundary keeps the union | `src/lib/culturePolygonFiles.js` (ZMAP+ lines, Irap lines, `polygonRingsOf`). The shared Culture import dialog offers Fault polygons and Map boundary kinds, keeps closed polygons only and counts what it left out. Mapping grids with every ring of a row and clips to the union of a boundary's rings. |
| U2-002 | Done | `mapPdf.test.js` (node, pdftotext): the header, source, method, field, analyst, date and build read back; the scale is proved from the printed easting labels (their spacing on paper equals the grid step x 1000 / N, on a metre frame and on a US-feet frame); negative control: the feet frame read as metres needs a 3.28x smaller scale; a typed scale that does not fit is refused with the one that does | `services/mapPdf.js`: `planMapPlot` (standard scales 1:1,000 to 1:1,000,000, A4/A3/A2 landscape) and `buildMapPdf` (vector contours with labels, fault and boundary polygons, wells, CRS grid, scale bar in metres, grid north, legend, title block). Ribbon PDF button; paper and scale in the dock. |
| U2-005 | Done | `upgradeU2.test.js` against an analytic cone (z = -1800 - 0.1 r): gas cap within 1% and oil leg within 0.5% of pi (10 h)^2 h / 3; gas + oil = the closure engine's GRV to 1e-12; two blocks each hold half; negative control: one contact books the gas cap as oil (more than 10% high). e2e: the split table adds up and a GOC below the OWC is refused | `services/contactVolumes.js`. A GOC field beside the contact (now "OWC or contact"); a table of gas, oil and total per fault block (the ticked fault polygons); the prospect card carries the split. One GOC and OWC for every block; contacts per block are not modelled. |
| U2-003 | Done | `upgradeU2.test.js`: the hostile rotated survey lattice (refused in U1) reads as points and grids to the fixture's crest of -1500 m within 20 m; feet, sign and TWT resolve as for a grid; negative control: a regular file still reads as a grid. e2e: import, Grid these points, publish | `surfaceFileDoor.scatteredPoints`, `importPlan.planPointsSource`. The import dialog offers "Grid these points"; the studio grids them with its own method, cell, extent, fault blocks and boundary. The U1 refusal test was updated (superseded). |
| U2-006 | Done | `src/lib/digitizer/__tests__/dragAssign.test.js`: a drag from the crest values three rings in crossing order (negative control: the reverse drag reverses them); a drag through the dome keeps the first crossing and says so; typed values replaced are counted. e2e `contour-map-digitizer.spec.js` at 1366x768 and 1440x900: drop a scan, georeference, draw three rings, one drag values them 1500/1550/1600, grid, publish (crest -1500 m), save and reload | `src/lib/digitizer/dragAssign.js`; start value and step fields and "Drag to assign values" in Layers; values drawn on the scan. The browser walk found two defects, both fixed: closed contours (last vertex on the first) made the spline singular (the duplicates are merged within a tenth of a cell; negative control in the test), and at 390 wide the map had no height. The "open as Mapping's Import scanned map" half of the backlog row stays with the Digitizer page (linked from its Publish). |
| MAP-U1-028 | Done | The digitizer e2e above runs on `/dev/contour-map-digitizer` | `src/lib/digitizer/digitizerBackend.js` (registry and in-memory backends with one contract); the hook takes the backend; the harness exposes `window.__DIGITIZER_BACKEND__`. |
| MAP-U1-025 | Deferred | n/a | Not S-sized. T1 already draws the raster edge at the mask's 0.5 level; what remains is the node-resolution outline of the mask itself. A smooth edge needs a vector mask outline (marching squares on the live mask) used as a clip path in the map, the PNG and the PDF. After NAPE. |
| U2-009 | Done | Engines `mapping.u2.test.js` (TST = TVT cos(dip) on a planar 20 degree layer to 1e-9; negative controls: a flat layer gives TST = TVT, a feet frame read as metres gives the wrong dip). Suite `upgradeU2.test.js`: 100 m of isochore on a 30 degree flank is 86.6 m of isopach (negative control: the isochore differs by more than 13 m); a US-feet frame gives the same; time, isochore and degree frames refuse | Engines `lib/gridding/isopach.js` (PR #289). Surface arithmetic has "Isopach"; the result is an attribute in metres named "isopach (true stratigraphic thickness, m)", so no reader takes it for a vertical isochore. The PL1 quantity table's isopach row is now computed. |
| U2-012 | Done | Engines `mapping.u2.test.js`: with mask none the far node is the data mean and the variance exceeds the sill (negative control: the hull mask leaves it empty). Suite `upgradeU2.test.js`: the studio path reaches past the hull by the distance and no further. The T1 e2e that pinned the refusal now expects the map and its note | Kriging honours "Map beyond the wells by"; the variance is masked with the map; the status says that past the variogram range the map returns to the mean of the wells (or the regional plane when detrended) and the variance rises to the sill. |
| U2-013 | Done | `upgradeU2.test.js`: a planar surface samples exactly along the line on a metre and a US-feet frame (negative control: the feet frame read as metres reports a 16.4 km section for 5 km); rotation honoured; nulls stay gaps; wells within the buffer posted at their distance; the vertical exaggeration arithmetic. e2e: a two-click line shows the chart with curves, KETA-1 and KETA-3, and the exaggeration note | `services/sectionLine.js`, `components/SectionChart.jsx` (white chartTheme, ChartLogo). The line stays drawn on the map. Up to five other depth structures in the same CRS are added, each read through `readDepthSurface`. |
| U2-008 | Done (layer cake as a hook) | `upgradeU2.test.js`: V0 + kZ fitted to exact ties recovers V0 = 1800 m/s and k = 0.6 (negative control: a single velocity leaves more than 20 m of misfit); a velocity map converts node by node, a declared ft/s map gives the same depths, an undeclared ft/s map is refused; the layer-cake conversion equals Seismolord's `layercakeDepthM` node by node (negative control: without the boundary the second layer is never used). e2e: fitted conversion with the residual table, publish, and the layer cake's hook reason | `services/depthConversion.js`: `fitLinearVelocityToTops` (the forward model is Seismolord's `twtMsToDepthM`), `elevationFromVelocityMap`, `convertWithLayerCake`, and `LAYER_CAKE_HOOK`. Seismolord U2-006 (layer-cake models on `feat/seis-u2`) was NOT on main when this was built, so the hook returns the reason and the picker shows it; wiring it is one function once Seismolord publishes each boundary as a time surface. Checkshots as an input and a velocity QC plot stay in the backlog. |
| U2-017 | Done | `src/lib/portability/__tests__/surfaceArchives.test.js`: a backup carries the grid and its archive; the import lands the archive beside the new grid with its bytes, rewrites the recorded path and leaves a path that is not beside the grid alone; negative control: an archive already gone at export is left out and the row still imports. All 94 portability tests pass | `geoscienceSpec` geo_surfaces `rowCompanions` / `rewriteCompanions`; `collect.js` and `importPackage.js` carry row-recorded companions. Restore's message now says only packages exported before this release lack the previous grids. |

### Deferred by the batch decision (reasons)

| Item | Reason |
|---|---|
| U2-011 multigrid minimum curvature | L. The spline in tension covers the demo. After NAPE, engines-first with an oracle. |
| U2-014 grid editor | M. After NAPE. Guide points and contour moves stay the editing tools. |
| U2-010 stochastic structural uncertainty | L. It waits for the canonical Monte Carlo module (ReservoirEngineering-Module section 5). The GRV range stays the fully correlated kriging shift, labelled as such. |
| U2-015 Digitizer polynomial and thin-plate warp | Deferred by the decision. The least-squares affine with per-point misfit stays. |
| U2-016 collocated co-kriging | Deferred by the decision. |
| U2-019 live remapping | Deferred by the decision. Re-grid in place from the recorded source stays. |
| U2-020 storing the Digitizer image | It needs a storage policy (RLS review, second engineer). Saved projects keep the image name and size and ask for the image on load. |
| U2-018 geo_wells.status migration | The owner applies it. The app reads the column when it is present. |
| MAP-U1-025 staircase map edge | Not S-sized (see its row above). After NAPE. |

### Units

The Suite unit profile (branch `feat/suite-unit-profile`) was not on main when this PR was opened (2026-09-30). It merged as PR #830 shortly after, and main was merged into this branch; per the batch decision the adoption was not added to this PR. Mapping keeps its current behaviour: the depth display unit is `mapping.depthUnit` per browser, together with the per-user `geoscience_settings.depth_unit`. No new app-local unit preference was added. The PDF paper and scale are plot settings, not units, and are not stored. The adoption stays a follow-up: take the initial depth unit from `useUnitProfile`, and make the in-app toggle a view override.

### Build summary

- Built: Batch A, all items (U2-007, U2-001, U2-004, U2-002, U2-005, U2-003, U2-006, MAP-U1-028).
- Built: Batch B, all items (U2-009, U2-012, U2-013, U2-008). The U2-008 layer cake is a named hook, because Seismolord U2-006 is not on main.
- Built: Batch C (U2-017).
- Deferred: MAP-U1-025 (not S-sized).
- Engines: PR #289 (gridding) merged. The Suite vendors canonical `bf8376b`, which also brings in PR #290, the test-only CI speed gate.
- The browser walks found three new defects, all fixed in this branch:
  - The Digitizer's spline was singular on closed contours.
  - The Digitizer map had no height at 390 wide.
  - A T1 e2e pinned the old kriging refusal; it now expects the kriged map and its note.
