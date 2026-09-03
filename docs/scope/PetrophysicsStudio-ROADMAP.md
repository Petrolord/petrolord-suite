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
| PS5 | Formation temperature model + Waxman-Smits / dual-water / Modified Simandoux Sw + Rw quicklook tools wired (SP, Arps); PIPELINE_VERSION 3 | B5 partial | large | no | **DONE 2026-09-02** |
| PS6 | Permeability (Timur, Tixier, Coates, Wyllie-Rose) + Buckles BVW analysis + zone k geometric mean; PIPELINE_VERSION 4 | B2 | yes | no | **DONE 2026-09-02** |
| PS7 | Histogram panel: cumulative frequency, P10/P50/P90, zone filters, draggable cutoff lines writing back to parameters; multi-well GR overlay + normalization fit | — | normalize.js | no | **DONE 2026-09-02** |
| PS8 | Log conditioning: Hampel despike, smoothing, block depth-shift, bad-hole flag/repair; conditioned curves published as new `_CND` registry curves, raw untouched | B3, D1b | yes | no | **DONE 2026-09-02** |
| PS9 | Multi-well field view: render refactor (static + overlay canvases, decimation), per-well columns, top-flattening, cross-well zone summary table | C1 | no | no | **DONE 2026-09-02** |
| PS10 | Split view + linked brushing, Hingle plot, TVD axis labels (deviation-gated), zone boundary drag, matrix-ID quicklook + Thomas-Stieber | B4 recorded | small | no | **DONE 2026-09-02 — PROGRAM COMPLETE** |

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
- **PS5 (2026-09-02):** engines PR #95 + Suite branch
  `feat/petrophysics-ps5-shaly-sw`. Engines: `temperature.js` (linear
  surface+BHT profile, Rw(T) via the existing Arps chain — degC in,
  degF inside the module) and `swClay.js` (Waxman & Smits 1968 with
  B(T) per Juhász 1981 or manual, `qvFromCec`;
  Clavier-Coates-Dumanoir 1984 dual-water returning total Swt; Bardon
  & Pied 1969 modified Simandoux). Independent numerics: JS Newton
  w/ bisection fallback at 1e-14 vs the oracle's pure bisection;
  anchors assert exact Archie reduction (Qv=0, Swb=0, Vsh=0). New
  CLAY + TEMP goldens (existing keys byte-identical);
  `PIPELINE_VERSION` 3; per-sample Sw dispatch with per-depth Rw when
  tempMode is linear; TEMP output curve (chartable via
  `output:TEMP`). Suite: ParameterPanel gains Temperature section and
  model-conditional Sw fields with **m*/n* labeled as shaly-rock
  exponents**; `RwToolsDialog` wires the dormant SP quicklook + Arps
  converter (°C in, °F inside; the Rwe≈Rw caveat shown; Bateman-Konen
  stays gated per B5). Tests: `swClay.test.js` (7 cases: goldens at
  1e-12, coupled pipeline paths, reductions, NaN discipline); 93
  jest, 10/10 e2e (new PS5 spec: Arps apply lands the computed value
  in the panel, WS at Qv=0 reproduces the golden Archie net pay
  through the whole UI).
- **PS6 (2026-09-02):** engines PR #96 + Suite branch
  `feat/petrophysics-ps6-permeability`. Engines: `perm.js` — Timur
  1968 (k = 8581·φ^4.4/Swirr², the fraction/mD form pinned by
  goldens), Tixier 1949, Coates & Denoo 1981, Wyllie-Rose 1950
  generalized with Morris & Biggs 1967 presets; `bvw`,
  `swirrFromBuckles` (clamped to 1, documented), `kGeomMean`
  (thickness-weighted over pay flags). **Units exception recorded: k
  in mD** (beside the degF-inside-Arps precedent). Pipeline:
  `permMethod: 'none'` default keeps existing recipes byte-identical;
  KPERM (published, unit MD) + BVW outputs; zone summaries gain
  `k_gm_md`; `PIPELINE_VERSION` 4. Suite: Permeability parameter
  section with the formula shown per method, k log track in the
  default template (drops when perm is off), KPERM/BVW chartable in
  the builder, zone cards show k gm. Tests: `perm.test.js` (5 cases:
  PERM goldens at 1e-12, pipeline + zone gm, none-default invariant,
  constant anchors incl. Tixier ≡ Wyllie-Rose oil preset); 98 jest,
  11/11 e2e (new PS6 spec: golden zone k gm on the card, publish
  grows to 5 curves).
