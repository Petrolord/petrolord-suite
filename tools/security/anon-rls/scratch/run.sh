#!/usr/bin/env bash
# Rehearse Migrations A and B (anon RLS exposure fix) on a throwaway
# PostgreSQL 16 container: stubs, A twice (idempotency), phase-A probes,
# B twice, phase-B probes, verify.sql; diff probe output against
# probes.expected / probes.expected-errors. Local only; it never touches a
# Supabase project. `--record` rewrites the expected files.
set -euo pipefail
cd "$(dirname "$0")"
M=../../../../supabase/migrations
A=$M/20260919160000_security_a_revoke_anon_rls_off_tables.sql
B=$M/20260919170000_security_b_rls_client_used_tables.sql
NAME=anon-rls-scratch-$$
docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=x postgres:16-alpine >/dev/null
trap 'docker stop "$NAME" >/dev/null' EXIT
until docker exec "$NAME" pg_isready -U postgres -q; do sleep 1; done
sleep 2
q () { docker exec -i -e PGOPTIONS="-c client_min_messages=warning" "$NAME" psql -q -v ON_ERROR_STOP=1 -U postgres "$@"; }
q < stubs.sql
q < "$A"; q < "$A"
echo "migration A applied twice"
OUT=$(mktemp); ERR=$(mktemp)
docker exec -i "$NAME" psql -U postgres < probes.sql > "$OUT" 2> "$ERR" || true
q < "$B"; q < "$B"
echo "migration B applied twice"
docker exec -i "$NAME" psql -U postgres -v PHASE_B=1 < probes.sql >> "$OUT" 2>> "$ERR" || true
# the live verify.sql, in a transaction (its temp tables are on-commit-drop)
{ echo "begin;"; cat ../verify.sql; echo "rollback;"; } | docker exec -i "$NAME" psql -U postgres >> "$OUT" 2>> "$ERR" || true
if [ "${1:-}" = "--record" ]; then
  cp "$OUT" probes.expected; cp "$ERR" probes.expected-errors; echo "recorded"; exit 0
fi
if diff -u probes.expected "$OUT" && diff -u probes.expected-errors "$ERR"; then
  echo "probes match probes.expected"
else
  echo "PROBES DIFFER from probes.expected" >&2
  exit 1
fi
