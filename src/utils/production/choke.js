/**
 * Choke & Wellhead Performance Studio analytics (Production P8).
 *
 * The choke correlations are the Suite's own validated nodal layer
 * (`utils/nodal/chokes.js`, NA3) and the wellhead limits are engine
 * work (`utils/production/engine/chokePerformance`). What lives HERE is
 * the thing neither of them can do alone: putting the choke into the
 * nodal solve, so a bean size becomes a rate on a real well.
 *
 * THE CHOKE AS A SURFACE CONSTRAINT. Ordinary nodal analysis solves
 * inflow against tubing at a fixed wellhead pressure. A choked well
 * does not have a fixed wellhead pressure: the bean sets it. So the
 * chain is
 *
 *   rate q  ->  choke says what wellhead pressure it takes
 *           ->  tubing says what bottomhole pressure that needs
 *           ->  inflow says what bottomhole pressure that rate gives
 *
 * and the operating point is where the last two agree. One equation,
 * one unknown, solved on the difference.
 *
 * WHERE THE CORRELATION STOPS. The Gilbert family is a CRITICAL-flow
 * correlation. Below about a 0.55 downstream-to-upstream ratio the flow
 * is subcritical, the correlation does not hold, and the bean stops
 * controlling the well. Finding the bean size at which that happens is
 * one of the more useful things this studio does, and everything past
 * it is reported as out of range rather than drawn as if it were fine.
 *
 * Pressures psia, rates stb/d (oil) or Mscf/d (gas), bean sizes 64ths.
 */

// Relative imports (not the @/ alias) so this module also loads outside
// Vite: tools/validation/production-validation.ts exercises it directly.
import {
  chokeWhp, chokeRate, chokeSize, CHOKE_COEFFS, gasChokeRate, gasChokeUpstream,
  criticalRatio,
} from '../nodal/chokes.js';
import { pwfAtRate, rateAtPwf } from '../nodal/ipr.js';
import { bhpFromWhp } from '../nodal/traverse.js';
import { gasPwfAtRate } from '../nodal/system.js';
import { cullenderSmithBhp } from '../nodal/cullenderSmith.js';
import { pvtAt } from '../nodal/pvt.js';
import { brentSolve, linspace, num } from '../nodal/numerics.js';
import {
  erosionalCheck, erosionalRateBpd, erosionalC, EROSIONAL_C,
  fitGilbertCoefficients, hydrateScreening, hydrateFormationTempF,
} from './engine/chokePerformance.js';

/** Bean sizes a wellhead actually carries, in 64ths of an inch. */
export const BEAN_SIZES_64 = [
  8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64, 80, 96,
];

/** Below this downstream/upstream ratio the Gilbert family holds. */
export const CRITICAL_RATIO_LIMIT = 0.55;

/**
 * Solve the operating point of a choked OIL well.
 *
 * For each candidate rate the choke fixes the wellhead pressure and the
 * tubing carries it down; the residual against the inflow closes the
 * problem. Refuses rather than extrapolating when the two never meet.
 *
 * returns { ok, q, pwh, pwf, ratio, critical, ... } or { ok: false, reason }
 */
export const solveChokedOil = ({
  model, s64, glr, wct, pDownstream, correlation = 'gilbert', coeffs, nScan = 40,
}) => {
  const qMax = model.ipr.qmax ?? rateAtPwf(model.ipr, 0);
  if (!(qMax > 0)) return { ok: false, reason: 'The inflow has no absolute open flow to solve against.' };

  const whpAt = (q) => (coeffs
    ? (coeffs.c * Math.pow(glr, coeffs.m) * q) / Math.pow(s64, coeffs.n)
    : chokeWhp({ q, glr, s64, correlation, pDownstream }).pwh);

  const residual = (q) => {
    const pwh = whpAt(q);
    if (!(pwh > 0)) return NaN;
    const outflow = bhpFromWhp({
      ...model.vlp,
      whp: pwh,
      nodeMd: model.vlp.nodeMd,
      rates: { qo: q, wct, gor: glr },
    }).pEnd;
    return outflow - pwfAtRate(model.ipr, q);
  };

  const scan = linspace(qMax * 0.01, qMax * 0.99, nScan);
  let prev = { q: scan[0], r: residual(scan[0]) };
  for (let i = 1; i < scan.length; i += 1) {
    const here = { q: scan[i], r: residual(scan[i]) };
    if (Number.isFinite(prev.r) && Number.isFinite(here.r) && prev.r * here.r < 0) {
      const solved = brentSolve(residual, prev.q, here.q, { tol: Math.max(qMax * 1e-8, 1e-8) });
      const q = solved.root;
      const pwh = whpAt(q);
      const ratio = pwh > 0 ? pDownstream / pwh : NaN;
      return {
        ok: true,
        q,
        pwh,
        pwf: pwfAtRate(model.ipr, q),
        ratio,
        critical: ratio <= CRITICAL_RATIO_LIMIT,
        converged: solved.converged,
      };
    }
    prev = here;
  }
  return {
    ok: false,
    reason: `A ${s64}/64 bean does not produce an operating point on this well: the choke and the inflow never meet inside the rate range. The bean is either too small to pass anything at this line pressure, or large enough that the well is no longer choke-controlled.`,
  };
};

