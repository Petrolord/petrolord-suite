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
- **PT1 built 2026-09-03** (PR #365, stacked on #364): Petrel-style
  checkshot entry (MD | TVD | TVDSS, OWT | TWT, m | ft; preview of the
  stored table), `checkshots_provenance` migration 20260904090000 (HELD),
  editable header, deviation, checkshots and tops in Well Data Manager,
  deep link from the Petrophysics explorer.
- **PT2 built 2026-09-03:** export depth options (m/ft, MD/TVD/TVDSS,
  primary column) across CSV, zone CSV, LAS (`F` unit, DEPTREF/EKB/
  DEPTHSRC parameters) and the PDF report; zone panel, field view and
  statuses in the display unit. Defaults byte-identical.
- **PT3 built 2026-09-03:** Tops panel, colours by name (shared palette),
  pick by click with an inline name, drag on the right-edge tag, rename,
  delete; `layouts.topStyles`; Field view parity. Recorded decision
  amended (tops editable here).
- **PT4 built 2026-09-03:** zone planner; Zones panel modes Typed,
  Between tops (pair + bulk), Pick on track (two clicks).
- **PT5 built 2026-09-03:** shared DepthNavigator in TrackViewer, Field
  view and Well Correlation; Correlation tops on the shared palette.
- **PT6 built 2026-09-03:** layout schema v2 (ramp fills, two-sided
  threshold, colour and opacity editors), standard density-neutron
  colours, Lithology quicklook built-in.
- **PT7 built 2026-09-03:** digitizer automatic mode (engines scanTrace
  PR #103), inline calibration, review editing, `_DIG` naming, and the
  `petro-scan-read` edge function (owner deploys after merge).

## PT9 series (second tester pass, 2026-09-07)

Triage of the 2026-09-07 tester notes (per-zone workflow manager,
derived logs, permeability not showing, crossplots by zone, low/mid/high
logs, facies logs, PHIT from PHIE, the role of salinity). Owner decisions
2026-09-07: **permeability is never off by default**; **the curve the
Studio called PHIE was the transform as read and is renamed PHIT; a
shale-corrected PHIE is added and drives Sw, cutoffs, k and BVW**. Each
wave is one branch and one PR with base `main`; engine work lands in
Petrolord/petrolord-engines first, then the subtree copy.

| Wave | Tester note | Engine PR? | One line |
|---|---|---|---|
| PT9a Porosity and permeability defaults | k not showing; PHIT/PHIE | engines #155 | Pipeline v5: PHIT as read, PHIE = PHIT minus Vsh x phi shale, Timur by default; KPERM/BVW/PHIT in every deliverable; k gm in zone CSV and PDF |
| PT9b Crossplots by zone | all crossplots by zone | no | The PT8 Pickett zone filter and colour-by-zone on Density-Neutron, Buckles and Hingle too |
| PT9c Zone parameter table | workflow manager per zone | no | One zones-by-parameters view of the PS3 overrides, copy between zones |
| PT9d Rw from salinity | role of salinity | yes | Rw from NaCl ppm and temperature in Rw tools |
| PT9e Rule-based facies | facies logs | no | Cutoff classes on computed curves, published as registry facies intervals |
| PT9f Curve calculator | derived logs | no | Expression over inputs and outputs, saved as a new curve with provenance |
| PT9g Low, mid, high | low/mid/high logs and summary | no | Three named parameter sets through the zoned compute, suffixed curves and a scenario summary |

### Recorded decisions (PT9)

- **PHIE was PHIT.** `computeWell` never called the engine's
  `phiShaleCorrected`; the curve published as PHIE was the density,
  sonic or neutron-density transform as read. From pipeline version 5
  that curve is PHIT and PHIE = PHIT - Vsh * phiShale, `phiShale` being
  the selected tool's apparent porosity in 100 percent shale (default
  0.06, a 2.55 g/cc shale on density with a 2.65 matrix). Archie-family
  Sw, cutoffs, k and BVW run on PHIE; Waxman-Smits and dual water stay on
  PHIT (total-porosity models). Without GR there is no PHIE and `missing`
  says Sw, cutoffs and k fell back to PHIT. Re-publishing overwrites the
  old PHIE with the corrected one and adds PHIT; no migration.
- **Permeability defaults to Timur.** `none` remains an explicit choice.
- **Goldens.** Every pre-existing golden key stays on PHID and is
  byte-identical; the v5 recipe is pinned by `goldens.json.EFFECTIVE`
  (fixture v3), whose linear-Vsh anchor recovers the construction
  porosity exactly because GR = 20 + 100 s makes IGR equal s.

### Wave log (PT9)

- **PT9a built 2026-09-07.** Engines PR #155 (merged, d8ce2c0): pipeline
  v5, fixture v3, engines-side jest pinning the contract (7 tests).
  Suite: parameter panel gains phi shale; the Standard triple combo
  porosity track draws PHIT dashed behind PHIE; curves CSV and LAS carry
  VSH, PHIT, PHIE, SW, BVW, KPERM, PAY; zone CSV and the PDF report gain
  k gm; the zone card explains a blank k gm; crossplots and fits use PHIE
  (PHIT without GR); histograms and Field view accept PHIT; help guide
  rewritten for the two porosities and the new default. Petrophysics +
  Well Data Manager + shared wells jest 41 suites green; e2e 26/26 on the
  dev harness.
- **PT9b built 2026-09-07.** The PT8 zone filter (`services/zoneFilter.js`,
  unchanged) now drives all four crossplots from one shared selection:
  chips on every plot (`petro-xplot-zone-*`), colour-by-zone with a
  legend on Density-Neutron, Buckles and Hingle as on Pickett, the same
  empty state, the PNG caption naming the zones on every plot. Saved as
  `crossplots.zones` (the PT8 `pickettZones` key still reads). e2e
  PT8/PT9b walks ND, Pickett and Buckles on one selection.
- **PT9c built 2026-09-07.** `services/paramFields.js` now owns the
  parameter field list (moved out of ParameterPanel), `services/zoneParamTable.js`
  the pure rows/patches/copy logic (4 jest gates), `components/ZoneParamTable.jsx`
  the dialog: Global plus one column per zone, in-place edits including
  model selectors, highlighted overrides, greyed not-applicable cells,
  Copy from (zone or Global), one Apply writing every zone's patch through
  the PS3 override model. Opened from the Parameters panel
  (`petro-zone-table-open`). e2e PT9c round-trips an override into the
  scope picker and clears it by copying Global.
- **PT9d built 2026-09-07.** Engines PR #156 (merged): `rwFromSalinity`
  / `salinityFromRw` (Bateman & Konen 1977 fit to the Gen-9 chart, Arps to
  formation temperature), oracle + analytic cases + 10 percent chart
  anchors at regeneration, goldens byte-identical. Suite: third card in
  Rw tools (`petro-rw-sal-*`) with Apply as Rw and the salinity the
  current Rw implies; help guide "What salinity does in the Studio".
- **PT9e built 2026-09-07.** `services/ruleFacies.js` (ordered cutoff
  classes on any input or output curve, first match wins, conditionless
  fallthrough; validate, classify, thickness; 4 jest gates),
  `components/RuleFaciesDialog.jsx` (ribbon `Rules…`: editable classes and
  conditions, live thickness preview, Apply to tracks, Publish as
  electrofacies), layout strip source `rulefacies` + `ensureStripTrack`,
  `resolveTracks` draws it like the polygon facies, publish through
  `intervalsFromRuns` as kind `electrofacies` source `interpretation`.
  Rules persist inside the interpretation's `facies` jsonb under `_rules`
  (no migration). e2e PT9e previews, refuses a bad number, applies and
  publishes.
- **PT9f built 2026-09-07.** `services/curveCalc.js`: a tokenizer, a
  precedence-climbing parser and a per-sample evaluator (no eval) over
  any curve the well carries, with comparisons and logic as 1/0, `if`,
  `clip`, `nvl`, `isnan`, and null-propagating arithmetic; 4 jest gates.
  `components/CurveCalculatorDialog.jsx` (ribbon `Calc…`): name, unit,
  expression, curve and function chips, example picker, live preview
  (valid count, min, mean, max), Save as a new registry row through
  `publishCurves` with the expression in provenance and `nextFreeName`
  de-duplication. e2e PT9f previews, names a syntax error and an unknown
  curve, saves HCPV and sees it in the explorer.
- **PT9g built 2026-09-07.** `services/scenarios.js` (three cases through
  `computeWellZoned`, a case patch winning in every zone, `_LOW`/`_HIGH`
  twins of PHIT, PHIE, SW, BVW, KPERM, PAY, per-zone-per-case summaries,
  CSV, the `Low, mid, high` user template with shaded bands; 4 jest
  gates), `components/ScenariosDialog.jsx` (ribbon `Low/High…`: the shared
  `ParamGrid` with Low and High columns around Mid, a live zone table,
  Apply to tracks, Export summary CSV, Publish low/high curves with the
  case patch in provenance). `ParamGrid.jsx` was extracted from the PT9c
  zone table so both share one cell renderer. Cases persist in the
  interpretation's `facies` jsonb under `_scenarios`. No Monte Carlo: the
  Suite's sampler stays in ReservoirCalc Pro (CLAUDE.md rule).

## PT10 series (third tester pass, 2026-09-09)

Triage of the 2026-09-09 tester notes: permeability still not showing on
the log display (and TEMP with it), probabilistic petrophysics with
P10/P50/P90 and user-varied parameters, and a curve-versus-depth density
crossplot beside the density-neutron and Pickett plots. Plan of record
for the program is this section. Each wave is one branch and one PR with
base `main`; engine work lands in Petrolord/petrolord-engines first, then
the subtree copy. PT10a and PT10b are independent; PT10d depends on PT10c.

| Wave | Tester note | Engine PR? | One line |
|---|---|---|---|
| PT10a Permeability and temperature tracks | k (and TEMP) not showing, even on an added track | no | Stored `permMethod: none` from before PT9a migrates to Timur; an unresolvable track is kept with a note saying why instead of vanishing; a new track takes the picked curve's scale |
| PT10b Depth density crossplot | curve vs depth density | no | Fifth crossplot: 2D histogram of any curve against MD/TVD/TVDSS, jet colours, mirrored axes, zone filter, second-well outline, PNG |
| PT10c Probabilistic engine | P10/P50/P90 | yes | `engines/petrophysics/probabilistic.js`: seeded parameter draws through the zoned pipeline, per-sample percentile curves, per-zone summaries (outcomes P90/P50/P10, parameters 10th/50th/90th percentile) and a tornado, validated analytically |
| PT10d Probabilistic Studio | vary the parameters | no | `Probabilistic…` dialog with per-parameter distributions, a worker run with progress, zone table, tornado, band layout, CSV, publish; labels from the Suite percentile conventions constant |
| PT10e Close-out | (all) | no | Help guide (the percentile convention in one sentence with the Sw example), STATUS, ROADMAP wave log, prod zip |

### Diagnosis (PT10a), with evidence

The testers' interpretation row in `petro_projects` (one row, created
2026-09-04, last saved 2026-09-09 12:08 UTC, seven layout templates from
several testers) stores `permMethod: "none"` and `tempMode: "none"`.
`none` was the permeability default when that row was first saved; PT9a
(2026-09-07) changed the code default to Timur, but `PetroWorkstation`
merges the stored parameter set over the defaults on open, so the stored
`none` wins and the pipeline computes no KPERM. `resolveTracks` then
drops the built-in k track because its only curve resolves to nothing,
and a hand-added track pointing at `output:KPERM` is dropped for the same
reason. TEMP behaves identically because `tempMode` is `none` (still the
default; the curve only exists under the linear model). Every other
curve exists, which is why the testers see everything except k and TEMP.

