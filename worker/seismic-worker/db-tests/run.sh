#!/usr/bin/env bash
# Applies every qi_* migration to a throwaway Postgres (with stand-ins for
# Supabase's auth.uid(), roles and organizations) and runs the behaviour
# checks: RLS, caps, claim exclusivity, heartbeat ownership, cancel, sweep.
# Needs Docker. Exits non-zero on the first failed check.
set -euo pipefail
cd "$(dirname "$0")"
NAME=qi-jobs-db-test-$$
docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=t postgres:16-alpine >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1' EXIT
until docker exec "$NAME" pg_isready -U postgres -q 2>/dev/null; do sleep 1; done; sleep 2
docker cp stubs.sql "$NAME":/stubs.sql; docker cp behaviour.sql "$NAME":/b.sql
# every qi_* migration, in filename order
cat $(ls ../../../supabase/migrations/*_qi_*.sql | sort) > /tmp/qi-migs-$$.sql; docker cp /tmp/qi-migs-$$.sql "$NAME":/mig.sql; rm -f /tmp/qi-migs-$$.sql
docker exec "$NAME" psql -q -v ON_ERROR_STOP=1 -U postgres -f /stubs.sql
docker exec "$NAME" psql -q -v ON_ERROR_STOP=1 -U postgres -f /mig.sql 2>/dev/null
docker exec "$NAME" psql -q -v ON_ERROR_STOP=1 -U postgres -f /mig.sql 2>/dev/null   # idempotent re-apply
OUT=$(docker exec "$NAME" psql -q -U postgres -f /b.sql 2>&1 || true)
echo "$OUT" | grep -E "NOTICE:  ok|FAIL|ERROR|ALL BEHAVIOUR" | sed 's/.*NOTICE:  //'
echo "$OUT" | grep -q "ALL BEHAVIOUR CHECKS PASSED" || { echo "DB CHECKS FAILED" >&2; exit 1; }
