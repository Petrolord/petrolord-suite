#!/usr/bin/env bash
# Rehearse the platform-admin security fix on a throwaway PostgreSQL 16
# container. Local only; it never touches a Supabase project.
#   1. stubs (live shapes, live policies/grants, live function bodies)
#   2. fixtures (admins, orgs, a pending admin invitation, a stranger)
#   3. PHASE live   negative controls: every hole is real in the live shape
#   4. migration 20260919195000 applied TWICE (idempotency), PHASE fixed
#   5. ../verify.sql (the read-only prod report) and ../dryrun-probe.sql
#      (the prod dry-run probe), both rollback-wrapped
#   6. ../rollback.sql, then PHASE live again (the rollback really restores)
# Output is diffed against probes.expected. `--record` rewrites it.
set -euo pipefail
cd "$(dirname "$0")"
MIG=../../../../supabase/migrations/20260919195000_security_platform_admin_source.sql
NAME=platform-admin-scratch-$$
docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=x postgres:16-alpine >/dev/null
trap 'docker stop "$NAME" >/dev/null' EXIT
until docker exec "$NAME" pg_isready -U postgres -q; do sleep 1; done
sleep 2
q () { docker exec -i -e PGOPTIONS="-c client_min_messages=warning" "$NAME" psql -q -v ON_ERROR_STOP=1 -U postgres "$@"; }
p () { docker exec -i -e PGOPTIONS="-c client_min_messages=warning" "$NAME" psql -X -q -U postgres "$@"; }
q < stubs.sql
q < fixtures.sql
OUT=$(mktemp)
p -v PHASE=live < probes.sql > "$OUT" 2>&1 || true
q < "$MIG"; q < "$MIG"
echo "migration applied twice" >> "$OUT"
p -v PHASE=fixed < probes.sql >> "$OUT" 2>&1 || true
{ echo "begin;"; cat ../verify.sql; echo "rollback;"; } | p >> "$OUT" 2>&1 || true
{ echo "begin;"; cat ../dryrun-probe.sql; echo "rollback;"; } | p >> "$OUT" 2>&1 || true
# the rollback script restores the live behaviour (holes open again)
q < ../rollback.sql
echo "rollback applied" >> "$OUT"
p -v PHASE=live < probes.sql >> "$OUT" 2>&1 || true
sed -i -E 's/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/<uuid>/g; s/[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9:.+]+/<ts>/g' "$OUT"
if [ "${1:-}" = "--record" ]; then cp "$OUT" probes.expected; echo "recorded"; exit 0; fi
if diff -u probes.expected "$OUT"; then
  echo "probes match probes.expected"
else
  echo "PROBES DIFFER from probes.expected" >&2; exit 1
fi
