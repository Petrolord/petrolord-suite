/**
 * Analytical model catalog for the Well Test Analysis Studio.
 *
 * Each entry pairs a Laplace-space dimensionless solution with parameter
 * metadata (units, defaults, bounds, log-scale flags). The metadata drives
 * both the manual-match UI controls and the Levenberg-Marquardt auto-fit, so
 * adding a model is one catalog entry plus one solution module.
 *
 * Oilfield units throughout:
 *   k md, h ft, phi fraction, mu cp, ct 1/psi, rw ft, B RB/STB, q STB/D,
 *   C bbl/psi, t hours, p psi.
 *
 * Dimensionless groups (standard SPE definitions):
 *   tD = 0.0002637 k t / (phi mu ct rw^2)
 *   pD = k h dp / (141.2 q B mu)
 *   CD = 0.8936 C / (phi ct h rw^2)
 */

import { stehfestInvert } from '../numerics.js';
import { pwdLaplaceHomogeneous } from './homogeneous.js';

export const OILFIELD = {
  TD_FACTOR: 0.0002637,
  PD_FACTOR: 141.2,
  CD_FACTOR: 0.8936,
  SEMILOG_SLOPE: 162.6, // m = 162.6 q B mu / (k h) psi per log10 cycle
  DERIVATIVE_PLATEAU: 70.6, // radial derivative plateau = 70.6 q B mu / (k h) psi
  RINV_948: 948, // ri = sqrt(k t / (948 phi mu ct)) ft
  PSS_CARTESIAN: 0.23396, // m* = 0.23396 q B / (ct Vp) psi/hr
  CUBIC_FT_PER_BBL: 5.614583,
};

/** Conversion factors between dimensional inputs and dimensionless groups. */
export const toDimensionlessGroups = ({ k, phi, mu, ct, rw, h, B, q }) => ({
  // tD = tdPerHour * t[hr]
  tdPerHour: (OILFIELD.TD_FACTOR * k) / (phi * mu * ct * rw * rw),
  // dp[psi] = dpPerPd * pD
  dpPerPd: (OILFIELD.PD_FACTOR * q * B * mu) / (k * h),
  // CD = cdPerBblPsi * C[bbl/psi]
  cdPerBblPsi: OILFIELD.CD_FACTOR / (phi * ct * h * rw * rw),
});

export const MODEL_CATALOG = [
  {
    id: 'homogeneous',
    label: 'Homogeneous reservoir',
    wellbore: 'Constant wellbore storage and skin',
    boundary: 'Infinite acting',
    parameters: [
      { key: 'k', label: 'Permeability', symbol: 'k', unit: 'md', default: 50, min: 1e-3, max: 1e5, logScale: true },
      { key: 'skin', label: 'Skin factor', symbol: 'S', unit: 'dimensionless', default: 0, min: -5, max: 100, logScale: false },
      { key: 'C', label: 'Wellbore storage', symbol: 'C', unit: 'bbl/psi', default: 0.01, min: 1e-6, max: 10, logScale: true },
    ],
    pwdLaplace: pwdLaplaceHomogeneous,
  },
];

export const getModel = (id) => MODEL_CATALOG.find((m) => m.id === id) || null;

export const defaultParams = (model) =>
  Object.fromEntries(model.parameters.map((p) => [p.key, p.default]));

const toDimensionlessParams = (params, groups) => ({
  skin: params.skin ?? 0,
  cd: (params.C ?? 0) * groups.cdPerBblPsi,
});

/**
 * Dimensionless pwD(tD) for a catalog model via Stehfest inversion.
 */
export const modelPwd = (model, tD, dimlessParams, stehfestN = 12) =>
  stehfestInvert((u) => model.pwdLaplace(u, dimlessParams), tD, stehfestN);

/**
 * Constant-rate drawdown response.
 * @returns array of { t, dp, pw } with dp = pi - pwf(t)
 */
export const evaluateDrawdown = ({ model, params, reservoir, times, stehfestN = 12 }) => {
  const groups = toDimensionlessGroups({ ...reservoir, k: params.k });
  const dimless = toDimensionlessParams(params, groups);
  const pi = reservoir.pi ?? 0;
  return times.map((t) => {
    const pwd = modelPwd(model, groups.tdPerHour * t, dimless, stehfestN);
    const dp = groups.dpPerPd * pwd;
    return { t, dp, pw: pi - dp };
  });
};

/**
 * Buildup response after producing at constant rate q for tp hours, by exact
 * superposition of the constant-rate solution (linear system, constant C):
 *   pws(dt) = pi - dpPerPd [ pwD(tp + dt) - pwD(dt) ]
 *   dp(dt)  = pws(dt) - pwf(tp)
 *           = dpPerPd [ pwD(tp) - pwD(tp + dt) + pwD(dt) ]
 * @returns array of { dt, dp, pws } plus pwfAtShutIn on the array object
 */
export const evaluateBuildup = ({ model, params, reservoir, tp, dts, stehfestN = 12 }) => {
  const groups = toDimensionlessGroups({ ...reservoir, k: params.k });
  const dimless = toDimensionlessParams(params, groups);
  const pi = reservoir.pi ?? 0;
  const pwdTp = modelPwd(model, groups.tdPerHour * tp, dimless, stehfestN);
  const pwfAtShutIn = pi - groups.dpPerPd * pwdTp;
  const points = dts.map((dt) => {
    const pwdSum =
      pwdTp -
      modelPwd(model, groups.tdPerHour * (tp + dt), dimless, stehfestN) +
      modelPwd(model, groups.tdPerHour * dt, dimless, stehfestN);
    const dp = groups.dpPerPd * pwdSum;
    return { dt, dp, pws: pwfAtShutIn + dp };
  });
  points.pwfAtShutIn = pwfAtShutIn;
  return points;
};

/**
 * Dispatch a model evaluation by test type ('drawdown' | 'buildup').
 */
export const evaluateModelTest = ({ testType, ...rest }) => {
  if (testType === 'buildup') return evaluateBuildup(rest);
  return evaluateDrawdown({ ...rest, times: rest.times ?? rest.dts });
};
