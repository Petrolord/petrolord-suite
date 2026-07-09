import * as ss from 'simple-statistics';
import { VolumeCalculationEngine } from '@/pages/apps/ReservoirCalcPro/services/VolumeCalculationEngine';
import { MonteCarloEngine } from '@/pages/apps/ReservoirCalcPro/services/MonteCarloEngine';
import { ContactVolumetricsEngine } from '@/pages/apps/ReservoirCalcPro/services/ContactVolumetricsEngine';
import { PolygonClippingEngine } from '@/pages/apps/ReservoirCalcPro/services/PolygonClippingEngine';
import { FluidPropertyCalculator } from '@/pages/apps/ReservoirCalcPro/services/FluidPropertyLibrary';
import { KrigingInterpolator } from '@/pages/apps/ReservoirCalcPro/services/KrigingInterpolator';
import { SurfaceParser } from '@/pages/apps/ReservoirCalcPro/services/SurfaceParser';

const near = (a, b, relTol = 0.02) => Math.abs(a - b) <= relTol * Math.abs(b) + 1e-6;

// Grid-integration + Monte Carlo cases build real grids; give them headroom.
jest.setTimeout(30000);

// Build a gridded surface of n×n points over a `size`×`size` footprint, z = zFn(x,y).
const makeSurface = (zFn, n = 21, size = 1000) => {
  const points = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = (i / (n - 1)) * size;
      const y = (j / (n - 1)) * size;
      points.push({ x, y, z: zFn(x, y) });
    }
  }
  return { points };
};
const ACRE = 43560; // ft² per acre

// ===========================================================================
// Deterministic volumetrics
// ===========================================================================
describe('VolumeCalculationEngine (deterministic)', () => {
  const baseOil = { area: 1000, thickness: 50, ntg: 1, porosity: 0.2, sw: 0.3, fvf: 1.2, fluidType: 'oil', recovery: 25 };

  it('field oil STOIIP = 7758·GRV·NTG·φ·(1−Sw)/Bo', () => {
    const r = VolumeCalculationEngine.calculateDeterministic(baseOil, 'field', 'simple');
    // GRV 50000 ac-ft, HCPV 7000 ac-ft, /1.2 → 45.255 MMSTB
    expect(near(r.stooip, (7000 * 7758) / 1.2)).toBe(true);
    expect(near(r.grv, 50000)).toBe(true);
    expect(near(r.recoverable, r.stooip * 0.25)).toBe(true);
    expect(r.volumeUnit).toBe('STB');
  });

  it('field gas GIIP = 43560·HCPV/Bg', () => {
    const r = VolumeCalculationEngine.calculateDeterministic(
      { ...baseOil, fluidType: 'gas', bg: 0.005 }, 'field', 'simple');
    expect(near(r.stooip, (7000 * 43560) / 0.005)).toBe(true);
    expect(r.volumeUnit).toBe('scf');
  });

  it('scales linearly with area and inversely with Bo', () => {
    const r1 = VolumeCalculationEngine.calculateDeterministic(baseOil, 'field', 'simple');
    const r2 = VolumeCalculationEngine.calculateDeterministic({ ...baseOil, area: 2000 }, 'field', 'simple');
    const r3 = VolumeCalculationEngine.calculateDeterministic({ ...baseOil, fvf: 2.4 }, 'field', 'simple');
    expect(near(r2.stooip, 2 * r1.stooip)).toBe(true);
    expect(near(r3.stooip, r1.stooip / 2)).toBe(true);
  });

  it('surfaces method requires both top and base surfaces', () => {
    const r = VolumeCalculationEngine.calculateDeterministic(
      { ...baseOil, topSurfaceId: 'a', baseSurfaceId: null }, 'field', 'surfaces', {});
    expect(r.error).toBeTruthy();
  });

  it('exposes GIIP, pore volume and recoverable split for the results UI', () => {
    const gas = VolumeCalculationEngine.calculateDeterministic(
      { ...baseOil, fluidType: 'gas', bg: 0.005, recoveryGas: 70 }, 'field', 'simple');
    expect(gas.giip).toBeGreaterThan(0);
    expect(gas.giip).toBe(gas.stooip);
    expect(gas.recoverableGas).toBeGreaterThan(0);
    expect(gas.recoverableOil).toBe(0);

    const oil = VolumeCalculationEngine.calculateDeterministic(baseOil, 'field', 'simple');
    expect(oil.poreVolume).toBeCloseTo(10000, 5); // GRV·NTG·φ = 50000·1·0.2
    expect(oil.hcPoreVolume).toBeCloseTo(7000, 5);
    expect(oil.recoverableOil).toBeCloseTo(oil.recoverable, 5);
  });

  it('oil_gas computes BOTH STOOIP and GIIP from the same HCPV', () => {
    const r = VolumeCalculationEngine.calculateDeterministic(
      { ...baseOil, fluidType: 'oil_gas', bg: 0.005, recovery: 25, recoveryGas: 70 }, 'field', 'simple');
    // Same HCPV (7000 ac-ft) feeds oil (÷Bo·7758) and gas (÷Bg·43560) — matches MonteCarloEngine.
    expect(near(r.stooip, (7000 * 7758) / 1.2)).toBe(true);
    expect(near(r.giip, (7000 * 43560) / 0.005)).toBe(true);
    expect(r.stooip).toBeGreaterThan(0);
    expect(r.giip).toBeGreaterThan(0);
    // Oil and gas are recovered independently at their own recovery factors.
    expect(near(r.recoverableOil, r.stooip * 0.25)).toBe(true);
    expect(near(r.recoverableGas, r.giip * 0.70)).toBe(true);
    // Per-zone GRV is exposed for the summary table (both share the single cell).
    expect(r.grvOil).toBeGreaterThan(0);
    expect(r.grvGas).toBeGreaterThan(0);
    // STOOIP stays the primary target; its unit label is oil.
    expect(r.volumeUnit).toBe('STB');
    // Case parameters are echoed back for the results tables.
    expect(r.inputs.ntg).toBe(1);
    expect(r.unitSystem).toBe('field');
  });
});

