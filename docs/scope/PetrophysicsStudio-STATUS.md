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
**PS4 (track builder) DONE 2026-09-02**: layout templates in
petro_projects.layouts (clone-on-edit built-ins, portable curve
addresses), LayoutPanel editor, header-click editing, ft display
toggle, track plot PNG export.
**PS5 (temperature + shaly-sand Sw) DONE 2026-09-02**: linear
BHT temperature model with Rw(T), Waxman-Smits/dual-water/modified
Simandoux (engines PR #95, PIPELINE_VERSION 3, oracle-gated with
exact Archie reductions), SP + Arps Rw tools wired; Bateman-Konen
stays gated (B5).
**PS6 (permeability) DONE 2026-09-02**: Timur/Tixier/Coates/
Wyllie-Rose + Buckles BVW (engines PR #96, PIPELINE_VERSION 4, mD
units exception documented), zone k geometric means, k log track,
KPERM published (audit B2 closed).
**PS7 (histograms) DONE 2026-09-02**: Histograms center view with
cumulative frequency, P10/50/90, zone filters, draggable cutoffs
writing back to params, multi-well overlays, GR normalization fits
(engines PR #97; apply lands with PS8 conditioning).
**PS8 (conditioning) DONE 2026-09-02**: Hampel despike, smoothing,
block depth-shift, bad-hole repair, normalization apply (engines PR
#98); results save as KEY_CND with operation provenance, raw curves
untouched, explicit input picker in the explorer (audit B3 closed,
D1b satisfied in-app).
**PS9 (field view) DONE 2026-09-02**: up to 8 wells side by side with
per-well zoned compute, flatten-on-top datum (wellcorrelation
engine), cross-well zone summary table, shared decimating curve
renderer with a static + overlay canvas split (audit C1 closed).
**PS10 (close-out) DONE 2026-09-02 — PROGRAM COMPLETE**: Hingle plot
with Rw fit, split view + selection brush, TVD axis labels
(deviation-gated), zone boundary drag, matrix-ID quicklooks +
Thomas-Stieber (engines PR #99); Elan-class solver stays a recorded
deferral. See the ROADMAP close-out for merge order and open items.
**Help guide DONE 2026-09-02**: full-page in-app guide on the shared
HelpGuideLayout shell at `/dashboard/apps/geoscience/petrophysics-studio/help`
(19 sections: workspace, quick start, curve mapping, tracks + layouts,
every Vsh/porosity/Sw/permeability method with defaults, zones, interpretations,
crossplots, histograms, conditioning, Rw tools, field view, publish/batch/
digitize, exports, units/provenance, validation basis, pitfalls, glossary).
Ribbon Help link added; guard test pins section anchors, the live curve
alias table, the recorded deferrals and the no-em-dash copy rule (which also
caught and fixed the Batch dialog title).

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

## 2026-09-03 owner findings from the staging E2E

- **White tracks.** `TrackViewer` (single well and Split), `MultiWellTracks`
  (Field) and the PNG export header now paint on white with slate grid,
  frames and axis text (the Suite chart standard in
  `src/utils/chartTheme.js`); tops, zone bands, crosshair and scale
  labels moved to darker members of the same hues. The built-in layout
  defaults (`layout/layoutSchema.js`) and the Layout panel's new-curve
  colours were darkened to carry on white (GR emerald-600, RT/RHOB
  red-600, NPHI blue-500 dashed, φe cyan-600, Sw blue-600, k pink-600,
  pay green-600, DT violet-600). Layouts users already saved keep their
  own colours. Verified on the staging harness (canvas centre pixel
  255,255,255; Tracks and Field screenshots).
- **One well name per registry.** Raised here because the explorer lists
  wells by name; the rule lives in the shared registry
  (`src/lib/wellsRegistry.js` saveWell/updateWell) so every door obeys it:
  Well Data Manager add and LAS import, Seismolord well creation, Well
  Planning publish. Match is case- and whitespace-insensitive across the
  wells the caller can see (own + teammates' shared); rename to itself is
  allowed. Server backstop `20260903120000_geo_wells_unique_name_per_owner.sql`
  (same-owner half) applied 2026-09-03 after the owner took the
  shared-table review; duplicate probe was 0 groups.
- **Any mnemonic on a track; several of one type together.** Owner
  finding: only alias-recognised curves displayed. Three changes.
  (1) `services/curveMap.js` alias table widened (resistivity now covers
  RES/RESD/ILD/LLD/RLA*/AT*/AF*/A16H…A40H/P16H…P40H/M2R*/HLLD…; GR, RHOB,
  NPHI, DT, CAL, DRHO, PEF likewise) and `candidatesFor` also offers
  curves whose LAS description names the measurement (`DESCRIPTION_HINTS`),
  picker only, never auto-bound. (2) New layout address `log:<MNEMONIC>`
  (`layout/resolveTracks.js`): the workstation and the field-view cache
  now download EVERY curve of a well (`wellData.logs` keyed by mnemonic,
  inputs are views onto them), so Track layout's curve picker lists every
  mnemonic in the selected well and a track can hold any number of them.
  (3) Explorer shows "Also in this well: …" for curves no input took.
  Help guide's alias table now renders from the live list (the test
  that pins it caught the stale hand-written copy). Tests: curveMap.test.js,
  layout.test.js (log: addresses + crossover fill on two raw curves).

## PT0 foundations (2026-09-03)

The tester-findings program (ROADMAP "PT series") starts with a
no-visible-change wave: the checkshot conventions engine and its
closed-form goldens (engines PR #102), shared viewer math
(`src/components/wells/depthNavMath.js`), a deterministic top palette
shared with Well Correlation (`topColors.js`), pure hit tests
(`viewer/hitTest.js`: a top is only hit in its right-edge tag zone, zone
edges anywhere), `trackGeometry`, display-unit helpers, and the
TrackViewer redraw split (static picture cached offscreen, cursor layer
composited per move). All three vertical viewers accept a controlled
`view` prop for the PT5 navigator. Zone drag and move statuses now print
in the display unit.

## PT1 (2026-09-03)

Well Data Manager gained Petrel-style checkshot entry and editable well
data (see WellDataManager-STATUS). In this app: the explorer's selected
own well shows an "Edit well data" link into Well Data Manager
(`?well=<id>&tab=checkshots`; the harness points at its own harness
route).