/**
 * Solve the operating point of a choked GAS well.
 *
 * Same idea, different halves: the gas choke gives the upstream
 * pressure a rate needs, the Cullender and Smith column carries it
 * down, and the sampled gas inflow closes it.
 */
export const solveChokedGas = ({
  model, beanIn, pDownstream, gasSg, k = 1.28, cd = 0.85, nScan = 40,
}) => {
  const aof = model.gasIpr?.aof;
  if (!(aof > 0)) return { ok: false, reason: 'The gas inflow has no absolute open flow to solve against.' };
  const tvdMax = model.tvdMax;
  const mdMax = model.vlp.nodeMd || tvdMax;

  const residual = (qMscfd) => {
    const up = gasChokeUpstream({
      qMscfd, pDn: pDownstream, dIn: beanIn, gasSg, tUpF: model.tAt(0), k, cd,
    });
    if (!Number.isFinite(up.pUp) || up.pUp <= 0) return NaN;
    const down = cullenderSmithBhp({
      ptf: up.pUp,
      gasSg,
      mdFt: mdMax,
      tvdFt: tvdMax,
      whtF: model.tAt(0),
      bhtF: model.tAt(tvdMax),
      qMmscfd: qMscfd / 1000,
      idIn: model.vlp.idIn,
      roughnessIn: model.vlp.roughnessIn,
    });
    return down.pwf - gasPwfAtRate(model.gasIpr, qMscfd);
  };

  const scan = linspace(aof * 0.01, aof * 0.99, nScan);
  let prev = { q: scan[0], r: residual(scan[0]) };
  for (let i = 1; i < scan.length; i += 1) {
    const here = { q: scan[i], r: residual(scan[i]) };
    if (Number.isFinite(prev.r) && Number.isFinite(here.r) && prev.r * here.r < 0) {
      const solved = brentSolve(residual, prev.q, here.q, { tol: Math.max(aof * 1e-8, 1e-8) });
      const q = solved.root;
      const up = gasChokeUpstream({
        qMscfd: q, pDn: pDownstream, dIn: beanIn, gasSg, tUpF: model.tAt(0), k, cd,
      });
      const through = gasChokeRate({
        pUp: up.pUp, pDn: pDownstream, dIn: beanIn, gasSg, tUpF: model.tAt(0), k, cd,
      });
      return {
        ok: true,
        q,
        pwh: up.pUp,
        pwf: gasPwfAtRate(model.gasIpr, q),
        regime: up.regime,
        critical: up.regime === 'sonic',
        ratio: pDownstream / up.pUp,
        yc: up.yc,
        tDownstreamF: through.tDnF,
        pOut: through.pOut,
        converged: solved.converged,
      };
    }
    prev = here;
  }
  return {
    ok: false,
    reason: `A ${beanIn.toFixed(3)} in bean does not produce an operating point on this well against ${Math.round(pDownstream)} psia downstream.`,
  };
};

/**
 * The operating envelope: what the well makes at every bean size.
 *
 * This is the curve the studio exists to draw. Each point is a full
 * nodal solve, so it is an explicit run. Beans that produce no
 * operating point are kept in the list with their reason rather than
 * dropped, and the ones past the critical limit are marked, because
 * the correlation stops meaning anything there.
 */
export const operatingEnvelope = ({ model, beans, phase, oil, gas }) => beans.map((s64) => {
  if (phase === 'gas') {
    const solved = solveChokedGas({ model, beanIn: s64 / 64, ...gas });
    return { s64, beanIn: s64 / 64, ...solved };
  }
  const solved = solveChokedOil({ model, s64, ...oil });
  return { s64, beanIn: s64 / 64, ...solved };
});

/**
 * The bean size at which the flow stops being critical.
 *
 * Beyond it the Gilbert family does not apply and the bean has stopped
 * controlling the well: opening further buys much less than the curve
 * would suggest. Found by bisection on the critical flag across the
 * envelope, so it is the boundary the solved points actually show
 * rather than a rule of thumb.
 */
