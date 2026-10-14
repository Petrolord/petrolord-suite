-- Rollback of 20261015100100_suite_projects_p0_registries.sql (run SECOND).
-- Drops the RESTRICTIVE project policies, the insert stamp, the move RPC and the
-- suite_project_id column on the nine registries. The original permissive
-- policies were never touched, so access returns to exactly the pre-P0 state.
-- WARNING: dropping the column forgets which project each row was in. Export
-- `select id, suite_project_id from <table>` first if that must be kept.
-- No transaction lines.
do $$
declare t text;
begin
    foreach t in array array['geo_wells', 'geo_surfaces', 'geo_culture', 'geo_correlation_sections', 'geo_strat_units',
                             'strat_projects', 'seismic_projects', 'seismic_volumes', 'seismic_lines'] loop
        execute format('drop policy if exists %I on public.%I', t || '_project_read', t);
        execute format('drop policy if exists %I on public.%I', t || '_project_insert', t);
        execute format('drop policy if exists %I on public.%I', t || '_project_update', t);
        execute format('drop policy if exists %I on public.%I', t || '_project_delete', t);
        execute format('drop trigger if exists suite_project_stamp on public.%I', t);
        execute format('drop index if exists public.%I', t || '_suite_project_idx');
        execute format('alter table public.%I drop column if exists suite_project_id', t);
    end loop;
end $$;
drop function if exists public.suite_move_to_project(text, uuid[], uuid);
drop function if exists public.suite_project_stamp();
drop function if exists public.suite_project_for_new_row(uuid, uuid);
notify pgrst, 'reload schema';
