/**
 * calculate-mbal's row mapping, shared by the edge function, the /dev
 * harness and the report's completeness test
 * (supabase/functions/_shared/mbal-run-mapping.ts).
 *
 * MBAL-U1-003 (S1): the engine reads the aquifer twice. The regression takes
 * it from aquifer_model (the run config); the pressure history match takes it
 * from has_aquifer (the case). The Aquifer tab saved the model and never the
 * flag, so a history match simulated a closed tank beside an aquifer
 * regression and returned an oil in place far too high, "converged", with
 * no warning. The mapping now derives the flag from the model.
 */
import { seedSampleStore, SAMPLE_CASE_IDS } from '../../harness/sampleCases';
import { runEngineOnStore } from '../../harness/engineStandIn';
import {
  buildEngineInputs, buildPlotData, buildResultColumns, pickCorrelations, PVT_CORRELATION_KEYS, PRODUCTION_UNUSED_COLUMNS,
} from '../../../../../../supabase/functions/_shared/mbal-run-mapping.ts';
import { computeMaterialBalance, runHistoryMatch } from '../../../../../../packages/engines/engines/mbal/mbalEngine.ts';

const rowsOf = (db, id) => ({
  rbCase: db.rb_cases.find((c) => c.id === id),
  cfg: db.rb_run_configs.find((c) => c.case_id === id),
  prod: db.rb_production_data.filter((r) => r.case_id === id).sort((a, b) => a.timestep_index - b.timestep_index),
});

describe('MBAL-U1-003: the aquifer flag follows the aquifer model', () => {
  const db = seedSampleStore();
  const { rbCase, cfg, prod } = rowsOf(db, SAMPLE_CASE_IDS.dake); // Dake Exercise 9.2: N = 312 MMSTB, Carter-Tracy aquifer

  test('a case whose flag was never set still runs its history match with the aquifer', () => {
    const asTheTabLeftIt = { ...rbCase, has_aquifer: false };
    const inputs = buildEngineInputs(asTheTabLeftIt, cfg, prod);
    expect(inputs.has_aquifer).toBe(true);
    expect(inputs.aquifer_model).toBe('carter_tracy');
    const hm = runHistoryMatch(inputs, {});
    expect(hm.matched_parameters.map((p) => p.key)).toEqual(['stoiip_stb', 'aquifer_radius_ft']);
    // within 10 percent of Dake's 312 MMSTB
    expect(hm.matched_ooip_stb / 1e6).toBeGreaterThan(281);
    expect(hm.matched_ooip_stb / 1e6).toBeLessThan(343);
    // the same answer as with the flag set
    const withFlag = runHistoryMatch(buildEngineInputs({ ...rbCase, has_aquifer: true }, cfg, prod), {});
    expect(hm.matched_ooip_stb).toBe(withFlag.matched_ooip_stb);
  });

  test('negative control: the engine handed the flag the tab left behind matches a closed tank', () => {
    const inputs = { ...buildEngineInputs(rbCase, cfg, prod), has_aquifer: false };
    const hm = runHistoryMatch(inputs, {});
    expect(hm.matched_parameters.map((p) => p.key)).toEqual(['stoiip_stb']); // the aquifer cannot even be fitted
    expect(hm.converged).toBe(true);
    expect(hm.warnings.join(' ')).not.toMatch(/aquifer/i);
    expect(hm.matched_ooip_stb / 1e6).toBeGreaterThan(500); // 535 MMSTB against a truth of 312
    // while the regression of the same inputs is right: it reads aquifer_model
    expect(computeMaterialBalance(inputs).estimated_ooip_stb / 1e6).toBeCloseTo(307.2, 1);
  });

  test('no aquifer model means no aquifer, whatever the case flag says', () => {
    expect(buildEngineInputs({ ...rbCase, has_aquifer: true }, { ...cfg, aquifer_model: 'none' }, prod).has_aquifer).toBe(false);
    expect(buildEngineInputs({ ...rbCase, has_aquifer: true }, { ...cfg, aquifer_model: null }, prod).has_aquifer).toBe(false);
  });

  test('a gas run reports its aquifer volume without the case flag', () => {
    const g = rowsOf(db, SAMPLE_CASE_IDS.pletcher);
    const r = computeMaterialBalance(buildEngineInputs({ ...g.rbCase, has_aquifer: false }, g.cfg, g.prod));
    expect(r.aquifer_owip_rb / 1e6).toBeCloseTo(69.04, 1);
    expect(r.aquifer_cumulative_we_rb).toBeGreaterThan(2e6);
  });
});

