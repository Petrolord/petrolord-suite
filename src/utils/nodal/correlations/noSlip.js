/**
 * No-slip (homogeneous) two-phase gradient for the Nodal Analysis Studio
 * (NA2), Fancher-Brown class: both phases travel at the mixture velocity,
 * holdup equals the input liquid fraction, friction from the Moody chart
 * on no-slip mixture properties.
 *
 * Deliberately optimistic (no slip means the lightest possible column);
 * industry practice keeps it as a screening bound, never for design. The
 * analytic gates lean on this correlation because its limits are exact:
 * at zero gas it reduces to single-phase Darcy-Weisbach, at zero rate to
 * the hydrostatic column.
 *
 * Same ctx/return contract as beggsBrillGradient.
 */

import { moodyFrictionFactor, reynoldsNumber } from '../friction.js';

const G = 32.174; // ft/s2

export const noSlipGradient = ({ p, thetaDeg, dIn, rough = 0, flows }) => {
  const { vm, vsg, lambdaL, rhoNs, muNs } = flows;
  const dFt = dIn / 12;
  const sinTh = Math.sin((thetaDeg * Math.PI) / 180);

  const gradGrav = (rhoNs * sinTh) / 144;
  if (!(vm > 0)) {
    return { dpdz: gradGrav, holdup: lambdaL, pattern: 'static', gradGrav, gradFric: 0, ek: 0 };
  }

  const re = reynoldsNumber(rhoNs, vm, dFt, muNs);
  const f = moodyFrictionFactor(re, rough);
  const gradFric = (f * rhoNs * vm * vm) / (2 * G * dFt) / 144;

  const ek = p > 0 ? (rhoNs * vm * vsg) / (G * 144 * p) : 0;
  const dpdz = (gradGrav + gradFric) / (1 - Math.min(ek, 0.95));

  return { dpdz, holdup: lambdaL, pattern: 'no-slip', gradGrav, gradFric, ek };
};
