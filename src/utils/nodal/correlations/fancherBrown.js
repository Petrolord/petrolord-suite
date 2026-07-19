/**
 * Fancher and Brown (1963) no-slip correlation for the Nodal Analysis
 * Studio (NA2). SPE 426-PA: the Poettmann-Carpenter gradient form (no
 * slip, no flow map) with the friction factor re-correlated against
 * (D rho v) = 1.4737e-5 w / D in three producing-GLR bands. The friction
 * factor is the correlation's own chart, independent of pipe roughness.
 *
 *   dp/dz = [ rhoNs + f * w^2 / (7.413e10 * rhoNs * D^5) ] / 144   psi/ft
 *   w = mass rate (lbm/d) = rhoNs * vm * A * 86400 (conserved along hole)
 *   D in ft, GLR bands: < 1500, 1500-3000, > 3000 scf/bbl
 *
 * Chart digitization: Kermit Brown, The Technology of Artificial Lift
 * Methods Fig. 2.41 (the rNodal curves.0241 dataset), interpolated
 * piecewise-linearly in log-log space and clamped at the tabulated ends.
 *
 * Industry doctrine (Prosper-class): Fancher-Brown is the QC LOWER BOUND
 * on VLP (no slip means the lightest possible column); never used for
 * design. Applicability: 2-3/8 to 2-7/8 in tubing, GLR < 5000 scf/bbl,
 * rates < 400 stb/d.
 */

import { clamp } from '../numerics.js';

const SEC_PER_DAY = 86400;

// [drhov, f] pairs per GLR band, digitized from Brown Fig. 2.41.
const BAND_LOW = [
  [3.42747, 0.242031], [3.8883, 0.169446], [4.85782, 0.102253],
  [6.1143, 0.07001], [8.41248, 0.044503], [13.2285, 0.026069],
  [24.3094, 0.012589], [34.9694, 0.008684], [45.3402, 0.006597],
  [72.9019, 0.004194],
];
const BAND_MID = [
  [3.61021, 0.075408], [4.93046, 0.05163], [5.76188, 0.043522],
  [7.86899, 0.029359], [10.8267, 0.020862], [14.6767, 0.014606],
  [19.4577, 0.010932], [24.6729, 0.008244], [28.6203, 0.007053],
  [36.2912, 0.005319],
];
const BAND_HIGH = [
  [2.80517, 0.050119], [3.40213, 0.038359], [3.91726, 0.031858],
  [4.93046, 0.02367], [6.8851, 0.015158], [8.47513, 0.011951],
  [9.7584, 0.009853], [14.8962, 0.00599], [18.3363, 0.004653],
  [24.1297, 0.003306],
];

const bandFor = (glr) => {
  if (glr < 1500) return BAND_LOW;
  if (glr <= 3000) return BAND_MID;
  return BAND_HIGH;
};

/** Piecewise log-log linear interpolation, clamped at the table ends. */
export const fancherBrownFriction = (drhov, glr) => {
  const band = bandFor(glr);
  const x = Math.log10(clamp(drhov, band[0][0], band[band.length - 1][0]));
  for (let i = 1; i < band.length; i += 1) {
    const x1 = Math.log10(band[i - 1][0]);
    const x2 = Math.log10(band[i][0]);
    if (x <= x2) {
      const y1 = Math.log10(band[i - 1][1]);
      const y2 = Math.log10(band[i][1]);
      const t = x2 === x1 ? 0 : (x - x1) / (x2 - x1);
      return 10 ** (y1 + t * (y2 - y1));
    }
  }
  return band[band.length - 1][1];
};

/**
 * Fancher-Brown gradient. ctx additionally needs glr (producing
 * gas-liquid ratio, scf/stb of total liquid); the traverse supplies it
 * from the surface rates.
 */
export const fancherBrownGradient = ({ thetaDeg, dIn, flows, glr = 0 }) => {
  const { vm, lambdaL, rhoNs } = flows;
  const dFt = dIn / 12;
  const sinTh = Math.sin((thetaDeg * Math.PI) / 180);

  const gradGrav = (rhoNs * sinTh) / 144;
  if (!(vm > 0)) {
    return { dpdz: gradGrav, holdup: lambdaL, pattern: 'static', gradGrav, gradFric: 0, ek: 0 };
  }

  const area = (Math.PI / 4) * dFt * dFt;
  const w = rhoNs * vm * area * SEC_PER_DAY; // lbm/d
  const drhov = (1.4737e-5 * w) / dFt;
  const f = fancherBrownFriction(drhov, glr);
  const gradFric = (f * w * w) / (7.413e10 * rhoNs * dFt ** 5) / 144;

  return {
    dpdz: gradGrav + gradFric,
    holdup: lambdaL,
    pattern: 'fancher-brown',
    gradGrav,
    gradFric,
    ek: 0,
  };
};
