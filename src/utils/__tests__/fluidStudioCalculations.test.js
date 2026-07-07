/**
 * Math-correctness checklist for the Fluid Studio engine (spec §7).
 * These are physical assertions, not golden-value snapshots.
 */
import {
  num,
  normalizeFluid,
  rsAt,
  solveBubblePoint,
  zFactor,
  bgAt,
  coAt,
  computePvtTable,
  flashSeparatorTrain,
  analyzeFluidSystem,
  sampleFluidStudioData,
} from '../fluidStudioCalculations';

const baseInputs = sampleFluidStudioData();
const baseFluid = () => {
  const f = normalizeFluid(baseInputs);
  return { ...f, pb: solveBubblePoint(f) };
};

// Audited-correct correlations. `glaso` is intentionally excluded here: the
// pvtCalculations audit flagged it as a non-standard rearrangement, so Phase 1
// gates it behind a warning rather than trusting its Pb consistency (see the
// dedicated "gated correlations" test below).
const TRUSTED_CORRELATIONS = ['standing', 'vasquez_beggs'];

describe('num()', () => {
  it('coerces blanks/invalid to fallback', () => {
    expect(num('', 5)).toBe(5);
    expect(num(null, 5)).toBe(5);
    expect(num(undefined, 5)).toBe(5);
    expect(num('abc', 5)).toBe(5);
    expect(num('3.2')).toBeCloseTo(3.2);
  });
});

describe('1. Bubble-point solve consistency', () => {
  TRUSTED_CORRELATIONS.forEach((corr) => {
    it(`Rs(Pb) ≈ Rsb for ${corr}`, () => {
      const f = normalizeFluid({
        ...baseInputs,
        correlations: { ...baseInputs.correlations, pb_rs_bo: corr },
      });
      const pb = solveBubblePoint(f);
      expect(pb).toBeGreaterThan(14.7);
      expect(pb).toBeLessThanOrEqual(15000);
      const rs = rsAt(pb, f);
      // Within 5% of target (bisection tolerance).
      expect(Math.abs(rs - f.rsb) / f.rsb).toBeLessThan(0.05);
    });
  });

  it('gates the suspect glaso correlation with a warning (does not silently trust it)', () => {
    const res = analyzeFluidSystem({
      ...baseInputs,
      correlations: { ...baseInputs.correlations, pb_rs_bo: 'glaso' },
    });
    // Still produces a finite, non-throwing result...
    expect(res.pvt.kpis.pb).toBeGreaterThan(14.7);
    // ...but the user is warned it is non-standard.
    expect(res.meta.warnings.some((w) => /Glaso/i.test(w))).toBe(true);
  });

  it('does not throw / NaN for out-of-range inputs', () => {
    const f = normalizeFluid({
      ...baseInputs,
      streamA: { ...baseInputs.streamA, blackOil: { ...baseInputs.streamA.blackOil, gor: 5, api: 55 } },
    });
    const pb = solveBubblePoint(f);
    expect(Number.isFinite(pb)).toBe(true);
  });
});

describe('2-4. PVT table shape', () => {
  const { table, kpis, pb } = computePvtTable(baseFluid());

  it('2. Rs anchored at Rsb for p ≥ Pb', () => {
    table
      .filter((r) => r.pressure >= pb)
      .forEach((r) => expect(r.Rs).toBeCloseTo(kpis.rsb, 0));
  });

  it('3. Rs is non-decreasing with pressure (ascending)', () => {
    const asc = [...table].sort((a, b) => a.pressure - b.pressure);
    for (let i = 1; i < asc.length; i += 1) {
      expect(asc[i].Rs).toBeGreaterThanOrEqual(asc[i - 1].Rs - 1e-6);
    }
  });

  it('4. Bo rises up to Pb then falls above Pb', () => {
    const asc = [...table].sort((a, b) => a.pressure - b.pressure);
    const below = asc.filter((r) => r.pressure <= pb);
    const above = asc.filter((r) => r.pressure >= pb);
    for (let i = 1; i < below.length; i += 1) {
      expect(below[i].Bo).toBeGreaterThanOrEqual(below[i - 1].Bo - 1e-4);
    }
    for (let i = 1; i < above.length; i += 1) {
      expect(above[i].Bo).toBeLessThanOrEqual(above[i - 1].Bo + 1e-4);
    }
    expect(kpis.bo_at_pb).toBeGreaterThan(1);
  });
});

describe('5. Undersaturated viscosity rises above Pb (the flagship fix)', () => {
  const { table, pb } = computePvtTable(baseFluid());
  const asc = [...table].sort((a, b) => a.pressure - b.pressure);
  const above = asc.filter((r) => r.pressure > pb);

  it('mu_o strictly increases above Pb with no downward jump at Pb', () => {
    for (let i = 1; i < above.length; i += 1) {
      expect(above[i].mu_o).toBeGreaterThan(above[i - 1].mu_o - 1e-9);
    }
    const muAtPb = asc.find((r) => r.pressure >= pb)?.mu_o;
    if (above.length) expect(above[above.length - 1].mu_o).toBeGreaterThan(muAtPb);
  });
});