export const criticalBeanLimit = (envelope) => {
  const solved = envelope.filter((e) => e.ok);
  for (let i = 1; i < solved.length; i += 1) {
    if (solved[i - 1].critical && !solved[i].critical) {
      return {
        lastCriticalS64: solved[i - 1].s64,
        firstSubcriticalS64: solved[i].s64,
        rateAtLimit: solved[i - 1].q,
      };
    }
  }
  return null;
};

/**
 * The erosional check at the wellhead for an oil well.
 *
 * The in-situ rate and the mixture density come from the PVT at
 * wellhead conditions, which is why this needs the well and not just
 * the numbers: a gassy stream at 200 psia is a different fluid from the
 * same stream at 2,000.
 */
export const wellheadErosion = ({
  model, q, wct, glr, pwh, cFactor, idIn,
}) => {
  const tempF = model.tAt(0);
  const pvt = pvtAt(model.fluidModel, Math.max(pwh, 14.7), tempF);
  const wc = Math.min(Math.max(wct, 0), 0.999);
  const qwStbd = wc > 0 ? (q * wc) / (1 - wc) : 0;
  const qoRes = q * pvt.bo;
  const qwRes = qwStbd * pvt.bw;
  const freeGasScfd = Math.max(0, q * (glr - pvt.rs));
  const freeGasRes = freeGasScfd * pvt.bg;
  const liquidRes = qoRes + qwRes;
  const totalRes = liquidRes + freeGasRes;
  const massLiquid = qoRes * (pvt.rhoO ?? 0) + qwRes * (pvt.rhoW ?? 0);
  const massGas = freeGasRes * (pvt.rhoG ?? 0);
  const mixtureDensityLbFt3 = totalRes > 0 ? (massLiquid + massGas) / totalRes : 0;
  const check = erosionalCheck({
    inSituBpd: totalRes,
    idIn,
    mixtureDensityLbFt3,
    cFactor,
  });
  return {
    ...check,
    inSituBpd: totalRes,
    liquidResBpd: liquidRes,
    freeGasResBpd: freeGasRes,
    mixtureDensityLbFt3,
    maxRateBpd: erosionalRateBpd({ idIn, mixtureDensityLbFt3, cFactor }),
  };
};

/**
 * The whole analysis from studio form values.
 *
 * Coerced here and refused with reasons rather than defaulted, the same
 * contract every other production studio uses.
 */
export const runChokeAnalysis = ({ form, model }) => {
  const errors = [];
  const n = (value, label, { min = -Infinity, max = Infinity } = {}) => {
    const v = num(value, NaN);
    if (!Number.isFinite(v)) { errors.push(`${label} is required.`); return NaN; }
    if (v < min || v > max) errors.push(`${label} is outside the range this analysis can use.`);
    return v;
  };

  const s64 = n(form.s64, 'Bean size', { min: 1, max: 256 });
  const pDownstream = n(form.pDownstream, 'Downstream (line) pressure', { min: 0 });
  const flowlineIdIn = n(form.flowlineIdIn, 'Flowline inside diameter', { min: 0.5, max: 24 });
  const cFactor = n(form.cFactor, 'Erosional C factor', { min: 10, max: 400 });

  if (!model) errors.push('The well model is incomplete.');
  const phase = model?.phase;

  let glr = NaN;
  let wct = NaN;
  let gasSg = NaN;
  if (phase === 'oil') {
    glr = n(form.glr, 'Producing gas-liquid ratio', { min: 1 });
    wct = n(form.wctPct, 'Water cut', { min: 0, max: 99.9 }) / 100;
  } else {
    gasSg = n(form.gasSg, 'Gas gravity', { min: 0.5, max: 1.2 });
  }
  if (errors.length) return { ok: false, errors, result: null };

  const correlation = form.correlation || 'gilbert';
  const coeffs = form.useFitted && form.fitted ? form.fitted : null;

  const solved = phase === 'gas'
    ? solveChokedGas({
      model, beanIn: s64 / 64, pDownstream, gasSg,
      k: num(form.k, 1.28), cd: num(form.cd, 0.85),
    })
    : solveChokedOil({ model, s64, glr, wct, pDownstream, correlation, coeffs });

  if (!solved.ok) return { ok: false, errors: [solved.reason], result: null };

  const warnings = [];
  if (!solved.critical) {
    warnings.push({
      code: 'subcritical',
      message: phase === 'gas'
        ? `The flow through this bean is subsonic (${(solved.ratio * 100).toFixed(0)} percent of the upstream pressure downstream, against a critical ratio of ${(solved.yc * 100).toFixed(0)} percent). The bean is no longer setting the rate; the line pressure is.`
        : `Downstream pressure is ${(solved.ratio * 100).toFixed(0)} percent of the wellhead pressure, above the ${(CRITICAL_RATIO_LIMIT * 100).toFixed(0)} percent the Gilbert family holds to. Below critical flow this correlation does not apply and the bean has stopped controlling the well.`,
    });
  }

  let erosion = null;
  if (phase === 'oil') {
    erosion = wellheadErosion({
      model, q: solved.q, wct, glr, pwh: solved.pwh, cFactor, idIn: flowlineIdIn,
    });
    if (erosion.ok && erosion.exceeded) {
      warnings.push({
        code: 'erosional',
        message: `The flowline runs at ${erosion.velocityFtS.toFixed(1)} ft/s against an erosional limit of ${erosion.erosionalFtS.toFixed(1)} ft/s at C = ${cFactor}. Open the line up, or satisfy yourself that C is right for this service: RP 14E's own values are conservative and it allows higher where the fluid is clean and corrosion is controlled.`,
      });
    }
  }

  let hydrate = null;
  if (phase === 'gas' && Number.isFinite(solved.tDownstreamF)) {
    hydrate = hydrateScreening({
      pDownstreamPsia: solved.pOut,
      tDownstreamF: solved.tDownstreamF,
      marginF: num(form.hydrateMarginF, 0),
    });
    if (hydrate.ok && hydrate.atRisk) {
      warnings.push({
        code: 'hydrate',
        message: `Gas leaves the bean at ${solved.tDownstreamF.toFixed(0)} F and this screening puts hydrate formation at ${hydrate.formationF.toFixed(0)} F. It is a screening only, with no account of composition, but wellheads downstream of a bean are where hydrates actually form.`,
      });
    }
  }

  return {
    ok: true,
    errors: [],
    result: {
      phase,
      s64,
      beanIn: s64 / 64,
      pDownstream,
      correlation,
      usingFitted: !!coeffs,
      glr,
      wct,
      gasSg,
      cFactor,
      flowlineIdIn,
      solved,
      erosion,
      hydrate,
      warnings,
    },
  };
};

