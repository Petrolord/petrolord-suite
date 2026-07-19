/**
 * Cullender and Smith (1956) gas-column pressures for the Nodal Analysis
 * Studio (NA2): static (shut-in) and flowing bottomhole pressure of a dry
 * gas well, the standard two-step trapezoidal march with the final
 * Simpson's-rule refinement.
 *
 * Working form (field units, Trans. AIME 207 as reproduced in Ikoku,
 * Natural Gas Production Engineering, and Guo & Ghalambor):
 *
 *   integral from ptf to pwf of I(p) dp = 18.75 * gammaG * MD
 *   I(p) = (p/Tz) / [ (H/MD) * (p/Tz)^2 / 1000 + F^2 ]
 *   F^2  = 0.667 * f * q^2 / d^5      (q MMscf/d, d in, f Moody/Darcy)
 *
 * Static column: q = 0 so F^2 = 0 and the elevation ratio H/MD is 1 over
 * a vertical hole. T in degR, p in psia.
 *
 * z comes from the same Sutton + Papay route the rest of the nodal engine
 * uses (pvt.js zFactor via Fluid Studio), so the oracle gate for this
 * module integrates the identical property field by an independent
 * fine-step ODE route.
 */

import { zFactor } from '../fluidStudioCalculations.js';
import { moodyFrictionFactor } from './friction.js';

const MAX_ITER = 40;
const TOL_PSI = 0.001;

/** Reynolds number for gas flow in field units: q MMscf/d, d in, mu cp. */
export const gasReynolds = (qMmscfd, gasSg, muCp, dIn) => {
  if (!(muCp > 0) || !(dIn > 0)) return 0;
  // Re = 20011 * gammaG * q(MMscf/d) / (mu * d)  (Lee/Katz field form)
  return (20011 * gasSg * Math.abs(qMmscfd)) / (muCp * dIn);
};

const integrand = (p, tR, z, elevRatio, f2) => {
  const ptz = p / (tR * z);
  const denom = (elevRatio * ptz * ptz) / 1000 + f2;
  return denom > 0 ? ptz / denom : 0;
};

/**
 * March one half-segment: solve p2 so that
 *   (p2 - p1) * (I1 + I2) = 2 * rhsHalf   (trapezoid over the half)
 * by fixed-point iteration on I2, Cullender & Smith's original scheme.
 */
const stepHalf = (p1, i1, rhsHalf, evalI) => {
  let p2 = p1 + rhsHalf / Math.max(i1, 1e-12); // first guess: I2 = I1
  for (let k = 0; k < MAX_ITER; k += 1) {
    const i2 = evalI(p2);
    const next = p1 + (2 * rhsHalf) / Math.max(i1 + i2, 1e-12);
    if (Math.abs(next - p2) < TOL_PSI) return { p: next, i: evalI(next) };
    p2 = next;
  }
  return { p: p2, i: evalI(p2) };
};

/**
 * Static or flowing BHP by Cullender-Smith.
 * inputs: {
 *   ptf     wellhead (tubing) pressure, psia
 *   gasSg   gas specific gravity (air = 1)
 *   mdFt    measured depth, tvdFt true vertical depth
 *   whtF, bhtF  wellhead/bottomhole temperature, degF
 *   qMmscfd flow rate (0 or omitted = static)
 *   idIn    tubing ID (in), roughnessIn absolute roughness (in, default 0.0006)
 *   muCp    gas viscosity for the Reynolds number (default 0.012 cp; the
 *           friction factor is insensitive to it at fully rough turbulence)
 *   fMoody  optional Moody friction factor override (published worked
 *           examples prescribe their own f; validation uses this)
 * }
 * returns { pwf, pmf, iterationsConverged }
 */
export const cullenderSmithBhp = ({
  ptf,
  gasSg,
  mdFt,
  tvdFt = mdFt,
  whtF,
  bhtF,
  qMmscfd = 0,
  idIn = 2.441,
  roughnessIn = 0.0006,
  muCp = 0.012,
  fMoody,
}) => {
  const elevRatio = tvdFt / mdFt;
  let f2 = 0;
  if (qMmscfd > 0) {
    const f =
      fMoody ??
      moodyFrictionFactor(gasReynolds(qMmscfd, gasSg, muCp, idIn), roughnessIn / idIn);
    f2 = (0.667 * f * qMmscfd * qMmscfd) / Math.pow(idIn, 5);
  }

  const tWh = whtF + 460;
  const tBh = bhtF + 460;
  const tMid = (tWh + tBh) / 2;

  const evalIAt = (tR) => (p) => {
    const z = zFactor(p, tR - 460, gasSg);
    return integrand(p, tR, z, elevRatio, f2);
  };

  const rhs = 18.75 * gasSg * mdFt;
  const iTf = evalIAt(tWh)(ptf);

  // Upper half: wellhead -> midpoint, lower half: midpoint -> bottom.
  const mid = stepHalf(ptf, iTf, rhs / 2, evalIAt(tMid));
  const bottom = stepHalf(mid.p, mid.i, rhs / 2, evalIAt(tBh));

  // Simpson's-rule refinement over the whole column.
  let pwf = bottom.p;
  for (let k = 0; k < MAX_ITER; k += 1) {
    const iw = evalIAt(tBh)(pwf);
    const next = ptf + (6 * rhs) / Math.max(iTf + 4 * mid.i + iw, 1e-12);
    if (Math.abs(next - pwf) < TOL_PSI) {
      return { pwf: next, pmf: mid.p, converged: true };
    }
    pwf = next;
  }
  return { pwf, pmf: mid.p, converged: false };
};

/**
 * Average temperature and z-factor method (Katz; Guo & Ghalambor Eq. 4.54,
 * q in Mscf/d, d in inches, L = MD ft, theta from vertical via TVD/MD):
 *
 *   pwf^2 = e^s ptf^2 + 6.67e-4 (e^s - 1) f q^2 (Tbar zbar)^2 / (d^5 cos)
 *   s = 0.0375 gammaG L cos / (Tbar zbar)
 *
 * Iterates zbar at the average column pressure. Same input contract as
 * cullenderSmithBhp with qMscfd instead of qMmscfd.
 */
export const averageTzBhp = ({
  ptf,
  gasSg,
  mdFt,
  tvdFt = mdFt,
  whtF,
  bhtF,
  qMscfd = 0,
  idIn = 2.441,
  roughnessIn = 0.0006,
  muCp = 0.012,
  fMoody,
}) => {
  const cos = tvdFt / mdFt;
  const tBarR = (whtF + bhtF) / 2 + 460;
  const f =
    qMscfd > 0
      ? fMoody ??
        moodyFrictionFactor(gasReynolds(qMscfd / 1000, gasSg, muCp, idIn), roughnessIn / idIn)
      : 0;

  let pwf = ptf * 1.2;
  let zBar = 0.9;
  for (let k = 0; k < MAX_ITER; k += 1) {
    const pBar = (ptf + pwf) / 2;
    zBar = zFactor(pBar, tBarR - 460, gasSg);
    const s = (0.0375 * gasSg * mdFt * cos) / (tBarR * zBar);
    const es = Math.exp(s);
    const fric =
      qMscfd > 0
        ? (6.67e-4 * (es - 1) * f * qMscfd * qMscfd * tBarR * tBarR * zBar * zBar) /
          (Math.pow(idIn, 5) * cos)
        : 0;
    const next = Math.sqrt(es * ptf * ptf + fric);
    if (Math.abs(next - pwf) < TOL_PSI) return { pwf: next, zBar, converged: true };
    pwf = next;
  }
  return { pwf, zBar, converged: false };
};
