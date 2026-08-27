# Reservoir Simulation Studio (slug `reservoir-simulation-studio`) — STATUS

Program of record: OPM Flow connectivity, plan approved 2026-08-26
(session plan transient-brewing-lecun). Petrolord runs black-oil
reservoir simulations by driving **OPM Flow** (open-source, GPLv3,
Eclipse-deck-compatible; opm-project.org) on the studio VPS. Suite
does the UX and deck handling; flow does the heavy lifting as a
separate subprocess (GPL satisfied: never linked, never distributed).

## Locked decisions (owner, 2026-08-26)

1. Worker runs on the **studio VPS** in Docker, hard-capped (1 job at
   a time, 2 of 4 cores, memory + wall-clock limits). No new infra.
2. **Deck-first V1**: upload/edit Eclipse-format decks or start from
   bundled SPE benchmark templates (ODbL, OPM/opm-data), run, chart
   summary vectors. Guided deck generation from Suite data (Fluid
   Studio PVT, SCAL curves, wells) is the S3 follow-on wave.
3. **New tile** "Reservoir Simulation Studio" (icon Cuboid). The old
   `reservoir-simulation-connector` row stays Archived (R0 dead
   shell); its redirect at src/App.jsx repoints to this app in S2.

Architecture: prod is a static SPA + Supabase, so the worker PULLS —
polls `sim_runs` with the service-role key, downloads decks from the
private `sim` bucket, runs flow, uploads results under the owner's
storage prefix, updates the row. No inbound ports. Clients enqueue
via SECURITY DEFINER RPCs; `sim_runs` is read-only to humans.

## S0 — Foundation (2026-08-26)

