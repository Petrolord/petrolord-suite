// An oil case with a GOC left in the inputs (a fresh workspace carries
// goc -7000 from the sample values) was reported "Filled to spill" with the
// OWC above the spill, because the GOC was clamped to the spill too; the
// report then said the contact was taken at the spill. Only the contacts the
// fluid system uses are clamped (found on the Ekene seismic map, 2026-10-12).
// Negative control: with the old clamp over owc and goc the first test fails.
import { ContactVolumetricsEngine } from '../services/ContactVolumetricsEngine';
import { makeLattice } from '../services/lattice';

const n = 201; const d = 20;
const spec = { x0: -2000, y0: -2000, dx: d, dy: d, nx: n, ny: n };
const g = new Float32Array(n * n);
for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
  const x = -2000 + c * d; const y = -2000 + r * d;
  g[r * n + c] = Math.max(-1000 - 0.1 * Math.hypot(x, y), -1150 + 0.05 * x); // spill saddle at -1100 m
}
const surface = { name: 'Cone and ramp', points: [{ x: 0, y: 0, z: -1000 }, { x: 1, y: 0, z: -1000 }, { x: 0, y: 1, z: -1000 }], xyUnit: 'm', xyToM: 1, depthUnit: 'm', zConvention: 'elevation', lattice: makeLattice(spec, g) };
const run = (inputs) => ContactVolumetricsEngine.calculate({
  topSurface: surface, constantThickness: 500, unitSystem: 'metric',
  inputs: { ntg: 1, porosity: 1, sw: 0, fvf: 1, ...inputs }, options: { fillToSpill: true },
});

test('oil, OWC above the spill, a stray GOC below it: not filled to spill, no warning', () => {
  const r = run({ fluidType: 'oil', owc: -1050, goc: -2134 });
  expect(r.trap.filledToSpill).toBe(false);
  expect(r.warnings.some((w) => /Filled to spill/.test(w))).toBe(false);
  expect(r.grvOil).toBeCloseTo(run({ fluidType: 'oil', owc: -1050 }).grvOil, 6);
});

test('oil, OWC below the spill: still filled to spill', () => {
  const r = run({ fluidType: 'oil', owc: -1150 });
  expect(r.trap.filledToSpill).toBe(true);
  expect(r.warnings.some((w) => /Filled to spill/.test(w))).toBe(true);
});

test('oil with a gas cap still clamps a GOC below the spill', () => {
  const r = run({ fluidType: 'oil_gas', owc: -1090, goc: -1150 });
  expect(r.trap.filledToSpill).toBe(true);
});
