/**
 * Correctness checklist for the Recovery Factor engine.
 * Physical assertions + closed-form checks, not golden snapshots.
 */
import {
  DRIVE_MECHANISMS,
  getDriveMechanism,
  apiSolutionGasDriveRF,
  apiWaterDriveRF,
  gasPZDepletionRF,
  gasWaterDriveRF,
  stoiipVolumetric,
  ogipVolumetric,
  reservesFromRF,
  estimateRecovery,
  sampleRecoveryData,
} from '../recoveryFactorCalculations';

describe('drive-mechanism analog table', () => {
  it('every band is ordered low <= typical <= high and within [0,1]', () => {
    DRIVE_MECHANISMS.forEach((d) => {
      expect(d.low).toBeLessThanOrEqual(d.typical);
      expect(d.typical).toBeLessThanOrEqual(d.high);
      expect(d.low).toBeGreaterThan(0);
      expect(d.high).toBeLessThanOrEqual(1);
      expect(['oil', 'gas']).toContain(d.phase);
    });
  });

  it('water drive recovers more than solution-gas drive (typical)', () => {
    expect(getDriveMechanism('water_drive').typical)
      .toBeGreaterThan(getDriveMechanism('solution_gas').typical);
  });

  it('returns null for unknown code', () => {
    expect(getDriveMechanism('nope')).toBeNull();
  });
});

describe('gas p/z depletion RF (exact)', () => {
  it('matches 1 - (pa/za)/(pi/zi)', () => {
    // pi/zi = 4000/0.9 = 4444.4 ; pa/za = 800/0.95 = 842.1 ; RF = 1 - 0.1895 = 0.8105
    const rf = gasPZDepletionRF({ pi: 4000, zi: 0.9, pa: 800, za: 0.95 });
    expect(rf).toBeCloseTo(1 - (800 / 0.95) / (4000 / 0.9), 4);
    expect(rf).toBeGreaterThan(0.7);
    expect(rf).toBeLessThan(0.9);
  });

  it('is null on non-finite / zero pressures', () => {
    expect(gasPZDepletionRF({ pi: 0, zi: 0.9, pa: 800, za: 0.95 })).toBeNull();
    expect(gasPZDepletionRF({ pi: 4000, zi: 0.9, pa: 'x', za: 0.95 })).toBeNull();
  });
});

describe('water-drive gas trapping', () => {
  it('lower Sgr -> higher recovery', () => {
    const lowTrap = gasWaterDriveRF({ swi: 0.25, sgr: 0.20, sweep: 0.8 });
    const highTrap = gasWaterDriveRF({ swi: 0.25, sgr: 0.40, sweep: 0.8 });
    expect(lowTrap).toBeGreaterThan(highTrap);
  });
});

describe('API correlations (gated) produce sane fractions', () => {
  const base = {
    phi: 0.2, swi: 0.3, bob: 1.3, boi: 1.3, k: 100, muob: 1, muwi: 0.5, muoi: 1,
    pb: 3000, pi: 3000, pa: 1000,
  };
  it('solution-gas-drive RF stays a plausible fraction', () => {
    const rf = apiSolutionGasDriveRF(base);
    expect(rf).toBeGreaterThan(0.01);
    expect(rf).toBeLessThan(0.95);
  });
  it('water-drive RF stays a plausible fraction and exceeds solution-gas for same rock', () => {
    const wd = apiWaterDriveRF(base);
    const sg = apiSolutionGasDriveRF(base);
    expect(wd).toBeGreaterThan(0.01);
    expect(wd).toBeLessThan(0.95);
    expect(wd).toBeGreaterThan(sg);
  });
  it('null on missing inputs', () => {
    expect(apiSolutionGasDriveRF({ phi: 0.2 })).toBeNull();
    expect(apiWaterDriveRF({})).toBeNull();
  });
});

describe('volumetric in-place', () => {
  it('STOIIP grows with area and shrinks with Boi', () => {
    const a = stoiipVolumetric({ area: 1000, thickness: 40, phi: 0.2, sw: 0.3, boi: 1.3, ntg: 1 });
    const bigger = stoiipVolumetric({ area: 2000, thickness: 40, phi: 0.2, sw: 0.3, boi: 1.3, ntg: 1 });
    const higherBoi = stoiipVolumetric({ area: 1000, thickness: 40, phi: 0.2, sw: 0.3, boi: 1.6, ntg: 1 });
    expect(bigger).toBeCloseTo(a * 2, 2);
    expect(higherBoi).toBeLessThan(a);
  });
  it('matches 7758*A*h*phi*(1-Sw)*NTG/Boi', () => {
    const v = stoiipVolumetric({ area: 640, thickness: 50, phi: 0.25, sw: 0.2, boi: 1.25, ntg: 0.9 });
    expect(v).toBeCloseTo((7758 * 640 * 50 * 0.25 * 0.8 * 0.9) / 1.25, 1);
  });
  it('OGIP is null for zero Bgi', () => {
    expect(ogipVolumetric({ area: 640, thickness: 50, phi: 0.25, sw: 0.2, bgi: 0 })).toBeNull();
  });
});

describe('reserves rollup', () => {
  it('reserves = ooip * rf', () => {
    expect(reservesFromRF(1_000_000, 0.35)).toBe(350_000);
  });
});

describe('estimateRecovery orchestrator', () => {
  it('analog method returns typical RF and an ordered reserves band', () => {
    const r = estimateRecovery({ method: 'analog', driveCode: 'water_drive', ooip: 1_000_000 });
    expect(r.rf).toBe(getDriveMechanism('water_drive').typical);
    expect(r.reservesLow).toBeLessThanOrEqual(r.reserves);
    expect(r.reserves).toBeLessThanOrEqual(r.reservesHigh);
    expect(r.phase).toBe('oil');
    expect(r.warnings).toHaveLength(0);
  });

  it('correlation methods attach a validation warning', () => {
    const s = sampleRecoveryData();
    const r = estimateRecovery({
      method: 'api_water_drive',
      driveCode: 'water_drive',
      ooip: 1_000_000,
      correlationInputs: s.correlationInputs,
    });
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.rf).toBeGreaterThan(0);
  });

  it('gas p/z method flags phase gas', () => {
    const r = estimateRecovery({
      method: 'gas_pz',
      driveCode: 'gas_volumetric',
      ooip: 5_000_000_000,
      correlationInputs: { pi: 4000, zi: 0.9, pa: 800, za: 0.95 },
    });
    expect(r.phase).toBe('gas');
    expect(r.reserves).toBeGreaterThan(0);
  });

  it('null in-place gives null reserves without throwing', () => {
    const r = estimateRecovery({ method: 'analog', driveCode: 'solution_gas', ooip: '' });
    expect(r.reserves).toBeNull();
    expect(r.rf).toBeGreaterThan(0);
  });
});
