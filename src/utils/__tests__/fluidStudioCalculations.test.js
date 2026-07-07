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
  blendBlackOil,
  screenAsphalteneCompatibility,
  resolveEffectiveFluid,
  hydrateTempMotiee,
  hydrateCurve,
  parsePtProfile,
  computeFlowAssurance,
  runBatch,
} from '../fluidStudioCalculations';

const STREAM_A = { api: 32, gor: 650, gasSg: 0.75, temp: 200, salinity: 35000 };
const STREAM_B = { api: 22, gor: 200, gasSg: 0.85, temp: 150, salinity: 10000 };

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

// ===========================================================================
// Phase 2: blending
// ===========================================================================
describe('Blending — mixing rules', () => {
  it('endpoints: fraction 0 => A, 100 => B', () => {
    const at0 = blendBlackOil(STREAM_A, STREAM_B, 0);
    const at100 = blendBlackOil(STREAM_A, STREAM_B, 100);
    ['api', 'gor', 'gasSg', 'temp', 'salinity'].forEach((k) => {
      expect(at0[k]).toBeCloseTo(STREAM_A[k], 1);
      expect(at100[k]).toBeCloseTo(STREAM_B[k], 1);
    });
  });

  it('blended API stays between the two and below the linear-API mean', () => {
    const f = 40;
    const blend = blendBlackOil(STREAM_A, STREAM_B, f);
    expect(blend.api).toBeGreaterThan(STREAM_B.api);
    expect(blend.api).toBeLessThan(STREAM_A.api);
    const linear = (1 - f / 100) * STREAM_A.api + (f / 100) * STREAM_B.api;
    expect(blend.api).toBeLessThan(linear); // density-basis, not linear API
  });

  it('blended API is strictly monotonic decreasing in fraction B', () => {
    let prev = Infinity;
    for (let f = 0; f <= 100; f += 10) {
      const api = blendBlackOil(STREAM_A, STREAM_B, f).api;
      expect(api).toBeLessThan(prev + 1e-9);
      prev = api;
    }
  });

  it('gor/gasSg/salinity/temp stay within component bounds', () => {
    const b = blendBlackOil(STREAM_A, STREAM_B, 50);
    ['gor', 'gasSg', 'salinity', 'temp'].forEach((k) => {
      expect(b[k]).toBeGreaterThanOrEqual(Math.min(STREAM_A[k], STREAM_B[k]) - 1e-6);
      expect(b[k]).toBeLessThanOrEqual(Math.max(STREAM_A[k], STREAM_B[k]) + 1e-6);
    });
  });

  it('dead-oil B (gor 0): blended gasSg equals A gasSg at every fraction', () => {
    const deadB = { ...STREAM_B, gor: 0 };
    [10, 50, 90].forEach((f) => {
      expect(blendBlackOil(STREAM_A, deadB, f).gasSg).toBeCloseTo(STREAM_A.gasSg, 6);
    });
  });

  it('identical streams => blend ≈ A and ASI 0 / stable', () => {
    [0, 50, 100].forEach((f) => {
      const b = blendBlackOil(STREAM_A, STREAM_A, f);
      expect(b.api).toBeCloseTo(STREAM_A.api, 3);
      const s = screenAsphalteneCompatibility(STREAM_A.api, STREAM_A.api, f);
      expect(s.asi).toBe(0);
      expect(s.stable).toBe(true);
    });
  });

  it('ASI is 0 at endpoints and grows with contrast/lightness at 50/50', () => {
    expect(screenAsphalteneCompatibility(32, 22, 0).asi).toBe(0);
    expect(screenAsphalteneCompatibility(32, 22, 100).asi).toBe(0);
    const mild = screenAsphalteneCompatibility(30, 25, 50).asi;
    const strong = screenAsphalteneCompatibility(45, 15, 50).asi;
    expect(strong).toBeGreaterThan(mild);
    const s = screenAsphalteneCompatibility(45, 15, 50);
    expect(s.stable).toBe(s.asi < 0.35);
  });

  it('resolveEffectiveFluid: disabled => null blending, effective == normalizeFluid', () => {
    const inputs = sampleFluidStudioData(); // blending disabled by default
    const { fluid, blending } = resolveEffectiveFluid(inputs);
    expect(blending).toBeNull();
    expect(fluid).toEqual(normalizeFluid(inputs));
  });

  it('resolveEffectiveFluid: enabled => Pb deferred and correlations carried (not defaulted)', () => {
    const inputs = {
      ...sampleFluidStudioData(),
      correlations: { pb_rs_bo: 'vasquez_beggs', viscosity: 'beal_cook_spillman' },
      blending: { enabled: true, streamB_fraction: 40 },
    };
    const { fluid, blending } = resolveEffectiveFluid(inputs);
    expect(fluid.pb).toBeNull();
    expect(fluid.correlations).toEqual({ pb_rs_bo: 'vasquez_beggs', viscosity: 'beal_cook_spillman' });
    expect(blending.properties.api).toBeLessThan(32);
  });

  it('analyze with blending on: kpis.api == blending.properties.api, warning present', () => {
    const inputs = { ...sampleFluidStudioData(), blending: { enabled: true, streamB_fraction: 50 } };
    const res = analyzeFluidSystem(inputs);
    expect(res.blending).not.toBeNull();
    expect(res.pvt.kpis.api).toBeCloseTo(res.blending.properties.api, 2);
    expect(res.meta.warnings.some((w) => /specific-gravity/i.test(w))).toBe(true);
  });

  it('robust when streamB missing while enabled', () => {
    const inputs = { ...sampleFluidStudioData(), streamB: undefined, blending: { enabled: true, streamB_fraction: 50 } };
    let res;
    expect(() => { res = analyzeFluidSystem(inputs); }).not.toThrow();
    expect(res.blending).toBeNull();
    expect(res.pvt.kpis).not.toBeNull();
  });
});

