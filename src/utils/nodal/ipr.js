/**
 * Oil inflow performance relationships for the Nodal Analysis Studio (NA1).
 *
 * Models:
 *  - 'pi'        straight-line productivity index, q = J (pr - pwf)
 *  - 'vogel'     Vogel (1968) dimensionless IPR, saturated reservoirs
 *  - 'composite' Standing style combined PI above Pb + Vogel below Pb
 *  - 'fetkovich' Fetkovich (1973), q = C (pr^2 - pwf^2)^n
 *  - 'jones'     Jones, Blount and Glaze, pr - pwf = a q + b q^2
 *
 * Rates are LIQUID rates (stb/d): the IPR describes total liquid inflow and
 * water cut only changes what the wellbore carries, which is the VLP side's
 * concern. Pressures in psia. Curves are arrays of { q, pwf } from q = 0
 * (pwf = pr) to qmax (pwf near 0), ready for ChartFrame consumption.
 *
 * Validation: Vogel is its own reference (the equation is the anchor);
 * composite/Fetkovich/Jones are gated against the independent Python
 * oracle (tools/validation/nodal/oracle.py) and, when book fixtures are
 * armed, against Economides, Petroleum Production Systems worked examples.
 */

import { linspace, num, brentSolve } from './numerics';

const VOGEL_A = 0.2;
const VOGEL_B = 0.8;

/** Vogel dimensionless rate at a pressure ratio r = pwf/pr. */
const vogelRatio = (r) => 1 - VOGEL_A * r - VOGEL_B * r * r;

/** Rate at pwf for a fully characterized model (the forward evaluation). */
export const rateAtPwf = (model, pwf) => {
  const p = Math.max(0, pwf);
  switch (model.model) {
    case 'pi':
      return Math.max(0, model.pi * (model.pr - p));
    case 'vogel': {
      if (p >= model.pr) return 0;
      return model.qmax * vogelRatio(p / model.pr);
    }
    case 'composite': {
      const { pr, pb, pi } = model;
      if (p >= pr) return 0;
      if (p >= pb || pb <= 0) return pi * (pr - p);
      const qb = pi * (pr - pb);
      return qb + ((pi * pb) / 1.8) * vogelRatio(p / pb);
    }
    case 'fetkovich': {
      const delta = model.pr * model.pr - p * p;
      return delta > 0 ? model.c * Math.pow(delta, model.n) : 0;
    }
    case 'jones': {
      const { a, b, pr } = model;
      const dp = pr - p;
      if (dp <= 0) return 0;
      if (!(b > 0)) return a > 0 ? dp / a : 0;
      return (-a + Math.sqrt(a * a + 4 * b * dp)) / (2 * b);
    }
    default:
      return 0;
  }
};

/** Flowing pressure at rate q (inverse evaluation, used by the system solve). */
export const pwfAtRate = (model, q) => {
  if (q <= 0) return model.pr;
  const qmax = model.qmax ?? rateAtPwf(model, 0);
  if (q >= qmax) return 0;
  const solved = brentSolve((p) => rateAtPwf(model, p) - q, 0, model.pr, { tol: 1e-6 });
  return solved.converged ? solved.root : NaN;
};

/**
 * Calibrate the chosen model from its inputs and an optional well test
 * point { q, pwf }. Exactly one of (testPoint, pi/qmax/c/params) must pin
 * the curve; the test point wins when both are present.
 */
