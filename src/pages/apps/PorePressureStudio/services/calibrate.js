// Calibration that calibrates (AppUpgrade PP-U2-006, fixes PP-U1-029). The
// measured pore pressures (RFT/MDT, kicks) were drawn and their misfit
// stated, but nothing was fitted to them. Here the method's own parameter
// is fitted through the engine (calibrationFit.js): Eaton's n (sonic or
// resistivity) by a bounded one-parameter search, Bowers A and B on the
// loading curve by exact log-space least squares, and Bowers U for the
// unloading curve with sigma max held. Each point is matched to its nearest
// computed sample, as the misfit is. Pure.

import { fitEatonExponent, fitBowersLoading, fitBowersU } from '../engine/calibrationFit';
import { computeProfile } from '../engine/profile';
import { calibrationMisfit } from './honesty';
import { comparesTo } from './calibrationImport';
import { k0FromLot, dainesBetaFromLot, eatonK } from '../engine/fracgrad';

/** Pore-pressure points matched to their samples (within the misfit tolerance). */
export function matchedPoints(calibration, input, result) {
  const mis = calibrationMisfit(calibration, input.zBmlM, result.porePressurePa, 'pp');
  const pts = (calibration || []).filter((c) => comparesTo(c) === 'pp' && Number.isFinite(c.z) && Number.isFinite(c.pMpa));
  const out = [];
  mis.points.forEach((p, k) => {
    if (!p.inRange) return;
    let best = 0;
    for (let i = 1; i < input.zBmlM.length; i++) if (Math.abs(input.zBmlM[i] - pts[k].z) < Math.abs(input.zBmlM[best] - pts[k].z)) best = i;
    out.push({ i: best, ppMeasured: pts[k].pMpa * 1e6 });
  });
  return out;
}

/** What the current method can fit, or null. */
export function fitTarget(params) {
  if (params.method === 'eaton') return { key: 'eatonN', label: 'Fit n to calibration' };
  if (params.method === 'eaton-resistivity') return { key: 'eatonNRes', label: 'Fit n to calibration' };
  if (params.method === 'bowers') {
    return params.bowers?.U != null && params.bowers?.sigmaMaxPa != null
      ? { key: 'bowersU', label: 'Fit U to calibration' }
      : { key: 'bowersAB', label: 'Fit A and B to calibration' };
  }
  return null;
}

/**
 * @returns {{params: object, text: string, rmsBeforeMpa: number, rmsAfterMpa: number, n: number}|{error: string}}
 */
export function fitToCalibration(params, input, result, calibration) {
  const target = fitTarget(params);
  if (!target) return { error: 'This method has no parameter to fit.' };
  const pts = matchedPoints(calibration, input, result);
  const need = target.key === 'bowersAB' ? 2 : 1;
  if (pts.length < need) return { error: `Fitting needs ${need === 2 ? 'two measured pressures' : 'a measured pressure'} (RFT/MDT or kick) within the prognosis.` };
  const before = calibrationMisfit(calibration, input.zBmlM, result.porePressurePa, 'pp').rmsMpa;
  let next; let what;
  try {
    if (target.key === 'eatonN' || target.key === 'eatonNRes') {
      const byRes = target.key === 'eatonNRes';
      const f = fitEatonExponent(pts.map(({ i, ppMeasured }) => ({
        S: result.overburdenPa[i],
        Ph: result.hydrostaticPa[i],
        ratio: byRes ? input.resOhmM[i] / result.resNormalOhmM[i] : result.dtNormalUsPerM[i] / input.dtUsPerM[i],
        ppMeasured,
      })));
      next = { ...params, [target.key]: Number(f.n.toFixed(4)) };
      what = `n ${f.n.toFixed(3)}${f.atBound ? ' (at the search bound: check the trend and the points)' : ''}`;
    } else if (target.key === 'bowersAB') {
      const f = fitBowersLoading(pts.map(({ i, ppMeasured }) => ({ vMs: result.vMs[i], S: result.overburdenPa[i], ppMeasured })), params.bowers?.vMlFts ?? 5000);
      next = { ...params, bowers: { ...params.bowers, A: Number(f.A.toPrecision(6)), B: Number(f.B.toPrecision(6)) } };
      what = `A ${f.A.toPrecision(4)}, B ${f.B.toPrecision(4)} (ft/s, psi) on ${f.used} points`;
    } else {
      const b = params.bowers;
      const f = fitBowersU(pts.map(({ i, ppMeasured }) => ({ vMs: result.vMs[i], S: result.overburdenPa[i], ppMeasured })), {
        A: b.A, B: b.B, sigmaMaxPa: b.sigmaMaxPa, vMlFts: b.vMlFts ?? 5000,
      });
      next = { ...params, bowers: { ...b, U: Number(f.U.toFixed(4)) } };
      what = `U ${f.U.toFixed(3)}${f.atBound ? ' (at the search bound)' : ''}`;
    }
  } catch (e) {
    return { error: e.message };
  }
  const after = computeProfile({ ...input, params: next });
  const rmsAfter = calibrationMisfit(calibration, input.zBmlM, after.porePressurePa, 'pp').rmsMpa;
  return {
    params: next,
    n: pts.length,
    rmsBeforeMpa: before,
    rmsAfterMpa: rmsAfter,
    text: `Fitted ${what} to ${pts.length} measured pressure${pts.length === 1 ? '' : 's'}: misfit RMS ${before.toFixed(2)} MPa before, ${rmsAfter.toFixed(2)} MPa after.`,
  };
}

