/**
 * Gray (1974) wet-gas vertical gradient for the Nodal Analysis Studio
 * (NA2). Reference: Gray, H.E., "Vertical Flow Correlation in Gas Wells",
 * API 14B SSCSSV sizing program user manual, Appendix B; equations as
 * published in the Fekete/IHS Piper reference (verified against the
 * whitson reproduction; the pengtools -2.2314/0.554 variants are typos).
 *
 * Holdup (consistent-unit groups; sigma converted from dyn/cm with
 * 1 dyn/cm = 0.00220462 lbm/s2, so 453.592 = 1/0.00220462):
 *   Rv = vsl/vsg
 *   N1 = 453.592 rhoNs^2 vm^4 / (g sigma (rhoL - rhoG))
 *   N2 = 453.592 g d^2 (rhoL - rhoG) / sigma
 *   B  = 0.0814 [1 - 0.0554 ln(1 + 730 Rv/(Rv+1))]
 *   A  = -2.314 [N1 (1 + 205/N2)]^B
 *   HL = 1 - (1 - lambdaL)(1 - e^A)
 *
 * Friction: Gray's pseudo-roughness replaces the pipe roughness when the
 * liquid loading is high enough (original misprint 0.0007 corrected to
 * 0.007 per Fekete):
 *   k0 = (28.5/453.592) sigma / (rhoNs vm^2)   [ft]
 *   ke = k0                        for Rv >= 0.007
 *   ke = k + Rv (k0 - k)/0.007     for Rv < 0.007
 *   ke >= 2.77e-5 ft
 * with the fully rough friction factor (Colebrook at Re = 1e7, Gray's
 * original fixed-Reynolds treatment) on no-slip density:
 *   (dp/dL)_f = f rhoNs vm^2 / (2 gc d) / 144
 *
 * Applicability (API development envelope): vm < 50 ft/s, d < 3.5 in,
 * condensate < 50 stb/MMscf, water < 5 stb/MMscf.
 */

import { colebrookFrictionFactor, moodyFrictionFactor, reynoldsNumber } from '../friction.js';
import { clamp } from '../numerics.js';

const G = 32.174; // ft/s2
const SIGMA_CONV = 453.592; // dyn/cm -> lbm/s2 reciprocal
const ROUGH_RE = 1e7; // Gray's fixed fully-rough Reynolds number
const MIN_KE_FT = 2.77e-5;

/** Gray liquid holdup from the no-slip fraction and dimensionless groups. */
export const grayHoldup = ({ vsl, vsg, vm, lambdaL, rhoNs, rhoL, rhoG, sigmaL, dFt }) => {
  const dRho = Math.max(rhoL - rhoG, 1e-6);
  const sigma = Math.max(sigmaL, 1e-6);
  const rv = vsg > 0 ? vsl / vsg : Infinity;
  const n1 = (SIGMA_CONV * rhoNs * rhoNs * vm ** 4) / (G * sigma * dRho);
  const n2 = (SIGMA_CONV * G * dFt * dFt * dRho) / sigma;
  const b = 0.0814 * (1 - 0.0554 * Math.log(1 + (730 * rv) / (rv + 1)));
  const a = -2.314 * Math.pow(n1 * (1 + 205 / n2), b);
  return clamp(1 - (1 - lambdaL) * (1 - Math.exp(a)), lambdaL, 1);
};

/** Gray effective roughness (ft) from pipe roughness and pseudo-roughness. */
export const grayEffectiveRoughness = ({ vsl, vsg, vm, rhoNs, sigmaL, roughFt }) => {
  const rv = vsg > 0 ? vsl / vsg : Infinity;
  const k0 = ((28.5 / SIGMA_CONV) * Math.max(sigmaL, 1e-6)) / (rhoNs * vm * vm);
  const ke = rv >= 0.007 ? k0 : roughFt + (rv * (k0 - roughFt)) / 0.007;
  return Math.max(ke, MIN_KE_FT);
};

const singlePhase = (sinTh, dFt, rough, rho, mu, v, holdup) => {
  const f = moodyFrictionFactor(reynoldsNumber(rho, v, dFt, mu), rough);
  const gradGrav = (rho * sinTh) / 144;
  const gradFric = (f * rho * v * v) / (2 * G * dFt) / 144;
  return { dpdz: gradGrav + gradFric, holdup, pattern: 'single-phase', gradGrav, gradFric, ek: 0 };
};

/**
 * Gray gradient. Same ctx/return contract as the other correlations.
 * rough is relative roughness (eps/D); converted to absolute internally
 * for the pseudo-roughness blend.
 */
export const grayGradient = ({ thetaDeg, dIn, rough = 0, flows, pvt }) => {
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
  if (vsl <= 1e-9) {
    return singlePhase(sinTh, dFt, rough, rhoG, muG, vm, 0);
  }

  const holdup = grayHoldup({ vsl, vsg, vm, lambdaL, rhoNs, rhoL, rhoG, sigmaL, dFt });
  const rhoS = rhoL * holdup + rhoG * (1 - holdup);
  const gradGrav = (rhoS * sinTh) / 144;

  const ke = grayEffectiveRoughness({ vsl, vsg, vm, rhoNs, sigmaL, roughFt: rough * dFt });
  const f = colebrookFrictionFactor(ROUGH_RE, Math.min(ke / dFt, 0.05));
  const gradFric = (f * rhoNs * vm * vm) / (2 * G * dFt) / 144;

  return { dpdz: gradGrav + gradFric, holdup, pattern: 'gray', gradGrav, gradFric, ek: 0 };
};
