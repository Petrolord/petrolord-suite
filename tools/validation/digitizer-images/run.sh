#!/usr/bin/env bash
# Local scratch-Postgres dry run and RLS pentest for
# 20261002091000_digitizer_images_bucket.sql. Never points at a Supabase
# database. Needs docker. Usage: bash run.sh
# Proves: the file carries no begin/commit; wrapped in begin ... rollback it
# leaves nothing behind; it applies twice cleanly; the bucket is private,
# 25 MB, images only (and is forced back to private if it existed public);
# four policies, none for anon, none changed on other buckets; the pentest
# (19 checks) passes; and, as negative controls, the pentest FAILS when the
# read or the insert policy is widened.
set -euo pipefail
cd "$(dirname "$0")"; ROOT=../../..
M=$ROOT/supabase/migrations/20261002091000_digitizer_images_bucket.sql
C=pg-digitizer-dry-$$
if grep -qiE '^\s*(begin|commit|rollback)\s*;' "$M"; then echo "FAIL migration carries its own begin/commit"; exit 1; fi
if grep -qiE '^\s*(begin|commit|rollback)\s*;' pentest.sql; then echo "FAIL pentest carries its own begin/commit"; exit 1; fi
docker run -d --rm --name $C -e POSTGRES_PASSWORD=x postgres:16-alpine >/dev/null
trap 'docker stop $C >/dev/null' EXIT
until docker exec $C pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done; sleep 2
P() { docker exec -i $C psql -U postgres -q -v ON_ERROR_STOP=1 "$@"; }
Q() { docker exec -i $C psql -U postgres -tAq "$@"; }
ok=0; bad=0
check() { if [ "$2" = "$3" ]; then echo "PASS $1 ($2)"; ok=$((ok+1)); else echo "FAIL $1: got [$2] want [$3]"; bad=$((bad+1)); fi; }
pentest() { docker exec -i $C psql -U postgres -tAq < pentest.sql 2>&1 | grep -oE 'DIGITIZER PENTEST: [0-9]+ passed, [0-9]+ failed' | head -1; }
pentest_detail() { docker exec -i $C psql -U postgres -tAq < pentest.sql 2>&1 | grep -oE 'FAILED:.*\]' | head -1; }
P < schema.sql
OTHER="select md5(string_agg(policyname||cmd||permissive||coalesce(qual,'')||coalesce(with_check,'')||roles::text, '|' order by policyname)) from pg_policies where schemaname='storage' and tablename='objects' and policyname not like 'digitizer_images_%'"
other0=$(echo "$OTHER" | Q)

echo "=== 1. a wrapped dry run rolls back ==="
{ echo "begin;"; cat "$M"; echo; echo "rollback;"; } | P
check "after rollback no bucket" "$(echo "select count(*) from storage.buckets where id='digitizer-images'" | Q)" "0"
check "after rollback no policy" "$(echo "select count(*) from pg_policies where policyname like 'digitizer_images_%'" | Q)" "0"

echo "=== 1b. the single-statement dry run (dry-run-sql.sh): migration and pentest together, nothing kept ==="
DRY=$(bash dry-run-sql.sh | docker exec -i $C psql -U postgres -tAq 2>&1 || true)
check "the dry run raises the pentest result" "$(echo "$DRY" | grep -oE 'DIGITIZER PENTEST: [0-9]+ passed, [0-9]+ failed' | head -1)" "DIGITIZER PENTEST: 19 passed, 0 failed"
check "after the dry run no bucket" "$(echo "select count(*) from storage.buckets where id='digitizer-images'" | Q)" "0"
check "after the dry run no policy" "$(echo "select count(*) from pg_policies where policyname like 'digitizer_images_%'" | Q)" "0"
check "after the dry run no object" "$(echo "select count(*) from storage.objects" | Q)" "0"

