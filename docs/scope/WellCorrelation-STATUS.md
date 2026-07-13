# Well Correlation — STATUS

Plan of record: docs/scope/WellCorrelation-PLAN.md (**approved as
drafted 2026-07-13**, all four §7 questions confirmed). Roadmap slot:
Geoscience-ROADMAP.md Phase G3. Slug `well-correlation` (tile ships at
G3.3 with the route; legacy `well-correlation-tool` redirects to it).

## Phase status

| Phase | Status | Landed |
|---|---|---|
| G3.0 section engine + goldens | **DONE** | PR #60 — engine/section.js (datum flattening, correlation lines, zone spans), deterministic 3-well sampleSection, 13 analytic tests, no-oracle rationale documented |
| G3.1 tops CRUD + section table + pentest | **DONE** | this branch — saveTop/updateTop/deleteTop/propagateTop in wellsRegistry; migration 20260713240000 **applied live**; pentest blocks 10–11 green |
| G3.2 cross-section workstation | pending | shell, map well-path picker, per-well tracks, datum control, tops pick/drag/propagate, zone fills, correlation lines, /dev harness + e2e |
| G3.3 cross-app + close-out | pending | Seismolord cross-visibility smoke; delete ~65-file orphaned cluster + provider; app page + route + Active tile; redirect alias |

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
