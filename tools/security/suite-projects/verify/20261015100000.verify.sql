-- Verify 20261015100000_suite_projects_p0_tables.sql (read-only). Expect one row:
-- tables=5 rls_on=5 policies>=13 anon_any=false helpers_anon=false internal_auth=false rpcs=2
select
  (select count(*) from pg_class where relnamespace = 'public'::regnamespace and relname in
     ('suite_clients','suite_projects','suite_project_members','suite_project_access_log','suite_user_state')) as tables,
  (select count(*) from pg_class where relnamespace = 'public'::regnamespace and relrowsecurity and relname in
     ('suite_clients','suite_projects','suite_project_members','suite_project_access_log','suite_user_state')) as rls_on,
  (select count(*) from pg_policies where schemaname = 'public' and tablename like 'suite\_%' and
     tablename in ('suite_clients','suite_projects','suite_project_members','suite_project_access_log','suite_user_state')) as policies,
  (select bool_or(has_table_privilege('anon', 'public.' || t, 'select,insert,update,delete')) from unnest(array
     ['suite_clients','suite_projects','suite_project_members','suite_project_access_log','suite_user_state']) t) as anon_any,
  (select bool_or(has_function_privilege('anon', p.oid, 'execute')) from pg_proc p where p.pronamespace = 'public'::regnamespace
     and (p.proname like 'suite\_project%' or p.proname like 'suite\_client%')) as helpers_anon,
  (select bool_or(has_function_privilege('authenticated', p.oid, 'execute')) from pg_proc p where p.pronamespace = 'public'::regnamespace
     and p.proname in ('suite_org_member_as','suite_org_admin_as','suite_org_of','suite_project_can_read_as',
                       'suite_project_can_edit_as','suite_project_can_manage_as','suite_default_project_as','suite_log')) as internal_auth,
  (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('suite_project_bootstrap','suite_project_admin_open')
     and has_function_privilege('authenticated', oid, 'execute')) as rpcs;
