/**
 * Modified Hagedorn-Brown (mHB) vertical two-phase gradient for the Nodal
 * Analysis Studio (NA2).
 *
 * Chart digitization: the Economides-family fit set (Petroleum Production
 * Systems 2nd ed pp. 230-236 / Trina 2010, as published on pengtools and
 * implemented across PressureDrop.jl and peers):
 *   CNL  = cubic in NL, capped per the Brown & Beggs (1977) procedure
 *          (NL <= 0.002 -> 0.0019, NL >= 0.4 -> 0.0115)
 *   HL/psi = sqrt-rational in X1 = (NLV/NGV^0.575)(p/14.7)^0.1 (CNL/ND)
 *   psi  = rational cubic in X2 = NGV NL^0.38 / ND^2.14 (PPS p. 235),
 *          clamped to the chart range [1, 1.8]
 *
 * Standard "modified" changes (Brill & Hagedorn, per Brown TALM and the
 * Fekete/whitson documentation):
 *   - no-slip floor HL >= lambdaL on the chart holdup
 *   - Griffith bubble flow: LB = 1.071 - 0.2218 vm^2/d (d in ft, floor
 *     0.13); when vsg/vm < LB, Griffith holdup with vs = 0.8 ft/s and
 *     single-phase liquid friction at vL = vsl/HL
 *
 * Friction: Moody/Darcy convention, velocity form with the HB density
 * rhoNs^2/rhoS and slip viscosity muL^HL muG^(1-HL):
 *   (dp/dh)_f = f rhoNs^2 vm^2 / (2 gc d rhoS) / 144
 * Acceleration is neglected (standard practice; Ek matters near surface
 * in high-GLR wells where Gray/B&B are the fit-for-purpose choices).
 *
 * Dimensionless groups use the Duns & Ros field constants (v ft/s, rho
 * lbm/ft3, sigma dyn/cm, d ft, mu cp):
 *   NLV = 1.938 vsl (rhoL/sigma)^0.25     NGV = 1.938 vsg (rhoL/sigma)^0.25
 *   ND  = 120.872 d sqrt(rhoL/sigma)      NL  = 0.15726 muL (1/(rhoL sigma^3))^0.25
 */

import { moodyFrictionFactor, reynoldsNumber } from '../friction.js';
import { clamp } from '../numerics.js';

const G = 32.174; // ft/s2
const GRIFFITH_VS = 0.8; // ft/s bubble slip velocity

/** Viscosity number coefficient CNL(NL), Brown & Beggs range caps. */
export const cnlOf = (nl) => {
  if (nl <= 0.002) return 0.0019;
  if (nl >= 0.4) return 0.0115;
  return 0.061 * nl ** 3 - 0.0929 * nl * nl + 0.0505 * nl + 0.0019;
};

/** Main holdup chart HL/psi as a function of X1. */
export const hlOverPsiOf = (x1) => {
  const num = 0.0047 + 1123.32 * x1 + 729489.64 * x1 * x1;
  const den = 1 + 1097.1566 * x1 + 722153.97 * x1 * x1;
  return Math.sqrt(num / den);
};

/**
 * Secondary correction psi as a function of X2 (PPS p. 235 rational).
 * The chart is flat at psi = 1 below its 0.01 abscissa (the rational fit
 * evaluates to 1.0013 there, so the join is continuous to 0.13%); its
 * intercept 1.0886 at x = 0 is a fit artifact, not chart behavior.
 */
export const psiOf = (x2) => {
  if (x2 <= 0.01) return 1;
  const x = Math.min(x2, 0.09);
  const num = 1.0886 - 69.9473 * x + 2334.3497 * x * x - 12896.683 * x ** 3;
  const den = 1 - 53.4401 * x + 1517.9369 * x * x - 8419.8115 * x ** 3;
  return clamp(num / den, 1, 1.8);
};

/** Griffith bubble-flow holdup (vs = 0.8 ft/s). */
export const griffithHoldup = (vsl, vsg) => {
  const vm = vsl + vsg;
  const r = 1 + vm / GRIFFITH_VS;
  const hg = 0.5 * (r - Math.sqrt(Math.max(r * r - (4 * vsg) / GRIFFITH_VS, 0)));
  return clamp(1 - hg, 1e-4, 1);
};

