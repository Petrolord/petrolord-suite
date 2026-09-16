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
  weymouthQ, PIPE_SCHEDULE, DAK_LIMITS, RECOMMENDATION_RULE,
  erosionalStatusAlongLine, gasErosionalAlongLine,
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

  test('multiphase sweep carries pattern and holdup per size, and names the bores that cannot deliver', () => {
    const sweep = sizeSweep({
      mode: 'multiphase',
      inputs: {
        qLiquidBpd: 4000, wctPct: 30, qGasScfd: 2.0e6,
        pPsia: 500, tF: 120, lengthFt: 15000,
      },
    });
    expect(sweep.error).toBeUndefined();
    expect(sweep.rows).toHaveLength(PIPE_SCHEDULE.length);
    sweep.rows.forEach((r) => {
      if (r.pass) {
        // A row with a verdict carries the physics behind it.
        expect(r.pattern).toBeTruthy();
        expect(r.holdup).toBeGreaterThan(0);
        expect(r.p2Psia).toBeGreaterThan(14.7);
      } else {
        // ...and a row without one says why, rather than showing a
        // pattern and a holdup for a line that never reaches its outlet.
        expect(r.note).toBeTruthy();
      }
    });
    // The small bores on this duty genuinely cannot deliver: before the
    // FC2-0 repair they reported a pattern, a holdup and a NEGATIVE
    // arrival pressure instead of saying so.
    const twoInch = sweep.rows.find((r) => r.nps === 2 && r.schedule === '40');
    expect(twoInch.pass).toBe(false);
    expect(twoInch.note).toMatch(/does not deliver/);
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

// ------------------------------------------------------------------
// FC2-0 repair gates. Four defects found by the FC2 course build in
// /root/fc-wip-linesizing/FINDINGS.md section S, each gated here on the
// input that exposed it, the corrected behaviour and the boundary.
// ------------------------------------------------------------------

describe('S1: the sweep recommends the smallest passing bore, not the first passing row', () => {
  // The published schedule is ordered by nominal size and then by
  // schedule, and that order is NOT monotonic in bore:
  //   2.067, 1.939, 3.068, 4.026, 3.826, 6.065, 5.761, ...
  // so a heavier schedule is a smaller bore sitting AFTER the lighter
  // one. This duty straddles a schedule pair at several velocity caps.
  const duty = { qBpd: 12000, lengthFt: 10000, rhoLbFt3: 55, muCp: 3, roughnessIn: 0.0018 };

  test('picks the heavier schedule of the same nominal size when it is the smaller bore', () => {
    const sweep = sizeSweep({ mode: 'liquid', inputs: duty, maxLiquidVFtS: 8 });
    expect(sweep.error).toBeUndefined();

    // The discriminating fact: table order and smallest bore are two
    // DIFFERENT rows here, so a recommendation that merely restated the
    // old logic would fail this.
    const firstInTableOrder = sweep.rows.find((r) => r.pass);
    expect(firstInTableOrder.label).toBe('6 in sch 40');
    expect(firstInTableOrder.idIn).toBeCloseTo(6.065, 6);

    expect(sweep.recommended.label).toBe('6 in sch 80');
    expect(sweep.recommended.idIn).toBeCloseTo(5.761, 6);
    expect(sweep.recommended.idIn).toBeLessThan(firstInTableOrder.idIn);
    expect(sweep.recommended.pass).toBe(true);
  });

  test('the recommendation is the minimum passing bore at every velocity cap', () => {
    // Seven of these ten caps disagreed with table order before the repair.
    [15, 12, 10, 8, 6, 5, 4, 3, 2, 1.5].forEach((maxLiquidVFtS) => {
      const sweep = sizeSweep({ mode: 'liquid', inputs: duty, maxLiquidVFtS });
      const passing = sweep.rows.filter((r) => r.pass);
      if (!passing.length) {
        expect(sweep.recommended).toBeNull();
        return;
      }
      expect(sweep.recommended.idIn).toBe(Math.min(...passing.map((r) => r.idIn)));
    });
  });

  test('boundary: when the first passing row IS the smallest, it stays recommended', () => {
    // A negative control. At this cap nothing smaller than 6 in sch 40
    // passes, so the repair must not over-correct to some other row.
    const sweep = sizeSweep({ mode: 'liquid', inputs: duty, maxLiquidVFtS: 4 });
    const firstInTableOrder = sweep.rows.find((r) => r.pass);
    expect(sweep.recommended.label).toBe(firstInTableOrder.label);
    expect(sweep.recommended.label).toBe('6 in sch 40');
  });

  test('no passing bore is recommended over a smaller passing bore, and the rule is stated', () => {
    const sweep = sizeSweep({ mode: 'liquid', inputs: duty, maxLiquidVFtS: 10 });
    sweep.rows.filter((r) => r.pass).forEach((r) => {
      expect(sweep.recommended.idIn).toBeLessThanOrEqual(r.idIn);
    });
    expect(sweep.recommendationRule).toBe(RECOMMENDATION_RULE);
    expect(RECOMMENDATION_RULE).toMatch(/smallest bore/);
  });

  test('the tie-break is unreachable in the vendored table, which is why it is only documented', () => {
    // Ties break on the thinner wall. No two rows of the checked B36.10
    // subset share a bore, so the rule cannot fire today; if a future
    // table row makes it reachable, this is the test that says so.
    const bores = PIPE_SCHEDULE.map((r) => r.id);
    expect(new Set(bores).size).toBe(bores.length);
  });
});

describe('S2: a density that cannot be computed is refused, never replaced by 1 lb/ft3', () => {
  test('a zero gas gravity refuses the gas sweep instead of sizing against a placeholder', () => {
    // Before the repair `gas.rhoLbFt3 || 1` turned this into a density
    // of 1 lb/ft3, an erosional limit of 100 ft/s and twelve passing rows.
    const sweep = sizeSweep({
      mode: 'gas',
      inputs: { qScfd: 2e7, p1Psia: 900, lengthMi: 5, sg: 0, tAvgR: 530, tF: 70, zAvg: 0.9 },
    });
    expect(sweep.error).toMatch(/gas gravity/);
    expect(sweep.rows).toBeUndefined();
    expect(sweep.recommended).toBeUndefined();
  });

  test('a refused density returns no number at all, rather than a NaN a caller could use', () => {
    [
      { pPsia: 500, tF: 80, gasSg: 0 },
      { pPsia: NaN, tF: 80, gasSg: 0.65 },
      { pPsia: 0, tF: 80, gasSg: 0.65 },
      { pPsia: -50, tF: 80, gasSg: 0.65 },
      { pPsia: 500, tF: NaN, gasSg: 0.65 },
    ].forEach((args) => {
      const r = gasDensityLbFt3(args);
      expect(typeof r.error).toBe('string');
      expect(r.error.length).toBeGreaterThan(0);
      expect(r.rhoLbFt3).toBeUndefined();
      expect(r.z).toBeUndefined();
    });
  });

  test('boundary: the same sweep with a real gas gravity sizes, and every row is honest', () => {
    const sweep = sizeSweep({
      mode: 'gas',
      inputs: { qScfd: 2e7, p1Psia: 900, lengthMi: 5, sg: 0.65, tAvgR: 530, tF: 70, zAvg: 0.9 },
    });
    expect(sweep.error).toBeUndefined();
    sweep.rows.forEach((r) => {
      // Either a verdict computed from a real density, or a reason.
      if (Number.isFinite(r.erosionalFtS)) {
        expect(r.erosionalFtS).toBeGreaterThan(0);
        // 100 ft/s is exactly what C = 100 over a placeholder density of
        // 1 lb/ft3 produced; a real line density never lands there.
        expect(r.erosionalFtS).not.toBeCloseTo(100, 6);
      } else {
        expect(r.note).toBeTruthy();
      }
    });
  });
});

describe('S3: the z solver\'s convergence and validity are consulted, not discarded', () => {
  test('conditions below the DAK correlation floor are refused, not answered', () => {
    // -200 degF at 0.65 gravity is Tpr 0.71. The solver converges there
    // and returns z = 0.293, which is a root of a correlation evaluated
    // off its own surface rather than a compressibility factor.
    const r = gasDensityLbFt3({ pPsia: 1200, tF: -200, gasSg: 0.8 });
    expect(r.error).toMatch(/pseudo-reduced temperature/);
    expect(r.rhoLbFt3).toBeUndefined();
  });

  test('pressures above the DAK ceiling are refused', () => {
    const r = gasDensityLbFt3({ pPsia: 25000, tF: 80, gasSg: 0.65 });
    expect(r.error).toMatch(/pseudo-reduced pressure/);
    expect(r.rhoLbFt3).toBeUndefined();
  });

  test('boundary: just inside the window computes and reports where it sits', () => {
    // Tpr floor is 1.0; at 0.65 gravity that is about -94.6 degF.
    const below = gasDensityLbFt3({ pPsia: 800, tF: -100, gasSg: 0.65 });
    const above = gasDensityLbFt3({ pPsia: 800, tF: -90, gasSg: 0.65 });
    expect(below.error).toBeTruthy();
    expect(below.tpr).toBeUndefined();
    expect(above.error).toBeUndefined();
    expect(above.tpr).toBeGreaterThan(DAK_LIMITS.tprMin);
    expect(above.tpr).toBeLessThan(1.02);
    expect(above.rhoLbFt3).toBeGreaterThan(0);

    const ordinary = gasDensityLbFt3({ pPsia: 500, tF: 120, gasSg: 0.65 });
    expect(ordinary.zConverged).toBe(true);
    expect(ordinary.ppr).toBeGreaterThan(0);
    // A 100 psia line sits below the fit's published lower pressure edge
    // and is deliberately NOT refused: z tends to 1 and that is right.
    expect(gasDensityLbFt3({ pPsia: 100, tF: 80, gasSg: 0.65 }).error).toBeUndefined();
  });

  test('a solve that reports it did not converge is refused rather than used', () => {
    jest.resetModules();
    jest.doMock('@/utils/production/engine/gasProperties', () => {
      const actual = jest.requireActual('@/utils/production/engine/gasProperties');
      return { ...actual, dakZ: (args) => ({ ...actual.dakZ(args), converged: false }) };
    });
    const { gasDensityLbFt3: subject } = require('../lineSizing');
    const r = subject({ pPsia: 500, tF: 120, gasSg: 0.65 });
    expect(r.error).toMatch(/did not converge/);
    expect(r.rhoLbFt3).toBeUndefined();
    jest.dontMock('@/utils/production/engine/gasProperties');
    jest.resetModules();
  });
});

describe('S4: the multiphase line is marched, not evaluated once at the inlet', () => {
  const gassy = {
    qLiquidBpd: 4000, wctPct: 30, qGasScfd: 2.0e6,
    pPsia: 500, tF: 120, idIn: 6.065,
  };

  test('a long line costs more than its inlet gradient says, because the gas expands', () => {
    const r = multiphaseLine({ ...gassy, lengthFt: 50000 });
    expect(r.error).toBeUndefined();
    expect(r.marched).toBe(true);
    expect(r.steps).toBeGreaterThanOrEqual(8);

    // The old answer, reproducible from the same return: one gradient
    // taken at the inlet and stretched over the whole length.
    const oneShot = r.inletGradientPsiPerFt * 50000;
    expect(r.dpTotalPsi).toBeGreaterThan(oneShot);
    expect(r.dpTotalPsi / oneShot).toBeGreaterThan(1.05); // ~9 percent here
    expect(r.outletGradientPsiPerFt).toBeGreaterThan(r.inletGradientPsiPerFt);
    expect(r.gradientPsiPerFt).toBeCloseTo(r.dpTotalPsi / 50000, 12);
  });

  test('the march has converged: four times the steps moves the answer under half a percent', () => {
    const coarse = multiphaseLine({ ...gassy, lengthFt: 50000 });
    const fine = multiphaseLine({ ...gassy, lengthFt: 50000, marchSteps: coarse.steps * 4 });
    expect(rel(coarse.dpTotalPsi, fine.dpTotalPsi)).toBeLessThan(0.005);
  });

  test('boundary: on a short line the march and the old one-shot agree within a percent', () => {
    // The simplification was defensible here, which is exactly why it
    // was invisible: short lines barely move.
    const r = multiphaseLine({ ...gassy, lengthFt: 5000 });
    const oneShot = r.inletGradientPsiPerFt * 5000;
    expect(rel(r.dpTotalPsi, oneShot)).toBeLessThan(0.01);
  });

  test('a line with no gas is unmoved: nothing expands, so there is nothing to march', () => {
    const r = multiphaseLine({ ...gassy, qGasScfd: 0, lengthFt: 15000 });
    const oneShot = r.inletGradientPsiPerFt * 15000;
    expect(rel(r.dpTotalPsi, oneShot)).toBeLessThan(1e-9);
  });

  test('a line that cannot reach its outlet refuses and names the distance', () => {
    // Before the repair this returned p2Psia = 55.0 psia and a drop of
    // 545 psi: a confident arrival pressure for a line whose pressure
    // reaches atmospheric about halfway along.
    const r = multiphaseLine({
      qLiquidBpd: 2000, wctPct: 10, qGasScfd: 2.0e7,
      pPsia: 600, tF: 120, idIn: 6.065, lengthFt: 40000,
    });
    expect(r.error).toMatch(/does not deliver/);
    expect(r.error).toMatch(/ft along/);
    expect(r.code).toBe('infeasible');
    expect(r.diedAtFt).toBeGreaterThan(0);
    expect(r.diedAtFt).toBeLessThan(40000);
    expect(r.p2Psia).toBeUndefined();
    expect(r.dpTotalPsi).toBeUndefined();
  });

  test('an answered line always arrives above atmospheric', () => {
    [5000, 15000, 30000, 45000].forEach((lengthFt) => {
      const r = multiphaseLine({ ...gassy, lengthFt });
      if (!r.error) expect(r.p2Psia).toBeGreaterThan(14.7);
    });
  });

  test('a bad input refuses the whole sweep; an undeliverable bore only fails its own row', () => {
    const badInput = sizeSweep({
      mode: 'multiphase',
      inputs: { ...gassy, lengthFt: 15000, elevChangeFt: 99999 },
    });
    expect(badInput.error).toMatch(/elevation change/);

    const perBore = sizeSweep({
      mode: 'multiphase',
      inputs: { qLiquidBpd: 4000, wctPct: 30, qGasScfd: 2.0e6, pPsia: 500, tF: 120, lengthFt: 15000 },
    });
    expect(perBore.error).toBeUndefined();
    expect(perBore.rows.some((r) => r.note && !r.pass)).toBe(true);
    expect(perBore.recommended).toBeTruthy();
  });

  test('the length-weighted holdup is reported alongside the inlet holdup', () => {
    // Swept volume wants the holdup along the line, not the inlet value.
    const r = multiphaseLine({ ...gassy, lengthFt: 50000 });
    expect(r.avgHoldup).toBeGreaterThan(0);
    expect(r.avgHoldup).toBeLessThan(r.holdup); // gas expands, liquid speeds up
    expect(r.outletHoldup).toBeLessThan(r.holdup);
    expect(r.maxVmFtS).toBeGreaterThanOrEqual(r.vm);
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

// ------------------------------------------------------------------
// FC2-0b. The RP 14E erosional check is an INTEGRITY limit, so the
// question is whether the line exceeds it anywhere, not whether it
// exceeds it at the inlet. Recorded in FINDINGS.md during the FC2-0
// repair and fixed here.
// ------------------------------------------------------------------

describe('FC2-0b: the erosional limit is checked where it binds', () => {
  // 6 in sch 40 on this gassy 20000 ft duty leaves the inlet at 29.8
  // ft/s and reaches 146 ft/s at the far end as the gas expands. The
  // inlet check calls it ratio 0.52 and PASSES; the line erodes.
  const gassyDuty = {
    qLiquidBpd: 2000, wctPct: 10, qGasScfd: 2.0e7,
    pPsia: 600, tF: 120, lengthFt: 20000,
  };
  const gassy = { ...gassyDuty, idIn: 6.065 };

  test('a line that passes at its inlet and exceeds the limit downstream is failed', () => {
    const line = multiphaseLine(gassy);
    expect(line.error).toBeUndefined();

    // Exactly what the old check saw, from the same return: the inlet.
    // This is the assertion that fails against the old pass logic.
    const atInlet = erosionalStatus({
      vFtS: line.vm, rhoMixLbFt3: line.rhoMixLbFt3, cFactor: 100,
    });
    expect(atInlet.exceeded).toBe(false);
    expect(atInlet.ratio).toBeLessThan(0.6);

    const along = erosionalStatusAlongLine({ line, cFactor: 100 });
    expect(along.exceeded).toBe(true);
    expect(along.ratio).toBeGreaterThan(1);
    expect(along.bindsAtInlet).toBe(false);
    expect(along.bindingAtFt).toBeGreaterThan(0.5 * gassy.lengthFt);
    expect(along.bindingVFtS).toBeGreaterThan(4 * along.inletVFtS);
    expect(along.inletRatio).toBeCloseTo(atInlet.ratio, 12);
  });

  test('the sweep fails that bore and moves the recommendation off it', () => {
    const sweep = sizeSweep({ mode: 'multiphase', inputs: gassyDuty, cFactor: 100 });
    expect(sweep.error).toBeUndefined();
    const row = sweep.rows.find((r) => r.label === '6 in sch 40');
    expect(row.pass).toBe(false);
    // The velocity the table shows is the one the verdict is about.
    expect(row.vFtS).toBeGreaterThan(row.inletVFtS);
    expect(row.bindsAtInlet).toBe(false);
    expect(sweep.recommended.label).not.toBe('6 in sch 40');
    expect(sweep.recommended.idIn).toBeGreaterThan(row.idIn);
  });

  test('boundary: on a descending line the limit binds at the inlet', () => {
    // The gas is compressed as the pressure recovers and the mixture
    // slows, so the fastest point is the START. This is why the check
    // uses the true maximum along the line and not the outlet.
    const line = multiphaseLine({
      qLiquidBpd: 4000, wctPct: 30, qGasScfd: 2.0e6,
      pPsia: 500, tF: 120, idIn: 6.065, lengthFt: 20000, elevChangeFt: -1500,
    });
    expect(line.error).toBeUndefined();
    expect(line.outletVmFtS).toBeLessThan(line.vm);

    const along = erosionalStatusAlongLine({ line, cFactor: 100 });
    expect(along.bindsAtInlet).toBe(true);
    expect(along.bindingAtFt).toBe(0);
    expect(along.ratio).toBeCloseTo(along.inletRatio, 12);
  });

  test('a line with no gas has one velocity, so the verdict does not move', () => {
    const line = multiphaseLine({
      qLiquidBpd: 8000, wctPct: 30, qGasScfd: 0,
      pPsia: 500, tF: 120, idIn: 4.026, lengthFt: 15000,
    });
    const along = erosionalStatusAlongLine({ line, cFactor: 100 });
    expect(along.ratio).toBeCloseTo(along.inletRatio, 9);
    expect(along.bindsAtInlet).toBe(true);
  });

  test('the binding station is the same for every C factor, and C still decides the verdict', () => {
    const line = multiphaseLine(gassy);
    const strict = erosionalStatusAlongLine({ line, cFactor: 100 });
    const relaxed = erosionalStatusAlongLine({ line, cFactor: 125 });
    // Ratio is v * sqrt(rho) / C, so where it peaks cannot depend on C.
    expect(relaxed.bindingAtFt).toBe(strict.bindingAtFt);
    expect(relaxed.bindingVFtS).toBeCloseTo(strict.bindingVFtS, 12);
    // ...but the verdict can: the same line clears the looser C factor.
    expect(strict.exceeded).toBe(true);
    expect(relaxed.exceeded).toBe(false);
    expect(relaxed.ratio).toBeCloseTo((strict.ratio * 100) / 125, 12);
  });

  test('a refused line refuses the check rather than answering it', () => {
    const dead = multiphaseLine({
      qLiquidBpd: 2000, wctPct: 10, qGasScfd: 2.0e7,
      pPsia: 600, tF: 120, idIn: 6.065, lengthFt: 40000,
    });
    expect(dead.error).toBeTruthy();
    expect(erosionalStatusAlongLine({ line: dead, cFactor: 100 }).error).toBeTruthy();
  });
});

// ------------------------------------------------------------------
// FC2-0c. The gas branch asked the same question at MEAN pressure,
// which is neither end of the line and not where the limit binds.
// ------------------------------------------------------------------

describe('FC2-0c: the gas sweep checks RP 14E where the limit binds', () => {
  // 30 MMscfd down 10 mi of 6 in sch 40 from 900 psia: the gas leaves
  // at 45 ft/s and arrives at 168 ft/s as it expands into 150 psia.
  const duty = { qScfd: 3.0e7, p1Psia: 900, lengthMi: 10, sg: 0.65, tAvgR: 530, tF: 70, zAvg: 0.9 };

  test('a bore that passes at mean pressure and exceeds the limit downstream is failed', () => {
    const sweep = sizeSweep({ mode: 'gas', inputs: duty, cFactor: 100 });
    expect(sweep.error).toBeUndefined();
    const row = sweep.rows.find((r) => r.label === '6 in sch 40');

    const ero = gasErosionalAlongLine({
      inputs: duty, idIn: row.idIn, p2Psia: row.p2Psia, cFactor: 100,
    });
    // The verdict the old check gave, from the station it used. This is
    // the assertion that fails against the old pass logic.
    expect(ero.meanRatio).toBeLessThan(1);
    expect(ero.meanRatio).toBeGreaterThan(0.5);
    // ...and the verdict where the line actually runs fastest.
    expect(ero.ratio).toBeGreaterThan(1);
    expect(row.pass).toBe(false);
    expect(row.vFtS).toBeGreaterThan(2 * row.meanVFtS);
    expect(row.bindsAtInlet).toBe(false);
    expect(row.bindingAtFt).toBeGreaterThan(0.5 * duty.lengthMi * 5280);
  });

  test('the recommendation moves off the bore that only passed at the mean', () => {
    const sweep = sizeSweep({ mode: 'gas', inputs: duty, cFactor: 100 });
    expect(sweep.recommended).toBeTruthy();
    expect(sweep.recommended.label).not.toBe('6 in sch 40');
    expect(sweep.recommended.idIn).toBeGreaterThan(6.065);
  });

  test('boundary: a short line barely moves, because its pressure barely falls', () => {
    const short = { ...duty, qScfd: 1.0e7, lengthMi: 2 };
    const row = sizeSweep({ mode: 'gas', inputs: short, cFactor: 100 })
      .rows.find((r) => r.label === '8 in sch 40');
    const ero = gasErosionalAlongLine({
      inputs: short, idIn: row.idIn, p2Psia: row.p2Psia, cFactor: 100,
    });
    expect(rel(ero.ratio, ero.meanRatio)).toBeLessThan(0.05);
    expect(ero.exceeded).toBe(false);
  });

  test('the binding station is a feature of the line, not of the station count', () => {
    const row = sizeSweep({ mode: 'gas', inputs: duty, cFactor: 100 })
      .rows.find((r) => r.label === '8 in sch 80');
    const coarse = gasErosionalAlongLine({
      inputs: duty, idIn: row.idIn, p2Psia: row.p2Psia, cFactor: 100, stations: 6,
    });
    const fine = gasErosionalAlongLine({
      inputs: duty, idIn: row.idIn, p2Psia: row.p2Psia, cFactor: 100, stations: 48,
    });
    expect(rel(coarse.ratio, fine.ratio)).toBeLessThan(1e-6);
    expect(coarse.bindingAtFt).toBeCloseTo(fine.bindingAtFt, 6);
  });

  test('C scales the verdict without moving the station it is judged at', () => {
    const row = sizeSweep({ mode: 'gas', inputs: duty, cFactor: 100 })
      .rows.find((r) => r.label === '6 in sch 40');
    const strict = gasErosionalAlongLine({ inputs: duty, idIn: row.idIn, p2Psia: row.p2Psia, cFactor: 100 });
    const relaxed = gasErosionalAlongLine({ inputs: duty, idIn: row.idIn, p2Psia: row.p2Psia, cFactor: 175 });
    expect(relaxed.bindingAtFt).toBe(strict.bindingAtFt);
    expect(relaxed.bindingVFtS).toBeCloseTo(strict.bindingVFtS, 12);
    expect(relaxed.ratio).toBeCloseTo((strict.ratio * 100) / 175, 12);
  });

  test('a bore that cannot carry the rate still says so rather than being checked', () => {
    const row = sizeSweep({ mode: 'gas', inputs: duty, cFactor: 100 }).rows.find((r) => r.nps === 2);
    expect(row.pass).toBe(false);
    expect(row.note).toMatch(/cannot carry/);
  });
});
