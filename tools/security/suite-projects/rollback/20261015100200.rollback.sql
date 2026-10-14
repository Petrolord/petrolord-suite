-- Rollback of 20261015100200_suite_projects_p0_backfill.sql (run FIRST of the three rollbacks).
-- Clears the stamp on every registry row and removes the default projects the
-- backfill (or the on-demand default) made, when they hold nothing else.
-- No registry row is deleted. Sharing triggers are disabled around the clear,
-- as in the backfill. No transaction lines; run with
--   supabase db query --linked -f tools/security/suite-projects/rollback/20261015100200.rollback.sql
alter table public.geo_wells disable trigger suite_record_guard;
alter table public.geo_wells disable trigger suite_record_log;
alter table public.geo_correlation_sections disable trigger suite_record_guard;
alter table public.geo_correlation_sections disable trigger suite_record_log;
alter table public.seismic_projects disable trigger suite_record_guard;
alter table public.seismic_projects disable trigger suite_record_log;
do $$
declare t text;
begin
    foreach t in array array['geo_wells', 'geo_surfaces', 'geo_culture', 'geo_correlation_sections', 'geo_strat_units',
                             'strat_projects', 'seismic_projects', 'seismic_volumes', 'seismic_lines'] loop
        if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'suite_project_id') then
            execute format('update public.%I set suite_project_id = null where suite_project_id in (select id from public.suite_projects where is_default)', t);
        end if;
    end loop;
end $$;
alter table public.geo_wells enable trigger suite_record_guard;
alter table public.geo_wells enable trigger suite_record_log;
alter table public.geo_correlation_sections enable trigger suite_record_guard;
alter table public.geo_correlation_sections enable trigger suite_record_log;
alter table public.seismic_projects enable trigger suite_record_guard;
alter table public.seismic_projects enable trigger suite_record_log;
delete from public.suite_projects where is_default;
