/**
 * Production P8 choke studio gates.
 *
 * The choke correlations are gated in the Suite's nodal layer (NA3) and
 * the wellhead limits in the engine package against an SI oracle. What
 * is gated here is the thing neither can do alone: putting the choke
 * into the nodal solve so a bean size becomes a rate on a real well,
 * and knowing where the correlation stops applying.
 */
import {
  BEAN_SIZES_64, CRITICAL_RATIO_LIMIT, solveChokedOil, solveChokedGas,
  operatingEnvelope, criticalBeanLimit, wellheadErosion, runChokeAnalysis,
  beanForRate, testsToChokePoints, CHOKE_COEFFS, fitGilbertCoefficients,
  erosionalC,
} from '../choke';
import { defaultWellInputs, buildWellModel } from '../wellModel';

const oilInputs = () => {
  const w = defaultWellInputs();
  w.inflow.pr = '3200';
  w.inflow.pb = '2200';
  w.inflow.pi = '1.5';
  w.fluid.gor = '600';
  return w;
};
const oilModel = () => buildWellModel(oilInputs());

const gasInputs = () => {
  const w = defaultWellInputs();
  w.well.phase = 'gas';
  w.well.depthFt = '8000';
  w.well.whtF = '90';
  w.well.bhtF = '210';
  w.inflow.pr = '2200';
  w.gasInflow = { ...w.gasInflow, model: 'backPressure', c: '0.0025', n: '0.87' };
  return w;
};
const gasModel = () => buildWellModel(gasInputs());

const oilArgs = { glr: 600, wct: 0.2, pDownstream: 150, correlation: 'gilbert' };

describe('the choke as a surface constraint on an oil well', () => {
  it('solves a bean to a rate on the real well', () => {
    const s = solveChokedOil({ model: oilModel(), s64: 32, ...oilArgs });
    expect(s.ok).toBe(true);
    expect(s.q).toBeGreaterThan(0);
    expect(s.pwh).toBeGreaterThan(oilArgs.pDownstream);
    expect(s.pwf).toBeGreaterThan(s.pwh);
    expect(s.critical).toBe(true);
  });

  it('a bigger bean makes more and holds less back', () => {
    const model = oilModel();
    const small = solveChokedOil({ model, s64: 16, ...oilArgs });
    const big = solveChokedOil({ model, s64: 48, ...oilArgs });
    expect(big.q).toBeGreaterThan(small.q);
    expect(big.pwh).toBeLessThan(small.pwh);
  });

  it('the operating point really is on both curves', () => {
    // The choke's wellhead pressure at the solved rate has to be the
    // wellhead pressure the solution reports. If it is not, the
    // residual was solved on something other than the physics.
    const s = solveChokedOil({ model: oilModel(), s64: 32, ...oilArgs });
    const { c, m, n } = CHOKE_COEFFS.gilbert;
    const fromCorrelation = (c * Math.pow(600, m) * s.q) / Math.pow(32, n);
    expect(Math.abs(fromCorrelation - s.pwh) / s.pwh).toBeLessThan(1e-6);
  });

  it('fitted coefficients override the published set', () => {
    const model = oilModel();
    const published = solveChokedOil({ model, s64: 32, ...oilArgs });
    // A leading constant twice Gilbert's holds twice the pressure back,
    // so the well makes less through the same bean.
    const fitted = solveChokedOil({
      model, s64: 32, ...oilArgs, coeffs: { c: 20, m: 0.546, n: 1.89 },
    });
    expect(fitted.q).toBeLessThan(published.q);
  });

  it('a bean that cannot produce an operating point is refused with a reason', () => {
    const s = solveChokedOil({ model: oilModel(), s64: 1, ...oilArgs });
    expect(s.ok).toBe(false);
    expect(s.reason).toMatch(/does not produce an operating point/);
  });
});

