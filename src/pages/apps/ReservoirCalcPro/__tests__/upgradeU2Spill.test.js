// ReservoirCalc Pro upgrade U2-008: the hydrocarbon leg is bounded by the
// trap's spill point (Mapping's closure engine, spillAnalysis). Gates call
// the shipped engines on a cone beside a regional ramp, where the spill is
// a saddle inside the map, so the analytic trap volume is known.

import { ContactVolumetricsEngine } from '../services/ContactVolumetricsEngine';
import { VolumeCalculationEngine } from '../services/VolumeCalculationEngine';
import { MonteCarloEngine } from '../services/MonteCarloEngine';
import { makeLattice } from '../services/lattice';
import { quickGrv } from '@/pages/apps/MappingSurfaceStudio/services/quickGrv';

jest.setTimeout(120000);

// cone z = -1000 - 0.1 r beside a ramp rising east; z = max(cone, ramp).
// rampAt0 -1150, slope 0.05: the two meet on the axis at x = 1000, z = -1100
// (the saddle, the spill); the ramp reaches -1050 at the east edge.
const n = 201; const d = 20;
const spec = { x0: -2000, y0: -2000, dx: d, dy: d, nx: n, ny: n };
const build = (rampAt0, slope) => {
  const g = new Float32Array(n * n);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const x = -2000 + c * d; const y = -2000 + r * d;
    g[r * n + c] = Math.max(-1000 - 0.1 * Math.hypot(x, y), rampAt0 + slope * x);
  }
  return g;
};
const surfaceOf = (g) => ({ name: 'Cone and ramp', points: [{ x: 0, y: 0, z: -1000 }, { x: 1, y: 0, z: -1000 }, { x: 0, y: 1, z: -1000 }], xyUnit: 'm', xyToM: 1, depthUnit: 'm', zConvention: 'elevation', lattice: makeLattice(spec, g) });
const unit = { fluidType: 'oil', ntg: 1, porosity: 1, sw: 0, fvf: 1 };
const run = (surface, owc, fillToSpill) => ContactVolumetricsEngine.calculate({
  topSurface: surface, constantThickness: 500, unitSystem: 'metric', inputs: { ...unit, owc }, options: { fillToSpill },
});
const coneTrap = (h) => (Math.PI * 100 * h ** 3) / 3;

describe('U2-008 a contact below the spill point fills the trap to the spill', () => {
  const g = build(-1150, 0.05);
  const surface = surfaceOf(g);

  it('the spill is the saddle at -1100 m, inside the map', () => {
    const r = run(surface, -1150, true);
    expect(r.trap.limitedByEdge).toBe(false);
    expect(Math.abs(r.trap.spillElevation - -1100)).toBeLessThan(2.5);
    // Mapping's own spill analysis on the same lattice agrees
    const m = quickGrv({ spec, gridM: g, contactM: -1050, xyToM: 1 });
    expect(r.trap.spillElevation).toBeCloseTo(m.spill.z, 3);
  });

  it('the trap volume equals Mapping\'s GRV at the spill (0.1 percent) and the analytic cone (2 percent)', () => {
    const r = run(surface, -1150, true);
    expect(r.trap.filledToSpill).toBe(true);
    expect(r.warnings.join(' ')).toMatch(/Filled to spill/);
    const m = quickGrv({ spec, gridM: g, contactM: r.trap.spillElevation, xyToM: 1 });
    expect(Math.abs(r.grv / m.grvM3 - 1)).toBeLessThan(0.001);
    expect(Math.abs(r.grv / coneTrap(100) - 1)).toBeLessThan(0.02);
    expect(r.openEdge.open).toBe(false);
  });

  it('negative control: without the spill bound the column runs past the saddle up the ramp', () => {
    const on = run(surface, -1150, true);
    const off = run(surface, -1150, false);
    expect(off.grv / on.grv).toBeGreaterThan(1.5);
  });

  it('a contact above the spill is unchanged by the bound', () => {
    const on = run(surface, -1080, true);
    const m = quickGrv({ spec, gridM: g, contactM: -1080, xyToM: 1 });
    expect(on.trap.filledToSpill).toBe(false);
    expect(Math.abs(on.grv / m.grvM3 - 1)).toBeLessThan(0.001);
  });

  it('Monte Carlo: sampled contacts below the spill fill to it and are counted', async () => {
    const h = ContactVolumetricsEngine.buildHypsometry({ topSurface: surface, constantThickness: 500, unitSystem: 'metric', options: { fillToSpill: true } });
    const tri = (min, mode, max) => ({ type: 'triangular', min, mode, max });
    const res = MonteCarloEngine.simulate(
      { fluidType: 'oil', unitSystem: 'metric', iterations: 2000, grvMode: 'structural', hypsometry: h, seed: 2 },
      { owc: tri(-1200, -1150, -1120), porosity: tri(1, 1, 1), sw: tri(0, 0, 0), fvf: tri(1, 1, 1) },
    );
    expect(res.diagnostics.filledToSpill).toBe(2000);
    expect(res.diagnostics.warnings.join(' ')).toMatch(/below the spill point.*filled to the spill point/);
    expect(Math.abs(res.stats.grv?.p50 ?? res.raw.grv[0]) / coneTrap(100)).toBeGreaterThan(0.97);
    expect(res.diagnostics.openRealizations || 0).toBe(0);
  });
});

