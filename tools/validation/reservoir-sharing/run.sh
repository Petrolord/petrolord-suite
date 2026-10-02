#!/usr/bin/env bash
# Local scratch-Postgres dry run and pentest for the Reservoir sharing
# migration (20261002130000_reservoir_record_sharing.sql). Never points at a
# Supabase database. Needs docker.
#   bash tools/validation/reservoir-sharing/run.sh
#
# The scratch database is built from tools/validation/org-sharing/schema.sql
# (stand-ins and the Geoscience tables) plus schema.sql here (the fifteen
# Reservoir tables as the live catalog had them on 2026-10-02), with the two
# earlier sharing migrations applied. The script then proves:
#   1. the migration and the pentest carry no begin/commit/rollback
#   2. the migration applies twice cleanly (idempotent)
#   3. existing rows are untouched: private, view, version 1, same owner
#   4. policies, their roles, grants and function privileges are as designed
#   5. pentest.sql passes and, raising its result, leaves nothing behind
#   6. the dry-run statement (migration body and pentest in ONE DO block that
#      always raises) passes on a database WITHOUT the migration and leaves
#      it without the migration
#   7. NEGATIVE CONTROL 1: with the guard trigger dropped the pentest FAILS
#   8. NEGATIVE CONTROL 2 (the storage lesson): with a PUBLIC policy on
#      storage.objects that reads sim_cases the pentest FAILS on the anon
#      probe, and the migration REFUSES to apply
#   9. a build from before the migration still saves; the run functions and
#      account deletion still work
set -euo pipefail
cd "$(dirname "$0")"; ROOT=../../..
A=$ROOT/supabase/migrations/20261002100000_suite_record_sharing.sql
B=$ROOT/supabase/migrations/20261002110000_geo_wells_team_editing.sql
M=$ROOT/supabase/migrations/20261002130000_reservoir_record_sharing.sql
C=pg-ressharing-dry-$$
IMG=${PG_IMAGE:-postgres:16-alpine}
for f in "$M" pentest.sql; do
  if grep -qiE '^\s*(begin|commit|rollback)\s*;' "$f"; then echo "FAIL $f carries its own transaction lines"; exit 1; fi
done
echo "PASS no transaction lines in the migration or the pentest"
docker run -d --rm --name $C -e POSTGRES_PASSWORD=x "$IMG" >/dev/null
trap 'docker stop $C >/dev/null' EXIT
until docker exec $C pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done; sleep 2
P() { docker exec -i -e PGOPTIONS=--client-min-messages=warning $C psql -U postgres -q -v ON_ERROR_STOP=1 "$@"; }
Q() { docker exec -i $C psql -U postgres -tAq "$@"; }
ok=1; bad=0
check() { if [ "$2" = "$3" ]; then echo "PASS $1 ($2)"; ok=$((ok+1)); else echo "FAIL $1: got [$2] want [$3]"; bad=$((bad+1)); fi; }
wrapped() { { echo "begin;"; cat "$@"; echo; echo "commit;"; }; }
# the pentest is one statement that always raises: its result is the error text
pentest() { docker exec -i $C psql -U postgres -q < pentest.sql 2>&1 | grep -A200 'RESERVOIR-SHARING PENTEST' | grep -v '^CONTEXT' | head -60; }
TABLES="saved_fluid_studio_projects saved_scal_projects saved_dca_projects saved_scenario_hub_projects saved_well_test_projects saved_waterflood_design_projects saved_vrr_projects saved_rf_projects rb_cases sim_cases"
CHILDREN="rb_production_data rb_run_configs rb_runs rb_results"

P < ../org-sharing/schema.sql
P < schema.sql
OA=00000000-0000-0000-0000-00000000000a; OB=00000000-0000-0000-0000-00000000000b
O=00000000-0000-0000-0000-0000000000a1; CO=00000000-0000-0000-0000-0000000000a2; X=00000000-0000-0000-0000-0000000000b1
CASE=00000000-0000-0000-0000-0000000000c1; CFG=00000000-0000-0000-0000-0000000000c2; SIM=00000000-0000-0000-0000-0000000000d1
echo "insert into auth.users values ('$O'),('$CO'),('$X');
insert into organizations values ('$OA','A'),('$OB','B');
insert into organization_members (organization_id, user_id, full_name, role, status) values
  ('$OA','$O','Owner One','admin','active'),('$OA','$CO','Colleague Two','member','active'),('$OB','$X','Outsider','owner','active');