describe('VolumeCalculationEngine.validateInputs', () => {
  const good = { area: 1000, thickness: 50, ntg: 1, porosity: 0.2, sw: 0.3, fvf: 1.2, fluidType: 'oil' };

  it('passes clean inputs with a full score', () => {
    const v = VolumeCalculationEngine.validateInputs(good);
    expect(v.warnings).toHaveLength(0);
    expect(v.qualityScore).toBe(100);
  });

  it('flags Sw >= 1 (no hydrocarbon) and lowers the score', () => {
    const v = VolumeCalculationEngine.validateInputs({ ...good, sw: 1.1 });
    expect(v.warnings.length).toBeGreaterThan(0);
    expect(v.qualityScore).toBeLessThan(100);
  });

  it('flags non-physical Bo below 1.0', () => {
    const v = VolumeCalculationEngine.validateInputs({ ...good, fvf: 0.8 });
    expect(v.warnings.join(' ')).toMatch(/Bo/i);
  });

  it('flags a missing/zero Bg for gas', () => {
    const v = VolumeCalculationEngine.validateInputs({ ...good, fluidType: 'gas', bg: 0 });
    expect(v.warnings.join(' ')).toMatch(/Bg/i);
  });

  it('deterministic result carries warnings + qualityScore', () => {
    const r = VolumeCalculationEngine.calculateDeterministic({ ...good, porosity: 0.6 }, 'field', 'simple');
    expect(Array.isArray(r.warnings)).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.qualityScore).toBeLessThan(100);
  });
});

// ===========================================================================
// Fluid property correlations
// ===========================================================================
describe('FluidPropertyCalculator.calculateBo (Standing)', () => {
  it('matches Standing worked example within tolerance', () => {
    // Rs=500, γg=0.65, API=40, T=180°F → F≈668.8 → Bo≈1.271
    const bo = FluidPropertyCalculator.calculateBo(500, 0.65, 40, 180);
    expect(near(bo, 1.271, 0.01)).toBe(true);
    // regression guard: the old extra-^0.5 bug produced ≈1.07
    expect(bo).toBeGreaterThan(1.2);
  });

  it('increases with solution GOR', () => {
    const lo = FluidPropertyCalculator.calculateBo(200, 0.65, 35, 160);
    const hi = FluidPropertyCalculator.calculateBo(800, 0.65, 35, 160);
    expect(hi).toBeGreaterThan(lo);
  });

  it('never returns below 1.0 and falls back on missing inputs', () => {
    expect(FluidPropertyCalculator.calculateBo(0, 0.65, 40, 180)).toBe(1.2);
    expect(FluidPropertyCalculator.calculateBo(10, 0.6, 45, 100)).toBeGreaterThanOrEqual(1.0);
  });
});

