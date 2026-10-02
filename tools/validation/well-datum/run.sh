#!/usr/bin/env bash
# Local scratch-Postgres dry run for 20261002090000_geo_wells_datum_model.sql.
# Never points at a Supabase database. Needs docker. Usage: bash run.sh
# Proves: the file carries no begin/commit; wrapped in begin ... rollback it
# leaves nothing behind; the single-statement dry run (dry-run-sql.sh)
# reports per well and keeps nothing; it applies twice cleanly; the 9 columns are nullable
# with no default; kb_m, the policies and the grants are untouched; the
# backfill does to the 13 live wells what the design doc says (12 stated as
# KB, Lad unset, 4 entered in feet); the second apply changes no row; the
# checks refuse bad rows and accept "not set" and an explicit 0; RLS still
# decides who writes; and, beside the team-editing migration's real guard and
# log triggers, the backfill is one versioned, summarised history line per well.
set -euo pipefail
cd "$(dirname "$0")"; ROOT=../../..
M=$ROOT/supabase/migrations/20261002090000_geo_wells_datum_model.sql
C=pg-datum-dry-$$
if grep -qiE '^\s*(begin|commit|rollback)\s*;' "$M"; then echo "FAIL migration carries its own begin/commit"; exit 1; fi
docker run -d --rm --name $C -e POSTGRES_PASSWORD=x postgres:16-alpine >/dev/null
trap 'docker stop $C >/dev/null' EXIT
until docker exec $C pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done; sleep 2
P() { docker exec -i $C psql -U postgres -q -v ON_ERROR_STOP=1 "$@"; }
Q() { docker exec -i $C psql -U postgres -tAq "$@"; }
ok=0; bad=0
check() { if [ "$2" = "$3" ]; then echo "PASS $1 ($2)"; ok=$((ok+1)); else echo "FAIL $1: got [$2] want [$3]"; bad=$((bad+1)); fi; }
su() { printf '%s\n' "\\set VERBOSITY verbose" "$1;" | docker exec -i $C psql -U postgres -tAq 2>&1 | grep -E '^ERROR' | sed -E 's/^ERROR:  ([0-9A-Z]{5}):.*/ERR:\1/' | head -1; }
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
A=00000000-0000-0000-0000-0000000000a1; B=00000000-0000-0000-0000-0000000000b1
NEWCOLS="'depth_ref_kind','depth_ref_label','depth_ref_elev_m','well_environment','ground_elev_m','water_depth_m','vertical_datum','elev_unit','datum_changes'"
POL="select md5(string_agg(policyname||cmd||coalesce(qual,'')||coalesce(with_check,'')||roles::text, '|' order by policyname)) from pg_policies where tablename='geo_wells'"
GRANTS="select md5(string_agg(grantee||privilege_type, '|' order by grantee, privilege_type)) from information_schema.role_table_grants where table_name='geo_wells'"
OLDDATA="select md5(string_agg(name||kb_m::text||coalesce(units_note,'')||updated_at::text, '|' order by name)) from geo_wells"
pol0=$(echo "$POL" | Q); gr0=$(echo "$GRANTS" | Q); old0=$(echo "$OLDDATA" | Q)

echo "=== 1. a wrapped dry run rolls back ==="
{ echo "begin;"; cat "$M"; echo; echo "select count(*) from information_schema.columns where table_name='geo_wells' and column_name in ($NEWCOLS);"; echo "rollback;"; } | P >/tmp/datum-dry-$$.out
check "inside the dry run the 9 columns exist" "$(grep -E '^ *[0-9]+ *$' /tmp/datum-dry-$$.out | tr -d ' ' | head -1)" "9"
check "after rollback no datum column remains" "$(echo "select count(*) from information_schema.columns where table_name='geo_wells' and column_name in ($NEWCOLS)" | Q)" "0"
rm -f /tmp/datum-dry-$$.out

echo "=== 1b. the single-statement dry run (dry-run-sql.sh) reports per well and keeps nothing ==="
DRY=$(bash dry-run-sql.sh | docker exec -i $C psql -U postgres -tAq 2>&1 || true)
check "the dry run raises its report" "$(echo "$DRY" | grep -oE 'DATUM DRY RUN: 13 wells before, 13 after; kb_m unchanged; 12 stated, 1 unset; columns added 9; constraints 9' | head -1)" "DATUM DRY RUN: 13 wells before, 13 after; kb_m unchanged; 12 stated, 1 unset; columns added 9; constraints 9"
check "it names what happens to Lad" "$(echo "$DRY" | grep -oE 'Lad \[kb_m 0\] -> unset null' | head -1)" "Lad [kb_m 0] -> unset null"
check "and to a well entered in feet" "$(echo "$DRY" | grep -oE 'W-3 \[kb_m 7.06063104\] -> KB 7.06063104 entered in ft' | head -1)" "W-3 [kb_m 7.06063104] -> KB 7.06063104 entered in ft"
check "after the dry run no datum column remains" "$(echo "select count(*) from information_schema.columns where table_name='geo_wells' and column_name in ($NEWCOLS)" | Q)" "0"

