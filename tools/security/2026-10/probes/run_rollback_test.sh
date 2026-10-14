#!/usr/bin/env bash
# Rollback test: applies 00-05 then the generated rollbacks 05..01 inside ONE
# transaction that ends in ROLLBACK, and lists every table count that differs
# from the pre-apply snapshot for any persona (expect none).
# Usage: bash tools/security/2026-10/probes/run_rollback_test.sh [out.csv]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
MIG="$ROOT/supabase/migrations"
FILES=(
  "$MIG/20261014110000_security_00_stopgap_revoke_secdef.sql"
  "$MIG/20261014120000_security_01_platform_admins_and_invitation_rpcs.sql"
  "$MIG/20261014120100_security_02_invitation_lockdown.sql"
  "$MIG/20261014120200_security_03_users_guard_and_seats.sql"
  "$MIG/20261014120300_security_04_rls_off_tables.sql"
  "$MIG/20261014120400_security_05_policy_fixes.sql"
)
for f in "${FILES[@]}" "$HERE/harness_head.sql" "$HERE/targeted.sql"; do
  if grep -qiE '^\s*((begin|commit|rollback)\s*(transaction|work)?|end\s+(transaction|work))\s*;' "$f"; then
    echo "REFUSING: $f has a transaction-control line" >&2; exit 1
  fi
done
TMP="$(mktemp)"
{
  echo "begin;"
  cat "$HERE/harness_head.sql"
  for f in "${FILES[@]}"; do echo "-- >>> $(basename "$f")"; cat "$f"; echo; done
  for r in 05 04 03 02 01; do echo "-- <<< rollback $r"; cat "$HERE/../rollback/$r.rollback.sql"; echo; done
  echo "select pg_temp.snapshot('after');"
  cat <<'SQL'
select 'summary' kind, '' persona, 'rows compared' probe, count(*)::text result from _p where phase = 'after'
union all
select 'changed', b.persona, b.probe, b.result || ' -> ' || a.result
  from _p b join _p a on a.persona = b.persona and a.probe = b.probe and a.phase = 'after'
 where b.phase = 'before' and a.result is distinct from b.result
order by 1 desc, 2, 3;
SQL
  echo "rollback;"
} > "$TMP"
# final guard: exactly one begin and the last line is rollback
test "$(grep -ciE '^\s*begin\s*;' "$TMP")" = 1
test "$(tail -n1 "$TMP")" = "rollback;"
supabase db query --linked -f "$TMP" -o csv > "${1:-/dev/stdout}"
rm -f "$TMP"
