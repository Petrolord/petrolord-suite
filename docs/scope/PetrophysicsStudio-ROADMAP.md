# Petrophysics Studio — Upgrade ROADMAP (PS1–PS10)

**Plan of record, approved by the owner 2026-09-01.** Goal: make the
Studio satisfying to a senior petrophysicist coming from Techlog,
Interactive Petrophysics or PowerLog — their visual expectations, their
depth of analysis, and their deliverables. Ordering decision:
**visual-wow-first** (PS1 leads with display and interactivity).

Supersedes the wave list in `PetrophysicsStudio-Audit.md` (Bands A–D
were the evidence base; the audit remains the finding-by-finding
reference). Execution disciplines carried over unchanged from G2:
engines-first in `Petrolord/petrolord-engines` (oracle + goldens at
1e-12, literature-cited), branch + PR per wave, registryBackend /
inMemoryBackend always changed as twins, `/dev/petrophysics-studio`
harness stays the demo and e2e surface, STATUS.md updated per wave.

## Program

| Wave | Theme | Audit items | New math | DDL | Status |
|---|---|---|---|---|---|
| PS1 | Signature visuals: crossover + threshold track fills, per-curve scales (D-N overlay), z-colored crossplots w/ colorbar, zoom/pan, point identify, Buckles plot; retire the mock QC app | D1a | bucklesIsoBvwLine (engines PR #92) | no | **DONE 2026-09-01** |
| PS2 | Deliverables: curves + zone CSV, LAS 2.0 writer (round-trip gated), branded PDF summary report; empty state instead of the no-depth hard error | A1, C2, C3 | LAS writer | no | **DONE 2026-09-01** |
| PS3 | Named interpretations (list/open/save-as/rename/delete) + per-zone parameter overrides; zoned pipeline (`computeWellZoned`, PIPELINE_VERSION 2) | A2, B1 | zoned driver | **yes** (petro_projects) | **DONE 2026-09-02** |
| PS4 | User track builder + named layout templates (petro_projects.layouts), ft display toggle, PNG export of the track view | — | no | no | **DONE 2026-09-02** |
| PS5 | Formation temperature model + Waxman-Smits / dual-water / Modified Simandoux Sw + Rw quicklook tools wired (SP, Arps); PIPELINE_VERSION 3 | B5 partial | large | no | queued |
| PS6 | Permeability (Timur, Tixier, Coates, Wyllie-Rose) + Buckles BVW analysis + zone k geometric mean; PIPELINE_VERSION 4 | B2 | yes | no | queued |
| PS7 | Histogram panel: cumulative frequency, P10/P50/P90, zone filters, draggable cutoff lines writing back to parameters; multi-well GR overlay + normalization fit | — | normalize.js | no | queued |
| PS8 | Log conditioning: Hampel despike, smoothing, block depth-shift, bad-hole flag/repair; conditioned curves published as new `_CND` registry curves, raw untouched | B3, D1b | yes | no | queued |
| PS9 | Multi-well field view: render refactor (static + overlay canvases, decimation), per-well columns, top-flattening, cross-well zone summary table | C1 | no | no | queued |
| PS10 | Split view + linked brushing, Hingle plot, TVD axis labels (deviation-gated), zone boundary drag, matrix-ID quicklook + Thomas-Stieber | B4 recorded | small | no | queued |

## Recorded decisions

- **Probabilistic multi-mineral (Elan-class) solver: deferred** (audit
  B4 becomes a decision, not an accident). Tool-response matrices,
  constrained weighted least squares and per-tool calibration UI are an
  L–XL program with validation costs the oracle doctrine makes very
  large; revisit on adoption signal.
- Bateman-Konen Rwe→Rw stays gated on a page-referenced source (B5).
- Canvas fills are implemented natively in the TrackViewer
  (`viewer/fills.js`); the orphaned SVG fill utilities were deleted in
  PS1. `src/utils/trackUtils.js` and `depthTrackUtils.js` remain as
  the spec donors for the PS4 layout schema and retire with PS4.
- Tops remain read-only here (Well Correlation owns editing); zones are
  this app's artifact and become draggable in PS10.
- Histogram binning and percentiles stay client-side presentation math
  (PS7); numbers a petrophysicist quotes (normalization fits, overlay
  transforms) live in engines.

## Wave log

- **PS1 (2026-09-01):** engines PR #92 (`bucklesIsoBvwLine`) +
  Suite branch `feat/petrophysics-ps1-visuals`. TrackViewer: per-curve
  min/max/scale overrides (density-neutron overlay track, NPHI
  reversed + dashed), two-color crossover fill (gas yellow / shale
  gray), threshold fills (GR clay shading vs grClean, φe cutoff
  shading vs cutPhi), per-curve dash styles, two-row scale headers,
  spread cursor readouts. Crossplot: z-color by any curve or depth
  (viridis colorbar), wheel zoom + drag pan in domain space
  (log-aware), nearest-point identify tooltip, Buckles plot with
  iso-BVW hyperbolas. Deleted the mock LogDataQCViz app tree
  (unrouted since consolidation) and the orphaned SVG fill utils.
  Tests: `__tests__/fills.test.js` (9 cases), Buckles engine cases in
  `crossplot.test.js`, new PS1 e2e (colorbar pixel probe, tooltip,
  zoom reset, Buckles); 69 jest + 6 e2e green.
- **PS2 (2026-09-01):** engines PR #93 (`engines/welldata/lasWrite.js`
  LAS 2.0 writer + `METHOD_CITATIONS` in the petrophysics pipeline,
  stacked on #92) + Suite branch `feat/petrophysics-ps2-deliverables`
  (stacked on PS1). The writer stays inside the parser's safe subset
  (sanitised mnemonics/units/text, 9-significant-digit tokens, null
  chosen to collide with no sample) and is gated by
  `WellDataManager/__tests__/lasWrite.test.js`: parseLas(writeLas(x))
  bit-for-bit after the float32 cast, including a committed parser
  fixture re-written and re-parsed. Suite: `services/petroExport.js`
  (curves CSV, zone CSV, LAS assembly with the parameter set and
  provenance in ~Parameter), `services/petroReport.js` (jsPDF +
  pdfBrand summary report: parameters, methods with the engines' own
  citations, zone table, provenance), `components/ExportDialog.jsx` +
  ribbon Export button. C2/C3: the no-depth hard error became an
  empty-state panel pointing at Well Data Manager; harness gained an
  EMPTY-3 well to exercise it. Tests: 177 jest across
  PetrophysicsStudio + WellDataManager, 7/7 e2e (new PS2 spec asserts
  all four downloads by filename and the empty state).
- **PS3 (2026-09-02):** engines PR #94 (`computeWellZoned` — per-zone
  override patches resolved per sample, zones sorted by top, first
  match wins, implemented as same-parameter runs sliced through
  `computeWell` itself; `PIPELINE_VERSION` 2 with `zone_params` +
  `interpretation_name` in publish provenance; ZONED golden composed
  from the validated oracle scalars, pre-existing golden keys
  byte-identical) + Suite branch `feat/petrophysics-ps3-interpretations`
  (stacked on PS2). Migration `20260901120000_petro_interpretations.sql`
  (additive `zone_params` + `description` on petro_projects, RLS
  untouched) applied live with rollback-wrapped dry run, logged in
  MIGRATIONS.md. Backends: full interpretation CRUD
  (list/open/save-as/rename/delete, `.limit(1)` killed) in
  registryBackend + inMemoryBackend twins with legacy-payload
  migration. UI: `InterpretationBar` in the ribbon, ParameterPanel
  scope selector (zone overrides as diff-vs-global patches, dot
  markers, clear button), ZoneManager override badges, status-bar
  overlap warning, batch runs resolve each well's own zones. Tests:
  `pipelineZoned.test.js` (golden at 1e-12, empty-override ≡
  computeWell invariant, overlap precedence),
  `interpretations.test.js` (CRUD + legacy migration); 81 jest, 8/8
  e2e (new PS3 spec: zone Rw override collapses SAND A net to 0,
  save-as/reopen round-trips zone_params).
