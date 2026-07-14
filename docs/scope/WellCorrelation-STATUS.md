# Well Correlation — STATUS

Plan of record: docs/scope/WellCorrelation-PLAN.md (**approved as
drafted 2026-07-13**, all four §7 questions confirmed). Roadmap slot:
Geoscience-ROADMAP.md Phase G3. Slug `well-correlation` — **SHIPPED 2026-07-13, tile Active**. Phase G3
complete (G3.0–G3.3). Live at
`/dashboard/apps/geoscience/well-correlation`; the legacy
`well-correlation-tool` route redirects to it.

Production note: **RESOLVED 2026-07-14** — prod is current (source zip
from main `e84f8a181` uploaded to Hostinger); tile route and legacy
redirect are live on petrolord.com.

## Phase status

| Phase | Status | Landed |
|---|---|---|
| G3.0 section engine + goldens | **DONE** | PR #60 — engine/section.js (datum flattening, correlation lines, zone spans), deterministic 3-well sampleSection, 13 analytic tests, no-oracle rationale documented |
| G3.1 tops CRUD + section table + pentest | **DONE** | this branch — saveTop/updateTop/deleteTop/propagateTop in wellsRegistry; migration 20260713240000 **applied live**; pentest blocks 10–11 green |
| G3.2 cross-section workstation | **DONE** | this branch — CrossSection canvas (per-well GR tracks, correlation lines, zone fills, datum flattening, draggable top handles), map + list section-path picker, datum/tops/zone/propagate controls, /dev/well-correlation harness on the 3-well section; 20 jest + e2e (order 3, drag Top Dome, flatten, propagate) |
| G3.3 cross-app + close-out | **DONE** | this branch — cross-app smoke (a correlation top is returned by Seismolord's exact embed); 76-file orphaned cluster + WellCorrelationProvider deleted; app page + route; tile Active (migration 20260713250000, **applied live**); legacy slug redirects |

## Key facts

- Registry-native: wells/curves/tops/zones via `src/lib/wellsRegistry.js`
  (G1/G2 tables). **Tops picked here are `geo_wells_tops` rows** — edits
  reach Seismolord well-ties and G4 Mapping with no re-import (the G3
  acceptance criterion).
- Per-top writes are owner-only via the existing `geo_wells_tops` RLS
  (no policy change); 0-row writes surface as owner-only errors. Section
  state is owner-only in `geo_correlation_sections`.
- Datum flattening is exact closed-form arithmetic — validated by
  analytic jest cases, not a Python oracle (see
  src/pages/apps/WellCorrelation/services/README.md).
- Top propagation v1 is MANUAL (same-MD seed + user drag); auto-
  correlation is out of v1 scope.
