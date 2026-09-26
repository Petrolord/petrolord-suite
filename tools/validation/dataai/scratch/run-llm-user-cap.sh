#!/usr/bin/env bash
# Scratch-Postgres check of 20260926120000_d5_dai_llm_user_cap.sql (Data & AI
# D5 follow-on: the personal cap on language-model calls).
#
# Starts a throwaway postgres:16-alpine container, loads fixture.sql, applies
# 20260925200000 (the metering table, as in production) and then the new
# migration, both TWICE (idempotency), runs llm-user-cap-checks.sql, then a
# concurrency probe: 12 parallel reservations for one organization with an
# organization cap of 5 must leave exactly 5 reserved calls, and 12 parallel
# ones by one person with a personal cap of 3 exactly 3. Removes only its own
# container.
#
# Usage: tools/validation/dataai/scratch/run-llm-user-cap.sh
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../../../.." && pwd)
C=${SCRATCH_CONTAINER:-dai-llm-usercap-scratch}
M1=supabase/migrations/20260925200000_d5_dai_llm_calls.sql
M2=supabase/migrations/20260926120000_d5_dai_llm_user_cap.sql

cleanup() { docker rm -f "$C" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup
docker run -d --name "$C" -e POSTGRES_PASSWORD=pw postgres:16-alpine >/dev/null
for _ in $(seq 1 60); do docker exec "$C" pg_isready -q -U postgres && break; sleep 1; done
sleep 2
for _ in $(seq 1 30); do docker exec "$C" psql -U postgres -qtAc 'select 1' >/dev/null 2>&1 && break; sleep 1; done

docker cp "$HERE/fixture.sql" "$C:/fixture.sql" >/dev/null
docker cp "$HERE/llm-user-cap-checks.sql" "$C:/checks.sql" >/dev/null
docker cp "$ROOT/$M1" "$C:/m1.sql" >/dev/null
docker cp "$ROOT/$M2" "$C:/m2.sql" >/dev/null
P() { docker exec -i "$C" psql -U postgres -v ON_ERROR_STOP=1 -q "$@"; }

P -f /fixture.sql
for pass in 1 2; do
  echo "-- pass $pass: $(basename $M1), $(basename $M2)"
  P -f /m1.sql
  P -f /m2.sql
done

echo "-- probes"
P -f /checks.sql 2>&1 | sed -n -e 's/^.*NOTICE:  //p' -e '/ERROR/p'

echo "-- concurrency"
ORG=00000000-0000-4000-8000-0000000000c1
U1=00000000-0000-4000-8000-000000000001
U2=00000000-0000-4000-8000-000000000002
for i in $(seq 1 12); do
  P -c "set role service_role; select public.dai_llm_reserve_call('$ORG', '$U1', 'x', 'm', 5, 100); select pg_sleep(0.05);" >/dev/null &
done
wait
n=$(P -tAc "select count(*) from public.dai_llm_calls where organization_id = '$ORG' and status = 'reserved'")
[ "$n" = 5 ] || { echo "FAIL organization cap under concurrency: $n reserved"; exit 1; }
echo "PASS 12 parallel reservations at organization cap 5 leave exactly 5"
P -c "delete from public.dai_llm_calls where organization_id = '$ORG'" >/dev/null
for i in $(seq 1 12); do
  P -c "set role service_role; select public.dai_llm_reserve_call('$ORG', '$U2', 'x', 'm', 100, 3); select pg_sleep(0.05);" >/dev/null &
done
wait
n=$(P -tAc "select count(*) from public.dai_llm_calls where organization_id = '$ORG' and user_id = '$U2' and status = 'reserved'")
[ "$n" = 3 ] || { echo "FAIL personal cap under concurrency: $n reserved"; exit 1; }
echo "PASS 12 parallel reservations by one person at personal cap 3 leave exactly 3"
echo "ALL PASS"
