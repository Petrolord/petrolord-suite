# Mapping & Surface Studio — STATUS

Plan of record: docs/scope/MappingSurfaceStudio-PLAN.md (**approved as
drafted 2026-07-13**, all four §8 questions confirmed). Roadmap slot:
Geoscience-ROADMAP.md Phase G4. Slug `mapping-surface-studio` (tile
ships at G4.4 with the route).

## Phase status

| Phase | Status | Landed |
|---|---|---|
| G4.0 extract gridding engine | **DONE** | this branch — gridding.js/surfaceExport.js/mapContours.js → src/lib/gridding/; Seismolord re-pointed; byte-goldens (griddingExport/faultGridding/rcpHandoff/mapContours) green |
| G4.1 surface engine + goldens | pending | isochore/±, bilinear resample, registry points → control points |
| G4.2 geo_surfaces + bucket + pentest | pending | shared surface registry, org-read RLS |
| G4.3 mapping workstation | pending | map canvas (raster+contours+wells), gridding, surface math, publish |
| G4.4 RCP reader + close-out | pending | RCP reads geo_surfaces; delete dead hub; digitizer; tile Active |

## Key facts

- Shared gridding/export/contour math lives at `src/lib/gridding/`
  (`gridding.js`, `surfaceExport.js`, `mapContours.js`, `numeric.js`).
  Seismolord's byte-golden tests (`test-data/seismolord/surfaces/`) are
  the extraction tripwire — unchanged and green.
- `geo_surfaces` (G4.2) generalizes `seismic_exported_surfaces`: f32
  grids in a private `surfaces` bucket, org-read RLS (geo_wells model).
- RCP's `SurfaceImportDialog`/`SurfaceParser` is the ready consumer for
  the Seismolord horizon → mapped surface → GRV acceptance.