- **PS4 (2026-09-02):** Suite-only wave, branch
  `feat/petrophysics-ps4-track-builder` (stacked on PS3). Versioned
  layout schema (`layout/layoutSchema.js`): templates address curves
  by `input:GR` / `output:PHIE` (portable across wells), param-bound
  thresholds, built-ins fork on first edit (clone-on-edit), stored
  layouts migrate + built-ins refresh from code;
  `layout/resolveTracks.js` (pure) replaces the hardcoded tracks memo
  — the PS1 set lives on as the `std-triple-combo` built-in beside a
  `quicklook` raw template. `LayoutPanel` in the dock: template
  select/save-as/rename/delete, add/remove/reorder tracks, per-track
  curve editor (source, color, range override, style) and fill editor
  (crossover, threshold). TrackViewer: proportional width ratios,
  track-header click opens that track's editor, `depthUnit` display
  toggle (ft grid chosen in display units, data stays SI). Layouts
  persist in `petro_projects.layouts` with the interpretation
  (column existed since G2, first written now). Track plot PNG export
  (titled + logo band) joins the Export dialog. Tests:
  `layout.test.js` (resolution tolerance, clone-on-edit, migration);
  86 jest, 9/9 e2e (new PS4 spec: header-click editing, built-in
  fork, save/reload persistence, ft toggle, PNG download).
