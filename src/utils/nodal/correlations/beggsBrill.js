/**
 * Beggs and Brill (1973) two-phase pressure gradient with the Payne et al.
 * (1979) corrections for the Nodal Analysis Studio (NA2).
 *
 * Published algebra transcribed from Beggs & Brill, "A Study of Two-Phase
 * Flow in Inclined Pipes", JPT (May 1973), as presented in Brill &
 * Mukherjee, Multiphase Flow in Wells (SPE Monograph 17). Payne et al.
 * (JPT, Sep 1979) corrections: rough-pipe (Colebrook) normalizing friction
 * factor and holdup multipliers 0.924 uphill / 0.685 downhill.
 *
 * Gradient convention: dp/dL in psi/ft along measured depth in the
 * direction of increasing depth, for a producing (upward-flowing) well.
 * theta is the pipe angle from HORIZONTAL (deg): +90 vertical upflow.
 *
 * Field units throughout: ft/s, lbm/ft3, cp, dyn/cm, psia, inches.
 */

import { moodyFrictionFactor, reynoldsNumber } from '../friction.js';
import { clamp } from '../numerics.js';

const G = 32.174; // ft/s2 (and gc lbm ft / lbf s2)

const HOLDUP_COEFFS = {
  segregated: { a: 0.98, b: 0.4846, c: 0.0868 },
  intermittent: { a: 0.845, b: 0.5351, c: 0.0173 },
  distributed: { a: 1.065, b: 0.5824, c: 0.0609 },
};

const C_UPHILL = {
  segregated: { d: 0.011, e: -3.768, f: 3.539, g: -1.614 },
  intermittent: { d: 2.96, e: 0.305, f: -0.4473, g: 0.0978 },
  // distributed uphill: C = 0 (no inclination correction)
};

const C_DOWNHILL = { d: 4.7, e: -0.3692, f: 0.1244, g: -0.5056 };

/** Horizontal flow-pattern boundaries (Beggs & Brill 1973). */
export const patternBoundaries = (lambdaL) => ({
  l1: 316 * Math.pow(lambdaL, 0.302),
  l2: 0.0009252 * Math.pow(lambdaL, -2.4684),
  l3: 0.1 * Math.pow(lambdaL, -1.4516),
  l4: 0.5 * Math.pow(lambdaL, -6.738),
});

/** Horizontal flow pattern from lambdaL and Froude number. */
export const flowPattern = (lambdaL, nfr) => {
  const { l1, l2, l3, l4 } = patternBoundaries(lambdaL);
  if ((lambdaL < 0.01 && nfr < l1) || (lambdaL >= 0.01 && nfr < l2)) {
    return 'segregated';
  }
  if (lambdaL >= 0.01 && nfr >= l2 && nfr <= l3) return 'transition';
  if (
    (lambdaL >= 0.01 && lambdaL < 0.4 && nfr > l3 && nfr <= l1) ||
    (lambdaL >= 0.4 && nfr > l3 && nfr <= l4)
  ) {
    return 'intermittent';
  }
  if ((lambdaL < 0.4 && nfr >= l1) || (lambdaL >= 0.4 && nfr > l4)) {
    return 'distributed';
  }
  // Map gaps (published boundaries do not tile the plane exactly).
  return 'intermittent';
};

/** Horizontal holdup HL(0) for one non-transition pattern, floored at lambdaL. */
const horizontalHoldup = (pattern, lambdaL, nfr) => {
  const { a, b, c } = HOLDUP_COEFFS[pattern];
  const hl0 = (a * Math.pow(lambdaL, b)) / Math.pow(nfr, c);
  return Math.max(hl0, lambdaL);
};

/** Inclination factor psi = 1 + C [sin(1.8 th) - sin^3(1.8 th)/3]. */
const inclinationFactor = (pattern, lambdaL, nlv, nfr, thetaDeg) => {
  if (thetaDeg === 0) return 1;
  const uphill = thetaDeg > 0;
  let coeffs;
  if (uphill) {
    if (pattern === 'distributed') return 1;
    coeffs = C_UPHILL[pattern];
  } else {
    coeffs = C_DOWNHILL;
  }
  const { d, e, f, g } = coeffs;
  const arg = d * Math.pow(lambdaL, e) * Math.pow(nlv, f) * Math.pow(nfr, g);
  const c = Math.max(0, (1 - lambdaL) * Math.log(Math.max(arg, 1e-300)));
  const th = (1.8 * thetaDeg * Math.PI) / 180;
  const s = Math.sin(th);
  return 1 + c * (s - (s * s * s) / 3);
};

/** Inclined liquid holdup for one non-transition pattern, Payne-corrected. */
const inclinedHoldup = (pattern, lambdaL, nlv, nfr, thetaDeg, applyPayne = true) => {
  const hl0 = horizontalHoldup(pattern, lambdaL, nfr);
  const psi = inclinationFactor(pattern, lambdaL, nlv, nfr, thetaDeg);
  const payne = !applyPayne ? 1 : thetaDeg > 0 ? 0.924 : thetaDeg < 0 ? 0.685 : 1;
  return clamp(hl0 * psi * payne, 1e-4, 1);
};

/**
 * Diagnostic holdup chain for validation against published worked
 * examples (which predate Payne): returns { pattern, hl0, psi, holdup }
 * with the Payne multiplier optional.
 */
