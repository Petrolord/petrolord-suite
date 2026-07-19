/**
 * Wellbore pressure traverse for the Nodal Analysis Studio (NA2).
 *
 * Marches the two-phase gradient along measured depth with a Heun
 * (predictor-corrector) step: PVT, in-situ flows and the correlation are
 * re-evaluated at local (p, T) every stage, so the traverse is exact to
 * second order in step size for the smooth black-oil property field.
 *
 * Direction convention: gradients are dp/dMD with MD increasing downhole
 * for a producing (upward-flowing) well. Marching down from a wellhead
 * pressure adds the gradient; marching up from a bottomhole pressure
 * subtracts it. Both directions use the same signed step.
 *
 * Field units: psia, degF, ft, inches, stb/d, scf/stb.
 */

import { pvtAt } from './pvt.js';
import { inSituRates, inSituRatesGas, pipeArea } from './flows.js';
import { tvdAtMd, angleAtMd } from './trajectory.js';
import { gradientFor } from './correlations/index.js';
import { clamp } from './numerics.js';

const MIN_P = 14.7;
const MAX_STEPS = 5000;

/**
 * Local gradient bundle at (md, p).
 * Shared by the marcher and by tests that gate single-point gradients.
 */
export const gradientAt = ({
  md,
  p,
  fluidModel,
  rates,
  trajectory,
  tAt,
  idIn,
  rough = 0,
  correlation = 'beggsBrill',
}) => {
  const tvd = tvdAtMd(trajectory, md);
  const tF = tAt(tvd);
  const pvt = pvtAt(fluidModel, p, tF);
  const areaFt2 = pipeArea(idIn);
  // Gas-well streams (Gray-class) are gas-centric: qg Mscf/d plus
  // water-gas and condensate-gas ratios. Oil-well streams use qo/wct/gor.
  const gasStream = Number.isFinite(rates.qgMscfd);
  const flows = gasStream
    ? inSituRatesGas({
        qgMscfd: rates.qgMscfd,
        wgr: rates.wgr ?? 0,
        cgr: rates.cgr ?? 0,
        pvt,
        areaFt2,
      })
    : inSituRates({ qo: rates.qo, wct: rates.wct ?? 0, gor: rates.gor, pvt, areaFt2 });
  // Producing gas-liquid ratio (scf per stb of total surface liquid) for
  // the Fancher-Brown friction bands.
  const glr = gasStream
    ? (rates.qgMscfd * 1000) / Math.max(((rates.wgr ?? 0) + (rates.cgr ?? 0)) * (rates.qgMscfd / 1000), 1e-9)
    : (rates.gor ?? 0) * (1 - (rates.wct ?? 0));
  // angleAtMd is from vertical; correlations use angle from horizontal,
  // positive for upflow in a producer.
  const thetaDeg = 90 - angleAtMd(trajectory, md);
  const grad = gradientFor(correlation)({ p, thetaDeg, dIn: idIn, rough, flows, pvt, glr });
  return { ...grad, tvd, tF, pvt, flows, thetaDeg };
};

/**
 * Pressure traverse between two measured depths.
 *
 * inputs: {
 *   fluidModel   buildFluidModel output
 *   rates        { qo (stb/d), wct (frac), gor (scf/stb) }
 *   trajectory   buildTrajectory output
 *   tAt          (tvdFt) -> degF
 *   idIn         tubing inner diameter (in)
 *   roughnessIn  absolute roughness (in), default 0.0006 (new tubing)
 *   correlation  id in CORRELATIONS
 *   pStart       pressure (psia) at mdStart
 *   mdStart, mdEnd  measured depths (ft); mdEnd > mdStart marches down
 *   stepFt       target step (ft), default 100
 * }
 * returns { points, pEnd, ok, warnings }; points hold md, tvd, tF, p and
 * the gradient diagnostics at each station (p at a station is the
 * pressure BEFORE stepping away from it).
 */
export const computeTraverse = ({
  fluidModel,
  rates,
  trajectory,
  tAt,
  idIn,
  roughnessIn = 0.0006,
  correlation = 'beggsBrill',
  pStart,
  mdStart,
  mdEnd,
  stepFt = 100,
}) => {
  const rough = roughnessIn / idIn;
  const span = mdEnd - mdStart;
  const nSteps = clamp(Math.ceil(Math.abs(span) / Math.max(stepFt, 1)), 1, MAX_STEPS);
  const h = span / nSteps;

  const warnings = [];
  const evalGrad = (md, p) =>
    gradientAt({ md, p, fluidModel, rates, trajectory, tAt, idIn, rough, correlation });

  let p = pStart;
  let md = mdStart;
  let g = evalGrad(md, p);
  const points = [snapshot(md, p, g)];

  for (let i = 0; i < nSteps; i += 1) {
    const mdNext = i === nSteps - 1 ? mdEnd : md + h;
    const pPred = p + g.dpdz * h;
    if (pPred < MIN_P) {
      warnings.push(`pressure fell to atmospheric at md ${Math.round(mdNext)} ft; flow not sustainable at this rate`);
      return { points, pEnd: MIN_P, ok: false, warnings };
    }
    const gPred = evalGrad(mdNext, pPred);
    const pNext = p + (h * (g.dpdz + gPred.dpdz)) / 2;
    if (pNext < MIN_P) {
      warnings.push(`pressure fell to atmospheric at md ${Math.round(mdNext)} ft; flow not sustainable at this rate`);
      return { points, pEnd: MIN_P, ok: false, warnings };
    }
    p = pNext;
    md = mdNext;
    g = evalGrad(md, p);
    points.push(snapshot(md, p, g));
  }

  return { points, pEnd: p, ok: true, warnings };
};

const snapshot = (md, p, g) => ({
  md,
  tvd: g.tvd,
  tF: g.tF,
  p,
  dpdz: g.dpdz,
  holdup: g.holdup,
  pattern: g.pattern,
  gradGrav: g.gradGrav,
  gradFric: g.gradFric,
});

/** Flowing BHP at node depth from wellhead pressure (marches down). */
export const bhpFromWhp = (opts) =>
  computeTraverse({ ...opts, pStart: opts.whp, mdStart: 0, mdEnd: opts.nodeMd });

/** Flowing WHP from a known bottomhole pressure (marches up). */
export const whpFromBhp = (opts) =>
  computeTraverse({ ...opts, pStart: opts.bhp, mdStart: opts.nodeMd, mdEnd: 0 });

/**
 * VLP (tubing performance) curve: node BHP vs oil rate at fixed wellhead
 * pressure. Rates where the wellhead pressure cannot lift the column
 * (traverse hits atmospheric marching down never happens; marching down
 * always integrates, so all points return) are still reported; unstable
 * left-branch behavior is NA3's operating-point concern.
 */
export const vlpCurve = ({ qos, ...opts }) =>
  qos.map((qo) => {
    const res = bhpFromWhp({ ...opts, rates: { ...opts.rates, qo } });
    return { q: qo, bhp: res.pEnd, ok: res.ok };
  });
