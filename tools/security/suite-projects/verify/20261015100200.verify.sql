-- Verify 20261015100200_suite_projects_p0_backfill.sql (read-only). Expect:
-- one org default per organisation, null_rows=0 on every table, sharing triggers enabled ('O').
select 'org_defaults' k, (select count(*) from public.suite_projects where is_default and organization_id is not null)::text
       || ' of ' || (select count(*) from public.organizations)::text v
union all select 'personal_defaults', (select count(*) from public.suite_projects where is_default and organization_id is null)::text
union all select 'null_rows', (
  (select count(*) from public.geo_wells where suite_project_id is null) + (select count(*) from public.geo_surfaces where suite_project_id is null)
  + (select count(*) from public.geo_culture where suite_project_id is null) + (select count(*) from public.geo_correlation_sections where suite_project_id is null)
  + (select count(*) from public.geo_strat_units where suite_project_id is null) + (select count(*) from public.strat_projects where suite_project_id is null)
  + (select count(*) from public.seismic_projects where suite_project_id is null) + (select count(*) from public.seismic_volumes where suite_project_id is null)
  + (select count(*) from public.seismic_lines where suite_project_id is null))::text
union all select 'members_only_projects', (select count(*) from public.suite_projects where visibility = 'members')::text
union all select 'sharing_triggers_enabled', (select string_agg(c.relname || '.' || t.tgname || '=' || t.tgenabled::text, ' ' order by 1)
  from pg_trigger t join pg_class c on c.oid = t.tgrelid where t.tgname in ('suite_record_guard','suite_record_log')
   and c.relname in ('geo_wells','geo_correlation_sections','seismic_projects'));
