-- Verify 20261015100100_suite_projects_p0_registries.sql (read-only). Expect one row:
-- columns=9 restrictive=36 stamp_triggers=9 move_rpc=1 original_permissive_unchanged=true
select
  (select count(*) from information_schema.columns where table_schema = 'public' and column_name = 'suite_project_id' and table_name in
     ('geo_wells','geo_surfaces','geo_culture','geo_correlation_sections','geo_strat_units','strat_projects',
      'seismic_projects','seismic_volumes','seismic_lines')) as columns,
  (select count(*) from pg_policies where schemaname = 'public' and permissive = 'RESTRICTIVE' and policyname like '%\_project\_%'
      and roles = '{authenticated}') as restrictive,
  (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid where t.tgname = 'suite_project_stamp') as stamp_triggers,
  (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'suite_move_to_project') as move_rpc,
  (select count(*) = 0 from pg_policies where schemaname = 'public' and permissive = 'PERMISSIVE'
      and tablename in ('geo_wells','geo_surfaces','geo_culture','geo_correlation_sections','geo_strat_units','strat_projects',
                        'seismic_projects','seismic_volumes','seismic_lines')
      and (coalesce(qual,'') || coalesce(with_check,'')) like '%suite_project%') as original_permissive_unchanged;
