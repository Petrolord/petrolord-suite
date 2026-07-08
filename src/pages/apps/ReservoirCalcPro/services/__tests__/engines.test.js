import * as ss from 'simple-statistics';
import { VolumeCalculationEngine } from '@/pages/apps/ReservoirCalcPro/services/VolumeCalculationEngine';
import { MonteCarloEngine } from '@/pages/apps/ReservoirCalcPro/services/MonteCarloEngine';

const near = (a, b, relTol = 0.02) => Math.abs(a - b) <= relTol * Math.abs(b) + 1e-6;

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
});
