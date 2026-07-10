# Seismolord — Phased Development Plan (plan of record)

Approved 2026-07-10. Supersedes the stack section of
`Seismolord-PLAYBOOK.md` (domain rules there remain binding). The walking
skeleton (PR #22) is the starting point: route, page shell,
`seismic_volumes`, `seismolord-engine`, private `seismic` bucket.

## Locked architecture decisions (owner sign-off 2026-07-10)

1. **No server-side numerics runtime.** Production is a static SPA +
   Supabase; there is no host for the playbook's Node/Express + Python
   FastAPI sidecar. All runtime numerics (decode, transcode, autotrack,
   gridding, export) run client-side in Web Workers. Edge Functions are
   used only where the service role or secrets are genuinely required.
2. **Python/segyio is a development-time oracle, not infrastructure.**
   Scripts in `tools/validation/seismolord/` generate committed golden
   files in `test-data/seismolord/`; jest tests consume the goldens.
3. **Playwright is approved** as a devDependency for e2e pixel tests
   (Phase 2+). jest stays the only unit-test runner.
4. **Bricks are individual Storage objects** (64³ float32 ≈ 1 MB each)
   under `seismic/{user_id}/{volume_id}/…`, fetched directly by the
   client under Storage RLS. Packed-brick optimization is deferred until
   Phase 6 measurements justify it.
5. **User-scoped RLS everywhere** (`auth.uid() = user_id`), DB and
   Storage. Org-level sharing is future scope, gated on the suite
   standardizing one membership table.
6. **Registration and persistence via direct client inserts under RLS**
   (house pattern), not Edge Function hops.
7. **Progress/cancellation via worker `postMessage`** — no polling, no
   Realtime, no SSE, because there are no server jobs.
8. **Engines are plain JS with JSDoc types** (repo has no TS toolchain in
   jest); large pick/grid arrays persist as float32 blobs in Storage with
   metadata rows in Postgres — never multi-MB jsonb.
9. Reuse before rewrite: `src/workers/segy.worker.js` +
   `src/utils/segy-parser.js` (audited, extended — never replaced by a
   "simplified" parser), `src/utils/colorMaps.js`, worker patterns from
   `grid.worker.js`/`tiler.worker.js`. Export formats defined by what
   ReservoirCalc Pro's `SurfaceParser.js` imports.
10. Auxiliary charts (histograms, spectra) follow the suite chart
    standard (white chartTheme + ChartLogo). The WebGL seismic canvas is
    exempt.

## Domain rules (from the playbook — violating these = bug)

Z increases downward; exports use NEGATIVE Z in feet. Null = 1.0E+30,
propagates through gridding, never enters statistics. IBM (format 1) and
IEEE (format 5) trace formats; big-endian headers; coord scalar at trace
byte 71 (negative ⇒ divide); inline/xline default bytes 189/193 but MUST
be user-mappable; trust measured geometry, not the textual header. Never
load a full SEG-Y into memory — all access windowed/brick. Amplitudes
stored float32 end-to-end; gain/AGC in shader only. Display defaults: SEG
normal polarity, symmetric colorbar, red-white-blue + seismic-rainbow.

## Phases

### Phase 0 — Oracles, golden files, foundations
- `tools/validation/seismolord/` (Python, local venv, dev-only):
  synthetic SEG-Y generator — analytic dome model, IBM & IEEE variants,
  big-endian, coord scalars, default (189/193) and non-default
  inline/xline byte positions.
- segyio extraction scripts emit committed goldens to
  `test-data/seismolord/`: bit-exact float32 trace values, reference
  slices, analytic dome-surface truth, reference XYZ/CPS-3/ZMAP+ grids
  (negative-Z feet, column-major N→S, 1.0E+30 nulls).
- Storage RLS policy migration for the `seismic` bucket (owner-path
  `{user_id}/…`).
- Audit `segy.worker.js`/`segy-parser.js` against the domain rules;
  record findings in STATUS.md.
- Add zustand.
- **Acceptance:** goldens committed and loadable from jest; reference
  export grids import cleanly through ReservoirCalc Pro's
  `SurfaceParser`; RLS simulation proves user A reads own storage rows,
  user B cannot.

### Phase 1 — Ingestion + brick store (client-side, streaming)
Browser File API windowed reads; worker-pool decode (IBM + IEEE,
big-endian, coord scalar, header-mapping config UI with measured-geometry
preview); 64³ float32 brick transcode; batched, resumable upload to the
owner path; versioned `manifest.json` (`manifest_version`); direct client
insert of the `seismic_volumes` row.
**Acceptance:** bit-identical decode vs segyio goldens; brick-reassembled
slice equals segyio slice; non-default byte positions work; fixed worker
heap budget holds while ingesting a file larger than memory budget.

### Phase 2 — WebGL2 viewer
WebGL2 (no three.js), worker pool, R32F textures, colormap/gain/AGC
in-shader only, SEG polarity + symmetric colorbar defaults. Bricks
fetched directly from Storage under RLS; LRU brick cache and
fetch-cancellation-on-scrub from the start.
**Acceptance:** 60 fps on 200³; warm slice <150 ms; no main-thread block
>16 ms; deterministic in-app self-test (render known volume → readPixels
→ compare to model-derived reference) wrapped by a minimal Playwright
suite.

### Phase 3 — Horizon interpretation
Snap modes with parabolic sub-sample refinement; guided 2D autotrack; 3D
seeded region-grow — all in workers over the local brick cache,
cancellable, progress via postMessage. Persistence: `seismic_horizons`
migration (user-scoped RLS); metadata + provenance row, picks as float32
blob in Storage.
**Acceptance:** ≥95% of tracked z within 2 samples of the analytic dome;
null propagation and negative-Z-down asserted.

### Phase 4 — Faults, gridding, export
Fault sticks (`seismic_faults`, same persistence pattern); thin-plate
spline gridding in a worker with convex-hull + max-extrapolation mask →
1.0E+30 nulls; XYZ/CPS-3/ZMAP+ writers.
**Acceptance:** writers match Phase 0 reference grids byte-for-byte
(modulo documented float formatting); GRV assertions vs analytic dome
truth; round-trip — our export imported by ReservoirCalc Pro's
`SurfaceParser` reproduces the grid.

### Phase 5 — Suite integration + AI
"Send to ReservoirCalc Pro" via new `seismic_exported_surfaces`
(product-prefixed; provenance: volume id, horizon id, gridding params,
app version, timestamp) + a small RCP-side import hook feeding its
existing SurfaceParser path. This replaces — does not resurrect — the
broken `data-exchange`/`shared_data_registry` machinery. AI panel
(cuttable): dedicated Edge Function holds the LLM key + versioned system
prompt; tools (`get_volume_manifest`, `get_horizon_stats`,
`run_autotrack`, `grid_and_export`) execute client-side where data and
engines live.

### Phase 6 — Hardening
Hostile-senior-engineer review; memory ceilings + LRU eviction tuning;
4 GB ingestion soak (streaming/progress/resume); WebGL context-loss
recovery; malformed-SEG-Y fuzz corpus with graceful errors; user-A/user-B
RLS penetration checks across all `seismic_*` tables and Storage paths;
Storage object-count/egress review at scale (4 GB ≈ 4,096 bricks —
measure before optimizing into packed bricks); per-user storage quota
decision.

## Working conventions per phase
Branch + PR per phase; commit per completed sub-task; STATUS.md updated
at phase end; every migration logged in MIGRATIONS.md; `npm test` (jest)
must be green — a phase is complete only when its acceptance tests pass.