describe('the operating envelope, and where the correlation stops', () => {
  it('rate rises with bean size across the envelope', () => {
    const env = operatingEnvelope({
      model: oilModel(), beans: [16, 20, 24, 32, 40, 48], phase: 'oil', oil: oilArgs,
    });
    const solved = env.filter((e) => e.ok);
    expect(solved.length).toBeGreaterThan(4);
    for (let i = 1; i < solved.length; i += 1) {
      expect(solved[i].q).toBeGreaterThan(solved[i - 1].q);
    }
  });

  it('finds the bean at which the flow stops being critical', () => {
    // Past it the Gilbert family does not apply and the bean has
    // stopped controlling the well, so drawing the curve on as if
    // nothing changed would be the wrong answer confidently.
    const env = operatingEnvelope({
      model: oilModel(), beans: [16, 24, 32, 40, 48, 64], phase: 'oil', oil: oilArgs,
    });
    const limit = criticalBeanLimit(env);
    expect(limit).not.toBeNull();
    expect(limit.firstSubcriticalS64).toBeGreaterThan(limit.lastCriticalS64);
    const last = env.find((e) => e.s64 === limit.lastCriticalS64);
    const first = env.find((e) => e.s64 === limit.firstSubcriticalS64);
    expect(last.critical).toBe(true);
    expect(first.critical).toBe(false);
    expect(last.ratio).toBeLessThanOrEqual(CRITICAL_RATIO_LIMIT);
    expect(first.ratio).toBeGreaterThan(CRITICAL_RATIO_LIMIT);
  });

  it('a well with no subcritical bean in range reports no limit rather than inventing one', () => {
    const env = operatingEnvelope({
      model: oilModel(), beans: [16, 20, 24], phase: 'oil', oil: oilArgs,
    });
    expect(criticalBeanLimit(env)).toBeNull();
  });

  it('refused beans stay in the envelope with their reason', () => {
    const env = operatingEnvelope({
      model: oilModel(), beans: [1, 32], phase: 'oil', oil: oilArgs,
    });
    expect(env).toHaveLength(2);
    expect(env[0].ok).toBe(false);
    expect(env[0].reason).toBeTruthy();
    expect(env[1].ok).toBe(true);
  });

  it('BEAN_SIZES_64 covers the sizes a wellhead actually carries', () => {
    expect(BEAN_SIZES_64[0]).toBeLessThanOrEqual(8);
    expect(BEAN_SIZES_64[BEAN_SIZES_64.length - 1]).toBeGreaterThanOrEqual(64);
  });
});

describe('the choke on a gas well', () => {
  it('solves a bean to a rate, and reports the flow regime', () => {
    const s = solveChokedGas({
      model: gasModel(), beanIn: 16 / 64, pDownstream: 400, gasSg: 0.65,
    });
    expect(s.ok).toBe(true);
    expect(s.q).toBeGreaterThan(0);
    expect(s.pwh).toBeGreaterThan(400);
    expect(['sonic', 'subsonic']).toContain(s.regime);
    expect(s.critical).toBe(s.regime === 'sonic');
  });

  it('opening past sonic buys much less, which is the whole point of the regime', () => {
    // While sonic the bean sets the rate. Once subsonic the line
    // pressure does, and the curve flattens: a studio that drew it
    // straight on would promise production that is not there.
    const model = gasModel();
    const env = operatingEnvelope({
      model, beans: [12, 16, 20, 32, 48], phase: 'gas',
      gas: { pDownstream: 400, gasSg: 0.65 },
    });
    const solved = env.filter((e) => e.ok);
    const sonic = solved.filter((e) => e.regime === 'sonic');
    const subsonic = solved.filter((e) => e.regime === 'subsonic');
    expect(sonic.length).toBeGreaterThan(0);
    expect(subsonic.length).toBeGreaterThan(0);
    // rate still rises, but the gain per 64th collapses
    const sonicGain = (sonic[sonic.length - 1].q - sonic[0].q)
      / (sonic[sonic.length - 1].s64 - sonic[0].s64);
    const subGain = (subsonic[subsonic.length - 1].q - subsonic[0].q)
      / (subsonic[subsonic.length - 1].s64 - subsonic[0].s64);
    expect(subGain).toBeLessThan(sonicGain);
  });

  it('the gas cools across the bean, and colder at the smaller beans', () => {
    // Joule-Thomson cooling. It is the reason wellheads downstream of a
    // bean are where hydrates form.
    const model = gasModel();
    const small = solveChokedGas({ model, beanIn: 12 / 64, pDownstream: 400, gasSg: 0.65 });
    const big = solveChokedGas({ model, beanIn: 48 / 64, pDownstream: 400, gasSg: 0.65 });
    expect(small.tDownstreamF).toBeLessThan(big.tDownstreamF);
    expect(small.tDownstreamF).toBeLessThan(model.tAt(0));
  });
});

