#!/usr/bin/env bash
# Local scratch-Postgres dry run for 20260929130000 (and 20260929130100).
# Never points at a Supabase database. Needs docker. Usage: bash run.sh
#   oldef  = the live manual_verify_quote (20260613141000, byte-compared 2026-09-28)
#            + a model of the origin/main finalizers (finalizers_live.sql)
#   newdef = 20260929130100 + 20260929130000 (each applied twice)
#            + a model of this branch's finalizers (finalizers_new.sql)
# The finalizer models are SQL restatements of the edge functions; the SQL under
# test (manual_verify_quote) is the real migration. The TypeScript side is
# covered by supabase/functions/_shared/__tests__/renewal-provisioning.test.ts.
set -euo pipefail
cd "$(dirname "$0")"; ROOT=../../..
OLD=$ROOT/supabase/migrations/20260613141000_manual_verify_quote_per_app_seats.sql
NEW=$ROOT/supabase/migrations/20260929130000_manual_verify_quote_renewal_expiry.sql
ACL=$ROOT/supabase/migrations/20260929130100_manual_verify_quote_service_role_only.sql
C=pg-renewal-dry
docker run -d --rm --name $C -e POSTGRES_PASSWORD=x postgres:16 >/dev/null
trap 'docker stop $C >/dev/null' EXIT
until docker exec $C pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done; sleep 1
P="docker exec -i $C psql -U postgres -q -v ON_ERROR_STOP=1"
for db in oldef newdef; do echo "create database $db" | $P; cat schema.sql finalizers_common.sql | $P -d $db; $P -d $db < "$OLD"; done
$P -d oldef < finalizers_live.sql
$P -d newdef < "$ACL"                                  # applied in production 2026-09-28
$P -d newdef < "$NEW" 2>/dev/null; $P -d newdef < "$NEW" 2>/dev/null   # twice: idempotent
$P -d newdef < finalizers_new.sql
for db in oldef newdef; do echo "=== $db ==="; $P -d $db < scenario.sql 2>/dev/null | grep -E 'PASS|FAIL' | cut -c1-220; done
echo "=== EXECUTE as anon / authenticated (expect permission denied on newdef, both forms) ==="
for db in oldef newdef; do for sig in "'Q1',org(1)" "'Q1',org(1),now()"; do for role in anon authenticated; do
  printf '%s %s manual_verify_quote(%s): ' $db $role "$sig"
  echo "grant execute on function org(int) to $role; set role $role; select manual_verify_quote($sig)->>'status';" | docker exec -i $C psql -U postgres -d $db -tAq 2>&1 | grep -v NOTICE | tail -1
done; done; done
echo "=== ACLs on newdef ==="
echo "select p.oid::regprocedure, p.proacl from pg_proc p where proname='manual_verify_quote' order by 1" | docker exec -i $C psql -U postgres -d newdef -tA