const calibrate = ({ model, pr, pb, testPoint, pi, qmax, c, n, a, b }) => {
  const warnings = [];
  switch (model) {
    case 'pi': {
      let J = num(pi, NaN);
      if (testPoint) {
        const dp = pr - testPoint.pwf;
        if (dp > 0) J = testPoint.q / dp;
        else warnings.push('Test point pwf is at or above reservoir pressure; PI not calibrated from it.');
      }
      if (!(J > 0)) warnings.push('Productivity index is not positive.');
      return { pi: J, qmax: J * pr, warnings };
    }
    case 'vogel': {
      let qm = num(qmax, NaN);
      if (testPoint) {
        const r = testPoint.pwf / pr;
        const denom = vogelRatio(r);
        if (denom > 0) qm = testPoint.q / denom;
        else warnings.push('Test point sits above reservoir pressure; qmax not calibrated from it.');
      }
      if (!(qm > 0)) warnings.push('Vogel qmax is not positive.');
      return { qmax: qm, warnings };
    }
    case 'composite': {
      const pbv = Math.min(num(pb, 0), pr);
      let J = num(pi, NaN);
      if (testPoint) {
        const { q, pwf } = testPoint;
        if (pwf >= pbv) {
          const dp = pr - pwf;
          if (dp > 0) J = q / dp;
          else warnings.push('Test point pwf is at or above reservoir pressure; PI not calibrated from it.');
        } else {
          // q = J [ (pr - pb) + (pb/1.8) vogelRatio(pwf/pb) ]  -> linear in J
          const factor = (pr - pbv) + (pbv / 1.8) * vogelRatio(pwf / pbv);
          if (factor > 0) J = q / factor;
          else warnings.push('Composite calibration factor is not positive; check pb versus pr.');
        }
      }
      if (!(J > 0)) warnings.push('Productivity index is not positive.');
      const qmaxComposite = J > 0 ? J * (pr - pbv) + (J * pbv) / 1.8 : NaN;
      return { pi: J, pb: pbv, qmax: qmaxComposite, warnings };
    }
    case 'fetkovich': {
      const nv = num(n, 1);
      let C = num(c, NaN);
      if (testPoint) {
        const delta = pr * pr - testPoint.pwf * testPoint.pwf;
        if (delta > 0) C = testPoint.q / Math.pow(delta, nv);
        else warnings.push('Test point pwf is at or above reservoir pressure; C not calibrated from it.');
      }
      if (!(C > 0)) warnings.push('Fetkovich C is not positive.');
      if (nv < 0.5 || nv > 1.0) warnings.push('Fetkovich exponent n outside the physical 0.5 to 1.0 band.');
      return { c: C, n: nv, qmax: C > 0 ? C * Math.pow(pr * pr, nv) : NaN, warnings };
    }
    case 'jones': {
      const av = num(a, NaN);
      const bv = num(b, NaN);
      if (!(av >= 0) || !(bv >= 0)) warnings.push('Jones coefficients a and b must be non-negative.');
      const qmaxJones = bv > 0
        ? (-av + Math.sqrt(av * av + 4 * bv * pr)) / (2 * bv)
        : (av > 0 ? pr / av : NaN);
      if (testPoint) {
        const predicted = pr - (av * testPoint.q + bv * testPoint.q * testPoint.q);
        if (Math.abs(predicted - testPoint.pwf) > 0.02 * pr) {
          warnings.push('Jones a, b do not reproduce the test point within 2 percent of pr.');
        }
      }
      return { a: av, b: bv, qmax: qmaxJones, warnings };
    }
    default:
      return { warnings: [`Unknown IPR model "${model}".`] };
  }
};

/**
 * Compute a full oil IPR.
 * inputs: { model, pr, pb, testPoint: {q, pwf} | null, pi, qmax, c, n, a, b,
 *           nPoints = 40 }
 * Returns { model, pr, pb, qmax, pi, c, n, a, b, curve: [{q, pwf}], warnings }.
 */
export const computeIpr = (inputs) => {
  const model = inputs.model || 'vogel';
  const pr = num(inputs.pr, NaN);
  const warnings = [];
  if (!(pr > 0)) {
    return { model, pr, curve: [], qmax: NaN, warnings: ['Reservoir pressure must be positive.'] };
  }
  const cal = calibrate({ ...inputs, model, pr });
  warnings.push(...(cal.warnings || []));

  const full = { model, pr, pb: cal.pb ?? num(inputs.pb, 0), ...cal };
  const qmax = full.qmax;
  if (!(qmax > 0)) {
    return { ...full, curve: [], warnings };
  }

  // Sample in pwf from pr down to 0 so the curve is smooth near both ends.
  const curve = linspace(pr, 0, Math.max(2, inputs.nPoints || 40)).map((pwf) => ({
    q: rateAtPwf(full, pwf),
    pwf,
  }));

  return { ...full, curve, warnings };
};

/**
 * Shift a calibrated IPR to a future reservoir pressure.
 *  - 'pi' and 'jones': coefficients held, pr replaced
 *  - 'vogel': Eickmeier cube rule, qmax_f = qmax_p (prf/prp)^3
 *  - 'composite': PI held, curve recomputed at prf
 *  - 'fetkovich': C_f = C_p (prf/prp), the standard Fetkovich decline
 * Returns a fresh computeIpr result at prFuture.
 */
export const futureIpr = (iprResult, { prFuture }) => {
  const prf = num(prFuture, NaN);
  if (!(prf > 0) || !(iprResult?.pr > 0)) {
    return { ...iprResult, curve: [], warnings: ['Future reservoir pressure must be positive.'] };
  }
  const ratio = prf / iprResult.pr;
  switch (iprResult.model) {
    case 'vogel':
      return computeIpr({ model: 'vogel', pr: prf, qmax: iprResult.qmax * ratio ** 3 });
    case 'fetkovich':
      return computeIpr({ model: 'fetkovich', pr: prf, c: iprResult.c * ratio, n: iprResult.n });
    case 'composite':
      return computeIpr({ model: 'composite', pr: prf, pb: Math.min(iprResult.pb, prf), pi: iprResult.pi });
    case 'jones':
      return computeIpr({ model: 'jones', pr: prf, a: iprResult.a, b: iprResult.b });
    case 'pi':
    default:
      return computeIpr({ model: 'pi', pr: prf, pi: iprResult.pi });
  }
};
