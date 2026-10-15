-- Verify 20261016100000_local_workspace_l1.sql (read-only). Expect:
-- volume_columns=5, qi_columns=3, new_tables=3, rls_on=3, policies=11,
-- anon_any=false, claim_filtered=true, sweep_filtered=true, enqueue_filtered=true,
-- local_fns=2, local_fns_auth=true, local_fns_anon=false, local_fns_public=false,
-- existing_non_cloud=0, existing_non_server=0 (right after the apply)
select
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'seismic_volumes'
     and column_name in ('storage_location', 'content_id', 'brick_root', 'device_id', 'previews')) as volume_columns,
  (select count(*) from information_schema.columns where table_schema = 'public'
     and ((table_name = 'qi_jobs' and column_name in ('executor', 'device_id')) or (table_name = 'qi_datasets' and column_name = 'storage_location'))) as qi_columns,
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public'
     and c.relname in ('seismic_devices', 'seismic_volume_replicas', 'seismic_copy_requests')) as new_tables,
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public'
     and c.relname in ('seismic_devices', 'seismic_volume_replicas', 'seismic_copy_requests') and c.relrowsecurity) as rls_on,
  (select count(*) from pg_policies where schemaname = 'public'
     and tablename in ('seismic_devices', 'seismic_volume_replicas', 'seismic_copy_requests')) as policies,
  (select bool_or(has_table_privilege('anon', 'public.' || t, 'select') or has_table_privilege('anon', 'public.' || t, 'insert')
                  or has_table_privilege('anon', 'public.' || t, 'update') or has_table_privilege('anon', 'public.' || t, 'delete'))
     from unnest(array['seismic_devices', 'seismic_volume_replicas', 'seismic_copy_requests']) t) as anon_any,
  (select prosrc ~ 'q\.executor = ''server''' from pg_proc where oid = 'public.qi_claim_job(text, text[])'::regprocedure) as claim_filtered,
  (select prosrc ~ 'browser_closed' and prosrc ~ 'executor = ''server''' from pg_proc where oid = 'public.qi_sweep_stale_jobs(int, int)'::regprocedure) as sweep_filtered,
  (select prosrc ~ 'storage_location = ''local''' and prosrc ~ 'executor = ''server''' from pg_proc where oid = 'public.qi_enqueue_job(text, jsonb, jsonb, uuid)'::regprocedure) as enqueue_filtered,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
     and p.proname in ('qi_start_local_job', 'qi_update_local_job')) as local_fns,
  (has_function_privilege('authenticated', 'public.qi_start_local_job(text, jsonb, jsonb, text, uuid, uuid)', 'execute')
     and has_function_privilege('authenticated', 'public.qi_update_local_job(uuid, real, text, text, jsonb, text, text, text, real)', 'execute')) as local_fns_auth,
  (has_function_privilege('anon', 'public.qi_start_local_job(text, jsonb, jsonb, text, uuid, uuid)', 'execute')
     or has_function_privilege('anon', 'public.qi_update_local_job(uuid, real, text, text, jsonb, text, text, text, real)', 'execute')) as local_fns_anon,
  (select bool_or(a.grantee = 0) from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where p.oid in ('public.qi_start_local_job(text, jsonb, jsonb, text, uuid, uuid)'::regprocedure,
                     'public.qi_update_local_job(uuid, real, text, text, jsonb, text, text, text, real)'::regprocedure)
       and a.privilege_type = 'EXECUTE') as local_fns_public,
  (select count(*) from public.seismic_volumes where storage_location <> 'cloud') as existing_non_cloud,
  (select count(*) from public.qi_jobs where executor <> 'server') as existing_non_server;
