// PP3a families: generic saved projects, production operations, economics,
// simulation (docs/scope/ProjectPortability-PLAN.md §6, PP3). Importing this
// module registers them after Geoscience. Column facts are from the
// migrations and the PP3 survey recorded in ProjectPortability-STATUS.md.

import { registerFamily } from './familySpec';

// ---- generic saved projects (src/utils/savedProjects.js convention) --------
//
// One shape for every table: id, user_id, project_name, inputs_data jsonb,
// results_data jsonb (26 of them), created_at, updated_at, + PP0 columns.
// The only ids inside inputs_data point at the production spine (po_fields,
// po_wells) through the `link` block some contexts persist; all optional.

export const SAVED_PROJECT_TABLES = [
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
];

const LINK_REFS = [
  { path: 'inputs_data.inputs.link.fieldId', table: 'po_fields', optional: true },
  { path: 'inputs_data.inputs.link.wellId', table: 'po_wells', optional: true },
  { path: 'inputs_data.link.fieldId', table: 'po_fields', optional: true },
  { path: 'inputs_data.link.wellId', table: 'po_wells', optional: true },
  { path: 'inputs_data.inputs.fieldId', table: 'po_fields', optional: true },
  { path: 'inputs_data.fieldId', table: 'po_fields', optional: true },
  { path: 'inputs_data.inputs.trends.wellId', table: 'po_wells', optional: true },
  { path: 'inputs_data.inputs.dca.wellId', table: 'po_wells', optional: true },
];

registerFamily('apps', {
  tables: Object.fromEntries(SAVED_PROJECT_TABLES.map((t) => [t, {
    pk: 'id',
    kind: `saved-project:${t}`,
    stamped: true,
    scope: ['user_id'],
    nameColumn: 'project_name',
    // the payload repeats its own row id (service.save(id, { id, ... })): follow the new id
    softRefs: [{ path: 'inputs_data.id', table: t, optional: true }, ...LINK_REFS],
  }])),
  // one root kind for all 51 tables; the root names its table
  roots: { saved_project: '*' },
  order: SAVED_PROJECT_TABLES,
});

// ---- production operations (po_*) ------------------------------------------

registerFamily('production', {
  tables: {
    po_fields: {
      pk: 'id', stamped: true, scope: ['user_id', 'organization_id'],
      children: [{ table: 'po_wells', column: 'field_id' }, { table: 'po_field_totals', column: 'field_id' }],
      softRefs: [],
    },
    po_wells: {
      pk: 'id', scope: ['user_id'], parent: { table: 'po_fields', column: 'field_id' },
      children: [
        { table: 'po_well_models', column: 'well_id' }, { table: 'po_well_tests', column: 'well_id' },
        { table: 'po_deferments', column: 'well_id' }, { table: 'po_allocation_factors', column: 'well_id' },
        { table: 'po_daily_production', column: 'well_id' },
      ],
      // the registry link is a real column; when the well is not in the package it is cleared
      softRefs: [{ path: 'geo_well_id', table: 'geo_wells', optional: true }],
    },
    po_well_models: { pk: 'id', stamped: true, scope: ['user_id'], parent: { table: 'po_wells', column: 'well_id' }, softRefs: [] },
    po_well_tests: { pk: 'id', scope: ['user_id'], parent: { table: 'po_wells', column: 'well_id' }, softRefs: [] },
    po_deferments: { pk: 'id', scope: ['user_id'], parent: { table: 'po_wells', column: 'well_id' }, softRefs: [] },
    po_allocation_factors: { pk: 'id', scope: ['user_id'], parent: { table: 'po_wells', column: 'well_id' }, softRefs: [] },
    po_daily_production: { pk: 'id', scope: ['user_id'], parent: { table: 'po_wells', column: 'well_id' }, softRefs: [] },
    po_field_totals: { pk: 'id', scope: ['user_id'], parent: { table: 'po_fields', column: 'field_id' }, softRefs: [] },
  },
  roots: { po_field: 'po_fields' },
  order: ['po_fields', 'po_wells', 'po_well_models', 'po_well_tests', 'po_deferments', 'po_allocation_factors', 'po_daily_production', 'po_field_totals'],
});