- **PS7 (2026-09-02):** engines PR #97 + Suite branch
  `feat/petrophysics-ps7-histograms`. Engines: `normalize.js` —
  percentile (numpy-linear), two-point P5/P95 and mean-std fits,
  applyNormalization; anchor: an exact affine distortion of GR
  restores to 1e-9 under both fits; NORM golden. Suite: third center
  view (Histograms) — `viewer/stats.js` (client-side binning,
  cumulative, masks, passing fraction — presentation math by
  decision), `HistogramChart` (white chartTheme canvas: bars, overlay
  outlines, cumulative on the right axis, P10/50/90 markers,
  **draggable cutoff lines** committing to params on release) +
  `HistogramPanel` (curve/bins/zone-interval controls, passing-cutoff
  readout, multi-well overlays via the new `useWellCurvesCache` LRU
  hook — built here, reused by PS9 — and the GR normalization fit
  with a dashed normalized preview; applying lands with PS8).
  `curveMap.js` extracted from the controller for cross-well reuse.
  Tests: `histogramStats.test.js` (binning edge rules, NORM goldens,
  degenerate-fit NaN); 106 jest, 12/12 e2e (new PS7 spec: dragging
  the GR clean line commits grClean = 45 from the plot geometry, the
  twin harness well fits the identity normalization).
- **PS8 (2026-09-02):** engines PR #98 + Suite branch
  `feat/petrophysics-ps8-conditioning`. Engines: `conditioning.js` —
  Hampel 1974 despike (zero-MAD windows treat any deviation as a
  spike; the fixture anchor caught the naive-guard miss in constant
  clean sand), centred mean/median smoothing (NaN centre stays NaN),
  constant block depth-shift (scope guard: NOT stretch/squeeze
  correlation), caliper/DRHO bad-hole flag + null-or-bridge repair
  with a visible gap cap. COND goldens derive inputs inside
  genfixtures so the typewell never changes. Suite: CAL/DRHO/PEF
  aliases, `ConditioningDialog` (preview of changed/nulled counts;
  saves `KEY_CND` + BADHOLE via the overwrite-own publish path with
  operation provenance; normalization apply prefilled from the PS7
  fit), and the **explicit input picker** in the explorer — a
  conditioned curve is never substituted silently; the user selects
  it per input (curveMap `candidatesFor`). D1b noted satisfied:
  conditioning lives in the Studio, no separate QC tile rebuild.
  Tests: `conditioning.test.js` (COND goldens at 1e-12, spike-death
  and cap-visibility invariants); 111 jest, 13/13 e2e (new PS8 spec:
  save GR_CND, pick it in the explorer, pipeline recomputes clean).
- **PS9 (2026-09-02):** Suite-only wave, branch
  `feat/petrophysics-ps9-field-view`. `viewer/trackRender.js` extracts
  the shared curve pass (per-curve scales, dash, clamp, NaN pen,
  baseline fills) with **min/max per-pixel-row decimation** past 2
  samples per row — used by the single-well TrackViewer and the new
  field columns alike. Fourth center view (**Field**):
  `FieldViewPanel` + `MultiWellTracks` — up to 8 wells side by side on
  a shared displayed-depth axis, per-well compute through the PS7
  cache with each well's own zones + the interpretation's overrides,
  compact columns from the active template filtered to
  GR/PHIE/SW/PAY, structural or **flatten-on-top** datum via the
  vendored wellcorrelation engine (wells lacking the top draw
  unflattened and flagged), tops markers per column, and the
  cross-well zone summary table (case-insensitive name matching,
  dashes never guesses). MultiWellTracks uses the static + overlay
  two-canvas split so the crosshair never redraws the columns.
  Plan deviations recorded: field well selection lives in the field
  header rather than a WellExplorer checkbox column; the summary
  table sits under the columns rather than in the dock; the
  single-well TrackViewer keeps its one-canvas architecture (the
  layering ships where well-count multiplies the cost) — and the
  useProjectState controller extraction moves to the PS10 close-out
  list. 111 jest, 14/14 e2e (new PS9 spec: golden SAND A net in the
  KETA cell, dashes for unmatched zones, flatten survives a missing
  datum top).
