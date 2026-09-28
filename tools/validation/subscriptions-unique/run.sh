#!/usr/bin/env bash
# Local scratch-Postgres dry run for 20260929140000_subscriptions_org_quote_unique.
# Never points at a Supabase database. Needs docker. Usage: bash run.sh
# Proves: (1) the migration applies twice cleanly; (2) a duplicate
# (org, quote) pair makes the guard raise and leaves the data untouched;
# (3) two inserts of the same org + quote give exactly one 23505, sequentially
# and from two concurrent sessions; (4) NULL quote_id rows can repeat;
# (5) the writers' fallback (re-select + update the winner) lands one row.
# The TypeScript writers are covered by
# supabase/functions/_shared/__tests__/subscriptions-org-quote-race.test.ts.
set -euo pipefail
cd "$(dirname "$0")"; ROOT=../../..
M=$ROOT/supabase/migrations/20260929140000_subscriptions_org_quote_unique.sql
C=pg-subuniq-dry
if grep -qiE '^\s*(begin|commit)\s*;' "$M"; then echo "FAIL migration carries its own begin/commit"; exit 1; fi
docker run -d --rm --name $C -e POSTGRES_PASSWORD=x postgres:16 >/dev/null
trap 'docker stop $C >/dev/null' EXIT
until docker exec $C pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done; sleep 1
P() { docker exec -i $C psql -U postgres -q -v ON_ERROR_STOP=1 "$@"; }
Q() { docker exec -i $C psql -U postgres -tAq "$@"; }
wrapped() { { echo "begin;"; cat "$M"; echo; echo "commit;"; }; }   # as the owner script applies it
ok=0; bad=0
check() { if [ "$2" = "$3" ]; then echo "PASS $1 ($2)"; ok=$((ok+1)); else echo "FAIL $1: got [$2] want [$3]"; bad=$((bad+1)); fi; }
O1=00000000-0000-0000-0000-0000000000a1; O2=00000000-0000-0000-0000-0000000000a2
Q1=00000000-0000-0000-0000-0000000000b1; Q2=00000000-0000-0000-0000-0000000000b2
ROW="modules, user_limit, end_date, term"; VAL="'{x}', 1, '2027-01-01', 'annual'"

echo "=== 1. clean table (1 row, like production): apply twice ==="
echo "create database clean" | P; P -d clean < schema.sql
echo "insert into subscriptions(organization_id, quote_id, $ROW) values ('$O1','$Q1',$VAL)" | P -d clean
wrapped | P -d clean && echo "  first apply ok"
wrapped | P -d clean && echo "  second apply ok"
check "index exists once" "$(echo "select count(*) from pg_indexes where indexname='subscriptions_org_quote_key'" | Q -d clean)" "1"
check "index is unique, non-partial, (organization_id, quote_id)" \
  "$(echo "select i.indisunique, i.indpred is null, pg_get_indexdef(i.indexrelid) from pg_index i join pg_class c on c.oid=i.indexrelid where c.relname='subscriptions_org_quote_key'" | Q -d clean)" \
  "t|t|CREATE UNIQUE INDEX subscriptions_org_quote_key ON public.subscriptions USING btree (organization_id, quote_id)"

echo "=== 2. duplicate pair present: guard raises, data untouched ==="
echo "create database dupe" | P; P -d dupe < schema.sql
echo "insert into subscriptions(organization_id, quote_id, status, $ROW) values
  ('$O1','$Q1','pending',$VAL), ('$O1','$Q1','active',$VAL), ('$O2','$Q2','active',$VAL),
  ('$O1',null,'active',$VAL), ('$O1',null,'active',$VAL)" | P -d dupe
before=$(echo "select md5(string_agg(s::text, '|' order by id)) from subscriptions s" | Q -d dupe)
set +e; out=$(wrapped | P -d dupe 2>&1); rc=$?; set -e
echo "  $out" | grep -E 'ERROR' | cut -c1-240
check "apply exits non-zero" "$([ $rc -ne 0 ] && echo yes || echo no)" "yes"
check "error names the duplicate pair" "$(echo "$out" | grep -c "($O1, $Q1) x2")" "1"
check "error does not name NULL-quote rows" "$(echo "$out" | grep -c "($O1, ) x")" "0"
check "no index created" "$(echo "select count(*) from pg_indexes where indexname='subscriptions_org_quote_key'" | Q -d dupe)" "0"
check "rows unchanged (count)" "$(echo "select count(*) from subscriptions" | Q -d dupe)" "5"
check "rows unchanged (checksum)" "$(echo "select md5(string_agg(s::text, '|' order by id)) from subscriptions s" | Q -d dupe)" "$before"

echo "=== 3. two inserts of the same org + quote give one 23505 ==="
ins="insert into subscriptions(organization_id, quote_id, $ROW) values ('$O2','$Q2',$VAL)"
r1=$(echo "\\set VERBOSITY verbose
$ins" | Q -d clean 2>&1 || true)
r2=$(echo "\\set VERBOSITY verbose
$ins" | Q -d clean 2>&1 || true)
check "first insert succeeds" "$r1" ""
check "second insert is 23505 on subscriptions_org_quote_key" "$(echo "$r2" | grep -c '23505.*subscriptions_org_quote_key')" "1"
check "one row for the pair" "$(echo "select count(*) from subscriptions where organization_id='$O2' and quote_id='$Q2'" | Q -d clean)" "1"
echo "  concurrent: session A inserts and holds its transaction; session B inserts the same pair"
O3=00000000-0000-0000-0000-0000000000a3; Q3=00000000-0000-0000-0000-0000000000b3
insc="insert into subscriptions(organization_id, quote_id, status, $ROW) values ('$O3','$Q3',:'st',$VAL)"
( printf '%s\n' "\\set st winner" "begin;" "$insc;" "select pg_sleep(3);" "commit;" | docker exec -i $C psql -U postgres -d clean -q -v ON_ERROR_STOP=1 >/dev/null ) &
A=$!; sleep 1
rB=$(printf '%s\n' "\\set VERBOSITY verbose" "\\set st loser" "$insc;" | Q -d clean 2>&1 || true)
wait $A
check "session B (blocked until A commits) gets 23505" "$(echo "$rB" | grep -c '23505.*subscriptions_org_quote_key')" "1"
check "one row for the concurrent pair, the winner's" "$(echo "select count(*)||':'||max(status) from subscriptions where organization_id='$O3' and quote_id='$Q3'" | Q -d clean)" "1:winner"
echo "  the writers' fallback: re-select by org + quote, update the winner with the loser's row"
echo "update subscriptions set status='loser-landed' where id=(select id from subscriptions where organization_id='$O3' and quote_id='$Q3' limit 1)" | P -d clean
check "loser's write landed on the one row" "$(echo "select count(*)||':'||max(status) from subscriptions where organization_id='$O3' and quote_id='$Q3'" | Q -d clean)" "1:loser-landed"

echo "=== 4. NULL quote_id rows can repeat ==="
for i in 1 2 3; do echo "insert into subscriptions(organization_id, quote_id, $ROW) values ('$O1', null, $VAL)" | P -d clean; done
check "three NULL-quote rows for one org" "$(echo "select count(*) from subscriptions where organization_id='$O1' and quote_id is null" | Q -d clean)" "3"
check "same quote under another org is allowed" "$(echo "insert into subscriptions(organization_id, quote_id, $ROW) values ('$O2','$Q1',$VAL) returning 1" | Q -d clean)" "1"

echo "=== $ok passed, $bad failed ==="
[ $bad -eq 0 ]
