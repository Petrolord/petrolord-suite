#!/usr/bin/env bash
# Run one wave's schema checks for real against a scratch PostgreSQL 15.
#
# Production writes are blocked for the agent, so this is how the AS
# series proves a migration does what its comments claim. It rebuilds
# the fixture (the anon and authenticated roles, auth.uid() reading
# request.jwt.claims, my_org_id, is_super_admin, is_org_member,
# auth.users and public.users), then the AS1 schema backfill so the
# existing assurance tables are present, then the migrations named on
# the command line, TWICE — the second time proving idempotency — and
# finally the checks file.
#
# Written at AS7, when the third wave in a row needed the same seven
# docker commands. AS3's run-as3-pentest.sh stays as it is: it does
# something this does not, which is run the NEGATIVE CONTROL first
# against the pre-migration posture.
#
# Usage:
#   tools/validation/assurance/scratch/run-checks.sh <checks.sql> <migration.sql>...
#
# Paths are relative to the repo root. Example:
#   tools/validation/assurance/scratch/run-checks.sh \
#     tools/validation/assurance/as7-schema-checks.sql \
#     supabase/migrations/20260917500000_as7_quality_assurance_plan.sql
set -euo pipefail

if [ "$#" -lt 2 ]; then
  sed -n '18,24p' "$0"
  exit 64
fi

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../../../.." && pwd)
CHECKS="$ROOT/$1"; shift
C=${SCRATCH_CONTAINER:-as-scratch}

[ -f "$CHECKS" ] || { echo "no such checks file: $CHECKS" >&2; exit 66; }

docker rm -f "$C" >/dev/null 2>&1 || true
docker run -d --name "$C" -e POSTGRES_PASSWORD=pw postgres:15-alpine >/dev/null
for _ in $(seq 1 40); do docker exec "$C" pg_isready -q && break; sleep 1; done

docker cp "$HERE/fixture.sql" "$C:/fixture.sql" >/dev/null
docker cp "$ROOT/supabase/migrations/20260916099000_as1_assurance_schema_backfill.sql" \
  "$C:/as1-backfill.sql" >/dev/null
docker cp "$CHECKS" "$C:/checks.sql" >/dev/null

docker exec "$C" psql -U postgres -v ON_ERROR_STOP=1 -q -f /fixture.sql 2>/dev/null
docker exec "$C" psql -U postgres -v ON_ERROR_STOP=1 -q -f /as1-backfill.sql 2>/dev/null

i=0
for m in "$@"; do
  i=$((i + 1))
  docker cp "$ROOT/$m" "$C:/m$i.sql" >/dev/null
  echo "-- applying $(basename "$m")"
  docker exec "$C" psql -U postgres -v ON_ERROR_STOP=1 -q -f "/m$i.sql" 2>/dev/null
done
echo "-- re-applying every migration, to prove each one is idempotent"
for n in $(seq 1 $i); do
  docker exec "$C" psql -U postgres -v ON_ERROR_STOP=1 -q -f "/m$n.sql" 2>/dev/null
done
echo

docker exec "$C" psql -U postgres -q -f /checks.sql 2>&1 \
  | grep -vE '^\(|^-+$|^ *$|^SET$|^ROLLBACK$|^SAVEPOINT$|^BEGIN$|^COMMIT$|set_config'

docker rm -f "$C" >/dev/null