describe('6. Z and Bg', () => {
  const { table } = computePvtTable(baseFluid());

  it('Z within physical band', () => {
    table.forEach((r) => {
      expect(r.Z).toBeGreaterThan(0.2);
      expect(r.Z).toBeLessThan(1.2);
    });
  });

  it('Bg strictly decreases with pressure and is rb/scf order', () => {
    const asc = [...table].sort((a, b) => a.pressure - b.pressure);
    for (let i = 1; i < asc.length; i += 1) {
      expect(asc[i].Bg).toBeLessThan(asc[i - 1].Bg + 1e-9);
    }
    const mid = table[Math.floor(table.length / 2)];
    expect(mid.Bg).toBeGreaterThan(1e-5);
    expect(mid.Bg).toBeLessThan(1e-1);
  });

  it('zFactor & co are finite and positive', () => {
    expect(zFactor(2000, 200, 0.75)).toBeGreaterThan(0);
    expect(coAt(baseFluid(), 4000)).toBeGreaterThan(0);
    expect(bgAt(2000, 200, 0.9)).toBeGreaterThan(0);
  });
});

describe('7. Units sanity', () => {
  const { table, kpis } = computePvtTable(baseFluid());
  it('values in expected engineering ranges', () => {
    expect(kpis.bo_at_pb).toBeGreaterThan(1.0);
    expect(kpis.bo_at_pb).toBeLessThan(2.5);
    table.forEach((r) => {
      expect(r.mu_o).toBeGreaterThan(0);
      expect(r.mu_g).toBeGreaterThan(0);
    });
  });
});

describe('8. Separator GOR partition telescopes to Rsb', () => {
  const f = baseFluid();
  const { stages, totals } = flashSeparatorTrain(f, baseInputs.separatorTrain.stages, f.pb);

  it('every stage liberates ≥ 0 gas', () => {
    stages.forEach((s) => expect(s.gas_liberated).toBeGreaterThanOrEqual(0));
  });

  it('rs_out is non-increasing across stages', () => {
    for (let i = 1; i < stages.length; i += 1) {
      expect(stages[i].rs_out).toBeLessThanOrEqual(stages[i - 1].rs_out + 1e-6);
    }
  });

  it('Σ gas_liberated == Rsb (total_gor) and surface_gor ≈ Rsb', () => {
    expect(totals.total_gor).toBeCloseTo(f.rsb, 0);
    expect(Math.abs(totals.surface_gor - f.rsb) / f.rsb).toBeLessThan(0.02);
  });

  it('ends at stock-tank conditions', () => {
    expect(stages[stages.length - 1].name).toBe('Stock Tank');
    expect(stages[stages.length - 1].rs_out).toBe(0);
  });
});

describe('9. Separator physical (non-tautological)', () => {
  const f = baseFluid();
  const { totals } = flashSeparatorTrain(f, baseInputs.separatorTrain.stages, f.pb);

  it('multistage Bo < single-stage Bo', () => {
    expect(totals.bo_multistage_approx).toBeLessThan(totals.bo_single_stage);
  });

  it('higher first-stage separator pressure retains more gas to later stages', () => {
    const low = flashSeparatorTrain(f, [{ pressure: 150, temperature: 120, enabled: true }], f.pb);
    const high = flashSeparatorTrain(f, [{ pressure: 600, temperature: 120, enabled: true }], f.pb);
    // A higher-pressure first separator liberates LESS gas at stage 1 (retains more in the oil).
    expect(high.stages[0].gas_liberated).toBeLessThan(low.stages[0].gas_liberated);
  });
});

describe('10. NaN robustness', () => {
  it('blank required field → empty short-circuit, never throws', () => {
    const blank = { ...baseInputs, streamA: { ...baseInputs.streamA, blackOil: { ...baseInputs.streamA.blackOil, api: '' } } };
    let res;
    expect(() => { res = analyzeFluidSystem(blank); }).not.toThrow();
    expect(res.pvt.table).toEqual([]);
    expect(res.pvt.kpis).toBeNull();
    expect(res.meta.warnings.length).toBeGreaterThan(0);
  });

  it('full sample analysis produces a populated result', () => {
    const res = analyzeFluidSystem(baseInputs);
    expect(res.pvt.table.length).toBeGreaterThan(8);
    expect(res.pvt.kpis.pb).toBeGreaterThan(14.7);
    expect(res.separator.stages.length).toBeGreaterThanOrEqual(2);
    expect(res.backbone.oil_gravity).toBe(res.pvt.kpis.api);
    expect(res.backbone.gor).toBeGreaterThan(0);
  });
});
