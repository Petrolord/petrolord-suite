#!/usr/bin/env bash
# AS13 launch rehearsal on a scratch PostgreSQL 15.
#
# Runs EVERY held Assurance migration in the order the owner-run
# assurance-launch-apply.sh applies them, then all of them a second time
# (each must be a no-op the second time), then checks the post-state:
# every assurance table has RLS on and no anon grant, and the catalogue
# reads 10 Active, 0 Coming Soon, 24 Archived.
#
# The catalogue half needs a master_apps table, which the fixture does not
# carry, so this builds a minimal one with a SYNTHETIC pre-AS1 Assurance
# catalogue of 33 rows in the shape AS1 recorded (3 real Active, 10
# phantom Active, iso-compliance-tool Active, 5 built Coming Soon, 14
# zero-code Coming Soon stubs). The stub slugs are invented; the rules
# only care that they are Coming Soon with no code.
#
# ORDER. as1b (20260916130000) runs AFTER AS3, not in filename order: it
# revokes anon on regulatory_obligations and regulatory_authorities, which
# exist in production but which nothing in the repo creates until AS3. In
# filename order a rebuild from the repo fails there (the fourth AS1
# portability gap, found by this rehearsal). It only revokes grants, so the
# later position is equally correct in production. audit_logs, the third
# table it names, is a platform table; the rehearsal stubs it as
# production has it.
#
# NEGATIVE CONTROL FIRST: the activation migration is run BEFORE the
# AS10 seed, and must skip audit-findings-manager with a notice rather
# than insert it, and must not touch any non-assurance row.
#
# Usage (repo root): tools/validation/assurance/scratch/run-launch-check.sh
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../../../.." && pwd)
M=$ROOT/supabase/migrations
C=${SCRATCH_CONTAINER:-as13-launch}

STEPS=(
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
  20260918100000_as14_assurance_repairs.sql
  20260918200000_as15_assurance_owner_decisions.sql
  20260918900000_as13_activate_assurance_tiles.sql
)

docker rm -f "$C" >/dev/null 2>&1 || true
docker run -d --name "$C" -e POSTGRES_PASSWORD=pw postgres:15-alpine >/dev/null
for _ in $(seq 1 40); do docker exec "$C" pg_isready -q && break; sleep 1; done
q () { docker exec -i "$C" psql -U postgres -v ON_ERROR_STOP=1 -qAt "$@"; }

docker cp "$HERE/fixture.sql" "$C:/fixture.sql" >/dev/null
q -f /fixture.sql >/dev/null 2>&1

