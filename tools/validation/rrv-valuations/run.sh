#!/usr/bin/env bash
# Local scratch-Postgres dry run and pentest for the Risked Reserves
# Valuation table (20261002151500_rrv_valuations.sql). Never points at a
# Supabase database. Needs docker.
#   bash tools/validation/rrv-valuations/run.sh
#
# The scratch database is built from tools/validation/org-sharing/schema.sql
# (the stand-ins and the Geoscience record tables as the live catalog had
# them) with the two organisation sharing migrations applied, as production
# is today. The script then proves:
#   1. the migration and the pentest carry no begin/commit/rollback
#   2. the dry-run statement (migration body and pentest in ONE DO block that
#      always raises) passes on a database WITHOUT the migration and leaves
#      it without the migration
#   3. the migration refuses to apply before 20261002100000
#   4. it applies twice cleanly (idempotent) and changes no other table
#   5. the table, its policies, their roles, grants and triggers are as designed
#   6. pentest.sql passes and, raising its result, leaves nothing behind
#   7. NEGATIVE CONTROL 1: with the guard trigger dropped the pentest FAILS
#   8. NEGATIVE CONTROL 2: with the select policy widened to every signed-in
#      user the pentest FAILS
#   9. NEGATIVE CONTROL 3 (the storage lesson): with a PUBLIC policy on
#      storage.objects that reads rrv_valuations the pentest FAILS on the
#      anon probe, and the migration REFUSES to apply
#  10. what the app does: save, save again, a second tab, account deletion
set -euo pipefail
cd "$(dirname "$0")"; ROOT=../../..
A=$ROOT/supabase/migrations/20261002100000_suite_record_sharing.sql
B=$ROOT/supabase/migrations/20261002110000_geo_wells_team_editing.sql
M=$ROOT/supabase/migrations/20261002151500_rrv_valuations.sql
C=pg-rrv-dry-$$
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
pentest() { docker exec -i $C psql -U postgres -q < pentest.sql 2>&1 | grep -A200 'RRV-VALUATIONS PENTEST' | grep -v '^CONTEXT' | head -60; }
shape() { echo "select (select count(*) from pg_policies) || '/' || (select count(*) from pg_trigger where not tgisinternal) || '/' || (select count(*) from information_schema.columns where table_schema='public') || '/' || (select count(*) from information_schema.tables where table_schema='public')" | Q; }

P < ../org-sharing/schema.sql
OA=00000000-0000-0000-0000-00000000000a; OB=00000000-0000-0000-0000-00000000000b
O=00000000-0000-0000-0000-0000000000a1; CO=00000000-0000-0000-0000-0000000000a2; X=00000000-0000-0000-0000-0000000000b1
echo "insert into auth.users values ('$O'),('$CO'),('$X');
insert into organizations values ('$OA','A'),('$OB','B');
insert into organization_members (organization_id, user_id, full_name, role, status) values
  ('$OA','$O','Owner One','admin','active'),('$OA','$CO','Colleague Two','member','active'),('$OB','$X','Outsider','owner','active');
insert into storage.objects (bucket_id, name) values ('wells','$O/w/logs/a.f32');" | P

echo "=== before 20261002100000 the migration refuses ==="
check "refuses without the sharing rules" "$(docker exec -i $C psql -U postgres -q < "$M" 2>&1 | grep -c 'Apply 20261002100000_suite_record_sharing.sql first')" "1"
check "and created nothing" "$(echo "select coalesce(to_regclass('public.rrv_valuations')::text, 'none')" | Q)" "none"

wrapped "$A" "$B" | P && echo "  the two organisation sharing migrations applied"
# 20261002120000 (the storage fix) on the one registry bucket policy this stub has
echo "alter policy wells_objects_select_own_or_org on storage.objects to authenticated;" | P
check "before the migration an anon select on storage.objects answers" "$(printf '%s\n' 'begin;' 'set local role anon;' 'select count(*) from storage.objects;' 'rollback;' | docker exec -i $C psql -U postgres -tAq 2>&1 | tail -1)" "0"
before=$(shape)
others=$(echo "select md5(string_agg(tablename || policyname || coalesce(qual,'') || coalesce(with_check,'') || roles::text, '|' order by schemaname, tablename, policyname)) from pg_policies where tablename <> 'rrv_valuations' and policyname <> 'suite_record_changes_select_rrv'" | Q)

echo "=== the dry-run statement on a database without the migration ==="
out=$(bash dry-run-sql.sh | docker exec -i $C psql -U postgres -q 2>&1 | grep -A200 'RRV-VALUATIONS PENTEST' | grep -v '^CONTEXT' | head -40); echo "$out" | head -8
check "dry run passes" "$(echo "$out" | grep -c 'RRV-VALUATIONS PENTEST PASS')" "1"
check "dry run is one statement" "$(bash dry-run-sql.sh | grep -c '^\$dryrun\$;$')/$(bash dry-run-sql.sh | grep -c '^do \$')" "1/1"
check "dry run left the database as it was (policies/triggers/columns/tables)" "$(shape)" "$before"
check "dry run left no table, no rows and no registration" "$(echo "select coalesce(to_regclass('public.rrv_valuations')::text, 'none') || '/' || (select count(*) from suite_record_changes) || '/' || (select count(*) from suite_record_tables where table_name = 'rrv_valuations')" | Q)" "none/0/0"

