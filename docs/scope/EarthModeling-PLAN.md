# Earth Modeling — Phase G8 Plan

Status: **EXECUTED — G8 complete 2026-07-14** (see
EarthModeling-STATUS.md). The roadmap slot was approved
(Geoscience-ROADMAP.md §4 G8 / §2 tile 10); the "proposed decisions"
below were taken as v1 defaults during the autonomous build — owner
may still override any of them post-hoc (each is cheap to revisit).

Roadmap slot: **Phase G8 — Earth Modeling v1** — the last of the 10
tiles. ONE consolidated slot: structural framework + layer-cake zones +
simple property population, export to volumetrics. Full 3D geostatistics
is explicitly OUT of scope. App name **Earth Modeling** (functional
naming, roadmap §6.2), slug `earth-modeling`, route
`apps/geoscience/earth-modeling`, code at `src/pages/apps/EarthModeling/`.

## What this is

The consolidation app: take the structural surfaces built in Mapping &
Surface Studio, the correlated tops picked in Well Correlation, and the
zone properties published by Petrophysics Studio, and assemble them into
a consistent layer-cake earth model — an ordered stack of horizons on a
common lateral grid, zones between them, per-zone property grids
(NTG/porosity/Sw) populated from wells by constant / trend / simple
kriging, fault polygons segmenting the model into blocks — then report
per-zone/per-block rock volumes and publish GRV-ready surfaces back to
the registry for ReservoirCalc Pro.

Division of labour (contract): Earth Modeling does **rock volume +
property population** (bulk/net/pore volume per zone per block). Fluids,
contacts, recovery and uncertainty stay in **ReservoirCalc Pro** — the
model exports surfaces/isochores it can consume, it does not duplicate
contact-based GRV.

## Audit summary (2026-07-14, four sweeps — details in PR)

- **Legacy shells**: the routed `earthmodel-studio`/`earthmodel-pro`
  pages are standalone hardcoded-demo widgets under
  `src/components/geoscience/`; both tiles already Archived
  (20260712200000). The heavyweight `src/pages/apps/EarthModelStudio.jsx`
  (the 30-import consumer of `subsurface-studio/`) is **orphaned** — not
  routed, imported nowhere. The G0-era claim "the routed page uses the
  subsurface-studio tree" is stale.
- **`src/components/subsurface-studio/`**: 284 files / ~21k loc, mock
  scaffolding. Exactly **3 files are live** — `analytics/charts/
  {StressCharts,PressureCharts,PlotlyChartFactory}.jsx`, imported by the
  still-routed MechanicalEarthModel (and even those render Math.random
  data). Everything else dies with G8.
- **Routed but broken**: `EarthModelStudioProjects.jsx` queries
  `ss_projects`, a table with no migration — dies with the shells.
- **Registries**: `geo_surfaces` (f32 grids + full geometry metadata) via
  `src/lib/surfacesRegistry.js`; tops are **MD-only** (`geo_wells_tops`)
  so TVDSS comes from the well's `deviation` jsonb + `kb_m`; zone
  properties live in `geo_wells_zones.properties`
  ({phi_avg, sw_avg, ntg, net_m, gross_m, vsh_avg}, empty until
  published). **No shared fault-polygon store exists** (Seismolord's
  `seismic_faults` sticks are private, survey-index space).
- **Engines already shared**: `src/lib/gridding/` (TPS, fault-blocked
  gridding, contours, byte-golden exporters, `NULL_VALUE=1e30`,
  row-major z[r*nx+c], row 0 = south). RCP's `SurfaceImportDialog`
  lists ALL `geo_surfaces` rows — anything G8 publishes is consumable
  by RCP with zero RCP changes.

## Proposed decisions (owner may override; defaults chosen to keep v1 hard-scoped)

1. **Fault polygons are app-owned in v1.** No shared registry exists;
   inventing one is a shared-table change (second-engineer bar) with a
   single consumer. v1: closed polygons in world XY drawn/imported in
   the map view, stored in the project row. They partition the model
   grid into **fault blocks** (point-in-polygon labeling); property
   population runs per block (wells outside a block don't leak in —
   same philosophy as `gridSurfaceBlocked`). Promote to a `geo_*`
   registry when a second consumer appears (the WorkspaceShell rule).
2. **Data model: app-private `em_projects` only** (rp_projects
   pattern, owner-only RLS — no new shared tables, no second-engineer
   bar). The project row stores the model **definition** (surface ids,
   zone table, method params, fault polygons, grid spec) — small jsonb.
   Grids are deterministic outputs and are **recomputed on load**, never
   blobbed. Publishing to `geo_surfaces` is the explicit share action.