echo "=== 2. apply ==="
P < "$M" && echo "  first apply ok"
check "9 datum columns" "$(echo "select count(*) from information_schema.columns where table_name='geo_wells' and column_name in ($NEWCOLS)" | Q)" "9"
check "all nullable, no default" "$(echo "select count(*) from information_schema.columns where table_name='geo_wells' and column_name in ($NEWCOLS) and (is_nullable <> 'YES' or column_default is not null)" | Q)" "0"
check "kb_m still NOT NULL DEFAULT 0" "$(echo "select is_nullable||':'||column_default from information_schema.columns where table_name='geo_wells' and column_name='kb_m'" | Q)" "NO:0"
check "9 datum check constraints" "$(echo "select count(*) from pg_constraint where conrelid='public.geo_wells'::regclass and contype='c' and conname <> 'geo_wells_status_check'" | Q)" "9"
check "policies unchanged" "$(echo "$POL" | Q)" "$pol0"
check "grants unchanged" "$(echo "$GRANTS" | Q)" "$gr0"
check "no trigger added" "$(echo "select count(*) from pg_trigger where tgrelid='public.geo_wells'::regclass and not tgisinternal" | Q)" "0"
check "name, kb_m, units_note, updated_at of every well untouched" "$(echo "$OLDDATA" | Q)" "$old0"

echo "=== 3. backfill: the 13 live wells ==="
check "12 wells state a KB elevation equal to kb_m" "$(echo "select count(*) from geo_wells where depth_ref_kind='KB' and depth_ref_elev_m = kb_m and kb_m <> 0" | Q)" "12"
check "Lad (kb_m 0) is unset" "$(echo "select coalesce(depth_ref_kind,'null')||'/'||coalesce(depth_ref_elev_m::text,'null') from geo_wells where name='Lad'" | Q)" "null/null"
check "only Lad is unset" "$(echo "select string_agg(name, ',') from geo_wells where depth_ref_elev_m is null" | Q)" "Lad"
check "entered in feet: the four whose note says so" "$(echo "select string_agg(name, ',' order by name) from geo_wells where elev_unit='ft'" | Q)" "Assa 7,Assa 7.1,Assa-06,W-3"
check "no environment, ground level, water depth or datum name invented" "$(echo "select count(*) from geo_wells where well_environment is not null or ground_elev_m is not null or water_depth_m is not null or vertical_datum is not null or datum_changes is not null" | Q)" "0"
check "Barracuda_BX-1 62.01" "$(echo "select depth_ref_elev_m from geo_wells where name='Barracuda_BX-1'" | Q)" "62.01"

echo "=== 4. idempotent ==="
ALL="select md5(string_agg(t::text, '|' order by name)) from geo_wells t"
all1=$(echo "$ALL" | Q)
P < "$M" && echo "  second apply ok"
check "second apply changes no row" "$(echo "$ALL" | Q)" "$all1"
check "still 9 datum check constraints" "$(echo "select count(*) from pg_constraint where conrelid='public.geo_wells'::regclass and contype='c' and conname <> 'geo_wells_status_check'" | Q)" "9"
check "a value a user cleared is not backfilled again" "$(printf '%s\n' "update geo_wells set depth_ref_kind=null, depth_ref_elev_m=null, kb_m=0 where name='Alaoma-1';" | P; P < "$M"; echo "select coalesce(depth_ref_elev_m::text,'null') from geo_wells where name='Alaoma-1'" | Q)" "null"
check "a row an older build writes after apply (kb_m only) is picked up by a re-run" "$(printf '%s\n' "insert into geo_wells(user_id,name,surface_x,surface_y,kb_m) values ('$A','OldBuild-1',1,1,30);" | P; P < "$M"; echo "select depth_ref_kind||'/'||depth_ref_elev_m from geo_wells where name='OldBuild-1'" | Q)" "KB/30"

