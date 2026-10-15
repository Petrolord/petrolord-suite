#!/usr/bin/env bash
# QI worker tables in projects, AFTER 20261015160000 is applied: the probes on the
# live database in ONE transaction that always ends in ROLLBACK (nothing persists).
# Usage: bash tools/security/suite-projects/probes/run_qi_liveprobes.sh out.csv
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
for f in "$HERE/harness_head.sql" "$HERE/qi_probes.sql"; do
  if grep -qiE '^\s*((begin|commit|rollback|end)\s*(transaction|work)?|start\s+transaction)\s*;' "$f"; then
    echo "REFUSING: $f has a transaction-control line" >&2; exit 1
  fi
done
TMP="$(mktemp)"
{
  echo "begin isolation level repeatable read;"
  cat "$HERE/harness_head.sql"
  cat "$HERE/qi_probes.sql"
  echo "select persona, probe, result from _p where phase = 'probe' union all select 'all', 'summary', count(*) filter (where result like 'PASS%') || ' pass, ' || count(*) filter (where result like 'FAIL%') || ' fail' from _p where phase = 'probe' order by 1, 2;"
  echo "rollback;"
} > "$TMP"
test "$(tail -n1 "$TMP")" = "rollback;"
supabase db query --linked -f "$TMP" -o csv > "${1:-/dev/stdout}"
rm -f "$TMP"