echo "=== 2. apply twice ==="
P < "$M" && echo "  first apply ok"
P < "$M" && echo "  second apply ok"
check "bucket is private, 25 MB, png/jpeg/webp" "$(echo "select public::text||'|'||file_size_limit||'|'||array_to_string(allowed_mime_types, ',') from storage.buckets where id='digitizer-images'" | Q)" "false|26214400|image/png,image/jpeg,image/webp"
check "four policies" "$(echo "select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'digitizer_images_%'" | Q)" "4"
check "all permissive, to authenticated only" "$(echo "select count(*) from pg_policies where policyname like 'digitizer_images_%' and permissive='PERMISSIVE' and roles::text='{authenticated}'" | Q)" "4"
check "one per command" "$(echo "select string_agg(cmd, ',' order by cmd) from pg_policies where policyname like 'digitizer_images_%'" | Q)" "DELETE,INSERT,SELECT,UPDATE"
check "no policy of this bucket names anon" "$(echo "select count(*) from pg_policies where policyname like 'digitizer_images_%' and roles::text like '%anon%'" | Q)" "0"
check "policies of other buckets unchanged" "$(echo "$OTHER" | Q)" "$other0"
check "a bucket that existed public is forced private" "$(echo "update storage.buckets set public=true, file_size_limit=null, allowed_mime_types=null where id='digitizer-images'" | P; P < "$M"; echo "select public::text||'|'||file_size_limit from storage.buckets where id='digitizer-images'" | Q)" "false|26214400"

echo "=== 3. pentest ==="
check "pentest" "$(pentest)" "DIGITIZER PENTEST: 19 passed, 0 failed"
check "the pentest keeps nothing" "$(echo "select count(*) from storage.objects" | Q)" "0"

check "a direct SQL delete outside the pentest is still refused by the storage guard" "$(printf '%s\n' "\\set VERBOSITY verbose" "delete from storage.objects;" | docker exec -i $C psql -U postgres -tAq 2>&1 | grep -oE 'Direct deletion from storage tables is not allowed' | head -1)" "Direct deletion from storage tables is not allowed"

echo "=== 4. negative controls: the pentest has teeth ==="
# (a) the read policy widened to the whole bucket: another user reads, and the
#     bucket-less "Allow user to update own files" policy then lets an owner
#     move an object under someone else's folder (see the design doc, section 3)
echo "drop policy \"digitizer_images_select_own\" on storage.objects; create policy \"digitizer_images_select_own\" on storage.objects for select to authenticated using (bucket_id = 'digitizer-images')" | P
check "read policy widened: the pentest fails" "$(pentest)" "DIGITIZER PENTEST: 16 passed, 3 failed"
echo "  $(pentest_detail)"
P < "$M"
check "re-applied: green again" "$(pentest)" "DIGITIZER PENTEST: 19 passed, 0 failed"
# (b) the insert policy without the folder rule
echo "drop policy \"digitizer_images_insert_own\" on storage.objects; create policy \"digitizer_images_insert_own\" on storage.objects for insert to authenticated with check (bucket_id = 'digitizer-images')" | P
check "insert policy widened: the pentest fails" "$(pentest)" "DIGITIZER PENTEST: 16 passed, 3 failed"
echo "  $(pentest_detail)"
P < "$M"
check "re-applied: green again" "$(pentest)" "DIGITIZER PENTEST: 19 passed, 0 failed"
# (c2) the delete policy without the folder rule does nothing alone (a delete only reaches rows the caller can
#      read); with the read policy widened too, another user deletes the owner's image, and the pentest says so
echo "drop policy \"digitizer_images_delete_own\" on storage.objects; create policy \"digitizer_images_delete_own\" on storage.objects for delete to authenticated using (bucket_id = 'digitizer-images')" | P
check "delete policy widened alone: still green (the read policy holds the line)" "$(pentest)" "DIGITIZER PENTEST: 19 passed, 0 failed"
echo "drop policy \"digitizer_images_select_own\" on storage.objects; create policy \"digitizer_images_select_own\" on storage.objects for select to authenticated using (bucket_id = 'digitizer-images')" | P
check "read and delete widened: another user deletes, and the pentest says so" "$(pentest_detail | grep -c 'B deleted 1 of A')" "1"
P < "$M"
check "re-applied: green again" "$(pentest)" "DIGITIZER PENTEST: 19 passed, 0 failed"
# (c) the bucket made public by hand is put back by the migration (section 2); and with no policy at all the owner is locked out
echo "drop policy \"digitizer_images_select_own\" on storage.objects" | P
check "no read policy: the owner reads nothing, and the pentest says so" "$(pentest | grep -c 'failed' )" "1"
P < "$M"
check "re-applied: green again" "$(pentest)" "DIGITIZER PENTEST: 19 passed, 0 failed"

echo; echo "$ok passed, $bad failed"; [ "$bad" = 0 ]
