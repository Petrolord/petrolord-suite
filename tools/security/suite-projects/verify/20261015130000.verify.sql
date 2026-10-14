-- Verify 20261015130000_suite_projects_p4_app_tables.sql (read-only). Expect:
-- tables_with_column = restrictive/4 = stamp_triggers (77 where every table exists), null_rows=0, move_knows_p4=true
with t as (
  select c.table_name from information_schema.columns c
   where c.table_schema = 'public' and c.column_name = 'suite_project_id'
     and c.table_name not in ('geo_wells','geo_surfaces','geo_culture','geo_correlation_sections','geo_strat_units','strat_projects',
                              'seismic_projects','seismic_volumes','seismic_lines'))
select
  (select count(*) from t) as tables_with_column,
  (select count(*) from pg_policies p join t on t.table_name = p.tablename where p.permissive = 'RESTRICTIVE' and p.policyname like '%\_project\_%') as restrictive,
  (select count(*) from pg_trigger g join pg_class c on c.oid = g.tgrelid join t on t.table_name = c.relname where g.tgname = 'suite_project_stamp') as stamp_triggers,
  (select sum((xpath('/row/n/text()', query_to_xml(format('select count(*) n from public.%I where suite_project_id is null', t.table_name), false, true, '')))[1]::text::int) from t) as null_rows,
  (select pg_get_functiondef('public.suite_move_to_project(text, uuid[], uuid)'::regprocedure) like '%saved_well_test_projects%') as move_knows_p4;
