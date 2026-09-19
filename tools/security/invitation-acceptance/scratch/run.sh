#!/usr/bin/env bash
# Rehearse the invitation-acceptance security fix on a throwaway
# PostgreSQL 16 container. Local only; it never touches a Supabase project.
#   1. stubs (live shapes, live policies, live function bodies)
#   2. PHASE live     negative controls: the holes are real
#   3. stop-gap 20260919180000 twice, PHASE stopgap
#   4. fix 20260919190000 twice (idempotency), PHASE fixed
#   5. ../verify.sql (the read-only prod verification) and
#      ../dryrun-probe.sql (the prod dry-run probe), both rolled back
# stdout/stderr are diffed against probes.expected / probes.expected-errors.
# `--record` rewrites the expected files.
set -euo pipefail
cd "$(dirname "$0")"
M=../../../../supabase/migrations
STOP=$M/20260919180000_security_stopgap_revoke_add_user_to_organization.sql
FIX=$M/20260919190000_security_invitation_acceptance.sql
NAME=invite-scratch-$$
docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=x postgres:16-alpine >/dev/null
trap 'docker stop "$NAME" >/dev/null' EXIT
until docker exec "$NAME" pg_isready -U postgres -q; do sleep 1; done
sleep 2
q () { docker exec -i -e PGOPTIONS="-c client_min_messages=warning" "$NAME" psql -q -v ON_ERROR_STOP=1 -U postgres "$@"; }
p () { docker exec -i -e PGOPTIONS="-c client_min_messages=warning" "$NAME" psql -X -U postgres "$@"; }
q < stubs.sql
OUT=$(mktemp); ERR=$(mktemp)
p -v PHASE=live -v LIVE=1 < probes.sql > "$OUT" 2> "$ERR" || true
q < "$STOP"; q < "$STOP"
echo "stop-gap applied twice"
p -v PHASE=stopgap -v STOPGAP=1 < probes.sql >> "$OUT" 2>> "$ERR" || true
q < "$FIX"; q < "$FIX"
echo "fix applied twice"
p -v PHASE=fixed -v FIXED=1 < probes.sql >> "$OUT" 2>> "$ERR" || true
{ echo "begin;"; cat ../verify.sql; echo "rollback;"; } | p >> "$OUT" 2>> "$ERR" || true
# the prod dry-run probe, rollback-wrapped, against the fixed scratch db
{ echo "begin;"; cat ../dryrun-probe.sql; echo "rollback;"; } | p >> "$OUT" 2>> "$ERR" || true
# uuids and timestamps differ per run
sed -i -E 's/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/<uuid>/g' "$OUT" "$ERR"
if [ "${1:-}" = "--record" ]; then
  cp "$OUT" probes.expected; cp "$ERR" probes.expected-errors; echo "recorded"; exit 0
fi
if diff -u probes.expected "$OUT" && diff -u probes.expected-errors "$ERR"; then
  echo "probes match probes.expected"
else
  echo "PROBES DIFFER from probes.expected" >&2
  exit 1
fi
