# Well Data Manager: comprehensive upgrade

App #1 of the Geoscience upgrade programme (`docs/scope/AppUpgrade-Geoscience-PLAN.md`).
Step 1 (practitioner lens, `docs/scope/AppUpgrade-BestPractices.md`) run and
fixed 2026-09-28 on branch `feat/wdm-u1`. Step 2 (advancement review) is
analysis only; the owner picks batches before anything is built.

Route `/dashboard/apps/geoscience/well-data-manager` (ProtectedAppRoute),
harness `/dev/well-data-manager` (in-memory backend, real LAS worker).

## Evidence kit made for this app

| Kit | Where | What it holds |
|---|---|---|
| Hostile file set (PL2) | `e2e/fixtures/wdm/hostile/` + `generate.mjs` | 14 files: bottom-up LAS in feet; Schlumberger TDEP bottom-up; TVDSS index; time index; Petrel LAS 2.0 export (XWELL/YWELL, EKB/EGL, `-999` null, lower-case units); Techlog tab export (`-9999` null, `GR_EDTC`); BOM + CRLF; LAS 1.2 wrapped; comma decimals; truncated row; LAS 3.0 with a Tops block and `{S}`/`{DT}` channels; Petrel well tops export in feet; survey with units in the header and an extra TVD column; Petrel negative-Z checkshots. `bigLas()` builds a 150,000-row, 20-curve file (21.5 MB) in memory. |
| Saved state (PL5) | `e2e/fixtures/wdm/saved/` | Registry rows as the G1 release (2026-07) stored them (no CRS, legacy checkshots, TDEP stored bottom-up) and as PT1/PT8 (2026-09) stored them (state-plane well in US survey feet, Petrel-convention checkshots, typed tops). Loaded through `makeInMemoryBackend({ seedRows })`. |
| Chain (PL9) | `__tests__/chainDownstream.test.jsx` | WDM import of the hostile files read by the real `PetroWorkstation` and `useSectionWells` (Well Correlation, Stratigraphy). |
| Browser (PL2-PL10) | `e2e/well-data-manager-upgrade.spec.js` | Hostile imports, delete confirmation, XY unit door, three viewports with canvas geometry, 150k-row timing. |
| Scale (PL10) | harness `?seedWells=<n>` | n located wells in the tree and map. |

## Step 1: the twelve checks

| Check | Result | Findings | Notes |
|---|---|---|---|
| PL1 Labels mean the textbook | Pass after fixes | 3 (001, 019, 026) | Quantity table below. The index curve was being called MD whatever it was. |
| PL2 Hostile file set | Failed, fixed | 11 (001-005, 008, 009, 012, 013, 024, 031) | 14 files built; 8 were imported wrong, partly or with a misleading message before the fixes. |
| PL3 Units, datums, frames at every door | Failed, fixed in part | 7 (004, 005, 011, 016, 019, 020, 026) | Two S2 unit defects at the doors fixed; the metres-only display and the datum model are Step 2. |
| PL4 No claim without the event | Failed, fixed | 4 (006, 015, 016, 017) | One-click log delete; wells silently missing from the map; a cleared location drawn at the origin. |
| PL5 Real saved state | Pass with one open item | 2 (027, 032) | Both release fixtures open on every tab; curves stored bottom-up by G1 stay as stored. |
| PL6 Real browser | Pass after fixes, one open | 4 (014, 023, 025, 030) | 1366x768, 1440x900, 390 wide, light and dark. Quick view drawn and depth increases downward (asserted from canvas geometry). |
| PL7 Report a reviewer can sign | Not applicable today | 2 (021, 033) | WDM has no report or file export; only the .pld package. Step 2 item. |
| PL8 Practitioner's day | Gaps recorded | 5 (010, 020, 021, 022, 028) | Three persona walks below. |
| PL9 The chain | Failed, fixed | 1 (003) | TDEP wells were invisible to Petrophysics and Correlation. `.pld` round trip covered by the portability suites (green). Open-in and deep links covered by the existing e2e (green). |
| PL10 Real scale | Pass | 1 (029) | 150,000 rows x 20 curves parse and preview in 0.94 s; longest main-thread gap 69 ms (worker). 2,000 wells: tree filter 256 ms. |
| PL11 Inputs a person can type | Pass after fix | 1 (007) | Header inputs are text with validation on save (no snapping); grid editors use decimal input mode. Filled LAS header fields lost their labels. |
| PL12 House standards | Pass, one gap | 2 (022, 018) | ProtectedAppRoute, EMPTY_VALUE and copy style hold. No in-app help guide (every other Geoscience app has one). Harness dropped CRS fields. |

