#!/usr/bin/env bash
# Targeted probes against the LIVE database as it is (no migration applied),
# inside ONE transaction that always ends in ROLLBACK (probe inserts are
# discarded). Use after the owner applies the migrations.
# Usage (from the Suite checkout linked to the project): bash run_liveprobes.sh [out.csv]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
TMP="$(mktemp)"
{
  echo "begin;"
  grep -v "^select pg_temp.snapshot('before');" "$HERE/harness_head.sql"
  cat "$HERE/targeted.sql"
  echo "select persona, probe, result from _p where phase = 'probe' order by 1, 2;"
  echo "rollback;"
} > "$TMP"
test "$(grep -ciE '^\s*(begin|commit)\s*;' "$TMP")" = 1
test "$(tail -n1 "$TMP")" = "rollback;"
supabase db query --linked -f "$TMP" -o csv > "${1:-/dev/stdout}"
rm -f "$TMP"
