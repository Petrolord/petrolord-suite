#!/usr/bin/env bash
# AS1 and AS2 ordered apply. OWNER-RUN.
#
# Production DB writes are blocked for the agent, so this is the script
# rather than the applied state. Run it from the repo root with the
# Supabase CLI logged in and the project linked.
#
# Order matters: the schema backfill must precede the RLS migration,
# because the RLS migration references tables the backfill declares.
# The catalogue migration is independent and safe at any point.
#
# Every step is a dry run FIRST (rollback-wrapped), then the apply, per
# the repo's database rules. Stops on the first failure.

set -euo pipefail

cd "$(dirname "$0")/../../.."
M=supabase/migrations

run_dry () {
  echo "--- DRY RUN: $1"
  # Wrap the migration in a transaction that rolls back. Built with cat
  # and sed, never printf: these migrations contain format() strings
  # with %I and %s in them, which printf would eat.
  {
    echo "begin;"
    sed -e 's/^begin;$//' -e 's/^commit;$//' "$M/$1"
    echo "rollback;"
  } > /tmp/as1-dry.sql
  supabase db query --linked -f /tmp/as1-dry.sql
  rm -f /tmp/as1-dry.sql
}

run_apply () {
  echo "--- APPLY: $1"
  supabase db query --linked -f "$M/$1"
}

STEPS=(
  20260916099000_as1_assurance_schema_backfill.sql
  20260916100000_as1_assurance_honest_catalog.sql
  20260916101000_as1_assurance_rls.sql
  20260916110000_as2_risk_register_residual_appetite.sql
)

echo "=== STEP 0: baseline, before anything changes ==="
supabase db query --linked "
  select status, count(*) as tiles from master_apps
   where lower(module)='assurance' group by 1 order by 1;"
supabase db query --linked "
  select count(*) as assurance_tables_with_rls_off
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind='r'
     and c.relrowsecurity = false
     and c.relname ~ '^(risk_|moc_|doc_|compliance_)';"

for s in "${STEPS[@]}"; do
  run_dry "$s"
done

echo
echo "=== Dry runs clean. Applying. ==="
for s in "${STEPS[@]}"; do
  run_apply "$s"
done

echo
echo "=== STEP 4: post-apply gates ==="
echo "--- catalogue: expect 3 Active, 6 Coming Soon, 24 Archived"
supabase db query --linked "
  select status, count(*) as tiles, string_agg(slug, ', ' order by slug) as slugs
    from master_apps where lower(module)='assurance' group by 1 order by 1;"
echo "--- RLS: expect 0"
supabase db query --linked "
  select count(*) as assurance_tables_with_rls_off
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind='r'
     and c.relrowsecurity = false
     and c.relname ~ '^(risk_|moc_|doc_|compliance_)';"
echo "--- anon grants on assurance tables: expect 0"
supabase db query --linked "
  select count(*) as anon_grants from information_schema.role_table_grants
   where table_schema='public' and grantee='anon'
     and table_name ~ '^(risk_|moc_|doc_|compliance_|peer_review)';"

echo
echo "=== STEP 5: the penetration test ==="
echo "Substitute :ORG_A, :ORG_B, :USER_A, :USER_B with two real"
echo "organizations and one non-super-admin member of each, then:"
echo "  supabase db query --linked -f tools/validation/assurance/rls-pentest-as1.sql"
echo
echo
echo "Then the AS2 gate: no risk code may repeat inside an organization,"
echo "and residual/rating/appetite must be populated on every row."
supabase db query --linked "
  select org_id, risk_id, count(*) as duplicates from risk_register
   group by 1,2 having count(*) > 1;"
supabase db query --linked "
  select risk_id, risk_score, residual_score, rating, appetite_status
    from risk_register order by risk_id;"
echo "The commerce migration is NOT in this script. It touches shared"
echo "tables (organization_apps, quotes) and needs a second engineer's"
echo "review first:"
echo "  $M/20260916103000_commerce_and_credential_rls.sql"
echo "  tools/validation/assurance/rls-pentest-commerce.sql"
