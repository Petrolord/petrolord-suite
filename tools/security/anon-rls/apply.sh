#!/usr/bin/env bash
# OWNER-RUN. Anon RLS exposure fix (docs/security/2026-09-19-anon-rls-exposure.md).
#
#   Migration A  20260919160000_security_a_revoke_anon_rls_off_tables.sql
#                anon off 86 tables, RLS on the 53 dead ones, 6 definer fns
#                closed to anon. EMERGENCY: apply as soon as the second
#                engineer has reviewed it.
#   Migration B  20260919170000_security_b_rls_client_used_tables.sql
#                RLS + scoped policies on the 33 client-used tables,
#                authenticated off the 53 dead ones. Apply AFTER A, after
#                its own review; click through the apps listed in the doc
#                (section 6) straight after (staging shares this database).
#
# Usage (from anywhere; the Supabase CLI must be logged in and the repo
# linked to ssyckywijlrkgcwvkwlr, which is PRODUCTION):
#
#   tools/security/anon-rls/apply.sh verify    read-only state report
#   tools/security/anon-rls/apply.sh dry-run   A, then A+B, rollback-wrapped
#   tools/security/anon-rls/apply.sh apply-a   dry run A, then apply A, verify
#   tools/security/anon-rls/apply.sh apply-b   dry run B (+owner probe), apply B, verify
#
# Every apply is preceded by its rollback-wrapped dry run and stops on the
# first failure. Nothing here prints row contents.

set -euo pipefail
cd "$(dirname "$0")/../../.."
M=supabase/migrations
T=tools/security/anon-rls
A=$M/20260919160000_security_a_revoke_anon_rls_off_tables.sql
B=$M/20260919170000_security_b_rls_client_used_tables.sql
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

strip () { sed -e 's/^begin;$//' -e 's/^commit;$//' "$@"; }

verify () {
  echo "--- verify (read-only)"
  { echo "begin;"; cat "$T/verify.sql"; echo "rollback;"; } > "$TMP/v.sql"
  supabase db query --linked -f "$TMP/v.sql" -o table
}

dry () {  # dry <label> <files...> [-- extra probe file]
  local label=$1; shift
  local probe=""
  local files=()
  while [ $# -gt 0 ]; do
    if [ "$1" = "--" ]; then probe=$2; break; fi
    files+=("$1"); shift
  done
  echo "--- DRY RUN ($label): applied and rolled back in one transaction"
  { echo "begin;"; strip "${files[@]}"; cat "$T/verify.sql"; echo "rollback;"; } > "$TMP/d.sql"
  supabase db query --linked -f "$TMP/d.sql" -o table
  if [ -n "$probe" ]; then
    { echo "begin;"; strip "${files[@]}"; cat "$probe"; echo "rollback;"; } > "$TMP/p.sql"
    supabase db query --linked -f "$TMP/p.sql" -o table
  fi
}

anon_http () {
  # Read-only proof from outside, with the key that ships in the SPA.
  # Expect HTTP 401 with code 42501 after A.
  local key=${SUPABASE_ANON_KEY:-}
  if [ -z "$key" ]; then echo "(set SUPABASE_ANON_KEY to run the HTTP probe)"; return 0; fi
  for t in badge_definitions payment_audit_log studio_users; do
    printf '%s: ' "$t"
    curl -s -o /dev/null -w '%{http_code}\n' \
      "https://ssyckywijlrkgcwvkwlr.supabase.co/rest/v1/$t?select=id&limit=1" \
      -H "apikey: $key" -H "Authorization: Bearer $key"
  done
}

case "${1:-}" in
  verify)
    verify ;;
  dry-run)
    dry "A" "$A"
    dry "A+B" "$A" "$B" -- "$T/owner-probe.sql" ;;
  apply-a)
    verify
    dry "A" "$A"
    read -r -p "Dry run A clean? Type APPLY-A to apply to PRODUCTION: " ok
    [ "$ok" = "APPLY-A" ] || { echo "aborted"; exit 1; }
    echo "--- APPLY A"
    supabase db query --linked -f "$A"
    verify
    anon_http
    echo "Expect: client 33/0/0/33/33/33/7, dead 53/53/0/53/53/53/22, anon probe 0 readable,"
    echo "six fns anon_exec=false auth_exec=true, still-open = 1: spatial_ref_sys." ;;
  apply-b)
    verify
    dry "B on top of live A" "$B" -- "$T/owner-probe.sql"
    read -r -p "Dry run B clean and second engineer signed off? Type APPLY-B: " ok
    [ "$ok" = "APPLY-B" ] || { echo "aborted"; exit 1; }
    echo "--- APPLY B"
    supabase db query --linked -f "$B"
    verify
    echo "Expect: client 33/33/0/33/17/0/57, dead 53/53/0/0/0/0/22, manual_verify_quote auth_exec=false."
    echo "NOW click through the apps in docs/security/2026-09-19-anon-rls-exposure.md section 6." ;;
  *)
    sed -n '2,24p' "$0"; exit 2 ;;
esac
