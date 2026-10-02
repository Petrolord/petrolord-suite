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

  // MBAL-U1: a run keeps a snapshot of the case conditions and a digest of
  // the data rows, so the comparison needs no clock. The time stamp of Step
  // 0e did not survive the database: a trigger first stamped every update
  // (a rename withdrew a valid result), and since the record sharing guard
  // the stamp written after a data save is discarded.
  it('a rename, or any save that changes no engine input, does not make the run stale', () => {
    const renamed = { ...caseData, name: 'Renamed', description: 'new words', updated_at: '2026-10-05T10:00:00.000Z' };
    expect(assessRunStaleness({ ...fresh, caseData: renamed })).toEqual({ stale: false, reasons: [] });
  });

  it.each([
    ['initial pressure', { initial_pressure_psia: 3690 }],
    ['reservoir temperature', { reservoir_temperature_f: 180 }],
    ['initial water saturation', { initial_water_saturation: 0.25 }],
    ['bubble point', { bubble_point_psia: 1600 }],
    ['gas cap flag', { has_gas_cap: false }],
    ['aquifer flag', { has_aquifer: true }],
  ])('a change of the %s on the case makes the run stale and is named', (label, patch) => {
    const s = assessRunStaleness({ ...fresh, caseData: { ...caseData, ...patch } });
    expect(s.stale).toBe(true);
    expect(s.reasons.join(' ')).toContain(label);
  });

  it('a change the result does not echo (a date, injection, a per-row Bo) makes the run stale', () => {
    const withRow = (patch) => ({ ...caseData, production_data: [caseData.production_data[0], { ...caseData.production_data[1], ...patch }] });
    for (const patch of [{ observation_date: '2024-05-01' }, { cum_water_inj_stb: 5000 }, { bo_rb_stb: 1.31 }, { observed_we_rb: 100 }]) {
      const s = assessRunStaleness({ ...fresh, caseData: withRow(patch) });
      expect(s.stale).toBe(true);
      expect(s.reasons.join(' ')).toMatch(/data table was changed after the run/);
    }
    // a column the engine is not handed does not count
    expect(assessRunStaleness({ ...fresh, caseData: withRow({ id: 'other-id', created_at: '2026-12-01T00:00:00Z' }) }).stale).toBe(false);
  });

  it('a study record on the default config (identification, datum, sources) does not make the run stale', () => {
    const withStudy = { ...defaultCfg, pvt_correlations: { ...defaultCfg.pvt_correlations, study: { v: 1, identification: { analyst: 'A. Okafor' }, datum: { datum_depth_ft: 9000 } } } };
    expect(assessRunStaleness({ ...fresh, defaultCfg: withStudy })).toEqual({ stale: false, reasons: [] });
    // and the record is not copied into the run
    expect(buildRunConfigInput(caseData, withStudy).pvt_correlations.study).toBeUndefined();
    expect(buildRunConfigInput(caseData, withStudy).pvt_correlations.run_snapshot.case.initial_pressure_psia).toBe(3685);
  });

  it('a run made before the snapshot existed cannot be shown to be current, whatever the clock says', () => {
    const oldRunConfig = { ...runConfig, pvt_correlations: { pb_rs_bo: 'standing', oil_viscosity: 'beggs_robinson' } };
    const s = assessRunStaleness({ ...fresh, runConfig: oldRunConfig });
    expect(s.stale).toBe(true);
    expect(s.reasons.join(' ')).toMatch(/before the studio kept a record of the case conditions and the data/);
    expect(staleRunMessage(s)).toMatch(/Run the engine again/);
    // and no time stamp makes it current
    expect(assessRunStaleness({ ...fresh, runConfig: oldRunConfig, caseData: { ...caseData, updated_at: '2020-01-01T00:00:00Z' } }).stale).toBe(true);
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
