# Stratigraphy Studio, STATUS

Plan of record: docs/scope/Stratigraphy-PLAN.md (approved as recommended
2026-09-06, PR #411). Roadmap slot: Geoscience-ROADMAP.md Phase G9, the
eleventh Geoscience tile. Slug `stratigraphy-studio`, route
`/dashboard/apps/geoscience/stratigraphy-studio`, harness
`/dev/stratigraphy-studio`. Engines: `packages/engines/engines/stratigraphy/`
(central repo Petrolord/petrolord-engines, subtree-vendored).

## Phase status

| Phase | Status | Landed |
|---|---|---|
| ST0 stratigraphic framework | **COMPLETE 2026-09-06: migration APPLIED, pentest green, PR #412 merged** | engines #140 (vocabulary, ICS 2023/09 timescale, column tree; 66 tests); Suite branch `feat/st0-stratigraphic-framework`: migration 20260906180000 (geo_strat_units + typed-top columns), stratRegistry.js, typed tops through wellsRegistry, typed markers in Well Correlation and Petrophysics, Type/Unit/Confidence/Age in the Well Data Manager tops tab, the Stratigraphy Studio app (Column editor, Tops typing, Glossary, terminology display option), portability spec + hook, guard test, pentest SQL, e2e |
| ST1 lithology, core and facies | **COMPLETE 2026-09-06: migration APPLIED, pentest green, PR #413 merged** | engines #141 (lithology vocabulary, interval arithmetic, LAS 3.0 blocks to intervals; 66 tests, fixture las3_intervals_30); Suite branch `feat/st1-intervals-core-images`: migration 20260906200000 (geo_wells_intervals + geo_wells_core_images), stratRegistry intervals + core photo services, `intervals:<kind>` strip in the shared track layout, Petrophysics facies publish, Well Correlation lithology strip, Well Data Manager Intervals + Core tabs and LAS 3.0 block import, Stratigraphy Studio Intervals + Core views, portability, e2e |
| ST2 sequence stratigraphy + Wheeler | **COMPLETE 2026-09-06: migration APPLIED, pentest green, PR #414 merged** | engines #142 (age-depth model, Wheeler cells, stratigraphic stretch, tracts from surfaces; hand-derived three-well golden); Suite branch `feat/st2-sequence-wheeler`: migration 20260906220000 (strat_projects + tops.hiatus_to_ma), CrossSection and the section frame moved to `src/components/wells/section/` with the section state as `useSectionWells`, stretch datum + tract and motif bands + ghost curve in the shared painter, Stratigraphy Studio Section and Wheeler views, hiatus end in Tops typing, systems tracts in the interval editor, e2e |
| ST3 biozones and ages | **COMPLETE 2026-09-06: PR #415 merged (no migration)** | engines #143 (basin layers from dated tops); Suite branch `feat/st3-biozones-ages`: Ages view (age-depth plot with rates and hiatuses, ICS stage per surface), biozone ranges in the interval editor and biozone datum tops, Send to Basin & Charge Modeling |
| ST4 stratigraphic maps | **COMPLETE 2026-09-06: PR #416 merged (no migration)** | engines #144 (thickness and environment control points between two tops); Suite branch `feat/st4-strat-maps`: net sand / gross / net-to-gross grids in Mapping, facies and paleogeography polygons, the environment table, the `?net=` deep link, Mapping launchers from the studio's section (per tract) and column (per unit) |
| ST5 seismic stratigraphy | **BUILT 2026-09-06, PR open (no migration)** | engines #145 (proportional stratal slice, section flatten offsets); Suite branch `feat/st5-seismic-stratigraphy`: flatten on a horizon in the Seismolord section (shader chunk + overlays + pick inverse, Home tab select, saved with the session), the stratal slice attribute in the export dialog, termination markers (Interpretation tab, section overlay, session) |

## ST0, what shipped

**Engines (petrolord-engines PR #140, merged, subtree ec85d59).**
- `vocabulary.js`: the ten stored surface codes (`formation_top`, `SU`,
  `CC`, `BSFR`, `RSME`, `MRS`, `TRS`, `MFS`, `unconformity`, `biozone`),
  five systems tracts, five log motifs, three stacking patterns.
  `displayLabel(code, scheme, {kind, short})` returns the label of the
  chosen scheme with `fallback: true` where Exxon has no term (RSME, FSST,
  RST). `surfaceLineStyle(code)` is the marker style every painter uses.
  `expectedTract(lower, upper)` names the tract a pair of surfaces bounds
  (depositional-sequence model with CC sensu Hunt and Tucker, plus the
  T-R model), `certain: false` when an internal boundary was not picked.
- `timescale.js`: the ICS International Chronostratigraphic Chart
  v2023/09 (CC BY 4.0) as committed data: 102 Phanerozoic ages plus the
  Precambrian, `approx` flagged where the chart says "~". Lookups by name
  and by age (`unitsAt`, `unitAt`, `unitsBetween`, `lineage`). Guard tests
  pin the K/Pg boundary at 66.0, Tr/J at 201.4, base Cambrian at 538.8 and
  gap-free tiling at every level.
- `column.js`: unit tree (`buildColumnTree`, `orderedUnits`),
  `validateColumn` (orphans, cycles, rank order, age order, ages outside
  the parent), `inheritedTopAge`.

**Migration 20260906180000 (APPLIED 2026-09-06 by the owner, the second-engineer review).** New
`geo_strat_units`; additive `surface_type`, `unit_id`, `confidence`,
`age_ma`, `notes` on `geo_wells_tops` with check constraints. A jest
guard reads the migration and compares the check list with the engine's
`SURFACE_CODES`. Live pentest in `tools/validation/stratigraphy/rls-pentest.sql`
(four blocks: private units, org read-only, typed tops ride the tops RLS
and refuse bad codes, delete clears references without cascading).

**Services.** `src/lib/stratRegistry.js` (units CRUD, `shareColumn`,
stamped through stateVersion kind `strat-unit`). `wellsRegistry.js`
`saveTop`/`updateTop`/`replaceTops` accept the typed fields through
`topRow`; callers that never heard of them are unchanged.

**Consumers opted in.**
- `paintTopMarker` takes `style` and `label`; Well Correlation's section
  and Petrophysics' track viewer draw each top with its type's line style
  and put the typed abbreviation in front of the name (formation tops
  unchanged). The section exposes `data-top-types` and `data-scheme` for
  the e2e.
- Well Data Manager tops tab: Type (select, scheme-labelled), Unit
  (select from the column), Confidence, Age (Ma) columns in the grid and
  the table; `RowGridEditor` gained a `select` column type. The backends
  expose `listUnits`.
- The in-memory backends of Well Correlation, Petrophysics and Well Data
  Manager carry the typed fields; the correlation sample types Mid Shale
  as MFS and Base Sand as SU.

**Stratigraphy Studio app** (`src/pages/apps/StratigraphyStudio/`).
Workstation on the shared shell: ribbon (Geoscience home, view buttons,
terminology select `strat-scheme`, dock toggle), explorer (registry wells,
the column as a tree, a Well Data Manager link), centre views Column
editor (`ColumnEditor`: ranks, parents, sibling order, ages typed or
filled from an ICS stage, colours; save validated by the engine and
refused as a whole on a problem; new parents saved before new children),
Tops typing (`TopsTyping`: type, unit, confidence, age per top of the
selected well; the tract a typed pair bounds shown read-only), Glossary
(both schemes, fallback badges), dock legend. Registry and in-memory
backends; jest (backend + components, 19 tests) and e2e
`e2e/stratigraphy-studio.spec.js`.

**Terminology display option.** `src/lib/stratigraphy/scheme.js`:
localStorage `strat.scheme`, `useScheme()` follows changes in the page
and across tabs. Every painter and list reads it. The guard test greps
`src/` for Exxon labels outside the engine, so a component can never
store or compare one.

**Portability.** `geoscienceSpec.js` gains `geo_strat_units` (scope
user/org, stamped, optional self reference) and the optional
`unit_id` soft reference on tops; the collector hook pulls the units a
packaged top names, with their ancestors; import order puts units before
tops.

## ST1, what shipped

**Engines (petrolord-engines PR #141, merged, subtree cc7ef4c).**
- `stratigraphy/lithology.js`: sixteen lithologies with industry colours
  and the abbreviations mud logs write (SST, SH, LS, DOL, ANH, SALT ...),
  Wentworth grain sizes, twenty depositional environments, the eight
  interval kinds and five sources. `resolveLithology` takes the first
  recognised token ("SST W/ SH STRINGERS" is sandstone) and returns null
  for anything unknown, never a guess.
- `stratigraphy/intervals.js`: `validateIntervals` (overlaps per kind,
  base below top, kind, code), gaps, `intervalAt`, `mergeAdjacent`,
  `rasterizeIntervals` (per-sample category index on a depth vector, top
  inclusive), `intervalsFromRuns` (run-length encode a categorical curve;
  NaN breaks a run; the last sample covers one median step),
  `thicknessByCode`.
- `welldata/lasParse.js` now returns every non-log LAS 3.0 block as
  `blocks` (definition columns, parameters, text rows), still listed in
  `ignoredSections` for the import preview. `welldata/lasBlocks.js` maps
  Core / Lithology / Facies / Env blocks with a top and base column to
  interval rows (feet to metres, codes resolved, bad rows named, point
  blocks such as core plugs and tops skipped). Fixture
  `las3_intervals_30.las` and golden `las3_intervals_30.intervals.json`
  from `genfixtures.py`, answers derived by hand.

**Migration 20260906200000 (APPLIED 2026-09-06 by the owner, pentest green).** `geo_wells_intervals` and
`geo_wells_core_images`, registry children of the well. Pentest in
`tools/validation/stratigraphy/rls-pentest-st1.sql` (seven blocks).

**Services.** `stratRegistry.js` gains `listIntervals`,
`replaceIntervals` (per kind, all-or-nothing), `saveInterval`,
`updateInterval`, `deleteInterval`, `listCoreImages`, `uploadCoreImage`
(type, 5 MB and 200 MB per well refused before storage; the object is
removed again if the row insert fails), `updateCoreImage`,
`deleteCoreImage`, `coreImageUrl` (signed URL). `wellImport.js` gains
`buildIntervals` and header synonyms for top, base, code, label,
description.

**One painter, four hosts.** A strip track may now name
`intervals:<kind>`; `resolveTracks` rasterizes the well's interval rows
onto its depth vector with the vocabulary colours (facies rows use their
own colour). The lithology quicklook template carries a registry
lithology strip and reaches saved layouts through the built-in refresh;
the layout editor offers strip sources and an "Add strip" button.
Petrophysics, Well Correlation, Well Data Manager (through the shared
layouts) and Stratigraphy Studio all draw from it.

**Petrophysics.** Wells load their intervals; the ribbon gains "Facies"
(`petro-publish-facies`): the crossplot polygons become registry facies
intervals on the well through `intervalsFromRuns` (the polygons stay in
`petro_projects`).

**Well Correlation.** Section wells load their intervals; the sample
section seeds a lithology log per well cut at its tops, so the harness
draws a lithology strip under the lithology quicklook template.

**Well Data Manager.** LAS import: a LAS 3.0 file with interval blocks
shows "Import N intervals from the ... blocks" (on by default, replaces
those kinds on the well) and names dropped rows. Two new tabs on the
detail view, Intervals (`IntervalsEditor`) and Core (`CoreImagesPanel`),
both shared components in `src/components/wells/` hosted here and in
Stratigraphy Studio. The backends expose the interval and core photo
services.

**Stratigraphy Studio.** Intervals view (one kind at a time: table with
lithology, grain size, environment and description pickers, paste-replace
door with feet conversion and abbreviation resolution, engine validation,
thickness by code) and Core view (upload with depths and caption, list,
edit, delete, depth-registered strip).

**Deleted.** `src/pages/apps/CoreImageAnnotator.jsx`, the 84-line shell
with no route or importer.

**Portability.** `geo_wells_intervals` and `geo_wells_core_images` as
children of the well; a core image's blob keeps its own content type
(the collector and importer accept a per-row content type function).

**Gotcha recorded.** `PasteReplacePanel` memoizes its parsed state on the
`fields` array; a host that passes a fresh literal per render re-parses
and re-emits forever (a hung jest, a hung page). Pass a hoisted constant.

## ST2, what shipped

**Engines (petrolord-engines PR #142, merged, subtree 6fc8e91).**
- `ageDepth.js`: piecewise-linear age-depth between dated surfaces with a
  hiatus where a surface carries `hiatus_to_ma`; inversions, bad hiatus
  bounds and duplicates refused by name; `ageAt` / `depthAt` exact
  inverses; accumulation rates; an event bed gets a null rate.
- `wheeler.js`: deposition and hiatus cells per well with the systems
  tract the bounding surfaces imply (`expectedTract`), certainty carried,
  age axis and boundaries, skipped wells named, `cellAt` (a hiatus wins
  over the cells touching it).
- `stretch.js`: `makeStretch` (two surfaces onto two datum lines, rigid
  outside, exact inverse) and `computeStretch` (a well with one surface
  shifts rigidly and is flagged partial; with neither it is drawn true
  and flagged). `wellcorrelation/section.js` `displayedDepth` accepts a
  mapping, so every painter that used a numeric shift now takes either.
- `sequence.js`: `tractsFromSurfaces` (rows for `geo_wells_intervals`
  kind `systems_tract`, uncertain ones flagged), `stackingFromMotifs`.
- Golden: `test-data/stratigraphy/wheeler-synthetic.json`, a three-well
  clinoform with an SU whose hiatus differs per well and a CC at the
  distal well; the README derives every cell and rate by hand. 52 tests.

**Migration 20260906220000 (APPLIED 2026-09-06 by the owner, pentest green).** `strat_projects` (app-private view
state) and `geo_wells_tops.hiatus_to_ma` with its check. Pentest in
`tools/validation/stratigraphy/rls-pentest-st2.sql` (six blocks).

**The second consumer.** `CrossSection.jsx` and `sectionFrame.js` moved
to `src/components/wells/section/` (re-export shims at the old paths),
and the section state that CorrelationWorkstation assembled (registry
wells, order, per-well tops / curves / intervals, the saved section's
datum, template layouts, unit, reference, spacing, zones, shown tops,
the resolved section wells) moved unchanged into
`useSectionWells(backend, {deepLinkWells, onStatus})`. Well Correlation
and Stratigraphy Studio call the same hook over the same
`geo_correlation_sections` row (`src/lib/sectionsRegistry.js`, lifted
out of the Well Correlation backend). The Well Correlation e2e is
unchanged and green on the refactor.

**The shared painter gained three things.** A `stretch` datum mode
(`{mode: 'stretch', upperName, lowerName}`, two datum lines, per-well
notes when only one surface is present); `bands` (fills under the
tracks in each well's own MD, hatched for uncertain tracts, outline
form for motifs); `ghost` (the source well's first track drawn
translucent on the target column at a shift). The section wrapper
exposes `data-datum-mode`, `data-band-count` and `data-ghost`. Well
Correlation's controls offer the stretch datum and a ghost curve, which
closes two of its wave 3 follow-ups.

**Stratigraphy Studio.** Section view: the shared section with every top
drawn by type, the implied systems tracts as fills (recorded ones win
once "Record tracts" writes them to the own wells' shared intervals),
motifs outlined, ghost curve, stretch datum, "Save view" into
`strat_projects`. Wheeler view: `WheelerChart` (SVG, ICS stages behind
the columns, cells coloured by tract, hiatus hatched, labels in the
display scheme). Tops typing gains "Hiatus to (Ma)" for SU and
unconformity picks, refused unless older than the age. The interval
editor gains the systems-tract kind with a stacking column. The sample
section gained a fourth top (Top Marker, BSFR, 4 Ma) and ages so the
harness draws a Wheeler chart without typing.

**Acceptance.** The synthetic reproduces its golden cells (engines). On
the harness, typing Top Dome MFS and Mid Shale MRS on KETA-1 (Base Sand
is already SU, Top Marker BSFR) gives HST, TST and LST fills on the
section and a Wheeler column of HST, TST, LST and the hiatus, with the
Exxon display relabelling and the stored codes unchanged. Note: HST
needs a surface above the MFS (a BSFR or a formation top over a CC); SU,
MRS and MFS alone give LST and TST, as the plan's wording implied but
did not say.

## ST3, what shipped

**Engines (petrolord-engines PR #143, merged, subtree 76e04d8).**
`basinLayers.js`: a Basin & Charge Modeling layer table from a well's
dated, typed tops and its lithology log: youngest first, Basin's own
lithology list (sandstone, shale, limestone, salt, coal) with the
registry classes mapped onto it, deposition ages from the bounding
surfaces (an unconformity above a layer ends its deposition at the older
bound of the hiatus), the dominant lithology by thickness from the
interval log, and every unconformity with a known hiatus as an erosion
event whose amount is declared unknown. Undated layers keep the Basin
importer's placeholders and the `agesGuessed` flag. Tested on the
Wheeler synthetic's W1 with a lithology log.

**No migration.** A biozone datum is a top of type `biozone` with its
age and confidence, the zonation scheme and zone in `notes`. A biozone
range is an interval of kind `biozone_interval` with `properties`
{scheme, age_top_ma, age_base_ma}. A Basin model is a `bf_wells` row
written through Basin's own backend.

**Ages view** (`AgesView`, `AgeDepthPlot` in `src/components/wells/
section/`): the selected well's dated surfaces as an age-depth plot with
the constant rate of each segment written on it and a hiatus bar at every
dated unconformity; a rates table; the ICS stage of each dated surface
(`unitAt`); the biozone ranges of the well turned into two typed datum
tops each ("Biozone datums"); "Send to Basin" builds the model row
(`src/lib/basinHandoff.js`) and writes it through Basin's backend, with
the registry well remembered as the model's tie and the problems (unknown
erosion amounts, placeholder ages) in the status; "Open Basin" link.

**Editors.** Tops typing gains "Scheme / notes" (the biozone scheme and
zone for `biozone` picks). The shared interval editor gains the biozone
kind with scheme and age columns; its status names the kind properly
("1 biozone interval saved").

**Acceptance.** On the harness, KETA-1's plot shows the two rates the
tests derive by hand (140 m/Ma between Top Marker and Mid Shale, 16 m/Ma
between Mid Shale and Base Sand) and the 10 to 14 Ma hiatus; a biozone
range NN12 (5.6 to 8.3 Ma) becomes two dated biozone tops; Send to Basin
creates "KETA-1 stratigraphy" with 4 layers, 1 dated, 1 erosion event.

## ST4, what shipped

**Engines (petrolord-engines PR #144, merged, subtree 51cfe76).**
`stratMaps.js`: `thicknessPoints(wells, upper, lower, {intervalsByWell,
measure, codes})` gives one control point per well carrying both tops
and a location: gross thickness, net thickness of a lithology family
(the sand family by default, abbreviations resolved through the
vocabulary) from the well's lithology log, or the net-to-gross ratio;
every skipped well is named by reason (no upper, no lower, inverted, no
location, no lithology). `environmentPoints` posts the environment that
dominates the interval by thickness (environment intervals, and a core
description's environment). Thicknesses are measured-depth thicknesses
and the provenance says so (`thickness_basis: 'md'`); true vertical
thickness is a later correction.

**No migration.** Facies and paleogeography polygons are `geo_culture`
rows with `kind` `facies` or `paleogeography` (the column is free text);
the grids are `geo_surfaces` rows of kind `isochore` (net and gross) or
`attribute` (ratio).

**Mapping & Surface Studio.** The source picker gains "Stratigraphy:
between two tops" (net sand, gross, net to gross) with upper and lower
top selects and the lithology codes counted as net; the environment
between the tops is listed per well with its colour. Gridding, kriging,
fault blocks and clipping work unchanged on the new source; the published
row's provenance names the two surfaces, the measure, the codes and the
thickness basis. Two new polygon buttons, Facies and Paleogeography: a
polygon named after a lithology or an environment takes the vocabulary
colour, fills at its own opacity (the shared culture painter now honours
`style.fill_opacity`), and is listed with its kind. The `?net=upper|lower
&measure=&wells=` deep link grids on arrival like `?top=` does. The
backends carry each well's interval rows; the harness seeds a lithology
log (sand between the tops at the seeded net-to-gross) and an environment
per well.

**Stratigraphy Studio launchers.** The section's controls list the
distinct surface pairs its tracts run between and open Mapping on the net
sand between them across the section wells; a unit in the column maps
through the top that names it.

**Acceptance.** On the harness, net sand between Top Dome and Base Sand
grids from the five wells (each well's net equals its seeded net-to-gross
times its gross) and publishes as a thickness surface whose provenance
names the two surfaces; a facies polygon named "sandstone" saves in the
sand colour; the environment table posts shoreface and shelf per well;
the deep link grids on arrival.

## ST5, what shipped

**Engines (petrolord-engines PR #145, merged, subtree 53981f0).**
- `seismolord/horizonAmplitude.js` `extractStratalSlice(getBrick, geom,
  picksA, picksB, {fraction})`: the amplitude at z = zA + f (zB - zA) per
  cell through the parabolic `amplitudeAt`; fraction 0 and 1 reproduce
  the single-horizon value extraction bit for bit; the interval
  attribute's span walker, so the preflight is `bricksForStratalSlice`
  (identical to `bricksForIntervalAttribute`). Tested on a synthetic
  brick store whose amplitude is linear in sample, where fractional
  picks have exact answers.
- `seismolord/flatten.js`: `flattenOffsets(grid, geom, ori, idx, datum,
  positions)` gives the per-trace vertical offset (samples, NaN where
  untracked) that hangs an inline, crossline or traverse section on a
  horizon; `datumForHorizon` (the median tracked pick on the section);
  `sectionCell`; `shiftedSample`.

**No migration.** The flatten choice and the termination markers ride
in the session snapshot (`seismic_sessions.payload`, restored with the
volume); the stratal slice publishes through the existing amplitude
surface path (`geo_surfaces`, kind attribute, provenance carries the
second horizon and the fraction).

**Seismolord section flattening.** `viewer/shaderChunks.js` gains
`FLATTEN_GLSL` (uniforms `u_offset`, `u_flattenOn`, `u_offsetScale`; `flattenT`
shifts the sample coordinate per trace in data space before any
sampling, so gain, AGC, interpolation and co-render see the flattened
frame; untracked traces stay unshifted; shifted-out rows paint the null
colour). This is the only place the display math lives, the playbook
rule. `SliceRenderer.setFlatten(offsets)` uploads the offsets as a 1-D
R32F texture (unit 8), re-applied after context restore. `SliceView`
takes a `flatten` prop: the renderer receives it with the display params,
every overlay (horizons, registry surfaces, per-trace picks, fault
sticks, wells and tops, the seed pick, the ghost preview) shifts through
`shiftedSample`, and the pick inverse subtracts the trace's offset so a
pick made on a flattened section lands in true time. The wrapper exposes
`data-flatten`. In the panel, the Home tab's "Flatten" select lists the
visible horizons; the offsets are recomputed per displayed section from
the horizon's grid with the median pick as datum; the choice is saved
with the session and restored. Depth-domain sections and time slices do
not flatten.

**Stratal slices.** The export dialog's "Between two horizons" group
gains "Stratal slice (proportional)" with a fraction (0 on this horizon,
1 on the second); the panel's extraction dispatcher routes it to
`extractStratalSlice` with the same brick preflight as the interval
attributes, and the result exports or publishes as a registry surface
named with the fraction and the second horizon. The map window then
shows it like any attribute surface.

**Terminations.** The Interpretation tab gains a Terminations group: a
kind (onlap, downlap, toplap, truncation) and a Mark tool; a click on
the section places a marker at the lattice cell and sample, Alt+click
removes the nearest, Clear empties the list. Markers draw as a coloured
ring with the kind's initial on the sections and traverses that pass
through their cell, shifted with the flatten, and save with the session.
The kinds live in `InterpretationTab.jsx` (`TERMINATION_KINDS`), a
vocabulary rather than math, so not an engine.

**Verification.** Engines: 5 analytic tests. Suite jest: the flatten chunk
declares its uniforms and degrades to identity, the shims resolve, the
kinds are fixed (3 tests); the Seismolord suites stay green (577).
e2e on the section harness (`?flatten=1&term=1`): the section reports the
flatten and two markers with a clean console (WebGL pixels are not
readable in e2e, the playbook's known limit); the workspace harness shows
the Flatten select and the Terminations group. The full Seismolord
regression (24 tests across six specs) is green.

**Limits recorded.** The stratal slice is reachable through the export
dialog and the registry, not as a live map-window attribute mode; the
traverse window does not flatten in this version (the section window
does, for inlines and crosslines); markers are per session, not shared
rows.

## Deviations from the plan

- The tile is NOT seeded Archived in ST0 (plan section 7 said it would
  be). A throwaway Archived row plus a later flip is two migrations for
  nothing; the route is reachable by superadmins meanwhile and the tile
  seeds Active at close-out, in the same PR as the help guide. Recorded
  here so the close-out does not look for a row to flip.
- The pre-existing `appLinks` test expectation for Seismolord's harness
  path was stale since SL0 (red on main); fixed in this branch.

## Verification

- Engines: 66 tests + copy lint green in the central repo.
- Suite jest on the touched areas green (Stratigraphy Studio, lib/stratigraphy,
  components/wells, Well Correlation, Well Data Manager, Petrophysics,
  portability).
- e2e `stratigraphy-studio.spec.js` on the staging harness: column save,
  typed top, scheme toggle with fallback badge, read-only shared well,
  Well Correlation typed markers (ST0); seeded lithology log edited and
  saved with an overlap refused, a core photo uploaded into the depth
  strip, and a LAS 3.0 file with core and lithology blocks imported in
  Well Data Manager with its six intervals (ST1); the shared section in
  the studio with stretch datum, implied tracts, ghost curve, recorded
  tracts and saved view, and the LST / TST / HST typing with its Wheeler
  chart (ST2); the Ages view with its rates and hiatus, biozone datums
  from a range, and the Basin handoff (ST3); the tract and unit launchers
  (ST4). `mapping-surface-studio.spec.js`: net sand grid and publish,
  facies polygon, environment table, the net deep link (ST4). Regression
  specs for Well Data Manager, Petrophysics and Well Correlation green.
- Live RLS pentest 2026-09-06: all four blocks as expected (see MIGRATIONS.md row), zero residue.

## Close-out (ST0 acceptance, plan section 7)

Done in this build: a top typed MFS in Stratigraphy Studio draws as an MFS
in Well Correlation (same rows, typed marker) with the existing tops
reload; the Exxon toggle relabels it "Maximum flooding surface (MFS)";
FSST shows the fallback badge in the glossary. Migration applied and pentest run 2026-09-06; PR #412 merged. Remaining
for the owner: walk the app on staging.