// ===========================================================================
// Ordinary kriging interpolation
// ===========================================================================
describe('KrigingInterpolator', () => {
  // scattered control points on a 6×6 layout, z = a linear + a bump
  const pts = [];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
    const x = i * 200, y = j * 200;
    pts.push({ x, y, z: -7000 - 0.02 * x + 0.01 * y });
  }

  it('is an exact interpolator at control points (zero nugget)', () => {
    const k = new KrigingInterpolator(pts);
    for (const p of [pts[0], pts[15], pts[35]]) {
      expect(near(k.predict(p.x, p.y), p.z, 1e-6)).toBe(true);
    }
  });

  it('reproduces a linear field between control points', () => {
    const k = new KrigingInterpolator(pts);
    // midpoint of a cell → true linear value
    const x = 510, y = 330;
    const truth = -7000 - 0.02 * x + 0.01 * y;
    expect(near(k.predict(x, y), truth, 0.02)).toBe(true);
  });

  it('returns the constant for a flat field', () => {
    const flat = pts.map((p) => ({ ...p, z: -5000 }));
    const k = new KrigingInterpolator(flat);
    expect(near(k.predict(333, 777), -5000, 1e-6)).toBe(true);
  });

  it('has a monotonic spherical variogram reaching the sill at range', () => {
    const k = new KrigingInterpolator(pts, { range: 500, sill: 4, nugget: 0.1, model: 'spherical' });
    expect(k._gamma(0)).toBe(0);
    expect(k._gamma(100)).toBeLessThan(k._gamma(300));
    expect(near(k._gamma(500), 4, 1e-9)).toBe(true);   // plateau at sill
    expect(k._gamma(9999)).toBe(4);
  });

  it('generates a regular grid of finite values with correct dimensions', () => {
    const k = new KrigingInterpolator(pts);
    const g = k.generateGrid(20);
    expect(g.z.length).toBe(g.y.length);
    expect(g.z[0].length).toBe(g.x.length);
    expect(g.z.flat().every((v) => Number.isFinite(v))).toBe(true);
  });
});

describe('SurfaceParser.detectCrs', () => {
  it('extracts EPSG from a legacy GeoJSON crs member', () => {
    const gj = JSON.stringify({
      type: 'FeatureCollection',
      crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::32631' } },
      features: [],
    });
    expect(SurfaceParser.detectCrs(gj, 'geojson')).toBe('EPSG:32631');
  });

  it('sniffs an EPSG code from a gridded-file header comment', () => {
    expect(SurfaceParser.detectCrs('# projected to EPSG:23031\nNCOLS 3', 'asc')).toBe('EPSG:23031');
  });

  it('returns null when no CRS is present', () => {
    expect(SurfaceParser.detectCrs('100 200 -7000\n', 'xyz')).toBeNull();
  });
});

