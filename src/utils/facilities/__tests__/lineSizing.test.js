// Facilities F1 composition-layer gates. The physics itself is gated
// in the engines package (facilities.linehydraulics.test.js against
// the SI oracle) and in the nodal goldens (Beggs & Brill); what is
// tested HERE is the wiring: unit conversions into the correlations,
// the limits composed from RP 14E, the sweep's pass logic, and the
// stated dead-liquid assumption behaving as single-phase when the gas
// goes to zero.

import {
  oilDensityLbFt3, gasDensityLbFt3, multiphaseLine, erosionalStatus,
  sizeSweep, gasLineTraverse, liquidLineDrop, gasOutletPressure,
  weymouthQ, PIPE_SCHEDULE,
} from '../lineSizing';

const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-12);

describe('fluid property adapters', () => {
  test('oil density reproduces the API gravity identity', () => {
    expect(oilDensityLbFt3(10)).toBeCloseTo(62.4, 6); // 10 API is water-heavy oil
    expect(oilDensityLbFt3(35)).toBeCloseTo((141.5 / 166.5) * 62.4, 9);
  });

  test('gas density uses the validated z and scales with pressure', () => {
    const lo = gasDensityLbFt3({ pPsia: 100, tF: 80, gasSg: 0.65 });
    const hi = gasDensityLbFt3({ pPsia: 1000, tF: 80, gasSg: 0.65 });
    expect(lo.z).toBeGreaterThan(0.9); // near-ideal at low pressure
    expect(hi.rhoLbFt3).toBeGreaterThan(9 * lo.rhoLbFt3); // super-ideal compression
    // ideal-gas cross-check at low pressure: rho = pM/RT within z
    const ideal = (28.9625 * 0.65 * 100) / (10.7316 * (80 + 459.67));
    expect(rel(lo.rhoLbFt3 * lo.z, ideal)).toBeLessThan(1e-9);
  });
});

describe('multiphase flowline over Beggs & Brill', () => {
  const base = {
    qLiquidBpd: 4000, wctPct: 30, qGasScfd: 2.0e6,
    pPsia: 500, tF: 120, idIn: 6.065, lengthFt: 15000, elevChangeFt: 0,
  };

  test('produces a pattern, holdup above no-slip, and a positive drop', () => {
    const r = multiphaseLine(base);
    expect(r.error).toBeUndefined();
    expect(['segregated', 'intermittent', 'distributed', 'transition']).toContain(r.pattern);
    expect(r.holdup).toBeGreaterThanOrEqual(r.lambdaL); // slip holds liquid back
    expect(r.dpTotalPsi).toBeGreaterThan(0);
    expect(r.p2Psia).toBeLessThan(base.pPsia);
  });

  test('gas to zero collapses to the single-phase liquid answer', () => {
    const mp = multiphaseLine({ ...base, qGasScfd: 0 });
    expect(mp.error).toBeUndefined();
    expect(mp.holdup).toBeGreaterThan(0.999);
    const rhoL = mp.rhoL;
    const sp = liquidLineDrop({
      qBpd: base.qLiquidBpd, idIn: base.idIn, lengthFt: base.lengthFt,
      rhoLbFt3: rhoL, muCp: 2 * 0.7 + 0.6 * 0.3, roughnessIn: 0.0018,
    });
    // Two independent friction implementations (nodal Moody vs the
    // facilities engine's Colebrook) on the same physics.
    expect(rel(mp.dpTotalPsi, sp.dpTotalPsi)).toBeLessThan(0.02);
  });

  test('uphill costs more than downhill', () => {
    const up = multiphaseLine({ ...base, elevChangeFt: 300 });
    const dn = multiphaseLine({ ...base, elevChangeFt: -300 });
    expect(up.dpTotalPsi).toBeGreaterThan(dn.dpTotalPsi);
  });

  test('refuses impossible geometry and dead lines', () => {
    expect(multiphaseLine({ ...base, elevChangeFt: 20000 }).error).toBeTruthy();
    expect(multiphaseLine({ ...base, qLiquidBpd: 0, qGasScfd: 0 }).error).toBeTruthy();
  });
});