/** Griffith bubble-flow boundary LB (d in ft), floored at 0.13. */
export const griffithBoundary = (vm, dFt) => Math.max(1.071 - (0.2218 * vm * vm) / dFt, 0.13);

const singlePhase = (sinTh, dFt, rough, rho, mu, v, holdup) => {
  const f = moodyFrictionFactor(reynoldsNumber(rho, v, dFt, mu), rough);
  const gradGrav = (rho * sinTh) / 144;
  const gradFric = (f * rho * v * v) / (2 * G * dFt) / 144;
  return {
    dpdz: gradGrav + gradFric,
    holdup,
    pattern: 'single-phase',
    gradGrav,
    gradFric,
    ek: 0,
  };
};

/**
 * Modified Hagedorn-Brown gradient. Same ctx/return contract as
 * beggsBrillGradient. thetaDeg from horizontal (+90 = vertical producer);
 * HB is a vertical-well correlation, applied here with sin(theta) on the
 * hydrostatic term and MD-based friction, the standard deviated-well
 * adaptation.
 */
export const hagedornBrownGradient = ({ p, thetaDeg, dIn, rough = 0, flows, pvt }) => {
  const { vsl, vsg, vm, lambdaL, rhoL, muL, sigmaL, rhoNs } = flows;
  const rhoG = pvt.rhoG;
  const muG = pvt.muG;
  const dFt = dIn / 12;
  const sinTh = Math.sin((thetaDeg * Math.PI) / 180);

  if (!(vm > 0)) {
    const gradGrav = (rhoNs * sinTh) / 144;
    return { dpdz: gradGrav, holdup: lambdaL, pattern: 'static', gradGrav, gradFric: 0, ek: 0 };
  }
  if (vsg <= 1e-9 || lambdaL >= 0.9999) {
    return singlePhase(sinTh, dFt, rough, rhoL, muL, vm, 1);
  }
  if (vsl <= 1e-9 || lambdaL <= 1e-4) {
    return singlePhase(sinTh, dFt, rough, rhoG, muG, vm, 0);
  }

  // Griffith bubble-flow branch
  if (vsg / vm < griffithBoundary(vm, dFt)) {
    const holdup = griffithHoldup(vsl, vsg);
    const vL = vsl / holdup;
    const rhoS = rhoL * holdup + rhoG * (1 - holdup);
    const gradGrav = (rhoS * sinTh) / 144;
    const f = moodyFrictionFactor(reynoldsNumber(rhoL, vL, dFt, muL), rough);
    const gradFric = (f * rhoL * vL * vL) / (2 * G * dFt) / 144;
    return { dpdz: gradGrav + gradFric, holdup, pattern: 'bubble (Griffith)', gradGrav, gradFric, ek: 0 };
  }

  const sigma = Math.max(sigmaL, 1e-6);
  const quarterRoot = Math.pow(rhoL / sigma, 0.25);
  const nlv = 1.938 * vsl * quarterRoot;
  const ngv = 1.938 * vsg * quarterRoot;
  const nd = 120.872 * dFt * Math.sqrt(rhoL / sigma);
  const nl = 0.15726 * muL * Math.pow(1 / (rhoL * sigma ** 3), 0.25);

  const cnl = cnlOf(nl);
  const x1 = (nlv / Math.pow(ngv, 0.575)) * Math.pow(p / 14.7, 0.1) * (cnl / nd);
  const x2 = (ngv * Math.pow(nl, 0.38)) / Math.pow(nd, 2.14);
  const holdup = clamp(hlOverPsiOf(x1) * psiOf(x2), lambdaL, 1);

  const rhoS = rhoL * holdup + rhoG * (1 - holdup);
  const gradGrav = (rhoS * sinTh) / 144;

  const muS = Math.pow(muL, holdup) * Math.pow(muG, 1 - holdup);
  const re = reynoldsNumber(rhoNs, vm, dFt, muS);
  const f = moodyFrictionFactor(re, rough);
  const gradFric = (f * rhoNs * rhoNs * vm * vm) / (2 * G * dFt * rhoS) / 144;

  return { dpdz: gradGrav + gradFric, holdup, pattern: 'hagedorn-brown', gradGrav, gradFric, ek: 0 };
};