// ---- economics (epe_*) -----------------------------------------------------
//
// Result tables are carried as data (they are the case's history), but the
// edge functions that write them are not involved in an import: the copy
// arrives with its runs and results as they were.

registerFamily('economics', {
  tables: {
    epe_cases: {
      pk: 'id', kind: 'epe-case', stamped: true, scope: ['user_id', 'organization_id'],
      nameColumn: 'case_name',
      children: [
        { table: 'epe_run_configs', column: 'case_id' }, { table: 'epe_production_volumes', column: 'case_id' },
        { table: 'epe_capex', column: 'case_id' }, { table: 'epe_opex', column: 'case_id' },
        { table: 'epe_runs', column: 'case_id' }, { table: 'epe_mc_runs', column: 'case_id' },
      ],
      softRefs: [],
    },
    epe_run_configs: { pk: 'id', stamped: true, scope: ['user_id'], parent: { table: 'epe_cases', column: 'case_id' }, softRefs: [] },
    epe_production_volumes: { pk: 'id', scope: ['user_id'], parent: { table: 'epe_cases', column: 'case_id' }, softRefs: [] },
    epe_capex: { pk: 'id', scope: ['user_id'], parent: { table: 'epe_cases', column: 'case_id' }, softRefs: [] },
    epe_opex: { pk: 'id', scope: ['user_id'], parent: { table: 'epe_cases', column: 'case_id' }, softRefs: [] },
    epe_runs: {
      pk: 'id', scope: ['user_id'], parent: { table: 'epe_cases', column: 'case_id' },
      children: [{ table: 'epe_results', column: 'run_id' }, { table: 'epe_sensitivity_runs', column: 'base_run_id' }],
      softRefs: [{ path: 'run_config_id', table: 'epe_run_configs', optional: true }],
    },
    epe_mc_runs: { pk: 'id', scope: ['user_id'], parent: { table: 'epe_cases', column: 'case_id' }, softRefs: [{ path: 'run_config_id', table: 'epe_run_configs', optional: true }] },
    epe_results: { pk: 'id', scope: ['user_id'], parent: { table: 'epe_runs', column: 'run_id' }, softRefs: [] },
    epe_sensitivity_runs: {
      pk: 'id', scope: ['user_id'], parent: { table: 'epe_runs', column: 'base_run_id' },
      children: [{ table: 'epe_sensitivity_results', column: 'sensitivity_run_id' }],
      softRefs: [{ path: 'base_run_config_id', table: 'epe_run_configs', optional: true }],
    },
    epe_sensitivity_results: { pk: 'id', scope: ['user_id'], parent: { table: 'epe_sensitivity_runs', column: 'sensitivity_run_id' }, softRefs: [] },
    epe_assumption_sets: { pk: 'id', stamped: true, scope: ['user_id', 'organization_id'], softRefs: [] },
  },
  roots: { epe_case: 'epe_cases', epe_assumption_set: 'epe_assumption_sets' },
  order: ['epe_cases', 'epe_run_configs', 'epe_production_volumes', 'epe_capex', 'epe_opex', 'epe_runs', 'epe_mc_runs', 'epe_results', 'epe_sensitivity_runs', 'epe_sensitivity_results', 'epe_assumption_sets'],
});

// ---- simulation (sim_cases) ------------------------------------------------
//
// The deck is a bundle of objects under {uid}/{caseId}/deck/; deck_path names
// the main .DATA file inside it. sim_runs are worker-owned results (client
// read-only, written through RPCs) and are not packaged: the copy arrives as
// a case ready to run.

const deckDir = (p) => (typeof p === 'string' && p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : null);

registerFamily('simulation', {
  tables: {
    sim_cases: {
      pk: 'id', kind: 'sim-case', stamped: true, scope: ['user_id', 'organization_id'],
      blob: {
        bucket: 'sim',
        contentType: 'application/octet-stream',
        prefixOf: (row) => deckDir(row.deck_path) || `${row.user_id}/${row.id}/deck/`,
        newPrefix: (userId, row) => `${userId}/${row.id}/deck/`,
        pathColumns: ['deck_path'],
      },
      softRefs: [],
    },
  },
  roots: { sim_case: 'sim_cases' },
  order: ['sim_cases'],
});

export const CORE_FAMILIES = ['apps', 'production', 'economics', 'simulation'];
