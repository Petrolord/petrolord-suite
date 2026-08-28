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

# Or the same thing through the deploy gate, which is what deploy.sh runs:
docker compose --profile verify run --rm verify
```

pytest is deliberately worker-local (Python); the Suite's jest covers the
JS side. The **SPE1 golden gate** (`tests/integration/test_spe1_golden.py`)
runs flow on the ODbL SPE1CASE1 deck and compares FOPR/FGOR/WBHP/WOPT/WGPT
against the checked-in opm-tests flow reference at every report step
(abs 2e-2 / rel 1e-3, the opm-simulators spe1 regression settings).
Chaos tests cover broken-deck honesty, wall-clock kill and cancel.

## Deploying

    ./deploy.sh

It builds, runs the worker's own test suite including the SPE1 golden inside
the image that is about to serve, and only then starts the worker. It fails
closed: a failing gate leaves the previous worker running and starts nothing.

The gate is also available on its own:

    docker compose --profile verify run --rm verify

`docker compose up -d` still works and deliberately skips the gate. Use it
only when you have just run the gate yourself and know what changed.

## Gate checks on the live deployment (run once after first deploy)

1. Enqueue SPE1 through the app (or insert a queued `sim_runs` row +
   `{uid}/{case_id}/deck/SPE1CASE1.DATA` in the `sim` bucket): run lands
   `complete`, `summary.json` appears under the owner's prefix.
2. Enqueue a garbage deck: run lands `failed/sim_failed` with flow's real
   error text in `error_message`.
3. `docker kill plstudio-sim-worker` mid-run, `docker compose up -d`:
   within ~3 min the stale sweep requeues the run (attempt 2) and it
   completes; a second kill on the same run fails it as `worker_lost`.

## The pinned simulator

The base image is pinned **by digest** in the `Dockerfile`:

    openporousmedia/opmreleases@sha256:18c497f6a918...

That digest is OPM Flow **2026.04**. It is the multi-arch manifest list that
`latest` resolved to on 2026-05-20, covering linux/amd64 and linux/arm64, the
same images published as `2026.04_amd64` and `2026.04_arm64`. Upstream
publishes no plain `2026.04` tag, which is why this is a digest rather than a
version tag.

It is a digest and not `:latest` because a simulator you cannot name is a
simulator you cannot defend. Every run also records the version it was
produced by, in `sim_runs.opm_version` and in `summary.json`, so an answer can
always be traced back to the build that produced it.

Two things enforce the pin rather than describing it:

- The **build** asserts the version. `EXPECTED_OPM_VERSION` is checked against
  `flow --version` in a build stage, so changing the digest without updating
  the expectation fails the build immediately.
- The **deploy** runs the SPE1 golden. See below.

### Bumping the OPM version

1. Find the new digest. For a released tag:
   `docker buildx imagetools inspect openporousmedia/opmreleases:<tag>`
2. Update the `FROM` digest and `EXPECTED_OPM_VERSION` together.
3. `./deploy.sh`, which rebuilds and re-runs the full suite before starting.

If the SPE1 golden drifts beyond tolerance, that is the bump telling you
something real. Regenerate the reference fixtures from the matching opm-tests
revision. Never silently widen the tolerance, and note any widening in the
STATUS doc.

## Failure taxonomy

`sim_runs.failure_stage`: `validate_failed` (deny-list/caps, actionable
message) · `download_failed` · `sim_failed` (flow's PRT error) · `timeout` ·
`oom` · `output_missing` · `output_too_large` · `parse_failed` ·
`upload_failed` · `worker_lost` (crashed twice). `cancelled` is a status,
not a stage.
