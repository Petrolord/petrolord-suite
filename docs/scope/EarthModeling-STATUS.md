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
