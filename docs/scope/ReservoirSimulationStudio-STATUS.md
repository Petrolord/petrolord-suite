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

## Upcoming phases

- **S1 — Worker** (`worker/sim-worker/`: opmreleases-based Docker
  image + Python poll loop; pytest; SPE1 golden gate vs the
  opm-tests flow reference ON the VPS before S2 starts).
- **S2 — App** (Studio kit: Cases/Run/Results; 5 s polling; honest
  PRT errors; SPE1/SPE9 templates; tile applied with the upload).
- **S3 — Deck generation** (engines-repo keyword emitters: PVT from
  mbal generatePvtTable, SWOF/SGOF from scal Corey+pcFromJ, box
  grid, WELSPECS/COMPDAT via drilling surveyMath).
- S4 ideas (NOT committed): corner-point grids from geo_surfaces,
  WCONHIST from rb_production_data, 3D grid viz, multi-realization.
