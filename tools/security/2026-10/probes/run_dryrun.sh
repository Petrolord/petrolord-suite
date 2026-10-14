#!/usr/bin/env bash
# Dry run of the 2026-10 security migrations on the LINKED database inside ONE
# transaction that always ends in ROLLBACK. Refuses if any migration file has
# its own begin/commit/rollback line (a nested COMMIT would commit to prod).
# Usage (from the Suite checkout linked to the project):
#   bash tools/security/2026-10/probes/run_dryrun.sh [out.csv]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
MIG="$ROOT/supabase/migrations"
FILES=(
  "$MIG/20261014110000_security_00_stopgap_revoke_secdef.sql"
  "$MIG/20261014121000_security_01_platform_admins_and_invitation_rpcs.sql"
  "$MIG/20261014121100_security_02_invitation_lockdown.sql"
  "$MIG/20261014121200_security_03_users_guard_and_seats.sql"
  "$MIG/20261014121300_security_04_rls_off_tables.sql"
  "$MIG/20261014121400_security_05_policy_fixes.sql"
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
  echo "select pg_temp.snapshot('after');"
  cat "$HERE/targeted.sql"
  cat <<'SQL'
select 'probe' kind, persona, probe, result from _p where phase = 'probe'
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
