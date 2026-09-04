/**
 * Gas well inflow performance for the Nodal Analysis Studio (NA1).
 *
 * Three routes, all producing the same curve contract [{ q (Mscf/d), pwf }]:
 *
 *  - darcyGasIpr: theoretical pseudo-steady-state deliverability on real-gas
 *    pseudo-pressure m(p), q = kh [m(pr) - m(pwf)] / (1422 T (ln(re/rw)
 *    - 0.75 + s + D q)), with the m(p) table built by the harness-validated
 *    Well Test Studio gas layer (buildGasPvtTable + makePseudoPressure).
 *    The optional non-Darcy coefficient D makes the equation implicit in q;
 *    solved by damped fixed-point iteration. This one STAYS HERE: m(p) is
 *    a table owned by the welltest gas layer, and it is the one route
 *    with no closed-form inverse.
 *
 *  - backPressureIpr: Rawlins-Schellhardt q = C (pr^2 - pwf^2)^n
 *  - litIpr: Houpeurt/LIT delta = a q + b q^2 on pressure-squared
 *
 * Those last two are RE-EXPORTED from the central @petrolord/engines
 * repo (`engines/production/nodal.js`, vendored at packages/engines),
 * where they are gated against an independent Python oracle. They now
 * also carry `pwfAt(q)` and `qAt(pwf)`, the closed-form inverse and
 * forward the empirical families admit, which is strictly more than
 * this module used to return.
 *
 * Never edit the vendored copy from the Suite; changes go to
 * Petrolord/petrolord-engines and are subtree-pulled back.
 */

import { buildGasPvtTable, makePseudoPressure } from '../welltest/gas.js';
import { linspace, num } from './numerics.js';

export { backPressureIpr, litIpr } from '../production/engine/nodal.js';

/** Sample a gas IPR curve from a q(pwf) evaluator. */
const sampleCurve = (pr, qOf, nPoints) =>
  linspace(pr, 0, Math.max(2, nPoints)).map((pwf) => ({ q: Math.max(0, qOf(pwf)), pwf }));

/**
 * Theoretical gas IPR on pseudo-pressure.
 * inputs: { pr (psia), tempF, gasGravity, k (md), h (ft), re (ft), rw (ft),
 *           skin = 0, dNonDarcy = 0 (1/(Mscf/d)), nPoints = 40 }
 * Returns { curve, aof, mOfP, warnings }.
 */
export const darcyGasIpr = (inputs) => {
  const pr = num(inputs.pr, NaN);
  const tempF = num(inputs.tempF, NaN);
  const gasGravity = num(inputs.gasGravity, 0.65);
  const k = num(inputs.k, NaN);
  const h = num(inputs.h, NaN);
  const re = num(inputs.re, 1490);
  const rw = num(inputs.rw, 0.354);
  const skin = num(inputs.skin, 0);
  const dNonDarcy = Math.max(0, num(inputs.dNonDarcy, 0));
  const warnings = [];

  if (!(pr > 0) || !(tempF > 0) || !(k > 0) || !(h > 0) || !(re > rw) || !(rw > 0)) {
    return { curve: [], aof: NaN, warnings: ['Darcy gas IPR needs positive pr, T, k, h and re > rw > 0.'] };
  }

  const pvtRows = buildGasPvtTable({ gasGravity, tempF, pMax: Math.max(1.2 * pr, 2000) });
  const pseudo = makePseudoPressure(pvtRows);
  if (!pseudo) {
    return { curve: [], aof: NaN, warnings: ['Gas PVT table could not be built for the pseudo-pressure transform.'] };
  }
  const { mOfP } = pseudo;
  const tR = tempF + 460;
  const geom = Math.log(re / rw) - 0.75 + skin;
  if (!(geom > 0)) warnings.push('ln(re/rw) - 0.75 + s is not positive; skin dominates the geometry term.');

  const qOf = (pwf) => {
    const dm = mOfP(pr) - mOfP(Math.max(pwf, 0));
    if (!(dm > 0) || !(geom > 0)) return 0;
    const qDarcy = (k * h * dm) / (1422 * tR * geom);
    if (!(dNonDarcy > 0)) return qDarcy;
    // Implicit in q through the rate-dependent skin D q: damped fixed point.
    let q = qDarcy;
    for (let i = 0; i < 60; i += 1) {
      const qNew = (k * h * dm) / (1422 * tR * (geom + dNonDarcy * q));
      if (Math.abs(qNew - q) < 1e-8 * Math.max(qNew, 1)) return qNew;
      q = 0.5 * (q + qNew);
    }
    return q;
  };

  const curve = sampleCurve(pr, qOf, inputs.nPoints || 40);
  return { curve, aof: qOf(0), mOfP, warnings };
};
