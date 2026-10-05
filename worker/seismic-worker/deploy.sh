#!/usr/bin/env bash
# Deploy the seismic worker to seismic-worker.petrolord.com, gated.
# Run from a checkout on the studio VPS:  worker/seismic-worker/deploy.sh [git-ref]
#   1. jest suite for the worker, and db-tests (qi_jobs behaviour on real Postgres)
#   2. ships `git archive <ref>` of the worker + packages/engines to the host
#   3. builds there, runs the in-image selfcheck, and only then starts it
# Fails closed at every step. The host keeps its own .env (never shipped).
set -euo pipefail
HOST=${SEISMIC_WORKER_HOST:-root@191.215.43.115}
REF=${1:-HEAD}
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
SHA=$(git rev-parse --short=9 "$REF")
ENG=$(node -e "const v=require('./packages/engines/VENDOR.json');console.log(String(v.canonical&&v.canonical.commit||'unknown').slice(0,9))" 2>/dev/null || echo unknown)
ENGINE_COMMIT="suite-${SHA}+engines-${ENG}"

echo "==> Gate 1: worker jest suite"
npx jest worker/seismic-worker --silent
echo "==> Gate 2: qi_jobs behaviour on real Postgres"
worker/seismic-worker/db-tests/run.sh | tail -1

echo "==> Shipping ${SHA} (${ENGINE_COMMIT}) to ${HOST}"
git archive --format=tar "$REF" worker/seismic-worker packages/engines | \
  ssh -o BatchMode=yes "$HOST" 'set -e; D=/opt/seismic-worker/worker; mkdir -p $D; rm -rf $D/src-tree.new; mkdir -p $D/src-tree.new; tar -x -C $D/src-tree.new; rm -rf $D/src-tree; mv $D/src-tree.new $D/src-tree; cp $D/src-tree/worker/seismic-worker/docker-compose.yml $D/docker-compose.yml'

ssh -o BatchMode=yes "$HOST" ENGINE_COMMIT="$ENGINE_COMMIT" 'bash -s' <<'REMOTE'
set -euo pipefail
cd /opt/seismic-worker/worker
[ -f .env ] || { echo "No .env on the host (see .env.example). Worker NOT started." >&2; exit 1; }
export ENGINE_COMMIT
echo "==> Building on host"
docker compose build --quiet
echo "==> Gate 3: in-image selfcheck"
if ! docker compose --profile verify run --rm selfcheck; then
  echo "GATE FAILED: the selfcheck did not pass inside the new image. Worker NOT restarted." >&2
  exit 1
fi
echo "==> Starting"
docker compose up -d seismic-worker
sleep 5
docker compose logs --tail 5 seismic-worker
REMOTE
echo "==> Deployed ${ENGINE_COMMIT}"