-- rows as they exist before the migration
insert into saved_fluid_studio_projects (user_id, project_name, inputs_data) values ('$O','live fluid','{}');
insert into saved_scal_projects (user_id, project_name, inputs_data) values ('$O','live scal','{}');
insert into saved_dca_projects (user_id, project_name, inputs_data) values ('$O','live dca','{}');
insert into saved_scenario_hub_projects (user_id, project_name, inputs_data) values ('$O','live hub','{}');
insert into saved_well_test_projects (user_id, project_name, inputs_data) values ('$O','live well test','{}');
insert into saved_waterflood_design_projects (user_id, project_name, inputs_data) values ('$O','live waterflood','{}');
insert into saved_vrr_projects (user_id, project_name, inputs_data) values ('$O','live vrr','{}');
insert into saved_rf_projects (user_id, project_name, inputs_data) values ('$O','live rf','{}');
insert into rb_cases (id, user_id, name) values ('$CASE','$O','live case');
insert into rb_run_configs (id, case_id) values ('$CFG','$CASE');
insert into rb_production_data (case_id, timestep_index, pressure_psia) values ('$CASE',0,3000),('$CASE',1,2900);
insert into sim_cases (id, user_id, name, deck_path, deck_bytes) values ('$SIM','$O','live sim','$O/$SIM/deck/A.DATA',10);
insert into sim_runs (case_id, user_id, status) values ('$SIM','$O','complete');
insert into storage.objects (bucket_id, name) values ('sim','$O/$SIM/deck/A.DATA');" | P
wrapped "$A" "$B" | P && echo "  the two earlier sharing migrations applied"
# 20261002120000 (the storage fix) on the one registry bucket policy this stub
# has: without it the scratch database reproduces the regression of
# 2026-10-02 and every anon query of storage.objects fails on geo_wells
echo "alter policy wells_objects_select_own_or_org on storage.objects to authenticated;" | P
check "before the migration an anon select on storage.objects answers" "$(printf '%s\n' 'begin;' 'set local role anon;' 'select count(*) from storage.objects;' 'rollback;' | docker exec -i $C psql -U postgres -tAq 2>&1 | tail -1)" "0"
before=$(echo "select (select count(*) from pg_policies) || '/' || (select count(*) from pg_trigger where not tgisinternal) || '/' || (select count(*) from information_schema.columns where table_schema='public')" | Q)

echo "=== the dry-run statement on a database without the migration ==="
out=$(bash dry-run-sql.sh | docker exec -i $C psql -U postgres -q 2>&1 | grep -A200 'RESERVOIR-SHARING PENTEST' | grep -v '^CONTEXT' | head -40); echo "$out" | head -8
check "dry run passes" "$(echo "$out" | grep -c 'RESERVOIR-SHARING PENTEST PASS')" "1"
check "dry run is one statement" "$(bash dry-run-sql.sh | grep -c '^\$dryrun\$;$')/$(bash dry-run-sql.sh | grep -c '^do \$')" "1/1"
check "dry run left the database as it was (policies/triggers/columns)" "$(echo "select (select count(*) from pg_policies) || '/' || (select count(*) from pg_trigger where not tgisinternal) || '/' || (select count(*) from information_schema.columns where table_schema='public')" | Q)" "$before"
check "dry run left no rows and no registration" "$(echo "select (select count(*) from suite_record_changes) || '/' || (select count(*) from rb_cases) || '/' || (select count(*) from suite_record_tables where table_name in ('rb_cases','sim_cases'))" | Q)" "0/1/0"

echo "=== apply the migration, twice ==="
P < "$M" && echo "  first apply ok"
P < "$M" && echo "  second apply ok"

echo "=== existing rows unchanged; policies and grants ==="
for t in $TABLES; do
  check "$t existing row stays private" "$(echo "select visibility||'|'||org_access||'|'||version||'|'||coalesce(organization_id::text,'none')||'|'||user_id from $t" | Q)" "private|view|1|none|$O"
  check "$t has the four policies, all to authenticated" "$(echo "select string_agg(policyname||':'||roles::text, ',' order by policyname) from pg_policies where tablename='$t' and policyname <> 'Allow admin full access'" | Q)" "${t}_delete_own:{authenticated},${t}_insert_own:{authenticated},${t}_select_own_or_org:{authenticated},${t}_update_own_or_editor:{authenticated}"
  check "$t anon has no privilege" "$(echo "select count(*) from information_schema.role_table_grants where table_name='$t' and grantee='anon'" | Q)" "0"
  check "$t authenticated has exactly select/insert/update/delete" "$(echo "select string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants where table_name='$t' and grantee='authenticated'" | Q)" "DELETE,INSERT,SELECT,UPDATE"
  check "$t guard and log triggers" "$(echo "select string_agg(tgname, ',' order by tgname) from pg_trigger where tgrelid='public.$t'::regclass and not tgisinternal" | Q)" "suite_record_guard,suite_record_log"