Two smaller defects compound it: a fresh "New track" is linear 0 to 1,
so even a computed KPERM (mD, up to thousands) or TEMP (degrees) would
draw as a line pinned to the right edge; and nothing in the UI says why
a track is absent.

### PT10a: Permeability and temperature tracks

- **Stored parameter migration (owner decision 2, 2026-09-09).** The
  `petro-project` state kind moves to version 2 with a `migrations[1]`
  step in one module both backends share (`services/projectState.js`).
  A row stamped at version 1 whose `params.permMethod` is `none` opens
  with the current code default (Timur, the PT9a default); the same step
  covers `params.tempMode`, migrating a stored `none` to the current
  temperature default. That default is still `none` today, so the
  temperature half is a no-op until the default changes, and the step
  is written against `DEFAULT_PARAMS` so a future default change needs
  no new code. The status line says what changed, once, on the open
  that migrates: "Permeability model was off in this saved
  interpretation; Timur applied (owner rule: permeability is never off
  by default). Set it back to none in Parameters if that was
  deliberate." The step skips any row whose `params.deliberateNone`
  flags that key (below). Rows saved at version 2 keep whatever they
  store. The in-memory backend opens and stamps through the same
  `openStateRow` and `stampState` calls so the harness proves it.
- **Provenance.** The migration writes an entry into the
  interpretation's provenance list (`facies._provenance`, the
  `_rules` and `_scenarios` sibling; no DDL) with the date, the key,
  the old value and the new value, and the interpretation menu shows
  the list under "Provenance", so the change is visible months later.
