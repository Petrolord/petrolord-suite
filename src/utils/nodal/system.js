/**
 * Nodal system solve for the Nodal Analysis Studio (NA3): IPR x VLP
 * operating point at the bottomhole node, with stability classification
 * and sensitivity sweeps.
 *
 * WHAT MOVED AND WHAT DID NOT. The solver itself -- the crossing scan,
 * the Brent refinement, the stability slope and the choice of the
 * rightmost stable crossing -- now lives in the central
 * @petrolord/engines repo at `engines/production/nodal.js`, vendored
 * here at packages/engines (git subtree) and gated there against an
 * independent Python oracle that scans four thousand points and
 * bisects, and differentiates the residual analytically, where the
 * engine scans forty and takes a central difference.
 *
 * What stays here is the WIRING, and it stays because of what it wires
 * to: `solveOperatingPoint` binds the NA2 multiphase traverse
 * (Beggs-Brill, Hagedorn-Brown, Gray, Fancher-Brown through the Suite's
 * PVT model), which is a Suite-side engine and not an extracted one.
 * The shared solver takes its two curves as functions precisely so that
 * this file can hand it that traverse.
 *
 * Physics of the classification, unchanged: the VLP curve is J-shaped
 * (gravity dominated and falling at low rate, friction dominated and
 * rising at high rate) while the IPR falls monotonically. Where both
 * curves cross, the node is STABLE only if the VLP slope exceeds the
 * IPR slope (d(bhp_vlp - pwf_ipr)/dq > 0): a rate perturbation then
 * self-corrects. The left-branch intersection, when present, is the
 * unstable heading point. The reported operating point is the rightmost
 * stable crossing.
 *
 * Never edit the vendored copy from the Suite; changes go to
 * Petrolord/petrolord-engines and are subtree-pulled back.
 */

import { pwfAtRate, rateAtPwf } from './ipr.js';
import { bhpFromWhp } from './traverse.js';
import { cullenderSmithBhp } from './cullenderSmith.js';
import { gasPwfAtRate, solveNodeCore } from '../production/engine/nodal.js';

export { solveNodeCore, gasPwfAtRate } from '../production/engine/nodal.js';

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

/**
 * Gas-well operating point: sampled gas IPR (darcy/back-pressure/LIT) x
 * a gas column. outflow: 'cullenderSmith' (dry gas, vlp holds the
 * cullenderSmithBhp inputs sans rate) or 'gray' (wet gas via the
 * traverse; vlp holds bhpFromWhp inputs with rates { wgr, cgr }).
 * Rates in Mscf/d throughout.
 *
 * The inflow is read off the SAMPLED curve rather than inverted, because
 * the pseudo-pressure route has no inverse to invert: m(p) is a table.
 * The engine now exposes `gasPwfAtRateExact`, which uses the closed form
 * where the empirical families admit one; switching to it moves the
 * operating rate of a gated well by about half a Mscf/d in eleven
 * thousand and is a studio behaviour change, so it is a follow-on rather
 * than part of the extraction.
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