done
for t in $CHILDREN; do
  check "$t four policies through the case, all to authenticated" "$(echo "select string_agg(policyname||':'||roles::text, ',' order by policyname) from pg_policies where tablename='$t'" | Q)" "${t}_delete_writer:{authenticated},${t}_insert_writer:{authenticated},${t}_select_via_case:{authenticated},${t}_update_writer:{authenticated}"
  check "$t anon has no privilege" "$(echo "select count(*) from information_schema.role_table_grants where table_name='$t' and grantee='anon'" | Q)" "0"
done
check "rb_cases keeps org_id and gains organization_id" "$(echo "select count(*) from information_schema.columns where table_name='rb_cases' and column_name in ('org_id','organization_id')" | Q)" "2"
check "rb child rows untouched" "$(echo "select (select count(*) from rb_production_data)||'/'||(select count(*) from rb_run_configs)" | Q)" "2/1"
check "sim_runs: one read policy to authenticated, anon nothing" "$(echo "select (select string_agg(policyname||':'||cmd||':'||roles::text, ',') from pg_policies where tablename='sim_runs')||'|'||(select count(*) from information_schema.role_table_grants where table_name='sim_runs' and grantee='anon')" | Q)" "sim_runs_select_via_case:SELECT:{authenticated}|0"
check "sim bucket: the reader policy is to authenticated" "$(echo "select roles::text from pg_policies where schemaname='storage' and policyname='sim_objects_select_case_reader'" | Q)" "{authenticated}"
check "ten tables registered, all by visibility" "$(echo "select count(*) from suite_record_tables where shared_when='visibility' and table_name = any (string_to_array('$(echo $TABLES | tr ' ' ',')', ','))" | Q)" "10"
check "the earlier registrations are untouched" "$(echo "select count(*) from suite_record_tables" | Q)" "18"
check "no log rows written by applying" "$(echo "select count(*) from suite_record_changes" | Q)" "0"
check "the change log has its three reader policies" "$(echo "select string_agg(policyname, ',' order by policyname) from pg_policies where tablename='suite_record_changes'" | Q)" "suite_record_changes_select_geo_wells,suite_record_changes_select_reader,suite_record_changes_select_reservoir"
check "child log function: SECURITY DEFINER, fixed search_path, no client execute" "$(echo "select prosecdef::text||'|'||(proconfig::text like '%search_path=public, pg_temp%')::text||'|'||has_function_privilege('authenticated', oid, 'execute')::text||'|'||has_function_privilege('anon', oid, 'execute')::text from pg_proc where proname='suite_record_child_log_parent'" | Q)" "true|true|false|false"
check "the guard, log and check-out functions are the ones of 20261002100000 (not redefined here)" "$(grep -ciE 'create (or replace )?function public\.suite_record_(guard|log|log_updated|take|renew|release|lock_row|child_log)\(' "$M" || true)" "0"
check "no PUBLIC or anon policy reads a touched table" "$(echo "select count(*) from pg_policies where roles && array['public','anon']::name[] and (coalesce(qual,'')||' '||coalesce(with_check,'')) ~ '\m(saved_fluid_studio_projects|saved_scal_projects|saved_dca_projects|saved_scenario_hub_projects|saved_well_test_projects|saved_waterflood_design_projects|saved_vrr_projects|saved_rf_projects|rb_cases|rb_production_data|rb_run_configs|rb_runs|rb_results|sim_cases|sim_runs)\M'" | Q)" "0"

echo "=== pentest (always raises, so nothing is kept) ==="
out=$(pentest); echo "$out"
check "pentest passes" "$(echo "$out" | grep -c 'RESERVOIR-SHARING PENTEST PASS')" "1"
check "pentest left no rows" "$(echo "select (select count(*) from suite_record_changes)||'/'||(select count(*) from rb_cases)||'/'||(select count(*) from sim_cases)||'/'||(select count(*) from storage.objects)" | Q)" "0/1/1/1"

