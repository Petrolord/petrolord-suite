/**
 * CO2 minimum miscibility pressure check of EOR Screening (EOR-U2-001).
 *
 * Taber, Martin and Seright (1997) screen CO2 miscibility through a depth
 * proxy (Part 2, Table 3: minimum depth by oil gravity, for typical Permian
 * Basin oils) and say that other oils need a measured MMP. This module adds
 * the check the paper points to: an MMP from one published correlation,
 * compared with the reservoir pressure, stated as miscible or immiscible
 * beside the Taber verdicts. It never changes a Taber verdict.
 *
 * The correlation is the one whose paper could be read in full with its
 * own slim-tube data (the classic Yellig and Metcalfe 1980, Cronquist 1978
 * and Alston et al. 1985 papers were not available to read):
 *
 *   Zhu, Q., Wang, W., Liang, Q., Liu, J., Xu, P., Yang, H. and Wang, H.:
 *   "Prediction of the Minimum Miscibility Pressure of the CO2-Crude Oil
 *   System in the Ordos Basin", ACS Omega 10 (47), 2025, 57267-57276,
 *   doi:10.1021/acsomega.5c07432 (open access).
 *
 *   MMP [MPa] = 6.2671 ln(T [degC]) + 5.3393 (C1+N2)/(C2-C10) - 10.4077
 *   (Table 4, Model 9, the final model of Section 3.2.2). C1+N2 and C2-C10
 *   are mole fractions of the reservoir oil; CO2 dissolved in the oil is
 *   lumped with C2-C10 (Section 3.1). Held against the paper's Table 2 in
 *   src/utils/eor/__tests__/eorMmp.test.js: MAE 0.4825 MPa, MAPE 2.53 %,
 *   RMSE 0.7494, H138 +2.05 MPa (11.07 %), as printed.
 *
 * Scope, as the paper states it: black oils of the Yanchang Formation,
 * Ordos Basin, 12 blocks; pure CO2 (above 99.5 %), no injected-gas
 * impurities; CO2 only (no nitrogen or hydrocarbon gas). The paper states
 * no formal range; the range of its data is printed and every input outside
 * it is flagged. The MMP is in MPa as printed (absolute or gauge is not
 * stated; the 0.1 MPa between them is far inside the error).
 *
 * Inputs in the app's stored oilfield units (degF, psia, mol %). Pure.
 */
import { convert } from '@/lib/units/registry';

/** 1 MPa in psi, from the Suite unit registry. */
export const MPA_TO_PSI = convert('pressure', 1, 'MPa', 'psi');

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const num = (v) => {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
};
const g = (v, d = 4) => String(parseFloat(Number(v).toPrecision(d)));

export const MMP_CORRELATION = Object.freeze({
  key: 'zhu-2025',
  gas: 'CO2',
  short: 'Zhu et al. (2025)',
  citation: 'Zhu, Q., Wang, W., Liang, Q., Liu, J., Xu, P., Yang, H. and Wang, H.: "Prediction of the Minimum Miscibility Pressure of the CO2-Crude Oil System in the Ordos Basin", ACS Omega 10 (47), 2025, 57267-57276, doi:10.1021/acsomega.5c07432',
  equation: 'MMP (MPa) = 6.2671 ln(T) + 5.3393 (C1+N2)/(C2-C10) - 10.4077, T in degC; C1+N2 and C2-C10 mole fractions of the reservoir oil, CO2 in the oil lumped with C2-C10',
  where: 'Table 4, Model 9 (final model, Section 3.2.2); data in Table 2; error in Section 3.2.3 and Table 5',
  scope: 'Black oils of the Yanchang Formation, Ordos Basin (12 blocks, 12 slim-tube MMPs, 10 measured by the authors and 2 from earlier studies); pure CO2 (above 99.5 %), no injected-gas impurities; CO2 only.',
  // the paper states no formal range: the range of its Table 2 data
  range: Object.freeze({ temperatureC: [43.0, 91.73], volatilesMolPct: [15.12, 29.64], intermediatesMolPct: [38.8, 54.92], mmpMpa: [14.27, 21.6] }),
  error: Object.freeze({ maeMpa: 0.48, mapePct: 2.53, rmseMpa: 0.75, maxMpa: 2.05, maxPct: 11.07, within10Pct: 91.7, looMaeMpa: 0.7182 }),
  errorText: 'MAE 0.48 MPa, MAPE 2.53 %, RMSE 0.75 MPa on its 12 points; largest deviation +2.05 MPa (11.07 %, block H138); 91.7 % of points within 10 %; leave-one-out MAE 0.72 MPa (Section 3.2.3, Tables 4 and 5).',
});