3. **Zonation source = surfaces, tops are QC.** Zones are intervals
   between picked structural surfaces (the G4 product). Tops give the
   **well-tie QC table**: per well, TVDSS(top via deviation+KB) vs
   surface z at the wellhead-path location — mismatch reported, never
   silently absorbed. (Building surfaces from tops is Mapping Studio's
   job; we don't duplicate it.)
4. **Property control points sit at the zone-midpoint well-path
   position** (MD midpoint of the zone interval → XY via the deviation
   survey, `src/lib/wellpath-kernel.js`), not at surface location —
   correct for deviated wells, cheap, already-validated kernel.
5. **Simple kriging means simple kriging**: known mean = arithmetic
   data mean, spherical/exponential variogram, user range/sill/nugget,
   exact at data points. Plus `constant` (thickness-weighted zone
   average) and `trend` (least-squares plane). No sequential simulation,
   no co-kriging, no facies — that is the post-G8 world.
6. **Stacking rule v1**: depth-down monotonic clamp — surface i is
   clamped to ≥ surface i-1 node-wise; clamped node counts surfaced in
   the UI (never silent). Named truncation styles (erosion/onlap) are
   post-v1.
7. **No 3D window in v1.** Map + cross-section views cover the v1
   acceptance. Seismolord's WebGL primitives (`cube3d.js`,
   `interpMesh.js`, `shaderChunks.js`) are app-private today; Earth
   Modeling as second consumer is the natural extraction trigger —
   scoped as a **stretch follow-on (G8.5)**, not blocking.
8. **Units**: SI metres internally, depth positive down (`z_domain
   'depth'`), conversions at the UI edge (lasImport precedent).

## Engine scope (all oracle-validated before any UI)

`src/pages/apps/EarthModeling/engine/`:

- `framework.js` — resample K picked surfaces onto a common model grid
  spec (bilinear, null-aware — reuse `resampleTo` idiom), monotonic
  clamp stack with per-surface clamp counts, zone thickness grids
  (null-aware subtract), live-node bookkeeping.
- `blocks.js` — fault-polygon → per-node block labels (point-in-polygon,
  even-odd rule), polygon validation (closed, ≥3 vertices,
  self-intersection rejected), block census.
- `wellties.js` — top MD → TVDSS via deviation survey + KB
  (`wellpath-kernel`), zone-midpoint XY control-point extraction,
  well-tie residuals (top TVDSS vs surface z at well XY).
- `properties.js` — per-zone, per-block population from
  `geo_wells_zones.properties` control values:
  `constant` (thickness-weighted mean), `trend` (least-squares plane,
  SVD/normal equations with rank guard), `krige` (simple kriging,
  spherical + exponential variograms, nugget; exactness at data,
  fallback ladder krige→trend→constant when a block has too few wells —
  fallback always recorded in provenance).
- `volumes.js` — per zone × block: bulk volume (thickness × cell area,
  null-aware), net rock volume (× NTG grid), pore volume (× φ), HC pore
  volume (× (1−Sw)); grand totals; all trapezoid-free (cell-center ×
  area — grid is the integration mesh, same convention as
  `grvAcreFt`).

Compute is client-side plain JS + JSDoc. Model grids are capped by
`MAX_GRID_NODES` (4M, shared constant); kriging solves are per-block
n_wells×n_wells (tiny). A worker is NOT expected to be needed for v1 —
revisit if profiling says otherwise (wedge precedent).

## Phases

- **G8.0 — plan + oracle + goldens** (`tools/validation/earthmodel/`,
  stdlib-only Python, never reads JS): oracle.py + genfixtures.py →
  `test-data/earthmodel/goldens.json`. Self-asserted anchors (G2/G6
  precedent): bilinear resample reproduces a linear field exactly;
  clamp of an already-monotonic stack is a no-op; plane trend recovers
  a planar field exactly; simple kriging is exact at data points and
  →mean far from data; nugget=sill ⇒ mean everywhere (weights→0);
  point-in-polygon on convex/concave/hole-free fixtures; volumes of an
  analytic wedge/box match closed form; TVDSS via minimum curvature
  matches the committed wells goldens.
- **G8.1 — engine** validated vs goldens (jest in
  `src/pages/apps/EarthModeling/__tests__/`, 1e-12 rel where exact,
  documented tolerance where iterative); malformed-input fuzz (open
  polygons, crossing surfaces, empty zones, all-null grids).