### PL1 quantity table

| Quantity on screen | Standard meaning | What the code computes | Same? |
|---|---|---|---|
| Log interval "m MD" | Measured depth along hole from the depth reference (KB) | The LAS index curve converted to metres | Was not: a TVD, TVDSS or time index was stored and labelled MD. Fixed (001). |
| TVD (Tops tab, new) | True vertical depth below KB | Minimum-curvature position at the top's MD through the survey (`makeDepthFrame`) | Yes (test: deviated G1 well, TVD < MD) |
| TVDSS | TVD below the vertical datum (MSL), = TVD - KB elevation | `tvd - kb_m` | Yes, when KB is set. With KB 0 it equals TVD; now said on screen (019). Datum assumed MSL; SRD not modelled (026). |
| KB | Kelly bushing elevation above the datum | `kb_m` | Yes; the datum is not named anywhere (026). |
| TD | Total depth, MD | `td_md_m`; suggested from the deepest LAS sample | Was the LAS STOP, the shallow end for bottom-up files. Fixed (002). |
| OWT / TWT | One-way / two-way time from datum | Checkshot engine (golden-tested) | Yes |
| DT unit | Sonic slowness | us/ft divided by 0.3048 to us/m | Yes (lasImport tests) |
| Nulls | Samples equal to the LAS NULL | NaN count after null substitution | Yes |
| Step | Constant sampling interval | `uniformStepM` of the stored depth | Was "irregular" for every bottom-up file. Fixed (002). |
| Surface X / Y | Easting / northing in the well's CRS | Stored value in the CRS's native unit | Label said m for feet CRSs. Fixed (011). |

### Findings

Severity: S1 wrong answer with no warning at scale; S2 wrong or lost data, or a door that misleads; S3 workflow gap or misleading text; S4 polish.

