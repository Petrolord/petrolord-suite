#!/usr/bin/env bash
# OWNER-RUN. Platform-admin source of truth security fix.
# SECOND ENGINEER REVIEW REQUIRED before `apply` (shared tables: users,
# organization_members; new shared table platform_admins).
#
#   Migration  20260919195000_security_platform_admin_source.sql
#     platform_admins (service-role only) becomes THE platform-admin source;
#     is_super_admin() reads it; public.users privileged columns locked to
#     the server; seat RPCs use the helper; pending invitation tokens hidden
#     from non-admin members.
#
# Usage (Supabase CLI logged in, repo linked to ssyckywijlrkgcwvkwlr, which is
# PRODUCTION):
#
#   tools/security/platform-admin/apply.sh verify        read-only state report (+ admin list)
#   tools/security/platform-admin/apply.sh dry-run       migration + verify, then migration + probe, each rolled back
#   tools/security/platform-admin/apply.sh apply         dry run + probe, confirm, apply, verify
#   tools/security/platform-admin/apply.sh grant  EMAIL  add a platform admin (confirmed account)
#   tools/security/platform-admin/apply.sh revoke EMAIL  remove a platform admin
#
# ORDER (see the PR body):
#   1. supabase functions deploy, FIRST, in this order (worst hole first):
#        admin-update-org-entitlements admin-suspend-org admin-delete-organization
#        admin-grant-user-app-access admin-create-user send-invite
#        insert-geoscience-apps org-offboard org-export invite-employee
#        generate-quote admin-cleanup-test-data accept-employee-invitation
#      Deploying before the migration is deliberate: each function then reads
#      public.platform_admins, which does not exist yet, and fails CLOSED, so
#      the open admin endpoints, the metadata-trusting checks and the send-invite
#      relay are shut at once. The only cost until step 3 is that the three
#      platform admins are refused platform-admin actions (org-admin paths
#      are unaffected).
#   2. `dry-run`, then confirm the platform admin list it prints (the three
#      accounts is_super_admin() trusts today).
#   3. `apply` (restores platform-admin access through platform_admins and
#      closes the database-side holes).
#   4. Upload the Suite SPA build (the super-admin UI now asks the server;
#      the accept-invite page handles the sign-in requirement).
#   5. `grant support@petrolord.com` ONLY if the owner confirms it should be
#      a platform admin (the edge functions and the SPA trusted it; SQL
#      never did).
# Every apply is preceded by its rollback-wrapped dry run and stops on the
# first failure. Nothing here prints customer row contents.

set -euo pipefail
cd "$(dirname "$0")/../../.."
T=tools/security/platform-admin
MIG=supabase/migrations/20260919195000_security_platform_admin_source.sql
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

strip () { sed -e 's/^begin;$//' -e 's/^commit;$//' "$@"; }

verify () {
  echo "--- verify (read-only)"
  { echo "begin;"; cat "$T/verify.sql"; echo "rollback;"; } > "$TMP/v.sql"
  supabase db query --linked -f "$TMP/v.sql" -o table
}

dry () {
  echo "--- DRY RUN: migration applied and rolled back in one transaction (+ verify)"
  { echo "begin;"; strip "$MIG"; cat "$T/verify.sql"; echo "rollback;"; } > "$TMP/d.sql"
  supabase db query --linked -f "$TMP/d.sql" -o table
  echo "--- DRY RUN + behavioural probe, rolled back"
  { echo "begin;"; strip "$MIG"; cat "$T/dryrun-probe.sql"; echo "rollback;"; } > "$TMP/p.sql"
  supabase db query --linked -f "$TMP/p.sql" -o table | tee "$TMP/p.out"
  grep -q "ALL 20 PROBES PASS" "$TMP/p.out" || { echo "PROBE FAILURE: do not apply" >&2; exit 1; }
}

email_arg () {
  local e="${1:-}"
  [[ "$e" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || { echo "usage: $0 grant|revoke EMAIL" >&2; exit 2; }
  printf '%s' "$e" | tr '[:upper:]' '[:lower:]'
}

case "${1:-}" in
  verify)
    verify ;;
  dry-run)
    dry ;;
  apply)
    verify
    dry
    read -r -p "Dry run + probe clean, admin list confirmed, second engineer signed off? Type APPLY-PLATFORM-ADMIN: " ok
    [ "$ok" = "APPLY-PLATFORM-ADMIN" ] || { echo "aborted"; exit 1; }
    echo "--- APPLY"
    supabase db query --linked -f "$MIG"
    verify
    echo "Expect: platform_admins_table=t, platform_admins_rows=3, users_flag_true=3,"
    echo "helper_reads_platform_admins=t, auth_users_table_update=f, auth_update_is_super_admin=f,"
    echo "auth_update_subscribed_modules=f, auth_update_primary_app=t, anon_select_users=f,"
    echo "users_guard_trigger=t, users_update_with_check=t, assign/unassign_seat_uses_helper=t,"
    echo "member_policy_hides_invited=t."
    echo "If the edge functions are not deployed yet, deploy them now (order in the header), then upload the SPA." ;;
  grant)
    e=$(email_arg "${2:-}")
    cat > "$TMP/g.sql" <<SQL
begin;
insert into public.platform_admins (user_id, email, granted_by, note)
select u.id, lower(u.email), 'apply.sh grant', 'owner-confirmed'
  from auth.users u where lower(u.email) = '$e' and u.email_confirmed_at is not null
on conflict (user_id) do nothing;
select count(*) as now_admin from public.platform_admins pa join auth.users u on u.id = pa.user_id where lower(u.email) = '$e';
commit;
SQL
    read -r -p "Grant PLATFORM SUPER ADMIN to $e on PRODUCTION? Type GRANT: " ok
    [ "$ok" = "GRANT" ] || { echo "aborted"; exit 1; }
    supabase db query --linked -f "$TMP/g.sql" -o table
    echo "Expect now_admin=1 (0 means no confirmed account with that email)." ;;
  revoke)
    e=$(email_arg "${2:-}")
    cat > "$TMP/r.sql" <<SQL
begin;
delete from public.platform_admins pa using auth.users u where u.id = pa.user_id and lower(u.email) = '$e';
select count(*) as remaining_admins from public.platform_admins;
commit;
SQL
    read -r -p "Revoke platform super admin from $e on PRODUCTION? Type REVOKE: " ok
    [ "$ok" = "REVOKE" ] || { echo "aborted"; exit 1; }
    supabase db query --linked -f "$TMP/r.sql" -o table ;;
  *)
    sed -n '2,44p' "$0"; exit 2 ;;
esac
