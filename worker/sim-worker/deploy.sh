#!/usr/bin/env bash
# Deploy the sim worker, gated on the SPE1 golden.
#
# The simulator is pinned by digest in the Dockerfile. This script makes the
# validation that justifies the pin an actual precondition of starting, rather
# than a step in a README that someone is trusted to have run. It fails closed.
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "No .env here. Copy the template and fill in the Supabase service credentials first." >&2
  exit 1
fi

echo "==> Building (the build asserts the pinned OPM version)"
docker compose build

echo "==> Running the deploy gate: worker test suite including the SPE1 golden"
if ! docker compose --profile verify run --rm verify; then
  echo >&2
  echo "GATE FAILED. The worker was NOT started." >&2
  echo "If you have just bumped the pinned digest, the SPE1 golden drifting is" >&2
  echo "the expected signal. Regenerate the reference fixtures from the matching" >&2
  echo "opm-tests revision rather than widening the tolerance." >&2
  exit 1
fi

echo "==> Gate passed. Starting the worker"
docker compose up -d

echo "==> Running. Version actually in service:"
docker compose logs --tail 20 sim-worker 2>/dev/null | grep -i "starting (opm:" || \
  echo "    (no startup line yet; check 'docker compose logs -f sim-worker')"
