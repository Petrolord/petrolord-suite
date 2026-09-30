#!/usr/bin/env bash
# Local scratch-Postgres dry run and RLS pentest for
# 20260930210000_suite_unit_settings.sql. Never points at a Supabase
# database. Needs docker. Usage: bash run.sh
# Proves: the migration applies twice cleanly inside begin/commit; RLS is
# on with 4 policies; anon has no privilege; organisation rows are read by
# members only and written by admins only; a user row belongs to that user
# alone; one row per organisation and per user; the scope/id check and the
# profile shape check refuse bad rows; the touch trigger pins scope, org and
# user and stamps the editor; deleting the editor's account keeps the row.
set -euo pipefail
cd "$(dirname "$0")"; ROOT=../../..
M=$ROOT/supabase/migrations/20260930210000_suite_unit_settings.sql
C=pg-units-dry-$$
if grep -qiE '^\s*(begin|commit)\s*;' "$M"; then echo "FAIL migration carries its own begin/commit"; exit 1; fi
docker run -d --rm --name $C -e POSTGRES_PASSWORD=x postgres:16-alpine >/dev/null
trap 'docker stop $C >/dev/null' EXIT
until docker exec $C pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done; sleep 2
P() { docker exec -i $C psql -U postgres -q -v ON_ERROR_STOP=1 "$@"; }
Q() { docker exec -i $C psql -U postgres -tAq "$@"; }
wrapped() { { echo "begin;"; cat "$M"; echo; echo "commit;"; }; }
ok=0; bad=0
check() { if [ "$2" = "$3" ]; then echo "PASS $1 ($2)"; ok=$((ok+1)); else echo "FAIL $1: got [$2] want [$3]"; bad=$((bad+1)); fi; }
# as <uid|anon> <sql>: run one statement under a role with the JWT sub set; prints result or ERR:<sqlstate>
as() {
  local who=$1; shift
  local role=authenticated; [ "$who" = anon ] && role=anon && who=''
  local out
  out=$(printf '%s\n' "\\set VERBOSITY verbose" "begin;" "set local role $role;" "select set_config('request.jwt.claim.sub', '$who', true);" "$1;" "commit;" \
    | docker exec -i $C psql -U postgres -tAq -v ON_ERROR_STOP=1 2>&1 || true)
  if echo "$out" | grep -qE '^ERROR'; then echo "$out" | grep -E '^ERROR' | head -1 | sed -E 's/^ERROR:  ([0-9A-Z]{5}):.*/ERR:\1/'
  else echo "$out" | grep -v '^$' | tail -1; fi
}
P < schema.sql
OA=00000000-0000-0000-0000-00000000000a; OB=00000000-0000-0000-0000-00000000000b
ADM=00000000-0000-0000-0000-0000000000a1; MEM=00000000-0000-0000-0000-0000000000a2; OUT=00000000-0000-0000-0000-0000000000b1
echo "insert into auth.users values ('$ADM'),('$MEM'),('$OUT');
insert into organizations values ('$OA','A'),('$OB','B');
insert into organization_members values ('$OA','$ADM','admin','active'),('$OA','$MEM','member','active'),('$OB','$OUT','owner','active');" | P

echo "=== 1. apply twice ==="
wrapped | P && echo "  first apply ok"
wrapped | P && echo "  second apply ok"
check "RLS on" "$(echo "select relrowsecurity from pg_class where relname='suite_unit_settings'" | Q)" "t"
check "4 policies" "$(echo "select count(*) from pg_policies where tablename='suite_unit_settings'" | Q)" "4"
check "anon has no privilege" "$(echo "select count(*) from information_schema.role_table_grants where table_name='suite_unit_settings' and grantee='anon'" | Q)" "0"
check "authenticated has exactly select/insert/update/delete" "$(echo "select string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants where table_name='suite_unit_settings' and grantee='authenticated'" | Q)" "DELETE,INSERT,SELECT,UPDATE"

