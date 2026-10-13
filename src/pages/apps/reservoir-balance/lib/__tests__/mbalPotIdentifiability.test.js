/**
 * A pot aquifer the data cannot see is flagged, not reported as a strong
 * water drive.
 *
 * Above the bubble point the oil, rock and water expansions and the pot
 * influx all grow in step with the pressure drop, so on the pot aquifer plot
 * (F/Eo against dp/Eo) every point sits at nearly the same x. Forced onto the
 * Ekene closed tank (kit 09-reservoir/ekene-mbal-tank-history.csv) the engine
 * returned an OOIP of 72.8 thousand STB, W 40.9 MMRB and a strong water
 * drive at r2 0.999998, with no warning and its benchmark badge. These gates
 * run the canonical engine through the studio's own path (mbalTestKit) and
 * read the series, the report model and its summary.
 */
import { buildMbalSeries, regressionIdentifiability, POT_SPREAD_MIN } from '../mbalSeries';
import { collectMbalReportArgs } from '../reportModel';
import { runSample, SAMPLE_CASE_IDS } from './mbalTestKit';

const EKENE = [
  ['2020-01-01', 3200.0, 0, 0, 1.2],
  ['2020-07-01', 3037.7388, 38864.2339, 15545693.55, 1.202337],
  ['2021-01-01', 2782.9151, 99594.7404, 39837896.16, 1.206006],
  ['2021-07-01', 2562.1429, 151911.9687, 60764787.47, 1.209185],
  ['2022-01-01', 2377.7087, 195407.5932, 78163037.28, 1.211841],
  ['2022-07-01', 2226.2456, 230985.2371, 92394094.84, 1.214022],
  ['2023-01-01', 2096.0083, 261475.04, 104590016.0, 1.215897],
];
const ID = SAMPLE_CASE_IDS.ahmed;
const ekene = (aquifer) => runSample(ID, {
  patchCase: { initial_pressure_psia: 3200, reservoir_temperature_f: 180, initial_water_saturation: 0.35, bubble_point_psia: 2000 },
  patchDefault: { aquifer_model: aquifer, formation_compressibility_psi: 4e-6, water_compressibility_psi: 3e-6, oil_gravity_api: 32, water_salinity_ppm: 35000, gas_cap_ratio_m: 0 },
  mutateStore: (db) => {
    const keep = db.rb_production_data.filter((r) => r.case_id !== ID);
    db.rb_production_data = [...keep, ...EKENE.map(([date, p, np, gp, bo], i) => ({
      id: `pd-e-${i}`, case_id: ID, timestep_index: i, observation_date: date, pressure_psia: p,
      cum_oil_stb: np, cum_gas_scf: gp, cum_water_stb: 0, cum_water_inj_stb: 0, cum_gas_inj_scf: 0,
      bo_rb_stb: bo, rs_scf_stb: 400, bg_rb_mscf: null, bw_rb_stb: 1.02, z_factor: null, observed_we_rb: null,
    }))];
  },
});
const seriesOf = (s) => buildMbalSeries({ result: s.result, runConfig: s.runConfig, caseData: s.caseData });
const report = (s) => collectMbalReportArgs({ caseData: s.caseData, result: s.result, runConfig: s.runConfig, run: s.run, study: s.study, staleness: s.staleness });

test('P-1 the engine still returns the undetermined fit on the Ekene tank (what the flag is for)', () => {
  const s = ekene('pot');
  expect(s.result.estimated_ooip_stb).toBeLessThan(1e6);
  expect(s.result.r_squared).toBeGreaterThan(0.9999);
});

test('P-2 the series flags it: dp/Eo varies by far less than the minimum spread', () => {
  const id = seriesOf(ekene('pot')).identifiability;
  expect(id.checked).toBe(true);
  expect(id.ok).toBe(false);
  expect(id.spread).toBeLessThan(POT_SPREAD_MIN / 10);
  expect(id.message).toMatch(/^The pot aquifer cannot be told apart from the expansion of the reservoir on this data: across the 6 points of the fit dp\/Eo varies by only 0\.0\d\d percent/);
});

test('P-3 the report leads its limits flags with it, and the summary counts it', () => {
  const m = report(ekene('pot'));
  expect(m.limits.flags[0]).toMatch(/^The pot aquifer cannot be told apart/);
  const flags = m.summary.rows.find((r) => r[0] === 'Flags')[1];
  expect(flags).toMatch(/^1 flag on the fit/);
  expect(m.summary.rows.find((r) => r[0] === 'First flag')[1]).toMatch(/^The pot aquifer cannot be told apart/);
});

test('P-4 negative control: the same tank with no aquifer is not checked and carries no flag', () => {
  const s = ekene('none');
  expect(s.result.estimated_ooip_stb / 12139208).toBeCloseTo(1, 4);
  const id = seriesOf(s).identifiability;
  expect(id.checked).toBe(false);
  expect(report(s).limits.flags.some((f) => /cannot be told apart/.test(f))).toBe(false);
});

test('P-5 positive control: the published pot aquifer case (Pletcher gas) is identifiable', () => {
  const id = seriesOf(runSample(SAMPLE_CASE_IDS.pletcher)).identifiability;
  expect(id.checked).toBe(true);
  expect(id.ok).toBe(true);
  expect(id.spread).toBeGreaterThan(POT_SPREAD_MIN);
});

test('P-6 the rule reads only the points of the fit', () => {
  const pts = (xs) => ({ variant: { kind: 'pot', isGas: false }, points: xs.map(([x, status]) => ({ x, status })) });
  expect(regressionIdentifiability(pts([[100, 'fit'], [100.1, 'fit'], [500, 'excluded']])).ok).toBe(false);
  expect(regressionIdentifiability(pts([[100, 'fit'], [130, 'fit']])).ok).toBe(true);
  expect(regressionIdentifiability({ variant: { kind: 'plain' }, points: [] }).checked).toBe(false);
});