q >/dev/null <<'SQL'
create table if not exists public.master_apps (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  app_name text not null,
  module text not null,
  status text not null,
  is_built boolean default false,
  is_functional boolean default false,
  description text,
  price numeric default 499,
  display_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
insert into public.master_apps (slug, app_name, module, status, is_built, is_functional, display_order)
select s, initcap(replace(s, '-', ' ')), 'Assurance', st, b, f, row_number() over ()
from (values
  ('risk-register','Active',true,true), ('risk-heatmap','Active',true,true),
  ('regulatory-compliance','Active',true,true),
  ('audit-trail-manager','Active',true,true), ('safety-audit-manager','Active',true,true),
  ('environmental-compliance','Active',true,true), ('monte-carlo-analyzer','Active',true,true),
  ('decision-tree-analyzer','Active',true,true), ('charge-seal-trap-risk','Active',true,true),
  ('exploration-risk-analyzer','Active',true,true), ('prospect-ranking-tool','Active',true,true),
  ('data-privacy-manager','Active',true,true), ('security-analytics','Active',true,true),
  ('iso-compliance-tool','Active',true,true),
  ('document-control','Coming Soon',true,false), ('peer-review-manager','Coming Soon',true,false),
  ('management-of-change','Coming Soon',true,false), ('quality-assurance-plan','Coming Soon',true,false),
  ('lesson-learned-db','Coming Soon',true,false)
) v(s, st, b, f);
insert into public.master_apps (slug, app_name, module, status)
select 'stub-' || g, 'Stub ' || g, 'Assurance', 'Coming Soon' from generate_series(1, 14) g;
-- a row from another module that nothing here may touch
insert into public.master_apps (slug, app_name, module, status)
values ('pipeline-sizer', 'Pipeline Sizer', 'Facilities', 'Coming Soon');
SQL
echo "baseline: $(q -c "select string_agg(status||'='||n, ', ' order by status) from (select status, count(*) n from master_apps where lower(module)='assurance' group by 1) x")"

for s in "${STEPS[@]}"; do docker cp "$M/$s" "$C:/$s" >/dev/null; done

echo "######## NEGATIVE CONTROL: activation BEFORE the AS10 seed ########"
q -f /20260916100000_as1_assurance_honest_catalog.sql >/dev/null
NOTICE=$(docker exec "$C" psql -U postgres -v ON_ERROR_STOP=1 -q -f /20260918900000_as13_activate_assurance_tiles.sql 2>&1 || true)
echo "$NOTICE" | grep -q "audit-findings-manager" || { echo "FAIL: no skip notice for the unseeded tile"; exit 1; }
[ "$(q -c "select count(*) from master_apps where slug='audit-findings-manager'")" = 0 ] \
  || { echo "FAIL: activation inserted a tile it does not own"; exit 1; }
[ "$(q -c "select status from master_apps where slug='pipeline-sizer'")" = "Coming Soon" ] \
  || { echo "FAIL: activation touched another module"; exit 1; }
echo "ok: skipped audit-findings-manager with a notice, inserted nothing, touched no other module"

echo "######## THE LAUNCH ORDER, from a clean schema ########"
q -c "drop schema public cascade; create schema public;" >/dev/null
q -f /fixture.sql >/dev/null 2>&1
q >/dev/null <<'SQL'
create table public.master_apps (
  id uuid primary key default gen_random_uuid(), slug text unique not null,
  app_name text not null, module text not null, status text not null,
  is_built boolean default false, is_functional boolean default false,
  description text, price numeric default 499, display_order int default 0,
  created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(), action text,
  created_at timestamptz default now());
grant all on public.audit_logs to anon, authenticated;
SQL
# re-seed the same synthetic catalogue
q >/dev/null <<'SQL'
insert into public.master_apps (slug, app_name, module, status, is_built, is_functional)
select s, initcap(replace(s, '-', ' ')), 'Assurance', st, st = 'Active', st = 'Active'
from (values
  ('risk-register','Active'), ('risk-heatmap','Active'), ('regulatory-compliance','Active'),
  ('audit-trail-manager','Active'), ('safety-audit-manager','Active'),
  ('environmental-compliance','Active'), ('monte-carlo-analyzer','Active'),
  ('decision-tree-analyzer','Active'), ('charge-seal-trap-risk','Active'),
  ('exploration-risk-analyzer','Active'), ('prospect-ranking-tool','Active'),
  ('data-privacy-manager','Active'), ('security-analytics','Active'),
  ('iso-compliance-tool','Active'),
  ('document-control','Coming Soon'), ('peer-review-manager','Coming Soon'),
  ('management-of-change','Coming Soon'), ('quality-assurance-plan','Coming Soon'),
  ('lesson-learned-db','Coming Soon')) v(s, st);
insert into public.master_apps (slug, app_name, module, status)
select 'stub-' || g, 'Stub ' || g, 'Assurance', 'Coming Soon' from generate_series(1, 14) g;
SQL
for s in "${STEPS[@]}"; do
  echo "-- applying $s"
  q -f "/$s" >/dev/null 2>&1 || { echo "FAIL applying $s"; q -f "/$s" 2>&1 | tail -5; exit 1; }
done
echo "-- re-applying all ${#STEPS[@]}, each must be a no-op"
for s in "${STEPS[@]}"; do
  q -f "/$s" >/dev/null 2>&1 || { echo "FAIL re-applying $s"; q -f "/$s" 2>&1 | tail -5; exit 1; }
done

echo "######## POST-STATE ########"
CAT=$(q -c "select string_agg(status||'='||n, ', ' order by status) from (select status, count(*) n from master_apps where lower(module)='assurance' group by 1) x")
echo "catalogue: $CAT"
[ "$CAT" = "Active=10, Archived=24" ] || { echo "FAIL: expected Active=10, Archived=24"; exit 1; }
BAD=$(q -c "select count(*) from master_apps where lower(module)='assurance' and status='Active' and (not is_built or not is_functional)")
[ "$BAD" = 0 ] || { echo "FAIL: $BAD Active tiles not built+functional"; exit 1; }
RLS=$(q -c "select coalesce(string_agg(c.relname, ', ' order by c.relname), '') from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and (c.relname ~ '^(risk_|moc_|doc_|compliance_|regulatory_|peer_review|qa_|iso_|lesson_|audit_)' or c.relname in ('documents', 'saved_reports')) and c.relname <> 'audit_logs' and not c.relrowsecurity")
echo "assurance tables with RLS off on a rebuild from the repo: ${RLS:-none}"
# The parent-register rebuild gap (STATUS §5) was pinned here so it could
# only shrink. AS14 closed it: every assurance table, documents and
# saved_reports included, has RLS on after a rebuild from the repo.
KNOWN_RLS_GAP=""
[ "$RLS" = "$KNOWN_RLS_GAP" ] || { echo "FAIL: RLS-off set changed. expected: $KNOWN_RLS_GAP"; exit 1; }
ANON=$(q -c "select coalesce(string_agg(distinct table_name, ', '), '') from information_schema.role_table_grants
  where grantee='anon' and table_schema='public' and (table_name ~ '^(risk_|moc_|doc_|compliance_|regulatory_|peer_review|qa_|iso_|lesson_|audit_)' or table_name in ('documents', 'saved_reports'))")
echo "assurance tables granted to anon: ${ANON:-none}"
docker rm -f "$C" >/dev/null
[ -z "$ANON" ] || { echo "FAIL: anon grants remain"; exit 1; }
echo "LAUNCH REHEARSAL PASSED"
