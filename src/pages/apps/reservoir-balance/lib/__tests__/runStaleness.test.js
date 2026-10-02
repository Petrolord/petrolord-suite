/**
 * H4 (Reservoir honesty sweep): a stored Material Balance run is stale when
 * any input that enters it changed after it.
 */
import {
  assessRunStaleness, buildRunConfigInput, changedConfigFields, dataMatchesRun, staleRunMessage,
} from '../runStaleness';

const caseData = {
  id: 'c1', fluid_system: 'oil_with_gas_cap', has_aquifer: false, has_gas_cap: true,
  initial_pressure_psia: 3685, reservoir_temperature_f: 175, initial_water_saturation: 0.24,
  bubble_point_psia: 1500, updated_at: '2026-10-01T09:00:00.000Z',
  production_data: [
    { timestep_index: 0, pressure_psia: 3685, cum_oil_stb: 0, cum_gas_scf: 0, cum_water_stb: 0, created_at: '2026-10-01T09:00:00.000Z' },
    { timestep_index: 1, pressure_psia: 3600, cum_oil_stb: 20000, cum_gas_scf: 1e7, cum_water_stb: null, created_at: '2026-10-01T09:00:00.000Z' },
  ],
};
const defaultCfg = {
  oil_gravity_api: 35, gas_specific_gravity: 0.7, water_salinity_ppm: 50000,
  pvt_source: 'correlated', pvt_correlations: { pb_rs_bo: 'standing', oil_viscosity: 'beggs_robinson' },
  pvt_lab_table: null, formation_compressibility_psi: 4.95e-6, water_compressibility_psi: 3.62e-6,
  aquifer_model: 'none', aquifer_params: null, gas_cap_ratio_m: 0.3, excluded_timesteps: [],
};
// the run as the Run tab makes it: the config row is built by the same function
const runConfig = { id: 'rc1', is_scenario: true, ...buildRunConfigInput(caseData, defaultCfg) };
const run = { id: 'r1', run_config_id: 'rc1', status: 'completed', started_at: '2026-10-01T10:00:00.000Z' };
const result = {
  run_id: 'r1',
  plot_data: {
    timestep_index: [0, 1], pressure: [3685, 3600], cum_oil_stb: [0, 20000], cum_gas_scf: [0, 1e7], cum_water_stb: [0, 0],
    history_match: { converged: true, iterations: 7 },
  },
};
const fresh = { caseData, defaultCfg, run, runConfig, result };

describe('H4: is the stored run still the run of the current inputs', () => {
  it('negative control: untouched inputs are not stale', () => {
    expect(assessRunStaleness(fresh)).toEqual({ stale: false, reasons: [] });
    expect(staleRunMessage(assessRunStaleness(fresh))).toBeNull();
    // key order and numeric text do not count as a change
    const reordered = { ...defaultCfg, oil_gravity_api: '35.0', pvt_correlations: { oil_viscosity: 'beggs_robinson', pb_rs_bo: 'standing' } };
    expect(assessRunStaleness({ ...fresh, defaultCfg: reordered }).stale).toBe(false);
  });

  it('no result is nothing to be stale', () => {
    expect(assessRunStaleness({ caseData, defaultCfg, run: null, runConfig: null, result: null }).stale).toBe(false);
  });

  it.each([
    ['oil gravity', { oil_gravity_api: 38 }],
    ['PVT correlations', { pvt_correlations: { pb_rs_bo: 'vasquez_beggs', oil_viscosity: 'beggs_robinson' } }],
    ['PVT source', { pvt_source: 'lab_table' }],
    ['PVT table', { pvt_lab_table: [{ pressure_psia: 3000, bo_rb_stb: 1.3 }] }],
    ['formation compressibility', { formation_compressibility_psi: 6e-6 }],
    ['aquifer model', { aquifer_model: 'fetkovich' }],
    ['aquifer parameters', { aquifer_params: { J: 12 } }],
    ['gas cap ratio m', { gas_cap_ratio_m: 0.5 }],
    ['excluded timesteps', { excluded_timesteps: [1] }],
  ])('an edit to %s after the run makes it stale and is named', (label, patch) => {
    const s = assessRunStaleness({ ...fresh, defaultCfg: { ...defaultCfg, ...patch } });
    expect(s.stale).toBe(true);
    expect(s.reasons.join(' ')).toContain(label);
    expect(staleRunMessage(s)).toMatch(/earlier run/);
  });

  it('a changed pressure or cumulative makes it stale; so does a dropped row', () => {
    const edited = { ...caseData, production_data: [caseData.production_data[0], { ...caseData.production_data[1], pressure_psia: 3590 }] };
    expect(dataMatchesRun(edited.production_data, result.plot_data)).toBe(false);
    expect(assessRunStaleness({ ...fresh, caseData: edited }).reasons[0]).toMatch(/pressure and production table differs/);
    const shorter = { ...caseData, production_data: [caseData.production_data[0]] };
    expect(assessRunStaleness({ ...fresh, caseData: shorter }).stale).toBe(true);
    // a blank cumulative and the zero the engine was sent are the same input
    expect(dataMatchesRun(caseData.production_data, result.plot_data)).toBe(true);
  });

  it('a case stamped after the run start is stale (case conditions, injection, lab columns)', () => {
    const stamped = { ...caseData, updated_at: '2026-10-01T10:00:00.001Z' };
    const s = assessRunStaleness({ ...fresh, caseData: stamped });
    expect(s.stale).toBe(true);
    expect(s.reasons[0]).toMatch(/saved after the run/);
    const before = { ...caseData, updated_at: '2026-10-01T09:59:59.999Z' };
    expect(assessRunStaleness({ ...fresh, caseData: before }).stale).toBe(false);
  });

  it('a run whose config cannot be read back is not presented as current', () => {
    expect(assessRunStaleness({ ...fresh, runConfig: null }).stale).toBe(true);
  });

  it('the run inherits the gas cap ratio and the excluded points', () => {
    const cfg = buildRunConfigInput(caseData, { ...defaultCfg, excluded_timesteps: [1, 2] });
    expect(cfg.gas_cap_ratio_m).toBe(0.3);
    expect(cfg.excluded_timesteps).toEqual([1, 2]);
    // a run stored before this fix never received m: it is stale against a default that states one
    const oldRun = { ...runConfig, gas_cap_ratio_m: null };
    expect(changedConfigFields(caseData, defaultCfg, oldRun)).toEqual(['gas_cap_ratio_m']);
    // blank stays "not stated" (null), never 0
    expect(buildRunConfigInput(caseData, { ...defaultCfg, gas_cap_ratio_m: null }).gas_cap_ratio_m).toBeNull();
  });
});
