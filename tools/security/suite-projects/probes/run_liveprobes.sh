#!/usr/bin/env bash
# Suite Projects P0: live checks AFTER the owner's apply, each in ONE
# transaction that always ends in ROLLBACK (nothing persists).
#   A) role pentest (probes.sql) and the verification queries against the applied state
#   B) access equivalence: every persona's visible rows (counts + md5 of ids on
#      every registry and child table, storage count) as they are now, against the
#      same with the 36 P0 RESTRICTIVE policies dropped, i.e. pre-P0 access.
#      While no project is members-only the two must be identical.
#   D) P3: apply 20261015120000 (well names per project) inside the
#      transaction, run its verify query and p3_names.sql, then roll back.
#   F) P4 after apply: every persona's view of the 77 P4 tables now against
#      the same with the P4 RESTRICTIVE policies dropped (must be identical).
#   G) P4 after apply: p4_probes.sql.
#   E) P3 roles: membership and roles per role (p3_roles.sql).
#   C) P2 gate: a project settings change leaves stored data byte-identical
#      (p2_settings.sql), and only the project's managers can change settings.
# Usage: bash tools/security/suite-projects/probes/run_liveprobes.sh A|B out.csv
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
MODE="${1:?A, B, C, D, E, F or G}"; OUT="${2:-/dev/stdout}"
P3MIG="$HERE/../../../../supabase/migrations/20261015120000_geo_wells_name_unique_per_project.sql"
for f in "$HERE/harness_head.sql" "$HERE/probes.sql" "$HERE/p2_settings.sql" "$HERE/p3_names.sql" "$HERE/p3_roles.sql" "$HERE/p4_probes.sql" "$P3MIG"; do
  if grep -qiE '^\s*((begin|commit|rollback|end)\s*(transaction|work)?|start\s+transaction)\s*;' "$f"; then
    echo "REFUSING: $f has a transaction-control line" >&2; exit 1
  fi