PF="'{\"preset\":\"metric\",\"units\":{},\"version\":1}'::jsonb"
PO="'{\"preset\":\"oilfield\",\"units\":{\"pressure\":\"bar\"},\"version\":1}'::jsonb"
echo "=== 2. organisation row: admins write, members read ==="
check "member cannot insert the org default" "$(as $MEM "insert into suite_unit_settings(scope, organization_id, profile) values ('organization','$OA',$PF)")" "ERR:42501"
check "admin inserts the org default" "$(as $ADM "insert into suite_unit_settings(scope, organization_id, profile) values ('organization','$OA',$PF) returning scope")" "organization"
check "second org row refused (one per org)" "$(as $ADM "insert into suite_unit_settings(scope, organization_id, profile) values ('organization','$OA',$PF)")" "ERR:23505"
check "member reads the org default" "$(as $MEM "select profile->>'preset' from suite_unit_settings where scope='organization'")" "metric"
check "outsider cannot read it" "$(as $OUT "select count(*) from suite_unit_settings where organization_id='$OA'")" "0"
check "anon cannot read" "$(as anon "select count(*) from suite_unit_settings")" "ERR:42501"
check "member update touches no row" "$(as $MEM "with u as (update suite_unit_settings set profile=$PO where organization_id='$OA' returning 1) select count(*) from u")" "0"
check "member delete touches no row" "$(as $MEM "with d as (delete from suite_unit_settings where organization_id='$OA' returning 1) select count(*) from d")" "0"
check "outsider admin cannot write into org A" "$(as $OUT "insert into suite_unit_settings(scope, organization_id, profile) values ('organization','$OA',$PF)")" "ERR:42501"
check "admin updates it" "$(as $ADM "update suite_unit_settings set profile=$PO where organization_id='$OA' returning profile->'units'->>'pressure'")" "bar"
check "trigger pins org and scope" "$(as $ADM "update suite_unit_settings set organization_id='$OB' where organization_id='$OA' returning organization_id")" "$OA"
check "stamped editor is the admin" "$(echo "select updated_by from suite_unit_settings where scope='organization'" | Q)" "$ADM"

echo "=== 3. user row: the user only ==="
check "member inserts own row" "$(as $MEM "insert into suite_unit_settings(scope, user_id, profile) values ('user','$MEM',$PO) returning scope")" "user"
check "second user row refused" "$(as $MEM "insert into suite_unit_settings(scope, user_id, profile) values ('user','$MEM',$PO)")" "ERR:23505"
check "admin cannot read another user's row" "$(as $ADM "select count(*) from suite_unit_settings where scope='user'")" "0"
check "admin cannot create a row for another user" "$(as $ADM "insert into suite_unit_settings(scope, user_id, profile) values ('user','$OUT',$PO)")" "ERR:42501"
check "admin cannot update another user's row" "$(as $ADM "with u as (update suite_unit_settings set profile=$PF where user_id='$MEM' returning 1) select count(*) from u")" "0"
check "user cannot move own row to another user" "$(as $MEM "update suite_unit_settings set user_id='$OUT' where user_id='$MEM' returning user_id")" "$MEM"
check "insert with someone else as updated_by refused" "$(as $OUT "insert into suite_unit_settings(scope, user_id, profile, updated_by) values ('user','$OUT',$PO,'$MEM')")" "ERR:42501"

echo "=== 4. shape checks (as the owner, RLS bypassed, so the constraint answers) ==="
su() { printf '%s\n' "\\set VERBOSITY verbose" "$1;" | docker exec -i $C psql -U postgres -tAq 2>&1 | grep -E '^ERROR' | sed -E 's/^ERROR:  ([0-9A-Z]{5}):.*/ERR:\1/' | head -1; }
check "scope user with an org id refused" "$(su "insert into suite_unit_settings(scope, user_id, organization_id, profile) values ('user','$OUT','$OB',$PO)")" "ERR:23514"
check "unknown preset refused" "$(su "insert into suite_unit_settings(scope, user_id, profile) values ('user','$OUT','{\"preset\":\"imperial\",\"units\":{},\"version\":1}')")" "ERR:23514"
check "missing units refused" "$(su "insert into suite_unit_settings(scope, user_id, profile) values ('user','$OUT','{\"preset\":\"metric\",\"version\":1}')")" "ERR:23514"
check "bad scope refused" "$(su "insert into suite_unit_settings(scope, user_id, profile) values ('project','$OUT',$PO)")" "ERR:23514"
check "a row with the wrong scope for the caller is refused by RLS" "$(as $OUT "insert into suite_unit_settings(scope, user_id, profile) values ('project','$OUT',$PO)")" "ERR:42501"
check "outsider's own row goes in" "$(as $OUT "insert into suite_unit_settings(scope, user_id, profile) values ('user','$OUT',$PO) returning 1")" "1"
check "user deletes own row" "$(as $OUT "with d as (delete from suite_unit_settings where user_id='$OUT' returning 1) select count(*) from d")" "1"

echo "=== 5. account and organisation deletion ==="
echo "delete from auth.users where id='$ADM'" | P
check "org row survives its editor's account deletion, editor cleared" "$(echo "select count(*)||':'||coalesce(max(updated_by::text),'null') from suite_unit_settings where scope='organization'" | Q)" "1:null"
echo "delete from auth.users where id='$MEM'" | P
check "user row goes with the account" "$(echo "select count(*) from suite_unit_settings where scope='user'" | Q)" "0"
echo "delete from organizations where id='$OA'" | P
check "org row goes with the organisation" "$(echo "select count(*) from suite_unit_settings" | Q)" "0"

echo "=== $ok passed, $bad failed ==="
[ $bad -eq 0 ]
