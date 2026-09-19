#!/usr/bin/env bash
# OWNER-RUN. Invitation acceptance security fix (shared tables:
# organization_members, invitations; the handle_new_user signup trigger).
# SECOND ENGINEER REVIEW REQUIRED before apply-fix.
#
#   Stop-gap  20260919180000_security_stopgap_revoke_add_user_to_organization.sql
#             one REVOKE: clients can no longer call add_user_to_organization.
#             Breaks HSE invitation acceptance until the fix + HSE upload ship
#             (see the file header). Apply NOW.
#   Fix       20260919190000_security_invitation_acceptance.sql
#             token-validated accept_invitation(), handle_new_user no longer
#             trusts signup metadata, invitations policies admin-only,
#             enable_hse_for_organization uses auth.uid().
#
# Usage (Supabase CLI logged in, repo linked to ssyckywijlrkgcwvkwlr, which is
# PRODUCTION):
#
#   tools/security/invitation-acceptance/apply.sh verify         read-only state report
#   tools/security/invitation-acceptance/apply.sh dry-run        stop-gap, then fix + probe, each rolled back
#   tools/security/invitation-acceptance/apply.sh apply-stopgap  dry run, apply the stop-gap, verify
#   tools/security/invitation-acceptance/apply.sh apply-fix      dry run + probe, apply the fix, verify
#
# ORDER for apply-fix (the stop-gap can go any time, first):
#   1. supabase functions deploy accept-employee-invitation   (this Suite PR;
#      works with the old and the new trigger)
#      and, from the HSE repo PR: supabase functions deploy hse-invite-user
#   2. apply-fix
#   3. upload the HSE SPA build from the HSE PR straight after (the new
#      /accept-invite page calls get_invitation_by_token / accept_invitation,
#      which exist only after step 2; the old page stops working at step 2).
#      Live pending HSE invitations were 0 on 2026-09-19, so the gap between
#      2 and 3 affects nobody unless an invite is sent in between.
# Every apply is preceded by its rollback-wrapped dry run and stops on the
# first failure. Nothing here prints row contents.

set -euo pipefail
cd "$(dirname "$0")/../../.."
M=supabase/migrations
T=tools/security/invitation-acceptance
STOP=$M/20260919180000_security_stopgap_revoke_add_user_to_organization.sql
FIX=$M/20260919190000_security_invitation_acceptance.sql
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

strip () { sed -e 's/^begin;$//' -e 's/^commit;$//' "$@"; }

verify () {
  echo "--- verify (read-only)"
  { echo "begin;"; cat "$T/verify.sql"; echo "rollback;"; } > "$TMP/v.sql"
  supabase db query --linked -f "$TMP/v.sql" -o table
}

dry () {  # dry <label> <file> [probe]
  echo "--- DRY RUN ($1): applied and rolled back in one transaction"
  { echo "begin;"; strip "$2"; cat "$T/verify.sql"; echo "rollback;"; } > "$TMP/d.sql"
  supabase db query --linked -f "$TMP/d.sql" -o table
  if [ -n "${3:-}" ]; then
    echo "--- DRY RUN ($1) + behavioural probe, rolled back"
    { echo "begin;"; strip "$2"; cat "$3"; echo "rollback;"; } > "$TMP/p.sql"
    supabase db query --linked -f "$TMP/p.sql" -o table | tee "$TMP/p.out"
    grep -q "ALL 11 PROBES PASS" "$TMP/p.out" || { echo "PROBE FAILURE: do not apply" >&2; exit 1; }
  fi
}

case "${1:-}" in
  verify)
    verify ;;
  dry-run)
    dry "stop-gap" "$STOP"
    dry "fix" "$FIX" "$T/dryrun-probe.sql" ;;
  apply-stopgap)
    verify
    dry "stop-gap" "$STOP"
    read -r -p "Dry run clean? Type APPLY-STOPGAP to apply to PRODUCTION: " ok
    [ "$ok" = "APPLY-STOPGAP" ] || { echo "aborted"; exit 1; }
    echo "--- APPLY stop-gap"
    supabase db query --linked -f "$STOP"
    verify
    echo "Expect: add_user_to_organization anon_exec=f auth_exec=f service_exec=t." ;;
  apply-fix)
    verify
    dry "fix" "$FIX" "$T/dryrun-probe.sql"
    read -r -p "Dry run + probe clean, edge fns deployed, second engineer signed off? Type APPLY-FIX: " ok
    [ "$ok" = "APPLY-FIX" ] || { echo "aborted"; exit 1; }
    echo "--- APPLY fix"
    supabase db query --linked -f "$FIX"
    verify
    echo "Expect: every fn row matches its expect column; 4 invitations_admin_* policies"
    echo "(no 'Public can ...'); anon_can_select_invitations=f; token_unique_index=t;"
    echo "invited_by_default=auth.uid(); trigger_validates=t; enable_hse_uses_uid=t."
    echo "NOW upload the HSE SPA build and walk: invite (HSE Team), accept as new user,"
    echo "accept as signed-in existing user, Suite Employees invite + accept." ;;
  *)
    sed -n '2,36p' "$0"; exit 2 ;;
esac
