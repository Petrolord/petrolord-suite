#!/usr/bin/env bash
# THE ASSURANCE LAUNCH. OWNER-RUN. (AS13, supersedes as1-apply.sh.)
#
# Production writes are blocked for the agent, so this script is the
# deliverable rather than the applied state. Run it from anywhere with the
# Supabase CLI logged in and the project linked. It has two phases, and
# the order between them is the whole point:
#
#   ./assurance-launch-apply.sh schema     any time BEFORE the upload
#   ./assurance-launch-apply.sh activate   only AFTER the upload is live
#
# `schema` applies all sixteen held schema and catalogue migrations of
# AS1 to AS10, AS14 and AS15, every one dry-run first inside a rolled-back
# transaction,
# then applied, stopping on the first failure. It is safe before the
# upload: the new tables are additive, the old app screens read none of
# them, and the AS10 tile is seeded Coming Soon.
#
# `activate` promotes the seven tiles to Active. It refuses to run until
# you confirm that every Assurance route has been served on the deployed
# site: a tile must never go Active before its route is on the deploy
# target.
#
# NOT in this script, deliberately:
#   20260916103000_commerce_and_credential_rls.sql  touches shared tables
#     (organization_apps, quotes) and needs a second engineer's review
#     under the database conventions. Apply it separately, first if you
#     can: it closes the anon-writable entitlement table.
#   The private `documents` storage bucket for Document Control file
#     uploads: create it in the dashboard (Storage, New bucket,
#     name `documents`, Public OFF). Until it exists the app says files
#     cannot be attached.
#
# The order below was rehearsed end to end on a scratch PostgreSQL 15 by
# tools/validation/assurance/scratch/run-launch-check.sh, including a
# second full pass to prove every step is a no-op when repeated. as1b
# runs after AS3, not in filename order: on a rebuild from the repo the
# tables it revokes on do not exist until AS3 creates them.

set -euo pipefail

cd "$(dirname "$0")/../../.."
M=supabase/migrations
PHASE=${1:-}

SCHEMA_STEPS=(
  20260916099000_as1_assurance_schema_backfill.sql
  20260916100000_as1_assurance_honest_catalog.sql
  20260916101000_as1_assurance_rls.sql
  20260916110000_as2_risk_register_residual_appetite.sql
  20260917100000_as3_regulatory_compliance.sql
  20260916130000_as1b_regulatory_audit_anon_grants.sql
  20260917200000_as4_document_control.sql
  20260917300000_as5_peer_review.sql
  20260917400000_as6_management_of_change.sql
  20260917500000_as7_quality_assurance_plan.sql
  20260917600000_as8_iso_compliance.sql
  20260917700000_as9_lessons_learned.sql
  20260917800000_as10_audit_findings_manager.sql
  20260917810000_as10_seed_audit_findings_tile.sql
  # AS14 MUST precede activation: it replaces documents' two USING (true)
  # policies, a live cross-tenant hole the day Document Control goes
  # Active. Rehearsed by scratch/run-as14-pentest.sh.
  20260918100000_as14_assurance_repairs.sql
  # AS15: the owner decisions held in the database (segregation of duties,
  # emergency ratification, lesson validation actor, ISO examiner).
  # Rehearsed by scratch/run-as15-pentest.sh.
  20260918200000_as15_assurance_owner_decisions.sql
)
ACTIVATE_STEP=20260918900000_as13_activate_assurance_tiles.sql

ROUTES=(
  /dashboard/assurance
  /dashboard/apps/assurance/risk-register
  /dashboard/apps/assurance/regulatory-compliance
  /dashboard/apps/assurance/document-control
  /dashboard/apps/assurance/peer-review-manager
  /dashboard/apps/assurance/management-of-change
  /dashboard/apps/assurance/qa-plan
  /dashboard/apps/assurance/iso-compliance
  /dashboard/apps/assurance/lessons-learned
  /dashboard/apps/assurance/audit-manager
)

run_dry () {
  echo "--- DRY RUN: $1"
  # Built with sed, never printf: these files contain format() strings
  # with %I and %s in them, which printf would eat.
  {
    echo "begin;"
    sed -e 's/^begin;$//' -e 's/^commit;$//' "$M/$1"
    echo "rollback;"
  } > /tmp/assurance-dry.sql
  supabase db query --linked -f /tmp/assurance-dry.sql
  rm -f /tmp/assurance-dry.sql
}

run_apply () {
  echo "--- APPLY: $1"
  supabase db query --linked -f "$M/$1"
}

catalogue () {
  supabase db query --linked "
    select status, count(*) as tiles, string_agg(slug, ', ' order by slug) as slugs
      from master_apps where lower(module)='assurance' group by 1 order by 1;"
}

case "$PHASE" in
  schema)
    echo "=== BASELINE ==="
    catalogue
    for s in "${SCHEMA_STEPS[@]}"; do run_dry "$s"; done
    echo; echo "=== Dry runs clean. Applying. ==="
    for s in "${SCHEMA_STEPS[@]}"; do run_apply "$s"; done
    echo; echo "=== POST-SCHEMA GATES ==="
    echo "--- catalogue: expect Active = 3 (risk-register, risk-heatmap, regulatory-compliance),"
    echo "    Coming Soon = 7 (the seven activate promotes), Archived = 24"
    catalogue
    echo "--- assurance tables still granted to anon: expect none"
    supabase db query --linked "
      select distinct table_name from information_schema.role_table_grants
       where grantee='anon' and table_schema='public'
         and table_name ~ '^(risk_|moc_|doc_|compliance_|regulatory_|peer_review|qa_|iso_|lesson_|audit_)'
         and table_name <> 'audit_logs' order by 1;"
    echo "--- assurance tables with RLS off: expect none in production"
    supabase db query --linked "
      select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public' and c.relkind='r' and not c.relrowsecurity
         and c.relname ~ '^(risk_|moc_|doc_|compliance_|regulatory_|peer_review|qa_|iso_|lesson_|audit_)'
       order by 1;"
    echo
    echo "Schema done. Next: upload the build, serve every route below on the"
    echo "deployed site, then run: $0 activate"
    printf '  %s\n' "${ROUTES[@]}"
    ;;
  activate)
    echo "Before activating, each of these must have loaded on the DEPLOYED site:"
    printf '  %s\n' "${ROUTES[@]}"
    read -r -p "Type SERVED to confirm every route above loaded in production: " ok
    [ "$ok" = "SERVED" ] || { echo "Not confirmed. Nothing done."; exit 1; }
    run_dry "$ACTIVATE_STEP"
    run_apply "$ACTIVATE_STEP"
    echo "--- catalogue: expect Active = 10, Coming Soon = 0, Archived = 24"
    catalogue
    ;;
  *)
    sed -n '4,13p' "$0"
    exit 64
    ;;
esac
