# Mapping & Surface Studio — Phase G4 Plan

Status: **APPROVED AS DRAFTED — owner sign-off 2026-07-13.** All four
§8 questions confirmed: (1) `geo_surfaces` grids = float32 blobs in a
private `surfaces` bucket + metadata row; (2) extract the gridding
engine to `src/lib/gridding/` and re-point Seismolord; (3) delete the
dead DataExchangeHub / IntegrationContext and drop the live-but-unused
`shared_data_registry`; (4) surfaces use the org-read / owner-write
sharing model.
Roadmap slot: Geoscience-ROADMAP.md **Phase G4 — Mapping & Surface
Studio** *(medium-large)*. App name **Mapping & Surface Studio**, slug
`mapping-surface-studio` (locked, roadmap §6.2). Builds on the whole
G1–G3 stack: it grids **well tops** (`geo_wells_tops`), **zone
attributes** (`geo_wells_zones.properties`) and imported horizons into
mapped surfaces, and publishes them to a new shared **`geo_surfaces`**
registry that ReservoirCalc Pro and others consume.

## What this is

The map room: take scattered control points — well tops picked in Well
Correlation, zone averages from Petrophysics Studio, a Seismolord
horizon export, or an imported third-party grid — grid them into a
surface (reusing Seismolord's *validated* TPS / fault-aware engine),
contour and edit them, do surface arithmetic (isochores, ±, depth
conversion), and hand the result to volumetrics **without touching the
filesystem**. The posted-well basemap ties it back to the registry.

## Audit (2026-07-13)

- **`geo_surfaces` does not exist** — G4 creates it (verified live).
- **Reuse, don't duplicate**: three pure, test-locked modules extract
  cleanly to `src/lib/`:
  - `Seismolord/engine/gridding.js` — `gridSurface` (TPS + hull mask +
    max-extrapolation), fault-aware `gridSurfaceBlocked`, `fitTps`,
    `decimateControls`, `convexHull`, `exportGridSpec`,
    `MAX_GRID_NODES`. Only tie: `NULL_VALUE` from `./manifest`.
    (`picksToPoints` is survey-affine-coupled → stays in Seismolord.)
  - `Seismolord/engine/surfaceExport.js` — `writeXYZ`/`writeCPS3`/
    `writeZMAP` (byte-exact), `grvAcreFt`, `pyFixed`/`pyExp`. Zero
    imports.
  - `Seismolord/viewer/mapContours.js` — marching-squares
    `contourLevels`/`contourSegments`/`contourPolylines`/
    `buildMapPixels`/`pointInPolygon`. Reuse for the new map canvas
    (MapView.jsx itself is Seismolord-coupled — do NOT lift it).
  - Consumers are ~5 Seismolord files + the goldens tests; a move
    needs only path updates. **The byte-golden oracle
    `griddingExport.test.js` (+ faultGridding, rcpHandoff, mapContours)
    is the extraction tripwire — must stay green.** Goldens live at
    `test-data/seismolord/surfaces/`.
- **`seismic_exported_surfaces`** (Seismolord Phase 5) is the existing
  narrow handoff: user-scoped, XYZ in the seismic bucket at
  `{uid}/exports/{id}.xyz`, written by `services/exportsService.js`
  (`publishSurface`), read by **RCP's `SurfaceImportDialog` +
  `SurfaceParser`** (which already reads XYZ reliably). `geo_surfaces`
  generalizes its shape; RCP is the ready-made consumer.
- **Dead data-exchange — confirmed deletable, precise footprint**: the
  `data-exchange` edge function does NOT exist (invoke → 404), and
  `shared_data_registry` has **no repo migration**. IMPORTANT nuance
  the stale note missed: the table nonetheless **exists live** (0 rows,
  RLS, created out-of-band) — so cleanup is a live rollback-wrapped
  DROP *plus* code removal. Consumers (all no-ops):
  - `contexts/IntegrationContext.jsx` (provider mounted in App.jsx;
    `publishData`/`searchSharedData` → the missing edge fn),
  - `components/DataExchangeHub.jsx` (only rendered by
    `BasinFlowAnalysis.jsx`),
  - `EarthModelPro.jsx` / `AnalogFinder.jsx` / `useContourDigitizer.js`
    each destructure a `dispatch` the context never provides (dead).
  Nothing functional is lost.
- **ContourMapDigitizer** (`apps/geoscience/contour-map-digitizer`,
  routed, ungated hub tile — no master_apps row): real raster
  digitizer (OpenCV auto-trace → 3-pt georeference → IDW/kriging via
  its own `src/utils/gridding.js` → GeoJSON/DXF/CSV; own
  `contour_projects` table). Fold its capability in as an import
  wizard (G4.4); trivially detaches from the dead `useIntegration`.

## Design decisions (proposed — owner sign-off locks these)

1. **Reuse, don't duplicate, the gridding engine.** Move the *pure*
   core of Seismolord's `engine/gridding.js` + `engine/surfaceExport.js`
   to a shared location `src/lib/gridding/` (the second-consumer
   extraction rule, as with WorkspaceShell/wellsRegistry). Seismolord
   re-points its importers; **its griddingExport / faultGridding /
   rcpHandoff goldens must stay byte-identical green** — the writers do
   not change, they move. Seismolord-coupled glue (`picksToPoints`,
   which needs `geom`/`affine`) stays in Seismolord and imports the
   shared core.
2. **`geo_surfaces` — the shared surface registry** (the geo_wells
   pattern): a metadata row per surface + the grid as a **float32 blob
   in a private `surfaces` bucket** at `{user_id}/{surface_id}.f32`
   (never large jsonb — the brick rule). Columns: origin X/Y, nx/ny,
   dx/dy, z-domain + units, null value, `crs_note`, `provenance` jsonb
   (source app/record, gridding params, control-point count), owner
   `user_id` + nullable `organization_id` (org read-only, the locked
   G1 model via `is_org_member`). Consumed by RCP volumetrics and any
   later app. Shared-table review bar + a live RLS pentest.
3. **`shared_data_registry` / dead hub disposition** (audit-confirmed):
   G4 introduces a **typed** surface exchange (`geo_surfaces`) and
   formally retires the dead generic hub. Code: delete
   `IntegrationContext.jsx` + `DataExchangeHub.jsx`, unmount the
   provider in App.jsx, strip the no-op `useIntegration`/`dispatch`
   lines from `EarthModelPro`, `AnalogFinder`, `useContourDigitizer`,
   and remove the two `<DataExchangeHub>` panes in `BasinFlowAnalysis`.
   DB: a rollback-wrapped **DROP of the live-but-unused (0-row)
   `shared_data_registry`** (it has no repo migration, so the drop
   migration also records its prior existence). All consumers are
   no-ops today (the backing edge function 404s), so nothing functional
   is lost.
4. **Gridding sources from the registry, first-class**: control points
   come from (a) a picked **top across wells** (`geo_wells_tops` by
   name — the Well Correlation output), (b) a **zone attribute**
   (`geo_wells_zones.properties.<key>` — the Petrophysics output),
   (c) an **imported grid/points** (XYZ / CPS-3 / ZMAP+ / seismic
   export), or (d) a Seismolord `geo_surfaces` horizon. No filesystem
   round-trip for suite data.
5. **Surface math, validation-first**: isochore (A−B on the common
   grid), scalar ±, depth conversion via the shared velocity
   conventions (the Seismolord depth model, not a new one). Grid
   resampling to a common frame for two-surface ops is exact bilinear;
   validated by analytic jest cases + the reused export goldens.
   `grvAcreFt` reused unchanged → the RCP GRV acceptance number holds.
6. **UI: workstation on the shared shell**: left explorer = surfaces
   list + control-point source picker (registry wells/tops/zones);
   center = the **map canvas** — gridded surface as a color raster with
   **contours** and posted wells (this is a MAP viewport, dark, like
   Seismolord's MapView, not an analytic chart; the white chartTheme
   applies only to any histogram/stats side-panels); right dock =
   gridding params, surface math, export. Injected backend pair so
   `/dev/mapping-surface-studio` drives the full app authless; e2e
   grids a synthetic top set and contours it.
7. **Contour digitizer folded in** as a raster→grid import wizard
   (the ContourMapDigitizer capability, utility-grade, flagged
   `digitized`), the G2.6 digitizer precedent. LAST build item,
   cuttable.
8. **Catalog**: `master_apps` row (Geoscience, `mapping-surface-studio`,
   template-copy) flipped Active only at close-out with the route in
   the same PR. Superseded mapping shells archived/redirected per the
   audit.

## Schema sketch (G4.2 migration, staging-first, second-engineer review)

```
geo_surfaces: id, user_id FK, organization_id null,
  name, kind (structure|isochore|attribute|imported),
  origin_x, origin_y, nx, ny, dx, dy, rotation_deg default 0,
  z_domain (depth|time|attribute), z_unit, null_value,
  crs_note, provenance jsonb, storage_path, created_at, updated_at
  RLS: owner + org-read (is_org_member), owner-only writes (geo_wells
  pattern). Grid f32 in private `surfaces` bucket, owner-path +
  shared-read policies (the wells-bucket pattern).
```

## Phases

- **G4.0 — Extract + reuse the gridding engine** *(small-medium)*:
  move the pure gridding/export core to `src/lib/gridding/`; re-point
  Seismolord; **all Seismolord gridding goldens byte-identical green**;
  a thin re-export shim if needed. Accept: zero golden drift.
- **G4.1 — Surface engine + goldens** *(small-medium)*: `engine/`
  surface math (isochore, ±, bilinear resample to a common frame,
  registry-points → control points) + analytic jest + a synthetic
  golden surface; reuse the export/GRV goldens. Accept: GRV number
  matches the existing acre-ft truth.
- **G4.2 — `geo_surfaces` + bucket + pentest** *(small)*: migration
  (table + `surfaces` bucket + policies), MIGRATIONS.md, live RLS
  pentest (owner/org-read/non-member/storage-path).
- **G4.3 — Mapping workstation** *(large)*: shell, surfaces explorer,
  control-point source picker, map canvas (raster + contours + posted
  wells), gridding params, surface math, publish to `geo_surfaces`;
  `/dev/mapping-surface-studio` harness + e2e.
- **G4.4 — Cross-app + close-out** *(small-medium)*: **RCP reads
  `geo_surfaces`** — add a "Surfaces from Mapping Studio" source to
  RCP's `SurfaceImportDialog` (additive, the same pattern it already
  uses for `seismic_exported_surfaces`), so Seismolord horizon → mapped
  surface → RCP GRV closes in-DB (live smoke + RCP suites green);
  formally retire the dead DataExchangeHub / `shared_data_registry`
  path (code deletes + rollback-wrapped table drop); contour-digitizer
  import wizard; app page + route + Active tile in one PR; STATUS +
  roadmap.

