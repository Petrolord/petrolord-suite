# Mapping & Surface Studio, MS series (Petrel tester readiness, 2026-09)

Approved 2026-09-05 after plan mode, the next Geoscience app after the
Well Data Manager, Petrophysics Studio and Well Correlation tester
rounds. Plan of record: the owner-approved plan in the session that
opened it; this file is the durable copy. Each wave is one branch and
one PR merged in order; engine work lands in Petrolord/petrolord-engines
first, then the subtree copy. Registry and in-memory backends change as
twins; the `/dev/mapping-surface-studio` harness stays the demo and e2e
surface.

## Why this app, and why now

The geoscientist's loop is manage wells, analyse logs, correlate, map,
compute volumes. Testers walked the first three doors and filed about 25
findings (all fixed in the PT and WC series). The map room was the
thinnest app in the module (1,137 loc, 2 e2e) and re-triggered almost
every finding they had already given:

| Finding they already gave | State in Mapping before MS0 |
|---|---|
| MD / TVD / TVDSS, structural view | Structure maps gridded tops on **MD**; the survey and KB on every registry row were ignored. Wrong on any deviated well; the isochore inherited the error. The harness wells were all vertical, so nothing caught it |
| Exports honour feet | Metres only, no unit toggle |
| Editable data | Delete only |
| Export / PNG | None, although the byte-golden writers sat unused in the shared lib |
| Import Petrel data | `parseSurfaceFile` (CPS-3, ZMAP+, Irap, XYZ) only used by Seismolord |
| Scroll / zoom navigator | Fixed canvas, no zoom, pan, readout or scale bar |
| Zones from tops | Attribute maps hard-wired to a zone named `Reservoir` |

Two integration defects were in scope too: the registry sign asymmetry
(Mapping and Earth Modeling published positive-down metres, Seismolord
negative-down feet and negated whatever it loaded, ReservoirCalc Pro
guessed by `provenance.app`), and the absence of any deep link into or
out of the map.

## Program

