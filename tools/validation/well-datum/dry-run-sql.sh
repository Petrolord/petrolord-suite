#!/usr/bin/env bash
# Prints ONE DO statement that applies the datum migration's body, reads
# what it did to every well, and then ALWAYS raises that report. Because it
# is a single statement that ends in an exception, Postgres rolls all of it
# back whatever runs it and however it is sent: it cannot commit. It also
# gives up after 3 s if it cannot get its lock, so it never queues behind
# other work. Read the result in the error text ("DATUM DRY RUN: ...").
#
#   scratch:  bash dry-run-sql.sh | docker exec -i <container> psql -U postgres
#   linked:   bash dry-run-sql.sh > /tmp/datum-dry-run.sql && supabase db query --linked -f /tmp/datum-dry-run.sql
set -euo pipefail
cd "$(dirname "$0")"
M=../../../supabase/migrations/20261002090000_geo_wells_datum_model.sql
if grep -qiE '^\s*(begin|commit|rollback)\s*;' "$M"; then echo "FAIL migration carries its own begin/commit" >&2; exit 1; fi
# the statements between the migration's "do $datum$ / begin" and its closing "end / $datum$;"
BODY=$(awk '/^do \$datum\$/{f=1; next} f && /^begin$/ && !b {b=1; next} /^end$/ && b {exit} b {print}' "$M")
[ -n "$BODY" ] || { echo "FAIL could not read the migration body" >&2; exit 1; }
cat <<SQL
do \$dryrun\$
declare
  report text;
  n_before int;
  n_after int;
  kb_before text;
  kb_after text;
begin
  perform set_config('lock_timeout', '3000', true);
  select count(*), md5(string_agg(id::text || ':' || kb_m::text, '|' order by id)) into n_before, kb_before from public.geo_wells;
$BODY
  select count(*), md5(string_agg(id::text || ':' || kb_m::text, '|' order by id)) into n_after, kb_after from public.geo_wells;
  select string_agg(name || ' [kb_m ' || kb_m || '] -> ' || coalesce(depth_ref_kind, 'unset') || ' ' || coalesce(depth_ref_elev_m::text, 'null')
           || coalesce(' entered in ' || elev_unit, ''), '; ' order by created_at)
    into report from public.geo_wells;
  raise exception 'DATUM DRY RUN: % wells before, % after; kb_m %; % stated, % unset; columns added %; constraints %. PER WELL: % (always raised: nothing is kept)',
    n_before, n_after, case when kb_before is not distinct from kb_after then 'unchanged' else 'CHANGED' end,
    (select count(*) from public.geo_wells where depth_ref_elev_m is not null),
    (select count(*) from public.geo_wells where depth_ref_elev_m is null),
    (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'geo_wells'
       and column_name in ('depth_ref_kind', 'depth_ref_label', 'depth_ref_elev_m', 'well_environment', 'ground_elev_m', 'water_depth_m', 'vertical_datum', 'elev_unit', 'datum_changes')),
    (select count(*) from pg_constraint where conrelid = 'public.geo_wells'::regclass and contype = 'c' and conname like 'geo_wells_%' and conname <> 'geo_wells_status_check'),
    report;
end
\$dryrun\$;
SQL
