#!/usr/bin/env bash
# Suite Projects P0: dry run + role pentest + rollback round trip on the LINKED
# database inside ONE transaction that always ends in ROLLBACK. Nothing persists.
# Refuses if any input file has its own transaction-control line (a nested
# COMMIT would commit to production).
#
# Sequence inside the transaction:
#   1. snapshot BEFORE: every persona's row count on every small public table, a
#      storage count, and md5 of visible ids on all registry and child tables
#      (demo, consultant, member, noorg)
#   2. apply the three migrations, then apply them AGAIN (idempotence)
#   3. snapshot AFTER, backfill counts per table and per project
#   4. run the three rollback files; snapshot ROLLEDBACK + catalog fingerprint
#   5. re-apply the migrations and run the role pentest (probes.sql)
# Output rows: probe results, any persona-visible difference (before vs after, and
# before vs rolled back), catalog differences, backfill counts.
# Usage (from a checkout linked to the project):
#   bash tools/security/suite-projects/probes/run_dryrun.sh [out.csv]
#   NEGATIVE=1 bash ... run_dryrun.sh neg.csv   # negative control, expect failures
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
MIG="$ROOT/supabase/migrations"
RB="$HERE/../rollback"
FILES=(
  "$MIG/20261015100000_suite_projects_p0_tables.sql"
  "$MIG/20261015100100_suite_projects_p0_registries.sql"
  "$MIG/20261015100200_suite_projects_p0_backfill.sql"
)
ROLLBACKS=(
  "$RB/20261015100200.rollback.sql"
  "$RB/20261015100100.rollback.sql"
  "$RB/20261015100000.rollback.sql"
)
for f in "${FILES[@]}" "${ROLLBACKS[@]}" "$HERE/harness_head.sql" "$HERE/catalog.sql" "$HERE/backfill_counts.sql" "$HERE/probes.sql"; do
  if grep -qiE '^\s*((begin|commit|rollback|end)\s*(transaction|work)?|start\s+transaction)\s*;' "$f"; then
    echo "REFUSING: $f has a transaction-control line" >&2; exit 1
  fi
done
apply() { for f in "${FILES[@]}"; do echo "-- >>> $(basename "$f")"; cat "$f"; echo; done; }
TMP="$(mktemp)"
{
  echo "begin isolation level repeatable read;   -- one snapshot: live traffic does not show as a difference"
  cat "$HERE/harness_head.sql"
  cat "$HERE/catalog.sql"
  apply
  apply
  echo "select pg_temp.snapshot('after');"
  echo "select pg_temp.catalog('after');"
  cat "$HERE/backfill_counts.sql"
  for f in "${ROLLBACKS[@]}"; do echo "-- >>> $(basename "$f")"; cat "$f"; echo; done
  echo "select pg_temp.snapshot('rolledback');"
  echo "select pg_temp.catalog('rolledback');"
  apply
  if [ "${NEGATIVE:-0}" = 1 ]; then
    # negative control: without the RESTRICTIVE project policies the members-only
    # probes must FAIL (proves the probes exercise the policies)
    cat <<'SQL'
do $$ declare r record; begin
  for r in select tablename, policyname from pg_policies where schemaname = 'public' and policyname like '%\_project\_read' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop; end $$;
SQL
  fi
  # the owner's verification queries, run against the applied state (before the probes add fixtures)
  for v in "$HERE"/../verify/*.verify.sql; do
    printf "insert into _p select 'verify', '%s', 'row', row_to_json(t)::text from (\n" "$(basename "$v")"
    grep -v '^--' "$v" | sed 's/;\s*$//'
    echo ") t;"
  done
  cat "$HERE/probes.sql"
  cat <<'SQL'
select kind, persona, probe, result from (
select 1 o, 'probe' kind, persona, probe, result from _p where phase = 'probe'
union all
select 2, 'changed-after', b.persona, b.probe, b.result || ' -> ' || coalesce(a.result, '(missing)')
  from _p b left join _p a on a.persona = b.persona and a.probe = b.probe and a.phase = 'after'
 where b.phase = 'before' and a.result is distinct from b.result
union all
select 3, 'changed-rolledback', b.persona, b.probe, b.result || ' -> ' || coalesce(a.result, '(missing)')
  from _p b left join _p a on a.persona = b.persona and a.probe = b.probe and a.phase = 'rolledback'
 where b.phase = 'before' and a.result is distinct from b.result
union all
select 4, 'backfill', persona, probe, result from _p where phase = 'backfill'
union all
select 4, 'verify', persona, probe, result from _p where phase = 'verify'
union all
select 5, 'summary', 'all', 'probes', count(*) filter (where result like 'PASS%') || ' pass, ' || count(*) filter (where result like 'FAIL%') || ' fail'
  from _p where phase = 'probe'
union all
select 5, 'summary', 'all', 'snapshot rows compared', (select count(*)::text from _p where phase = 'before')
) x order by o, 2, 3, 4;
SQL
  echo "rollback;"
} > "$TMP"
test "$(head -n1 "$TMP" | cut -c1-34)" = "begin isolation level repeatable r"
test "$(grep -ciE '^\s*(begin|start transaction)\s*(isolation[^;]*)?;' "$TMP")" = 1
test "$(tail -n1 "$TMP")" = "rollback;"
supabase db query --linked -f "$TMP" -o csv > "${1:-/dev/stdout}"
rm -f "$TMP"