- **Reversible, and never guessed again.** Setting a model back to
  `none` in Parameters is honoured on every later open, because
  applying parameters stamps `params.deliberateNone[key] = true` when a
  model is set to `none` and clears it when set to anything else. A
  future default change migrates only rows without that flag.
- **Never drop a track silently.** `resolveTracks` gains
  `ctx.keepUnresolved` (Petrophysics single-well only; Well Correlation
  and the Field view keep today's behaviour). A curves track whose every
  source resolves to nothing is kept with `curves: []` and a `note`
  from a new `sourceStatus(source, ctx)` helper:
  `output:KPERM` absent means "k not computed: permeability model is
  none (Parameters, Permeability)"; `output:TEMP` means "TEMP needs the
  linear temperature model (Parameters, Temperature)"; `output:X_LOW`
  or `_HIGH` means "run Low/High… first"; `input:X` means "X is not
  loaded on this well"; `log:MNEM` means "no curve MNEM on this well".
  `paintTrackBody` writes the note down the empty body; the header and
  scale rows still draw; `paintReadouts` and the hit-test tolerate a
  track with no curves.
- **Layout panel.** Picking a source on a track that still has the
  "New track" defaults (linear, 0 to 1, one curve) sets the source's
  standard scale from one table (`SOURCE_SCALES` in layoutSchema:
  KPERM log 0.01 to 10000, TEMP 0 to 150, GR 0 to 150, RT log 0.2 to
  2000, RHOB 1.95 to 2.95, NPHI 0.45 to -0.15, DT 650 to 150, PHIE and
  PHIT 0 to 0.5, VSH, SW, PAY 0 to 1, BVW 0 to 0.3). A track the user
  has already scaled is never touched. The source dropdown marks a
  computed output that is absent on this run as "(not computed)" with
  the same reason text. The Parameters panel shows a one-line warning
  under Permeability when the model is `none` (no k track, no k gm in
  zone summaries).
- **Gates.** Jest: state migration (v1 `none` opens as `timur`, v2
  `none` stays, other v1 rows untouched, a `deliberateNone` row is
  skipped, the temperature path proven with an injected default); a
  regression fixture, an interpretation saved in the pre-PT9a shape,
  opened by the test, asserting that the k track resolves, the status
  line is present and the provenance entry exists; `resolveTracks` keeps and
  annotates an empty track only under `keepUnresolved`; `sourceStatus`
  for each address kind; layout scale-on-pick and its guard. e2e on the
  harness: a v1 interpretation with `none` opens with the k track and
  the status line; setting `none` in Parameters shows the note in place
  of the k track instead of removing it; adding a track and picking
  `output:TEMP` shows the temperature note, then the linear model draws
  the curve on a 0 to 150 scale. Help guide: "Why is a track empty?"
  under The track view.

### PT10b: Curve vs depth density crossplot

Can the existing crossplot do this? No. `Crossplot.jsx` is a point
scatter (2.4 px dots, one-sided axes, a vertical colourbar, nearest-point
tooltip, polygon tools). It can put depth on Y and colour by depth, but
it does not bin, count or normalise, and its axes and colourbar are the
wrong shape for a density image. The density plot is a new canvas
component that shares the scatter's scale and tick helpers.

- **Pure math** (`viewer/depthDensity.js`, jest-gated, presentation
  math like `viewer/stats.js`): `depthDensityGrid({ values, depth,
  mask, xBins = 100, depthBin, xDomain, depthRange, log })` bins the
  finite masked samples on X (100 bins default, log space for RT and
  KPERM as the histogram does) and on depth (a bin of 100 ft or 25 m
  by default, following the display unit, both editable), counts per
  cell, and normalises to the maximum cell so the scale is 0 to 1;
  empty cells are 0 and are not painted. `envelopeOutline(grid)`
  traces the boundary of the populated cells as segments (an edge is
  drawn when exactly one of its two cells is populated) for the
  second-well overlay; the overlay is binned on the SAME edges as the
  primary so the two shapes compare.
- **Depth reference.** MD, TVD or TVDSS through `makeDepthAxes`
  (`valueOf`), so a TVD plot bins on true converted depth rather than
  relabelled MD; TVD and TVDSS are disabled without a survey; samples
  the frame cannot place (above the first station) are dropped and
  counted in the caption. The range boxes take the display unit.
- **Component** (`components/DepthDensityPlot.jsx`): white chart
  background (chartTheme), each populated cell filled through the
  existing `COLOR_MAPS.jet` (dark blue at 0 through cyan, green and
  yellow to red at 1); X ticks and labels on both top and bottom, Y on
  both left and right, light grey grid; Y inverted so shallow is at the
  top; a horizontal colourbar beneath the plot labelled "Data density"
  with 0 and 1 at its ends; a two-line title, well name over
  "{curve} vs {MD|TVD|TVDSS} cross-plot"; a tall narrow default (plot
  column capped near 360 px and centred, height filling the panel; a
  Wide toggle releases the cap); hover shows the cell's X range, depth
  range, density and count; ChartLogo watermark. `makeScale` and
  `ticksFor` move out of `Crossplot.jsx` into `crossplotScales.js` so
  both plots use one pair.
- **Panel integration.** A fifth button, "Depth density", in
  `CrossplotPanel` beside Density-Neutron, Pickett, Buckles and Hingle.
  Its toolbar: Curve (loaded inputs, computed outputs, raw `log:`
  curves), Depth reference, Range top and base, X bins, Depth bin,
  Overlay well (any other well through the curves cache; a computed
  output on the overlay well runs the current parameter set on that
  well's curves, the Field view rule; the overlay uses its own depth
  frame). The shared zone chips apply: the primary well's samples pass
  `zoneFilter.inFilter` before binning, and the caption names the
  zones as on every other plot. Colour-by and Select… are hidden on
  this plot. PNG through `trackPlotPng` with the title and a caption
  (curve, reference, range, bins, zones, overlay well). The
  configuration persists as `crossplots.density` (curve, reference,
  bins, depth bin, overlay well id); no migration.
- **Gates.** Jest: maximum cell is exactly 1, empty cells 0, depth bin
  honours the unit, log X excludes non-positive values, an overlay
  shares the primary's edges, the outline of a known rectangular block
  has the expected segment count, a zone mask reduces the count. e2e:
  PHIE against MD renders with the colourbar labels, TVD on the
  deviated harness well, an overlay well's outline, the zone caption
  and the PNG download.

### PT10c: Probabilistic engine (engines-first)

Per the CLAUDE.md rule, no new sampler: the engine imports the canonical
primitives already vendored in `packages/engines/lib/stats/stats.js`
(`mulberry32`, `triInvCDF`, `createCorrelatedSampler`,
`fitTriangularToPercentiles`, `quantile`), the same code ReservoirCalc
Pro's MonteCarloEngine delegates to.

- **Module** `engines/petrophysics/probabilistic.js`:
  - `UNCERTAIN_PARAMS`: the numeric parameters a user may vary
    (grClean, grClay, phiShale, rhoMa, rhoFl, dtMa, dtFl, a, m, n, rw,
    rsh, qv, rwb, swb, bucklesConst, swirrManual, wrC, wrQ, cutPhi,
    cutVsh, cutSw). Models are fixed for a run.
  - Spec shape, the ReservoirCalc `Dist` shape so one grammar serves the
    Suite: `{ key: { type: triangular|uniform|normal|lognormal, min,
    mode, max | mean, sd } }`, with 10th/50th/90th percentile entry through
    `fitTriangularToPercentiles`. Optional pairwise correlations
    (m with n is the obvious one), through `createCorrelatedSampler`.
  - `drawRealisations(spec, n, seed, correlations)` returns `n`
    parameter patches; a patch overrides its parameter in every zone,
    exactly the PT9g scenario rule.
  - `runProbabilistic(curves, params, zoneParamList, spec, { n = 200,
    seed = 1, zones, zoneParams, curvesOut, quantiles = [0.1, 0.5,
    0.9], onProgress })` runs two memory-bounded loops over the same
    seeded draws: (1) depth chunks of about 2000 samples, all
    realisations per chunk, per-sample quantiles written into
    `PHIE_Q10`, `PHIE_Q50`, `PHIE_Q90` (and PHIT, VSH, SW, BVW, KPERM),
    plus `PAY_PROB` (the fraction of realisations flagging pay), the
    curve names as under the naming rule; (2)
    per zone, every realisation through `computeWellZoned` on the
    zone's window and the canonical `zoneSummary`, giving P10, P50, P90
    and mean of net, NTG, phi_avg, sw_avg and k_gm_md per zone (labelled
    under decision 1: outcomes P90/P50/P10, parameters 10th/50th/90th
    percentile), and a
    sensitivity per zone (rank correlation and tornado swings from
    `lib/stats`). No summary formula is re-derived; `zoneSummary` stays
    the only place net pay is summarised.
  - Naming under owner decision 1 (below): per-sample curves are
    parameter statistics, so their addresses are `PHIE_Q10`, `PHIE_Q50`,
    `PHIE_Q90` (and PHIT, VSH, SW, BVW, KPERM) described as "10th
    percentile of PHIE", never `_P10`; per-zone parameter statistics
    (phi_avg, sw_avg, k_gm_md) are returned as `q10`, `q50`, `q90`;
    outcomes (net, NTG, `PAY_PROB`) carry `p90`, `p50`, `p10` under the
    exceedance meaning, so `p90` of net is the 10th percentile of the
    net draws. Linear interpolation, pinned by test.
- **Validation-first gates** (engines jest, and an oracle case in
  `tools/validation/petrophysics/oracle.py`):
  1. Monotone-transform identity: with only Rw uncertain under Archie,
     the per-sample quantiles equal `swArchie` evaluated at the same
     empirical quantiles of the Rw draws, to 1e-12, because Sw is
     monotone in Rw. The same holds for KPERM against bucklesConst.
  2. Degenerate spec (nothing varies) reproduces `computeWellZoned`
     byte for byte in P10, P50 and P90, and `PAY_PROB` is exactly the
     PAY flag.
  3. Seed determinism: one seed, identical results; another seed,
     different draws, quantiles within the sampling band.
  4. Type well: a symmetric spread about the golden parameters brackets
     the SAND A golden net (P10 <= 18.0 m <= P90) and the P50 sits
     within a stated tolerance of it; the oracle reproduces the
     lognormal-Rw case with scipy at N = 20000 within 1 percent.
  5. Chunking invariance: chunk sizes 500 and 5000 give identical
     P-curves.
  6. Every returned curve is finite where the deterministic output is
     finite and NaN where it is not.
- **Cost.** 20k samples by 200 draws is a few seconds of pipeline time,
  so the Suite runs it in a Web Worker (PT10d); the engine is pure and
  synchronous with an `onProgress` callback, so jest runs it inline.

### PT10d: Probabilistic Studio

- **Dialog** `components/ProbabilisticDialog.jsx`, ribbon `Probabilistic…`
  beside `Low/High…`: a parameter grid (the `ParamGrid` cell renderer)
  with a Vary checkbox, Distribution, and Min/Mode/Max or 10th/50th/90th percentile
  (or Mean/SD) per parameter; defaults from `defaultUncertainty(params)`
  whose P10 and P90 are the PT9g low and high patches, so the two
  features agree by construction; draws (100, 200, 500, 1000) and seed;
  Run with a progress bar and Cancel (worker
  `workers/probabilistic.worker.js`, the Well Data Manager LAS worker
  pattern); results as a zone table whose outcome columns (net, NTG) read
  P90, P50, P10 and whose parameter columns (phi, Sw, k) read "10th
  percentile of Sw" and so on, every string from the Suite conventions
  constant; a tornado per zone for net; and three ways out: Apply to
  tracks, Export CSV, Publish.
- **Tracks.** A `Low, best, high cases` user template
  (`ensureProbabilisticTemplate`, the PT9g pattern): the band between
  the low and high case around the best case for PHIE, SW and KPERM,
  each header naming the direction ("Low case Sw (high value)"), and a
  `PAY_PROB` track 0 to 1 with a ramp fill. `OUTPUT_SOURCES` gains the
  `_Q10`, `_Q50`, `_Q90` and `PAY_PROB` addresses; the PT10a note
  explains an empty band track ("run Probabilistic… first"). The dialog
  states plainly that the best case is the median of the realisations
  and not the deterministic mid curve.
- **Persistence and provenance.** The spec, draws and seed persist in
  the interpretation's `facies` jsonb under `_uncertainty` (as
  `_scenarios` does; no migration). Publish writes the P-curves and
  `PAY_PROB` with `operation: 'probabilistic'`, the spec, `n`, `seed`
  and `pipeline_version` in provenance. Curves CSV and LAS carry the
  P-curves when present; the zone CSV and the PDF report gain a
  probabilistic block; zone cards show a P10/P50/P90 net line when a
  run exists.
