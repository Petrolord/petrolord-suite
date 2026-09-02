-- Project Portability PP0 (docs/scope/ProjectPortability-PLAN.md §4.3):
-- version discipline on every app-state table.
--
--   schema_version  integer NOT NULL DEFAULT 1
--       The shape version of the row as the writing app understood it.
--       Every loader opens rows through src/lib/stateVersion.js, which
--       migrates step-wise up to the build's current version and refuses
--       rows stamped NEWER than the build can read (the Petrel rule).
--       Existing rows are version 1 by definition: they were written
--       before any app declared a version, and each app's version-1
--       reader is exactly the tolerant reader it has today.
--   app_build       text NULL
--       The platform build (git sha) that last wrote the row, for
--       diagnosis and for the package manifest in PP1. Nullable so
--       edge functions and legacy writers keep working unchanged.
--   engine_version  text NULL
--       Already present on the 13 wp_* tables (added per wave); added
--       elsewhere so results rows can say which engine produced them.
--
-- Additive only, IF NOT EXISTS throughout, fast defaults (PG 11+, no
-- table rewrite). Tables that do not exist in a given environment are
-- skipped, so the file is safe on staging and production alike.
--
-- Shared registries (geo_wells*, geo_surfaces, geo_culture,
-- geoscience_settings, seismic_volumes/horizons/faults/lines/picks)
-- are NOT touched here: they get the same columns in
-- 20260902120500_pp0_registry_state_versions.sql, which is HELD for the
-- second-engineer review the database conventions require for shared
-- tables.

do $$
declare
  t text;
  tables text[] := array[
    -- the saved_<app>_projects convention (src/utils/savedProjects.js)
    'saved_allocation_projects', 'saved_blend_optimizer_projects', 'saved_breakeven_projects',
    'saved_carbon_projects', 'saved_choke_projects', 'saved_compressor_projects',
    'saved_corrosion_projects', 'saved_crude_assay_projects', 'saved_dca_projects',
    'saved_decision_tree_projects', 'saved_energy_efficiency_projects', 'saved_esp_projects',
    'saved_fdp_projects', 'saved_flare_projects', 'saved_flowassurance_projects',
    'saved_fluid_studio_projects', 'saved_fuel_pricing_projects', 'saved_gaslift_projects',
    'saved_gasprocessing_projects', 'saved_gaswell_projects', 'saved_heat_exchanger_projects',
    'saved_intervention_projects', 'saved_liftadvisor_projects', 'saved_linesizing_projects',
    'saved_lpg_cng_projects', 'saved_meter_projects', 'saved_modular_refinery_projects',
    'saved_network_projects', 'saved_nodal_analysis_projects', 'saved_npv_projects',
    'saved_pipeline_sizer_projects', 'saved_pump_projects', 'saved_pwt_projects',
    'saved_quickvol_projects', 'saved_refinery_plan_projects', 'saved_relief_projects',
    'saved_rf_projects', 'saved_rodpump_projects', 'saved_scal_projects',
    'saved_scenario_hub_projects', 'saved_separator_projects', 'saved_surveillance_projects',
    'saved_tank_projects', 'saved_terminal_projects', 'saved_valve_projects',
    'saved_voi_projects', 'saved_vrr_projects', 'saved_waterflood_design_projects',
    'saved_waterflood_projects', 'saved_well_test_projects',
    -- legacy per-app project tables with no live reader (kept until the DB cleanup)
    'flow_assurance_projects', 'production_surveillance_projects', 'wellbore_flow_projects',
    -- richer app-state tables (owner-scoped, jsonb state)
    'petro_projects', 'pp_projects', 'rp_projects', 'rcp_prospects', 'facility_layouts',
    'artificial_lift_designs', 'em_models', 'seismic_sessions', 'seismic_projects',
    'geo_correlation_sections', 'sim_cases',
    -- economics, production operations and well planning roots (org-scoped)
    'epe_cases', 'epe_assumption_sets', 'epe_run_configs',
    'po_fields', 'po_well_models',
    'wp_sites', 'wp_wellbores', 'wp_designs', 'wp_targets', 'wp_survey_programs',
    'wp_ac_cases', 'wp_cd_cases', 'wp_cmt_cases', 'wp_ct_cases', 'wp_gm_cases', 'wp_hyd_cases',
    'wp_ps_cases', 'wp_st_cases', 'wp_td_cases', 'wp_wc_cases', 'wp_wct_cases', 'wp_wi_cases'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is null then
      raise notice 'pp0: table % not present, skipped', t;
      continue;
    end if;
    execute format('alter table public.%I add column if not exists schema_version integer not null default 1', t);
    execute format('alter table public.%I add column if not exists app_build text', t);
    execute format('alter table public.%I add column if not exists engine_version text', t);
    execute format('comment on column public.%I.schema_version is %L', t,
      'PP0: row shape version; opened via src/lib/stateVersion.js (migrate up, refuse newer)');
  end loop;
end $$;
