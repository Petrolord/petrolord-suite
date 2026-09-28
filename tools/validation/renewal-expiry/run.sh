#!/usr/bin/env bash
# Local scratch-Postgres dry run for 20260929130000 / 20260929130100.
# Never points at a Supabase database. Needs docker. Usage: bash run.sh
set -euo pipefail
cd "$(dirname "$0")"; ROOT=../../..
OLD=$ROOT/supabase/migrations/20260613141000_manual_verify_quote_per_app_seats.sql  # = live definition (byte-compared 2026-09-28)
NEW=$ROOT/supabase/migrations/20260929130000_manual_verify_quote_renewal_expiry.sql
ACL=$ROOT/supabase/migrations/20260929130100_manual_verify_quote_service_role_only.sql
docker run -d --rm --name pg-renewal-dry -e POSTGRES_PASSWORD=x postgres:16 >/dev/null
trap 'docker stop pg-renewal-dry >/dev/null' EXIT
until docker exec pg-renewal-dry pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done; sleep 1
P="docker exec -i pg-renewal-dry psql -U postgres -q -v ON_ERROR_STOP=1"
for db in oldef newdef; do echo "create database $db" | $P; (cat schema.sql "$OLD") | $P -d $db; done
$P -d newdef < "$NEW"; $P -d newdef < "$NEW"      # twice: idempotent
$P -d newdef < "$ACL"; $P -d newdef < "$ACL"
for db in oldef newdef; do echo "=== $db ==="; $P -d $db < scenario.sql 2>/dev/null | grep -E 'PASS|FAIL' | cut -c1-200; done
echo "=== EXECUTE as anon (expect success on oldef, permission denied on newdef) ==="
for db in oldef newdef; do printf '%s: ' $db; echo "set role anon; select manual_verify_quote('QT-RENEW','00000000-0000-0000-0000-00000000000a')->>'status';" | docker exec -i pg-renewal-dry psql -U postgres -d $db -tAq 2>&1 | grep -v NOTICE | tail -1; done