- **PS10 (2026-09-02, program close-out):** engines PR #99 + Suite
  branch `feat/petrophysics-ps10-closeout`. Engines: Hingle 1959
  transform/water-line/through-origin fit (typewell water leg returns
  the construction Rw exactly — anchored); `matrix.js` — Doveton 1994
  rho_maa/U_maa (rho_maa round-trips the matrix density exactly on
  the constructed RHOB), Thomas & Stieber 1975 end-members +
  nearest-model classification, the exact unclamped 2-mineral D-N
  solve. Suite: **Hingle plot** (fourth crossplot, fit window applies
  Rw back), **Split view** (Tracks | Crossplot side by side) with the
  **selection brush** — a polygon on any crossplot highlights those
  samples as cyan ticks on the track depth axis and dims unselected
  points; **TVD axis labels** gated on a deviation survey (drilling
  surveyMath kernel; MD-linear spacing, honestly titled "TVD on MD
  spacing"; harness KETA gained a build-and-hold survey); **zone
  boundary dragging** on the tracks (owned wells; commit via
  updateZone with top<base validation; tops stay read-only by
  decision); crossplot config (plot + colorBy) now persists in
  `petro_projects.crossplots`. Tests: `matrixHingle.test.js` (MATRIX
  goldens, TVD lookup identity/deviation cases); 116 jest across the
  app (219 with WellDataManager), 15/15 e2e (new PS10 spec: Hingle
  Rw = 0.050000 applied, split-view brush, TVD toggle, dragging SAND
  A's base to 2040 updates the zone card).
  Trimmed within PS10, recorded: the split divider is fixed 60/40
  (not draggable); hover cross-highlighting (track crosshair -> dot,
  point -> depth tick) did not ship — the polygon brush is the linked
  mechanism; TVD-linear resampling stays out of scope as planned.

## Program close-out (2026-09-02)

All ten waves are built and stacked as PRs: engines
Petrolord/petrolord-engines #92 → #93 → #94 → #95 → #96 → #97 → #98 →
#99; Suite #340 → #341 → #342 → #343 → #344 → #345 → #346 → #347 →
#348 → #349 (merge in that order). Migration 20260901120000 is
applied live. Audit items A1, A2, B1, B2, B3, C1, C2, C3, D1 are
closed; B4 (Elan-class multi-mineral) is a recorded deferral; B5
(Bateman-Konen) stays gated on a page-referenced source.

Open items after the program:
- Owner review + merge of the PR stacks; prod zip after Suite merge.
- Owner staging E2E pass on suite.studio.petrolord.com.
- Cleanup: extract `useProjectState` from PetroWorkstation (the
  controller stands near 1000 lines; deferred from PS9/PS10 to avoid
  a late-program refactor risk); retire `src/utils/trackUtils.js` and
  `depthTrackUtils.js` (PS4 spec donors, now unused).
- Optional nicities left on the table: draggable split divider, hover
  cross-highlighting, per-view crossplot domain persistence.

## PT series (tester findings, 2026-09)

Approved 2026-09-03 after the first tester pass (Petrel users on staging).
Plan of record for the program: the owner-approved plan in the session
that opened it; this table is the durable copy. Each wave is one branch
and one PR with base `main`, merged in order; engine work lands in
Petrolord/petrolord-engines first, then the subtree copy. PT7 is
independent after PT0.

| Wave | Findings | Engine PR? | One line |
|---|---|---|---|
| PT0 Foundations | (all) | yes | Checkshot/depth-frame engine + goldens; viewer math, palette, hit-test, redraw cache, controlled view; curve-name helper; depth display helpers |
| PT1 Well data like Petrel | 1, 3 | no | MD/OWT/ft at the door, provenance column, editable deviation/checkshots/tops/KB in Well Data Manager, deep link from Petrophysics |
| PT2 Exports honour units | 7 | no | m/ft + MD/TVD/TVDSS columns in CSV, zone CSV, LAS, report; unit-aware zone panel and statuses |
| PT3 Tops in the Studio | 4, 6 | no | Tops panel, toggle/colours, pick by click, drag on the name tag, rename, delete; Field parity |
| PT4 Zones from tops or clicks | 5 | no | Zone planner, three creation modes |
| PT5 Depth navigator | 2 | no | Shared DepthNavigator in TrackViewer, Field view and Well Correlation |
| PT6 Fills and density-neutron | 8, 9 | no | Layout schema v2: ramp fill, two-sided threshold, colour/opacity editors, Lithology quicklook built-in, standard D-N colours |
| PT7 Digitizer automatic mode | 10 | yes + edge fn deploy | Pure-JS colour tracer, ROI box, AI proposal card, editable points, always `_DIG` new curve |

Findings, in the owner's words: (1) checkshots as MD + one-way time with
unit options, (2) a scroll picker beside the track to scroll and to
squeeze or stretch the vertical scale, (3) checkshots editable after a
well is created, (4) tops uploaded in Well Data Manager visible and
togglable here, (5) zones from tops or by clicking in the log area, (6)
new tops picked here, (7) exports honouring feet with MD, TVD and TVDSS,
(8) lithology colour fills and GR cut-off fills, (9) the standard
density-neutron presentation, (10) an automatic digitizer that always
saves a new curve.

### Recorded decisions (PT)

- **Checkshots convert at the door.** Storage stays `{tvdss_m, twt_ms}`
  (Seismolord, synthetics, well tie, Well Planning and portability read
  it). Users enter MD | TVD | TVDSS, OWT | TWT, m | ft; Petrel defaults
  MD + OWT. The entered MD is kept per row (`md_m`) and the convention,
  KB and survey used are kept in `geo_wells.checkshots_provenance` (PT1
  column), so tables display as entered and re-derive after KB or survey
  edits. Flat or uphill laterals are refused with a message naming the MD
  interval. Engine: `packages/engines/engines/welldata/checkshots.js`,
  goldens from closed-form trajectories.
- **Tops are edited in Petrophysics from PT3** (create by click, drag on
  the name tag, rename, delete; owner-only; the same `geo_wells_tops` rows
  Well Correlation uses). This replaces the PS-era line "tops remain
  read-only here". Top drags live on a right-edge name tag because the
  harness seeds a top exactly on a zone base and zone edges keep winning
  mid-plot.
- **Digitized curves are always new rows** named `<MNEM>_DIG` with `:n`
  de-duplication; the tracer is pure JS (a port of the dormant OpenCV
  routine, jest-tested), and an AI read only proposes calibration, which
  the user confirms; the acceptance is recorded in provenance.
- A `grCutoff` pipeline parameter is out of scope (`DEFAULT_PARAMS` is in
  the vendored engine); the GR cut-off fill binds to a fixed, editable
  value.

### Wave log (PT)

- **PT0 built 2026-09-03.** Engines PR #102 (merged): checkshot
  conventions engine, 13 closed-form golden cases at 1e-6 m, `digitizeCurve`
  provenance merge. Suite: `src/lib/curveNames.js` (`nextFreeName` moved
  from mergeImport, `digitizedCurveName`), `src/components/wells/depthNavMath.js`
  and `topColors.js`, `viewer/hitTest.js`, `viewer/trackRender.js
  trackGeometry`, `viewer/depthModes.js` display helpers, TrackViewer
  split into a cached static layer plus a cursor layer (single visible
  canvas kept for PNG export), controlled `view`/`onViewChange` in
  TrackViewer, MultiWellTracks and Well Correlation CrossSection (which
  gains data clamping), zone statuses in display units. No visible change
  by design; all existing e2e unchanged.
