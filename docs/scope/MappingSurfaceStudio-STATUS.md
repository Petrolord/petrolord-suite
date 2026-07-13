# Mapping & Surface Studio — STATUS

Plan of record: docs/scope/MappingSurfaceStudio-PLAN.md (**approved as
drafted 2026-07-13**, all four §8 questions confirmed). Roadmap slot:
Geoscience-ROADMAP.md Phase G4. Slug `mapping-surface-studio` — **SHIPPED 2026-07-13, tile Active**.
Phase G4 complete (G4.0–G4.4). Live at
`/dashboard/apps/geoscience/mapping-surface-studio`.

Deferred (cuttable per plan §7): the ContourMapDigitizer fold-in as a
raster import wizard — the standalone digitizer stays as-is (it works;
its dead `useIntegration` import was stripped). Prod build upload to
petrolord.com still pending across G1–G4.

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
