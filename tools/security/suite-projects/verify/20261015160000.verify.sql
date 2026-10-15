-- Verify 20261015160000_suite_projects_qi_worker_tables.sql (read-only). Expect:
-- tables_with_column=2, restrictive=8, stamp_triggers=2, null_rows=0,
-- anon_select=false, client_insert_jobs=false, client_insert_datasets=false
select
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name in ('qi_jobs', 'qi_datasets') and column_name = 'suite_project_id') as tables_with_column,
  (select count(*) from pg_policies where schemaname = 'public' and tablename in ('qi_jobs', 'qi_datasets') and permissive = 'RESTRICTIVE' and policyname like '%\_project\_%') as restrictive,
  (select count(*) from pg_trigger g join pg_class c on c.oid = g.tgrelid where c.relname in ('qi_jobs', 'qi_datasets') and g.tgname = 'suite_project_stamp') as stamp_triggers,
  (select count(*) from public.qi_jobs where suite_project_id is null) + (select count(*) from public.qi_datasets where suite_project_id is null) as null_rows,
  has_table_privilege('anon', 'public.qi_jobs', 'select') or has_table_privilege('anon', 'public.qi_datasets', 'select') as anon_select,
  has_table_privilege('authenticated', 'public.qi_jobs', 'insert') as client_insert_jobs,
  has_table_privilege('authenticated', 'public.qi_datasets', 'insert') as client_insert_datasets;
