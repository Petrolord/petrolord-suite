// A locally calibrated shear trend (QI programme Q1 / A2, 2026-10-06). On a
// well with a measured shear log, Vs is regressed on Vp over a zone's
// water-bearing samples (the brine-filled trend Greenberg-Castagna also
// describes, but from this field's own rock). Saved into the project's rock
// parameters, it replaces Greenberg-Castagna on wells with no shear log:
// the direct estimate, the hydrocarbon iteration's brine trend
// (iterativeVs brineVs) and a sigma curve from the prediction interval.
// Pure; the maths is the engines' (elasticSet.js, vsEstimate.js).

import { fitVsRegression, predictVs, predictVsCurve } from '../engine/elasticSet';

/** Sw at or above this marks a sample as water-bearing for the fit. */
export const WET_SW_FIT = 0.9;
/** The prediction interval drawn and stored with the trend. */
export const TREND_LEVEL = 0.9;

/**
 * The zone's calibration pairs: measured Vp and Vs, water-bearing when the
 * well has an Sw log (all samples otherwise, and the result says so).
 */
export function localShearSamples(model, indices) {
  if (model?.vsSource !== 'measured') return { error: 'This well has no measured shear log, so it cannot calibrate a shear trend. Open a well with a DTS curve.' };
  const wetOnly = !!model.sw;
  const samples = [];
  let hydrocarbon = 0;
  for (const i of indices) {
    const vp = model.vp[i];
    const vs = model.vs[i];
    if (!(vp > 0) || !(vs > 0) || vs >= vp) continue;
    if (wetOnly && !(model.sw[i] >= WET_SW_FIT)) { hydrocarbon += 1; continue; }
    samples.push({ vp, vs });
  }
  return { samples, wetOnly, hydrocarbon };
}

/**
 * Fit the trend for one zone.
 * @returns {{trend: Object, samples: Array, wetOnly: boolean, hydrocarbon: number} | {error: string}}
 *   trend is serialisable (saved as rock.localVs) and is what predictVs takes
 */
export function fitLocalShear(model, indices, { form = 'linear', wellName = '', zoneName = '' } = {}) {
  const got = localShearSamples(model, indices);
  if (got.error) return got;
  try {
    const fit = fitVsRegression(got.samples, { form });
    const label = [wellName, zoneName].filter(Boolean).join(', ');
    const trend = {
      form: fit.form, coef: fit.coef, s: fit.s, dof: fit.dof, n: fit.n, r2: fit.r2, xtxInv: fit.xtxInv, vpRange: fit.vpRange,
      label, wetOnly: got.wetOnly,
    };
    return { trend, samples: got.samples, wetOnly: got.wetOnly, hydrocarbon: got.hydrocarbon };
  } catch (e) {
    return { error: e.message };
  }
}

/** True when a saved trend has what predictVs needs. */
export const isTrend = (t) => !!t && Array.isArray(t.coef) && Array.isArray(t.xtxInv) && t.s >= 0 && t.dof > 0 && Array.isArray(t.vpRange);

/** The brine-filled Vs function a trend gives (for iterativeVs and shearForWell), or null. */
export const brineVsOf = (trend) => (isTrend(trend) ? (vp) => predictVs(trend, vp).vs : null);

/** The fitted line and its interval across a Vp range, for the plot. */
export function trendLine(trend, [vpLo, vpHi], steps = 40) {
  const out = [];
  for (let k = 0; k <= steps; k++) {
    const vp = vpLo + ((vpHi - vpLo) * k) / steps;
    const r = predictVs(trend, vp, { level: TREND_LEVEL });
    out.push({ vp, vs: r.vs, lo: r.lo, hi: r.hi });
  }
  return out;
}

/**
 * Apply a saved trend to a well with no shear log: Vs from the trend where
 * Vp is valid, a sigma curve, and the method recorded. A well with measured
 * shear is returned unchanged (measured and estimated are never mixed).
 */
export function applyLocalShearTrend(model, trend) {
  if (!model || model.vsSource !== 'estimated' || !isTrend(trend)) return model;
  const pred = predictVsCurve(trend, model.vp, { level: TREND_LEVEL });
  const vs = Array.from(model.vs);
  const vsSigma = new Array(model.n).fill(NaN);
  for (let i = 0; i < model.n; i++) {
    const v = pred.vs[i];
    if (v > 0 && v < model.vp[i]) { vs[i] = v; vsSigma[i] = pred.sigma[i]; }
  }
  return {
    ...model,
    vs,
    vsSigma,
    vsMethod: 'local',
    vsTrend: { label: trend.label, n: trend.n, s: trend.s, form: trend.form, extrapolated: pred.extrapolated },
  };
}