echo "=== apply the migration, twice ==="
P < "$M" && echo "  first apply ok"
after1=$(shape)
P < "$M" && echo "  second apply ok"
check "the second apply changes nothing (policies/triggers/columns/tables)" "$(shape)" "$after1"

echo "=== the table, its policies and grants ==="
t=rrv_valuations
check "columns" "$(echo "select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema='public' and table_name='$t'" | Q)" "id,user_id,prospect_key,rcp_prospect_id,name,valuation,schema_version,app_build,created_at,updated_at,visibility,organization_id,org_access,editing_by,editing_since,editing_expires,version,updated_by,change_note"
check "row level security is on" "$(echo "select relrowsecurity::text from pg_class where oid='public.$t'::regclass" | Q)" "true"
check "the four policies, all to authenticated" "$(echo "select string_agg(policyname||':'||roles::text, ',' order by policyname) from pg_policies where tablename='$t'" | Q)" "${t}_delete_own:{authenticated},${t}_insert_own:{authenticated},${t}_select_own_or_org:{authenticated},${t}_update_own_or_editor:{authenticated}"
check "the policies are word for word those of rcp_prospects (the approved shape)" "$(echo "select bool_and(a.qual is not distinct from replace(b.qual, 'rcp_prospects', 'rrv_valuations') and a.with_check is not distinct from replace(b.with_check, 'rcp_prospects', 'rrv_valuations'))::text || '/' || count(*) from pg_policies a join pg_policies b on b.tablename = 'rcp_prospects' and b.cmd = a.cmd where a.tablename = '$t'" | Q)" "true/4"
check "anon and PUBLIC have no privilege" "$(echo "select count(*) from information_schema.role_table_grants where table_name='$t' and grantee in ('anon','PUBLIC')" | Q)" "0"
check "authenticated has exactly select/insert/update/delete" "$(echo "select string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants where table_name='$t' and grantee='authenticated'" | Q)" "DELETE,INSERT,SELECT,UPDATE"
check "guard and log triggers" "$(echo "select string_agg(tgname, ',' order by tgname) from pg_trigger where tgrelid='public.$t'::regclass and not tgisinternal" | Q)" "suite_record_guard,suite_record_log"
check "one valuation per prospect and user" "$(echo "select pg_get_constraintdef(oid) from pg_constraint where conname='rrv_valuations_user_prospect_key'" | Q)" "UNIQUE (user_id, prospect_key)"
check "foreign keys: the owner and the organisation only (the source prospect is not one)" "$(echo "select string_agg(confrelid::regclass::text || ':' || confdeltype::text, ',' order by confrelid::regclass::text) from pg_constraint where conrelid='public.$t'::regclass and contype='f'" | Q)" "auth.users:c,organizations:n"
check "registered, by visibility" "$(echo "select shared_when || '|' || label from suite_record_tables where table_name='$t'" | Q)" "visibility|risked valuation"
check "the earlier registrations are untouched" "$(echo "select count(*) from suite_record_tables" | Q)" "9"
check "the change log gained one reader policy, to authenticated" "$(echo "select string_agg(policyname || ':' || roles::text, ',' order by policyname) from pg_policies where tablename='suite_record_changes'" | Q)" "suite_record_changes_select_geo_wells:{authenticated},suite_record_changes_select_reader:{authenticated},suite_record_changes_select_rrv:{authenticated}"
check "no policy of any other table changed" "$(echo "select md5(string_agg(tablename || policyname || coalesce(qual,'') || coalesce(with_check,'') || roles::text, '|' order by schemaname, tablename, policyname)) from pg_policies where tablename <> 'rrv_valuations' and policyname <> 'suite_record_changes_select_rrv'" | Q)" "$others"
check "the guard, log and check-out functions are the ones of 20261002100000 (not redefined here)" "$(grep -ciE 'create (or replace )?function' "$M" || true)" "0"
check "no shared table is altered" "$(grep -ciE 'alter table public\.(organizations|users|invitations|organization_members)\b' "$M" || true)" "0"
check "no log rows written by applying" "$(echo "select count(*) from suite_record_changes" | Q)" "0"
check "no PUBLIC or anon policy reads the table" "$(echo "select count(*) from pg_policies where roles && array['public','anon']::name[] and (coalesce(qual,'')||' '||coalesce(with_check,'')) ~ '\mrrv_valuations\M'" | Q)" "0"
check "after the migration an anon select on storage.objects still answers" "$(printf '%s\n' 'begin;' 'set local role anon;' 'select count(*) from storage.objects;' 'rollback;' | docker exec -i $C psql -U postgres -tAq 2>&1 | tail -1)" "0"