describe('the wellhead erosion check', () => {
  it('uses the fluid at wellhead conditions, not surface rates', () => {
    // A gassy stream at 200 psia is a different fluid from the same
    // stream at 2,000, and the erosional limit turns on its density.
    const model = oilModel();
    const s = solveChokedOil({ model, s64: 32, ...oilArgs });
    const e = wellheadErosion({
      model, q: s.q, wct: 0.2, glr: 600, pwh: s.pwh, cFactor: 100, idIn: 3,
    });
    expect(e.ok).toBe(true);
    expect(e.inSituBpd).toBeGreaterThan(s.q);   // gas and water add to it
    expect(e.mixtureDensityLbFt3).toBeGreaterThan(0);
    expect(e.mixtureDensityLbFt3).toBeLessThan(70);
    expect(e.maxRateBpd).toBeGreaterThan(0);
  });

  it('a narrower line runs faster and erodes sooner', () => {
    const model = oilModel();
    const s = solveChokedOil({ model, s64: 32, ...oilArgs });
    const wide = wellheadErosion({
      model, q: s.q, wct: 0.2, glr: 600, pwh: s.pwh, cFactor: 100, idIn: 4,
    });
    const narrow = wellheadErosion({
      model, q: s.q, wct: 0.2, glr: 600, pwh: s.pwh, cFactor: 100, idIn: 2,
    });
    expect(narrow.velocityFtS).toBeGreaterThan(wide.velocityFtS);
    expect(narrow.ratio).toBeGreaterThan(wide.ratio);
  });

  it('a higher C factor allows more, because RP 14E is conservative', () => {
    const model = oilModel();
    const s = solveChokedOil({ model, s64: 32, ...oilArgs });
    const strict = wellheadErosion({
      model, q: s.q, wct: 0.2, glr: 600, pwh: s.pwh, cFactor: 100, idIn: 2,
    });
    const relaxed = wellheadErosion({
      model, q: s.q, wct: 0.2, glr: 600, pwh: s.pwh, cFactor: 175, idIn: 2,
    });
    expect(relaxed.erosionalFtS).toBeGreaterThan(strict.erosionalFtS);
    expect(relaxed.ratio).toBeLessThan(strict.ratio);
    expect(erosionalC('cleanInhibited').c).toBe(175);
  });
});

describe('the analysis run', () => {
  const oilForm = (over = {}) => ({
    s64: '32', pDownstream: '150', flowlineIdIn: '3', cFactor: '100',
    glr: '600', wctPct: '20', correlation: 'gilbert', ...over,
  });

  it('runs the whole chain on an oil well', () => {
    const r = runChokeAnalysis({ form: oilForm(), model: oilModel() });
    expect(r.ok).toBe(true);
    expect(r.result.phase).toBe('oil');
    expect(r.result.solved.q).toBeGreaterThan(0);
    expect(r.result.erosion.ok).toBe(true);
    expect(r.result.hydrate).toBeNull();
  });

  it('warns when the flow is no longer critical', () => {
    const r = runChokeAnalysis({ form: oilForm({ s64: '80' }), model: oilModel() });
    expect(r.ok).toBe(true);
    expect(r.result.solved.critical).toBe(false);
    const w = r.result.warnings.find((x) => x.code === 'subcritical');
    expect(w).toBeDefined();
    expect(w.message).toMatch(/does not apply/);
  });

  it('warns when the flowline is over its erosional limit', () => {
    const r = runChokeAnalysis({ form: oilForm({ flowlineIdIn: '1', s64: '48' }), model: oilModel() });
    expect(r.ok).toBe(true);
    expect(r.result.erosion.exceeded).toBe(true);
    const w = r.result.warnings.find((x) => x.code === 'erosional');
    expect(w).toBeDefined();
    // and it says C is arguable rather than presenting it as physics
    expect(w.message).toMatch(/conservative/);
  });

  it('runs on a gas well, and screens for hydrate on the cooling', () => {
    const r = runChokeAnalysis({
      form: { s64: '20', pDownstream: '400', flowlineIdIn: '3', cFactor: '100', gasSg: '0.65' },
      model: gasModel(),
    });
    expect(r.ok).toBe(true);
    expect(r.result.phase).toBe('gas');
    expect(r.result.hydrate.ok).toBe(true);
    expect(r.result.hydrate.screening).toBe(true);
    expect(r.result.erosion).toBeNull();
  });

  it('refuses a missing number by name', () => {
    const r = runChokeAnalysis({ form: oilForm({ pDownstream: '' }), model: oilModel() });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/Downstream/);
  });

  it('refuses a bean that produces nothing, rather than a zero', () => {
    const r = runChokeAnalysis({ form: oilForm({ s64: '1' }), model: oilModel() });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/does not produce an operating point/);
  });
});

