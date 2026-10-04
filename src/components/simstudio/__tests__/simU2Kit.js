// Shared constants of the SIM-U2 deck tests (not a test file).
// The known aquifer: Dake (1978) Exercise 9.2, worked with Fetkovich's method
// in Ahmed, Reservoir Engineering Handbook 4th ed., Example 10-10 (engines
// test-data/mbal/ahmed-ex-10-10-fetkovich.json): k 200 mD, h 100 ft,
// porosity 0.25, ct 7e-6 1/psi, mu 0.55 cP, r_R 9,200 ft, reD 5, 140 degrees,
// pi 2,740 psia; Wei 211.9 MM bbl, J 116.5 bbl/d/psi.
export const DAKE = Object.freeze({ k: 200, h: 100, phi: 0.25, ct: 7e-6, muw: 0.55, rR: 9200, reD: 5, theta: 140, pi: 2740, J: 116.5, Wei: 211.9e6 });
/** The Material Balance engine's W: Wei = ct W pi. */
export const DAKE_W = DAKE.Wei / (DAKE.ct * DAKE.pi);
