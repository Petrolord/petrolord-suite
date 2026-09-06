# Mapping & Surface Studio — STATUS

Plan of record: docs/scope/MappingSurfaceStudio-PLAN.md (**approved as
drafted 2026-07-13**, all four §8 questions confirmed). The 2026-09
Petrel-readiness program is docs/scope/MappingSurfaceStudio-ROADMAP.md
(MS series). Roadmap slot:
Geoscience-ROADMAP.md Phase G4. Slug `mapping-surface-studio` — **SHIPPED 2026-07-13, tile Active**.
Phase G4 complete (G4.0–G4.4). Live at
`/dashboard/apps/geoscience/mapping-surface-studio`.

Deferred (cuttable per plan §7): the ContourMapDigitizer fold-in as a
raster import wizard — the standalone digitizer stays as-is (it works;
its dead `useIntegration` import was stripped). Prod build upload:
**DONE 2026-07-14** — prod is current (main `e84f8a181`).

## Post-G4: org share toggle (2026-08-19) — DONE

Branch `feat/mapping-studio-share-toggle`. The G4.2 org-read RLS and
storage policies existed but the studio had no way to exercise them —
teammates could only receive surfaces shared from inside Seismolord's
explorer. The explorer's org/private badge is now the SHARE TOGGLE on
own rows (private ⇄ org-shared, read-only for members — the geo_wells
model); teammates' rows keep a passive read-only badge. Backend
contract gained `setSurfaceShared(surface, shared)` in BOTH backends
(registryBackend resolves the caller's org once per session and
explains "no organization" instead of failing; inMemoryBackend mirrors
the owner-only RLS guard). No DDL, no engines change. Tests: backend
jest (share/unshare/owner-only) + e2e share-toggle steps on the
harness; full run 194 suites / 2468 green, build green.

## Phase status

| Phase | Status | Landed |
|---|---|---|
| G4.0 extract gridding engine | **DONE** | this branch — gridding.js/surfaceExport.js/mapContours.js → src/lib/gridding/; Seismolord re-pointed; byte-goldens (griddingExport/faultGridding/rcpHandoff/mapContours) green |
| G4.1 surface engine + goldens | **DONE** | this branch — engine/surface.js (registry tops/zones → control points, spec derivation, bilinear resample, isochore/scalar/stats); 10 analytic tests; reuses the byte-golden gridSurface + grvAcreFt |
| G4.2 geo_surfaces + bucket + pentest | **DONE** | this branch — migration 20260713260000 **applied live**; geo_surfaces (org-read RLS) + private surfaces bucket + path policies; pentest block 12 (4 probes) green |
| G4.3 mapping workstation | **DONE** | this branch — MappingWorkstation (map canvas raster+contours+posted wells via shared mapContours; grid a top/zone-attr, isochore, publish to geo_surfaces, delete); surfacesRegistry service; /dev/mapping-surface-studio harness; 14 jest + e2e (grid→render→publish→isochore→delete) |
| G4.4 RCP reader + close-out | **DONE** | this branch — RCP SurfaceImportDialog reads geo_surfaces (surfaceToXyzText bridge, cross-app jest); dead DataExchangeHub/IntegrationContext deleted + shared_data_registry dropped (20260713270000, live); app page+route; tile Active (20260713280000, live). Contour digitizer fold-in DEFERRED (cuttable per §7) |

## Key facts

- Shared gridding/export/contour math lives at `src/lib/gridding/`
  (`gridding.js`, `surfaceExport.js`, `mapContours.js`, `numeric.js`).
  Seismolord's byte-golden tests (`test-data/seismolord/surfaces/`) are
  the extraction tripwire — unchanged and green.
- `geo_surfaces` (G4.2) generalizes `seismic_exported_surfaces`: f32
  grids in a private `surfaces` bucket, org-read RLS (geo_wells model).
- RCP's `SurfaceImportDialog`/`SurfaceParser` is the ready consumer for
  the Seismolord horizon → mapped surface → GRV acceptance.

## CRS program touchpoints (2026-08-20)
Published grids/isochores inherit the consensus CRS of their inputs
(consensusTag; disagreement or unknown input leaves placement
unverified). Publish passes crs/xy_unit/crs_provenance (previously
dropped). Wells co-render through the overlay guard against the
displayed surface's frame. See Seismolord-PLAYBOOK.md CRS model.

## 2026-09-05: MS0, structure maps in TVDSS elevation (MS series)

The map gridded tops on measured depth. Every registry well already
carried its survey and KB; `topsToPoints` read `md_m` and ignored both,
so a deviated well put its top at the wrong depth and every isochore
inherited it. The harness wells were all vertical, which is why the
e2e never saw it.