/**
 * The correlation itself.
 * @param {{temperatureF: number, volatilesMolPct: number, intermediatesMolPct: number}} a
 * @returns {?{mmpPsia: number, mmpMpa: number, temperatureC: number}} null when an input is missing or the ratio is undefined
 */
export function mmpCo2Zhu2025({ temperatureF, volatilesMolPct, intermediatesMolPct }) {
  if (![temperatureF, volatilesMolPct, intermediatesMolPct].every(finite)) return null;
  const tC = (temperatureF - 32) / 1.8;
  if (!(tC > 0) || !(intermediatesMolPct > 0) || volatilesMolPct < 0) return null;
  const mmpMpa = 6.2671 * Math.log(tC) + (5.3393 * volatilesMolPct) / intermediatesMolPct - 10.4077;
  return { mmpMpa, mmpPsia: mmpMpa * MPA_TO_PSI, temperatureC: tC };
}

const VERDICT_WORDS = Object.freeze({ miscible: 'Miscible: the reservoir pressure is above the MMP', immiscible: 'Immiscible: the reservoir pressure is below the MMP' });
export const mmpVerdictWords = (v) => VERDICT_WORDS[v] || null;

/**
 * The check on a project's inputs (EorScreeningContext shape: form and context, oilfield strings).
 * status: 'made' (MMP and a verdict), 'mmp only' (no reservoir pressure), 'not made' (an input missing).
 */
export function eorMmpCheck(inputs) {
  const tF = num(inputs?.form?.temperatureF);
  const vol = num(inputs?.context?.volatilesMolPct);
  const int = num(inputs?.context?.intermediatesMolPct);
  const p = num(inputs?.context?.reservoirPressurePsia);
  const base = {
    gas: 'CO2',
    correlation: MMP_CORRELATION.key,
    correlation_short: MMP_CORRELATION.short,
    inputs: { temperature_degF: tF, volatiles_mol_pct: vol, intermediates_mol_pct: int, reservoir_pressure_psia: p },
  };
  const missing = [];
  if (tF == null) missing.push('reservoir temperature');
  if (vol == null || int == null) missing.push('the oil composition (C1 + N2 and C2 to C10, mol %)');
  const r = missing.length ? null : mmpCo2Zhu2025({ temperatureF: tF, volatilesMolPct: vol, intermediatesMolPct: int });
  if (!r) {
    return {
      ...base, status: 'not made', mmp_psia: null, verdict: null, margin_psi: null, within_error: null, outside: [],
      reason: missing.length
        ? `No MMP: needs ${missing.join(' and ')}. The correlation reads the C1 + N2 and C2 to C10 fractions of the reservoir oil (CO2 in the oil counted with C2 to C10).`
        : 'No MMP: the C2 to C10 fraction must be above zero and the temperature above 0 degC.',
    };
  }
  const R = MMP_CORRELATION.range;
  const outside = [];
  const chk = (label, v, [lo, hi], unit) => { if (v < lo - 1e-9 || v > hi + 1e-9) outside.push(`${label} ${g(v, 3)} ${unit} is outside ${lo} to ${hi} ${unit}`); };
  chk('temperature', r.temperatureC, R.temperatureC, 'degC');
  chk('C1 + N2', vol, R.volatilesMolPct, 'mol %');
  chk('C2 to C10', int, R.intermediatesMolPct, 'mol %');
  const out = { ...base, mmp_psia: r.mmpPsia, mmp_mpa: r.mmpMpa, temperature_degC: r.temperatureC, outside };
  if (p == null) {
    return { ...out, status: 'mmp only', verdict: null, margin_psi: null, within_error: null, reason: 'No verdict: state the reservoir pressure (or take it from Well Test or Material Balance) to compare with the MMP.' };
  }
  const margin = p - r.mmpPsia;
  const verdict = margin >= 0 ? 'miscible' : 'immiscible';
  const withinError = Math.abs(margin) <= MMP_CORRELATION.error.maxMpa * MPA_TO_PSI;
  const parts = [`${mmpVerdictWords(verdict)} by ${g(Math.abs(margin))} psi.`];
  if (withinError) parts.push(`The difference is within the largest deviation of the correlation on its own data (${MMP_CORRELATION.error.maxMpa} MPa, ${g(MMP_CORRELATION.error.maxMpa * MPA_TO_PSI)} psi): a measured slim-tube MMP is needed to decide.`);
  if (outside.length) parts.push(`Extrapolated: ${outside.join('; ')} (the data of the paper).`);
  return { ...out, status: 'made', verdict, margin_psi: margin, within_error: withinError, reason: parts.join(' ') };
}
