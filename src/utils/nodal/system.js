/**
 * Nodal system solve for the Nodal Analysis Studio (NA3): IPR x VLP
 * operating point at the bottomhole node, with stability classification
 * and sensitivity sweeps.
 *
 * The core works on injected functions (iprPwfAt(q), vlpBhpAt(q)) so the
 * closed-form validation gates exercise the exact solver used in
 * production; wrappers wire the NA1 IPR family and the NA2 traverse.
 *
 * Physics of the classification: the VLP curve is J-shaped (gravity
 * dominated and falling at low rate, friction dominated and rising at
 * high rate) while the IPR falls monotonically. Where both curves cross,
 * the node is STABLE only if the VLP slope exceeds the IPR slope
 * (d(bhp_vlp - pwf_ipr)/dq > 0): a rate perturbation then self-corrects.
 * The left-branch intersection, when present, is the unstable heading
 * point. The reported operating point is the rightmost stable crossing.
 */

import { brentSolve, linspace } from './numerics.js';
import { pwfAtRate, rateAtPwf } from './ipr.js';
import { bhpFromWhp } from './traverse.js';
import { cullenderSmithBhp } from './cullenderSmith.js';

const REL_SLOPE_DQ = 5e-3; // central-difference step as a fraction of qMax

/**
 * Generic operating-point solve.
 * inputs: {
 *   iprPwfAt  (q) -> node inflow pressure (psia), monotone decreasing
 *   vlpBhpAt  (q) -> node outflow (required bottomhole) pressure (psia)
 *   qMax      upper rate bound (AOF or model qmax)
 *   nGrid     scan resolution (default 40)
 * }
 * returns { intersections: [{ q, pwf, stable }], op, status, curve }
 *   status: 'flowing' (stable op found) | 'dead' (outflow above inflow
 *   everywhere) | 'no-stable-solution' (crossings exist, none stable)
 */
export const solveNodeCore = ({ iprPwfAt, vlpBhpAt, qMax, nGrid = 40 }) => {
  if (!(qMax > 0)) return { intersections: [], op: null, status: 'dead', curve: [] };

  const qs = linspace(qMax * 1e-3, qMax * 0.999, nGrid);
  const resid = (q) => vlpBhpAt(q) - iprPwfAt(q);
  const curve = qs.map((q) => {
    const vlp = vlpBhpAt(q);
    const ipr = iprPwfAt(q);
    return { q, vlp, ipr, g: vlp - ipr };
  });

  const intersections = [];
  for (let i = 1; i < curve.length; i += 1) {
    const a = curve[i - 1];
    const b = curve[i];
    if (!Number.isFinite(a.g) || !Number.isFinite(b.g)) continue;
    if (a.g === 0) intersections.push(refine(a.q, resid, iprPwfAt, qMax));
    if (a.g * b.g < 0) {
      const solved = brentSolve(resid, a.q, b.q, { tol: Math.max(qMax * 1e-8, 1e-8) });
      if (solved.converged) intersections.push(refine(solved.root, resid, iprPwfAt, qMax));
    }
  }

  const stable = intersections.filter((x) => x.stable);
  const op = stable.length > 0 ? stable[stable.length - 1] : null;
  const status = op
    ? 'flowing'
    : intersections.length > 0
      ? 'no-stable-solution'
      : 'dead';
  return { intersections, op, status, curve };
};

const refine = (q, resid, iprPwfAt, qMax) => {
  const dq = qMax * REL_SLOPE_DQ;
  const gPlus = resid(Math.min(q + dq, qMax));
  const gMinus = resid(Math.max(q - dq, qMax * 1e-6));
  return { q, pwf: iprPwfAt(q), stable: gPlus > gMinus };
};

/**
 * Oil-well operating point: NA1 IPR model x NA2 traverse.
 * inputs: { ipr (computeIpr result), vlp { fluidModel, trajectory, tAt,
 *   idIn, roughnessIn?, correlation, whp, nodeMd, stepFt?, rates: { wct,
 *   gor } }, nGrid? }
 */
export const solveOperatingPoint = ({ ipr, vlp, nGrid = 40 }) => {
  const qMax = ipr.qmax ?? rateAtPwf(ipr, 0);
  const vlpBhpAt = (q) =>
    bhpFromWhp({ ...vlp, rates: { ...vlp.rates, qo: q } }).pEnd;
  const iprPwfAt = (q) => pwfAtRate(ipr, q);
  return { ...solveNodeCore({ iprPwfAt, vlpBhpAt, qMax, nGrid }), qMax };
};

/** Interpolated pwf(q) over a sampled gas IPR curve ({ pwf, q } points). */
export const gasPwfAtRate = (iprResult, q) => {
  const pts = [...iprResult.curve].sort((a, b) => a.q - b.q);
  if (pts.length === 0) return NaN;
  if (q <= pts[0].q) return pts[0].pwf;
  for (let i = 1; i < pts.length; i += 1) {
    if (q <= pts[i].q) {
      const a = pts[i - 1];
      const b = pts[i];
      const t = b.q === a.q ? 0 : (q - a.q) / (b.q - a.q);
      return a.pwf + t * (b.pwf - a.pwf);
    }
  }
  return 0;
};

/**
 * Gas-well operating point: sampled gas IPR (darcy/back-pressure/LIT) x
 * a gas column. outflow: 'cullenderSmith' (dry gas, vlp holds the
 * cullenderSmithBhp inputs sans rate) or 'gray' (wet gas via the
 * traverse; vlp holds bhpFromWhp inputs with rates { wgr, cgr }).
 * Rates in Mscf/d throughout.
 */
export const solveGasOperatingPoint = ({ iprResult, outflow = 'cullenderSmith', vlp, nGrid = 40 }) => {
  const qMax = iprResult.aof;
  const vlpBhpAt =
    outflow === 'gray'
      ? (q) => bhpFromWhp({ ...vlp, rates: { ...vlp.rates, qgMscfd: q } }).pEnd
      : (q) => cullenderSmithBhp({ ...vlp, qMmscfd: q / 1000 }).pwf;
  const iprPwfAt = (q) => gasPwfAtRate(iprResult, q);
  return { ...solveNodeCore({ iprPwfAt, vlpBhpAt, qMax, nGrid }), qMax };
};

/**
 * Sensitivity sweep: solve the operating point for a list of labeled
 * cases (the caller builds each case's ipr/vlp from its parameter value).
 * cases: [{ label, value, ipr, vlp, gas?, iprResult?, outflow? }]
 */
export const operatingPointSweep = (cases) =>
  cases.map((c) => {
    const solved = c.gas
      ? solveGasOperatingPoint({ iprResult: c.iprResult, outflow: c.outflow, vlp: c.vlp, nGrid: c.nGrid })
      : solveOperatingPoint({ ipr: c.ipr, vlp: c.vlp, nGrid: c.nGrid });
    return {
      label: c.label,
      value: c.value,
      status: solved.status,
      q: solved.op ? solved.op.q : 0,
      pwf: solved.op ? solved.op.pwf : NaN,
    };
  });
