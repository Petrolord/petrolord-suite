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
