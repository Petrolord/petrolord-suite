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
- Bateman-Konen Rwe→Rw: gate B5 CLOSED 2026-09-10 (PT11a) with the
  owner-supplied equation and citations; see the PT11 series.
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
- PT10c built 2026-09-09: engines #158 merged and subtree-pulled
  (`engines/petrophysics/probabilistic.js`, oracle `lognormal_quantile`,
  PROBABILISTIC golden block, 9 gates incl. the exact lognormal-Rw case
  at N = 20000 within 1 percent); Suite shim `engine/probabilistic.js`;
  `src/lib/percentileConventions.js` with the two decision-1 gates.
  Two notes against the plan text: (1) the quantile is the canonical
  `lib/stats` definition (simple-statistics `quantileSorted`: the order
  statistic at ceil(n*p) when n*p is not an integer, the midpoint when
  it is), pinned by test, rather than linear interpolation, because the
  no-new-Monte-Carlo rule outranks the plan's wording; (2) the cost
  floor is the deterministic pipeline itself, about 7 µs per sample per
  realisation under jest (a chain of small per-sample calls, no single
  hotspot), so 20k samples by 200 draws is tens of seconds, not "a few";
  PT10d runs it in a worker with progress and reports the measured
  browser time. Vectorising the pipeline is a separate performance wave
  for the owner to call, not done here.
- PT10d built 2026-09-09: `Probabilistic…` dialog (Vary / Distribution /
  three values per parameter, draws, seed, worker run with progress and
  Cancel, zone table with P90/P50/P10 outcomes and 10th/50th/90th
  parameter percentiles, a net-pay tornado per zone), the "Low, best,
  high cases" layout with the direction in every band label and a pay
  probability track, CSV, publish of the 18 percentile curves + PAY_PROB
  with the run in provenance, `facies._uncertainty` persisted, the
  probabilistic block in the zone CSV and the PDF, the net cases on the
  zone cards, the PS7 histogram relabelled ("50th percentile"), and the
  probabilistic addresses in the layout dropdown. Measured in Chromium
  on the 201-sample type well: 200 realisations 0.4 s, 1000 in 0.8 s,
  so the jest-side cost floor noted under PT10c was the babel transform,
  not the engine. Jest + e2e gates green (33 e2e).
- PT10e close-out 2026-09-09: help guide (Probabilistic cases, the
  convention in one sentence with the Sw example, the FAQ entry), STATUS
  close-out, full Suite jest, prod zip recut. Series complete.

## PT11 series (help-guide gaps, 2026-09-10)