- Migration `20260826200000_create_sim_tables.sql` APPLIED LIVE
  2026-08-26 (rollback-wrapped dry run first):
  - Dropped the legacy empty Horizons-era `sim_projects`/`sim_cases`
    (hand-created for the dead connector; 0 rows, zero code refs;
    drop guarded on the legacy signature columns and refuses if rows
    appear).
  - `sim_cases` (owner ALL + org-member SELECT via is_org_member),
    `sim_runs` (queue: queued|running|complete|failed|cancelled +
    cancel_requested/attempt/worker_id/heartbeat_at/failure_stage/
    error_message/result_path/...; SELECT-only RLS, zero client
    write policies — service role + RPCs only), partial index on
    status='queued'.
  - RPC `sim_enqueue_run(case_id)`: owner check, deck present,
    bundle ≤ 25 MB, < 2 in-flight, < 10 runs/24 h → inserts queued.
    RPC `sim_cancel_run(run_id)`: queued→cancelled (claim-race
    guarded); running→cancel_requested for the worker to SIGTERM.
    Both revoked from anon.
  - Private `sim` bucket + 4 per-verb owner-path policies (seismic
    model). Paths: deck `{uid}/{case_id}/deck/...` (client JWT),
    results `{uid}/{case_id}/runs/{run_id}/...` (worker writes under
    the OWNER's prefix so the owner-path SELECT serves the SPA).
  - Probes green: RLS on both tables, sim_runs write-policy count 0,
    bucket private, anon execute revoked, unauthenticated enqueue
    rejected.
- Tile seed `20260826201000_seed_reservoir_simulation_studio_tile.sql`
  written, **HELD — apply WITH the S2 prod upload** (the
  material-balance-pro 404 lesson).

## Quotas and caps (v1 constants)

- Enqueue: ≤ 2 in-flight per user, ≤ 10 runs/24 h, deck bundle
  ≤ 25 MB (RPC-enforced; worker re-validates authoritatively).
- Worker (S1): 1 job at a time, flow --threads-per-process=2,
  nice 10, RLIMIT_AS ≈ 5 GiB, wall clock 1800 s (hard max 3600),
  DIMENS active cells ≤ 200k, report steps ≤ 5,000, bundle ≤ 40
  files, output dir ≤ 2 GiB, summary.json ≤ 20 MB.
- Deck security: PYACTION/PYINPUT hard-rejected (embedded-Python RCE
  by design); INCLUDE/GDFILE/IMPORT/PATHS confined to the bundle dir
  via realpath; flow runs credential-free as an unprivileged user.

## S1 — Worker (2026-08-26)

- `worker/sim-worker/`: Dockerfile (FROM openporousmedia/opmreleases,
  OPM Flow **2026.04**, Ubuntu 24.04 base + venv with resdata/httpx/
  pytest, unprivileged simuser; base image defaults to non-root so the
  build steps need an explicit USER root), docker-compose (cpus 2.0,
  mem 6g, pids 256, read-only rootfs + /scratch volume, restart
  unless-stopped, log rotation), `.env.example` (real `.env` is
  untracked by the repo-wide policy and holds the service-role key,
  root 0600).
- `simworker/` package: main poll loop (10 s) + 30 s heartbeat thread
  that also mirrors cancel_requested; atomic PostgREST claim
  (`status=eq.queued` guard); stale sweep (heartbeat > 3 min →
  requeue, attempt-capped at 2 → worker_lost); deck download +
  authoritative validation (deny-list PYACTION/PYINPUT/PATHS,
  realpath-confined INCLUDE/GDFILE/IMPORT, DIMENS/TSTEP caps);
  rlimit-capped flow subprocess in its own process group with scrubbed
  env; resdata → capped summary.json/summary.csv + honest PRT excerpt;
  full failure taxonomy.
- **Tests: 22/22 pass in the worker image on the VPS**, including the
  **SPE1 golden gate**: flow 2026.04 reproduces the checked-in
  opm-tests flow reference (FOPR/FGOR/WBHP:PROD/WBHP:INJ/WOPT:PROD/
  WGPT:PROD at every report step, abs 2e-2 / rel 1e-3 — the
  opm-simulators spe1 regression settings; final WOPT within 0.1%).
  Note: SPE1CASE1's SUMMARY section only writes FOPR/FGOR at field
  level — the golden compares what the deck actually requests.
  Chaos tests: broken deck fails with flow's real error text; a 3 s
  wall clock kills SPE9 as timed_out (group kill verified); cancel
  lands cancelled. Fixtures: SPE1 deck + reference, SPE9 deck
  (ODbL, ATTRIBUTION files in fixtures/).
- **REMAINING for the S1 gate (owner step):** create
  `worker/sim-worker/.env` with the service-role key (the CLI
  classifier rightly blocks the agent from reading it), then
  `docker compose up -d --build` and run the three live gate checks
  in worker/sim-worker/README.md (SPE1 through the queue, garbage
  deck, kill-worker-mid-run requeue). S2 app work can proceed in
  parallel; S2 does not ship until these pass.

## S2 — App (2026-08-26)

- `ReservoirSimulationStudio.jsx` on the Studio kit (VRR exemplar):
  cases in the left rail (most recent auto-opens), Deck tab (SPE1/
  SPE9 template cards from public/sim-templates with ODbL
  ATTRIBUTION, multi-file upload, monospace editor with save-back),
  Runs tab (RPC enqueue with verbatim quota errors, 5 s polling,
  cancel, honest failure_stage/error_message + PRT excerpt viewer),
  Results tab (field small-multiples + per-well multi-line charts on
  the white standard, run metadata, summary.csv download).
- `SimStudioContext` + `src/lib/simService.js` (direct RLS calls +
  the two RPCs; 42P01 friendly message) +
  `src/components/simstudio/` incl. jest-tested resultAdapters.
- Routing: entitlement-gated route, allApps slug, old
  reservoir-simulation-connector redirect repointed to the studio.
- Tests: page smoke (3) + adapters (6); full jest 277 suites / 3,417
  green; build clean (own lazy chunk).
- **Ship gates:** owner completes the S1 live-queue gate first; tile
  migration 20260826201000 applies WITH the prod upload carrying
  this route.

## S3 — Deck generation (2026-08-26)

- **engines/sim domain** (petrolord-engines PR #50, built in a temp
  worktree; vendored at packages/engines/engines/sim): deckFormat
  primitives (fmt/starRepeat), pure keyword emitters — PVTO (with
  undersaturated branches; pvtoRecordsFromTable collapses duplicate
  Rs and closes the last node), PVDG, PVTW, ROCK, DENSITY, SWOF/SGOF
  (+ resamplePc for Leverett-J alignment), layer-cake box grid,
  WELSPECS/COMPDAT/WCONPROD/WCONINJE/TSTEP — and composeDeck
  (RUNSPEC..SCHEDULE, FIELD units, three-phase DISGAS, SUMMARY
  requests exactly the worker's charted vectors). No physics in the
  domain by design; hostile well names and non-monotonic tables
  throw. 18 jest gates pin the emitted text; the SPE1-equivalent
  referenceSpec composes deterministically and **runs to completion
  in flow 2026.04** with SPE1-like physics (ORAT→BHP decline, GOR
  rise under gas injection).
- **Suite builder adapter** `src/utils/simDeckBuilder.js` (+ shim
  simDeckGeneration.js): guided form → spec. PVT from Fluid Studio
  correlations (computePvtTable; unit seams explicit: Rs scf/STB →
  Mscf/STB, Bg rb/scf → RB/Mscf), SCAL from the scal Corey builders
  with the axis-closure rules (SWOF starts at Swc so equilibrated
  water is connate; SGOF ends at 1-Swc so the tables close — the
  SPE1 lesson), optional Leverett-J Pc (power-law jSpec, Swirr=Swc),
  surface densities from API/gas SG. 9 jest gates incl. a checked-in
  fixture pin: the default form's deck IS the flow-acceptance
  fixture (regen via GEN_SIM_FIXTURE=1).
- **Builder tab** in the app (BuilderPanel): model/grid+layers/
  fluid/water-rock/SCAL(+Pc toggle)/equilibration/wells table/
  schedule, live cell count vs the 200k cap, Generate composes and
  attaches the deck to the case (deck_source 'generated') with the
  solved Pb reported; errors listed verbatim. Deck lands on the Deck
  tab for inspection/edit before running.
- **Worker gate** tests/integration/test_generated_deck.py: the
  generated fixture passes the worker's own validation and runs in
  flow with sane physics (FOPR at target, FPR physical). Worker
  pytest 24/24 in the image on the VPS; Suite jest 279 suites /
  3,452 green; build clean.

## S4 — Structure, deviated wells, history (2026-08-27)

Theme: from a synthetic box to a real field model. Three imports feed
the Model Builder; everything still funnels through composeDeck and the
unchanged worker run path.

- **engines/sim S4** (petrolord-engines feat/sim-s4-structure-history,
  stacked on the S3 PR #50; vendored sync in the Suite):
  - `emitGrid`: `grid.tops` per-cell TOPS array (Eclipse natural order,
    I fastest) for structural grids — deeper layers stack conformably,
    the block-centred TOPS rule. `columnInterfaces`/`gridDepthRange`
    depth helpers; EQUIL/RSVD now use the true depth envelope.
  - `wellPath.js`: pure trajectory→connections intersector. Walks a
    densified path polyline through the grid, merges re-entered cells,
    tags each connection with its dominant traversal axis for COMPDAT
    item 13 (X/Y/Z). Frame: grid-local feet, x with I, y with J.
  - `emitSchedule`: connections-list COMPDAT (one record per penetrated
    cell), WCONHIST/WCONINJH/DATES emitters and the period-wise history
    schedule; WELLDIMS sized from max connections.
  - `composeDeck`: `schedule.history` runs producers on observed rates
    (WCONHIST) to the history end date, then the prediction phase
    switches to declared controls + TSTEP; SUMMARY adds injection
    vectors (FWIR/FGIR/FWIT/FGIT, WWIR/WGIR) always and observed-rate
    H vectors when a history is present. 15 new jest gates (33 sim
    total in the engines repo), S3 pins unchanged.
- **Suite importers** (each pure + jest-gated in simS4Import.test.js):
  - `simStructureImport.js`: geo_surfaces grid → per-cell TOPS.
    Bilinear resample at cell centers over the surface extent, null-
    sentinel masking (1e30) with mean-fill for isolated holes (refused
    when holes dominate), m→ft seam, rejects time-domain surfaces and
    elevation-signed grids. Returns dx/dy that cover the extent+stats.
  - `simHistoryImport.js`: rb_production_data cumulatives → interval
    rates (Δcum/Δdays; scf→Mscf seam), allocation split across
    producers, injection cumulatives → WCONINJH entries; clamps
    cumulative dips to zero with a warning; synthesizes monthly dates
    only when NO rows are dated (mixed dating is refused).
  - `simTrajectoryImport.js`: MD/INC/AZI survey text → connections via
    the drilling minimum-curvature kernel (computeWellPath + resample —
    never reimplemented) and wellPath. m→ft seam, KB→datum shift,
    actionable misses.
- **Builder**: Structure card (surface picker → sample → SVG depth
  heatmap + relief stats; grid-edit staleness guard), per-well Deviated
  toggle (survey editor + live "check trajectory" against the current
  grid; connections recomputed at generate time so they can never go
  stale), History card (MBAL case picker, producer allocation
  fractions, prediction-years tail, period preview table). specFromForm
  wires all three; `gridFromForm` shared with the preview.
- **Results**: observed H vectors never chart standalone — they overlay
  their simulated twin as dashed "observed" series (field and per-well),
  the history-match view. New injection charts appear when present.
- **Worker**: FIELD_VECTORS/WELL_VECTORS extended with injection + H
  vectors (absent keys skipped, uploaded decks unaffected). New gate
  tests/integration/test_s4_deck.py: the S4 fixture (structural TOPS +
  deviated lateral + 3-month WCONHIST history + 1y prediction,
  regenerated via GEN_SIM_FIXTURE=1 on simS4Import.test.js) passes
  validation and runs in flow — FOPRH echoes the observed 2000 STB/d,
  FOPR matches it within 1%, FWIR echoes the 2500 STB/d injection, and
  the prediction phase departs from the last observed rate. **Worker
  pytest 26/26 in the image on the VPS.**
- Deliberately NOT in S4: corner-point ZCORN export (block-centred TOPS
  covers dipping structure honestly), 3D grid viz, multi-realization
  (conflicts with the ≤2 in-flight / ≤10 per day quotas).

## Upcoming phases
- S5 ideas (NOT committed): corner-point ZCORN + fault handling,
  3D grid/trajectory viz, multi-realization batches with quota-aware
  scheduling, per-well history import (per-well rate CSVs rather than
  field allocation), LGRs.