/**
 * Bean size for a target rate, on an oil well.
 *
 * The correlation inverts in closed form for a KNOWN wellhead pressure,
 * but on a real well the wellhead pressure is whatever the bean makes
 * it, so this is solved against the nodal point instead: the bean whose
 * operating point is the target rate.
 */
export const beanForRate = ({ model, targetQ, glr, wct, pDownstream, correlation, coeffs }) => {
  const at = (s64) => {
    const s = solveChokedOil({ model, s64, glr, wct, pDownstream, correlation, coeffs });
    return s.ok ? s.q - targetQ : NaN;
  };
  const lo = 4;
  const hi = 128;
  const nScan = 32;
  const scan = linspace(lo, hi, nScan);
  let prev = { s: scan[0], r: at(scan[0]) };
  for (let i = 1; i < scan.length; i += 1) {
    const here = { s: scan[i], r: at(scan[i]) };
    if (Number.isFinite(prev.r) && Number.isFinite(here.r) && prev.r * here.r < 0) {
      const solved = brentSolve(at, prev.s, here.s, { tol: 1e-4 });
      return { ok: true, s64: solved.root, converged: solved.converged };
    }
    prev = here;
  }
  return {
    ok: false,
    reason: `No bean between ${lo}/64 and ${hi}/64 puts this well at ${Math.round(targetQ).toLocaleString()} stb/d against ${Math.round(pDownstream)} psia. The target is either above what the well can make or below what the smallest bean passes.`,
  };
};

/** Well tests from the spine, shaped for the coefficient fit. */
export const testsToChokePoints = (tests) => (tests || [])
  .filter((t) => t.is_valid !== false)
  .map((t) => {
    const oil = num(t.oil_rate_stbd, 0);
    const water = num(t.water_rate_stbd, 0);
    const gas = num(t.gas_rate_mscfd, 0);
    const liquid = oil + water;
    return {
      id: t.id,
      date: t.test_date,
      wellName: t.well?.name,
      q: liquid,
      glr: liquid > 0 && gas > 0 ? (gas * 1000) / liquid : NaN,
      s64: num(t.choke_64ths, NaN),
      pwh: num(t.thp_psia, NaN),
    };
  })
  .filter((p) => Number.isFinite(p.q) && p.q > 0
    && Number.isFinite(p.glr) && p.glr > 0
    && Number.isFinite(p.s64) && p.s64 > 0
    && Number.isFinite(p.pwh) && p.pwh > 0);

export {
  CHOKE_COEFFS, chokeSize, chokeRate, chokeWhp, criticalRatio,
  fitGilbertCoefficients, erosionalC, EROSIONAL_C, hydrateFormationTempF,
};