| ID | Sev | Check | Finding | Evidence | Status |
|---|---|---|---|---|---|
| WDM-U1-001 | S2 | PL1, PL2, PL3 | A LAS indexed by TVD, TVDSS or time was stored as if the index were MD. In a deviated well every sample sits at the wrong depth, silently. | `las20_tvdss_index.las` imported with kind "depth". | Fixed: refused with the reason (`engine/lasIndex.js checkLasIndex`). Tests `lasIndex.test.js`, e2e PL2. |
| WDM-U1-002 | S2 | PL2, PL1 | Files logged bottom-up (negative STEP, common in wireline archives): step read as irregular, quick view plotted by sample index, suggested TD was the shallow end, and a LAS merged into an existing well had every sample blanked. | `las20_upward_feet.las`: step null, start 1529.9 > stop 1524; merge left 0 finite GR samples. | Fixed: every curve reversed so depth ascends, noted in the preview and provenance (`orientLasIndex`). Tests `lasIndex.test.js` (merge negative control), e2e PL2. |
| WDM-U1-003 | S2 | PL9, PL2 | An MD index named outside DEPT/DEPTH/MD (Schlumberger `TDEP`, `DEPTH_M` ...) was invisible to Petrophysics Studio ("no depth curve"), Well Correlation and Stratigraphy, and a second LAS into the same well wrote a second depth curve. | Chain test fails at origin/main. | Fixed at the shared layer: TDEP and unit-suffixed names join `CURVE_ALIASES.DEPT` (also for wells already stored); any other index is saved as DEPT with its name in provenance; `mergeImport` uses the same family. Benefits Petrophysics, Well Correlation, Stratigraphy, Rock Physics, Pore Pressure, Earth Modeling (every `curveMap`/`useWellCurvesCache` reader). Tests `lasIndex.test.js`, `chainDownstream.test.jsx`. |
| WDM-U1-004 | S2 | PL3 | LAS door: Surface X/Y fields said "(m)" and the error said "world coordinates in metres", but the numbers were read in the chosen CRS's own unit. A user who typed metres into a US-feet state-plane CRS placed the well 3.28x off. | e2e PL3 negative control stores 600000 as feet. | Fixed: unit selector (metres, feet, US survey feet), labels name it, numbers convert via `placeWellLocation(xyUnit)`, note when the CRS works in another unit. e2e PL3. |
| WDM-U1-005 | S2 | PL2, PL3 | Tops and survey pastes ignored a unit in the header ("MD (ft)", "MD[ft]"). A Petrel well tops export was stored with feet read as metres unless the user found the selector. Checkshots already read their header. | `tops_petrel_export_ft.txt` stored 6565.6 m. | Fixed at the shared layer (`guessDepthUnit`, `guessMdUnit` in `src/lib/wellImport.js`; `PasteReplacePanel`, `WellImport`). Benefits Seismolord's well import and every paste editor. Tests `wellImportUnits.test.js`, `upgradeU1.test.jsx`. |
| WDM-U1-006 | S2 | PL4, PL8 | The trash icon on a log deleted the curve and its stored samples on the first click, with no confirmation and no undo. | Code read; test negative control. | Fixed: second click (Delete / Keep). `upgradeU1.test.jsx`, e2e PL4. |
| WDM-U1-007 | S3 | PL11 | LAS header inputs had placeholders only: once filled, nobody could tell KB from TD (25.3 and 2007.47 side by side). | Screenshot 1366. | Fixed: visible labels. |
| WDM-U1-008 | S3 | PL2, PL8 | XWELL/YWELL (Petrel), X/Y, XCOORD in ~Well were ignored; the user retyped them. | `las20_petrel_export.las`. | Fixed: offered with the file's unit and a note to check the CRS. `lasIndex.test.js`, e2e PL2. |
| WDM-U1-009 | S3 | PL2 | LAS 3.0 `~Tops_Data` was named as ignored and dropped (deferred since 2026-09-03). | `las30_tops_strings.las`. | Fixed: opt-in import (`engine/lasTops.js`); an existing well keeps tops it has; a TVDSS tops column is refused. `lasTops.test.js`, e2e PL2. |
| WDM-U1-010 | S3 | PL8 | Tops tab showed MD only. A Petrel user reads MD, TVD and TVDSS side by side. | Persona walk. | Fixed: TVD and TVDSS columns through the survey and KB. `upgradeU1.test.jsx`, e2e PL2. |
| WDM-U1-011 | S3 | PL3 | Header labels read "Surface X (m, CRS)" for a US-feet well; the map caption said "world metres". | PT fixture. | Fixed: labels use `xy_unit`; the caption names the frames in use. |
| WDM-U1-012 | S4 | PL2 | Common unit spellings (m3/m3, CFCF, pu, ohm-m, degC) were flagged "as-is" as if unknown. | Petrel and SLB files. | Fixed. |
| WDM-U1-013 | S3 | PL2, PL3 | Petrel checkshots with Z as elevation (negative down) failed with "must strictly increase ... fix the file", which misdescribes the cause. | `checkshots_petrel_negative_z.txt`. | Fixed at the shared layer: the message names elevation and the fix. An elevation toggle is Step 2 (U2 backlog). |
| WDM-U1-014 | S4 | PL6 | Quick-view depth ticks repeated (2007, 2007) on short intervals. | Screenshot. | Fixed (`depthTickLabel`). |
| WDM-U1-015 | S4 | PL4 | Status said "Imported 5 logs" where the preview said 4 curves; "1 curves". | Screenshot. | Fixed. |
| WDM-U1-016 | S3 | PL4, PL3 | The map dropped wells with no location without saying so, and drew wells from different CRSs on one canvas without a warning. | Code read. | Fixed: caption counts undrawn wells and warns on mixed frames (`mapFrameSummary`). |
| WDM-U1-017 | S3 | PL4, PL5 | A cleared surface coordinate was drawn at the origin, dragging the map extent: `Number(null)` is 0, so the PT8 guard never worked. | `mapFrameSummary` test negative control. | Fixed. |
| WDM-U1-018 | S3 | PL12 | The harness backend dropped `crs`, `xy_unit` and `crs_provenance`, so no CRS path had ever run in the harness. | e2e PL3 first run. | Fixed. |
| WDM-U1-019 | S3 | PL1, PL3 | A LAS-imported well with no KB is stored at KB 0; the new TVDSS then equals TVD with no explanation. | Dark screenshot. | Fixed: note on the Tops tab. |
| WDM-U1-020 | S3 | PL3, PL8 | Display is metres only (logs, tops, survey, TD); only checkshots have a view-as unit. A feet-based Petrel or US user reads everything converted. | Persona walk. | Open, Step 2 batch A (U2-001). |
| WDM-U1-021 | S3 | PL7, PL8 | No file export from the data manager: no LAS, tops CSV or survey export (the LAS writer exists; Petrophysics uses it). Only the .pld package. | Persona walk. | Open, Step 2 batch A (U2-002). |
| WDM-U1-022 | S3 | PL12, PL8 | No in-app help guide; every other Geoscience app has one. | `ls src/pages/apps/WellDataManager`. | Open, Step 2 batch A (U2-003). |
| WDM-U1-023 | S3 | PL6 | At 390 wide the workstation keeps its 960 px minimum and scrolls inside the shell; tree and map are not both reachable. Shared `WorkspaceShell` (Seismolord identical). | Screenshot 390. | Open: product decision on phone support for workstation apps. |
| WDM-U1-024 | S4 | PL2 | Comma-decimal LAS data is refused (clear, line-numbered); a truncated row is refused without a line number. | Hostile files. | Open: parser is vendored (engines repo first). |
| WDM-U1-025 | S4 | PL6 | The quick view carries no ChartLogo. Petrophysics and Correlation log tracks do not either (logs treated as log paper, not charts). | Code read. | Open: owner decision on whether the chart standard covers log tracks. |
| WDM-U1-026 | S3 | PL1, PL3 | No datum model: KB is "above datum" without naming it; checkshot time assumes SRD = MSL; no GL, water depth or datum type fields. | Schema read. | Open, Step 2 (U2-007, needs a migration). |
| WDM-U1-027 | S4 | PL5 | Two browser tabs: an edit in one is not seen in the other until reload. | Walk. | Open, Step 2 batch C. |
| WDM-U1-028 | S3 | PL8 | Tops grid edits delete removed rows on save with no undo. | Walk. | Open, Step 2 batch B. |
| WDM-U1-029 | S4 | PL10 | Import to the live registry uploads curves one by one with no progress or cancel (harness 0.2 s; live not measured). | Code read. | Open, Step 2 batch B. |
| WDM-U1-030 | S4 | PL6 | The wells tree clips its TD column at the default panel width. | Screenshots. | Open (cosmetic). |
| WDM-U1-031 | S3 | PL2 | LAS 3.0 text and date-time channels are still skipped (named in the preview). | `las30_tops_strings.las`. | Open, Step 2 batch C. |
| WDM-U1-032 | S3 | PL5 | Curves stored bottom-up by earlier releases stay descending (quick view plots them by sample index). New imports are fixed; stored ones need a one-time reorient. | G1 fixture. | Open, Step 2 batch B (U2-010). |
| WDM-U1-033 | S4 | PL7 | No printable well data sheet (header, survey, tops, logs inventory). | Walk. | Open, Step 2 batch C. |

