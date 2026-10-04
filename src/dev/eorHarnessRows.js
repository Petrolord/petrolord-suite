// Dev-only: the saved Well Test project (wta-1) and Material Balance case
// (mbal-1) the EOR Screening harness can read by id (EOR-U1 chain e2e).
// Values as in src/utils/eor/__tests__/eorTestKit.js. Never imported by
// production routes.
const TS = '2026-10-03T09:00:00.000Z';

export const EOR_HARNESS_WTA_ID = 'wt0e0000-0000-4000-8000-0000000e0e01';
export const EOR_HARNESS_MBAL_ID = 'rb0e0000-0000-4000-8000-0000000e0e01';

export function eorHarnessTables(userId) {
  const wta = {
    contract: 'wta-1',
    app: 'Well Test Analysis Studio',
    project: { id: EOR_HARNESS_WTA_ID, name: 'EK-3 buildup', well: 'EK-3', field: 'Ekene' },
    fluid: 'oil',
    permeability: { value: 182.4, kh: 7296, method: 'Horner straight line', ci95: null, window: { from_hr: 2, to_hr: 20, basis: 'shut-in time dt' } },
    skin: { total: 2.1 },
    pressure: { initial_psia: 4100, p_star_psia: 3985, average_psia: 3985, average_method: 'Extrapolated p* of the Horner straight line.', basis: 'absolute, at the gauge depth (no correction to a datum)' },
    temperature_degF: 205,
    status: { match: 'semilog', converged: null, note: null },
    computed_at: TS,
  };
  return {
    saved_well_test_projects: [{ id: EOR_HARNESS_WTA_ID, user_id: userId, project_name: 'EK-3 buildup', inputs_data: { name: 'EK-3 buildup', wta }, created_at: TS, updated_at: TS }],
    rb_cases: [{ id: EOR_HARNESS_MBAL_ID, user_id: userId, name: 'Ekene E-2000', field_name: 'Ekene', reservoir_name: 'E-2000', fluid_system: 'oil', initial_pressure_psia: 4100, created_at: TS, updated_at: TS }],
    rb_runs: [{ id: 'rbrun-e0e1', case_id: EOR_HARNESS_MBAL_ID, run_config_id: 'rbcfg-e0e1', status: 'completed', started_at: '2026-10-02T15:00:00Z', completed_at: '2026-10-02T15:00:05Z' }],
    rb_run_configs: [{ id: 'rbcfg-e0e1', case_id: EOR_HARNESS_MBAL_ID, aquifer_model: 'none' }],
    rb_results: [{
      id: 'rbres-e0e1', run_id: 'rbrun-e0e1', estimated_ooip_stb: 152000000, r_squared: 0.987, n_data_points: 3, drive_mechanism: 'solution_gas_drive',
      plot_data: { timestep_index: [0, 1, 2], pressure: [4100, 3800, 3420], observation_date: ['2024-06-30', '2025-06-30', '2026-06-30'], cum_oil_stb: [0, 1000000, 2000000], cum_gas_scf: [0, 0, 0], engine_version: 'harness' },
    }],
  };
}