// ---- U2-012: the fracture method calibrated to leak-off tests ----------------

export const FRAC_METHOD_LABELS = Object.freeze({
  eaton: 'Eaton (Poisson ratio)', 'matthews-kelly': 'Matthews and Kelly (k0)', daines: 'Daines (Poisson ratio + tectonic beta)',
});

/** The fracture method in words, for the report and the publish description. */
export function fracMethodText(p) {
  const m = p.fracMethod || 'eaton';
  if (m === 'matthews-kelly') return `Matthews and Kelly, FP = k0 (S - PP) + PP, k0 = ${p.k0 ?? 0.75}`;
  if (m === 'daines') return `Daines, FP = (beta + nu/(1-nu)) (S - PP) + PP, nu = ${p.nu}, beta = ${p.beta ?? 0}`;
  return `K = nu/(1-nu), nu = ${p.nu}`;
}

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n % 2 ? s[(n - 1) / 2] : 0.5 * (s[n / 2 - 1] + s[n / 2]); };

/**
 * The method's coefficient from the LOT/XLOT points in the prognosis (the
 * median over the tests; a FIT is a lower bound, so it is used only when no
 * LOT or XLOT is there, and said).
 * @returns {{params: object, text: string}|{error: string}}
 */
export function calibrateFracToLot(params, input, result, calibration) {
  const lots = (calibration || []).filter((c) => comparesTo(c) === 'fg');
  const mis = calibrationMisfit(lots, input.zBmlM, result.fracPressurePa, 'fg');
  const ok = mis.points.map((p, k) => ({ p, c: lots[k] })).filter(({ p }) => p.inRange);
  const firm = ok.filter(({ c }) => c.kind !== 'fit');
  const use = firm.length ? firm : ok;
  if (!use.length) return { error: 'Calibrating the fracture gradient needs a LOT, XLOT or FIT within the prognosis.' };
  const at = ({ c }) => {
    let best = 0;
    for (let i = 1; i < input.zBmlM.length; i++) if (Math.abs(input.zBmlM[i] - c.z) < Math.abs(input.zBmlM[best] - c.z)) best = i;
    return { lot: c.pMpa * 1e6, S: result.overburdenPa[best], PP: result.porePressurePa[best] };
  };
  const m = params.fracMethod || 'eaton';
  let next; let what;
  try {
    const k0s = use.map(at).map((q) => k0FromLot(q.lot, q.S, q.PP));
    if (m === 'matthews-kelly') {
      const k0 = median(k0s);
      if (!(k0 >= 0) || !(k0 <= 1.5)) return { error: `The tests give k0 ${k0.toFixed(3)}, outside 0 to 1.5: check the tests and the pore pressure there.` };
      next = { ...params, k0: Number(k0.toFixed(4)) }; what = `k0 ${k0.toFixed(3)}`;
    } else if (m === 'daines') {
      const beta = median(use.map(at).map((q) => dainesBetaFromLot(q.lot, q.S, q.PP, params.nu)));
      next = { ...params, beta: Number(beta.toFixed(4)) }; what = `beta ${beta.toFixed(3)} with nu ${params.nu}`;
    } else {
      const k0 = median(k0s);
      const nu = k0 / (1 + k0); // K = nu/(1-nu) solved for nu
      if (!(nu >= 0) || !(nu < 0.5)) return { error: `The tests give K ${k0.toFixed(3)}, which no Poisson ratio below 0.5 reaches: try Matthews and Kelly or Daines.` };
      next = { ...params, nu: Number(nu.toFixed(4)) }; what = `nu ${nu.toFixed(3)} (K ${eatonK(nu).toFixed(3)})`;
    }
  } catch (e) {
    return { error: e.message };
  }
  const after = computeProfile({ ...input, params: next });
  const rms = calibrationMisfit(use.map(({ c }) => c), input.zBmlM, after.fracPressurePa, 'fg').rmsMpa;
  const fitNote = firm.length ? '' : ' (FITs only: a FIT is a lower bound, so the line may sit low)';
  return { params: next, text: `Fracture gradient calibrated to ${use.length} test${use.length === 1 ? '' : 's'}: ${what}, RMS ${rms.toFixed(2)} MPa at the tests${fitNote}.` };
}
