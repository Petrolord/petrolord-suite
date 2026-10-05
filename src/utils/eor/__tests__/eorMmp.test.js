// EOR-U2-001: the CO2 minimum miscibility pressure check, held against the
// paper's own data. Zhu et al. (2025), ACS Omega 10 (47) 57267-57276,
// Table 2 (12 slim-tube MMPs, Ordos Basin), Model 9 of Table 4, stated
// error in Section 3.2.3 and Table 5: MAE 0.48 MPa (0.4825), MAPE 2.53 %,
// RMSE 0.75 (0.7494), largest deviation H138 +2.05 MPa (11.07 %), 91.7 %
// of points within +-10 %. The gate calls the engine (mmpCo2Zhu2025) on
// every row, in the app's oilfield units (degF in, psia out).
import { mmpCo2Zhu2025, eorMmpCheck, MMP_CORRELATION, MPA_TO_PSI } from '../mmp';
import { toDisplay } from '../units';

// Table 2 as printed: block, T degC, C1+N2, CO2, C2-C4, C5-C6, C7-C10 (mol %), measured MMP (MPa)
const TABLE_2 = [
  ['Wuqi Yougou', 59.94, 20.19, 0, 20.06, 6.01, 13.87, 17.80],
  ['Xingzichuan Huaziping', 43.00, 15.12, 0, 23.35, 7.18, 23.43, 14.27],
  ['Wuqi Baibao', 72.80, 16.63, 0, 20.15, 5.68, 18.42, 18.52],
  ['H138', 91.73, 21.91, 0, 26.54, 7.56, 10.84, 18.47],
  ['X331', 71.40, 20.19, 0, 22.25, 8.57, 24.10, 18.87],
  ['Z62', 71.73, 20.71, 0.19, 24.25, 9.60, 13.34, 18.75],
  ['HJ', 88.25, 19.39, 0.04, 25.77, 6.00, 16.04, 21.12],
  ['L98', 85.12, 29.64, 0.08, 22.16, 5.91, 13.83, 20.90],
  ['B92', 71.85, 28.05, 0.07, 21.73, 6.99, 15.03, 19.90],
  ['Y469', 72.42, 28.64, 0.07, 21.36, 6.03, 14.36, 20.49],
  ['Z181', 70.94, 22.96, 0.03, 26.09, 8.55, 12.32, 19.00],
  ['Z44', 85.74, 27.28, 0.07, 23.12, 5.53, 10.08, 21.60],
];
const degF = (c) => c * 1.8 + 32;
const rowInput = (r) => ({ temperatureF: degF(r[1]), volatilesMolPct: r[2], intermediatesMolPct: r[3] + r[4] + r[5] + r[6] });
const stats = (predMpa) => {
  const e = TABLE_2.map((r, i) => predMpa[i] - r[7]);
  return {
    mae: e.reduce((s, x) => s + Math.abs(x), 0) / e.length,
    mape: (100 * e.reduce((s, x, i) => s + Math.abs(x) / TABLE_2[i][7], 0)) / e.length,
    rmse: Math.sqrt(e.reduce((s, x) => s + x * x, 0) / e.length),
    within10: e.filter((x, i) => Math.abs(x) / TABLE_2[i][7] <= 0.10).length / e.length,
    e,
  };
};
const engineMpa = () => TABLE_2.map((r) => mmpCo2Zhu2025(rowInput(r)).mmpPsia / MPA_TO_PSI);