19 findings fixed (6 S2, 10 S3, 3 S4), 14 left open (8 S3, 6 S4). No S1.

### Persona walks (PL8)

**1. Petrel / Techlog data manager (loads a field of wells before the geologists arrive).**
Opens WDM, imports a Schlumberger LAS for well 3: *before*, the file (TDEP, logged bottom-up) landed as "irregular step", TD suggested at the top of the log, and Petrophysics later said the well had no depth curve. *Now* the preview says it was logged bottom-up and reversed, and Petrophysics opens it. Imports the Petrel LAS export: X/Y and KB now come from the file. Pastes the Petrel well tops export (Surface, MD (ft)): *before*, stored in metres as typed; *now* the MD unit flips to feet from the header. Would now: open a well tops spreadsheet across all wells and edit in bulk (missing, U2-005); batch-load 40 LAS files matched by UWI (missing, U2-004); set well attributes such as field, operator, spud date, GL (missing, U2-007); export the cleaned set as LAS and tops CSV to hand to a contractor (missing, U2-002); flip the display to feet (missing, U2-001).

**2. Graduate geologist (first week, has a LAS and a tops list from a supervisor).**
Imports the LAS: the header form now keeps its labels, so KB and TD are not confused. Picks a CRS; the new unit selector says what the X/Y numbers are in. Pastes tops, looks at the Tops tab: TVD and TVDSS sit beside MD; the note explains that TVDSS equals TVD because KB was never set, and where to set it. Clicks a trash icon by mistake on GR: it now asks first. Would now: read a help page that explains KB, TVDSS, datum and CRS in plain words (missing, U2-003); see a QC summary of what might be wrong with the well (missing, U2-006).