echo "=== negative control 1: guard trigger dropped ==="
echo "drop trigger suite_record_guard on saved_dca_projects; drop trigger suite_record_guard on rb_cases;" | P
out=$(pentest); echo "$out" | head -8
check "pentest FAILS without the guard" "$(echo "$out" | grep -c 'RESERVOIR-SHARING PENTEST FAIL')" "1"
P < "$M"
check "re-applying restores it" "$(pentest | grep -c 'RESERVOIR-SHARING PENTEST PASS')" "1"

echo "=== negative control 2: a PUBLIC storage policy that reads sim_cases (the storage lesson) ==="
echo "create policy \"pt_public_reads_sim_cases\" on storage.objects for select using (bucket_id = 'sim' and exists (select 1 from public.sim_cases c where c.id::text = (storage.foldername(objects.name))[2]));" | P
check "anon select on storage.objects now fails" "$(printf '%s\n' 'begin;' 'set local role anon;' 'select count(*) from storage.objects;' 'rollback;' | docker exec -i $C psql -U postgres -tAq 2>&1 | grep -c 'permission denied for table sim_cases')" "1"
out=$(pentest); echo "$out" | head -6
check "pentest FAILS on the anon probe" "$(echo "$out" | grep -c 'RESERVOIR-SHARING PENTEST FAIL')/$(echo "$out" | grep -c 'anon select count(\*) from storage.objects still answers')" "1/1"
check "the migration refuses to apply beside such a policy" "$(docker exec -i $C psql -U postgres -q < "$M" 2>&1 | grep -c 'Not applied: a policy granted to PUBLIC or anon reads a table')" "1"
echo "drop policy \"pt_public_reads_sim_cases\" on storage.objects;" | P
P < "$M"
check "with the policy gone the migration applies and the pentest passes" "$(pentest | grep -c 'RESERVOIR-SHARING PENTEST PASS')" "1"

echo "=== a build from before the migration still saves ==="
as() { printf '%s\n' "\\set VERBOSITY verbose" "begin;" "set local role authenticated;" "select set_config('request.jwt.claim.sub', '$1', true);" "$2;" "commit;" \
  | docker exec -i $C psql -U postgres -tAq -v ON_ERROR_STOP=1 2>&1 | grep -v '^$' | tail -1; }
check "old-build project update (no version sent) succeeds" "$(as $O "update saved_dca_projects set inputs_data='{\"a\":1}', updated_at=now() returning version")" "2"
check "old-build project insert succeeds, private" "$(as $O "insert into saved_well_test_projects (user_id, project_name, inputs_data) values ('$O','old build','{}') returning visibility")" "private"
check "old-build case update succeeds" "$(as $O "update rb_cases set description='edited by an old build' returning version")" "2"
check "old-build production data replace succeeds" "$(as $O "with d as (delete from rb_production_data where case_id='$CASE' returning 1), i as (insert into rb_production_data (case_id, timestep_index, pressure_psia) values ('$CASE',10,3000),('$CASE',11,2950),('$CASE',12,2900) returning 1) select (select count(*) from d)||'/'||(select count(*) from i)")" "2/3"
check "calculate-mbal's writes succeed for the owner" "$(as $O "with r as (insert into rb_runs (case_id, run_config_id, status) values ('$CASE','$CFG','completed') returning id) insert into rb_results (run_id, case_id) select id, '$CASE' from r returning 1")" "1"
check "old-build sim case insert with an organisation stays private" "$(as $O "insert into sim_cases (user_id, organization_id, name) values ('$O','$OA','old build sim') returning visibility")" "private"
check "the colleague does not see that case" "$(as $CO "select count(*) from sim_cases where name='old build sim'")" "0"
check "sim_enqueue_run still queues a run for the owner" "$(as $O "select (public.sim_enqueue_run('$SIM')::text ~ '^[0-9a-f-]{36}\$')::text")" "true"
check "the owner reads own sim objects, the colleague none" "$(as $O "select count(*) from storage.objects where bucket_id='sim'")/$(as $CO "select count(*) from storage.objects where bucket_id='sim'")" "1/0"
check "account deletion still cascades (log rows stay)" "$(echo "delete from saved_quickvol_projects; delete from auth.users where id='$O'; select (select count(*) from saved_dca_projects)||'/'||(select count(*) from rb_cases)||'/'||(select count(*) from rb_production_data)||'/'||(select count(*) from sim_runs)||'/'||(select (count(*) > 0)::text from suite_record_changes where action='deleted')" | Q | tail -1)" "0/0/0/0/true"

echo "=== $ok passed, $bad failed ==="
[ $bad -eq 0 ]