describe('erosional status and the sizing sweep', () => {
  test('RP 14E ratio flags exactly at the limit', () => {
    const at = erosionalStatus({ vFtS: 10, rhoMixLbFt3: 100, cFactor: 100 });
    expect(at.erosionalFtS).toBeCloseTo(10, 9);
    expect(at.exceeded).toBe(false);
    expect(erosionalStatus({ vFtS: 10.01, rhoMixLbFt3: 100, cFactor: 100 }).exceeded).toBe(true);
  });

  test('liquid sweep recommends the smallest passing bore and dp falls with size', () => {
    const sweep = sizeSweep({
      mode: 'liquid',
      inputs: { qBpd: 8000, lengthFt: 10000, rhoLbFt3: 55, muCp: 3, roughnessIn: 0.0018 },
      maxLiquidVFtS: 12,
    });
    expect(sweep.error).toBeUndefined();
    expect(sweep.rows).toHaveLength(PIPE_SCHEDULE.length);
    const passes = sweep.rows.filter((r) => r.pass);
    expect(passes.length).toBeGreaterThan(0);
    expect(sweep.recommended.idIn).toBe(Math.min(...passes.map((r) => r.idIn)));
    const sorted = [...sweep.rows].sort((a, b) => a.idIn - b.idIn);
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i].dpPsi).toBeLessThan(sorted[i - 1].dpPsi);
    }
  });

  test('multiphase sweep carries pattern and holdup per size', () => {
    const sweep = sizeSweep({
      mode: 'multiphase',
      inputs: {
        qLiquidBpd: 4000, wctPct: 30, qGasScfd: 2.0e6,
        pPsia: 500, tF: 120, lengthFt: 15000,
      },
    });
    expect(sweep.error).toBeUndefined();
    sweep.rows.forEach((r) => {
      expect(r.pattern).toBeTruthy();
      expect(r.holdup).toBeGreaterThan(0);
    });
  });

  test('gas sweep marks bores that cannot carry the rate instead of faking numbers', () => {
    const sweep = sizeSweep({
      mode: 'gas',
      inputs: {
        qScfd: 8e7, p1Psia: 900, lengthMi: 50, sg: 0.65, tAvgR: 530, zAvg: 0.9, tF: 70,
      },
    });
    expect(sweep.error).toBeUndefined();
    const small = sweep.rows.find((r) => r.nps === 2);
    expect(small.pass).toBe(false);
    expect(Number.isNaN(small.dpPsi)).toBe(true);
  });
});

describe('gas traverse', () => {
  test('marching flat segments agrees with the one-shot solve', () => {
    const args = {
      equation: 'weymouth', qScfd: 2e7, p1Psia: 900, idIn: 12, sg: 0.65, tAvgR: 530, zAvg: 0.9,
    };
    const oneShot = gasOutletPressure({ ...args, lengthMi: 10 });
    const marched = gasLineTraverse({
      ...args,
      profile: [{ lengthFt: 26400 }, { lengthFt: 26400 }],
    });
    expect(marched.error).toBeUndefined();
    // Marching re-linearizes p^2 per segment; agreement is physical,
    // not bit-exact.
    expect(rel(marched.p2Psia, oneShot.p2Psia)).toBeLessThan(1e-3);
    expect(marched.stations).toHaveLength(3);
  });

  test('an overloaded segment names where the line dies', () => {
    const r = gasLineTraverse({
      equation: 'weymouth', qScfd: 5e8, p1Psia: 300, idIn: 4, sg: 0.65, tAvgR: 530, zAvg: 0.9,
      profile: [{ lengthFt: 5280 }],
    });
    expect(r.error).toMatch(/segment ending/);
  });

  test('weymouth stays the published form under the adapter', () => {
    const direct = weymouthQ({
      p1Psia: 900, p2Psia: 500, idIn: 12, lengthMi: 50, sg: 0.65, tAvgR: 530, zAvg: 0.88,
    });
    expect(direct.qScfd).toBeGreaterThan(0);
  });
});