**3. Manager reading output (checks what the team has loaded before a partner meeting).**
Opens the map: the caption says which coordinate system the wells are in, warns when they mix, and says how many wells have no location. Opens a well's Header and Tops. Would now: print or export a one-page well data sheet to attach to the meeting pack (missing, U2-011); see a registry inventory table (wells x logs x tops x survey x checkshots completeness) rather than well by well (missing, U2-006).

## Step 2: advancement review (analysis only)

### 2a. Competitor parity

Sources: public documentation and product pages (Petrel data import and well tops spreadsheet [petrofaq](https://petrofaq.net/wiki/Petrel_Data_Import); Petra LAS import help [S&P Global](https://onlinehelp.ihs.com/Energy/Petra/2020/Content/1-Overview/ovr_import_las.htm); Kingdom well data overview [IHS](https://kingdom.ihs.com/pages/kb/help/tks_latest/WE_Overview.html); Techlog Base [SLB](https://www.software.slb.com/products/techlog/techlog-core-systems/base); OSDU WellLog / WellboreMarkerSet definitions [OSDU](https://community.opengroup.org/osdu/data/data-definitions/-/blob/master/E-R/work-product-component/WellLog.1.1.0.md), [AWS OSDU data types](https://aws.amazon.com/blogs/industries/osdu-data-platform-on-aws-ingestion-series-1-overview-of-data-types-for-osdutm-data-platform/), [Log I/O OSDU WellLog](https://petroware.no/products/logio/javadoc/no/petroware/logio/osdu/OsduWellLog.html)).

| Capability | Leader and how | Ours | Gap | Demo-visible |
|---|---|---|---|---|
| Log formats | Techlog: DLIS, LIS, LAS 2/3, WITSML, CSV. Petra: LAS batch, raster logs | LAS 1.2, 2.0, 3.0 (logs, tops, core and lithology blocks) | partial (no DLIS, WITSML, raster) | yes, "can I load DLIS?" |
| Batch import matched to wells | Petra batch LAS; Petrel imports many LAS and matches by name/UWI | One file at a time; picks target well | missing | yes |
| Index handling | Petrel asks for the index type (MD; TVD; X,Y,Z) | MD only; other indexes now refused with a reason | partial (no TVD-indexed import via the survey) | no |
| Unit families and display units | Techlog families and units per variable; Petra unit tab; Petrel unit system | SI store, converted at the door; display metres only | worse (display) | yes |
| Depth restriction, overlap control on load | Petra depth range, sample rate, overlap options | Merge onto the well grid with keep-both / replace | partial | no |
| Well header attributes | Petrel well manager spreadsheet with attributes; OSDU Well/Wellbore (field, operator, datums, facility events) | Name, UWI, X/Y, CRS, KB, TD, status | partial (no field, operator, spud, GL, water depth, datum type) | yes |
| Datums (vertical measurements) | OSDU VerticalMeasurements (KB, DF, GL, MSL, SRD); Petrel SRD | KB above an unnamed datum; SRD = MSL assumed | missing | partly (a Petrel user asks for SRD) |
| Well tops spreadsheet across wells | Petrel well tops spreadsheet; paste rows from Excel | Per-well grid + paste; typed tops (surface type, unit, age) | partial | yes |
| Tops in MD / TVD / TVDSS / TWT | Petrel tops carry MD, Z, TWT | MD, TVD, TVDSS (new); no TWT column | partial | yes |
| Deviation survey with computed TVD, DX, DY | Petrel, Kingdom | MD, Inc, Azi only on screen (engine computes the path) | partial | yes |
| Time-depth (checkshots) | Kingdom local and shared T-D charts; Petrel checkshots | Entered as MD/TVD/TVDSS, OWT/TWT, m/ft, editable; Seismolord tie-derived set shown | none (for one set per well) | no |
| Log QC and inventory | Techlog multi-well spreadsheet, data inventory | Per-well log table (nulls, step, source) | partial | yes |
| Log editing, splicing, depth shift | Techlog Base editing; splice runs | In Petrophysics Studio (depth shift, conditioning); WDM merges runs | partial | no |
| Export | Petrel/Techlog/Petra export LAS, ASCII | .pld package only in WDM; LAS writer exists | missing | yes |
| Sharing and access | Petrel Studio repository; OSDU entitlements | Private by default; org read-only share | partial (no team editing) | yes |
| Provenance | OSDU lineage; Techlog history | Per-log provenance (source file, conversions, reversal, rename) | none | no |
| Map of wells | Petrel/Kingdom base maps with symbols | Canvas map, status field exists; frames now stated | partial (no symbols, scale bar, labels toggle) | yes |

### 2b. Deferred backlog harvest

| Item | Source | Decision |
|---|---|---|
| LAS 3.0 `~Tops_Data` import | las3 memory, STATUS 2026-09-03 | Done in Step 1 (U1-009) |
| LAS 3.0 text and date-time channels | las3 memory | Still wanted, low (batch C) |
| QC flags | Geoscience-ROADMAP G1 | Still wanted (U2-006) |
| Bulk operations | Geoscience-ROADMAP G1 | Still wanted (U2-004, U2-005) |
| Signed-in staging smoke: WDM well visible in Seismolord | STATUS G1.4 owner follow-up | Still wanted, owner run |
| Org-wide editing of shared wells (v1 is read-only) | PLAN open question 1 | Still wanted, needs an RLS migration and second-engineer review (U2-012) |
| Registry writers do not stamp `app_build` | pp0 state-version memory | Still wanted, small (U2-013) |
| Storage egress: revisit per-log objects if profiling says so | PLAN risks | Dropped: PL10 shows no need |
| `.pld` import fails on duplicate names | Petrophysics inputs | Superseded: fixed 2026-09-03 (ProjectPortability-STATUS) |
| Replace-from-paste render loop | STATUS W4A | Superseded: fixed 2026-09-28 |
| Checkshots provenance migration | STATUS PT1 | Superseded: applied 2026-09-03 |

### 2c. Suite integration

**Writes:** `geo_wells` (header, CRS, status, deviation, checkshots + provenance), `geo_wells_logs` + f32 objects in the `wells` bucket, `geo_wells_tops` (typed), `geo_wells_intervals`, `geo_wells_core_images`. `.pld`: all of these families (`geoscienceSpec.js`).
**Reads:** `geo_strat_units` (Unit column), Seismolord's `checkshots_derived` (note only).
**Readers of what it writes:** Seismolord, Petrophysics, Well Correlation, Stratigraphy, Mapping, Earth Modeling, ReservoirCalc Pro registry panel, Rock Physics, Pore Pressure, Geomechanics, Wellsite Studio, Stimulation Designer, Data Quality Studio, ML Workbench; Well Design Studio publishes into `geo_wells`.
**Links out:** Open in (Petrophysics `?well=`, Correlation `?wells=`, Mapping `?wells=`, others explorer), Map this top, deep link in `?well=&tab=`.

| Finding | Kind | Detail |
|---|---|---|
| Petrophysics zones and computed curves are invisible as such | downstream result not shown | `geo_wells_zones` never shown in WDM; computed curves (provenance `computed`, engine `petrophysics-studio`) look like measured logs. Show a Zones tab and a "computed by" badge (U2-008). |
| Well Design publishes, Wellsite drills, WDM does not show either | upstream ignored | A published design carries `crs_provenance.source = well-design-studio`; Wellsite live surveys never reach the registry survey. Show the source and offer "update survey from Wellsite" (U2-009). |
| Site datum-transform override ignored by readers (cross-cutting, CRS programme) | handoff loses context | Well Design records `crs_provenance.datum_transform` (e.g. a chosen Minna to WGS 84 transform), but `reprojectProject`, Seismolord's lat/lon readouts and `placeWellLocation` call `getTransformer` with the catalog default. A well reprojected across datums moves by the difference between the two transforms (metres to tens of metres for Minna). Fix: one helper `transformOptsForRow(row)` in `src/lib/crs` passed by every reader; show the override on the WDM Header (U2-014). |
| Legacy `GeoscienceHub.jsx` (cross-cutting) | dead end | `/dashboard/apps/geoscience/hub` is routed but linked from nowhere; three of its six cards point at redirect slugs (`well-correlation-tool`, `petrophysics-estimator`, `petrophysical-integration-suite`), two of them duplicates of Petrophysics Studio; it omits WDM, Seismolord and Mapping. Replace the route with a redirect to `/dashboard/geoscience`, delete the page and its theme test, and check the `master_apps` row `geoscience-hub` (U2-015). |
| Datum and SRD lost at every handoff | handoff loses context | KB is the only vertical reference; Seismolord ties and Correlation TVDSS assume MSL = SRD (U2-007). |
| Display units | handoff loses context | Correlation has m/ft; WDM does not, so values differ in unit between apps (U2-001). |
| Bottom-up curves stored by G1-era imports | stored state | Readers index them by sample; a one-time reorient (U2-010). |

### Ranked backlog

Sizes: S under a day, M two to four days, L a week or more.

| Rank | ID | Item | Size | Value in one line | Batch |
|---|---|---|---|---|---|
| 1 | U2-001 | Display unit system (m / ft) for logs, tops, survey, header, map, stored per user | M | A feet-based Petrel or US user reads their own numbers everywhere | A |
| 2 | U2-002 | Export from WDM: LAS (per well, chosen curves), tops CSV, survey CSV, in the display unit | S | Hand clean data back to Petrel/Techlog or a contractor in one click | A |
| 3 | U2-006 | Registry inventory and QC: wells x logs/tops/survey/checkshots/CRS/KB completeness, with flags (no KB, no CRS, mixed frames, irregular step, bottom-up legacy) | M | The data manager's first screen, and a strong demo: "what is missing in my field" | A |
| 4 | U2-003 | In-app help guide (KB, TVDSS, datum, CRS, LAS door, merge rules, Open in) | S | Graduates and testers stop guessing; matches every other Geoscience app | A |
| 5 | U2-005 | Well tops spreadsheet across wells (filter, paste from Excel, bulk rename) | M | Petrel's most-used data screen; feeds Correlation and Mapping | A |
| 6 | U2-004 | Batch LAS import matched to wells by UWI or name, with a review table | M | A field loads in one pass, not 40 dialogs | B |
| 7 | U2-014 | Honour the site datum-transform override in every reader (cross-cutting) | S | Wells stay put when a project is reprojected across datums | B |
| 8 | U2-015 | Retire legacy GeoscienceHub (cross-cutting) | S | Removes a dead page with broken-looking cards | B |
| 9 | U2-010 | One-time "reorient stored bottom-up curves" action (flagged by U2-006) | S | Old imports read like new ones in every app | B |
| 10 | U2-008 | Zones tab and computed-curve badges from Petrophysics | S | Integration visible in the demo: WDM shows what other apps produced | B |
| 11 | U2-007 | Datum model: GL, DF, water depth, SRD, datum type (migration on `geo_wells`, staging first) | M | Correct TVDSS and time for offshore and land wells; OSDU alignment | B |
| 12 | U2-009 | Show source (Well Design publish, Wellsite live well) and offer survey update from Wellsite | M | Closes the plan, drill, interpret loop | C |
| 13 | U2-011 | Printable well data sheet (PDF) with the PL7 header | S | Manager and partner packs | C |
| 14 | U2-012 | Team editing of shared wells (RLS, second-engineer review) | M | Teams work one registry | C |
| 15 | U2-016 | Tops grid undo; checkshot elevation toggle (negative Z) | S | Data safety and Petrel paste parity | C |
| 16 | U2-017 | LAS 3.0 text/date-time channels as interval or annotation data | S | Nothing in a LAS 3.0 file is left behind | C |
| 17 | U2-018 | DLIS import (engines repo, oracle first) | L | Removes the most common "can it load...?" objection | C |
| 18 | U2-013 | Registry writers stamp `app_build`; upload progress and cancel for large imports | S | Saved-state traceability; honest progress on slow links | C |

Batch A (demo-visible, NAPE-safe, no schema change): U2-001, U2-002, U2-006, U2-003, U2-005.
Batch B: U2-004, U2-014, U2-015, U2-010, U2-008, U2-007 (U2-007 needs a migration and review).
Batch C: U2-009, U2-011, U2-012, U2-016, U2-017, U2-018, U2-013.