echo "=== 5. checks ==="
INS="insert into geo_wells(user_id,name,surface_x,surface_y"
check "unknown reference kind refused" "$(su "$INS,depth_ref_kind) values ('$A','c1',1,1,'RKB')")" "ERR:23514"
check "lower-case kind refused" "$(su "$INS,depth_ref_kind) values ('$A','c2',1,1,'kb')")" "ERR:23514"
check "elevation with no kind refused" "$(su "$INS,depth_ref_elev_m) values ('$A','c3',1,1,25)")" "ERR:23514"
check "negative water depth refused" "$(su "$INS,well_environment,water_depth_m) values ('$A','c4',1,1,'offshore',-10)")" "ERR:23514"
check "water depth on an onshore well refused" "$(su "$INS,well_environment,water_depth_m) values ('$A','c5',1,1,'onshore',100)")" "ERR:23514"
check "water depth with no environment refused" "$(su "$INS,water_depth_m) values ('$A','c6',1,1,100)")" "ERR:23514"
check "ground level on an offshore well refused" "$(su "$INS,well_environment,ground_elev_m) values ('$A','c7',1,1,'offshore',4)")" "ERR:23514"
check "unknown environment refused" "$(su "$INS,well_environment) values ('$A','c8',1,1,'swamp')")" "ERR:23514"
check "unknown unit refused" "$(su "$INS,elev_unit) values ('$A','c9',1,1,'yd')")" "ERR:23514"
check "datum_changes must be an array" "$(su "$INS,datum_changes) values ('$A','c10',1,1,'{}'::jsonb)")" "ERR:23514"
check "empty datum name refused" "$(su "$INS,vertical_datum) values ('$A','c11',1,1,'')")" "ERR:23514"
check "offshore well accepted" "$(echo "$INS,depth_ref_kind,depth_ref_elev_m,well_environment,water_depth_m,vertical_datum,elev_unit,kb_m) values ('$A','ok-off',1,1,'KB',25,'offshore',100,'MSL','m',25) returning depth_ref_elev_m" | Q | head -1)" "25"
check "onshore well accepted" "$(echo "$INS,depth_ref_kind,depth_ref_elev_m,well_environment,ground_elev_m,vertical_datum,kb_m) values ('$A','ok-on',1,1,'KB',318.5,'onshore',312,'MSL',318.5) returning ground_elev_m" | Q | head -1)" "312"
check "explicit 0 (measured from MSL) accepted and kept as 0" "$(echo "$INS,depth_ref_kind,depth_ref_elev_m) values ('$A','ok-msl',1,1,'MSL',0) returning depth_ref_elev_m" | Q | head -1)" "0"
check "explicit 0 survives a re-run (not treated as unset)" "$(P < "$M"; echo "select depth_ref_kind||'/'||depth_ref_elev_m from geo_wells where name='ok-msl'" | Q)" "MSL/0"
check "not set accepted: every datum column NULL, kb_m defaults to 0" "$(echo "$INS) values ('$A','ok-unset',1,1) returning coalesce(depth_ref_elev_m::text,'null')||'/'||kb_m" | Q | head -1)" "null/0"
check "a kind with no elevation yet accepted" "$(echo "$INS,depth_ref_kind) values ('$A','ok-kind',1,1,'RT') returning depth_ref_kind" | Q | head -1)" "RT"
check "change record array accepted" "$(echo "update geo_wells set datum_changes='[{\"at\":\"2026-10-02\"}]'::jsonb where name='ok-off' returning jsonb_array_length(datum_changes)" | Q | head -1)" "1"

echo "=== 6. RLS still decides who writes (no policy change) ==="
check "owner corrects own datum" "$(as $A "update geo_wells set depth_ref_elev_m=26, kb_m=26 where name='ok-off' returning depth_ref_elev_m")" "26"
check "another user's update touches no row" "$(as $B "with u as (update geo_wells set depth_ref_elev_m=99 where name='ok-off' returning 1) select count(*) from u")" "0"
check "another user reads no private well" "$(as $B "select count(*) from geo_wells")" "0"
check "anon reads nothing" "$(as anon "select count(*) from geo_wells")" "0"