- **G8.2 — workstation UI**: `WorkspaceShell`
  (`autoSaveId="earthmodeling.workspace.v1"`) + injected backend pair
  (`services/{registryBackend,inMemoryBackend}.js`). Explorer: model
  tree (surfaces → zones → properties, fault blocks, wells). Center
  views (`view` state string, Rock Physics idiom): **Framework** (map
  view of any zone's top/thickness/property with contours via shared
  `mapContours`, fault polygons overlaid, block coloring), **Section**
  (cross-section along a user polyline through the layer cake — filled
  zones, wells + tops posted), **QC** (well-tie residual table + clamp
  report + population provenance, white chartTheme/ChartFrame for any
  analytics). Dock: model builder (surface picker + ordering, zone
  table, per-zone/per-property method + variogram params, fault polygon
  editor list, grid spec). Status bar: grid spec, node/block census,
  compute status. `/dev/earth-modeling` harness seeded with the
  analytic fixtures; Playwright spec asserts oracle numbers off the UI
  (`em-*` testids).
- **G8.3 — persistence + integration**: migration `em_projects`
  (owner-only RLS, rp_projects copy) staging-first + MIGRATIONS.md row;
  save/load model definitions; **publish** actions → `geo_surfaces`
  (zone top/base as `structure`, thickness as `isochore`, property
  grids as `attribute`, provenance `{engine:'earth-modeling',
  project_id, zone, property, method}` with overwrite-own-output rule
  from the petrophysics publish precedent); volumetrics summary panel
  (per zone × block table, white chart standard) + "open in
  ReservoirCalc Pro" handoff note (RCP's SurfaceImportDialog picks the
  published rows up with zero RCP changes).
- **G8.4 — legacy deletion + tile Active + close-out**:
  - DELETE: `src/pages/apps/EarthModelStudio.jsx`,
    `src/pages/apps/EarthModelPro.jsx`,
    `src/pages/apps/EarthModelStudioProjects.jsx`,
    `src/components/geoscience/{EarthModelStudio,EarthModelPro}.jsx`,
    `src/components/earthmodel/**`,
    `src/components/subsurface-studio/**` EXCEPT
    `analytics/charts/{StressCharts,PressureCharts,PlotlyChartFactory}.jsx`
    (live MEM imports — relocate under MEM instead if trivial),
    `config/apps/earthmodel-pro-metadata.js`, earth-model-pro entries in
    `config/dashboardAppsConfig.js` / `config/applicationRoutes.js` /
    `data/pricingModels.js`, `components/dashboard/apps/
    EarthModelProCard.jsx`, `utils/navigation/verifyEarthModelRouting.js`,
    `config/earthmodel-{config,version}.js`, the static tile in
    `pages/apps/GeoscienceHub.jsx`.
  - Routes: legacy slugs (`earthmodel-studio`, `earth-model-studio`,
    `earthmodel-pro`, `earth-model-pro`, `.../projects`) become
    `<Navigate>` aliases to `apps/geoscience/earth-modeling`
    (petrophysics-studio alias precedent).
  - Seed migration: NEW `master_apps` row `earth-modeling`, %ROWTYPE
    sibling copy, status Active + is_built + is_functional (archived
    rows stay archived; the Seismolord seed's template-preference
    lookup keeps working — it only reads).
  - Docs: EarthModeling-STATUS.md, roadmap §2/§4 tick (G8 complete —
    module complete), STATUS pointers.
- **G8.5 (stretch, separate decision)** — 3D framework view by lifting
  Seismolord's pure-math viewer core to a shared location at the
  second-consumer trigger. NOT part of G8 acceptance.

## Acceptance

- Engine: every golden matched at documented tolerance; kriging exact
  at data points; planar-field trend recovery exact; analytic
  box/wedge volumes match closed form; monotonic-stack clamp no-op
  proven; TVDSS conversion matches wells goldens.
- App: on the harness fixture — build a 3-surface / 2-zone model with
  one fault polygon (2 blocks), populate φ/NTG/Sw per block, and the
  QC + volumes tables show the oracle numbers; publish writes
  `geo_surfaces` rows whose grids round-trip byte-identical.
- Cross-app: a published zone-top surface appears in ReservoirCalc
  Pro's import dialog and parses (the G5 loop, now closed from the
  Earth Model side).
- Legacy: all routes above redirect; `subsurface-studio` reduced to
  the 3 MEM chart files (or zero if relocated); build green; jest +
  e2e green.