- **Gates.** Jest: `defaultUncertainty` agrees with `defaultScenarios`
  at the 10th and 90th percentiles; the template builder; CSV columns;
  the worker message protocol under a fake worker; the two convention
  gates of decision 1 (no P-label on any parameter output; P90 <= P50
  <= P10 on every published outcome case). e2e on the harness: N = 50, the SAND A
  P50 net within the band the engine test pins, the template active,
  the CSV downloaded, publish shows the new curves in the explorer.

### Recorded decisions (PT10)

- **Decision 1, percentile labels (owner, 2026-09-09; supersedes the
  numeric-percentile proposal).** Petrolord adopts one meaning of
  P-labels across the whole Suite: probability of exceedance of a
  hydrocarbon outcome, as defined by SPE PRMS and the SEC. P90 is the
  low estimate, P50 the best, P10 the high, always. Parameters never
  carry P-labels, because the exceedance convention is only unambiguous
  where more is better, and Sw is where it breaks. In PT10c and PT10d:
  - Per-sample and per-zone parameter statistics are labelled "10th
    percentile", "50th percentile", "90th percentile" written out with
    the parameter named ("90th percentile of Sw"). The strings P10, P50
    and P90 must not appear on any parameter table, plot legend, CSV
    header or tooltip.
  - Outcome-linked cases are labelled "Low case", "Best case", "High
    case", defined by the hydrocarbon outcome: low-case Sw is the high
    Sw value, low-case porosity the low porosity value, and the header
    shows the direction ("Low case Sw (high value)").
  - Outcomes only (net pay, pay probability, hydrocarbon pore volume,
    anything published to volumetrics) carry P90, P50 and P10 under
    the exceedance meaning, and the published provenance records the
    definition in one sentence: "P90 means a 90% probability the actual
    quantity meets or exceeds this value, per SPE PRMS."
  - A suite-level conventions constant
    (`src/lib/percentileConventions.js`) owns the label strings and the
    definition sentence; Petrophysics Studio, Volumetrics and any future
    app import the same words rather than retyping them.
  - Two jest gates: one fails if a P-label appears on a parameter
    output; one asserts P90 <= P50 <= P10 on every published outcome
    case.
  - Already shipped and now non-compliant: the PS7 histogram statistics
    label a curve's numeric percentiles P10/P50/P90. PT10d relabels
    them through the constant ("10th percentile of GR") and the
    P-label gate covers the histogram panel too.
  - The PT10e help guide states the convention in one sentence and
    gives the Sw example, because it will be the first support
    question.
  The deterministic PT9g low/mid/high keeps its hydrocarbon sense,
  which is the same rule.