## Risks

- **Golden drift on extraction**: the gridding/export writers are
  byte-locked to committed goldens. Defense: move, don't modify;
  Seismolord's griddingExport/faultGridding/rcpHandoff suites are the
  tripwire and must stay green at G4.0.
- **`shared_data_registry` lives without a migration**: dropping it is
  a live-DB change with no rollback file to reverse; gate on the audit
  + a rollback-wrapped drop, and confirm 0 real consumers first.
- **Scope gravity** (mapping expands forever): v1 = structure/isochore/
  attribute grids, contour display, two-surface math, RCP handoff. No
  fault-network modelling, no advanced geostatistics (kriging/
  variograms) in v1 — TPS only, growth against goldens.

## Open questions for sign-off

1. **`geo_surfaces` grid storage** = float32 blob in a private
   `surfaces` bucket + metadata row (recommended, the geo_wells_logs
   pattern) vs jsonb grid. Confirm blob.
2. **Gridding engine location** = `src/lib/gridding/` shared, Seismolord
   re-pointed (recommended) vs leave in Seismolord and import across
   apps. Confirm the extraction.
3. **Dead data-exchange**: formally delete DataExchangeHub +
   IntegrationContext and drop the live-but-unused
   `shared_data_registry` table (recommended) vs leave dormant.
   Confirm — the exact code set comes from the audit.
4. **Org sharing for surfaces** = same org-read/owner-write model as
   wells (recommended) vs owner-only in v1. Confirm.