describe('U2-008 the trap is the interior culmination, not an up-dip edge', () => {
  it('a ramp whose edge is higher than the crest: the cone is still the trap', () => {
    const g = build(-1180, 0.1); // meets the cone at x = 900, z = -1090; edge -980
    const r = run(surfaceOf(g), -1150, true);
    expect(r.trap.limitedByEdge).toBe(false);
    expect(Math.abs(r.trap.spillElevation - -1090)).toBeLessThan(2.5);
    // Mapping measures this closure when pointed at the cone's crest
    const crest = 100 * n + 100;
    const m = quickGrv({ spec, gridM: g, contactM: r.trap.spillElevation, seedIndex: crest, xyToM: 1 });
    expect(Math.abs(r.grv / m.grvM3 - 1)).toBeLessThan(0.001);
  });

  it('a spill on the map edge is an open closure, a minimum', () => {
    // the cone alone on a map too small to close below -1150
    const g = new Float32Array(n * n);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) g[r * n + c] = -1000 - 0.1 * Math.hypot(-2000 + c * d, -2000 + r * d);
    const res = run(surfaceOf(g), -1300, true);
    expect(res.trap.limitedByEdge).toBe(true);
    expect(res.openEdge.open).toBe(true);
    expect(res.warnings.join(' ')).toMatch(/Open closure: the trap spills at the edge/);
  });
});

describe('U2-008 saved state and the area/depth table', () => {
  it('a project saved before U2-008 keeps its volumes (fill to spill off when the key is absent)', () => {
    const g = build(-1150, 0.05);
    const res = VolumeCalculationEngine.calculateDeterministic(
      { ...unit, owc: -1150, thickness: 500, topSurfaceId: 's' }, 'metric', 'hybrid', { s: surfaceOf(g) }, { contactOptions: { fillToSpill: undefined } },
    );
    expect(res.trap).toBeNull();
  });

  it('the area/depth table takes a spill point too', () => {
    const rows = [];
    for (let k = 0; k <= 30; k++) rows.push({ depth: -1000 - k * 10, areaTop: (Math.PI * (10 * k * 10) ** 2) / 1e6, areaBase: null });
    const at = (spill) => VolumeCalculationEngine.calculateDeterministic({ ...unit, owc: -1200, areaDepth: { rows, spill } }, 'metric', 'areadepth');
    const bound = at(-1100);
    expect(Math.abs(bound.grv / coneTrap(100) - 1)).toBeLessThan(0.006);
    expect(bound.warnings.join(' ')).toMatch(/below the spill point/);
    expect(at(null).grv / bound.grv).toBeGreaterThan(7);
  });
});