echo "=== 7. beside the team-editing migration (applied on the live database 2026-10-02): its real guard and log triggers ==="
# A second scratch database with the change log table, the guard and log
# functions read from the real migration files, the team-editing columns and
# the two triggers on geo_wells, as 20261002100000 and 20261002110000 make them.
S=$ROOT/supabase/migrations/20261002100000_suite_record_sharing.sql
docker exec $C createdb -U postgres s2
P2() { docker exec -i $C psql -U postgres -d s2 -q -v ON_ERROR_STOP=1 "$@"; }
Q2() { docker exec -i $C psql -U postgres -d s2 -tAq "$@"; }
P2 < schema.sql
{
  awk '/^create table if not exists public.suite_record_changes/{f=1} f{print} f && /^\);/{exit}' "$S"
  for fn in suite_record_guard suite_record_log_updated suite_record_log; do
    awk -v fn="create or replace function public.$fn(" 'index($0, fn) == 1 {f=1} f{print} f && /^end \$\$;/{exit}' "$S"
  done
  cat <<'SQL'
alter table public.geo_wells
    add column if not exists org_access text not null default 'view',
    add column if not exists editing_by uuid,
    add column if not exists editing_since timestamptz,
    add column if not exists editing_expires timestamptz,
    add column if not exists version integer not null default 1,
    add column if not exists updated_by uuid,
    add column if not exists change_note text;
create trigger suite_record_guard before insert or update on public.geo_wells
    for each row execute function public.suite_record_guard('organization_id');
create trigger suite_record_log after insert or update or delete on public.geo_wells
    for each row execute function public.suite_record_log('organization_id');
SQL
} | P2
check "the real guard and log functions are in place" "$(echo "select count(*) from pg_proc where proname in ('suite_record_guard','suite_record_log','suite_record_log_updated')" | Q2)" "3"
check "before: every well at version 1, no history" "$(echo "select (select count(*) from geo_wells where version = 1)||'/'||(select count(*) from suite_record_changes)" | Q2)" "13/0"
KB2="select md5(string_agg(name||kb_m::text||coalesce(units_note,''), '|' order by name)) from geo_wells"
kb2_before=$(echo "$KB2" | Q2)
DRY2=$(bash dry-run-sql.sh | docker exec -i $C psql -U postgres -d s2 -tAq 2>&1 || true)
check "the dry run reports the triggers' effect" "$(echo "$DRY2" | grep -oE 'team-editing triggers present: 12 wells now past version 1, 12 history lines written with the summary, 0 of them with an author' | head -1)" "team-editing triggers present: 12 wells now past version 1, 12 history lines written with the summary, 0 of them with an author"
check "and keeps nothing" "$(echo "select (select count(*) from geo_wells where version = 1)||'/'||(select count(*) from suite_record_changes)" | Q2)" "13/0"
P2 < "$M" && echo "  applied beside the triggers"
check "12 wells stated, Lad unset" "$(echo "select (select count(*) from geo_wells where depth_ref_kind='KB' and depth_ref_elev_m = kb_m)||'/'||(select string_agg(name, ',') from geo_wells where depth_ref_elev_m is null)" | Q2)" "12/Lad"
check "the 12 backfilled wells are at version 2, Lad stays at 1" "$(echo "select (select count(*) from geo_wells where version = 2)||'/'||(select version from geo_wells where name='Lad')" | Q2)" "12/1"
check "one history line per backfilled well, a service write with the summary" "$(echo "select count(*)||'/'||count(*) filter (where changed_by is null and action='updated')||'/'||min(summary) from suite_record_changes" | Q2)" "12/12/Datum model: the earlier KB stated as the depth reference (migration, no depth changed)"
check "the line names the datum fields only" "$(echo "select changed_fields::text from suite_record_changes c join geo_wells w on w.id = c.record_id where w.name = 'W-3'" | Q2)" '["depth_ref_elev_m", "depth_ref_kind", "elev_unit"]'
check "the pass-through note is never stored" "$(echo "select count(*) from geo_wells where change_note is not null" | Q2)" "0"
check "name, kb_m and units_note untouched beside the triggers too" "$(echo "$KB2" | Q2)" "$kb2_before"
P2 < "$M"
check "a second apply writes no further version or history" "$(echo "select (select count(*) from geo_wells where version = 2)||'/'||(select count(*) from suite_record_changes)" | Q2)" "12/12"
as2() {
  local who=$1; shift
  local out
  out=$(printf '%s\n' "\\set VERBOSITY verbose" "begin;" "set local role authenticated;" "select set_config('request.jwt.claim.sub', '$who', true);" "$1;" "commit;" \
    | docker exec -i $C psql -U postgres -d s2 -tAq -v ON_ERROR_STOP=1 2>&1 || true)
  if echo "$out" | grep -qE '^ERROR'; then echo "$out" | grep -E '^ERROR' | head -1 | sed -E 's/^ERROR:  ([0-9A-Z]{5}):.*/ERR:\1/'
  else echo "$out" | grep -v '^$' | tail -1; fi
}
check "the owner then corrects a datum from the app, naming the version it opened" "$(as2 $A "update geo_wells set depth_ref_elev_m = 64, kb_m = 64, version = 2, change_note = 'Depth reference changed' where name = 'BX-1New' returning version")" "3"
check "a stale editor is refused by the guard" "$(as2 $A "update geo_wells set depth_ref_elev_m = 65, kb_m = 65, version = 2 where name = 'BX-1New' returning version")" "ERR:SR001"
check "and the correction is in the history with its author" "$(echo "select summary||'/'||(changed_by is not null) from suite_record_changes c join geo_wells w on w.id = c.record_id where w.name='BX-1New' order by c.id desc limit 1" | Q2)" "Depth reference changed/true"

echo; echo "$ok passed, $bad failed"; [ "$bad" = 0 ]
