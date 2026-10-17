# Earth Modeling — STATUS

App: **Earth Modeling** (`earth-modeling`), route
`apps/geoscience/earth-modeling`, code `src/pages/apps/EarthModeling/`.
Plan of record: EarthModeling-PLAN.md (Geoscience-ROADMAP.md Phase G8 —
the 10th and final tile). Branch `feat/earth-modeling-g8`, stacked on
`feat/basinflow-g7` (PR #68).

**PHASE G8 COMPLETE 2026-07-14 — the Geoscience roadmap's 10-tile
target is fully built.** (Prod upload for G1–G8: **DONE 2026-07-14**,
prod current at main `e84f8a181`; the deferred pore-pressure follow-on
from G7 also shipped 2026-07-14 — see PorePressure-STATUS.md.)

| Sub-phase | State | Notes |
|---|---|---|
| G8.0 plan + oracle | **DONE** | Audit-corrected plan (4 sweeps; the G0-era "routed page uses subsurface-studio" claim was stale); stdlib-only oracle + goldens, anchors A1–A9 self-asserted at generation, byte-identical regeneration |
| G8.1 engine | **DONE** | framework (resample + monotonic clamp), blocks (validated fault polygons → labels), wellties (min-curvature, MD-linear interp, tie residuals), properties (constant/trend/simple-krige, explicit fallback ladder), volumes (per zone × block). 40 jest tests vs goldens at 1e-12/1e-9; `src/lib/gridding/gridmath.js` extracted from Mapping at the second consumer |
| G8.2 workstation | **DONE** | WorkspaceShell app: map (raster/contours/click-drawn fault polygons), well-to-well section with tie ticks, QC & volumes tables; backend pair; `/dev/earth-modeling` harness seeded with the oracle fixture; e2e 6/6 (incl. pixel-drawn polygon reproducing census 174/326 and golden volume tables off the UI) |
| G8.3 persistence | **DONE** | `em_models` migration 20260714130000 applied live, RLS pentest 5/5 (tools/validation/earthmodel/rls-pentest.sql); publish-to-`geo_surfaces` is the RCP handoff (auto-listed in its import dialog, zero RCP changes) |
| G8.4 close-out | **DONE** | Legacy purge (see below); tile seeded Active (20260714140000, flat 899); roadmap ticked |

## What v1 is (scope contract — plan decisions 1–8)

Layer-cake framework from picked `geo_surfaces` (model frame = top
surface's frame), depth-down monotonic clamp with surfaced clamp
counts, app-owned fault polygons partitioning blocks, per-zone
property population from `geo_wells_zones.properties`
(phi_avg/sw_avg/ntg) at zone-midpoint well-path control points, zone
volumes (bulk/net/pore/HCPV per block), publish layers back to
`geo_surfaces`. Fluids/contacts/recovery stay in ReservoirCalc Pro.
No 3D window (G8.5 stretch — Seismolord viewer-core extraction at the
second consumer). No geostatistical simulation.

## Legacy purge (G8.4)

Deleted: `src/components/subsurface-studio/` (284 files ~21k loc; the
3 live MEM chart files relocated to
`src/pages/apps/MechanicalEarthModel/components/charts/` — they render
mock data, flagged for the MEM-under-Drilling rebuild),
`src/components/earthmodel/`, both routed demo widgets
(`src/components/geoscience/EarthModel{Studio,Pro}.jsx`), orphaned
`src/pages/apps/EarthModel{Studio,Pro,StudioProjects}.jsx` (Projects
queried `ss_projects`, a table with no migration),
`earthmodel-pro-metadata`, `EarthModelProCard`,
`verifyEarthModelRouting`, `earthmodel-{config,version}.js`,
`earthModelService`, `dashboardAppsConfig.js` (importer-less), the
pricing entry, and the hardcoded GeoscienceHub tile. All 5 legacy
slugs 301 to `apps/geoscience/earth-modeling`.

## 2026-10-01: Seismolord faults (Seismolord U2-003, EM-T1-010)

The explorer lists Faults from Seismolord (read only, `src/lib/seismicFaultsReader.js`): Add closes the fault's trace at its middle TWT level with the model frame on its hanging-wall side as a fault block (provenance kept in the saved definition); sticks draw in the 3D view when the volume has a linear velocity model. EM-T1-010 is closed for interpreted faults.

## Open items

- ~~Legacy DB orphan families~~ **DONE 2026-07-14** (owner-approved,
  `chore/orphan-table-drops` / PR #70): SPA consumers purged (last
  `ss_*` readers — StudioContext/MyProjects,
  `useJobMonitor`/`useSeismicSession` — deleted; `/my-projects` now
  redirects to `/dashboard`) and migration
  `20260714150000_drop_orphan_legacy_tables.sql` **applied live**
  (rollback-wrapped dry run first): 11 `ss_*` + 15 legacy `em_*` +
  6 legacy `bf_*` tables, `calibration_results`/`expert_mode_settings`,
  5 legacy Seismic Studio RPC functions, 6 orphaned enums. Kept:
  `em_models`, `bf_wells` (its never-used `project_id` FK column
  dropped). Post-apply probe green; details in MIGRATIONS.md.
- Help-centre/training content still references "EarthModel Pro"
  (`src/data/helpArticles.js`, `trainingCourses.js`,
  `src/data/helpCenter/**`) — content refresh, not code.
- `src/services/wellCorrelation/` legacy services keep a
  name-only `formatForEarthModelPro` — dead-code candidate for a
  later sweep.
- G8.5 stretch: 3D framework view via lifting Seismolord's pure-math
  viewer core (`cube3d.js`, `interpMesh.js`, `shaderChunks.js`) to a
  shared location.
- ~~Prod build upload (Hostinger) covering G1–G8.~~ **DONE
  2026-07-14** — prod is current (main `e84f8a181`, owner-confirmed).

## CRS program touchpoints (2026-08-20)
modelBuild refuses stacking surfaces in different known CRSs and stamps
em_models.crs from the input consensus; the Project CRS reproject flow
transforms fault polygons and retags models (grids recompute from
surfaces). See Seismolord-PLAYBOOK.md CRS model.

## 2026-09-05: registry surfaces are elevation (Mapping MS0)
Every depth surface in `geo_surfaces` is now stored as elevation
(negative below datum, m or ft per `z_unit`; owner decision, see
MappingSurfaceStudio-ROADMAP.md). The engine keeps working in metres
positive-down: `services/modelBuild.js` converts each stacked grid
through `surfaceZToDepthDown` at the door and `EarthWorkstation`
publishes structure layers back through `depthDownToSurfaceZ`
(thickness and attributes are raw). The harness seeds the fixture
planes converted the same way, so the oracle numbers still come out off
the UI (`modelBuild.test.js`, e2e unchanged).

## 2026-09-05: map on the shared viewport (Mapping MS1)
`components/MapView.jsx` is a thin adapter over
`src/components/maps/MapViewport` (zoom, pan, readout, labelled
contours, scale bar, north arrow come with it; polygon drawing and the
`em-map-*` test ids are unchanged, e2e 6/6). The raster used to be drawn
with grid row 0 at the top while row 0 is the southern edge, mirroring
the colour fill against the contours and wells; the shared painter
flips it. The map label reads `zone · layer` (no em dash).

## 2026-09-05: surface deep link (Mapping MS4)
`?surface=<id>` (Mapping's "Open in Earth Modeling") stacks the surface
on arrival and the status says `Added <name> from the link`; an unknown
id reports it is not in the registry. e2e covers both.

## 2026-09-06: fault polygons from Mapping (MS5)

Fault polygons drawn in Mapping & Surface Studio (geo_culture kind
`fault_polygon`) are listed in the explorer under "Fault polygons from
Mapping" and join the model with one click (`em-culture-add-<name>`);
the model keeps `cultureId` and `source: 'geo_culture'` on the polygon so
it is not added twice and the provenance survives a save. Registry
backend: `listCultureFaultPolygons` (first ring of the layer's first
feature; unreadable layers are skipped). Harness: the fixture fault is
offered as "Fixture fault (Mapping)". The model's own drawn polygons are
unchanged.

## 2026-09-06: EM series (Petrel tester readiness) started

Plan of record: docs/scope/EarthModeling-ROADMAP.md. EM0 to EM5 built
and merged the same day: account depth unit and volume units, model
cell size and boundary clip; well adjustment (engines #139); derived
horizons; the section window along a drawn line with GR columns, VE
and PNG; ordinary kriging with fitted variograms and variance maps;
volumes CSV, launchers into ReservoirCalc Pro (which now consumes
`?surface=`) and Mapping, and the in-app help guide; EM6 added the 3D
window on the shared viewer core (the G8.5 stretch, done). Wave log in
the roadmap.

## 2026-09-26: T1 senior test (Wave 1 #2) and fixes

Report: docs/testing/EarthModeling-T1.md. Engines #263 (8082d73, vendored
on top of main's EC7 pin 3778451):
`zoneVolumesWithContacts` with oracle, radial anchor, 6 gates, negcontrol 7/7.

- Fluid contacts and FVF per zone in the dock (GOC, OWC as depths below
  datum in the display unit; Bo, Bg): HCPV split into gas cap and oil leg,
  STOIIP and GIIP (MMstb, Bscf in field units), in the QC table and the CSV;
  an amber line says when no OWC is given (`parseFluidsInput`,
  `definition.fluidsInput`).
- Build status names property fallbacks and ties beyond 10 m (adjustment
  off), and says clamped nodes are marked; clamped nodes draw as orange
  crosses on the zone top and base maps (`clampMasks`).
- Map on the Mapping display plan (round interval and ticks), full height;
  section pads for the last log column, surface names a third along, round
  depth ticks; 3D tick labels de-overlapped; readable provenance.
- Depth sign toggle shared with Mapping (`mapping.depthPositive`; unset keeps
  positive TVDSS here).
- P90/P50/P10 HCPV and STOIIP from the kriging variance when a property is
  kriged (fully correlated). `?sample=1` sample mode.

Known limits (after NAPE): vertical fault polygons only (EM-T1-010); Sw
from a saturation-height function (E2).

## 2026-09-28: design system rollout W4B (light default, dark per user)

The app, its dev harness and its help guide each wrap themselves in
`ThemedApp` (App.jsx is untouched), so the app opens on the grey panel
light theme and the ribbon's toggle switches to dark and back, stored per
user. The route prefix `/dashboard/apps/geoscience/earth-modeling` (the help guide is a sub-path) is
registered in `src/design/rollout/w4b.js` for the themed cold-load
loaders.

- Chrome on roles: the ribbon (new theme toggle at the right), the model
  explorer, the builder dock, the QC and volume tables, the map and
  section toolbars and the status bar moved to `pl-*` roles. Decorative
  emerald and amber buttons and fault icons went; residual, no-contact
  and fallback notes keep the warning role. The sample banner is a
  warning callout. Three empty-state lines lost their em dashes.
- Canvases: the map viewport (shared with Mapping, see its STATUS), the
  section canvas and the 3D viewer are painted for a dark ground and sit
  in `data-canvas="dark"` with their pixels unchanged. Earth Modeling does
  not use Seismolord's SliceView, CubeView or MapView (its section, 3D and
  map views are its own and the shared map kit), so the Seismolord
  viewers and their literal 8px radius were not touched.
- Layout: the ribbon wraps on narrower screens and hides its subtitle
  below 2xl, so "Build model", "Publish layer" and "QC & volumes" keep
  their labels on one line.
- Tests: new `src/pages/apps/EarthModeling/__tests__/EarthModeling.theme.test.jsx`
  (the shared `describeAppTheme` checks on the real workstation, plus the
  views, the dark theme and the help guide). No calculation, engine, export or plotting change; the existing suites pass unchanged.

## 2026-09-30: upgrade Step 1 (practitioner lens), branch `feat/em-u1`

Working doc: docs/upgrade/EarthModeling-UPGRADE.md (26 findings, 18 fixed,
Step 2 backlog of 18 items in batches A/B/C).

- S1 fixed: on a feet or US-feet frame GRV to GIIP were 10.76x. The engine
  now runs on a metre frame (`specM`, wells, polygons, cell, radius and
  range in metres); `spec` stays in the surfaces' units for the map,
  section and publish; `xyToM` drives the section and 3D exaggeration.
- Every registry grid enters through `src/lib/readDepthSurface.js`: only
  depth structures stack (time, attribute and isochore rows refused with
  the reason); isochores in ft become metres; mixed XY units refused.
- Published layers carry CRS, XY unit and `depth_ref`; a rotated top gives
  an unrotated frame; populated fractions held to 0..1 and counted.
- Fluids: each contact keeps its typed unit, a negative contact is an
  elevation, Bg is typed in the profile's gas FVF unit (RB/Mscf in field),
  Bg with no Bo and no GOC makes a gas zone; an open leg at the model edge
  is said in the status, QC and CSV.
- Save overwrites the open model (Save as a new model copies); saved rows
  from every release open through `upgradeDefinition`; `?saved=1` on the
  harness lists one per release.
- Every ring of a Mapping fault or boundary row is used; polygons and
  wells in another CRS are refused or left out, said in QC Build notes.
- `em_models` travel in `.pld` packages and backups with the surfaces and
  polygons they name (root kind `em_model`).
- Volumes CSV reviewer header (field, analyst, date, build, datum,
  contacts and FVFs as used).
- Ordinary kriging groups targets by their nearest-well set (8 to 9x at
  401 x 401; equals the engine to 1e-9). A worker is Step 2 U2-004.
- Cross-app: Well Design targets (MAP-U1-031) and Simulation structure
  import (MAP-U1-032) now read through the same door.
- e2e: `e2e/earth-modeling.spec.js` picks metric volumes (red since the
  unit profile, #830); new `e2e/earth-modeling-upgrade.spec.js` (9).

## 2026-10-01: upgrade Step 2 (Batches A, B, C), branch `feat/em-u2`

Batch decision and the build log per item: `docs/upgrade/EarthModeling-UPGRADE.md`
("Batch decision" and "Step 2 build"). Built, each with a failing-first test:

- A: U2-004 build on a Web Worker with progress and cancel (engines PR #291:
  the variogram is checked once per kriging system); U2-005 contacts per fault
  block; U2-006 hydrocarbon leg bounded by Mapping's closure and spill;
  U2-002 Sw from a SCAL saturation-height function (Petrophysics'
  `shmFromScalProject`, its published example); U2-003 PDF model report
  (pdftotext read-back); U2-001 Seismolord faults as a polygon per zone top
  (built behind `SEISMIC_FAULTS_HOOK`, then wired to Seismolord's reader once
  Seismolord U2 #837 reached main).
- B: U2-009 prospect to ReservoirCalc Pro (`src/lib/earthModelProspect.js`;
  RCP-side: `EarthModelProspectNote.jsx` and a two-line mount); U2-010 volume
  distribution through `src/lib/monteCarlo.js`; U2-008 Petrophysics net pay and
  HCPV maps as NTG and Sw; U2-011 GRDECL export (Simulation's deck gate and
  OPM Flow 2026.04 read it back: 760 active cells, PV 12,222,279 rm3); U2-018
  3D properties and a fence.
- C: U2-017 isopach beside the isochore.
- Engines PR #291 merged; after merging main the pin is 1e5d394 (contains #291).
- Deferred with reasons: U2-007, U2-015, U2-016, U2-012, U2-013, U2-014
  (migration, second engineer), EM-U1-026 (Project programme).

## 2026-10-02 Organisation sharing (built; migration NOT APPLIED, owner-run)

U2-014: a saved model can be shared with the organisation, for viewing or for editing one person at a time; shared models are listed under "Shared with me"; saves name the version opened. Tests: `__tests__/orgSharing.test.jsx`, `e2e/org-sharing.spec.js`.

Design, rules, proof and the apply commands: `docs/scope/OrgSharing-DESIGN-AND-STATUS.md`. Until the migration is applied the control is a short note and saving works as before.

## 2026-10-02: the well datum model (WDM U2-007, PR #848)

A well that states no depth reference elevation is left out of the ties, the
properties, the section and the 3D scene, and the build notes name it
(`services/modelBuild.js`, `framework3d.js`). Wells saved before the model
tie as they did. Test: `__tests__/upgradeDatum.test.js`.

## 2026-10-14: renaming the model keeps the build

Typing a model name (before Save) cleared the built model back to the empty
state, because every definition change marks the build stale. A change of
name alone now keeps it. e2e: the save test renames after a build and checks
the map stays (it failed on the old code).
## 2026-10-14: Ekene walk, stack defaults and feet (video round)

Walked as a modeller building the Ekene static model on the demo account.
- Tie tops now match surface names such as "Ekene Sand top (6-well map)" and
  "Ekene Sand base (6-well map)" (`services/stackDefaults.js`). Before, the
  ties stayed empty and every new zone read the FIRST registry zone of the
  well list ("Seabed" on Ekene), so NTG came out as 0.014 with no warning. A
  new zone now reads the zone named after the tie top above it, or none.
- The first section pair skips wells with no tops (the "PPS demo: Ekene-1" copy).
- The volume distribution's OWC and GOC spreads are typed in the display depth
  unit (30 ft by default in a feet session) and converted to metres.
Tests: `__tests__/stackDefaults.test.js`, `__tests__/distributionUnits.test.js`.
## 2026-10-14: the kriging range and the volume distribution after a fallback

A property block that falls back from kriging (Ekene: a layer where every
well reads NTG 1.0) carries the grid's null marker as its variance. The
fully correlated range and the Monte Carlo distribution shifted those nodes
by the marker's square root, so they went to 0 or 1: the Ekene walk showed
STOIIP P90 0 against P50 4.9 MMstb, and a P50 of 6.3 against a deterministic
10.4. `shiftProps` now leaves a node with no variance where it is.
Test: `__tests__/varianceFallback.test.js` (negative control fails both).

## 2026-10-14: reconciled with ReservoirCalc Pro (the Ekene booked case)

On the RCP booked case (six-well Ekene Sand top and base, OWC 5,036.1 ft,
NTG 0.8, porosity 0.2, Sw 0.35, Bo 1.2) the model gives RCP's numbers
exactly: GRV above the contact 18,058 acre-ft, HC area 418 acres, STOIIP
12.14 MMstb (`__tests__/reconcileRcp.test.js`, fixture of the live rows).
- QC, the volumes CSV and the report PDF carry HC bulk (GRV above the
  contacts) and HC area; the bulk column alone (52,559 acre-ft, the whole
  zone) could not be compared with RCP.
- NTG from a published zone is net reservoir over gross (`zonePropertyValue`).
  It used to be net pay over gross, which holds an Sw cutoff, so with an OWC
  the water was cut twice: the Ekene model read 2.8 MMstb (wet wells NTG 0).
- Prospect to RCP sends the HC area (418 acres) with the column over it, so
  RCP's HC Area matches; it sent the whole zone's 497 acres before.

## 2026-10-14: rock properties from the well logs, layers, IDW, typed values, property QC

- **Rock properties from**: published zone averages (as before) or the well logs
  upscaled to each layer (`services/logUpscale.js`): PHIE, VSH, SW and
  permeability as Petrophysics published them; net reservoir by Vsh and PHIE
  cutoffs; NTG net/gross in TVT; porosity over net; Sw over net above the OWC
  (pore-volume weighted); permeability geometric mean. On Ekene the four wells
  now all give porosity and NTG (the zone averages gave two), and NTG at every
  well equals Petrophysics' published net reservoir over gross to 0.01.
- **Proportional layers** per zone (1 to 50): each layer populated from its own
  control, volumes summed layer by layer; map shows a layer or the zone;
  GRDECL exports one cell layer per layer, with PERMX/PERMY from the logs and
  PERMZ = 0.1 PERMX (said in the header).
- **Methods**: inverse distance (power in the dock) and typed value per zone.
  The booked Ekene case typed gives 12.14 MMstb with 1 or 7 layers.
- **Property QC** under each zone: the upscaled logs per well and layer, the
  model against the wells (difference), histograms with the wells marked.
- Vertical wells with no survey now continue straight down past their last
  station in the upscaler (positionAtMd clamps at the last station).
Tests: `__tests__/logLayers.test.js` (analytic wells, deviated TVT weighting,
Ekene vs Petrophysics NTG with a cutoff negative control, IDW, layers, GRDECL).

## 2026-10-14: section fit, property colours and contacts

The section opens at VE "fit" (the window's height; the Ekene Sand, 106 ft over
922 m, was a 200 px strip at 2x) with 20x and 50x added; a colour list paints
the zones by porosity, Sw, NTG or permeability (layers as bands, colour bar);
each zone's OWC and GOC are drawn dashed where the zone crosses them; the line
length reads in feet in a feet session. Tests: `__tests__/sectionFit.test.js`.

## 2026-10-17: the fine 3D grid (owner GO 2026-10-17), PR 1 of 4: the engine

Owner decisions: 25 m cells by default; 2.5 ft layers (2 or 3 ft) with
proportional, follow-top and follow-base layering; Ekene Sand Upper, Middle and
Lower from well tops plus the shale above as a cap; porosity by sequential
Gaussian simulation (seeded), kriging kept. Code in `services/grid3d/`.

- **New models start on the grid** (`newModelDefinition`: cell 25 m, smooth
  edge, 2.5 ft proportional, porosity SGS). `emptyDefinition` and saved rows
  stay the layer-cake (grid off), so saved models, goldens and the dev harness
  keep their numbers; the harness opts in with `?grid=1`.
- **Layering** (`layering.js`): each zone's horizons in one buffer, layers as
  views; proportional n = mean thickness / layer, follow top/base n = max
  thickness / layer with truncated cells. Logs upscale into the same layer rule
  (`logUpscale.js`, plus VSH as a gross mean and RP_FACIES as the dominant code).
- **Smooth edge** (`boundary.js`): the frame grows by half the top surface's
  cell; each surface is extrapolated one ring and kept where its bilinear live
  mask is at least 0.5, so the model ends on the traced data limit (no steps)
  and a fine cell keeps the map's area. `built.outline` holds the traced rings.
- **Zones from tops and the cap** (`zonesFromTops.js`): a zone's `splitTops`
  cut it at the fraction of the zone each top sits at in the wells (inverse
  distance between wells, held in order); two tops make Upper, Middle, Lower.
  The cap is a slab of typed thickness (50 ft default) above the top surface;
  the Ogbia Shale is ~850 ft, so a slab rather than the whole seal. A sub-zone
  with no control borrows its parent's upscaled values; the cap uses gross
  porosity, Sw 1 and 0.001 md.
- **SGS** (`sgs.js`, GSLIB-style): normal scores, multiple-grid random path,
  simple kriging from 12 simulated cells and 4 data cells, spherical 900 m
  across and 10 ft down, nugget 0.1, mulberry32 seed. Validation
  (`__tests__/sgs.test.js`): 8 unconditional realisations reproduce the
  variogram within 0.12 at every lag (both directions and vertically), the
  histogram P10/P50/P90 within 0.01; negative control (no neighbours) fails
  the gate. Permeability follows SGS porosity through the wells' log-linear
  phi-k transform; Vsh by inverse distance (shown only).
- **Facies** (our call): indicator inverse distance of the upscaled RP_FACIES
  codes, the most likely code (0 shale, 1 oil sand, 2 brine sand, 3 shaly sand).
- **Reconciliation** (`__tests__/gridBuild.test.js`): the RCP booked case on
  the six-well maps is 12.14 MMstb on the old frame and 12.09 MMstb on the
  25 m x 2.5 ft grid, GRV, HC area and STOIIP within the stated 1 percent;
  negative control: without the smooth edge the 25 m grid loses ~10 percent.
  On the old frame, layers add up to the old volumes (rock 1e-12, pore 1e-6:
  grid properties are float32).
- **Ekene sizes**: six-well maps with the cap and three zones 195,810 cells
  (100 x 80 x 61), ~8 s in the browser; the Seismolord depth maps (201 x 177)
  1.35 M cells, ~45 s on the worker. Worker results move as transferred buffers.
- **Demo data** (additive): tops "Ekene Sand Middle" and "Ekene Sand Lower" on
  Ekene-1, -2, -3, -4, -8, -9 at the GR peaks of the two shale breaks
  (interpreter "Earth Modeling demo").

## 2026-10-17: the fine 3D grid, PR 2: 3D, the player and the charts

- **3D** (`components/FrameworkView3D.jsx`, geometry `services/grid3d/scene.js`):
  grid cells as a shell, I/J/K slices or a cell filter by property range; the
  grid skeleton every 1, 2, 5 or 10 cells (layer lines every n layers, zone
  boundaries always); colour by zone, porosity, Sw, NTG, permeability, Vsh,
  facies or fluid zone (the cap is grey seal); zones can be hidden (the cap);
  contacts as translucent planes where they cut the reservoir (one plane per
  shared contact) with their outline; fault planes (Seismolord rails lofted,
  polygons as vertical walls); the wells' upscaled logs as ribbons. Cell corners
  take the mean of the live nodes around them; corners of an edge step move a
  quarter cell, so the model edge draws as a chamfer. Colour ranges span the
  2nd to 98th percentile of the cells. The renderer is unchanged.
- **Player** (`components/PropertyPlayer.jsx`, ribbon "Player"): a section (I
  line, J line or through Ekene-1, -3, -4), a map of one layer and the 3D
  window linked; I/J and K sliders, Play sweeps the layers or the section, the
  cell filter dims the map and section and filters 3D; contacts dashed in the
  section with their depth, the contact in the layer as a line on the map;
  hover readouts.
- **Map**: the zone's OWC and GOC are drawn where they meet the zone top (solid)
  and base (dashed).
- **Results** (ribbon "Results"): Charts (house template) and Details (the
  tables, as before). Histograms of the raw log samples, the upscaled cells and
  the model; porosity against permeability by facies (cap excluded); STOIIP by
  zone; STOIIP tornado (contact 30 ft up and down, porosity, NTG, Sw and GRV
  10 percent; Sw case S0 (1 - (f - 1) Sw / (1 - Sw)), contact case a rerun);
  probability curve from the volume distribution. A layer-cake model opens on
  Details, a grid model on Charts.
- **Volume distribution**: one draw per trial for every zone (zones that share
  a contact move together; FVFs by a common factor), totals per trial kept for
  the curve, porosity and NTG factors (+- percent; 5 percent porosity by default
  for a simulated porosity, 200 trials).
- **Report PDF**: a 3D grid line and the SGS settings in the header; pictures
  of the 3D window, the player's section and map and the five charts (the
  workstation switches views to collect them).
- Tests: `__tests__/gridScene.test.js` (counts by hand on a synthetic grid),
  chart data in `__tests__/gridBuild.test.js` (histograms sum to 100 percent,
  tornado factors exact, contact rerun at zero shift equals the build).

## 2026-10-17: from the booked 12.14 to the grid's 10.31 MMstb (the waterfall)

Asked by the coordinator so viewers of the ReservoirCalc Pro videos (12.14)
are not confused. `__tests__/waterfall.test.js` builds each step with
buildModel on the live Ekene rows (six-well maps, OWC 5,036.1 ft, Bo 1.2):

| Step | Change | STOIIP (MMstb) | Move |
|---|---|---|---|
| 1 | booked NTG 0.8, porosity 0.2, Sw 0.35 on the maps' 100 m nodes (RCP) | 12.142 | |
| 2 | the same on the 25 m x 2.5 ft grid with the traced edge | 12.088 | -0.055 |
| 3 | NTG from the logs (kriged; the sand is nearly all net) | 14.905 | +2.817 |
| 4 | porosity by SGS from the logs | 14.092 | -0.813 |
| 5 | Sw from the logs (inverse distance; transition zone, ~0.46 over the leg) | 10.896 | -3.196 |
| 6 | the sand split at its two shale breaks into Upper, Middle, Lower (Lower below the OWC) under a 50 ft cap | 10.305 | -0.591 |

Step 2 is the reconciliation gate (within 1 percent, `gridBuild.test.js`).
Step 6 also changes the SGS realisation (each zone has its own seed stream);
seed-to-seed spread on this grid is of the same order (seed 7 gives 10.35 with
Sw from saturation height against 9.59 for seed 2026), so step 6 should be read
as "within the realisation spread". The cap adds no oil (NTG 0).

Also: Seismolord depth surfaces with bullseye cones were conditioned into new
registry rows "Ekene Sand (depth ft, conditioned)" and "Ekene Sand Base (depth
ft, conditioned)" (originals untouched; method in the row provenance).