describe('what is handed to the engine', () => {
  const db = seedSampleStore();
  const { rbCase, cfg, prod } = rowsOf(db, SAMPLE_CASE_IDS.ahmed);

  test('only the five correlation choices of the jsonb reach the engine', () => {
    const withRecords = { ...cfg, pvt_correlations: { ...cfg.pvt_correlations, study: { v: 1, identification: { analyst: 'A. Okafor' } }, run_snapshot: { v: 1 }, lab_table_origin: { kind: 'correlation_prefill' } } };
    const inputs = buildEngineInputs(rbCase, withRecords, prod);
    expect(Object.keys(inputs.pvt_correlations).sort()).toEqual([...PVT_CORRELATION_KEYS].sort());
    expect(pickCorrelations(null)).toEqual({});
    // and the answer is the same with and without them
    expect(computeMaterialBalance(inputs).estimated_ooip_stb).toBe(computeMaterialBalance(buildEngineInputs(rbCase, cfg, prod)).estimated_ooip_stb);
  });

  test('the rows are mapped as the function always mapped them', () => {
    const inputs = buildEngineInputs(rbCase, cfg, prod);
    expect(inputs.production_data).toHaveLength(13);
    expect(inputs.production_data[1]).toMatchObject({ timestep_index: 1, pressure_psia: 3680, observation_date: '2011-01-01', cum_oil_stb: 20481, cum_water_stb: 0, bo_rb_stb: 1.3104, rs_scf_stb: 500 });
    expect(inputs.production_data[0].z_factor).toBeUndefined(); // a blank is "not supplied", never 0
    expect(inputs.solver_method).toBeUndefined(); // not forwarded: the engine derives it
    expect(inputs.excluded_timesteps).toEqual([]);
  });

  test('injected volumes are handed over and change nothing: the engine has no injection term', () => {
    const injected = prod.map((r) => ({ ...r, cum_water_inj_stb: r.timestep_index * 250000, cum_gas_inj_scf: r.timestep_index * 1e8 }));
    const a = computeMaterialBalance(buildEngineInputs(rbCase, cfg, prod));
    const b = computeMaterialBalance(buildEngineInputs(rbCase, cfg, injected));
    expect(PRODUCTION_UNUSED_COLUMNS).toEqual(['cum_water_inj_stb', 'cum_gas_inj_scf']);
    expect(b.estimated_ooip_stb).toBe(a.estimated_ooip_stb);
    expect(b.per_timestep.map((p) => p.F_rb)).toEqual(a.per_timestep.map((p) => p.F_rb));
  });
});

describe('what is stored with the result', () => {
  const db = seedSampleStore();
  const { rbCase, cfg, prod } = rowsOf(db, SAMPLE_CASE_IDS.dake);
  const inputs = buildEngineInputs(rbCase, cfg, prod);
  const result = computeMaterialBalance(inputs);
  const plot = buildPlotData(result, inputs, null);

  test('every series the studio read before is still there, one value per timestep', () => {
    for (const key of ['timestep_index', 'pressure', 'delta_p', 'F', 'Et', 'Eo', 'Eg_rb_mscf', 'Eg_oil', 'Bw', 'Efw', 'We', 'p_over_z', 'ddi', 'gdi', 'wdi', 'cdi', 'sdi', 'drive_index_sum', 'cum_oil_stb', 'cum_gas_scf', 'cum_water_stb', 'point_in_fit']) {
      expect(plot[key]).toHaveLength(11);
    }
    expect(plot.point_in_fit).toEqual([false, ...Array(10).fill(true)]);
    expect(plot.solver_method_used).toBe('havlena_odeh');
    expect(plot.history_match).toBeNull();
    expect(plot.sdi).toEqual(plot.cdi); // the deprecated mirror
  });

  test('what MBAL-U1 added: the PVT used, the dates, the tier and the engine version', () => {
    expect(plot.Bo).toEqual(prod.map((r) => r.bo_rb_stb));
    expect(plot.Rs[10]).toBe(364);
    expect(plot.observation_date[10]).toBe('1990-01-01');
    expect(plot.cum_water_inj_stb).toHaveLength(11);
    expect(plot.validation_tier).toBe('benchmark_verified');
    expect(plot.validation_reference).toMatch(/Dake \(1978\) Exercise 9\.2/);
    expect(plot.validation_tolerance_pct).toBe(1.53);
    expect(plot.engine_version).toBe(result.engine_version);
    expect(plot.regression_ooip_stb).toBe(result.estimated_ooip_stb);
  });

  test('a history match stores the matched volume as the headline and the regression volume beside it', () => {
    const hm = runHistoryMatch(inputs, {});
    const cols = buildResultColumns(hm.forward, inputs, hm);
    expect(cols.estimated_ooip_stb).toBe(hm.matched_ooip_stb);
    expect(cols.plot_data.regression_ooip_stb).toBe(hm.forward.estimated_ooip_stb);
    expect(cols.plot_data.history_match).toMatchObject({ converged: hm.converged, iterations: hm.iterations });
    expect(cols.plot_data.history_match.simulated_pressure_psia).toHaveLength(11);
    expect(cols.final_sdi).toBe(cols.final_cdi);
    expect(cols.warnings).toEqual([...hm.warnings, ...hm.forward.warnings]);
  });

  test('the /dev harness runs the same mapping', () => {
    const store = seedSampleStore();
    const { data, error } = runEngineOnStore(store, { run_config_id: 'cfg-dake' });
    expect(error).toBeNull();
    const row = store.rb_results.find((r) => r.run_id === data.run_id);
    expect(row.plot_data).toEqual(JSON.parse(JSON.stringify(plot)));
    expect(store.rb_runs.find((r) => r.id === data.run_id).status).toBe('completed');
  });
});
