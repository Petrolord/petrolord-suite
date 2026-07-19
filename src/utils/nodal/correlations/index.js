/**
 * Correlation registry for the Nodal Analysis Studio traverse (NA2).
 *
 * Every entry maps a correlation id to a gradient function with the shared
 * contract: ({ p, thetaDeg, dIn, rough, flows, pvt }) ->
 * { dpdz, holdup, pattern, gradGrav, gradFric, ek } with dp/dL in psi/ft
 * along measured depth, positive downhole, producing (upward) flow.
 */

import { noSlipGradient } from './noSlip.js';
import { beggsBrillGradient } from './beggsBrill.js';

export const CORRELATIONS = {
  noSlip: { label: 'Fancher-Brown (no slip)', gradient: noSlipGradient },
  beggsBrill: { label: 'Beggs & Brill (Payne)', gradient: beggsBrillGradient },
};

export const gradientFor = (id) => {
  const entry = CORRELATIONS[id];
  if (!entry) throw new Error(`unknown VLP correlation "${id}"`);
  return entry.gradient;
};
