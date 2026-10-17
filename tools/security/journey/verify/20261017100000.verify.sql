-- Verify 20261017100000_suite_user_journey.sql: one row.
-- missing_sources must be empty: every seeded source table exists with its owner
-- and project columns, so no app silently counts as "no work".
select
  (select count(*) from public.suite_journey_work_sources) as sources,
  (select count(distinct app_id) from public.suite_journey_work_sources) as apps,
  (select string_agg(s.app_id || ':' || s.table_name, ', ' order by s.app_id)
     from public.suite_journey_work_sources s
    where not exists (select 1 from information_schema.columns c
                       where c.table_schema = 'public' and c.table_name = s.table_name and c.column_name = s.owner_column)
       or (s.project_column is not null and not exists (select 1 from information_schema.columns c
                       where c.table_schema = 'public' and c.table_name = s.table_name and c.column_name = s.project_column))) as missing_sources,
  (select relrowsecurity from pg_class where oid = 'public.suite_user_journey'::regclass) as journey_rls,
  (select relrowsecurity from pg_class where oid = 'public.suite_journey_work_sources'::regclass) as sources_rls,
  has_table_privilege('authenticated', 'public.suite_user_journey', 'insert') as client_can_insert,
  has_table_privilege('authenticated', 'public.suite_user_journey', 'update') as client_can_update,
  has_table_privilege('anon', 'public.suite_user_journey', 'select') as anon_can_select,
  has_function_privilege('anon', 'public.suite_journey_state(uuid, text[])', 'execute') as anon_can_state,
  (select prosecdef from pg_proc where oid = 'public.suite_journey_state(uuid, text[])'::regprocedure) as state_is_definer;