describe('sizing a bean for a target rate', () => {
  it('finds the bean whose operating point is the target', () => {
    const model = oilModel();
    const b = beanForRate({ model, targetQ: 1200, ...oilArgs });
    expect(b.ok).toBe(true);
    const check = solveChokedOil({ model, s64: b.s64, ...oilArgs });
    expect(Math.abs(check.q - 1200)).toBeLessThan(5);
  });

  it('a target the well cannot reach is refused, with why', () => {
    const b = beanForRate({ model: oilModel(), targetQ: 99999, ...oilArgs });
    expect(b.ok).toBe(false);
    expect(b.reason).toMatch(/above what the well can make|below what the smallest bean/);
  });
});

describe('fitting from the spine\'s own well tests', () => {
  const tests = [
    { id: 't1', test_date: '2025-01-01', is_valid: true, oil_rate_stbd: 400, water_rate_stbd: 100, gas_rate_mscfd: 300, choke_64ths: 32, thp_psia: 620, well: { name: 'P-1' } },
    { id: 't2', test_date: '2025-02-01', is_valid: true, oil_rate_stbd: 300, water_rate_stbd: 80, gas_rate_mscfd: 380, choke_64ths: 24, thp_psia: 700, well: { name: 'P-1' } },
    { id: 't3', test_date: '2025-03-01', is_valid: true, oil_rate_stbd: 520, water_rate_stbd: 130, gas_rate_mscfd: 260, choke_64ths: 48, thp_psia: 430, well: { name: 'P-1' } },
  ];

  it('shapes spine tests into fit points, deriving the gas-liquid ratio', () => {
    const pts = testsToChokePoints(tests);
    expect(pts).toHaveLength(3);
    // GLR is gas over LIQUID (oil plus water), not over oil
    expect(pts[0].glr).toBeCloseTo((300 * 1000) / 500, 6);
    expect(pts[0].q).toBe(500);
    expect(pts[0].s64).toBe(32);
    expect(pts[0].pwh).toBe(620);
  });

  it('drops tests that cannot be used, including invalid ones', () => {
    const pts = testsToChokePoints([
      ...tests,
      { id: 'x1', is_valid: false, oil_rate_stbd: 400, water_rate_stbd: 100, gas_rate_mscfd: 300, choke_64ths: 32, thp_psia: 620 },
      { id: 'x2', is_valid: true, oil_rate_stbd: 400, water_rate_stbd: 100, gas_rate_mscfd: 300, thp_psia: 620 },
      { id: 'x3', is_valid: true, oil_rate_stbd: 0, water_rate_stbd: 0, gas_rate_mscfd: 300, choke_64ths: 32, thp_psia: 620 },
    ]);
    expect(pts).toHaveLength(3);
  });

  it('the fit produces coefficients the correlation can be run with', () => {
    const pts = testsToChokePoints(tests);
    const f = fitGilbertCoefficients({ points: pts });
    expect(f.ok).toBe(true);
    expect(f.c).toBeGreaterThan(0);
    expect(f.residuals).toHaveLength(3);
    // and running the correlation with them reproduces the tests
    pts.forEach((p) => {
      const predicted = (f.c * Math.pow(p.glr, f.m) * p.q) / Math.pow(p.s64, f.n);
      expect(Math.abs(predicted - p.pwh) / p.pwh).toBeLessThan(0.02);
    });
  });
});
