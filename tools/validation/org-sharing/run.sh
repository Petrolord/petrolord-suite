#!/usr/bin/env bash
# Local scratch-Postgres dry run and pentest for the organisation sharing
# migrations. Never points at a Supabase database. Needs docker.
#   bash tools/validation/org-sharing/run.sh
#
# schema.sql rebuilds the thirteen live tables as they were before the
# migrations (generated from a read-only catalog read, 2026-10-02), with
# rows that look like live ones. The script then proves:
#   1. neither migration nor the pentest carries its own begin/commit/rollback
#   2. both migrations apply twice cleanly inside begin/commit (idempotent)
#   3. existing rows are untouched: private, view, version 1, same owner
#   4. policies, grants and function privileges are what the design says
#   5. pentest.sql passes inside a rolled-back transaction and leaves nothing
#   6. NEGATIVE CONTROL: with the guard trigger dropped the pentest FAILS
#      (so the checks really exercise the trigger, not only the policies)
#   7. a build from before the migration (no version, no sharing columns in
#      its payload) still saves
set -euo pipefail
cd "$(dirname "$0")"; ROOT=../../..
A=$ROOT/supabase/migrations/20261002100000_suite_record_sharing.sql
B=$ROOT/supabase/migrations/20261002110000_geo_wells_team_editing.sql
C=pg-orgshare-dry-$$
IMG=${PG_IMAGE:-postgres:16-alpine}
for f in "$A" "$B" pentest.sql; do
  if grep -qiE '^\s*(begin|commit|rollback)\s*;' "$f"; then echo "FAIL $f carries its own transaction lines"; exit 1; fi
done
echo "PASS no transaction lines in the migrations or the pentest"
docker run -d --rm --name $C -e POSTGRES_PASSWORD=x "$IMG" >/dev/null
trap 'docker stop $C >/dev/null' EXIT
until docker exec $C pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done; sleep 2
P() { docker exec -i -e PGOPTIONS=--client-min-messages=warning $C psql -U postgres -q -v ON_ERROR_STOP=1 "$@"; }
Q() { docker exec -i $C psql -U postgres -tAq "$@"; }
ok=1; bad=0
check() { if [ "$2" = "$3" ]; then echo "PASS $1 ($2)"; ok=$((ok+1)); else echo "FAIL $1: got [$2] want [$3]"; bad=$((bad+1)); fi; }
wrapped() { { echo "begin;"; cat "$@"; echo; echo "commit;"; }; }
pentest() { { echo "begin;"; cat pentest.sql; echo; echo "rollback;"; } | docker exec -i $C psql -U postgres -q 2>&1 | grep -A200 'ORG-SHARING PENTEST' | grep -v '^CONTEXT' | head -60; }

P < schema.sql
OA=00000000-0000-0000-0000-00000000000a; OB=00000000-0000-0000-0000-00000000000b
O=00000000-0000-0000-0000-0000000000a1; CO=00000000-0000-0000-0000-0000000000a2; X=00000000-0000-0000-0000-0000000000b1
echo "insert into auth.users values ('$O'),('$CO'),('$X');
insert into organizations values ('$OA','A'),('$OB','B');
insert into organization_members (organization_id, user_id, full_name, role, status) values
  ('$OA','$O','Owner One','admin','active'),('$OA','$CO','Colleague Two','member','active'),('$OB','$X','Outsider','owner','active');
-- rows as they exist before the migrations
insert into seismic_projects (user_id, name) values ('$O','live project');
insert into em_models (user_id, name) values ('$O','live model');
insert into saved_quickvol_projects (user_id, project_name, inputs_data, created_at) values ('$O','live rcp','{}', now() - interval '30 days');
insert into rcp_prospects (user_id, name) values ('$O','live prospect');
insert into rp_projects (user_id, name) values ('$O','live rp');
insert into geo_correlation_sections (user_id, name) values ('$O','live section');
insert into bf_wells (user_id, name, location_coords) values ('$O','live basin', point(1,2));
insert into geo_wells (id, user_id, name, surface_x, surface_y) values ('00000000-0000-0000-0000-0000000000f1','$O','LIVE-1',1,2);
insert into geo_wells_tops (well_id, name, md_m) values ('00000000-0000-0000-0000-0000000000f1','Top A',100);" | P

echo "=== apply both migrations, twice ==="
wrapped "$A" "$B" | P && echo "  first apply ok"
wrapped "$A" "$B" | P && echo "  second apply ok"

