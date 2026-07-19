/**
 * Pipe friction for the Nodal Analysis Studio engine (NA1).
 *
 * Moody (Darcy-Weisbach) friction factor:
 *  - laminar (Re < 2000): f = 64 / Re
 *  - turbulent (Re > 4000): Colebrook-White solved by fixed-point iteration
 *    to machine tolerance (validated against the independent Python oracle,
 *    tools/validation/nodal/oracle.py, at < 0.2 % relative error)
 *  - critical zone 2000..4000: linear blend between the laminar value at
 *    Re = 2000 and the Colebrook value at Re = 4000 (no physical model is
 *    reliable there; the blend keeps the traverse integrator continuous)
 *
 * relRough is epsilon/D (dimensionless).
 */

const LAMINAR_LIMIT = 2000;
const TURBULENT_LIMIT = 4000;

/** Reynolds number from density (lbm/ft3), velocity (ft/s), diameter (ft), viscosity (cp). */
export const reynoldsNumber = (rho, v, dFt, muCp) => {
  if (!(muCp > 0) || !(dFt > 0)) return 0;
  // 1488 converts lbm/(ft s) to cp in field units: Re = 1488 rho v d / mu.
  return (1488 * rho * Math.abs(v) * dFt) / muCp;
};

/** Colebrook-White Darcy friction factor for turbulent flow. */
export const colebrookFrictionFactor = (re, relRough) => {
  if (!(re > 0)) return 0;
  // Swamee-Jain explicit form as the starting guess.
  let f = 0.25 / Math.pow(Math.log10(relRough / 3.7 + 5.74 / Math.pow(re, 0.9)), 2);
  for (let i = 0; i < 50; i += 1) {
    const rhs = -2 * Math.log10(relRough / 3.7 + 2.51 / (re * Math.sqrt(f)));
    const fNew = 1 / (rhs * rhs);
    if (Math.abs(fNew - f) < 1e-12) return fNew;
    f = fNew;
  }
  return f;
};

/** Moody (Darcy) friction factor across all regimes. */
export const moodyFrictionFactor = (re, relRough = 0) => {
  if (!(re > 0)) return 0;
  if (re < LAMINAR_LIMIT) return 64 / re;
  if (re > TURBULENT_LIMIT) return colebrookFrictionFactor(re, relRough);
  const fLam = 64 / LAMINAR_LIMIT;
  const fTurb = colebrookFrictionFactor(TURBULENT_LIMIT, relRough);
  const t = (re - LAMINAR_LIMIT) / (TURBULENT_LIMIT - LAMINAR_LIMIT);
  return fLam + t * (fTurb - fLam);
};
