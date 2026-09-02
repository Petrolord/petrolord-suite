# Petrophysics Studio — STATUS

Plan of record: docs/scope/PetrophysicsStudio-PLAN.md (**approved as
drafted 2026-07-13**, all five §8 questions confirmed). Roadmap slot:
Geoscience-ROADMAP.md Phase G2 — the flagship. Slug `petrophysics-studio` — **SHIPPED 2026-07-13, tile Active**.
Phase G2 complete (G2.0–G2.6). Live at
`/dashboard/apps/geoscience/petrophysics-studio`.

**Upgrade program PS1–PS10 approved 2026-09-01** (senior-petrophysicist
parity vs Techlog/IP/PowerLog): see
docs/scope/PetrophysicsStudio-ROADMAP.md. **PS1 (signature visuals)
DONE 2026-09-01**: crossover/threshold track fills + density-neutron
overlay track, z-colored interactive crossplots (colorbar, zoom/pan,
identify), Buckles plot (engines PR #92), mock LogDataQCViz retired.
**PS2 (deliverables) DONE 2026-09-01**: curves + zone CSV, round-trip
gated LAS 2.0 writer (engines PR #93), branded PDF summary report with
engine citations, no-depth empty state (audit A1/C2/C3 closed).
**PS3 (interpretations + per-zone params) DONE 2026-09-02**: named
interpretations CRUD, per-zone override patches through the zoned
pipeline (engines PR #94, PIPELINE_VERSION 2), migration
20260901120000 applied live (audit A2/B1 closed).

Production note: **RESOLVED 2026-07-14** — prod is current (source zip
from main `e84f8a181` uploaded to Hostinger); the tile, route and the
five legacy-route redirects are all live on petrolord.com.

## Phase status

| Phase | Status | Landed |
|---|---|---|
| G2.0 oracle + goldens | **DONE** | PR #59 — independent stdlib Python oracle, analytic 201-sample type well (exact Archie round-trip anchors), byte-identical goldens, README numeric contract |
| G2.1 engines | **DONE** | PR #59 — engine/{vsh,porosity,rw,sw,netpay}.js ported from the proven legacy core + hardened; 32 jest tests vs goldens at 1e-12 |
| G2.2 schema + pentest | **DONE** | migration 20260713220000 **applied live 2026-07-13**; pentest blocks 8–9 executed, 6/6 green |
| G2.3 workstation core | **DONE** | this branch — workstation on the shared shell, canvas TrackViewer (zoom/pan/crosshair, zone bands, tops), draft-and-apply ParameterPanel, ZoneManager w/ live oracle-verified summaries, engine/pipeline.js, /dev/petrophysics-studio harness seeded with the analytic type well; e2e asserts the ORACLE numbers off the UI (SAND A net 18.0 m, SAND B 2.5 m) |
| G2.4 crossplots + facies + Pickett | **DONE** | this branch — white-chartTheme ND + Pickett crossplot canvas (ChartLogo), polygon facies tagging + FACIES strip track, depth-windowed Pickett water-line fit writing m/Rw back; fixture v2 (clean sands + porosity trend, self-asserting anchors) after the fit exposed v1's vacuous clean-rock checks |
| G2.5 write-back + batch | **DONE** | this branch — publish computed curves (overwrite-own provenance contract) + zone summaries to the registry, multi-well batch dialog, petro_projects params/facies persistence; live smoke: computed curve inserts under RLS with provenance intact |
| G2.6 digitizer + close-out | **DONE** | this branch — raster digitizer wizard, 5 superseded apps + exclusive subtrees deleted (shared crossplot kept for subsurface-studio), routes redirect to the new app, tile Active (migration 20260713230000, **applied live**) + route in this PR |

## Key facts

- Registry-native: all well/curve/top data via `src/lib/wellsRegistry.js`
  (G1 tables). Computed curves publish as ordinary `geo_wells_logs`
  rows with `provenance.computed` — no schema change.
- Validation: dual implementation vs `tools/validation/petrophysics/`
  (independence rule — the oracle is never written from the legacy or
  engine JS). Numeric contract in test-data/petrophysics/README.md.
- Bateman-Konen Rwe→Rw is deliberately OUT of v1 (no verifiable open
  source for the coefficients); the SP chain is the documented
  quicklook approximation.
- The legacy `src/utils/petrophysicsCalculations.js` stays untouched
  until its consumers die at G2.6 (PetrophysicsEstimator still uses it).
