# Seismolord — STATUS

Last updated: 2026-07-11 (wells Phase W1)

## Wells Phase W1 — registry, import, map display: DONE

- **`seismic_wells` migration** (`20260711220000_create_seismic_wells.sql`,
  applied + logged in MIGRATIONS.md): per-user, VOLUME-INDEPENDENT
  (world coordinates; deliberately no volume FK — plan decision #1);
  deviation/tops/checkshots as compact jsonb (fault-sticks precedent).
  **RLS pentest extended and EXECUTED live** (rollback-wrapped, via the
  management-API query endpoint): user B sees 0 rows across all FIVE
  seismic_* tables, cannot update/delete A's wells, forged insert
  raises 42501; user A control reads succeed.
- **Import engine** (`engine/wellImport.js`, pure + jest): delimited
  parse (comma/semicolon/tab/whitespace detection, comment/blank
  skipping, header detection), name-based mapping guesses, and the
  domain-rule builders — deviation MD must strictly increase and
  inclination stay 0–180°; checkshots must STRICTLY increase in both
  depth and time (rejected with row numbers, never sorted silently).
  Golden station/checkshot tables round-trip exactly.
- **UI**: `WellImport` (header fields + Deviation/Tops/Checkshots tabs,
  paste or file, mapping selects with live preview; a well without a
  deviation survey is vertical and needs TD) inside a new `WellsPanel`
  (per-user list, visibility/colors/delete) on the Seismolord page.
  Visible wells flow to the viewer with their minimum-curvature world
  paths precomputed (wellPath engine), ready for W2's sections/3D.
- **Map display** (MapView `wells` prop + Layers toggle): surface spot
  (circle + centre dot) with haloed name label, deviated path polyline
  and TD marker — everything through the survey affine
  (`worldToIlxl`); hidden with a "(no coordinates)" note when the
  volume has no usable affine.
- **Acceptance held**: oracle-truth lattice placement — gen_wells.py
  now emits each well's fractional il/xl (surface AND TD) on dome_ieee
  and dome_rot via an INDEPENDENT Python inversion; jest holds the
  app's `worldToIlxl` to < 0.1 cell (measured < 1e-9). New Playwright
  harness `/dev/seismolord-wells` mounts the REAL WellImport + MapView
  on the rotated fixture's affine truth: the spec imports the golden
  S-shape well through the mapping UI (headerless, shuffled columns —
  the selects must be driven), asserts surface/TD land at the oracle
  IL/XL (< 0.1 cell gate, < 1e-6 measured), well ink on the map
  canvas, and the checkshot rejection message in the UI path.
- Verified: 23 jest suites / 297 tests (12 new), 16 Playwright e2e
  green on staging (2 new), esbuild bundle of the page subtree clean.
- Next: Phase W2 — T(z) resolution (checkshots → inverted velocity
  model), corridor projection onto sections/traverses, tops as markers,
  wells in the 3D window.

## Wells Phase W0 — oracle, goldens, wellPath engine: DONE

First phase of the approved wells plan
(`docs/scope/Seismolord-WELLS-PLAN.md`, owner sign-off 2026-07-11).

- **Oracle** (`tools/validation/seismolord/wells/`, validation-first):
  `mincurve.py` minimum-curvature reference, proven on the published
  drillingformulas.com worked example ((3500 ft, 15°, 20°) →
  (3600 ft, 25°, 45°) ⇒ ΔN 27.22 / ΔE 19.45 / ΔTVD 94.01 ft — hand-
  verified against the standard formulas) AND on analytic circular
  arcs (planar build/drop and horizontal turns are exact by
  construction; asserted ~1e-9 m at deliberately uneven spacings).
  Where inclination and azimuth change together there is no closed
  form — there the minimum-curvature path IS the industry-standard
  trajectory definition, and JS-vs-Python (independent
  implementations) is the cross-check.
- **Goldens** (`test-data/seismolord/wells/wells.json`): three
  synthetic wells through the dome_ieee area — KETA-V1 vertical at
  the crest, KETA-S1 planar S-shape (build 3°/30m to 30°, hold,
  drop; every station matches the closed-form arc), KETA-H1
  horizontal landing with a genuine 3D build-and-turn segment and a
  3.9 km lateral (5 km MD total, the accuracy-acceptance path).
  Per well: stations, station path, 10 m exact-arc fine path,
  checkshots from the declared truth V(z) = 1800 + 0.5·z (the app's
  `expm1(k·twt/2000)` convention), and a "Dome" top root-found where
  the exact-arc path crosses the analytic dome surface. Datum
  convention: TVD positive down below KB, TVDss = TVD − KB below the
  (seismic) datum.
- **Engine** (`engine/wellPath.js`, pure/worker-safe):
  `computeWellPath` (tangent/dogleg/ratio-factor with the exact
  RF → 1 zero-dogleg limit — no 0/0), `verticalWellPath` header
  shortcut (bit-matches the general method, asserted), `positionAtMd`
  exact circular-arc interpolation (what W2's section/traverse/3D
  overlays will sample), clear domain errors for non-monotonic MD /
  non-numeric / out-of-range inclination.
- **Acceptance held** (16 jest cases): station positions and fine-path
  interpolation within 1 cm of the oracle on all three wells (actual
  agreement < 1e-6 m over the 5 km path); the published example
  reproduced; checkshots round-trip through the app's OWN
  `velocityModel.twtMsToDepthM`; each Dome top lies simultaneously on
  the dome surface (through the velocity model) and on the
  interpolated path — tying W0's truths to the W2/W3 math ahead.
- Next: Phase W1 — `seismic_wells` migration (+ create MIGRATIONS.md
  with its first entry), wellsService, CSV import UI with column
  mapping, map display, RLS pentest extension.

## Horizon amplitude-extraction maps: DONE

The map window can now display seismic amplitude extracted along the
active horizon instead of its structure — the first attribute map.

- **Engine** (`engine/horizonAmplitude.js`): "value at horizon"
  evaluates the parabola through the three samples around the
  sub-sample pick (the snapPick refinement family — a peak picked at
  its parabolic apex reads its true apex amplitude; EXACT on quadratic
  traces, jest-proven analytically), with nearest-sample fallback on
  incomplete stencils; windowed RMS / mean / max-|amp| statistics over
  ±N samples, nulls excluded, all-null → null. This is a COMPUTED
  ATTRIBUTE of stored amplitudes — the never-interpolate-display rule
  is untouched. `extractHorizonAmplitude` visits bricks grouped per
  (bi, bj) column with only the k-range that column's picks need —
  each brick downloads exactly once (asserted), an all-null horizon
  fetches nothing. `bricksForHorizonAmplitude` preflights the key set
  so ViewerPanel shields the fetches from slice-scrub cancellation
  (the traverse-assembly pattern).
- **MapView**: an Attribute select (Structure / Amplitude / RMS /
  Mean / Max |amp| + ±2/5/10/20 window) next to the isochron "vs"
  select — the two are mutually exclusive (choosing one resets the
  other); the depth-domain select disables on amplitude maps (they
  have no display domain). Fill / contours / colorbar / labels /
  cursor readout (`A 1.234e-1`) all ride the extracted grid through
  the existing layer cache; sub-unit contour steps now print 3
  significant digits instead of rounding to 0 (also fixes thin
  isochron labels). Extraction runs async with an "extracting
  amplitude…" note; until it lands the map shows structure. Editing
  the mapped horizon re-extracts per committed stroke (grid-ref keyed;
  brick cache warm, so it's compute-bound — acceptable, noted).
- Verified: 21 jest suites / 269 tests (new horizonAmplitude suite,
  10 cases incl. analytic-apex exactness and fetch-once assertions),
  14 Playwright e2e green on staging, esbuild bundle check clean.
- Follow-up candidates: attribute extraction between two horizons
  (interval attributes), export attribute grids alongside structure,
  amplitude histograms per horizon (suite chart standard applies).

## Traverse picking + named/persisted lines: DONE

Closes all three traverse follow-ups recorded below: traverses are no
longer view-only or session-local.

- **Picking along traverses**: the Traverse window now honors the PAINT
  modes ('manual'/'erase' — armed from the section toolbar as before,
  same edit session). SliceView's traverse pickAt already resolved the
  hovered column to IL/XL through `slice.positions`; the new
  `handleTraversePick` writes those grid cells directly. Manual picks
  snap on the ALREADY-ASSEMBLED traverse column (zero fetches — the
  same trace the ghost preview reads, which is now enabled on traverses
  too); the eraser brushes ALONG THE PATH via
  `traverseEraseCells(positions, trace, radius)` — at a bend it erases
  around the corner, never across it, clamped at path ends. Seed/fault
  picking and Track 2D/3D stay section-only (recorded follow-up).
- **Named/persisted traverses**: `manifest.traverses = [{id, name,
  vertices}]` via `saveManifestTraverses` — the same owner-path
  manifest upsert as the velocity model, deliberately NO schema change
  (a traverse is a few dozen bytes of polyline). Loaded defensively
  through `sanitizeTraverses` (manifest.json is hand-editable storage:
  bad entries drop, never throw). Traverse window header gained a
  saved-lines select + Save line + Delete; loading a saved line
  re-resamples against the CURRENT affine, so a re-ingested (upgraded
  geometry) volume sections the same map path, not stale positions.
- **Multi-traverse map display**: MapView draws every saved line
  dimmed/dashed with its name label at the midpoint vertex; the active
  line still draws on top in full ink with A/A′ ends. "Saved traverse
  lines" toggle in the map Layers menu.
- Verified: 20 Seismolord jest suites / 259 tests (6 new:
  traverseEraseCells path-following/clamping, sanitizeTraverses
  robustness), 14 Playwright e2e green on live staging — the traverse
  spec now also proves seed stays disabled while manual paint picking
  resolves through positions.
- Follow-up candidates: Track 2D along a traverse (autotrack2D already
  takes the assembled slice — needs a seed-on-path affordance),
  multi-traverse SECTIONS (several traverse windows), traverse export
  (positions + picks as a 2D line).

## Arbitrary traverse lines: DONE

Closes the long-recorded follow-up: a user-drawn map polyline becomes a
seismic section along that path, in its own viewer window.

- **Engine** (`engine/traverse.js`): `resampleTraverse` walks the
  polyline at EQUAL GROUND-DISTANCE steps through the survey affine
  (rotated surveys and rectangular bins measure true metres; lattice-unit
  fallback without coordinates), each sample taking its NEAREST trace —
  amplitudes are never interpolated laterally — with consecutive
  duplicates collapsed. `assembleTraverse` prefetches each needed brick
  once and lays columns out exactly like inline/crossline sections
  (`data[col*ns+s]` + per-column RMS) so the renderer path reuses
  untouched. Golden-proven: every traverse column bit-identical to the
  segyio golden traces on the IEEE and rotated fixtures.
- **SliceView 'traverse' orientation**: axes in ground metres along the
  line (`slice.stepM`; trace-number fallback), horizon overlays and the
  IL/XL/ms/amp readout look up each column's trace via
  `slice.positions`, scale bar rides the resample step. VIEW-ONLY:
  picking, seed marker and ghost preview are disabled on traverses.
- **Fault-stick projection** (`projectStickToTraverse`): stick points
  whose nearest path column is within 1.5 lattice cells draw at that
  column (matches the inline/xline |il − idx| <= 1 generosity: adjacent
  = 1.0, diagonal = 1.41 both pass); the polyline pen-breaks where the
  stick leaves the corridor, so a path crossing a fault several times
  shows each crossing separately. Projection cached per (stick, path) —
  the O(points × columns) scan never runs per camera frame.
- **Map tool** (MapView): Route-icon tool — click vertices along the
  path, double-click to finish, Esc cancels, drag still pans (so long
  lines can be drawn across pans); drawing again replaces the line, an X
  button removes it. The committed line renders with vertex markers and
  A/A′ end labels (the section reads left→right as A→A′); the draft is
  world-anchored like the erase polygon. Traverse and erase tools disarm
  each other.
- **Wiring** (ViewerPanel + ViewerWindows): a fourth always-registered
  'Traverse' window (empty state explains the draw-on-map flow, header
  line shows trace count + length). The section is assembled ONCE per
  draw (orientation/index scrubs never re-assemble it); a finished draw
  focuses the window via the new ViewerWindows `focus` request prop.
  An in-flight traverse assembly registers its brick keys so the slice
  scrub's `cancelPendingExcept` cannot abort it; session-local (not
  persisted), cleared on volume switch.
- Verified: 20 Seismolord jest suites / 253 tests (13 traverse cases:
  golden bit-identity + 6 stick-projection cases), 14 Playwright e2e
  green on live staging — the SliceView harness runs a traverse mode
  (dog-leg path, with a fault stick ON the path) and the spec asserts
  readout-via-positions, view-only behavior and projected fault ink on
  the overlay canvas.
- Follow-up candidates: named/persisted traverse lines per volume,
  multi-traverse display on the map, picking along traverses (writes
  through `positions` to the horizon grid).

## Layer-cake velocity model: DONE

Successor to the single V(z) = V0 + kZ model (kept, now tagged
kind:'linear'): ordered layers bounded by picked horizons, each with
its own V = v0 + k·(z − layer top); the last layer is unbounded.

- **Engine** (`engine/velocityModel.js`): layer boundaries are horizon
  TIMES, so conversion is COLUMN-DEPENDENT — `makeDepthConverter` gives
  a (twtMs, cell) API over boundary pick grids; `layercakeDepthM` is
  the piecewise analytic accumulation. Conventions (tested): a null
  boundary extends the layer above to the next defined boundary (the
  layer below vanishes there); crossing/noisy boundaries clamp to zero
  thickness so depth stays monotonic in time. Validated against
  segment-wise RK4 integration + hand-computed constant-velocity
  stacks. Manifest form: `{type:'layercake', layers:[{base_horizon_id,
  v0, k}]}` — existing `{v0,k}` manifests unchanged.
- **Editor** (ViewerPanel): Single V(z) / Layer cake mode select; layer
  rows pick a base horizon + V0/k with add/remove and validation (>= 2
  layers, distinct horizons); rows save sorted by horizon mid-TWT.
  Boundary grids load through the horizon grid cache and GATE depth
  displays (a layer cake is unusable until its grids are in — never
  convert with half a model).
- **Consumers**: `picksToPoints` passes the lattice cell to sampleToZ;
  the export workflow loads boundary grids and exports per column
  (Export panel, AI and fault-aware paths inherit); MapView depth
  domains + cursor readout convert per surface AND per column (isochron
  thickness right under laterally-varying velocity); layer cache keyed
  by `velocityKey`, invalidated on boundary-grid changes.
- Verified: 30 jest suites / 437 tests repo-wide (9 new layer-cake
  cases incl. RK4 cross-check), 13 Playwright e2e green on staging.
- Follow-up candidates: well-tie calibration of layer velocities, depth
  display in sections/3D, interval-velocity QC map (thickness ×
  velocity per layer).

## Fault-aware gridding (blocked TPS): DONE

Closes the recorded Phase 4 limit: TPS was not fault-aware — it
interpolated straight across fault sticks, smearing throw into a ramp.

- **Fault barriers** (`engine/faultBarriers.js`): each stick is
  intersected with the horizon (null-aware bilinear sampling along the
  stick polyline; hole segments skipped, first sign change wins);
  crossings in STORED stick order form the fault's horizon-level trace
  (the same order the 3D ribbon lofts); traces rasterize onto the
  horizon lattice as 4-CONNECTED barrier chains (diagonal-leak
  regression test); flood fill labels the fault blocks.
  `buildFaultBlocks` returns null when no fault cuts the horizon —
  gridding then runs exactly as before.
- **Blocked TPS** (`gridding.gridSurfaceBlocked`): one TPS per block
  (decimation budget split by point share), barrier-cell picks dropped,
  every output node evaluated only against its own block; barrier nodes
  stay null (the standard fault-gap look). NO hull mask in blocked mode
  — blocks extrapolate their trend across the pick gap up to the fault,
  bounded by the distance gate. Analytic proof: two planar blocks with
  300 ft throw reproduce < 0.01 ft right up to the fault; the unblocked
  path smears > 50 ft on the same inputs (the documented bug).
- **Wiring**: worker gains the blocked path (nodeBlocks presence
  selects it); `gridHorizonSurface({faults})` builds labels and assigns
  export nodes their lattice block through the inverse survey affine;
  the Export panel now DELEGATES to the shared workflow (its inline
  duplicate of the gridding code was removed) and gets a fault-aware
  toggle (default on when the volume has faults) + fault-block readout;
  the AI `grid_and_export` is fault-aware by default using the volume's
  own faults (deliberately no tool-schema change, so no edge redeploy).
  Handoff provenance records fault_aware / fault_blocks / faults_used.
- Verified: 30 jest suites / 429 tests repo-wide (new faultBarriers +
  faultGridding suites, 17 cases), 13 Playwright e2e green on staging.
- Follow-up candidates: draw the horizon-level fault traces (not just
  stick footprints) in MapView, per-fault include/exclude in the export
  panel, extrapolation-distance-to-fault control, fault polygons
  (heave) instead of line barriers.

## Rotated-survey geometry (measured affine): DONE

Closes the recorded Phase 4 limit: `picksToPoints`/export assumed an
unrotated survey (X along crosslines), so rotated surveys exported
wrong world coordinates.

- **Oracle first** (validation-first rule): new `dome_rot` fixture —
  30° azimuth, rectangular bins (xl 25 m / il 37.5 m) so axis-aligned
  or square-bin assumptions fail loudly. Goldens now carry segyio-read
  full coordinate grids (float64) + the exact affine truth for all four
  volumes; the three existing fixtures regenerate byte-identical.
- **surveyGeometry engine** (`engine/surveyGeometry.js`): world =
  origin + i·ilVec + j·xlVec, MEASURED by a least-squares affine fit
  over trace-header coordinates (centered sums for UTM-scale float64
  precision, (0,0) coords excluded, residual RMS recorded). Fit
  recovers the rotated truth to sub-cm. `ilxlToWorld`/`worldToIlxl`,
  cell spacing, world bounds, grid azimuth, north-in-grid. Legacy
  two-corner axis-aligned fallback is bit-compatible with the old
  arithmetic for pre-affine manifests.
- **Scan + manifest**: `scanGeometry` accumulates the fit on every
  inspected trace and warns when coordinates deviate from the il/xl
  lattice (bad X/Y byte mapping); `manifest.geometry.affine` is an
  ADDITIVE field — old volumes keep the corner fallback; re-ingest
  upgrades them.
- **Gridding/export**: `picksToPoints` places picks through the affine
  (golden-proven: rotated picks land on true header coordinates, max
  err < 6 mm; the legacy derivation is >100 m wrong on the same data).
  Export panel + AI `grid_and_export` grid over the rotated survey's
  world bbox; RCP handoff params record `survey_geometry`
  measured_affine vs corners_axis_aligned.
- **Viewers**: `surveySpacing`/`northScreenDir` ride the affine (true
  rectangular-bin scale bars everywhere), new `northLocalDir`; MapView
  cursor X/Y readout via `ilxlToWorld`; CubeView north arrow points the
  measured bearing instead of ±inline-axis.
- Verified: 28 jest suites / 412 tests repo-wide (new surveyGeometry
  suite, 28 cases), 13 Playwright e2e green on staging.
- Follow-up candidates: overlay the rotated survey outline in world
  coordinates on the map, display grid convergence/azimuth in volume
  info, fault-aware gridding (next major item).

## Velocity model + depth conversion: DONE

- **Model** (`engine/velocityModel.js`, pure + jest): V(z) = V0 + k·z,
  analytic z(t) = (v0/k)·expm1(k·t) with the k = 0 constant-velocity
  limit — validated against RK4 integration of dz/dt = v0 + k·z
  (validation-first rule). Null-aware depth grids (m/ft) and
  `sampleToExportZ` for the NEGATIVE-feet export convention.
- **Persistence**: the model lives INSIDE the volume's manifest.json
  (`manifest.velocity = {v0, k}`) via
  `volumesService.saveManifestVelocity` — owner-path storage upsert
  under existing RLS, deliberately NO database schema change. Editor
  row in the viewer (V0 m/s, k 1/s, Save to volume; clear V0 removes);
  saving propagates the merged manifest through onVolumeChange so the
  export panel sees it immediately.
- **Depth maps** (MapView domain select: TWT ms / Depth m / Depth ft,
  gated on the model): structure AND isochron layers convert PER
  SURFACE before differencing — Δdepth ≠ depth(Δtwt) when k ≠ 0.
  Colorbar, contour-interval note, contour value labels and the cursor
  readout are all unit-aware; layer cache keys per pair × domain ×
  model params. Removing the model falls the domain back to TWT.
- **Depth exports**: Export panel and the AI `grid_and_export` path now
  prefer the saved model (`sampleToExportZ`) over the legacy constant
  ft/s input, which remains only as a fallback when no model is set
  (the panel shows the model description read-only instead of the
  input). Export convention unchanged: Z negative, feet. RCP handoff
  params record `velocity_model` vs `velocity_ft_s` honestly.
- Verified: 16 jest suites / 185 tests (velocityModel suite incl.
  RK4 cross-check), 13 Playwright e2e green on staging.
- Follow-up candidates: per-horizon interval velocities (layer-cake
  model), depth display in the 3D window / sections, well-tie
  calibration of V0/k.

## Isochron maps + smoothing radius + snap window: DONE

- **Isochron maps** (`engine/horizonDifference` + MapView "vs" select):
  pick a second visible horizon and the map layer becomes the TWT
  interval Δ = vs − horizon — SIGNED (crossing surfaces show negative),
  null wherever either surface is missing (an interval needs both
  bounding picks). Fill, contours, value labels, colorbar and the
  cursor readout (Δ … ms) all ride the difference grid; the layer
  cache keys per horizon pair and invalidates on either grid ref.
  Region erase is disabled on isochron maps — erasing edits ONE
  horizon and the target would be ambiguous.
- **Smoothing radius**: 3×3 / 5×5 / 9×9 select feeding
  `smoothHorizon`'s radius (mean and median both).
- **Snap window**: ±2/3/5/8/12-sample select driving seed snapping,
  manual picking, the ghost preview and BOTH trackers. Default ±3
  keeps the validated 3D-autotrack behavior byte-identical; the old
  hardcoded ±5 picking window is now just one of the choices.
- Verified: 15 jest suites / 179 tests, 13 Playwright e2e green on
  staging.
- Follow-up candidates: isochron in metres once a velocity model
  exists, per-horizon smoothing presets, snap-window persistence.

## Median smoothing + hole-fill + ghost preview: DONE

- **Median smoothing**: `smoothHorizon` gains `method: 'mean'|'median'`;
  the Smooth button gets a mean/median select. Median kills single-pick
  autotrack spikes exactly (jest-proven vs mean's dampening); coverage
  preservation unchanged.
- **Hole-fill interpolation** (`engine/fillHorizonHoles` + Fill holes
  button): interior holes only — the exterior null region is
  flood-detected from the survey border (4-conn) and never touched, so
  the interpreted outline cannot grow. Fill = onion-peel seeding
  (8-conn means) then Gauss–Seidel Laplace relaxation with live picks
  as fixed boundary values; a planar horizon fills back exactly planar
  (jest). One undoable op; toast reports cells filled.
- **Ghost pick preview** (SliceView `ghost` prop): in manual mode a
  marker under the cursor previews where the pick would land — circle
  snapped to the selected event kind with a dashed raw→snap connector,
  square when no event is within the window (raw position would be
  used). Computed from the already-assembled slice trace via the shared
  engine `snapPick` — zero fetches, redraws on pointer move only while
  the mode is active.
- Verified: 15 jest suites / 178 tests, 13 Playwright e2e green on
  staging.
- Follow-up candidates: fill-hole size cap option, smoothing radius
  select, snap-window control, horizon difference / isochron maps.

## Eraser size + polygon erase + smoothing: DONE

- **Eraser size**: brush-width select next to the section Erase tool —
  1 / 3 / 5 / 11 / 21 traces per pass (radius into the erase branch of
  handlePick).
- **Polygon region erase** (map window): the erase tool now accepts a
  hand-drawn outline — click vertices, double-click closes (stacked
  dbl-click vertices deduped), Esc cancels; a drag still rectangles.
  Both shapes resolve through `cellsInPolygon` (even-odd
  `pointInPolygon`, concave OK, cell-centre test, bbox-bounded;
  jest-tested with an L-shape). `onEraseRegion` payload is now
  `{horizonId, cells}`. Draft outlines are stored in WORLD coords so
  panning/zooming mid-draw keeps them glued to the map.
- **Horizon smoothing** (`engine/smoothHorizon` + Smooth button): one
  3×3 null-aware mean pass per click over the edit session's grid, as a
  single undoable op — repeat clicks strengthen. Live cells average
  live neighbours only; nulls stay null, so coverage is preserved
  exactly (holes neither grow nor shrink). Undo ops now store typed
  arrays so a whole-grid smooth op stays a few MB.
- Verified: 15 jest suites / 172 tests, 13 Playwright e2e green on
  staging.
- Follow-up candidates: median (spike-killing) smoothing variant,
  hole-fill interpolation, ghost-curve preview while manual picking.

## Horizon editing toolkit + contour labels + draggable planes: DONE

Operator requests: contour value labels; draggable 3D planes; manual +
2D autotracking alongside 3D; peak/trough/zero-crossing selection;
deleting wrong picks on a line or a region of a 3D-tracked horizon.

- **Snap modes** (`engine/horizonTrack.js`): SNAP_MODES now peak /
  trough / zero_pos (−→+) / zero_neg (+→−). Zero modes take the NEAREST
  crossing (not strongest), linear sub-sample position, and report the
  strongest flanking amplitude (±3 samples) so autotrack's minAbsAmp and
  dead-trace gates still work at ~0 amplitude — the UI additionally
  drops the RMS amplitude floor for zero modes. The snap select drives
  seed snapping, Track 2D and Track 3D (mode persisted in params).
- **Edit sessions** (ViewerPanel `editRef` + `openSession`/`applyOp`/
  `commitStroke`/`undoEdit`): target = "New horizon…" (fresh grid,
  yellow draft overlay) or an existing horizon (WORKING COPY — storage
  untouched until Save). Tools: **manual paint picking** (click/drag on
  sections; snaps to the selected event, falls back to the raw click),
  **Track 2D** (engine autotrack2D along the displayed line, one undoable
  op), **erase brush** (drag on sections, trace ±1), **rectangle
  region-erase in the map window** (targets the mapped horizon,
  switching the session to it), bounded 40-op **undo**. Save →
  `saveHorizon` (new) or `updateHorizon` (blob upsert + stats refresh).
  Paint strokes mutate the working grid in place (live 2D overlay via a
  version counter) and clone it on release so the 3D-mesh / map-layer
  caches (keyed by grid ref) rebuild once per operation, not per move.
- **SliceView paint modes**: pickMode 'manual'/'erase' stream onPick
  during a drag and fire onPickEnd on release.
- **Contour value labels** (`contourPolylines` + MapView): segment soups
  chain into open/closed polylines (shared-edge endpoints are bitwise
  identical, so exact matching suffices); labels ride MAJOR contours,
  screen-spaced (~280 px), kept upright, haloed for fill/dark ground.
  Layers ▸ "Contour value labels".
- **Draggable 3D planes** (CubeView): Ctrl/Alt+drag over a main plane
  moves it along its axis — pointer delta is projected through the
  axis' screen direction into an index delta; the quad moves immediately
  (old texture stretches a frame) while the reconcile effect streams the
  new slice; the shared index updates through onChangeIndex so 2D stays
  in sync. Boundary faces are not draggable by definition.
- Verified: 15 jest suites / 167 tests (new zero-crossing +
  contour-polyline cases) and all 13 Playwright e2e green on staging.
- Follow-up candidates: eraser size control, polygon (not just
  rectangle) region erase, horizon smoothing/interpolation fill,
  multi-Z picking per trace, ghost-curve preview while manual picking.

## 3D interpretation + Map window + window manager: DONE

Operator requests: horizons/faults in the 3D window; an axis gizmo; a
Petrel-style 2D map window; windows arranged as tabs with optional
visibility and horizontal/vertical tiling.

- **Horizons & faults in 3D** (`viewer/interpMesh.js` + CubeRenderer mesh
  API + CubeView wiring): visible horizons render as shaded surfaces
  (null-aware triangulation, decimated ≤512² lattice, holes keep hard
  edges), faults as sticks + translucent lofted ribbons (arc-length
  resampled rails, auto-orientation so hand-picked sticks never bowtie).
  Geometry lives in normalized cube space scaled by a `u_scale` uniform —
  vexag changes are uniform updates, zero re-uploads. Shading is
  screen-space-derivative faceted lambert (no normal attributes, so
  non-uniform scale needs no normal matrix). Visibility is the SAME state
  as the 2D lists (ViewerPanel `visibleIds`/`visibleFaultIds`).
- **Axis gizmo** (CubeView overlay): camera-locked IL/XL/Z arrows with
  foreshortening + depth ordering, bottom-left disc; clicking an axis tip
  snaps to the standard view (XL→end-on, IL→front, Z→map view). Gizmo
  clicks never fall through to plane picking. Toggle under Planes ▸
  Rendering.
- **Map window** (`components/MapView.jsx` + `viewer/mapContours.js`):
  structure map of the active visible horizon — cached color-fill bitmap
  (per horizon × colormap, 8 sequential palettes), null-aware
  marching-squares contours on nice levels (majors every 5th, CI note),
  Z colorbar (shallow at top), fault traces, survey outline, IL/XL axes,
  north arrow, scale bar, world-X/Y + IL/XL + Z readout. Pan/zoom via the
  shared ViewTransform with ground aspect on the vexag channel; click
  moves the shared inline+crossline positions (map → sections/3D nav).
- **Window manager** (`components/ViewerWindows.jsx`): Section / 3D / Map
  as tabs with per-window close, a Windows menu to open/close each, and
  three layouts — tabs, tile horizontally (columns), tile vertically
  (rows). Open windows stay MOUNTED when hidden (display:none) so
  cameras, GL state and caches survive tab switches; ResizeObservers
  re-size canvases on reveal. Layout/open-set persisted
  (`seismolord.windows.v1`). Replaces the old inline "3D window" toggle.
- Verified: 15 jest suites (162 tests; new `interpMesh` + `mapContours`
  math suites) and all 13 Playwright e2e tests green against live
  staging; esbuild bundle check of the ViewerPanel subtree clean.
- Follow-up candidates: contour value labels along lines, map polygon /
  fault-polygon editing, draggable 3D planes, arbitrary traverse lines,
  depth-converted maps once a velocity model exists.

## 3D cube window + colormaps: DONE

Operator requests: more colormaps; a 3D window showing the whole cube or
any combination of inline / crossline / time planes, synced with the 2D
view, with dark/white background and pro features.

- **Colormaps**: 4 → 13 (`SEISMIC_COLORMAPS`). New in the shared registry
  (additive): red-white-black, cool-warm (Moreland diverging), spectrum,
  magma; also exposed: reverse gray, viridis, plasma, hot iron, phase
  cyclic. Jest guard: every offered key resolves and yields a valid LUT.
- **3D window** (`components/CubeView.jsx` + `viewer/CubeRenderer.js` +
  `viewer/cube3d.js`): raw WebGL2 (playbook — no three.js). Survey
  wireframe with IL/XL/TWT tick annotations and north arrow; planes as
  textured quads; "entire cube" = six boundary-face slices (full volume
  can never be memory-resident, so the solid look is the standard box
  view). Amplitude shading imports the SAME shader chunks as 2D
  (`viewer/shaderChunks.js`, extracted refactor — GPU==CPU self-test
  re-verified), so 2D and 3D can never disagree. Orbit/pan/dolly camera
  (true ground aspect from manifest corners), dark/light background,
  hover readout with amplitude, click-a-plane→2D-orientation, Shift+wheel
  steps a plane, PNG snapshot, fullscreen, adaptive render resolution
  with idle full-res restore.
- **Sync model (deliberate)**: DATA + DISPLAY shared between 2D and 3D —
  per-orientation slice indices (ViewerPanel now keeps one index per
  orientation; volume load centres all three; orientation switch keeps
  its position), colormap/gain/clip/polarity/balance, vertical
  exaggeration (SliceView V.exag is now controllable + reports changes).
  CAMERAS independent by design: a 2D zoom rect has no meaningful
  counterpart in an orbiting perspective camera.
- Verified: 13 jest suites (145 tests, incl. new cube3d math suite) and
  13 Playwright tests green (new `/dev/seismolord-cubeview` harness +
  6-test spec); eyeballed dark/light/entire-cube screenshots at
  dim=160.
- Follow-up candidates: horizons/faults rendered in the 3D scene,
  draggable planes, arbitrary traverse lines.

## Display smoothing (post-responsiveness): DONE

Operator report: seismic view pixelated, obvious when zoomed in. Two causes:
NEAREST texture sampling (the "Smooth interpolation" pref defaulted OFF and
its LINEAR path needed the optional OES_texture_float_linear extension), and
the adaptive render resolution never recovering — one slow drag left the
canvas below devicePixelRatio forever.

- **Shader-side bicubic resampling** (`SliceRenderer`): null-aware
  Catmull-Rom on AMPLITUDES via `texelFetch` (16 taps) — no extension
  needed, works on every WebGL2 device incl. SwiftShader. A pixel is null
  iff its NEAREST texel is null and null neighbours contribute the centre
  value, so null regions keep hard edges and never smear into live data
  (domain rule). Trace balance applied per-tap; colormap still samples the
  interpolated amplitude, never blended colors. NEAREST path unchanged
  (still what the CPU-reference self-test models); self-test gained a
  smooth-mode smoke check.
- **Smooth interpolation defaults ON** — viewer prefs migrated to v2
  (v1 persisted the old `interpolate:false` default; other prefs carry
  over). Layers-menu toggle retained. Fixed a latent bug: display params
  set before the first slice landed were dropped because the renderer
  didn't exist yet (effect now re-runs on slice arrival).
- **Idle full-res restore** (`SliceView`): adaptive scale still downgrades
  during continuous interaction, but ~250 ms after the last frame the
  canvas repaints once at full devicePixelRatio; the next drag re-enters
  the learned scale after ONE full-res frame (with a ×1.25 upward probe
  per idle so faster machines shed the downgrade). Resting image is
  always crisp; interaction keeps the responsiveness fixes below.
- Verified: jest (11 suites) + Playwright e2e (7 tests, incl. GPU==CPU
  parity + new smooth check on SwiftShader) green; harness screenshots at
  ~7× zoom show continuous gradients vs. the old flat cells, nulls hard.

## Viewer responsiveness (post-pro-upgrade): DONE

Operator report: zoom / colorbar / vertical-exaggeration controls "hanging".
Root-caused by CPU-profiling the harness under Playwright/CDP at realistic
viewer sizes (1820×560 CSS): at devicePixelRatio 2 every wheel tick produced
a >50 ms main-thread task (p95 frame 200 ms); the identical scene at dpr 1
held a flat 60 fps — frame cost is dominated by canvas backing-store AREA,
so hi-dpi displays (Windows 125–200 % scaling) on weak or software-rendered
GPUs were exactly where controls hung. Fixes, worst case now 60 fps median
even on software GL (SwiftShader):

- **Adaptive render resolution** (`SliceView`): backing store starts at
  devicePixelRatio and steps down ×0.75 (floor 1× CSS px) whenever a
  continuous interaction sustains a slow-frame EMA >32 ms. Downgrade-only —
  stable, slightly softer image instead of oscillating quality. All drawing
  and pointer math shares one render-scale ref, so picking/overlays stay
  exact at any scale.
- **Zero React renders per frame**: zoom % HUD and IL/XL/ms/amp cursor
  readout write straight to the DOM via refs; `hud` state now carries only
  boundary flags (at-min/at-max zoom, vexag). Previously every camera frame
  and pointer move re-rendered the whole component (10–40 ms in dev mode).
- **SliceView is React.memo'd** and ViewerPanel's `handlePick` is
  useCallback'd, so gain/clip slider ticks and list refreshes no longer
  re-render the viewport (all other viewer props were already memoized).
- **Colorbar bitmap cache** (`annotations.js`): LUT gradient rasterized once
  per LUT into a 1×256 offscreen canvas, stretched with one drawImage —
  replaces ~300 fillRect+fillStyle per frame (top profiled JS hot spot).
- **`SliceRenderer.setColormap` no-ops when the key is unchanged** (the
  display effect fires it on every gain/clip tweak); context-restore forces
  the rebuild. **`setView` sets only its own uniform** instead of rebinding
  textures/params every camera frame.
- **Time-slice horizon overlay**: the per-frame full-grid scan
  (nIl × nXl cells) is cached per (grid, slice index); frames only project
  the cached matching cells.
- **Harness upgrades** (`/dev/seismolord-sliceview`): `?dim=` (≤320),
  `?w=/?h=` viewport, `?horizon=0`, and a display-cycle button so perf work
  can drive colormap/gain/polarity changes through props like ViewerPanel.
  Existing e2e + jest suites unchanged and green; renderer pixel parity
  (GPU==CPU self-test) re-verified.

## Viewer pro upgrade (post-P6): DONE

Petrel/Kingdom-class navigation and legends for the inline / crossline /
time-slice windows.

- **ViewTransform camera** (`viewer/viewTransform.js`, jest-covered): the
  single coordinate authority for zoom (wheel-at-cursor, buttons, dbl-click,
  Shift+drag rubber-band), pan (drag, incl. while picking), vertical
  exaggeration (×0.2–×20 relative to fit), fit/reset, edge clamping.
  EVERYTHING that maps screen↔data (shader, overlays, annotations, picking)
  goes through it — that is the invariant future overlays must keep.
- **Shader camera** — `u_view` rect in `SliceRenderer`: navigation is
  GPU-only (no slice re-assembly, no brick refetch); out-of-data pixels get
  the panel background; optional LINEAR R32F "smooth interpolation" when the
  GPU supports it. CPU reference render mirrors the camera; the self-test
  gained zoomed + beyond-data GPU==CPU parity cases (dyadic rects so
  fp32/fp64 make identical texel-floor decisions).
- **Annotations** (`viewer/annotations.js`, math jest-covered): IL/XL/TWT
  axis gutters with 1-2-5 nice ticks, optional grid lines, ground-distance
  scale bar and grid-north arrow derived from manifest corners under the
  same axis-aligned assumption as gridding's `picksToPoints` (hidden — never
  guessed — when corners are unusable), amplitude colorbar (±clip/gain),
  crosshair cursor. All toggleable via the Layers menu; prefs persist in
  localStorage (`seismolord.viewerPrefs.v1`).
- **SliceView component** (`components/SliceView.jsx`): owns one viewport
  end-to-end — WebGL canvas + transform-aware interpretation overlay +
  annotation layer + toolbar + IL/XL/ms/amplitude cursor readout +
  fullscreen. `ViewerPanel` is now data-orchestration only (volume, slice
  assembly, horizon/fault business logic); display-param changes are
  shader-side and no longer re-assemble slices.
- **Interaction e2e**: dev-only `/dev/seismolord-sliceview` harness mounts
  the real SliceView on the synthetic volume;
  `e2e/seismolord-sliceview.spec.js` drives wheel zoom (cursor-invariant
  picking proof), pan, fit, annotation toggles, readout, keyboard stepping.
- **Positioned future upgrades** (the seams are deliberate): multi-viewport
  layouts (tri-panel inline+xline+time = render more SliceViews; sync by
  sharing/observing their transforms), well overlays / measure tools (draw
  through ViewTransform like every existing overlay), interpolation modes,
  arbitrary-line sections (a new orientation feeding the same SliceView),
  per-viewport colorbars. Adding a control = toolbar button + transform
  method; adding a legend = annotations.js painter + Layers toggle.

## Phase 6 — Hardening: DONE

Full results in `docs/scope/Seismolord-HARDENING.md`.

- **Hostile-senior review** of the whole app + RCP handoff points:
  numerics core confirmed solid; 2 HIGH + 5 MEDIUM findings fixed
  (RCP handoff feet-as-metres unit bug; ingest ack backpressure;
  volume-switch stale guard; RCP big-surface crash/truncation; long-job
  token refresh; AI arg validation; AI edge-fn role filtering). Lower
  findings logged as tracked follow-ups.
- **Malformed-SEG-Y fuzz** (11 cases): all fail with clear domain errors,
  never a raw RangeError; truncation scans whole traces and warns.
- **WebGL context-loss recovery**: rebuilds GL state and re-renders the
  last slice; verified bit-identical via WEBGL_lose_context. Self-test
  also gained an oriented time-down screen-convention fixture.
- **4 GB ingestion soak** (SEISMOLORD_SOAK=1): a 4.24 GB virtual volume
  streamed through a 256 MiB budget — measured peak 244 MiB, 4096 bricks,
  2 passes/band. A 139 MB / 32 MiB tier runs in every CI.
- **RLS penetration test** (live DB, rollback-wrapped): user B sees 0
  rows across all four seismic_* tables and 0 storage objects, cannot
  update/delete A's rows, and INSERT forgery raises 42501.
- **Per-user storage quota**: 20 GiB soft ceiling enforced at ingest via
  recorded per-volume storage_bytes.
- **Egress/object-count analysis**: keep per-brick objects through
  ~2000³; packed-brick + Range reads is the escalation (manifest already
  versioned for a clean v2 layout).

## Phase 5 — Suite integration + AI: DONE

- **Handoff registry**: `seismic_exported_surfaces` migration applied —
  user RLS; volume/horizon FKs `set null` on delete with a permanent
  provenance jsonb copy (app version, volume/horizon names, gridding
  params, stats); XYZ blob at `{uid}/exports/{id}.xyz`, deliberately
  OUTSIDE volume dirs so volume deletion never orphans a handoff.
  Replaces — does not resurrect — the broken data-exchange /
  shared_data_registry machinery.
- **Send to ReservoirCalc Pro**: Export panel publishes the TPS-gridded
  surface as XYZ; RCP's SurfaceImportDialog gained a "From Seismolord"
  source that downloads the blob and feeds the EXISTING SurfaceParser
  path (format xyz, metres, elevation convention preset).
- **RCP deep-z import fix**: SurfaceParser's `z > -9000` null window
  silently emptied every surface deeper than 9,000 ft (Phase 0 audit
  finding). Replaced with `isNullZ` — explicit sentinels (−9999 family,
  ±999.25, 1e30) + implausible-magnitude guard. Deep-water horizons and
  negated-TWT surfaces now import; jest-covered, RCP suite unregressed.
  (RCP's fake ZMAP+/CPS-3 grid-body parsing remains a known gap — the
  handoff deliberately uses XYZ.)
- **AI copilot (cuttable)**: `supabase/functions/seismolord-ai/` — JWT-
  verified proxy holding OPENAI_API_KEY + `systemPrompt.ts`
  (PROMPT_VERSION 1, tool schemas server-authoritative; model default
  gpt-4o-mini, `OPENAI_MODEL` override). ALL tools execute client-side
  over the user's own data: `get_volume_manifest`, `get_horizon_stats`,
  `run_autotrack` (horizon worker + save), `grid_and_export` (TPS worker
  + download or RCP publish + GRV). Collapsed-by-default panel on the
  page; the whole feature degrades to a clear 503 message if the key is
  unset.
- **Deployed 2026-07-10**: `seismolord-ai` is live on project
  ssyckywijlrkgcwvkwlr; the shared `OPENAI_API_KEY` project secret was
  already set, so no key change was needed. Auth gate verified
  (no-auth → 401, anon-without-session → 401). The AI copilot is now
  functional for signed-in users.

## Phase 4 — Faults, gridding, export: DONE

- **Gridding** (`engine/gridding.js`): thin-plate spline fit (dense
  Gaussian-elimination solve; control sets decimated to ≤~800 points per
  coarse-cell thinning) with convex-hull + max-extrapolation-distance
  masking → 1.0E+30 nulls. Runs in `workers/gridding.worker.js`.
- **Writers** (`engine/surfaceExport.js`): XYZ / CPS-3 / ZMAP+ in exactly
  the committed reference dialect (Python-format-compatible float
  helpers). **Byte-identical** to the Phase 0 reference files when fed
  the JS-recomputed analytic dome — the strongest possible writer test,
  proving float64 arithmetic and formatting line up with the oracle.
- **GRV acceptance held**: analytic-grid GRV within 1.5% and TPS-surface
  GRV within 2% of the 46,578.3 acre-ft analytic truth; null cells
  contribute nothing (asserted by nulling below-contact cells).
- **RCP round-trip held**: our XYZ export imports through ReservoirCalc
  Pro's SurfaceParser and reproduces live-node count and z range,
  negative-down.
- **Faults**: `seismic_faults` migration applied (user RLS, FK cascade;
  sticks as compact jsonb — documented deviation from the horizon blob
  pattern since sticks are a few KB of polylines). Pick mode on sections
  (raw clicks, End stick / Save / Discard), colored overlays with
  time-slice intersection markers, list with visibility + delete.
- **Export UI**: Grid & Export panel — horizon select, depth (constant
  velocity ft/s) or TWT domain (both exported z negative-down per the
  playbook), cell size, format choice, TPS in the worker, file download,
  optional contact GRV readout.
- Recorded limits: unrotated-survey assumption in picksToPoints/export
  (X along crosslines — rotation support is a follow-up); TPS is not
  fault-aware (sticks don't segment the gridding yet); CPS-3/ZMAP+
  grid-body import on the RCP side is still the known Phase 5 gap.

## Phase 3 — Horizon interpretation: DONE

- **Engine** (`engine/horizonTrack.js`): snap picking (peak/trough) with
  3-point parabolic sub-sample refinement; guided 2D autotrack along a
  section; 3D seeded region-grow (BFS) over an async brick-backed trace
  accessor (`assembleTrace` added to sliceAssembly), with progress
  callbacks and cancellation. All z values are sub-sample indices, time
  increases downward, nulls are 1.0E+30 and never enter statistics.
- **Acceptance held** (9 jest tests): ≥95% of tracked z within 2 samples
  of the analytic dome for BOTH 3D region-grow and 2D autotrack, on IBM
  and IEEE fixtures, at ≥95% coverage; null propagation and cancellation
  asserted; sub-sample snap accurate to <0.05 sample on a synthetic peak.
- **Persistence**: `seismic_horizons` migration applied (user RLS, FK
  cascade to seismic_volumes). Row = identity/provenance/stats; pick grid
  = float32 blob at `{uid}/{vol}/horizons/{id}.f32` (plan decision #8 —
  no multi-MB jsonb). `horizonsService` uploads blob before row and
  removes it if the insert fails; volume deletion sweeps horizons too.
- **Worker + UI**: `workers/horizon.worker.js` runs the 3D grow with its
  own brick cache (token passed in; progress + cancel via postMessage).
  Viewer panel gained: Pick-seed mode (click → snap on the real trace),
  seed marker, Track 3D with live progress/cancel, horizon save (named),
  horizon list with visibility toggles/colors/delete, and overlays —
  polylines on sections, intersection dots on time slices.
- **Fix found during Phase 3**: the Phase 2 shader displayed sections
  with time increasing UPWARD (transposed sample coord used v_uv.y
  directly). Fixed in shader + CPU reference together; the self-test
  passed before because it only proves GPU==CPU — screen-convention
  checks need eyes or an oriented fixture (note for Phase 6 review).

## Phase 2 — WebGL2 viewer: DONE

- **Data layer**: `engine/brickCache.js` — byte-budgeted LRU with
  in-flight dedup and AbortController scrub cancellation; production
  fetcher is a direct authenticated Storage GET (owner-path RLS, no
  edge-fn hop). `engine/sliceAssembly.js` reproduces segyio inline/
  xline/time slices bit-identically from brick sets (tested at 64³ and
  16³), plus per-trace RMS for display balance.
- **Renderer**: `viewer/SliceRenderer.js` — raw WebGL2 (no three.js),
  fullscreen-triangle quad, amplitudes in an R32F texture exactly as
  stored; colormap LUT (reuses `src/utils/colorMaps.js`), gain, polarity
  (SEG normal default), symmetric clip around zero, per-trace balance and
  1.0E+30 null masking are ALL fragment-shader-side. NEAREST LUT sampling
  keeps the self-test deterministic.
- **UI**: Section viewer panel on the Seismolord page — volume selector
  (ready volumes), orientation, scrub slider with stale-request guard +
  cache cancellation, colormap/gain/clip/polarity/balance controls,
  per-slice timing readout.
- **Self-test + Playwright** (approved tooling): dev-only
  `/dev/seismolord-selftest` route renders a synthetic 200³ volume
  through the REAL pipeline and compares readPixels to a CPU reference
  of the same math; `e2e/seismolord-viewer.spec.js` asserts correctness
  and records perf (`npm run test:e2e`). Headless run (SwiftShader
  software GL): all correctness cases pass; warm slice avg 5.1 ms /
  p95 6.3 ms / max 8.6 ms — under the 150 ms target even in software.
  `PERF_STRICT=1` enforces the 60 fps / <150 ms / <16.7 ms targets and
  should be run on real-GPU hardware against staging.
- Known Phase 2 limits: slice-texture rendering (bricks assembled on the
  CPU per slice) rather than GPU brick assembly — revisit if profiling
  ever demands it; no WebGL context-loss recovery yet (Phase 6); AGC is
  per-trace RMS balance, windowed AGC later if interpreters need it.

## Phase 1 — Ingestion + brick store: DONE

Streaming client-side SEG-Y ingestion, per the plan of record (no server
runtime; all numerics in workers).

- **Engine** (`src/pages/apps/Seismolord/engine/`): `reader.js` windowed
  ByteReader (structurally no whole-file reads), `segyScan.js` (EBCDIC
  textual header — display only, "it lies"; measured geometry under
  mappable il/xl bytes; sampled preview mode), `brickTranscode.js`
  (64³ float32 bricks; inline bands k-windowed to hold a FIXED memory
  budget; 1e30 padding excluded from stats), `manifest.js`
  (manifest_version 1, layout/paths/null documented).
- **Acceptance held** (42 jest tests): brick-reassembled inline/time
  slices bit-identical to segyio for IBM, IEEE and odd-bytes fixtures;
  non-default byte positions work end-to-end (poisoned defaults detected
  and warned); 128 KiB budget held while ingesting a 511 KB file with
  multi-pass output still bit-identical.
- **Pipeline**: `workers/ingest.worker.js` (postMessage progress, ack
  backpressure, cancel), `services/ingestService.js` (bounded-concurrency
  brick uploads to `seismic/{uid}/{volume_id}/bricks/i-j-k.f32`, volume
  row registered first as 'ingesting' → 'ready', skip-existing resume
  primitive, manifest.json last), `services/volumesService.js`
  (list/manifest/delete incl. storage cleanup).
- **UI**: Import panel (mapping presets + custom bytes, live rescan,
  measured-geometry card, preview table, textual-header viewer, progress
  + cancel) and My Volumes panel on the Seismolord page.
- Not in Phase 1 (per plan): unsorted-trace input (clear error instead),
  full resume UX (Phase 6), formats other than IBM/IEEE float.
- Manual staging check pending a signed-in session: import a fixture
  from `test-data/seismolord/segy/` and confirm bricks + manifest land
  under the owner path and the volume row flips to 'ready'.

## Phase 0 — Oracles, golden files, foundations: DONE

Plan of record: `docs/scope/Seismolord-PLAN.md` (playbook stack section
revised to match — client-side worker numerics, no server runtime).

- **Oracle**: `tools/validation/seismolord/` — deterministic analytic-dome
  SEG-Y generator (own IBM float encoder, EBCDIC headers) cross-read by
  segyio. Fixtures: `dome_ibm` (format 1), `dome_ieee` (format 5),
  `dome_oddbytes` (il/xl at bytes 9/21, bytes 189/193 poisoned with 9999,
  lying textual header). Goldens + spec-correct XYZ/CPS-3/ZMAP+ surface
  exports + analytic/numeric GRV committed under `test-data/seismolord/`.
- **Decode core**: `src/pages/apps/Seismolord/engine/segyDecode.js` —
  IBM/IEEE decode bit-identical to segyio (24 jest tests: traces, slices,
  stats, coord scalar, odd-byte mapping). Semantics pinned: IBM values
  below float32 normal range flush to +0, matching segyio.
- **Storage RLS**: owner-path policies on the `seismic` bucket
  (`{user_id}/…`), verified by two-user RLS simulation; four legacy
  project-scheme policies (`seismic_read/write/update/delete`, PR #21
  remnants whose unguarded `::uuid` cast errored whole-bucket queries)
  dropped. Clients will fetch bricks directly with their JWT.
- **zustand** added.

### Phase 0 audit findings (inputs to later phases)
- `src/workers/segy.worker.js` is self-describedly a "simplified" parser:
  loads whole file into memory, hardcodes bytes 189/193, ignores the
  byte-71 scalar, geometry from first 100 traces only, treats il=0 as
  missing. Its IBM formula is sound (now golden-validated in segyDecode).
  Left untouched (has existing subsurface-studio consumers); Phase 1
  builds the streaming indexer on `engine/segyDecode.js` instead.
- ReservoirCalc Pro `SurfaceParser`: ZMAP+/CPS-3 detection falls through
  to a delimited X-Y-Z parser (cannot read real grid bodies), and the
  null filter `z > -9000` silently drops surfaces deeper than 9,000 ft.
  Phase 5 must fix RCP import (grid-aware parsing + null handling) or
  hand off via XYZ. Phase 0 reference surfaces stay shallower than
  9,000 ft so the round-trip test is honest.

## Walking skeleton (PR #22)

The end-to-end path exists and nothing more: page → `seismolord-engine`
edge function → test manifest in the private `seismic` Storage bucket →
`{status:"ok"}` rendered on the page. No interpretation functionality yet.
See `docs/scope/Seismolord-PLAYBOOK.md` for the target product; the
playbook's Node/Express + Python architecture is future scope — the
skeleton uses the Suite's standard Supabase Edge Function path.

## What exists

- **Route**: `/dashboard/apps/geoscience/seismolord` (`src/App.jsx`),
  gated by `ProtectedAppRoute appId="seismolord"`.
- **Page shell**: `src/pages/apps/Seismolord/Seismolord.jsx` — header +
  a backend-connectivity card that invokes `seismolord-engine` on mount
  and renders the JSON result. Folder-based app archetype (like
  ReservoirCalcPro) so canvas/store/services can grow inside it.
- **Catalog**: `master_apps` row seeded by
  `supabase/migrations/20260710120500_seed_seismolord_app.sql`
  (slug `seismolord`, module Geoscience, status Active, icon `Waves`).
- **DB**: `public.seismic_volumes` (volume registry; metadata only) via
  `supabase/migrations/20260710120000_create_seismic_volumes.sql`.
  User-scoped RLS (`auth.uid() = user_id`), the Suite's house pattern.
- **Edge function**: `supabase/functions/seismolord-engine/` — verifies
  the caller's JWT (anon client + forwarded Authorization header), reads
  `seismic/test/manifest.json` with the service-role client, returns
  `{status:"ok", manifest}`. Deployed separately via
  `supabase functions deploy seismolord-engine`.
- **Storage**: private `seismic` bucket created 2026-07-10 with
  `test/manifest.json` uploaded. NOTE: a legacy public `seismic-files`
  bucket (SEG-Y mime types, 2025-10-07) also exists from the deleted
  seismic apps — Seismolord does not use it; candidate for cleanup.

## Decisions

- RLS: user-scoped now; org scoping deferred until the suite standardizes
  on one membership table (three inconsistent ones exist today).
- Bucket: new private `seismic` (deployment-checklist name). The legacy
  `seismic-files` bucket was rejected: public + mime-restricted to SEG-Y.
- Tile status: `Active` immediately (owner's call). Caveat: staging and
  production share the Supabase project, so the tile is visible on
  petrolord.com before the SPA route ships there — until the next manual
  production build upload, clicking it hits the catch-all redirect home.

## Not built yet (per playbook)

SEG-Y ingest/indexing, WebGL2 section/slice viewer, Zustand store, Web
Worker decoding, horizon/fault picking, gridding, XYZ/CPS-3/ZMAP+ export,
storage RLS policies on the `seismic` bucket (skeleton reads it with the
service role inside the function only), brick file format, master_apps
pricing/entitlement review for the `seismolord` appId.