// ===========================================================================
// Rigorous contact-based volumetrics (grid integration)
// ===========================================================================
describe('ContactVolumetricsEngine', () => {
  const petro = { ntg: 1, porosity: 0.2, sw: 0.3, fvf: 1.2, bg: 0.005, recovery: 25, recoveryGas: 70 };
  const fieldOpts = { xyUnit: 'ft', depthUnit: 'ft', zConvention: 'elevation', resolution: 160 };

  it('flat top + constant thickness with no contact: GRV = area·h (exact planimetric area, correct acre units)', () => {
    const flat = makeSurface(() => -7000);           // 1000ft × 1000ft flat crest
    const r = ContactVolumetricsEngine.calculate({
      topSurface: flat, constantThickness: 100,
      inputs: { ...petro, fluidType: 'oil' }, unitSystem: 'field', options: fieldOpts,
    });
    const grvExpected = (1e6 / ACRE) * 100;          // 1e6 ft² → acres, × 100 ft
    expect(near(r.grv, grvExpected, 0.01)).toBe(true);
    expect(near(r.grvOil, grvExpected, 0.01)).toBe(true);
    expect(r.grvGas).toBe(0);
    // STOOIP = 7758·GRV·NTG·φ·(1−Sw)/Bo
    expect(near(r.stooip, (grvExpected * 0.2 * 0.7 * 7758) / 1.2, 0.02)).toBe(true);
    expect(r.volUnit).toBe('Ac-ft');
    expect(r.volumeUnit).toBe('STB');
  });

  it('an OWC truncates the oil column cell-by-cell (contacts change the volume)', () => {
    const flat = makeSurface(() => -7000);
    const full = (1e6 / ACRE) * 100;
    const half = ContactVolumetricsEngine.calculate({
      topSurface: flat, constantThickness: 100,
      inputs: { ...petro, fluidType: 'oil', owc: -7050 }, unitSystem: 'field', options: fieldOpts,
    });
    // reservoir 7000–7100 ft, OWC at 7050 → only the top 50 ft is oil
    expect(near(half.grvOil, full / 2, 0.02)).toBe(true);
  });

  it('deeper OWC yields more oil — headline sensitivity that the old mean-thickness model lacked', () => {
    const flat = makeSurface(() => -7000);
    const shallow = ContactVolumetricsEngine.calculate({
      topSurface: flat, constantThickness: 200,
      inputs: { ...petro, fluidType: 'oil', owc: -7050 }, unitSystem: 'field', options: fieldOpts,
    });
    const deep = ContactVolumetricsEngine.calculate({
      topSurface: flat, constantThickness: 200,
      inputs: { ...petro, fluidType: 'oil', owc: -7120 }, unitSystem: 'field', options: fieldOpts,
    });
    expect(deep.grvOil).toBeGreaterThan(shallow.grvOil);
    expect(near(deep.grvOil / shallow.grvOil, 120 / 50, 0.03)).toBe(true);
  });

  it('oil_gas splits GRV into a gas cap and an oil leg by GOC/OWC (no shared pore volume)', () => {
    const flat = makeSurface(() => -7000);
    const r = ContactVolumetricsEngine.calculate({
      topSurface: flat, constantThickness: 200,
      inputs: { ...petro, fluidType: 'oil_gas', goc: -7050, owc: -7150 },
      unitSystem: 'field', options: fieldOpts,
    });
    // gas cap 7000–7050 (50 ft), oil leg 7050–7150 (100 ft), water below
    expect(near(r.grvGas, (1e6 / ACRE) * 50, 0.02)).toBe(true);
    expect(near(r.grvOil, (1e6 / ACRE) * 100, 0.02)).toBe(true);
    expect(near(r.grvOil, r.grvGas * 2, 0.02)).toBe(true);
    expect(r.stooip).toBeGreaterThan(0);
    expect(r.giip).toBeGreaterThan(0);
    expect(near(r.hcPoreVolume, r.hcPoreVolumeOil + r.hcPoreVolumeGas, 1e-6)).toBe(true);
  });

  it('honours structural dip: a dipping top + OWC gives the exact partial trapped volume', () => {
    // top elevation z = -7000 − 0.1·x  ⇒ topDepth = 7000 + 0.1x; base 500 ft below (all under OWC)
    const dip = makeSurface((x) => -7000 - 0.1 * x, 26);
    const r = ContactVolumetricsEngine.calculate({
      topSurface: dip, constantThickness: 500,
      inputs: { ...petro, fluidType: 'oil', owc: -7050 }, unitSystem: 'field',
      options: { ...fieldOpts, resolution: 220 },
    });
    // oilThk(x)=50−0.1x for x<500 else 0 → ∫∫ = 1.25e7 ft³ ⇒ /43560 acre-ft
    expect(near(r.grvOil, 1.25e7 / ACRE, 0.03)).toBe(true);
    // productive area = the up-dip half (x<500): 500·1000 ft²
    expect(near(r.areaOil, (500 * 1000) / ACRE, 0.05)).toBe(true);
  });

  it('metric units: GRV in m³, STOOIP in sm³', () => {
    const flatM = makeSurface(() => -2000);          // 1000m × 1000m
    const r = ContactVolumetricsEngine.calculate({
      topSurface: flatM, constantThickness: 20,
      inputs: { ntg: 1, porosity: 0.25, sw: 0.2, fvf: 1.1, fluidType: 'oil' },
      unitSystem: 'metric', options: { xyUnit: 'm', depthUnit: 'm', zConvention: 'elevation', resolution: 140 },
    });
    expect(near(r.grv, 2e7, 0.01)).toBe(true);        // 1e6 m² × 20 m
    expect(near(r.stooip, (2e7 * 0.25 * 0.8) / 1.1, 0.02)).toBe(true);
    expect(r.volUnit).toBe('m³');
    expect(r.volumeUnit).toBe('sm³');
  });

  it('clips to an AOI polygon by real fractional cell area', () => {
    const flat = makeSurface(() => -7000);
    const circle = PolygonClippingEngine.generateCircle(500, 500, 250, 64);
    const r = ContactVolumetricsEngine.calculate({
      topSurface: flat, constantThickness: 100,
      inputs: { ...petro, fluidType: 'oil' }, unitSystem: 'field',
      aoiPolygon: { vertices: circle }, options: { ...fieldOpts, resolution: 220 },
    });
    const areaExpected = (Math.PI * 250 * 250) / ACRE; // circle area → acres
    expect(near(r.grvOil, areaExpected * 100, 0.03)).toBe(true);
  });

  it('rejects insufficient geometry', () => {
    expect(ContactVolumetricsEngine.calculate({ topSurface: { points: [] }, inputs: {} }).error).toBeTruthy();
    const flat = makeSurface(() => -7000);
    expect(ContactVolumetricsEngine.calculate({ topSurface: flat, inputs: {} }).error).toBeTruthy();
  });

  it('integrates correctly when gridded with kriging (option wiring)', () => {
    const dip = makeSurface((x) => -7000 - 0.1 * x, 26);
    const r = ContactVolumetricsEngine.calculate({
      topSurface: dip, constantThickness: 500,
      inputs: { ...petro, fluidType: 'oil', owc: -7050 }, unitSystem: 'field',
      options: { ...fieldOpts, resolution: 200, interpolation: 'kriging' },
    });
    // same closed-form partial trapped volume as the IDW case, within tolerance
    expect(near(r.grvOil, 1.25e7 / ACRE, 0.04)).toBe(true);
  });
});

