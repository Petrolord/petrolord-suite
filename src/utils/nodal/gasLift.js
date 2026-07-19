/**
 * Continuous gas-lift screening for the Nodal Analysis Studio (NA3).
 *
 * v1 screening physics: injection gas enters at (or near) the node depth,
 * so the whole tubing string flows at the lifted gas-liquid ratio. For a
 * candidate operating rate q the effective produced GOR becomes
 *
 *   gorEff(q) = gor + qgi * 1000 / q      (scf/stb oil, qgi in Mscf/d)
 *
 * capped to keep the traverse in its correlation envelope. The response
 * curve q(qgi) is the classic gas-lift performance curve: added gas first
 * lightens the column (rate rises), then friction from the extra gas
 * dominates (rate flattens and falls). The screening reports the curve,
 * the maximum-rate injection point, and the economic-slope point where
 * dq/dqgi drops below a user threshold (stb per Mscf).
 *
 * Valve spacing, unloading and injection-depth optimization are NA4+
 * concerns; this module answers "is gas lift worth studying on this
 * well, and roughly how much gas".
 */

import { solveNodeCore } from './system.js';
import { pwfAtRate, rateAtPwf } from './ipr.js';
import { bhpFromWhp } from './traverse.js';

const MAX_GOR_EFF = 50000; // scf/stb: correlation-envelope cap

/**
 * inputs: {
 *   ipr    computeIpr result
 *   vlp    bhpFromWhp inputs sans rate (rates: { wct, gor })
 *   qgis   injection rates to sweep (Mscf/d), e.g. linspace(0, 2000, 21)
 *   econSlope  diminishing-returns threshold (stb/d per Mscf/d), default 0.05
 *   nGrid  node-solve scan resolution
 * }
 * returns { response: [{ qgi, q, pwf, status }], best, econ, baseline }
 *   best: point of maximum rate; econ: last point whose incremental
 *   slope stays above econSlope (null when even the first step is below).
 */
export const gasLiftScreening = ({ ipr, vlp, qgis, econSlope = 0.05, nGrid = 40 }) => {
  const qMax = ipr.qmax ?? rateAtPwf(ipr, 0);
  const iprPwfAt = (q) => pwfAtRate(ipr, q);

  const solveAt = (qgi) => {
    const vlpBhpAt = (q) => {
      const gorEff = Math.min((vlp.rates.gor ?? 0) + (qgi * 1000) / Math.max(q, qMax * 1e-4), MAX_GOR_EFF);
      return bhpFromWhp({ ...vlp, rates: { ...vlp.rates, qo: q, gor: gorEff } }).pEnd;
    };
    const solved = solveNodeCore({ iprPwfAt, vlpBhpAt, qMax, nGrid });
    return {
      qgi,
      q: solved.op ? solved.op.q : 0,
      pwf: solved.op ? solved.op.pwf : NaN,
      status: solved.status,
    };
  };

  const response = qgis.map(solveAt);
  const baseline = response[0];

  let best = response[0];
  for (const pt of response) if (pt.q > best.q) best = pt;

  let econ = null;
  for (let i = 1; i < response.length; i += 1) {
    const dq = response[i].q - response[i - 1].q;
    const dqgi = response[i].qgi - response[i - 1].qgi;
    if (dqgi > 0 && dq / dqgi >= econSlope) econ = response[i];
    else break;
  }

  return { response, best, econ, baseline };
};