export const beggsBrillHoldupDetail = (lambdaL, nfr, nlv, thetaDeg, applyPayne = false) => {
  const pattern = flowPattern(lambdaL, nfr);
  if (pattern === 'transition') {
    const { l2, l3 } = patternBoundaries(lambdaL);
    const a = (l3 - nfr) / (l3 - l2);
    const holdup =
      a * inclinedHoldup('segregated', lambdaL, nlv, nfr, thetaDeg, applyPayne) +
      (1 - a) * inclinedHoldup('intermittent', lambdaL, nlv, nfr, thetaDeg, applyPayne);
    return { pattern, holdup };
  }
  const hl0 = horizontalHoldup(pattern, lambdaL, nfr);
  const psi = inclinationFactor(pattern, lambdaL, nlv, nfr, thetaDeg);
  return {
    pattern,
    hl0,
    psi,
    holdup: inclinedHoldup(pattern, lambdaL, nlv, nfr, thetaDeg, applyPayne),
  };
};

/** Friction-ratio exponent s(y), y = lambdaL / HL^2 (Beggs & Brill eq). */
export const frictionRatioExponent = (y) => {
  if (!(y > 0)) return 0;
  if (y > 1 && y < 1.2) return Math.log(2.2 * y - 1.2);
  const ln = Math.log(y);
  const denom = -0.0523 + 3.182 * ln - 0.8725 * ln * ln + 0.01853 * ln ** 4;
  if (denom === 0) return 0;
  return ln / denom;
};

/** Plain Darcy-Weisbach gradient for the single-phase guard paths. */
const singlePhase = (p, sinTh, dFt, rough, rho, mu, v, holdup, ek) => {
  const re = reynoldsNumber(rho, v, dFt, mu);
  const f = moodyFrictionFactor(re, rough);
  const gradGrav = (rho * sinTh) / 144;
  const gradFric = (f * rho * v * v) / (2 * G * dFt) / 144;
  const dpdz = (gradGrav + gradFric) / (1 - Math.min(ek, 0.95));
  return { dpdz, holdup, pattern: 'single-phase', gradGrav, gradFric, ek };
};

/**
 * Beggs & Brill + Payne pressure gradient.
 * ctx: { p, thetaDeg (from horizontal, + = upflow), dIn, rough, flows, pvt }
 *   flows: inSituRates output; pvt: pvtAt output (rhoG used for slip density).
 * Returns { dpdz, holdup, pattern, gradGrav, gradFric, ek }.
 */
export const beggsBrillGradient = ({ p, thetaDeg, dIn, rough = 0, flows, pvt }) => {
  const { vsl, vsg, vm, lambdaL, rhoL, sigmaL, rhoNs, muNs } = flows;
  const rhoG = pvt.rhoG;
  const dFt = dIn / 12;
  const sinTh = Math.sin((thetaDeg * Math.PI) / 180);

  if (!(vm > 0)) {
    // Static column: no-slip density is the liquid density at zero rate.
    const gradGrav = (rhoNs * sinTh) / 144;
    return { dpdz: gradGrav, holdup: lambdaL, pattern: 'static', gradGrav, gradFric: 0, ek: 0 };
  }

  // Single-phase guards: the two-phase machinery (Payne holdup multiplier,
  // friction ratio) must not perturb a gas-free or liquid-free stream.
  if (vsg <= 1e-9 || lambdaL >= 0.9999) {
    return singlePhase(p, sinTh, dFt, rough, rhoL, flows.muL, vm, 1, 0);
  }
  if (vsl <= 1e-9 || lambdaL <= 1e-4) {
    return singlePhase(p, sinTh, dFt, rough, rhoG, pvt.muG, vm, 0, (rhoG * vm * vm) / (G * 144 * Math.max(p, 1)));
  }

  const nfr = (vm * vm) / (G * dFt);
  const nlv = 1.938 * vsl * Math.pow(rhoL / Math.max(sigmaL, 1e-6), 0.25);
  const pattern = flowPattern(lambdaL, nfr);

  let holdup;
  if (pattern === 'transition') {
    const { l2, l3 } = patternBoundaries(lambdaL);
    const a = (l3 - nfr) / (l3 - l2);
    holdup =
      a * inclinedHoldup('segregated', lambdaL, nlv, nfr, thetaDeg) +
      (1 - a) * inclinedHoldup('intermittent', lambdaL, nlv, nfr, thetaDeg);
  } else {
    holdup = inclinedHoldup(pattern, lambdaL, nlv, nfr, thetaDeg);
  }

  const rhoS = rhoL * holdup + rhoG * (1 - holdup);
  const gradGrav = (rhoS * sinTh) / 144;

  // Payne: normalizing friction factor from the rough-pipe Moody chart at
  // the no-slip Reynolds number.
  const re = reynoldsNumber(rhoNs, vm, dFt, muNs);
  const fn = moodyFrictionFactor(re, rough);
  const y = lambdaL / (holdup * holdup);
  const ftp = fn * Math.exp(frictionRatioExponent(y));
  const gradFric = (ftp * rhoNs * vm * vm) / (2 * G * dFt) / 144;

  const ek = p > 0 ? (rhoS * vm * vsg) / (G * 144 * p) : 0;
  const dpdz = (gradGrav + gradFric) / (1 - Math.min(ek, 0.95));

  return { dpdz, holdup, pattern, gradGrav, gradFric, ek };
};