// ===========================================================================
// Monte Carlo — dimensionless helpers
// ===========================================================================
describe('MonteCarloEngine helpers', () => {
  it('normalCDF is an accurate Gaussian CDF (not the old logistic approx)', () => {
    expect(near(MonteCarloEngine.normalCDF(0), 0.5, 1e-6)).toBe(true);
    expect(near(MonteCarloEngine.normalCDF(1.6448536), 0.95, 1e-4)).toBe(true);
    expect(near(MonteCarloEngine.normalCDF(-1.6448536), 0.05, 1e-3)).toBe(true);
    expect(near(MonteCarloEngine.normalCDF(1.959964), 0.975, 1e-4)).toBe(true);
  });

  it('erf(0)=0 and is odd', () => {
    expect(Math.abs(MonteCarloEngine.erf(0))).toBeLessThan(1e-9);
    expect(near(MonteCarloEngine.erf(0.7), -MonteCarloEngine.erf(-0.7), 1e-9)).toBe(true);
  });

  it('isVariable distinguishes spread from constants', () => {
    expect(MonteCarloEngine.isVariable({ type: 'triangular', min: 1, mode: 2, max: 3 })).toBe(true);
    expect(MonteCarloEngine.isVariable({ type: 'triangular', min: 2, mode: 2, max: 2 })).toBe(false);
    expect(MonteCarloEngine.isVariable({ type: 'normal', mean: 1, stdDev: 0.1 })).toBe(true);
    expect(MonteCarloEngine.isVariable({ type: 'normal', mean: 1, stdDev: 0 })).toBe(false);
    expect(MonteCarloEngine.isVariable({ type: 'constant', value: 5 })).toBe(false);
  });

  it('marginalValue maps standard normal through each marginal', () => {
    // normal: x=0 → mean
    expect(near(MonteCarloEngine.marginalValue({ type: 'normal', mean: 0.2, stdDev: 0.03 }, 0), 0.2, 1e-6)).toBe(true);
    // triangular symmetric: x=0 (median) → mode for a symmetric triangle
    expect(near(MonteCarloEngine.marginalValue({ type: 'triangular', min: 1, mode: 2, max: 3 }, 0), 2, 1e-6)).toBe(true);
    // uniform: x=0 → midpoint
    expect(near(MonteCarloEngine.marginalValue({ type: 'uniform', min: 10, max: 20 }, 0), 15, 1e-6)).toBe(true);
    // lognormal is always positive
    expect(MonteCarloEngine.marginalValue({ type: 'lognormal', mean: 100, stdDev: 20 }, -2)).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Monte Carlo — full simulation
// ===========================================================================
describe('MonteCarloEngine.runSimulation', () => {
  const cfg = (over = {}) => ({ fluidType: 'oil', unitSystem: 'field', iterations: 4000, ...over });

  it('produces ordered percentiles P90 < P50 < P10 (all-triangular)', async () => {
    const inputs = {
      area: { type: 'triangular', min: 800, mode: 1000, max: 1300 },
      thickness: { type: 'triangular', min: 40, mode: 50, max: 65 },
      porosity: { type: 'triangular', min: 0.16, mode: 0.20, max: 0.24 },
      sw: { type: 'triangular', min: 0.25, mode: 0.30, max: 0.38 },
      fvf: { type: 'constant', value: 1.2 },
      ntg: { type: 'constant', value: 1.0 },
    };
    const { stats, raw } = await MonteCarloEngine.runSimulation(cfg(), inputs);
    expect(stats.stooip.p90).toBeLessThan(stats.stooip.p50);
    expect(stats.stooip.p50).toBeLessThan(stats.stooip.p10);
    expect(raw.samples.length).toBeGreaterThan(3500);
    expect(stats.stooip.mean).toBeGreaterThan(0);
  });

  it('REGRESSION: a normal-distributed variable actually varies the output', async () => {
    // Previously the engine only sampled `triangular`; a normal input was
    // silently dropped to a constant → zero variance. This guards that fix.
    const inputs = {
      area: { type: 'constant', value: 1000 },
      thickness: { type: 'constant', value: 50 },
      porosity: { type: 'normal', mean: 0.20, stdDev: 0.03 },
      sw: { type: 'constant', value: 0.30 },
      fvf: { type: 'constant', value: 1.2 },
      ntg: { type: 'constant', value: 1.0 },
    };
    const { stats } = await MonteCarloEngine.runSimulation(cfg(), inputs);
    expect(stats.stooip.stdDev).toBeGreaterThan(0);
    expect(stats.stooip.p10).toBeGreaterThan(stats.stooip.p90);
    // mean STOIIP ≈ deterministic at mean porosity (7000·7758/1.2)
    expect(near(stats.stooip.mean, (1000 * 50 * 1 * 0.20 * 0.70 * 7758) / 1.2, 0.03)).toBe(true);
  });

  it('honours the requested iteration count', async () => {
    const inputs = {
      porosity: { type: 'triangular', min: 0.16, mode: 0.20, max: 0.24 },
      area: { type: 'constant', value: 1000 }, thickness: { type: 'constant', value: 50 },
      sw: { type: 'constant', value: 0.3 }, fvf: { type: 'constant', value: 1.2 }, ntg: { type: 'constant', value: 1 },
    };
    const { stats } = await MonteCarloEngine.runSimulation(cfg({ iterations: 1500 }), inputs);
    expect(stats.iterations).toBe(1500);
    expect(stats.validCount).toBe(1500); // no rejections for bounded triangular
  });

  it('applies the porosity–Sw negative correlation', async () => {
    const inputs = {
      porosity: { type: 'triangular', min: 0.15, mode: 0.20, max: 0.25 },
      sw: { type: 'triangular', min: 0.20, mode: 0.30, max: 0.40 },
      area: { type: 'constant', value: 1000 }, thickness: { type: 'constant', value: 50 },
      fvf: { type: 'constant', value: 1.2 }, ntg: { type: 'constant', value: 1 },
    };
    const { raw } = await MonteCarloEngine.runSimulation(cfg({ iterations: 5000 }), inputs);
    const phi = raw.samples.map((s) => s.inputs.phi);
    const sw = raw.samples.map((s) => s.inputs.sw);
    const corr = ss.sampleCorrelation(phi, sw);
    expect(corr).toBeLessThan(-0.4); // strongly negative (target −0.8, copula/marginal softens it)
  });

  it('sensitivity (tornado) ranks variables by variance contribution', async () => {
    const inputs = {
      area: { type: 'triangular', min: 500, mode: 1000, max: 2000 }, // dominant
      porosity: { type: 'triangular', min: 0.19, mode: 0.20, max: 0.21 }, // minor
      thickness: { type: 'constant', value: 50 }, sw: { type: 'constant', value: 0.3 },
      fvf: { type: 'constant', value: 1.2 }, ntg: { type: 'constant', value: 1 },
    };
    const { stats } = await MonteCarloEngine.runSimulation(cfg(), inputs);
    expect(stats.sensitivity[0].parameter).toBe('area');
    expect(stats.sensitivity[0].contribution).toBeGreaterThan(50);
  });

  it('clamps porosity/Sw to [0,1] so a wide Normal cannot produce negative STOOIP', async () => {
    const inputs = {
      area: { type: 'constant', value: 1000 }, thickness: { type: 'constant', value: 50 },
      porosity: { type: 'normal', mean: 0.2, stdDev: 0.5 },  // absurdly wide → would go <0 and >1
      sw: { type: 'normal', mean: 0.3, stdDev: 0.5 },
      fvf: { type: 'constant', value: 1.2 }, ntg: { type: 'constant', value: 1 },
    };
    const { raw } = await MonteCarloEngine.runSimulation(cfg({ iterations: 3000 }), inputs);
    expect(Math.min(...raw.stooip)).toBeGreaterThanOrEqual(0);       // never negative
    expect(Math.min(...raw.samples.map(s => s.inputs.phi))).toBeGreaterThanOrEqual(0);
    expect(Math.max(...raw.samples.map(s => s.inputs.sw))).toBeLessThanOrEqual(1);
  });
});

// ===========================================================================
// Contact-based Monte Carlo (hypsometric GRV from sampled contacts)
// ===========================================================================
describe('ContactVolumetricsEngine.buildHypsometry + MonteCarlo structural mode', () => {
  const fieldOpts = { xyUnit: 'ft', depthUnit: 'ft', zConvention: 'elevation', resolution: 60 };
  const flat = makeSurface(() => -7000);
  const buildHyps = () => ContactVolumetricsEngine.buildHypsometry({
    topSurface: flat, constantThickness: 200, unitSystem: 'field', options: fieldOpts,
  });

  it('hypsometric curve returns rock volume between top and a contact depth', () => {
    const h = buildHyps();
    expect(h.error).toBeUndefined();
    // reservoir 7000–7200 ft; rock down to 7050 = 50 ft × area
    expect(near(h.rockToContact(-7050), (1e6 / ACRE) * 50, 0.02)).toBe(true);
    expect(near(h.rockToContact(-7200), (1e6 / ACRE) * 200, 0.02)).toBe(true); // full reservoir
    expect(h.rockToContact(-6999)).toBeCloseTo(0, 5);                          // above crest → 0
  });

  it('zoneVolumes splits gas cap and oil leg with no shared rock', () => {
    const h = buildHyps();
    const zv = h.zoneVolumes('oil_gas', -7150, -7050); // GOC 7050, OWC 7150
    expect(near(zv.grvGas, (1e6 / ACRE) * 50, 0.02)).toBe(true);   // 7000–7050
    expect(near(zv.grvOil, (1e6 / ACRE) * 100, 0.02)).toBe(true);  // 7050–7150
  });

  it('structural MC with all-constant inputs reproduces the deterministic contact volume', async () => {
    const h = buildHyps();
    const config = {
      fluidType: 'oil', unitSystem: 'field', iterations: 1500,
      grvMode: 'structural', hypsometry: h, deterministicContacts: { owc: -7050, goc: null },
    };
    const inputs = {
      porosity: { type: 'constant', value: 0.2 }, sw: { type: 'constant', value: 0.3 },
      fvf: { type: 'constant', value: 1.2 }, ntg: { type: 'constant', value: 1 },
      owc: { type: 'constant', value: -7050 }, grvFactor: { type: 'constant', value: 1 },
    };
    const { stats } = await MonteCarloEngine.runSimulation(config, inputs);
    const det = ContactVolumetricsEngine.calculate({
      topSurface: flat, constantThickness: 200,
      inputs: { ntg: 1, porosity: 0.2, sw: 0.3, fvf: 1.2, fluidType: 'oil', owc: -7050 },
      unitSystem: 'field', options: fieldOpts,
    });
    expect(near(stats.stooip.mean, det.stooip, 0.02)).toBe(true);
  });

  it('structural MC samples the contact and ranks it in the tornado', async () => {
    const h = buildHyps();
    const config = {
      fluidType: 'oil', unitSystem: 'field', iterations: 3000,
      grvMode: 'structural', hypsometry: h, deterministicContacts: { owc: -7100, goc: null },
    };
    const inputs = {
      porosity: { type: 'triangular', min: 0.19, mode: 0.20, max: 0.21 },  // minor
      sw: { type: 'constant', value: 0.3 }, fvf: { type: 'constant', value: 1.2 }, ntg: { type: 'constant', value: 1 },
      owc: { type: 'triangular', min: -7150, mode: -7100, max: -7050 },     // dominant geometry
      grvFactor: { type: 'constant', value: 1 },
    };
    const { stats, raw } = await MonteCarloEngine.runSimulation(config, inputs);
    expect(stats.stooip.stdDev).toBeGreaterThan(0);
    const owcParam = stats.sensitivity.find(s => s.parameter === 'owc');
    expect(owcParam).toBeTruthy();
    expect(owcParam.contribution).toBeGreaterThan(50);
    // deeper OWC realisations really do carry more oil (elevation: deeper = more negative)
    const byOwc = [...raw.samples].sort((a, b) => a.inputs.owc - b.inputs.owc);
    const n = byOwc.length;
    const meanTV = (arr) => arr.reduce((s, x) => s + x.targetVol, 0) / arr.length;
    const deepestDecile = byOwc.slice(0, Math.floor(n * 0.1));      // most-negative OWC
    const shallowestDecile = byOwc.slice(Math.floor(n * 0.9));      // least-negative OWC
    expect(meanTV(deepestDecile)).toBeGreaterThan(meanTV(shallowestDecile));
  });

  it('structural MC oil_gas keeps STOOIP and GIIP as independent zone volumes (no double-count)', async () => {
    const h = buildHyps();
    const config = {
      fluidType: 'oil_gas', unitSystem: 'field', iterations: 1500,
      grvMode: 'structural', hypsometry: h, deterministicContacts: { owc: -7150, goc: -7050 },
    };
    const inputs = {
      porosity: { type: 'constant', value: 0.2 }, sw: { type: 'constant', value: 0.3 },
      fvf: { type: 'constant', value: 1.2 }, bg: { type: 'constant', value: 0.005 }, ntg: { type: 'constant', value: 1 },
      goc: { type: 'constant', value: -7050 }, owc: { type: 'constant', value: -7150 },
      grvFactor: { type: 'constant', value: 1 },
    };
    const { stats } = await MonteCarloEngine.runSimulation(config, inputs);
    expect(stats.stooip.mean).toBeGreaterThan(0);
    expect(stats.giip.mean).toBeGreaterThan(0);
    // oil leg (100 ft) is twice the gas cap (50 ft) in rock; verify STOOIP vs the
    // deterministic split rather than the old same-HCPV double-count.
    const det = ContactVolumetricsEngine.calculate({
      topSurface: flat, constantThickness: 200,
      inputs: { ntg: 1, porosity: 0.2, sw: 0.3, fvf: 1.2, bg: 0.005, fluidType: 'oil_gas', goc: -7050, owc: -7150 },
      unitSystem: 'field', options: fieldOpts,
    });
    expect(near(stats.stooip.mean, det.stooip, 0.02)).toBe(true);
    expect(near(stats.giip.mean, det.giip, 0.02)).toBe(true);
  });
});
