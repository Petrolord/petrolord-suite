#!/usr/bin/env bash
# QI worker tables in projects: dry run of 20261015160000 on the LINKED database in ONE
# repeatable-read transaction that always ends in ROLLBACK.
#   - every persona's row count and visible-id md5 on qi_jobs, qi_datasets and the tables P0 snapshots, before
#     the migration, after it (applied twice: idempotence) and after its rollback
#   - backfill: rows and stamped rows per table
#   - the verify query, then re-apply and the P4 probes
# Usage: bash tools/security/suite-projects/probes/run_qi_dryrun.sh out.csv
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
MIG="$ROOT/supabase/migrations/20261015160000_suite_projects_qi_worker_tables.sql"
RB="$HERE/../rollback/20261015160000.rollback.sql"
V="$HERE/../verify/20261015160000.verify.sql"
for f in "$MIG" "$RB" "$HERE/harness_head.sql" "$HERE/qi_probes.sql"; do
  if grep -qiE '^\s*((begin|commit|rollback|end)\s*(transaction|work)?|start\s+transaction)\s*;' "$f"; then
    echo "REFUSING: $f has a transaction-control line" >&2; exit 1
  fi
done
TABLES="'qi_jobs','qi_datasets','saved_qi_studio_projects','seismic_volumes','seismic_horizons'"
TMP="$(mktemp)"
{
  echo "begin isolation level repeatable read;"
  cat "$HERE/harness_head.sql"
  echo "delete from _snap_tables; insert into _snap_tables select unnest(array[$TABLES]::text[]);"
  echo "delete from _p;"
  echo "select pg_temp.snapshot('before');"
  cat "$MIG"; echo; cat "$MIG"; echo
  echo "select pg_temp.snapshot('after');"
  cat <<SQL
do \$x\$ declare t text; tot bigint; st bigint; begin
  foreach t in array array['qi_jobs','qi_datasets']::text[] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('select count(*), count(suite_project_id) from public.%I', t) into tot, st;
    if tot > 0 then insert into _p values ('backfill', 'counts', t, case when tot = st then 'PASS ' else 'FAIL ' end || 'rows=' || tot || ' stamped=' || st); end if;
  end loop; end \$x\$;
SQL
  printf "insert into _p select 'verify', 'p4', 'row', row_to_json(t)::text from (\n"; grep -v '^--' "$V" | sed 's/;\s*$//'; echo ") t;"
  cat "$RB"; echo
  echo "select pg_temp.snapshot('rolledback');"
  cat "$MIG"; echo
  cat "$HERE/qi_probes.sql"
  cat <<'SQL'
select kind, persona, probe, result from (
select 1 o, 'probe' kind, persona, probe, result from _p where phase = 'probe'
union all select 2, 'changed-after', b.persona, b.probe, b.result || ' -> ' || coalesce(a.result, '(missing)')
  from _p b left join _p a on a.persona = b.persona and a.probe = b.probe and a.phase = 'after'
 where b.phase = 'before' and a.result is distinct from b.result
union all select 3, 'changed-rolledback', b.persona, b.probe, b.result || ' -> ' || coalesce(a.result, '(missing)')
  from _p b left join _p a on a.persona = b.persona and a.probe = b.probe and a.phase = 'rolledback'
 where b.phase = 'before' and a.result is distinct from b.result
union all select 4, 'backfill', persona, probe, result from _p where phase = 'backfill'
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