echo "=== pentest (always raises, so nothing is kept) ==="
out=$(pentest); echo "$out"
check "pentest passes" "$(echo "$out" | grep -c 'RRV-VALUATIONS PENTEST PASS')" "1"
check "pentest left no rows" "$(echo "select (select count(*) from suite_record_changes)||'/'||(select count(*) from rrv_valuations)" | Q)" "0/0"

echo "=== negative control 1: guard trigger dropped ==="
echo "drop trigger suite_record_guard on rrv_valuations;" | P
out=$(pentest); echo "$out" | head -6
check "pentest FAILS without the guard" "$(echo "$out" | grep -c 'RRV-VALUATIONS PENTEST FAIL')" "1"
P < "$M"
check "re-applying restores it" "$(pentest | grep -c 'RRV-VALUATIONS PENTEST PASS')" "1"

echo "=== negative control 2: the read policy widened to every signed-in user ==="
echo "drop policy rrv_valuations_select_own_or_org on rrv_valuations; create policy rrv_valuations_select_own_or_org on rrv_valuations for select to authenticated using (true);" | P
out=$(pentest); echo "$out" | head -6
check "pentest FAILS with an open read policy" "$(echo "$out" | grep -c 'RRV-VALUATIONS PENTEST FAIL')/$(echo "$out" | grep -c 'colleague cannot read a private record')" "1/1"
P < "$M"
check "re-applying restores it" "$(pentest | grep -c 'RRV-VALUATIONS PENTEST PASS')" "1"

echo "=== negative control 3: a PUBLIC storage policy that reads rrv_valuations (the storage lesson) ==="
echo "create policy \"pt_public_reads_rrv\" on storage.objects for select using (exists (select 1 from public.rrv_valuations v where v.id::text = (storage.foldername(objects.name))[2]));" | P
check "anon select on storage.objects now fails" "$(printf '%s\n' 'begin;' 'set local role anon;' 'select count(*) from storage.objects;' 'rollback;' | docker exec -i $C psql -U postgres -tAq 2>&1 | grep -c 'permission denied for table rrv_valuations')" "1"
out=$(pentest); echo "$out" | head -6
check "pentest FAILS on the anon probe" "$(echo "$out" | grep -c 'RRV-VALUATIONS PENTEST FAIL')/$(echo "$out" | grep -c 'anon select count(\*) from storage.objects still answers')" "1/1"
check "the migration refuses to apply beside such a policy" "$(docker exec -i $C psql -U postgres -q < "$M" 2>&1 | grep -c 'Not applied: a policy granted to PUBLIC or anon reads a table')" "1"
echo "drop policy \"pt_public_reads_rrv\" on storage.objects;" | P
P < "$M"
check "with the policy gone the migration applies and the pentest passes" "$(pentest | grep -c 'RRV-VALUATIONS PENTEST PASS')" "1"

echo "=== what the app does ==="
as() { printf '%s\n' "\\set VERBOSITY verbose" "begin;" "set local role authenticated;" "select set_config('request.jwt.claim.sub', '$1', true);" "$2;" "commit;" \
  | docker exec -i $C psql -U postgres -tAq -v ON_ERROR_STOP=1 2>&1 | grep -v '^$' | tail -1; }
# the whole answer, for a statement that is expected to be refused
asall() { printf '%s\n' "\\set VERBOSITY verbose" "begin;" "set local role authenticated;" "select set_config('request.jwt.claim.sub', '$1', true);" "$2;" "commit;" \
  | docker exec -i $C psql -U postgres -tAq 2>&1; }
check "first save inserts, private, version 1" "$(as $O "insert into rrv_valuations (user_id, prospect_key, rcp_prospect_id, name, valuation, schema_version, app_build) values ('$O','rcp-11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','Ekene North','{\"pg\":0.32}',1,'abc') returning visibility||'|'||version")" "private|1"
check "the next save names its version and is taken" "$(as $O "update rrv_valuations set valuation='{\"pg\":0.3}', version=1, change_note='Valuation saved' where prospect_key like 'rcp-%' returning version")" "2"
check "a second tab still on version 1 is refused" "$(asall $O "update rrv_valuations set valuation='{\"pg\":0.5}', version=1 where prospect_key like 'rcp-%' returning version" | grep -c 'SR001')" "1"
check "the same prospect saved twice from a fresh tab is refused by the key" "$(asall $O "insert into rrv_valuations (user_id, prospect_key, name) values ('$O','rcp-11111111-1111-4111-8111-111111111111','Ekene North')" | grep -c '23505')" "1"
check "the owner shares it for viewing and the colleague reads it" "$(as $O "update rrv_valuations set visibility='organization', organization_id='$OA' where prospect_key like 'rcp-%' returning visibility")/$(as $CO "select count(*) from rrv_valuations")/$(as $X "select count(*) from rrv_valuations")" "organization/1/0"
check "account deletion takes the valuations (the log rows stay)" "$(echo "delete from saved_quickvol_projects; delete from auth.users where id='$O'; select (select count(*) from rrv_valuations)||'/'||(select (count(*) > 0)::text from suite_record_changes where table_name='rrv_valuations' and action='deleted')" | Q | tail -1)" "0/true"

echo "=== $ok passed, $bad failed ==="
[ $bad -eq 0 ]
