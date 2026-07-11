# Seismolord — STATUS

Last updated: 2026-07-11 (3D cube window + colormap catalogue)

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
