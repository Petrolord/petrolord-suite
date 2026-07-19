/**
 * Wellhead choke performance for the Nodal Analysis Studio (NA3).
 *
 * Two-phase critical (sonic) flow: the Gilbert family
 *   pwh = C R^m q / S^n
 * with pwh in psia (Guo & Ghalambor Table 5.3 / SPE PEH Table 1.9
 * convention; Gilbert's original 1954 form was psig - documented choice,
 * the ~15 psi difference is far inside correlation scatter), q gross
 * liquid stb/d, R producing GLR scf/stb, S choke size in 64ths inch.
 * Valid for critical flow only (p_dn/p_up below ~0.55; Gilbert required
 * p_up >= 1.7 p_dn); results carry a validity flag, not a hard error.
 *
 * Single-phase gas chokes (Guo & Ghalambor Eqs. 5.1/5.5/5.8, constants
 * multiply AREA in in^2 - the circulating "879.4 d^2" variant is wrong
 * by 4/pi):
 *   critical ratio  yc = (2/(k+1))^(k/(k-1))
 *   sonic     qsc = 879 Cd A p_up sqrt( k/(gamma T_up) yc^((k+1)/(k-1))... )
 *             (equation written in full below)
 *   subsonic  qsc = 1248 Cd A p_up sqrt( k/((k-1) gamma T_up)
 *                    [ y^(2/k) - y^((k+1)/k) ] ),  y = p_dn/p_up
 * qsc Mscf/d, p psia, T degR, A in^2. Downstream temperature by the
 * isentropic ideal-gas form T_dn = T_up (p_out/p_up)^((k-1)/k).
 *
 * Subcritical TWO-PHASE flow (Sachdeva/Perkins class) is deliberately
 * not modeled in NA3: the screening treatment reports the critical-flow
 * answer with valid=false when the ratio is subcritical. The Guo Table
 * 5.4 Sachdeva worked example is parked unarmed in literature-fixtures
 * until the primary SPE 15657 equations are transcribed.
 */

import { brentSolve } from './numerics.js';

export const CHOKE_COEFFS = {
  gilbert: { c: 10, m: 0.546, n: 1.89 },
  ros: { c: 17.4, m: 0.5, n: 2 },
  baxendell: { c: 9.56, m: 0.546, n: 1.93 },
  achong: { c: 3.82, m: 0.65, n: 1.88 },
  pilehvari: { c: 46.67, m: 0.313, n: 2.11 },
};

const coeffs = (correlation) => {
  const k = CHOKE_COEFFS[correlation];
  if (!k) throw new Error(`unknown choke correlation "${correlation}"`);
  return k;
};

const CRITICAL_RATIO_LIMIT = 0.55;

/** Wellhead pressure (psia) required by the choke at rate q. */
export const chokeWhp = ({ q, glr, s64, correlation = 'gilbert', pDownstream = 0 }) => {
  const { c, m, n } = coeffs(correlation);
  const pwh = (c * Math.pow(glr, m) * q) / Math.pow(s64, n);
  return withValidity(pwh, pDownstream);
};

/** Critical-flow rate (stb/d) through the choke at wellhead pressure pwh. */
export const chokeRate = ({ pwh, glr, s64, correlation = 'gilbert', pDownstream = 0 }) => {
  const { c, m, n } = coeffs(correlation);
  const q = (pwh * Math.pow(s64, n)) / (c * Math.pow(glr, m));
  return { ...withValidity(pwh, pDownstream), q };
};

/** Choke size (64ths in) passing rate q at wellhead pressure pwh. */
export const chokeSize = ({ pwh, q, glr, correlation = 'gilbert' }) => {
  const { c, m, n } = coeffs(correlation);
  return Math.pow((c * Math.pow(glr, m) * q) / pwh, 1 / n);
};

const withValidity = (pwh, pDn) => ({
  pwh,
  ratio: pwh > 0 ? pDn / pwh : NaN,
  valid: pwh > 0 && pDn / pwh <= CRITICAL_RATIO_LIMIT,
});

// ---------------------------------------------------------------------------
// single-phase gas chokes

/** Critical (sonic) downstream/upstream pressure ratio. */
export const criticalRatio = (k) => Math.pow(2 / (k + 1), k / (k - 1));

const chokeArea = (dIn) => (Math.PI / 4) * dIn * dIn; // in^2

/**
 * Gas rate through a choke (Mscf/d).
 * inputs: { pUp psia, pDn psia, dIn choke diameter (in), gasSg, tUpF,
 *   k = 1.28, cd discharge coefficient }
 * returns { qMscfd, regime, yc, tDnF }
 */
export const gasChokeRate = ({ pUp, pDn, dIn, gasSg, tUpF, k = 1.28, cd = 0.85 }) => {
  const yc = criticalRatio(k);
  const tUpR = tUpF + 460;
  const a = chokeArea(dIn);
  const y = pDn / pUp;
  const sonic = y <= yc;
  const qMscfd = sonic
    ? 879 * cd * a * pUp * Math.sqrt((k / (gasSg * tUpR)) * Math.pow(2 / (k + 1), (k + 1) / (k - 1)))
    : 1248 *
      cd *
      a *
      pUp *
      Math.sqrt(
        (k / ((k - 1) * gasSg * tUpR)) * (Math.pow(y, 2 / k) - Math.pow(y, (k + 1) / k))
      );
  const pOut = sonic ? yc * pUp : pDn;
  const tDnF = tUpR * Math.pow(pOut / pUp, (k - 1) / k) - 460;
  return { qMscfd, regime: sonic ? 'sonic' : 'subsonic', yc, tDnF, pOut };
};

/**
 * Upstream pressure needed to pass qMscfd against downstream pDn
 * (Guo Example 5.3 procedure): below the minimum-sonic rate the flow is
 * subsonic and the subsonic equation is solved for pUp; at or above it,
 * the sonic equation inverts in closed form.
 */
export const gasChokeUpstream = ({ qMscfd, pDn, dIn, gasSg, tUpF, k = 1.28, cd = 0.85 }) => {
  const yc = criticalRatio(k);
  const tUpR = tUpF + 460;
  const a = chokeArea(dIn);
  const sonicFactor =
    879 * cd * a * Math.sqrt((k / (gasSg * tUpR)) * Math.pow(2 / (k + 1), (k + 1) / (k - 1)));

  const pUpSonicMin = pDn / yc;
  const qAtSonicMin = sonicFactor * pUpSonicMin;
  if (qMscfd >= qAtSonicMin) {
    return { pUp: qMscfd / sonicFactor, regime: 'sonic', yc, pUpSonicMin, qAtSonicMin };
  }

  const subsonicQ = (pUp) => {
    const y = pDn / pUp;
    return (
      1248 *
      cd *
      a *
      pUp *
      Math.sqrt((k / ((k - 1) * gasSg * tUpR)) * (Math.pow(y, 2 / k) - Math.pow(y, (k + 1) / k)))
    );
  };
  const solved = brentSolve((p) => subsonicQ(p) - qMscfd, pDn * 1.000001, pUpSonicMin, {
    tol: 1e-6,
  });
  return {
    pUp: solved.converged ? solved.root : NaN,
    regime: 'subsonic',
    yc,
    pUpSonicMin,
    qAtSonicMin,
  };
};