- **Decision 2, stored `none` (owner, 2026-09-09).** Pre-PT9a rows
  storing `none` migrate to Timur once, with the status line. The same
  one-time step covers the temperature model, migrating to whatever the
  current temperature default is (today `none`, so a no-op) and saying
  so in the same status line. The migration is recorded in the
  interpretation's provenance with the date, the old value and the new
  value; it is reversible from the UI (set `none` back in Parameters);
  a deliberate `none` is stored with an explicit flag
  (`params.deliberateNone`) so a future default change never guesses,
  and the migration skips flagged rows. A regression fixture opens an
  interpretation saved in the pre-PT9a shape and asserts the k track,
  the status line and the provenance entry. After PT10a lands the
  testers reopen their shared interpretation and confirm the k track
  before anything else, since they are the live case.
- **Uncertainty is global across zones** for this series, the PT9g
  rule; per-zone spreads are a later wave if testers ask.
- **Depth bin default follows the display unit**: 100 ft under ft, 25 m
  under m, as specified; both editable.
- **No Monte Carlo duplication.** Sampling and quantiles come from
  `lib/stats` in the engines package; the PT9g note that the Suite's
  sampler stays in ReservoirCalc Pro is superseded by importing it.

### Wave log (PT10)

- Planned 2026-09-09; both owner decisions recorded the same day.
- PT10a built 2026-09-09: state version 2 with the one-time `none`
  migration (permeability and temperature, provenance, deliberate
  flag, regression fixture), tracks kept with a note, scale on pick,
  help text. Jest + e2e gates green.
- PT10b built 2026-09-09: `viewer/depthDensity.js`, `crossplotScales.js`
  shared with the scatter, `DepthDensityPlot.jsx`, the fifth crossplot
  button with curve / reference / range / bins / overlay well / Wide,
  `crossplots.density` persisted, help text. Jest + e2e gates green.