- **Engine** (petrolord-engines PR #137): `topsToControlPoints(wells,
  top, {depthRef: 'tvdss', placement: 'borehole'})` places each top
  through `makeDepthFrame` (new `mdToPosition`: East/North offset with
  tvd/tvdss, tangent continuation past TD, flagged) and returns points
  as ELEVATION (negative below datum), the skipped wells with fixed
  reasons (`no_top`, `no_location`, `bad_md`, `bad_survey`,
  `above_survey`) and the extrapolated count. `topsToPoints` keeps its
  array shape. gridmath gains `thickness` (top minus base of two
  elevation surfaces), `convertZUnit` and `maskOutsidePolygon`.
  Goldens: `tools/validation/mapping/oracle_structure_points.py`
  (closed-form vertical and build-and-hold wells, skip rows, a dipping
  plane whose deviated top MDs are solved in the hold; TPS reproduces
  the plane at 193 interior nodes to 1e-3 m and stays null at 389
  exterior nodes).
- **Registry convention** (owner decision): every depth surface in
  `geo_surfaces` is elevation in m or ft per `z_unit`.
  `src/lib/surfaceConvention.js` (re-exported from `surfacesRegistry`)
  holds `surfaceZToDepthDown`, `depthDownToSurfaceZ`,
  `zConventionForImport`. ReservoirCalc Pro's Surface import dialog
  reads the convention from the row instead of guessing by
  `provenance.app`; Earth Modeling converts stacked grids to positive-
  down metres at `modelBuild` and publishes structure layers back as
  elevation; its harness seeds the fixture planes converted the same
  way (the goldens still come out off the UI).
- **Workstation**: `map-depth-ref` (TVDSS | TVD | MD, default TVDSS)
  on top sources; `map-zone` picks the zone of an attribute map (the
  `'Reservoir'` literal is gone; harness zones are named `Top Dome`,
  the PT4 way); `map-depth-unit` toggles the depth display unit (feet
  by default, persisted in `localStorage` `mapping.depthUnit`), used by
  the z-range line, colour bar labels and statuses; the status names
  the reference and unit, the wells the engine could not place and the
  tops that follow the final tangent (`services/gridStatus.js`,
  tested). The isochore block is top-to-base on elevations
  (`thickness`), selects relabelled. Published rows carry
  `provenance.depth_ref`, `placement`, `skipped`, `extrapolated`,
  `z_convention`. Gridding now fills the whole convex hull of the
  control points (the engine's 2-cell extrapolation default is a
  seismic-pick-density setting and left a well-spaced map in patches);
  a distance control comes with the MS3 gridding form.
- **Harness**: KETA-1..5 carry `kb_m` 30, `td_md_m`, `deviation`
  (KETA-2 on the Well Correlation survey and coordinates, KETA-5 on the
  golden build-and-hold survey via `buildHoldStations`); the seeded
  org surface is elevation.
- Tests: `surface.test.js` (TVDSS default, KB shift, MD option,
  borehole placement equals the frame, skip reasons, thickness, unit
  conversion, GRV on the elevation grid), `gridStatus.test.js`,
  `backend.test.js`, `crossapp.test.js` (RCP parser reads negative z,
  convention `elevation`), `src/lib/__tests__/surfaceConvention.test.js`;
  e2e: TVDSS and ft in the status and z-range, unit toggle, zone select,
  top-to-base isochore.

## 2026-09-05: MS1, the Map Window (MS series)

The fixed 460 px canvas is replaced by the shared map viewport
(`src/components/maps/MapViewport`, see MappingSurfaceStudio-ROADMAP.md
MS1): fill-height, wheel zoom at the cursor, drag to pan, double-click
or `0` to fit, `+`/`-`, zoom buttons, a cursor readout (world X/Y and
the value under the pointer in the display unit), labelled contours
with the major levels heavier, wells with their posted control value and
a marker at the borehole position when it differs from the wellhead,
a colour bar with nice ticks and the contour interval, a scale bar, a
north arrow and optional Easting/Northing axes.

- Display section in the dock (`map-contour-interval` in the display
  unit, `map-colormap` over the structure ramp plus every shared colour
  map, `map-show-reverse|labels|names|posted|legend|scaleBar|north|axes`);
  the settings publish with the surface in `provenance.display` and
  restore on select. Published rows also carry `provenance.points`
  (well, x, y, z, md, extrapolated), so posted values come back on a
  saved surface.
- `map-export-png` in the ribbon downloads a titled, captioned,
  logo-stamped PNG (`mapPlotPng`, offscreen re-paint at 2x).
- The canvas exposes `data-scale`, `data-fit-scale`, `data-cx`,
  `data-cy`, `data-vw`, `data-vh`, `data-fit-pad`, `data-contour-step`
  for e2e; `map-readout` is the cursor readout.
- Defect fixed in passing: the raster was drawn with grid row 0 at the
  top of the map while row 0 is the southern edge, so the colour fill
  was mirrored north-south against the contours and the wells (both
  here and in Earth Modeling since G4/G8). `paintRaster` now flips the
  bitmap and its test pins the anchor and the negative y scale.
- Tests: `src/components/maps/__tests__/{mapTransform,contourLabels,
  mapPainter,MapViewport,shims}.test.js(x)`; e2e: wheel zoom changes
  `data-scale`, double-click restores the fit, the readout shows an
  elevation in ft, a typed interval sets `data-contour-step`, the PNG
  download. Earth Modeling and Seismolord specs unchanged.

## 2026-09-05: MS2, surfaces in and out (MS series)

- **Import** (`map-import` in the explorer header, `components/
  SurfaceImportDialog.jsx`): XYZ points on a regular grid, CPS-3, ZMAP+
  or Irap classic, auto-detected by `lib/gridding/surfaceImport`; the
  user names the surface, says what the values are (depth, TWT ms, or
  an attribute), the depth unit of the file and its sign convention
  (detected from the data, overridable), and declares the file CRS
  (`CrsPicker` + `useCrsContext`; a transformable declaration converts
  into the Project CRS through `reprojectSurfaceGrid`, a local-grid
  mismatch is refused). Depth files land as elevation in the file's
  unit (`z_unit` m or ft), time positive, attributes raw. Pure planning
  in `services/importPlan.js` (`planImport`, `detectSign`) with tests
  on the Seismolord dome golden. The imported surface is selected and
  drawn at once.
- **Row menu** (right-click a surface): Export as XYZ / CPS-3 / ZMAP+ /
  Irap classic in the DISPLAY unit (`services/surfaceExport.js
  exportSurfaceText` converts lengths through `convertZUnit`, then the
  byte-golden writers; ZMAP+ carries the CRS tag; file names carry the
  unit), Control points CSV (well, x, y, z in the display unit, md,
  extrapolated; from `provenance.points`), Rename (inline input, Enter
  saves, Esc cancels; `updateSurface`), Re-grid in place (own surfaces
  with a recorded source), Share, Delete. The existing share and delete
  buttons keep their test ids.
- **Re-grid in place**: the form is set from the surface's provenance
  (source, depth reference, cell size, display), the row is marked
  `re-gridding`, and Publish becomes Replace surface:
  `surfacesRegistry.replaceSurfaceGrid` overwrites the f32 object at the
  same storage path (upsert) and updates the frame, so the id every
  consumer holds stays valid; the previous frame is appended to
  `provenance.history`. Selecting another surface cancels the target.
- **Badges**: domain/unit (`depth · m`, `thick · m`, `TWT ms`, `attr`)
  and the CRS tag (amber `no CRS` when placement is unverified); the row
  tooltip is `describeSurface` (kind, domain, CRS, origin, re-grid
  count).
- Tests: `__tests__/importPlan.test.js` (dome golden imports unchanged as
  ft elevation, positive-down files flip, forced sign, time, attribute,
  CRS kept / converted / refused), `surfaceExport.test.js` (every
  writer round-trips, metres conversion, CRS label, CSV, tooltip),
  `backend.test.js` (rename and replace keep the id, owner-only). e2e:
  import the golden CPS-3 and read its z range in feet, export ZMAP+,
  control points CSV, rename, re-grid Base Sand in place at 100 m.

## 2026-09-05: MS3, geology on the map (MS series)

- **Polygons** (dock, Polygons): Fault block and Boundary draw tools
  place vertices by clicking the map (the zoom overlay lets clicks
  through while drawing), Undo / Cancel, a name, Save. Saved to the
  shared `geo_culture` registry as kind `fault_polygon` or `boundary`
  (owner decision: no new table), `geometry_type` polygon, ring closed,
  the map's CRS, `provenance.drawn_on` = the surface it was drawn over;
  pure `services/polygonTools.js` (`polygonPayload` validates through
  Earth Modeling's `validatePolygon`: 3+ finite vertices, non-degenerate,
  no self-intersection). Listed with visibility, a `grid` checkbox on
  fault blocks and a `clip` radio on boundaries, owner delete.
- **Gridding honours them**: fault blocks the Earth Modeling way (the
  surface is gridded independently inside and outside each polygon
  through `labelBlocks` -> `gridSurfaceBlocked`, so a throw shows as a
  step at the polygon edge; control points get their block by
  `pointInPolygon`), a boundary nulls every node outside it
  (`maskOutsidePolygon`). The status says `With 1 fault-block polygon,
  clipped to Lease` and names blocks the engine left empty because they
  hold fewer than 3 control points (a TPS needs three); provenance
  records `faults`, `boundary`, `guide_points`; a re-grid restores all
  three.
- **Guide points**: click the map, type the value in the display unit
  (elevation), Add; drawn as pink triangles with their value; they grid
  with the wells (`well` = `G1`, `guide: true` in the control points and
  the CSV). Hand editing, v1; contour dragging is a follow-up.
- **Surface arithmetic** replaces the isochore-only block
  (`services/arithmetic.js`): isochore (top minus base), A + B, A minus
  B, A × B (net thickness = isochore × NTG), shallower / deeper of A and
  B, A + k, A × k, clip A to the boundary marked clip. Two-surface ops
  resample B onto A's frame; lengths stay lengths for additive ops,
  products become attributes. The isochore test ids (`map-iso-a/b/run`)
  are unchanged; `map-arith-op` picks the operation.
- **Quick GRV** (`services/quickGrv.js`): contact typed as an elevation
  in the display unit, the byte-golden `grvAcreFt` on the feet grid,
  plus the area above the contact; a read-out (ReservoirCalc Pro stays
  the volumetrics home). The dome golden reproduces its oracle GRV
  within 3% on the 20 m grid.
- **Time to depth** (dock section on a time surface):
  `backend.listVelocityModels()` lists Seismolord volumes' velocity
  models (registry: `listVolumes` + `getManifest`, the Pore Pressure
  pattern; harness: one linear model and one layer cake); linear
  V(z) = v0 + k·z converts per node (`services/timeDepth.js` on the
  Seismolord engine's `twtMsToDepthM`); output elevation in feet by
  default (owner decision) or metres, published as `structure` / depth
  with `z_unit` and `provenance.time_depth`; a layer cake is refused with
  a message naming Seismolord. The harness seeds `Dome TWT`.
- Tests: `__tests__/ms3services.test.js` (polygon payloads and blocks,
  arithmetic semantics, the dome GRV, the time-depth closed form and
  the layer-cake refusal), `backend.test.js` (culture save/delete,
  models, the TWT seed). e2e: draw a fault block and a boundary by world
  coordinates, grid with both, a guide point in feet, publish, GRV
  above a contact, A + k, layer-cake refusal, linear conversion of the
  TWT dome to feet and publish.

## 2026-09-05: MS4, integration and help (MS series)

- **Deep links in** (`MappingWorkstation`, read once through
  `useSearchParams`, consumed after the registry loads): `?surface=<id>`
  selects and draws a surface (or says it is not in your registry);
  `?top=<name>&wells=<ids>` sets the source and grids on arrival from
  those wells only, the status starting `Opened on top X from a link`;
  `?wells=<ids>` alone posts only those wells (a ribbon chip
  `map-linked-clear` shows all again).
- **Launchers in**: Well Correlation top rows (`corr-map-top-<name>`,
  the section wells carrying the top), Petrophysics Studio Tops panel
  (`petro-map-top-<name>`, every well carrying it), Well Data Manager
  Tops tab (`wdm-map-top-<name>`); the Mapping entry of every Open-in
  menu now carries `?wells=`. Builders `mapTopHref`, `mapSurfaceHref`,
  `earthModelingSurfaceHref` in `src/components/wells/appLinks.js`
  (tested); workstations take a `mappingPath` prop (harnesses point at
  `/dev/mapping-surface-studio`).
- **Launchers out**: surface row menu gains Open in ReservoirCalc Pro
  (plain route; its Surface import lists the surface), Open in Earth
  Modeling (`?surface=<id>`; `EarthWorkstation` stacks it on arrival and
  says so), Show in Seismolord; a Wells list at the bottom of the
  explorer with the shared Open-in submenu (`map-well-open-in-<app>`,
  Mapping excluded). `MappingWorkstation` takes `appPaths` (harness:
  `DEV_APP_PATHS`).
- **Help**: `MappingHelpGuide.jsx` on `HelpGuideShell` at
  `apps/geoscience/mapping-surface-studio/help` (ribbon `map-help`), 15
  sections quoting the live export formats, arithmetic operations and
  skip reasons; `__tests__/helpGuide.test.jsx` (sections, live lists,
  honesty phrases, no em dash).
- e2e: `mapping-surface-studio` MS4 test (grid on arrival from three
  wells, `?surface=`, unknown ids, row and well launcher hrefs, help
  and home hrefs); `earth-modeling` (`?surface=` stacks TopB);
  `well-correlation`, `petrophysics-studio`, `well-data-manager`
  cross-app tests assert the Map-this-top hrefs.
