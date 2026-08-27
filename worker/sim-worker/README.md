# Sim worker (OPM Flow) — runbook

The pull-worker behind Reservoir Simulation Studio
(docs/scope/ReservoirSimulationStudio-STATUS.md). It polls the `sim_runs`
queue in Supabase with the service-role key, downloads deck bundles from the
private `sim` bucket, runs **OPM Flow** as a resource-capped unprivileged
subprocess, and uploads `summary.json` / `summary.csv` / `prt_excerpt.txt`
under the run owner's storage prefix. No inbound ports; egress to Supabase
only.

## Deploy (studio VPS)

```bash
cd worker/sim-worker
cp .env.example .env          # fill in SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
chmod 0600 .env               # root-owned; the key bypasses RLS project-wide
docker compose up -d --build
docker logs -f plstudio-sim-worker
```

Update: `git pull && docker compose up -d --build`. Stop: `docker compose down`.

**The service-role key** is the project master key — it lives ONLY in this
`.env` (0600, untracked; `.env.example` is the only tracked env file, repo
policy). Rotation: rotate in the Supabase dashboard, update `.env`,
`docker compose up -d`. If the VPS is ever compromised, rotate immediately.

## Caps (env-overridable, defaults in `simworker/config.py`)

One job at a time (single sequential loop). Per run: flow gets 2 threads,
nice 10, ~5 GiB address space, 1800 s wall clock (SIGTERM → 30 s → SIGKILL
on the process group), scrubbed env (no credentials reach the simulator).
Deck caps: 25 MB / 40 files / 10 MB main deck / 200k cells / 5,000 report
steps; PYACTION/PYINPUT/PATHS rejected; INCLUDE confined to the bundle.
Container: cpus 2.0, mem 6g, pids 256, read-only rootfs — sized so the
staging dev server on the same 4-core host stays healthy. Retune via `.env`.

## Tests

```bash
# Unit + integration (integration needs the flow binary → run in the image):
docker build -t plstudio-sim-worker:dev .
docker run --rm -v "$PWD/tests:/app/tests:ro" plstudio-sim-worker:dev \
  python3 -m pytest tests/ -q
```

pytest is deliberately worker-local (Python); the Suite's jest covers the
JS side. The **SPE1 golden gate** (`tests/integration/test_spe1_golden.py`)
runs flow on the ODbL SPE1CASE1 deck and compares FOPR/FGOR/WBHP/WOPT/WGPT
against the checked-in opm-tests flow reference at every report step
(abs 2e-2 / rel 1e-3, the opm-simulators spe1 regression settings).
Chaos tests cover broken-deck honesty, wall-clock kill and cancel.

## Gate checks on the live deployment (run once after first deploy)

1. Enqueue SPE1 through the app (or insert a queued `sim_runs` row +
   `{uid}/{case_id}/deck/SPE1CASE1.DATA` in the `sim` bucket): run lands
   `complete`, `summary.json` appears under the owner's prefix.
2. Enqueue a garbage deck: run lands `failed/sim_failed` with flow's real
   error text in `error_message`.
3. `docker kill plstudio-sim-worker` mid-run, `docker compose up -d`:
   within ~3 min the stale sweep requeues the run (attempt 2) and it
   completes; a second kill on the same run fails it as `worker_lost`.

## Bumping the OPM version

The base image tag is pinned in the `Dockerfile`. To bump: change the tag,
rebuild, re-run the FULL test suite — if the SPE1 golden drifts beyond
tolerance, regenerate the reference fixtures from the matching opm-tests
revision (never silently widen; note any widening in the STATUS doc).

## Failure taxonomy

`sim_runs.failure_stage`: `validate_failed` (deny-list/caps, actionable
message) · `download_failed` · `sim_failed` (flow's PRT error) · `timeout` ·
`oom` · `output_missing` · `output_too_large` · `parse_failed` ·
`upload_failed` · `worker_lost` (crashed twice). `cancelled` is a status,
not a stage.
