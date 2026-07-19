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
import { hagedornBrownGradient } from './hagedornBrown.js';
import { grayGradient } from './gray.js';
import { fancherBrownGradient } from './fancherBrown.js';

export const CORRELATIONS = {
  noSlip: { label: 'No slip (homogeneous, Moody friction)', gradient: noSlipGradient },
  fancherBrown: { label: 'Fancher & Brown (QC lower bound)', gradient: fancherBrownGradient },
  beggsBrill: { label: 'Beggs & Brill (Payne)', gradient: beggsBrillGradient },
  hagedornBrown: { label: 'Hagedorn & Brown (modified)', gradient: hagedornBrownGradient },
  gray: { label: 'Gray (wet gas)', gradient: grayGradient },
};

export const gradientFor = (id) => {
  const entry = CORRELATIONS[id];
  if (!entry) throw new Error(`unknown VLP correlation "${id}"`);
  return entry.gradient;
};