describe('CO2 MMP, Zhu et al. (2025), against its own Table 2', () => {
  it('reproduces the stated error of the paper on its 12 slim-tube MMPs', () => {
    const s = stats(engineMpa());
    expect(s.mae).toBeCloseTo(0.4825, 3);
    expect(s.mape).toBeCloseTo(2.53, 2);
    expect(s.rmse).toBeCloseTo(0.7494, 3);
    expect(s.within10).toBeCloseTo(11 / 12, 6); // 91.7 %
    // the paper's one outlier: H138, +2.05 MPa, 11.07 %
    const h = TABLE_2.findIndex((r) => r[0] === 'H138');
    expect(s.e[h]).toBeCloseTo(2.05, 2);
    expect((100 * s.e[h]) / TABLE_2[h][7]).toBeCloseTo(11.07, 1);
    // every other row within the paper's largest deviation
    for (const x of s.e) expect(Math.abs(x)).toBeLessThanOrEqual(2.05 + 0.005);
  });

  it('negative controls: a perturbed coefficient, CO2 left out of the lump, or degF fed as degC leave the stated error', () => {
    const perturbed = TABLE_2.map((r) => 6.2671 * Math.log(r[1]) * 1.02 + (5.3393 * r[2]) / (r[3] + r[4] + r[5] + r[6]) - 10.4077);
    expect(stats(perturbed).mae).toBeGreaterThan(0.6);
    const noLnUnit = TABLE_2.map((r) => mmpCo2Zhu2025({ ...rowInput(r), temperatureF: r[1] }).mmpPsia / MPA_TO_PSI);
    expect(stats(noLnUnit).mae).toBeGreaterThan(2);
    // the CO2 lump matters at the 4th decimal only; the paper's 0.4825 needs it
    const noCo2 = TABLE_2.map((r) => mmpCo2Zhu2025({ ...rowInput(r), intermediatesMolPct: r[4] + r[5] + r[6] }).mmpPsia / MPA_TO_PSI);
    expect(stats(noCo2).mae).not.toBeCloseTo(0.4825, 3);
    // the paper's Table 5: a temperature-only correlation (Yellig and Metcalfe) misses these oils by about a quarter (MAPE 25.35 %)
    const ym = TABLE_2.map((r) => { const t = degF(r[1]); return (1833.7217 + 2.2518055 * t + 0.01800674 * t * t - 103949.93 / t) / MPA_TO_PSI; });
    expect(stats(ym).mape).toBeGreaterThan(24);
    expect(stats(ym).mape).toBeLessThan(27);
  });

  it('pins one value in psia and kPa (Wuqi Yougou: 17.94 MPa predicted)', () => {
    const r = mmpCo2Zhu2025(rowInput(TABLE_2[0]));
    expect(r.mmpPsia / MPA_TO_PSI).toBeCloseTo(17.94, 2);
    expect(r.mmpPsia).toBeCloseTo(2602.3, 0);
    expect(MPA_TO_PSI).toBeCloseTo(145.0377, 4);
    expect(toDisplay('pressure', r.mmpPsia, 'si')).toBeCloseTo(r.mmpMpa * 1000, 6);
  });

  it('the printed data range is the range of Table 2', () => {
    const span = (f) => [Math.min(...TABLE_2.map(f)), Math.max(...TABLE_2.map(f))].map((v) => Math.round(v * 100) / 100);
    expect(MMP_CORRELATION.range.temperatureC).toEqual(span((r) => r[1]));
    expect(MMP_CORRELATION.range.volatilesMolPct).toEqual(span((r) => r[2]));
    expect(MMP_CORRELATION.range.intermediatesMolPct).toEqual(span((r) => r[3] + r[4] + r[5] + r[6]));
    expect(MMP_CORRELATION.range.mmpMpa).toEqual(span((r) => r[7]));
  });

  it('names the paper, its equation, its data range and its error', () => {
    expect(MMP_CORRELATION.citation).toMatch(/ACS Omega 10 \(47\), 2025, 57267-57276/);
    expect(MMP_CORRELATION.equation).toMatch(/6\.2671 ln\(T\) \+ 5\.3393 \(C1\+N2\)\/\(C2-C10\) - 10\.4077/);
    expect(MMP_CORRELATION.range.temperatureC).toEqual([43.0, 91.73]);
    expect(MMP_CORRELATION.range.volatilesMolPct).toEqual([15.12, 29.64]);
    expect(MMP_CORRELATION.error.maeMpa).toBe(0.48);
    expect(MMP_CORRELATION.error.maxMpa).toBe(2.05);
  });
});