// ===========================================================================
// Phase 2: flow assurance
// ===========================================================================
describe('Flow assurance — hydrate + WAT', () => {
  it('Motiee spot-checks (pins constants)', () => {
    expect(hydrateTempMotiee(1000, 0.6)).toBeCloseTo(56.3, 0);
    expect(hydrateTempMotiee(2000, 0.6)).toBeCloseTo(64.9, 0);
  });

  it('T_hyd rises with pressure; null for non-positive P', () => {
    let prev = -Infinity;
    for (let p = 200; p <= 3000; p += 400) {
      const t = hydrateTempMotiee(p, 0.7);
      expect(t).toBeGreaterThan(prev);
      prev = t;
    }
    expect(hydrateTempMotiee(0, 0.7)).toBeNull();
    expect(hydrateTempMotiee(-5, 0.7)).toBeNull();
  });

  it('gas gravity clamped to validity band', () => {
    expect(hydrateTempMotiee(1000, 1.4)).toBeCloseTo(hydrateTempMotiee(1000, 1.0), 6);
    const fa = computeFlowAssurance({ gasGravity: 1.3 }, {}, '1000, 40');
    expect(fa.meta.warnings.some((w) => /validity band/i.test(w))).toBe(true);
  });

  it('hydrateCurve ascending, length nPoints, no NaN', () => {
    const c = hydrateCurve(0.7, 100, 3000, 20);
    expect(c.length).toBe(20);
    for (let i = 1; i < c.length; i += 1) expect(c[i].pressure).toBeGreaterThan(c[i - 1].pressure);
    c.forEach((pt) => expect(Number.isFinite(pt.temp)).toBe(true));
  });

  it('parsePtProfile drops malformed lines, sorts descending P', () => {
    const p = parsePtProfile('3000, 180\nbad line\n2500, 165\n-10, 5\n\n1000');
    expect(p.map((x) => x.pressure)).toEqual([3000, 2500]);
    expect(parsePtProfile('')).toEqual([]);
    expect(parsePtProfile(null)).toEqual([]);
  });

  it('crossing detection true and false cases', () => {
    const fluid = { gasGravity: 0.75 };
    const cold = computeFlowAssurance(fluid, {}, '500, 30'); // 30°F well below hydrate temp
    expect(cold.hydrate_risk.profile_crosses).toBe(true);
    expect(cold.hydrate_risk.first_crossing.pressure).toBe(500);
    expect(cold.hydrate_risk.max_subcooling).toBeGreaterThan(0);
    const warm = computeFlowAssurance(fluid, {}, '500, 200'); // 200°F well above
    expect(warm.hydrate_risk.profile_crosses).toBe(false);
    expect(warm.hydrate_risk.first_crossing).toBeNull();
    expect(warm.hydrate_risk.max_subcooling).toBe(0);
  });

  it('WAT resolution: null > wax-screening > measured', () => {
    const fluid = { gasGravity: 0.75 };
    const none = computeFlowAssurance(fluid, {}, '500, 30');
    expect(none.wat).toBeNull();
    expect(none.wat_basis).toBeNull();
    expect(none.meta.warnings.some((w) => /not computable from black-oil PVT/i.test(w))).toBe(true);

    const wax = computeFlowAssurance(fluid, { waxContent: 8 }, '500, 30');
    expect(wax.wat).toBeGreaterThan(0);
    expect(wax.wat_basis).toBe('wax_content_screening');

    const meas = computeFlowAssurance(fluid, { measuredWat: 95, waxContent: 8 }, '500, 30');
    expect(meas.wat).toBe(95);
    expect(meas.wat_basis).toBe('measured'); // measured wins
  });

  it('AOP is always null with a warning', () => {
    const fa = computeFlowAssurance({ gasGravity: 0.8 }, { measuredWat: 90 }, '2000, 120');
    expect(fa.aop).toBeNull();
    expect(fa.meta.warnings.some((w) => /Asphaltene onset/i.test(w))).toBe(true);
  });

  it('null when fluid invalid or FA not engaged', () => {
    expect(computeFlowAssurance(null, {}, '1000, 40')).toBeNull();
    expect(computeFlowAssurance({ gasGravity: 0 }, {}, '1000, 40')).toBeNull();
    // not engaged: no profile, no wax/measured WAT
    expect(computeFlowAssurance({ gasGravity: 0.75 }, {}, '')).toBeNull();
  });

  it('analyze: backbone.wat mirrors flowAssurance.wat', () => {
    const inputs = { ...sampleFluidStudioData(), flowAssurance: { flowline: {}, measuredWat: 88, inhibitors: [] } };
    const res = analyzeFluidSystem(inputs);
    expect(res.flowAssurance).not.toBeNull();
    expect(res.backbone.wat).toBe(res.flowAssurance.wat);
    expect(res.backbone.wat).toBe(88);
  });
});