Closes the four items under "What the Studio does not do" in the
Petrophysics Studio help guide (PetrophysicsHelpGuide.jsx:1069-1076).
Plan reviewed and approved by the owner 2026-09-10 ("proceed with the
implementation of the plans"); the review page is
https://claude.ai/code/artifact/8fbdf46c-1bb0-46c1-b9bf-1dac186d996f.
Same shape as PT10: one branch and one PR per wave with base `main`;
engine work lands in Petrolord/petrolord-engines first with jest gates,
is subtree-pulled into `packages/engines/`, and reaches the Studio
through the existing two-line `engine/*.js` shims; then the Studio,
then help guide, STATUS and ROADMAP. Order: PT11a, PT11b, PT11c, PT11d.
PT11b is a commit inside the PT11c PR because both edit the Split view
switch in PetroWorkstation.jsx:1220-1227. PT11e (solver stage two) is
planned here so PT11d does not preclude it, and is NOT scheduled.

| Wave | Gap | Engine PR? | One line | Size |
|---|---|---|---|---|
| PT11a Bateman-Konen | Rwe applied as Rw | yes | `rweToRw` / `rwToRwe` / `rmfeFromRmf` from Bateman and Konen 1977 with the limits in the header, NaN outside them; the SP card shows the whole chain and applies Rw; recorded in interpretation provenance and the published params | small (1 to 1.5 days); build now, acceptance waits on six chart readings |
| PT11b Split divider | divider fixed | no | Draggable divider from the shared `resizable.jsx` primitive, 25 percent minimum pane, double-click reset to 60/40, position per user in a new `studioPrefs` service | small (half a day), rides in the PT11c PR |
| PT11c Stretch and squeeze | block shift only | yes | `depthShiftTiePoints` piecewise-linear warp, constant beyond the outer ties, refuses crossing ties; the shift function is a first-class object on the `_DS` curve, re-applied on read, every edit recorded with who, when and the pairs; shift panel with side-by-side tracks, click-to-place ties, shift track, undo, reset to raw | medium (3 to 4 days) |
| PT11d Multi-mineral, stage one | no multi-mineral solver | yes | `engines/petrophysics/mineral.js`: density, neutron and U (from PEF) plus closure solved for three minerals and porosity with a fixed fluid from an editable endpoint table with published defaults; singular and out-of-range samples refused with a flag and a residual; mineral model dialog, solved-lithology track, residual track, publish; explicit `phiSource: mineral` | large (6 to 7 days) |
| PT11e Multi-mineral, stage two | (planned, not scheduled) | yes | Weighted least squares with per-tool sigma and optional bound constraints over the same endpoint table; starts only after PT11d ships and a customer asks | large |

The one help-guide rule for every wave: the replacement paragraph keeps
the sentence that nothing is hidden behind a setting, and each new
capability is visible in the UI, recorded in provenance, and never a
silent default.

### PT11a: Bateman-Konen Rwe to Rw (and Rmf to Rmfe)

**Source (supplied 2026-09-10; closes audit item B5 / plan Q4).**
Primary: Bateman, R. M. and Konen, C. E., 1977, "The log analyst and
the programmable pocket calculator," The Log Analyst, v. 18, no. 5,
p. 3-11. Secondary: Asquith, G. and Krygowski, D., 2004, Basic Well Log
Analysis, 2nd edition, AAPG Methods in Exploration 16, the spontaneous
potential chapter. The engine header cites both; the audit entry
records the equation's own page number only after it is verified
against the copy in hand (the article's page range and the book's
chapter are confident, the equation page is not). The engine work does
not wait on that verification; recording it in the audit does.

**The equation.** Bateman and Konen's fit to the Schlumberger Rw versus
Rweq chart (SP-2 in current editions, Gen-9 in older ones), T in degF,
resistivities in ohm.m, logs base 10:

    A  = 0.131 * 10^(1 / log10(T / 19.9) - 2)
    B  = 10^(0.0426 / log10(T / 50.8))
    Rw = (Rwe + A) / (B - 0.5 * Rwe)                 forward
    Rwe = (Rw * B - A) / (1 + 0.5 * Rw)              inverse, the filtrate side

Preceding step, in scope for completeness: SSP = -K log10(Rmfe / Rwe),
K = 61 + 0.133 T. The filtrate side takes Rmf at formation temperature
(Arps) through the inverse to Rmfe, except that when Rmf at 75 degF
exceeds 0.1 ohm.m the standard convention Rmfe = 0.85 Rmf is used
instead of the chart.

Check point, verified here: T = 150 degF, Rwe = 0.050 gives A = 0.0181,
B = 1.232, Rw = 0.0564. The correction is upward at the saline end.
Mapping the fit shows where it is small: at 150 degF it is within 4
percent between Rwe 0.1 and 0.3, grows again above 0.5 (+6 percent at
0.5, +39 percent at 1.0) and is singular at Rwe = 2B (2.46 at 150 degF,
3.57 at 75 degF); at 75 degF it runs 20 to 26 percent BELOW Rwe between
0.2 and 0.5. The chart readings arbitrate whether that low-temperature
band is the chart or the fit; one reading at 75 degF near Rwe 0.3 is
on the request list for that reason.

**Scope.** The SP route becomes the full chain: Rmf at its measured
temperature, Arps to formation temperature, Rmfe by the 0.85 rule or
the inverse, Rwe from SSP and K, Rw by the forward equation. The value
that reaches Sw is Rw. Every intermediate value is shown. NaCl waters
only, as the chart assumes; the card says so.

**Engine (engines repo, `engines/petrophysics/rw.js`; the Suite needs
no new shim, `engine/rw.js` re-exports everything).**
- `rweToRw(rweOhmm, tempF)`: the forward equation. Header: both
  citations, the equation, and the limits. Returns NaN (the
  petrophysics refusal convention, vsh.js:7-11: invalid input is NaN,
  never a silent default) when the denominator `B - 0.5 Rwe` is zero
  or negative (the fit is meaningless there, roughly Rwe above 2 ohm.m
  at formation temperatures), when T is at or below 50.8 degF (the
  second log goes to zero), when T is outside the temperature range
  printed on the chart (read and recorded in the header when the chart
  is read for the golden points), or when Rwe is not positive. No
  extrapolation, no clamping.
- `rwToRwe(rwOhmm, tempF)`: the inverse, same limits, NaN when the
  result is not positive.
- `rmfeFromRmf(rmf, rmfTempF, tempF)`: Arps to 75 degF for the 0.1
  test and to `tempF` for the value; returns `{ rmfe, rule: 'x0.85' |
  'chart-inverse' }` so the card can say which was used. The boundary
  is pinned: at exactly 0.1 the inverse is used, above it the 0.85 rule.
- `rwFromSsp(sspMv, rmf, rmfTempF, tempF)`: the whole chain, returning
  `{ k, rmfAtT, rmfe, rmfeRule, rwe, rw }` from one call. `rweFromSsp`
  keeps its signature and loses the deferral note.
- `RWE_TO_RW_DOMAIN` and `rweToRwProblem(rwe, tempF)`, a sentence or
  null naming the limit crossed (the `entryProblem` pattern in
  services/probabilistic.js), so the dialog can explain a refusal.
- Oracle: `rwe_to_rw`, `rw_to_rwe`, `rmfe_from_rmf` in
  tools/validation/petrophysics/oracle.py written from the paper, never
  from the JS; `analytic_cases.json` regenerated; new
  `test-data/petrophysics/chart_points.json` for the owner's SP-2
  readings with citation and per-point precision, empty until read.

**Validation gates (engines jest `__tests__/petrophysics.rw.test.js`,
mirrored in the Suite `petroAnalytic.test.js`).**
1. Check point: `rweToRw(0.050, 150)` = 0.0564 to three significant
   figures, and A and B individually to the stated values.
2. Golden set: every point in `chart_points.json` (at least six, read
   off the chart directly and never off another implementation: both
   ends, at least two temperatures, and one at 75 degF near Rwe 0.3)
   bracketed within its stated reading precision. The build does not
   block on the readings; acceptance does.
3. Oracle agreement at 1e-12 relative on the analytic cases, forward,
   inverse and Rmfe.
4. Inverse round trip: `rwToRwe(rweToRw(x, T), T)` = x to 1e-12 across
   the domain at three temperatures.
5. Fresh-water case: at 150 degF and Rwe = 0.30 the correction is under
   3 percent, pinned as a number; the help text describes the band
   rather than claiming negligibility everywhere.
6. Refusal: denominator at or below zero, T at or below 50.8 degF, T
   outside the chart range, non-positive Rwe, all NaN, and
   `rweToRwProblem` names the limit.
7. The 0.85 rule boundary at Rmf(75 degF) = 0.1, both sides pinned.
8. Type well direction: the generator gains an SP case at the SAND A
   midpoint (T = 150 degF, Rmf and SSP chosen so the chain returns Rw
   = 0.05 exactly, which puts the uncorrected Rwe at 0.0425); the
   corrected Sw reproduces `SW_ARCHIE`, and the uncorrected Rwe gives
   a lower SAND A Sw because the correction is upward there. The test
   asserts the direction from the sign of `rw - rwe` in the golden.
9. Arps ordering pinned: the chain runs at formation temperature, then
   `rwAtTemp` carries Rw to the reference temperature shown in the
   parameter panel.

**Studio.**
- RwToolsDialog.jsx SP card (78-110): inputs SSP, Rmf, Rmf measured at
  (degC, default the surface temperature parameter), formation T
  (degC). Shows K, Rmf at formation T, Rmfe with "by 0.85 Rmf" or "by
  the Bateman-Konen inverse", Rwe, and Rw with "Rw from Rwe by
  Bateman-Konen (1977)" and the limits in a caption. `Apply as Rw`
  applies Rw. Outside the limits the card shows the refusal sentence
  and the button is disabled; there is no uncorrected apply. The
  callout at 756-758 ("Rwe is applied as Rw") and the glossary entry
  are rewritten.
- Provenance: `applyRw` (60-64) records an entry in the
  interpretation's `facies._provenance` (projectState.js:39-43): `{
  at, by, kind: 'rw-apply', method: 'sp-bateman-konen' | 'arps' |
  'salinity', inputs: { ssp, rmf, rmfTempC, tempC }, rmfe, rmfeRule,
  rwe, rw }`, `by` from `registryBackend.currentUserId()` (`'dev'` in
  the harness). Params gain `rwMethod`, a read-only string in the
  parameter panel and the PDF parameter table, so every published
  curve's `params` says how Rw was obtained. No migration: absent
  means "entered". InterpretationBar renders the new kind like the
  migration entries.

**Persistence.** Nothing beyond the above; `rwMethod` is a params key
and the provenance entry is jsonb in `facies`.

**Help guide.** Rw tools section: "The SP route reads SSP, Rmf with the
temperature it was measured at, and formation temperature. It converts
Rmf to Rmfe (by 0.85 Rmf when Rmf at 75 degF is above 0.1 ohm.m,
otherwise by the Bateman-Konen inverse), reads Rwe from SSP and K, and
converts Rwe to Rw with the Bateman-Konen (1977) fit to the SP-2 chart
before applying it. Every value in the chain is shown and the
correction is labelled. It is upward for saline waters, small between
about 0.1 and 0.3 ohm.m at formation temperature, and grows again
toward very fresh water; where the fit fails, above about 2 ohm.m or
below 51 degF, the Studio refuses rather than extrapolates and says
which limit was crossed. The chart is for NaCl waters." Limitation
paragraph after this wave: "There is no probabilistic multi-mineral
solver: porosity comes from one chosen source and lithology is a
judgement you make on the Density-Neutron plot. Depth shifting is a
block shift, with no stretch and squeeze. The SP route applies the
Bateman-Konen fit on both the filtrate and the formation-water side
and shows every value in the chain; it assumes NaCl waters, as the
chart does. The split divider is fixed. None of this is hidden behind
a setting: every capability above is visible in the UI, recorded in
provenance, and never a silent default." helpGuide.test.jsx:48 changes
from `/without a Bateman-Konen correction/` to `/Bateman-Konen fit/`
plus `/shows every value in the chain/`.

**Docs.** STATUS entry, ROADMAP wave log, Audit B5 closed with both
citations and the verified page, the deferral paragraph in
`test-data/petrophysics/README.md` replaced by the equations and limits.

### PT11b: Resizable split divider

**Scope.** The Split view (PetroWorkstation.jsx:1220-1227, tracks
`flex-[3]` beside the crossplot `flex-[2]`, a static border) becomes a
draggable pair. No engine change. Rides in the PT11c PR as its own
commit because PT11c adds a fourth view to the same switch.

**Studio.**
- Replace the flex pair with `ResizablePanelGroup` / `ResizablePanel` /
  `ResizableHandle withHandle` from `src/components/ui/resizable.jsx`
  (react-resizable-panels 2.1.7, already a dependency), the first
  nested group inside a WorkspaceShell `center` slot in the Suite; the
  handle takes the shell's classes (WorkspaceShell.jsx:55-87). Default
  60/40, `minSize` 25 percent on both panes (about 250 px at the
  shell's 1000 px minimum; the library takes percentages, so the plan
  states the minimum as a percentage), double-click on the handle
  resets to 60/40 through the panel's imperative `resize`.
- Persistence per user: the Studio has no preferences store today
  (nothing under `hooks/` or `services/` writes localStorage; the outer
  shell relies on the library's own `autoSaveId`, which is per browser,
  not per user). New `services/studioPrefs.js`: one JSON blob per user
  under `petrophysicsstudio.prefs.<userId>.v1` in localStorage, wrapped
  in try/catch, the `useReservoirSettings` pattern; `splitPercent` is
  its first key. The group uses `onLayout` to write and `defaultSize`
  to read, not `autoSaveId`, so the prefs service owns the value and
  later keys (depth unit is an obvious second) share the file.
  Decision for the owner: per user on this browser (recommended, no
  migration) or a `petro_user_prefs` table for cross-device (a
  migration, staging-first; not in this wave's estimate).

**Gates.** Jest `studioPrefs.test.js`: round trip under a fake
localStorage, two user ids never see each other's value, a corrupt blob
falls back to the default. e2e on the harness: drag the handle, reload,
the split is within one percent of where it was; double-click returns
60/40. helpGuide.test.jsx gains `/drag the divider/`.

**Help guide.** Crossplots section line 643 becomes: "The Split view
puts Tracks and the crossplot side by side, 60/40 to start. Drag the
divider to change it; double-click the divider to reset. The position
is remembered for you on this browser." The limitation paragraph loses
"The split divider is fixed."

### PT11c: Stretch and squeeze depth shifting

**Scope.** Tie-point shifting beside the block shift. The user places
matched depth pairs between a reference curve and the curve being
shifted; the warp is piecewise linear between ties and a constant
shift beyond the outermost ones. The raw curve is never rewritten; the
shift function is stored as a first-class object with the shifted
curve, re-applied on read, reversible from the UI, and every edit is
recorded with who, when and the pairs.

**Interpolation, stated.** The track display does not interpolate: it
plots each sample at its own depth (trackRender.js:34-95). The only
resampler the Studio has is the block shift's, conditioning.js:74-98:
linear interpolation between the two raw samples bracketing the
requested depth, NaN outside the raw extent, and a null on either side
of the bracket gives NaN so gaps are never bridged. The tie-point shift
uses exactly that resampler, and the help guide says so.

**Engine (engines repo, `engines/petrophysics/conditioning.js`).**
- `tiePointWarp(pairs)`: validates `[[refMd, targetMd], ...]` and
  returns `{ ok: true, warp }` or `{ ok: false, error }` (the structured
  refusal the production engines use for fits, chokePerformance.js:88).
  Refused: fewer than one finite pair, duplicate reference depths, or
  ties that cross (reference and target sequences must both increase
  strictly when sorted by reference depth). `warp(z)` maps an output
  depth to the raw depth it reads from: piecewise linear through the
  pairs, `z + (targetOuter - refOuter)` beyond the outer ties.
- `depthShiftTiePoints(depth, x, pairs)`: `out[i]` = the block shift's
  bracketing linear interpolation of `x` at `warp(depth[i])`. Zero
  pairs is the identity; one pair is a block shift.
- `shiftCurve(depth, pairs)`: `warp(z) - z` per sample, the
  shift-versus-depth track.
- The scope guard at conditioning.js:5-8 is rewritten to describe both
  shifts. `depthShiftBlock` is unchanged.
- Oracle: `tie_point_shift` in oracle.py; generator adds a COND golden
  (`GR_TIE_SHIFTED`, `SHIFT_CURVE`, the pairs) to goldens.json.

**Validation gates (engines jest, new `__tests__/petrophysics.conditioning.test.js`,
and the Suite `conditioning.test.js` extended).**
1. Identity: no ties returns the input byte for byte.
2. One tie equals `depthShiftBlock` byte for byte.
3. Exact recovery: a piecewise-linear synthetic curve with nodes on
   the grid, warped through known ties placed on grid nodes, is
   recovered to 1e-12 by the inverse ties; a smooth synthetic (sine) is
   recovered within the linear-interpolation bound, computed in the
   test from the second derivative and the step.
4. Constant beyond the outer ties: the shift curve is flat outside
   them and equals the outer pair's difference.
5. Monotonicity refusal: crossing ties return `{ ok: false }` with a
   sentence naming the two pairs; duplicate reference depths likewise.
6. Nulls never bridged, NaN outside the raw extent, the existing block
   shift invariants re-asserted on the tie path.
7. Golden: the COND block at 1e-12.
8. Suite: save and reload round trip through the in-memory backend
   (publish `GR_DS`, reopen the well, the row's `provenance.shift`
   pairs equal what was placed, and re-applying them to the raw curve
   reproduces the stored samples byte for byte).

**Studio.**
- New view `shift` beside tracks / crossplot / split
  (`components/DepthShiftPanel.jsx`, ribbon button `Depth shift`). One
  TrackViewer over the well's depth with three tracks: the reference
  curve, the target (raw in grey, shifted in colour, both from the
  `log:` addresses resolveTracks already serves), and a `SHIFT` linear
  track in metres or feet. Tie points draw as connectors between the
  first two tracks with the pair's depths on the tag.
- Click to place: `pickMode = 'tie'` in TrackViewer, the two-click
  zone pick pattern (TrackViewer.jsx:518-531): first click on the
  reference track, second on the target track, snapped to the nearest
  sample when `snapSamples` is on. `hitTieAt` joins `hitTopAt` and
  `hitZoneEdgeAt` in `src/components/wells/hitTest.js` so a tie can be
  dragged; Delete removes the hovered tie; a pair list beside the
  tracks allows typed edits. Every change re-runs
  `depthShiftTiePoints` live.
- Undo: a history stack in the panel (the digitizer pattern,
  DigitizerDialog.jsx:54,205), Ctrl+Z and a button. Reset to raw:
  clears the ties and, if a `_DS` row exists, deletes it after a
  confirm that names the row.
- Save publishes `<KEY>_DS` (a new suffix; `_CND` stays for the other
  operations so a shift can sit on top of a despiked curve). The
  explorer picker accepts `_DS` beside `_CND` (curveMap.js:55-60), the
  pipeline never substitutes it. ConditioningDialog's block-shift card
  gains a pointer to the panel and loses the out-of-scope disclaimer
  (215-219).
- Fix in passing: ConditioningDialog provenance omits `project_id`, so
  `publishCurves` never replaces a re-saved `_CND` row and duplicates
  accumulate (registryBackend.js:26-35). Both dialogs set it.

**Persistence and provenance.**
- The shifted curve is a registry row (`geo_wells_logs`) whose samples
  are the applied result, because every consumer indexes rows on the
  shared grid and other apps read rows. The shift function is the
  source of truth and rides in the row's `provenance`:
  `{ computed, engine: 'petrophysics-studio', operation:
  'depth-shift', method: 'tie-points', project_id, input_log_ids:
  [source, reference], shift: { reference: { mnemonic, logId },
  source: { mnemonic, logId }, pairs, interpolation:
  'linear-bracketing', beyond: 'constant', edits: [{ at, by, pairs }]
  } }`. `by` from `currentUserId()`; every Save appends an edit with
  the full pair list. The raw row is never written.
- Apply on read: when the panel opens on a `_DS` curve it reads the
  pairs back from the row, re-applies them to the raw source, and
  shows any mismatch with the stored samples (none expected; the
  round-trip gate pins it). Reversible: edit the ties and save again,
  or reset.
- The in-progress ties (unsaved) live in panel state, not the
  interpretation; the interpretation records nothing new.

**Help guide.** Conditioning section gains "Stretch and squeeze":
"Open Depth shift from the ribbon, pick a reference curve and the curve
to move, and click a depth on each to place a tie. Between ties the
shift is linear; beyond the outermost ties it is constant. The shift
track shows the shift at every depth. Resampling is linear between the
two raw samples on either side of the requested depth, the same as the
block shift, and a null on either side stays null. Save writes a new
curve named with the suffix DS; the raw curve is never changed, the
ties are stored with the new curve and can be reopened, edited or
reset, and every save records who placed which pairs and when. Undo
steps back through your edits." Limitation paragraph after this wave:
"There is no probabilistic multi-mineral solver: porosity comes from
one chosen source and lithology is a judgement you make on the
Density-Neutron plot. Depth shifting is per curve, block or by tie
points, not a whole-well warp. The SP route applies the Bateman-Konen fit
on both the filtrate and the formation-water side and shows every value
in the chain; it assumes NaCl waters, as the chart does. None of
this is hidden behind a setting: every capability above is visible in
the UI, recorded in provenance, and never a silent default."

### PT11d: Multi-mineral solver, stage one (deterministic)

**Scope.** Density, neutron and photoelectric factor solved
simultaneously for three mineral fractions plus porosity with a fixed
fluid, as a linear system, from a configurable endpoint table with
published defaults. Refuse singular systems and fractions outside zero
to one, report a residual, show a solved-lithology track and a residual
track, publish the fractions. Nothing about this is a default: the
model exists only when the user builds one, and porosity comes from it
only when the user picks it.

**Formulation.** Unknowns v1, v2, v3, phi. Equations: bulk density =
sum(vi rho_i) + phi rho_f; neutron = sum(vi n_i) + phi n_f; volumetric
photoelectric absorption U = sum(vi U_i) + phi U_f, with U = Pe times
electron density exactly as `uMaa` does today (matrix.js:21, rho_e =
(rho_b + 0.1883)/1.0704), because U is volumetrically linear and Pe is
not; closure v1 + v2 + v3 + phi = 1. A 4 by 4 system per sample. With
four equations and four unknowns the fit residual is identically zero,
so the stage-one residual is defined as the excursion: the largest
amount by which any fraction leaves zero to one (0 for an accepted
sample). The tool-space residual that means something arrives with
stage two's over-determined fit. This definition is a decision to
record; the alternative (tool-space misfit of the nearest feasible
solution) costs a projection step and is better done once as stage
two.

**Engine (engines repo, new `engines/petrophysics/mineral.js`).**
- `MINERAL_ENDPOINTS`: quartz, calcite, dolomite, anhydrite, halite,
  and a user-editable clay row, each with `rho`, `nphi` (limestone
  porosity units, the same assumption as the density-neutron plot),
  `pe`, and `u` derived; the neutron values for the three main
  minerals are imported from `ND_LITHOLOGY_LINES` in crossplot.js so
  one constant owns them; the source (Schlumberger Log Interpretation
  Charts and Doveton 1994) in the header. Fluid defaults rho 1.0, nphi
  1.0, U 0.398 (the `uMaa` default). The table schema carries optional
  `sigma` per tool and optional `dt` and `gr` columns now, unused in
  stage one, so stage two is additive.
- `solveMineralSample(tools, model)`: `tools = { rhob, nphi, pef }`,
  `model = { minerals: [m1, m2, m3], fluid }`. Returns `{ ok, v: [v1,
  v2, v3], phi, residual, flag, reason }`; `flag` 0 accepted, 1
  singular (pivot below 1e-12, the `twoMineralSolve` guard), 2 out of
  range (a fraction or phi outside zero to one beyond 1e-9), 3 missing
  input. Refused samples carry NaN fractions and the excursion in
  `residual`; an `unclamped` field keeps the raw solution because a
  negative volume is information the UI can chart (matrix.js:65-67).
- Dispatch by mineral count: one mineral calls `phiDensity` directly
  (so the byte match is by construction and documented); two minerals
  with density and neutron delegate to `twoMineralSolve`; three use
  the 4 by 4 path.
- The solver reuses `solveDense` (Gaussian elimination with partial
  pivoting) promoted from `engines/earthmodeling/properties.js:13` to
  `lib/linalg/solveDense.js`, with earthmodeling importing from there;
  no new solver, and the throw is caught into flag 1.
- `solveMineralCurves(curves, model)`: per-sample loop writing
  `V_<MINERAL>` for each of the three, `PHI_MM`, `MM_RES`, `MM_FLAG`
  as Float64Array, plus counts.
- `pipeline.js`: `phiSource` gains the explicit value `'mineral'`,
  which reads `curves.PHI_MM` (computed by the Studio before the run)
  and lists it under `missing` when absent. The default stays
  `'density'`; PIPELINE_VERSION 6.
- Oracle: `three_mineral_solve` in oracle.py with its own elimination
  (never numpy over the JS path, never the JS); generator adds a PEF
  curve to `typewell.json` from a forward model in which SAND A and
  SAND B are quartz with a stated calcite fraction and the shale
  fraction is the clay endpoint, so `construction.phi_true` and
  `construction.shale_fraction` become the recovery targets; goldens
  gain a MINERAL block. Adding a curve to the type well is checked
  against every test that reads it (pipeline, goldens, publish).

**Validation gates (engines jest, new `__tests__/petrophysics.mineral.test.js`;
Suite `petroGoldens.test.js` gains the MINERAL block).**
1. Exact recovery: synthetic three-mineral cases (quartz, calcite,
   dolomite at known fractions and porosity, forward-modelled through
   the same endpoints) recovered to 1e-12, including a pure-mineral
   corner and a zero-porosity case.
2. Collapse to one: with one mineral the solver output equals
   `phiDensity` byte for byte over the type well (`PHID` golden).
3. Collapse to two with density and neutron equals `twoMineralSolve`
   to 1e-12 (the `two_mineral_ss_dol` analytic case).
4. Singular: two identical minerals, or a mineral equal to the fluid,
   returns flag 1 with a reason and NaN, never a number.
5. Out of range: a point outside the mineral triangle returns flag 2,
   NaN fractions, the excursion in `residual`, and the `unclamped`
   solution reconstructs the tools to 1e-12.
6. Type well: the MINERAL golden (recovered `phi_true` and
   `shale_fraction` where the forward model holds, flags elsewhere)
   bracketed at 1e-12; SAND A porosity through `phiSource: 'mineral'`
   reproduces the `PHID` golden where the model is quartz only.
7. Pipeline invariant: every other `phiSource` is byte-identical to
   PIPELINE_VERSION 5 output.

**Studio.**
- `components/MineralModelDialog.jsx`, ribbon `Mineral model…`:
  the endpoint table (editable, Reset to published), three mineral
  picks, fluid fields, the tool requirement line (PEF must be mapped;
  PEF joins `INPUT_SOURCES` in layoutSchema.js so it can be picked in
  the explorer and shown as an input track), Run, then a summary:
  accepted, singular, out-of-range counts and the worst excursion. No
  worker: a 4 by 4 solve per sample is microseconds, so it runs
  inline like `computeWell`; the PT10d worker pattern is not needed
  and the plan says so.
- `services/mineralModel.js`: `defaultMineralModel`, `runMineralModel`
  (calls the engine, stores results in workstation state keyed by
  well id, the `probResult` pattern), `ensureMineralTemplate` (a
  "Mineral model" layout: a solved-lithology track drawn as cumulative
  fraction curves v1, v1+v2, v1+v2+v3 with crossover fills between
  neighbours in the density-neutron lithology colours, so `fills.js`
  needs no new renderer; a `PHI_MM` track; an `MM_RES` track 0 to 0.5
  with a threshold fill; the flag counts in the track header note),
  `mineralPublishLogs` (the `probabilisticPublishLogs` shape:
  `V_<MINERAL>` x3, `PHI_MM`, `MM_RES`, `MM_FLAG`, provenance
  `operation: 'mineral-model'`, the endpoint table, fluid, tools,
  `pipeline_version`, `input_log_ids`), CSV columns.
- Parameter panel: `phiSource` shows the fourth option `mineral` only
  after a model has been run for the well, with a read-only line
  naming the three minerals and the fluid; the status line says
  "PHIT from the mineral model" whenever it is in force. Zone CSV, PDF
  report and the interpretation bar carry the model.
- `MINERAL_SOURCES` join `OUTPUT_SOURCES` in the layout dropdown (the
  PT10d `PROBABILISTIC_SOURCES` precedent); the PT10a note explains an
  empty mineral track ("run Mineral model… first").

**Persistence and provenance.** The model (minerals, endpoint
overrides, fluid) persists in `facies._mineral` beside `_uncertainty`,
no migration; a `facies._provenance` entry `{ at, by, kind:
'mineral-run', minerals, fluid, counts }` on every run, and
`{ kind: 'phi-source', from, to }` when `phiSource` moves to or from
`mineral`. Published curves carry the full model in provenance.

**Not suited to (help guide and dialog say the same words).** Clay-rich
and shaly rocks (clay endpoints vary by clay type and the model has no
bound water; use the Vsh methods and a shale-corrected PHIE), gas-
bearing intervals (the fluid is fixed, so gas moves density and
neutron in opposite directions and the sample lands outside the
triangle), heavy-mineral or pyrite-bearing rocks and barite mud (Pe is
dominated by them), coal, washed-out hole without conditioning, and
any rock with more than three minerals present at once.

**Help guide.** New section "Mineral model" (section id `mineral`,
added to the navigation list the help test enumerates): what the
solver does, the four equations in words, the endpoint table and
where its defaults come from, the refusal flags and what the residual
means in stage one, the list above, and that the published fractions
carry the whole model. Limitation paragraph after this wave: "The
mineral model solves three minerals and porosity from density, neutron
and PEF with a fixed fluid; there is no probabilistic solver yet, so
tool uncertainties are not weighed and more than three minerals are
refused. Depth shifting is per curve, block or by tie points, not a
whole-well warp. The SP route applies the Bateman-Konen fit on both the
filtrate and the formation-water side and shows every value in the
chain; it assumes NaCl waters, as the chart does. None of this is
hidden behind a setting: every capability above is visible in the UI,
recorded in provenance, and never a silent default."

### PT11e: Multi-mineral solver, stage two (planned, not scheduled)

Starts only after PT11d has shipped and a customer has asked. Weighted
least squares over the same endpoint table: per-tool sigma from the
table's `sigma` column (defaults from tool specifications, stated),
optional extra tools (DT and GR through the `dt` and `gr` columns), up
to four minerals when the system is over-determined, optional bound
constraints v in zero to one and closure held exactly. Normal equations
through `cholesky` in lib/stats (already vendored); bounds through an
active-set pass, no new Monte Carlo. The residual becomes the weighted
tool-space misfit, and `MM_RES` changes meaning with a version bump on
the provenance. Gates: reduces to stage one byte for byte when the
system is square and every sigma is equal; recovers synthetic cases
with known noise within the stated sigma; refuses when fewer equations
than unknowns. Stage one keeps the door open by the table schema, the
`flag` and `residual` fields, and the `V_<MINERAL>` naming.

### Recorded decisions (PT11)

1. B5 source: supplied 2026-09-10 (Bateman and Konen 1977, The Log
   Analyst 18(5) p. 3-11; Asquith and Krygowski 2004 SP chapter).
   Still needed: the equation's page number verified against the copy
   in hand before it goes in the audit, the temperature range printed
   on the chart, and six or more SP-2 readings with precision
   including one at 75 degF near Rwe 0.3. The build does not wait;
   acceptance does.
2. Divider persistence: per user on this browser (recommended) or a
   `petro_user_prefs` table.
3. Shifted-curve suffix `_DS` and the rule that ties are per curve
   against one reference.
4. Stage-one residual as the excursion from zero to one, and
   `phiSource: 'mineral'` as an explicit fourth option that never
   becomes a default.
5. Stage two waits for a customer request.

### Wave log (PT11)

- Planned 2026-09-10; the owner supplied the Bateman-Konen equation,
  its inverse, the 0.85 Rmfe rule, both citations, the refusal
  conditions and a check point the same day, and approved the plan.
- PT11a built 2026-09-10: engines #159 merged and subtree-pulled
  (`rweToRw`, `rwToRwe`, `rmfeFromRmf`, `rwFromSsp`, `rweToRwProblem`,
  `RWE_TO_RW_DOMAIN`; oracle from the paper; analytic cases incl. the
  check point and the type-well SP chain; `chart_points.json` for the
  SP-2 readings, gate pending until read; nine jest gates). Suite: the
  Rw tools SP card shows the whole chain and applies Rw, refuses beyond
  the chart with the reason, every apply names its method
  (`params.rwMethod`, parameter-panel hint, report row) and records a
  `facies._provenance` entry with who and when (`backend.whoAmI`);
  retyping Rw clears the method. Help guide, `rwTools.test.jsx`,
  `petroAnalytic` mirror, e2e step. Audit B5 closed. Note against the
  plan text: the chart's printed temperature range is not yet enforced
  (`tempFMax: null`, stated in the header) because it has not been
  read; the six chart readings remain the acceptance gate.
- PT11b + PT11c built 2026-09-10 in one Suite PR (engines #160 merged
  and subtree-pulled). PT11b: the Split view is a `ResizablePanelGroup`
  (60/40 to start, 25 percent minimum either side, double-click resets),
  the first nested group inside a WorkspaceShell centre in the Suite;
  position per user through the new `services/studioPrefs.js`
  (localStorage keyed by `backend.whoAmI()`, the useReservoirSettings
  pattern; a `petro_user_prefs` table stays the owner's call for
  cross-device). PT11c: engine `tiePointWarp` / `depthShiftTiePoints` /
  `shiftCurve` with one shared resampler; the `Depth shift` view
  (`DepthShiftPanel.jsx`: reference and target side by side, Place ties
  by clicking reference then target, drag a mark, typed edits, undo,
  Reset to raw, Save `<KEY>_DS`), TrackViewer `pickMode: 'tie'` with
  `hitTieAt`, the shift stored as `provenance.shift` on the `_DS` row
  (pairs, reference, source, interpolation, beyond, edits with who and
  when) and re-applied on open with a mismatch check, `_DS` accepted by
  the explorer picker, `backend.deleteLog` for Reset, and the
  ConditioningDialog `project_id` fix so re-saved `_CND` rows no longer
  duplicate. Two notes against the plan text: (1) a read landing exactly
  on a raw sample is that sample, so the identity warp is byte-exact;
  this moved one `GR_SHIFTED` golden sample beside a null (engines
  README); (2) "exact recovery" is pinned as the shifted output equal to
  the analytically warped synthetic for any warp, plus a grid-aligned
  inverse round trip, because a general inverse cannot be exact after
  linear resampling. Gates: engines 8, Suite `depthShift.test.js`
  (incl. the save-and-reload round trip), `depthShiftPanel.test.jsx`,
  `studioPrefs.test.js`, hitTest, conditioning and curveMap additions,
  help guide test, two e2e walks.
- PT11d built 2026-09-10 (engines #161 merged and subtree-pulled):
  `engines/petrophysics/mineral.js` (three minerals plus porosity from
  density, neutron and U with a fixed fluid; `MINERAL_ENDPOINTS` with
  published defaults, neutron endpoints shared with crossplot.js;
  per-sample flags singular / out of range / missing, the excursion as
  the stage-one residual, the unclamped solution kept; one mineral
  dispatches to `phiDensity`, two to `twoMineralSolve`), `solveDense`
  promoted to `lib/linalg`, `phiSource: 'mineral'` reading
  `curves.PHI_MM` (PIPELINE_VERSION 6), the type well gains a PEF curve
  from its own quartz + clay + fluid construction and a MINERAL golden
  (recovers phi_true and the shale fraction off the gas zone; the gas
  zone is refused, the fixed-fluid assumption failing as it should).
  Suite: `Mineral model…` dialog (endpoint table with Reset to
  published, three picks, fluid, tool line, Run inline, counts and
  worst excursion, the not-suited list, Apply to tracks, Publish),
  `services/mineralModel.js` (model in `facies._mineral`, run result
  transient, the "Mineral model" layout with a stacked lithology track
  from cumulative fractions and the existing threshold and crossover
  fills, publish of `V_<MINERAL>` x3 + PHI_MM + MM_RES + MM_FLAG with
  the whole model in provenance), `phiSource` gains the explicit
  `mineral` option with a hint (never a default; no run means no PHIT),
  a `mineral-run` and a `phi-source` provenance entry, PEF as an input
  source, mineral addresses in the layout dropdown, CSV columns, help
  guide section whose not-suited words are the dialog's own constant.
  Notes against the plan text: (1) the forward model's quartz neutron
  endpoint is 0.0 because the v1 type well reads NPHI = phi in clean
  sand, so the MINERAL golden stores its own table rather than the
  chart-book default; (2) the `mineral` option is always listed rather
  than appearing after a run, because hiding it would be a setting;
  the hint and the pipeline's `missing` line say when it has nothing to
  read. Gates: engines 8; Suite `mineralModel.test.js` (in-memory run
  on the type well against the golden, template, publish, export
  columns, phiSource mineral through the pipeline),
  `mineralModelDialog.test.jsx`, `petroGoldens` MINERAL block, help
  guide test; e2e walk.
- Series close-out 2026-09-10: PT11a #458, PT11b + PT11c #459, PT11d
  (this PR). Every limitation the help guide listed on 2026-09-09 is
  either delivered or restated as the remaining gap (the probabilistic
  stage two), with the closing sentence kept. Owed by the owner: the
  Bateman-Konen equation page verified in the copy in hand, the chart's
  printed temperature range, six SP-2 readings (`chart_points.json`),
  and the cross-device preferences decision. PT11e waits for a
  customer request.