describe('eorMmpCheck: miscible or immiscible by MMP against reservoir pressure', () => {
  const at = (p, extra = {}) => eorMmpCheck({ form: { temperatureF: String(degF(59.94)) }, context: { reservoirPressurePsia: String(p), volatilesMolPct: '20.19', intermediatesMolPct: String(20.06 + 6.01 + 13.87), ...extra } });
  it('states miscible above the MMP and immiscible below it, with the margin', () => {
    const above = at(3200);
    expect(above.verdict).toBe('miscible');
    expect(above.margin_psi).toBeCloseTo(3200 - above.mmp_psia, 6);
    expect(at(2000).verdict).toBe('immiscible');
    expect(at(2000).margin_psi).toBeLessThan(0);
  });
  it('says when the pressure sits within the largest deviation of the correlation (2.05 MPa)', () => {
    const m = at(3200).mmp_psia;
    expect(at(m + 100).within_error).toBe(true);
    expect(at(m + 2.05 * MPA_TO_PSI + 1).within_error).toBe(false);
  });
  it('flags inputs outside the data of the paper, and still computes', () => {
    const cold = eorMmpCheck({ form: { temperatureF: '105' }, context: { reservoirPressurePsia: '3000', volatilesMolPct: '20', intermediatesMolPct: '40' } });
    expect(cold.verdict).toBe('miscible');
    expect(cold.outside.join(' ')).toMatch(/temperature 40\.6 degC is outside 43 to 91\.73 degC/);
  });
  it('negative controls: no MMP without temperature and composition; no verdict without pressure; never assumed', () => {
    expect(eorMmpCheck({ form: { temperatureF: '150' }, context: {} }).status).toBe('not made');
    expect(eorMmpCheck({ form: { temperatureF: '150' }, context: {} }).reason).toMatch(/C1 \+ N2 and C2 to C10/);
    const noP = eorMmpCheck({ form: { temperatureF: '150' }, context: { volatilesMolPct: '20', intermediatesMolPct: '40' } });
    expect(noP.status).toBe('mmp only');
    expect(noP.verdict).toBeNull();
    expect(Number.isFinite(noP.mmp_psia)).toBe(true);
    expect(eorMmpCheck({ form: { temperatureF: '150' }, context: { volatilesMolPct: '20', intermediatesMolPct: '0' } }).status).toBe('not made');
  });
});

describe('the MMP rows of the screen and the report (RL1, RL7, RL12)', () => {
  // eslint-disable-next-line global-require
  const { buildEorReportModel } = require('../reportModel');
  // eslint-disable-next-line global-require
  const { fieldCase, sampleCase } = require('./eorTestKit');
  const row = (m, k) => m.mmp.rows.find((r) => r[0] === k)[1];
  it('prints the MMP, the pressure, the verdict, the correlation, its range and its error, in the display units', () => {
    const of = buildEorReportModel(fieldCase());
    expect(row(of, 'Minimum miscibility pressure')).toBe('2,949 psia');
    expect(row(of, 'Verdict')).toBe('Miscible: the reservoir pressure is above the MMP (within the error of the correlation)');
    expect(row(of, 'Error of the correlation')).toMatch(/MAE 0\.48 MPa, MAPE 2\.53 %/);
    expect(row(of, 'Data of the correlation')).toMatch(/T 43 to 91\.73 degC/);
    const si = buildEorReportModel(fieldCase({ system: 'si' }));
    expect(row(si, 'Minimum miscibility pressure')).toBe('20,340 kPa');
    expect(si.mmp.why).toMatch(/by 1,383 kPa/);
    expect(of.limits.flags.join(' ')).toMatch(/within the error of the correlation/);
    // inputs table carries the composition with its unit
    expect(of.inputs.rows.find((r) => r.key === 'volatilesMolPct')).toMatchObject({ value: '20.19', unit: 'mol %' });
  });
  it('negative control: the sample has no composition, so no MMP and no verdict are printed', () => {
    const m = buildEorReportModel(sampleCase());
    expect(row(m, 'Verdict')).toBe('Not made');
    expect(row(m, 'Minimum miscibility pressure')).toBe('n/a');
    expect(row(m, 'Why')).toMatch(/needs the oil composition/);
  });
});