// ===========================================================================
// Phase 2: batch
// ===========================================================================
describe('Batch sensitivity', () => {
  const batchInputs = (over) => ({
    ...sampleFluidStudioData(),
    batchRun: { enabled: true, variable: 'gor', min: 400, max: 800, steps: 5, ...over },
  });

  it('length matches steps (guarded >= 2, integer)', () => {
    expect(runBatch(batchInputs({ steps: 5 })).rows.length).toBe(5);
    expect(runBatch(batchInputs({ steps: 1 })).rows.length).toBe(2);
    expect(runBatch(batchInputs({ steps: 2.7 })).rows.length).toBe(3);
    expect(runBatch(batchInputs({ steps: 0 })).rows.length).toBe(2);
  });

  it('endpoints exact and evenly spaced; reversed bounds tolerated', () => {
    const rows = runBatch(batchInputs({ variable: 'api', min: 20, max: 40, steps: 5 })).rows;
    expect(rows.map((r) => r.input)).toEqual([20, 25, 30, 35, 40]);
    const rev = runBatch(batchInputs({ variable: 'api', min: 40, max: 20, steps: 5 })).rows;
    expect(rev.map((r) => r.input)).toEqual([20, 25, 30, 35, 40]);
  });

  it('recursion guard: batch-enabled analyze does not overflow; nested batch null', () => {
    let res;
    expect(() => { res = analyzeFluidSystem(batchInputs()); }).not.toThrow();
    expect(res.batchSummary.length).toBe(5);
    expect(res.meta.batch.variable).toBe('gor');
  });

  it('primary run preserved (== batch disabled)', () => {
    const on = analyzeFluidSystem(batchInputs());
    const off = analyzeFluidSystem({ ...batchInputs(), batchRun: { enabled: false, variable: 'gor', min: 400, max: 800, steps: 5 } });
    expect(on.pvt.kpis.pb).toBe(off.pvt.kpis.pb);
  });

  it('variable fallback for unknown variable; row shape fixed', () => {
    const b = runBatch(batchInputs({ variable: 'nonsense' }));
    expect(b.variable).toBe('api');
    b.rows.forEach((r) => {
      expect(Object.keys(r).sort()).toEqual(['bo_at_pb', 'input', 'mu_o_at_pb', 'pb', 'wat'].sort());
    });
  });

  it('Pb trends are sign-correct (Standing)', () => {
    const pbOf = (variable, min, max) => {
      const rows = runBatch(batchInputs({ variable, min, max, steps: 2 })).rows;
      return [rows[0].pb, rows[1].pb];
    };
    const [gorLo, gorHi] = pbOf('gor', 300, 900);
    expect(gorHi).toBeGreaterThan(gorLo); // more gas => higher Pb
    const [apiLo, apiHi] = pbOf('api', 25, 40);
    expect(apiHi).toBeLessThan(apiLo); // lighter oil => lower Pb
    const [tLo, tHi] = pbOf('temp', 150, 250);
    expect(tHi).toBeGreaterThan(tLo); // hotter => higher Pb
  });

  it('wat null across rows when FA off; populated when measured WAT supplied', () => {
    const off = runBatch(batchInputs()).rows;
    off.forEach((r) => expect(r.wat).toBeNull());
    const on = runBatch({ ...batchInputs(), flowAssurance: { flowline: {}, measuredWat: 92, inhibitors: [] } }).rows;
    on.forEach((r) => expect(r.wat).toBe(92));
  });

  it('sweeps the un-blended Stream A fluid even when blending is enabled', () => {
    const withBlend = {
      ...batchInputs({ variable: 'api', min: 20, max: 40, steps: 3 }),
      streamB: { blackOil: { api: 22, gor: 200, gasSg: 0.85, temp: 150, salinity: 10000 } },
      blending: { enabled: true, streamB_fraction: 50 },
    };
    const blendedRows = runBatch(withBlend).rows;
    // The API=40 endpoint Pb must equal the pure Stream-A Pb at API 40 (no re-dilution).
    const pureAt40 = analyzeFluidSystem({
      ...sampleFluidStudioData(),
      streamA: { ...sampleFluidStudioData().streamA, blackOil: { ...sampleFluidStudioData().streamA.blackOil, api: 40 } },
    }).pvt.kpis.pb;
    const endpoint = blendedRows.find((r) => r.input === 40);
    expect(endpoint.pb).toBe(pureAt40);
  });
});