| Wave | Theme | Engine PR? | One line |
|---|---|---|---|
| MS0 Correctness | TVDSS elevation, units, zones, one registry convention | yes (#137) | Tops placed through the depth frame at the borehole, elevation stored, ft displayed by default, zone picker, readers (RCP, Earth Modeling) converted at the door |
| MS1 Map Window | shared `src/components/maps/` kit | no | `MapTransform`, painter, viewport (zoom, pan, readout, contour labels, scale bar, north arrow, colour maps, PNG), Earth Modeling on the same viewport |
| MS2 Surfaces in and out | import, export, rename, re-grid | no | Petrel grid formats in and out in the display unit, control-point CSV, row context menu |
| MS3 Geology | polygons, guide points, arithmetic, time-to-depth | no | Fault and boundary polygons in `geo_culture`, blocked gridding, clipping, surface math, GRV read-out, linear V(z) conversion |
| MS4 Integration and help | deep links, launchers, help guide | no | `?surface=`, `?top=&wells=`, Map-this-top from Well Correlation / Petrophysics / Well Data Manager, Open-in launchers out, help guide |
| MS5 Follow-ups | after the series | | Seismolord MapView on the kit, digitizer to `geo_surfaces`, contour editing, kriging, per-user depth unit |

## Recorded decisions (owner, 2026-09-05)

- **Every depth surface in `geo_surfaces` is elevation**: negative
  below datum (TVDSS), in metres or feet per `z_unit`. Readers honour
  `z_unit` and convert at the door (`src/lib/surfaceConvention.js`).
  Live `geo_surfaces` had zero rows on 2026-09-05, so no backfill.
- **Mapping displays depth in feet by default**, toggle to metres,
  persisted per browser (`localStorage` key `mapping.depthUnit`); a
  per-user settings column is a follow-up.
- **Fault and boundary polygons live in `geo_culture`** with kinds
  `fault_polygon` and `boundary` (no DDL). Earth Modeling keeps its own
  `faultPolygons` until a later fold-in.
- **Time-to-depth is in scope (MS3)**, linear V(z) from a Seismolord
  volume's velocity model, output default feet; a layer cake is refused
  with a message naming Seismolord.
- **No tester date**: the whole series ships, one zip at the end.

## Wave log

- **MS0 built 2026-09-05.** Engines PR #137 (merged, 526bdef): the depth
  frame gains `mdToPosition`; `topsToControlPoints(wells, top,
  {depthRef, placement})` places tops as TVDSS elevation at the borehole
  with fixed skip reasons and an extrapolated count; gridmath gains
  `thickness`, `convertZUnit`, `maskOutsidePolygon`; oracle
  `tools/validation/mapping/oracle_structure_points.py` writes
  closed-form goldens including a dipping plane that TPS reproduces at
  193 interior nodes. Suite: depth reference select (default TVDSS),
  zone picker for attribute maps, depth display unit (ft default),
  status naming skipped and extrapolated wells, isochore as top-to-base
  thickness on elevations, ReservoirCalc Pro's import reads the
  convention from the registry, Earth Modeling converts at read and
  publish, harness wells carry KB, TD and two surveys (KETA-2, KETA-5).
- **MS1 built 2026-09-05.** New shared map kit `src/components/maps/`:
  `mapTransform.js` (metre-world camera, y up, PAD-44 fit, zoom about
  the cursor, pan, clamp; Seismolord's cell-index `ViewTransform` stays
  put), `annotations.js` (the generic half of Seismolord's, moved with
  identity re-exports: nice steps, tick format, scale bar, north arrow),
  `lut.js` (`buildLut` moved from shaderChunks, the structure ramp,
  `MAP_COLORMAPS`), `contourLabels.js` (a pure port of Seismolord's
  label loop, parity-tested), `mapPainter.js` (raster, contours with
  labels, wells with posted values and borehole markers, polygons,
  culture, colour bar with ticks and interval, scale bar, north arrow,
  axes, cursor sampling), `mapPng.js`, `MapViewport.jsx` (wheel zoom,
  drag pan, double-click fit, keyboard, readout, click-to-digitise,
  data attributes for e2e, `toPng`). Earth Modeling's `MapView` and
  Mapping's `MapCanvas` are adapters over it. Found and fixed: both map
  twins drew the raster with grid row 0 at the top while row 0 is the
  southern edge, so every raster was mirrored north-south against its
  own contours and wells (pinned by `paintRaster`'s test). Mapping
  gains a Display section (contour interval in the display unit,
  colour map, reverse, labels, names, posted values, legend, scale
  bar, north arrow, axes), saved with a surface in
  `provenance.display`, and a titled PNG export.
- **MS2 built 2026-09-05.** Surfaces in and out: an import dialog on
  the shared registry (`parseSurfaceFile` for XYZ, CPS-3, ZMAP+, Irap;
  domain depth | time | attribute; depth unit; sign detected from the
  data and overridable; file CRS through `CrsPicker`, converted into the
  Project CRS when both are known; pure `services/importPlan.js`), a
  row context menu (export as XYZ / CPS-3 / ZMAP+ / Irap in the display
  unit through the byte-golden writers with a CRS label on ZMAP+,
  control points CSV from `provenance.points`, rename inline, re-grid
  in place, share, delete), domain/unit and CRS badges with a
  provenance tooltip, and `surfacesRegistry.replaceSurfaceGrid` (same
  id and storage path, previous frame in `provenance.history`) so
  Earth Modeling stacks and ReservoirCalc imports keep pointing at a
  re-gridded surface.
- **MS3 built 2026-09-05.** Geology on the map: fault-block and
  boundary polygons drawn by clicking (saved to `geo_culture` as
  `fault_polygon` / `boundary` in the map's frame; pure
  `services/polygonTools.js`), gridding that honours them (fault blocks
  through Earth Modeling's `labelBlocks` into `gridSurfaceBlocked`, a
  boundary through `maskOutsidePolygon`), guide points (hand-placed
  control values that grid with the wells, hand editing v1), a surface
  arithmetic section (isochore, add, subtract, multiply, min, max,
  scalar add and multiply, clip; `services/arithmetic.js`), a quick GRV
  read-out on the byte-golden `grvAcreFt` (`services/quickGrv.js`,
  within 3% of the dome oracle on its 20 m grid), and time-to-depth of
  a TWT surface through a Seismolord volume's linear velocity model,
  output elevation in feet by default (`services/timeDepth.js`; layer
  cakes refused with a message naming Seismolord). No migrations.