done
TMP="$(mktemp)"
{
  echo "begin isolation level repeatable read;"
  cat "$HERE/harness_head.sql"
  if [ "$MODE" = F ]; then
    P4MIG="$HERE/../../../../supabase/migrations/20261015130000_suite_projects_p4_app_tables.sql"
    T=$(grep -oE "'[a-z_]+'" "$P4MIG" | head -n 77 | tr '\n' ',' | sed 's/,$//')
    echo "delete from _snap_tables; insert into _snap_tables select unnest(array[$T]::text[]); delete from _p;"
    echo "select pg_temp.snapshot('before');"
    cat <<SQL
do \$x\$ declare r record; begin
  for r in select tablename, policyname from pg_policies where schemaname = 'public' and permissive = 'RESTRICTIVE'
             and policyname ~ '_project_(read|insert|update|delete)\$' and tablename = any (array[$T]::text[]) loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop; end \$x\$;
SQL
    echo "select pg_temp.snapshot('after');"
    cat <<'SQL'
select kind, persona, probe, result from (
select 1 o, 'probe' kind, persona, probe, result from _p where phase = 'probe'
union all select 2, 'changed', b.persona, b.probe, b.result || ' -> ' || coalesce(a.result, '(missing)')
  from _p b left join _p a on a.persona = b.persona and a.probe = b.probe and a.phase = 'after'
 where b.phase = 'before' and a.result is distinct from b.result
union all select 3, 'summary', 'all', 'probes', count(*) filter (where result like 'PASS%') || ' pass, ' || count(*) filter (where result like 'FAIL%') || ' fail' from _p where phase = 'probe'
union all select 3, 'summary', 'all', 'comparisons', (select count(*)::text from _p where phase = 'before')
) x order by o, 2, 3, 4;
SQL
  elif [ "$MODE" = G ]; then
    cat "$HERE/p4_probes.sql"
    cat <<'SQL'
select kind, persona, probe, result from (
select 1 o, 'probe' kind, persona, probe, result from _p where phase = 'probe'
union all select 2, 'summary', 'all', 'probes', count(*) filter (where result like 'PASS%') || ' pass, ' || count(*) filter (where result like 'FAIL%') || ' fail' from _p where phase = 'probe'
) x order by o, 2, 3, 4;
SQL
  elif [ "$MODE" = E ]; then
    cat "$HERE/p3_roles.sql"
    cat <<'SQL'
select kind, persona, probe, result from (
select 1 o, 'probe' kind, persona, probe, result from _p where phase = 'probe'
union all select 2, 'summary', 'all', 'probes', count(*) filter (where result like 'PASS%') || ' pass, ' || count(*) filter (where result like 'FAIL%') || ' fail'
  from _p where phase = 'probe') x order by o, 2, 3, 4;
SQL
  elif [ "$MODE" = D ]; then
    # NEGATIVE=1: without the migration "same name in project B" must fail
    [ "${NEGATIVE:-0}" = 1 ] || cat "$P3MIG"
    v="$HERE/../verify/20261015120000.verify.sql"
    printf "insert into _p select 'probe', 'verify', 'index', row_to_json(t)::text from (\n"
    grep -v '^--' "$v" | sed 's/;\s*$//'
    echo ") t;"
    cat "$HERE/p3_names.sql"
    cat <<'SQL'
select kind, persona, probe, result from (
select 1 o, 'probe' kind, persona, probe, result from _p where phase = 'probe'
union all select 2, 'summary', 'all', 'probes', count(*) filter (where result like 'PASS%') || ' pass, ' || count(*) filter (where result like 'FAIL%') || ' fail'
  from _p where phase = 'probe') x order by o, 2, 3, 4;
SQL
  elif [ "$MODE" = C ]; then
    cat "$HERE/p2_settings.sql"
    cat <<'SQL'
select kind, persona, probe, result from (
select 1 o, 'probe' kind, persona, probe, result from _p where phase = 'probe'
union all select 2, 'summary', 'all', 'probes', count(*) filter (where result like 'PASS%') || ' pass, ' || count(*) filter (where result like 'FAIL%') || ' fail'
  from _p where phase = 'probe') x order by o, 2, 3, 4;
SQL
  elif [ "$MODE" = A ]; then
    for v in "$HERE"/../verify/*.verify.sql; do
      printf "insert into _p select 'verify', '%s', 'row', row_to_json(t)::text from (\n" "$(basename "$v")"
      grep -v '^--' "$v" | sed 's/;\s*$//'
      echo ") t;"
    done
    cat "$HERE/probes.sql"
    cat <<'SQL'
select kind, persona, probe, result from (
select 1 o, 'probe' kind, persona, probe, result from _p where phase = 'probe'
union all select 2, 'verify', persona, probe, result from _p where phase = 'verify'
union all select 3, 'summary', 'all', 'probes', count(*) filter (where result like 'PASS%') || ' pass, ' || count(*) filter (where result like 'FAIL%') || ' fail'
  from _p where phase = 'probe') x order by o, 2, 3, 4;
SQL
  else
    cat <<'SQL'
do $$ declare r record; begin
  for r in select tablename, policyname from pg_policies where schemaname = 'public' and permissive = 'RESTRICTIVE'
             and policyname ~ '_project_(read|insert|update|delete)$' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop; end $$;
select pg_temp.snapshot('after');
select kind, persona, probe, result from (
select 1 o, 'changed' kind, b.persona, b.probe, b.result || ' -> ' || coalesce(a.result, '(missing)') result
  from _p b left join _p a on a.persona = b.persona and a.probe = b.probe and a.phase = 'after'
 where b.phase = 'before' and a.result is distinct from b.result
union all select 2, 'summary', 'all', 'comparisons', count(*)::text from _p where phase = 'before'
union all select 2, 'summary', p.persona, 'demo-style ids compared', count(*)::text from _p p where phase = 'before' and probe like 'ids:%' group by p.persona
) x order by o, 2, 3;
SQL
  fi
  echo "rollback;"
} > "$TMP"
test "$(grep -ciE '^\s*(begin|start transaction)\s*(isolation[^;]*)?;' "$TMP")" = 1
test "$(tail -n1 "$TMP")" = "rollback;"
supabase db query --linked -f "$TMP" -o csv > "$OUT"
rm -f "$TMP"
