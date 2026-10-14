-- Suite Projects P4: the remaining apps' project tables adopt the project.
-- Design: docs/scope/SuiteProject-DESIGN.md sections 4, 8 and 16. Needs the P0
-- migrations (20261015100000..100200), applied 2026-10-14.
--
-- The same pattern as the P0 registries, on 77 ROOT tables (an app's
-- project, case, site or field); their child tables (runs, results, cases,
-- wellbores, volumes...) follow the root and get no column:
--   Geoscience apps   petro_projects, pp_projects, rp_projects, em_models,
--                     bf_wells, rcp_prospects, rrv_valuations, and the saved
--                     QI Studio and ReservoirCalc Pro projects
--   every saved_*_projects and scm_*_projects table (the shared saved-project
--                     service of the Reservoir, Production, Facilities,
--                     Economics, Midstream and Downstream apps)
--   Drilling          wp_sites (every wp_* table hangs from a site)
--   Economics         epe_cases, epe_assumption_sets
--   Production        po_fields
--   Material balance  rb_cases
--   Simulation        sim_cases
--
-- For each table: nullable suite_project_id (FK suite_projects, on delete
-- restrict) and index; the insert stamp trigger (current project, else
-- default); RESTRICTIVE policies to authenticated (rows in an open project
-- keep exactly today's access; members-only rows go to owner, members and
-- logged org admins; the row's creator always); backfill of every existing
-- row into its creator's default project (same rule as P0), with the
-- organisation-sharing triggers disabled around the stamp where a table has
-- them; and a final check that raises (rolling everything back) if any row
-- is left without a project. suite_move_to_project learns these tables.
--
-- Idempotent; no transaction lines. Rollback:
-- tools/security/suite-projects/rollback/20261015130000.rollback.sql

do $$
declare
    t text; has_org boolean; org_expr text; trg record; n bigint; total bigint := 0;
    tables constant text[] := array[
    'petro_projects', 'pp_projects', 'rp_projects', 'em_models', 'bf_wells', 'rcp_prospects',
    'rrv_valuations', 'saved_allocation_projects', 'saved_blend_optimizer_projects',
    'saved_breakeven_projects', 'saved_carbon_projects', 'saved_casing_design_projects',
    'saved_choke_projects', 'saved_compressor_projects', 'saved_compressor_pump_projects',
    'saved_corrosion_projects', 'saved_crude_assay_projects', 'saved_dca_projects',
    'saved_decision_tree_projects', 'saved_drilling_fluids_projects', 'saved_energy_efficiency_projects',
    'saved_eor_screening_projects', 'saved_esp_projects', 'saved_fdp_projects', 'saved_flare_projects',
    'saved_flowassurance_projects', 'saved_fluid_studio_projects', 'saved_fuel_pricing_projects',
    'saved_gaslift_projects', 'saved_gasprocessing_projects', 'saved_gaswell_projects',
    'saved_heat_exchanger_projects', 'saved_intervention_projects', 'saved_liftadvisor_projects',
    'saved_linesizing_projects', 'saved_lpg_cng_projects', 'saved_mbal_projects', 'saved_meter_projects',
    'saved_modular_refinery_projects', 'saved_network_projects', 'saved_nodal_analysis_projects',
    'saved_npv_projects', 'saved_petrophysics_projects', 'saved_pipeline_sizer_projects',
    'saved_pump_projects', 'saved_pvt_projects', 'saved_pwt_projects', 'saved_qi_studio_projects',
    'saved_quickvol_projects', 'saved_refinery_plan_projects', 'saved_relief_projects',
    'saved_report_autopilot_projects', 'saved_reservoir_balance_projects', 'saved_rf_projects',
    'saved_rodpump_projects', 'saved_scal_projects', 'saved_scenario_hub_projects',
    'saved_separator_projects', 'saved_surveillance_projects', 'saved_tank_projects',
    'saved_terminal_projects', 'saved_valve_projects', 'saved_voi_projects', 'saved_vrr_projects',
    'saved_waterflood_design_projects', 'saved_well_cost_iq_projects', 'saved_well_cost_projects',
    'saved_well_spacing_projects', 'saved_well_test_projects', 'scm_marine_projects',
    'scm_materials_projects', 'wp_sites', 'epe_cases', 'epe_assumption_sets', 'po_fields', 'rb_cases',
    'sim_cases'
    ];
begin
    foreach t in array tables loop
        if to_regclass('public.' || t) is null then
            raise notice 'suite projects p4: % does not exist here, skipped', t;
            continue;
        end if;
        execute format('alter table public.%I add column if not exists suite_project_id uuid
                        references public.suite_projects(id) on delete restrict', t);
        execute format('create index if not exists %I on public.%I (suite_project_id)', t || '_suite_project_idx', t);
        execute format('comment on column public.%I.suite_project_id is %L', t,
            'Suite Projects: the project this row belongs to. Stamped on insert by suite_project_stamp (P4). See docs/scope/SuiteProject-DESIGN.md.');

        has_org := exists (select 1 from information_schema.columns
                            where table_schema = 'public' and table_name = t and column_name = 'organization_id');
        org_expr := case when has_org then 'organization_id' else 'null::uuid' end;

        execute format('drop trigger if exists suite_project_stamp on public.%I', t);
        execute format('create trigger suite_project_stamp before insert on public.%I
                        for each row execute function public.suite_project_stamp()', t);

        execute format('drop policy if exists %I on public.%I', t || '_project_read', t);
        execute format('create policy %I on public.%I as restrictive for select to authenticated
                        using (user_id = auth.uid() or public.suite_project_row_visible(suite_project_id))', t || '_project_read', t);
        execute format('drop policy if exists %I on public.%I', t || '_project_insert', t);
        execute format('create policy %I on public.%I as restrictive for insert to authenticated
                        with check (public.suite_project_row_writable(suite_project_id, %s))', t || '_project_insert', t, org_expr);
        execute format('drop policy if exists %I on public.%I', t || '_project_update', t);
        execute format('create policy %I on public.%I as restrictive for update to authenticated
                        using (user_id = auth.uid() or public.suite_project_row_visible(suite_project_id))
                        with check (public.suite_project_row_writable(suite_project_id, %s))', t || '_project_update', t, org_expr);
        execute format('drop policy if exists %I on public.%I', t || '_project_delete', t);
        execute format('create policy %I on public.%I as restrictive for delete to authenticated
                        using (user_id = auth.uid() or public.suite_project_row_visible(suite_project_id))', t || '_project_delete', t);

        -- backfill: the creator's default project (row org default, creator org default, personal)
        for trg in select tgname from pg_trigger
                    where tgrelid = ('public.' || t)::regclass and not tgisinternal
                      and tgname in ('suite_record_guard', 'suite_record_log') loop
            execute format('alter table public.%I disable trigger %I', t, trg.tgname);
        end loop;
        -- creators without an organisation get their personal default first
        execute format('select count(*) from (select public.suite_default_project_as(x.user_id) from
                          (select distinct user_id from public.%I where suite_project_id is null and user_id is not null) x
                          where public.suite_org_of(x.user_id) is null
                            and exists (select 1 from auth.users u where u.id = x.user_id)) y', t) into n;
        execute format('update public.%I r set suite_project_id = coalesce(
                (select p.id from public.suite_projects p where p.is_default and p.organization_id is not null and p.organization_id = %s),
                (select p.id from public.suite_projects p where p.is_default and p.organization_id = public.suite_org_of(r.user_id)),
                (select p.id from public.suite_projects p where p.is_default and p.organization_id is null and p.owner_user_id = r.user_id))
              where r.suite_project_id is null', t, case when has_org then 'r.organization_id' else 'null::uuid' end);
        for trg in select tgname from pg_trigger
                    where tgrelid = ('public.' || t)::regclass and not tgisinternal
                      and tgname in ('suite_record_guard', 'suite_record_log') loop
            execute format('alter table public.%I enable trigger %I', t, trg.tgname);
        end loop;

        execute format('select count(*) from public.%I where suite_project_id is null', t) into n;
        if n > 0 then
            raise notice 'suite projects p4: % rows of % have no project', n, t;
            total := total + n;
        end if;
    end loop;
    if total > 0 then
        raise exception 'Suite projects P4 backfill left % rows without a project; nothing applied.', total;
    end if;
end $$;

-- Move to project learns the P4 tables (owner of the rows, editable target, logged)
create or replace function public.suite_move_to_project(p_table text, p_ids uuid[], p_target uuid)
returns integer language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
    uid uuid := auth.uid();
    allowed constant text[] := array[
    'geo_wells', 'geo_surfaces', 'geo_culture', 'geo_correlation_sections', 'geo_strat_units',
    'strat_projects', 'seismic_projects', 'seismic_volumes', 'seismic_lines', 'petro_projects',
    'pp_projects', 'rp_projects', 'em_models', 'bf_wells', 'rcp_prospects', 'rrv_valuations',
    'saved_allocation_projects', 'saved_blend_optimizer_projects', 'saved_breakeven_projects',
    'saved_carbon_projects', 'saved_casing_design_projects', 'saved_choke_projects',
    'saved_compressor_projects', 'saved_compressor_pump_projects', 'saved_corrosion_projects',
    'saved_crude_assay_projects', 'saved_dca_projects', 'saved_decision_tree_projects',
    'saved_drilling_fluids_projects', 'saved_energy_efficiency_projects', 'saved_eor_screening_projects',
    'saved_esp_projects', 'saved_fdp_projects', 'saved_flare_projects', 'saved_flowassurance_projects',
    'saved_fluid_studio_projects', 'saved_fuel_pricing_projects', 'saved_gaslift_projects',
    'saved_gasprocessing_projects', 'saved_gaswell_projects', 'saved_heat_exchanger_projects',
    'saved_intervention_projects', 'saved_liftadvisor_projects', 'saved_linesizing_projects',
    'saved_lpg_cng_projects', 'saved_mbal_projects', 'saved_meter_projects',
    'saved_modular_refinery_projects', 'saved_network_projects', 'saved_nodal_analysis_projects',
    'saved_npv_projects', 'saved_petrophysics_projects', 'saved_pipeline_sizer_projects',
    'saved_pump_projects', 'saved_pvt_projects', 'saved_pwt_projects', 'saved_qi_studio_projects',
    'saved_quickvol_projects', 'saved_refinery_plan_projects', 'saved_relief_projects',
    'saved_report_autopilot_projects', 'saved_reservoir_balance_projects', 'saved_rf_projects',
    'saved_rodpump_projects', 'saved_scal_projects', 'saved_scenario_hub_projects',
    'saved_separator_projects', 'saved_surveillance_projects', 'saved_tank_projects',
    'saved_terminal_projects', 'saved_valve_projects', 'saved_voi_projects', 'saved_vrr_projects',
    'saved_waterflood_design_projects', 'saved_well_cost_iq_projects', 'saved_well_cost_projects',
    'saved_well_spacing_projects', 'saved_well_test_projects', 'scm_marine_projects',
    'scm_materials_projects', 'wp_sites', 'epe_cases', 'epe_assumption_sets', 'po_fields', 'rb_cases',
    'sim_cases'
    ];
    v_org uuid; has_org boolean; n_owned integer; n_bad_org integer; n integer; src record;
begin
    if uid is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
    if p_table is null or not (p_table = any (allowed)) or to_regclass('public.' || p_table) is null then
        raise exception 'This kind of record cannot be moved.' using errcode = '22023';
    end if;
    if not public.suite_project_can_edit_as(p_target, uid) then
        raise exception 'You cannot add data to that project.' using errcode = '42501';
    end if;
    if p_ids is null or cardinality(p_ids) = 0 then return 0; end if;
    if cardinality(p_ids) > 5000 then raise exception 'Move at most 5000 records at a time.' using errcode = '22023'; end if;
    select organization_id into v_org from public.suite_projects where id = p_target;
    if exists (select 1 from public.suite_projects where id = p_target and status <> 'active') then
        raise exception 'That project is archived.' using errcode = '22023';
    end if;

    execute format('select count(*) from public.%I where id = any ($1) and user_id = $2', p_table)
       into n_owned using p_ids, uid;
    if n_owned <> cardinality(array(select distinct unnest(p_ids))) then
        raise exception 'You can move only records you own.' using errcode = '42501';
    end if;
    has_org := exists (select 1 from information_schema.columns
                        where table_schema = 'public' and table_name = p_table and column_name = 'organization_id');
    if has_org and v_org is not null then
        execute format('select count(*) from public.%I where id = any ($1) and organization_id is not null and organization_id <> $2', p_table)
           into n_bad_org using p_ids, v_org;
        if n_bad_org > 0 then
            raise exception 'Some records are shared with another organisation.' using errcode = '22023';
        end if;
    end if;

    for src in execute format('select suite_project_id as pid, count(*) as c from public.%I
                                where id = any ($1) and suite_project_id is distinct from $2 group by 1', p_table)
               using p_ids, p_target loop
        if src.pid is not null then
            perform public.suite_log(src.pid, (select organization_id from public.suite_projects where id = src.pid),
                'rows_moved_out', jsonb_build_object('table', p_table, 'count', src.c, 'to', p_target));
        end if;
    end loop;

    execute format('update public.%I set suite_project_id = $1 where id = any ($2) and suite_project_id is distinct from $1', p_table)
       using p_target, p_ids;
    get diagnostics n = row_count;
    if n > 0 then
        perform public.suite_log(p_target, v_org, 'rows_moved_in', jsonb_build_object('table', p_table, 'count', n));
    end if;
    return n;
end $$;
revoke all on function public.suite_move_to_project(text, uuid[], uuid) from public, anon;
grant execute on function public.suite_move_to_project(text, uuid[], uuid) to authenticated;

notify pgrst, 'reload schema';
