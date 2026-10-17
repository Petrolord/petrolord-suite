#!/usr/bin/env bash
# Guided Journey stage 1: dry run of 20261017100000 on the LINKED database in ONE
# repeatable-read transaction that always ends in ROLLBACK.
#   - every persona's row count and visible-id md5 on organization_members,
#     suite_projects, seismic_volumes and geo_wells: before the migration, after it
#     (applied twice: idempotence) and after its rollback (run twice: safe to repeat)
#   - the verify query (every seeded source table and column exists)
#   - then the migration again and the probes (journey_probes.sql): state, disciplines
#     filtering the apps, validation, privacy, no direct writes, anon refused
# Usage: bash tools/security/journey/probes/run_dryrun.sh out.csv
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
MIG="$ROOT/supabase/migrations/20261017100000_suite_user_journey.sql"
RB="$HERE/../rollback/20261017100000.rollback.sql"
V="$HERE/../verify/20261017100000.verify.sql"
HEAD="$ROOT/tools/security/suite-projects/probes/harness_head.sql"
for f in "$MIG" "$RB" "$V" "$HEAD" "$HERE/journey_probes.sql"; do
  if grep -qiE '^\s*((begin|commit|rollback|end)\s*(transaction|work)?|start\s+transaction)\s*;' "$f"; then
    echo "REFUSING: $f has a transaction-control line" >&2; exit 1
  fi
done
TABLES="'organization_members','suite_projects','seismic_volumes','geo_wells'"
TMP="$(mktemp)"
{
  echo "begin isolation level repeatable read;"
  cat "$HEAD"
  echo "delete from _snap_tables; insert into _snap_tables select unnest(array[$TABLES]::text[]);"
  echo "delete from _p;"
  echo "select pg_temp.snapshot('before');"
  cat "$MIG"; echo; cat "$MIG"; echo
  echo "select pg_temp.snapshot('after');"
  printf "insert into _p select 'verify', 'journey', 'row', row_to_json(t)::text from (\n"; grep -v '^--' "$V" | sed 's/;\s*$//'; echo ") t;"
  cat "$RB"; echo; cat "$RB"; echo
  echo "select pg_temp.snapshot('rolledback');"
  cat "$MIG"; echo
  cat "$HERE/journey_probes.sql"
  cat <<'SQL'
select kind, persona, probe, result from (
select 1 o, 'probe' kind, persona, probe, result from _p where phase = 'probe'
union all select 2, 'changed-after', b.persona, b.probe, b.result || ' -> ' || coalesce(a.result, '(missing)')
  from _p b left join _p a on a.persona = b.persona and a.probe = b.probe and a.phase = 'after'
 where b.phase = 'before' and a.result is distinct from b.result
union all select 3, 'changed-rolledback', b.persona, b.probe, b.result || ' -> ' || coalesce(a.result, '(missing)')
  from _p b left join _p a on a.persona = b.persona and a.probe = b.probe and a.phase = 'rolledback'
 where b.phase = 'before' and a.result is distinct from b.result
union all select 4, 'verify', persona, probe, result from _p where phase = 'verify'
union all select 5, 'summary', 'all', 'probes', count(*) filter (where result like 'PASS%') || ' pass, ' || count(*) filter (where result like 'FAIL%') || ' fail' from _p where phase = 'probe'
union all select 5, 'summary', 'all', 'comparisons', (select count(*)::text from _p where phase = 'before')
) x order by o, 2, 3, 4;
SQL
  echo "rollback;"
} > "$TMP"
test "$(grep -ciE '^\s*(begin|start transaction)\s*(isolation[^;]*)?;' "$TMP")" = 1
test "$(tail -n1 "$TMP")" = "rollback;"
supabase db query --linked -f "$TMP" -o csv > "${1:-/dev/stdout}"
rm -f "$TMP"