echo "=== existing rows unchanged ==="
for t in seismic_projects em_models saved_quickvol_projects rcp_prospects rp_projects geo_correlation_sections bf_wells; do
  check "$t existing row stays private" "$(echo "select visibility||'|'||org_access||'|'||version||'|'||coalesce(organization_id::text,'none')||'|'||user_id from $t" | Q)" "private|view|1|none|$O"
  check "$t has the four policies" "$(echo "select string_agg(policyname, ',' order by policyname) from pg_policies where tablename='$t' and policyname <> 'Allow admin full access'" | Q)" "${t}_delete_own,${t}_insert_own,${t}_select_own_or_org,${t}_update_own_or_editor"
  check "$t anon has no privilege" "$(echo "select count(*) from information_schema.role_table_grants where table_name='$t' and grantee='anon'" | Q)" "0"
  check "$t authenticated has exactly select/insert/update/delete" "$(echo "select string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants where table_name='$t' and grantee='authenticated'" | Q)" "DELETE,INSERT,SELECT,UPDATE"
done
check "saved_quickvol_projects updated_at backfilled from created_at" "$(echo "select (updated_at = created_at)::text from saved_quickvol_projects" | Q)" "true"
check "geo_wells existing row: view, version 1, not shared" "$(echo "select org_access||'|'||version||'|'||coalesce(organization_id::text,'none') from geo_wells" | Q)" "view|1|none"
check "no log rows written by applying" "$(echo "select count(*) from suite_record_changes" | Q)" "0"
check "change log: anon nothing, authenticated select only" "$(echo "select coalesce(string_agg(grantee||':'||privilege_type, ',' order by grantee, privilege_type),'') from information_schema.role_table_grants where table_name='suite_record_changes' and grantee in ('anon','authenticated')" | Q)" "authenticated:SELECT"
check "table list: no client privilege" "$(echo "select count(*) from information_schema.role_table_grants where table_name='suite_record_tables' and grantee in ('anon','authenticated')" | Q)" "0"
check "check-out functions are SECURITY DEFINER with a fixed search_path" "$(echo "select count(*) from pg_proc where proname in ('suite_record_take','suite_record_renew','suite_record_release','suite_record_lock_row','suite_record_log','suite_record_log_updated','suite_record_child_log') and prosecdef and proconfig::text like '%search_path=public, pg_temp%'" | Q)" "7"
check "guard trigger is SECURITY INVOKER" "$(echo "select prosecdef from pg_proc where proname='suite_record_guard'" | Q)" "f"
check "anon cannot execute take/renew/release" "$(echo "select bool_or(has_function_privilege('anon', oid, 'execute')) from pg_proc where proname in ('suite_record_take','suite_record_renew','suite_record_release')" | Q)" "f"
check "geo_wells children: three writer policies each" "$(echo "select count(*) from pg_policies where tablename like 'geo_wells_%' and policyname like '%_writer'" | Q)" "15"
check "wells bucket: the two owner policies" "$(echo "select count(*) from pg_policies where schemaname='storage' and policyname like 'wells_objects_%_well_owner'" | Q)" "2"

echo "=== pentest (rolled back) ==="
out=$(pentest); echo "$out"
check "pentest passes" "$(echo "$out" | grep -c 'ORG-SHARING PENTEST PASS')" "1"
check "pentest left no rows" "$(echo "select (select count(*) from suite_record_changes)||'/'||(select count(*) from em_models)||'/'||(select count(*) from geo_wells)" | Q)" "0/1/1"

echo "=== negative control: guard trigger dropped ==="
echo "drop trigger suite_record_guard on em_models; drop trigger suite_record_guard on geo_wells;" | P
out=$(pentest); echo "$out" | head -12
check "pentest FAILS without the guard" "$(echo "$out" | grep -c 'ORG-SHARING PENTEST FAIL')" "1"
wrapped "$A" "$B" | P
check "re-applying restores it" "$(pentest | grep -c 'ORG-SHARING PENTEST PASS')" "1"

echo "=== a build from before the migration still saves ==="
as() { printf '%s\n' "\\set VERBOSITY verbose" "begin;" "set local role authenticated;" "select set_config('request.jwt.claim.sub', '$1', true);" "$2;" "commit;" \
  | docker exec -i $C psql -U postgres -tAq -v ON_ERROR_STOP=1 2>&1 | grep -v '^$' | tail -1; }
check "old-build update (no version sent) succeeds" "$(as $O "update em_models set name='renamed by old build', updated_at=now() returning version")" "2"
check "old-build insert succeeds" "$(as $O "insert into rcp_prospects (user_id, name) values ('$O','old build') returning visibility")" "private"
check "old-build well update succeeds" "$(as $O "update geo_wells set td_md_m=2500 returning version")" "2"
check "old-build top insert succeeds" "$(as $O "insert into geo_wells_tops (well_id, name, md_m) values ('00000000-0000-0000-0000-0000000000f1','Top B',200) returning name")" "Top B"
check "account deletion still cascades (log rows stay)" "$(echo "delete from saved_quickvol_projects; delete from auth.users where id='$O'; select (select count(*) from em_models)||'/'||(select count(*) from geo_wells)||'/'||(select (count(*) > 0)::text from suite_record_changes where action='deleted')" | Q | tail -1)" "0/0/true"

echo "=== $ok passed, $bad failed ==="
[ $bad -eq 0 ]
