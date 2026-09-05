/**
 * Production P7 gas-well studio gates. The droplet balance, the loading
 * profile and the plunger force balance are gated in the engine package
 * against an SI oracle; what is gated here is the Suite layer -- the
 * gas inflow on the shared record, the marched column, the loading
 * check against a real traverse, the forecast that says WHEN a well
 * loads, and the refusals.
 */
import {
  TUBING_CANDIDATES_IN, flowingProfile, deliverability, runGasWellAnalysis,
  loadingForecast, tubingOptions, plungerScreen, largestSlug,
} from '../gasWell';
import { defaultWellInputs, buildWellModel, buildGasIpr, wellPhaseProblem } from '../wellModel';

const gasInputs = () => {
  const w = defaultWellInputs();
  w.well.phase = 'gas';
  w.well.depthFt = '8000';
  w.well.whtF = '90';
  w.well.bhtF = '210';
  w.fluid.gasSg = '0.65';
  w.inflow.pr = '2200';
  w.gasInflow = { ...w.gasInflow, model: 'backPressure', c: '0.0025', n: '0.87' };
  w.completion.idIn = '2.441';
  return w;
};
const gasModel = () => buildWellModel(gasInputs());
const form = (over = {}) => ({
  whp: '400', gasSg: '0.65', sigmaDyneCm: '60', rhoLiquidLbFt3: '67',
  correlation: 'auto', ...over,
});

describe('the shared record carries a phase and a gas inflow', () => {
  it('builds a gas IPR for a gas well and no oil IPR', () => {
    const m = gasModel();
    expect(m.phase).toBe('gas');
    // The gas IPR results do not carry the reservoir pressure, so the
    // model does: a consumer showing a drawdown has nowhere else to
    // get it from.
    expect(m.prPsia).toBe(2200);
    expect(m.ipr).toBeNull();
    expect(m.gasIpr.aof).toBeGreaterThan(0);
    expect(m.gasIpr.curve.length).toBeGreaterThan(10);
  });

  it('an oil record keeps its oil IPR and builds no gas one', () => {
    const m = buildWellModel(defaultWellInputs());
    expect(m.phase).toBe('oil');
    expect(m.ipr.qmax).toBeGreaterThan(0);
    expect(m.gasIpr).toBeNull();
  });

  it('switching phase does not lose the other inflow', () => {
    // The record carries both sections, so a well re-described later
    // still has what was already entered.
    const inputs = gasInputs();
    expect(inputs.inflow.pi).toBe(defaultWellInputs().inflow.pi);
    expect(inputs.gasInflow.c).toBe('0.0025');
  });

  it('all three gas inflow routes build', () => {
    const bp = buildGasIpr(gasInputs());
    expect(bp.aof).toBeGreaterThan(0);
    const lit = gasInputs();
    lit.gasInflow = { ...lit.gasInflow, model: 'lit', a: '900', b: '0.5' };
    expect(buildGasIpr(lit).aof).toBeGreaterThan(0);
    const darcy = gasInputs();
    darcy.gasInflow = {
      ...darcy.gasInflow, model: 'darcy', k: '5', h: '40', re: '1500', rw: '0.35', skin: '0',
    };
    expect(buildGasIpr(darcy).aof).toBeGreaterThan(0);
  });

  it('a record with no reservoir pressure builds no gas inflow', () => {
    const inputs = gasInputs();
    inputs.inflow.pr = '';
    expect(buildGasIpr(inputs)).toBeNull();
    expect(buildWellModel(inputs)).toBeNull();
  });

  it('the phase mismatch gives a studio a sentence to show', () => {
    const gas = gasModel();
    expect(wellPhaseProblem(gas, 'gas')).toBeNull();
    expect(wellPhaseProblem(gas, 'oil')).toMatch(/described as a gas well/);
    expect(wellPhaseProblem(buildWellModel(defaultWellInputs()), 'gas'))
      .toMatch(/described as an oil well/);
    expect(wellPhaseProblem(null, 'gas')).toBeNull();
  });
});

describe('the marched gas column', () => {
  it('pressure rises with depth and every station carries its conditions', () => {
    const m = gasModel();
    const p = flowingProfile({ model: m, qMscfd: 1500, whp: 400, nStations: 9 });
    expect(p.ok).toBe(true);
    expect(p.stations).toHaveLength(9);
    expect(p.stations[0].pPsia).toBe(400);
    expect(p.stations[8].pPsia).toBeGreaterThan(400);
    expect(p.pwf).toBeCloseTo(p.stations[8].pPsia, 6);
    p.stations.forEach((s) => {
      expect(s.tempR).toBeGreaterThan(400);
      expect(s.z).toBeGreaterThan(0.5);
      expect(s.z).toBeLessThan(1.3);
      expect(s.idIn).toBeCloseTo(2.441, 9);
    });
    // temperature runs from wellhead to bottomhole
    expect(p.stations[0].tempF).toBeCloseTo(90, 6);
    expect(p.stations[8].tempF).toBeCloseTo(210, 6);
  });

  it('a higher rate costs more friction, so the bottomhole pressure is higher', () => {
    const m = gasModel();
    const slow = flowingProfile({ model: m, qMscfd: 500, whp: 400 });
    const fast = flowingProfile({ model: m, qMscfd: 4000, whp: 400 });
    expect(fast.pwf).toBeGreaterThan(slow.pwf);
  });
});

describe('deliverability', () => {
  it('the node solves and sits inside the inflow', () => {
    const m = gasModel();
    const solved = deliverability({ model: m, whp: 400, gasSg: 0.65 });
    expect(solved.op).not.toBeNull();
    expect(solved.op.q).toBeGreaterThan(0);
    expect(solved.op.q).toBeLessThan(m.gasIpr.aof);
    expect(solved.op.pwf).toBeLessThan(m.prPsia);
  });

  it('a higher wellhead pressure delivers less', () => {
    const m = gasModel();
    const low = deliverability({ model: m, whp: 300, gasSg: 0.65 });
    const high = deliverability({ model: m, whp: 900, gasSg: 0.65 });
    expect(high.op.q).toBeLessThan(low.op.q);
  });
});

describe('the analysis run', () => {
  it('runs the whole chain on the default gas well', () => {
    const r = runGasWellAnalysis({ form: form(), model: gasModel() });
    expect(r.ok).toBe(true);
    const x = r.result;
    expect(x.qMscfd).toBeGreaterThan(0);
    expect(x.loading.points.length).toBeGreaterThan(4);
    expect(x.loading.controlling).toBeDefined();
    expect(Number.isFinite(x.loading.marginPct)).toBe(true);
  });

  it('the CONTROLLING station is the deepest, not the wellhead', () => {
    // Critical rate goes as roughly the square root of pressure, so the
    // shoe decides. A studio that checked the wellhead would pass wells
    // that are loading where the liquid actually collects.
    const r = runGasWellAnalysis({ form: form(), model: gasModel() });
    const pts = r.result.loading.points;
    expect(r.result.loading.controlling.depthFt).toBe(pts[pts.length - 1].depthFt);
    expect(pts[pts.length - 1].criticalRateMscfd)
      .toBeGreaterThan(pts[0].criticalRateMscfd);
  });

  it('picks the correlation by wellhead pressure when asked to', () => {
    const low = runGasWellAnalysis({ form: form({ whp: '400' }), model: gasModel() });
    expect(low.result.correlation).toBe('coleman');
    const high = runGasWellAnalysis({ form: form({ whp: '1500' }), model: gasModel() });
    expect(high.result.correlation).toBe('turner');
    // and reports it when the choice disagrees with the guidance
    const forced = runGasWellAnalysis({ form: form({ whp: '400', correlation: 'turner' }), model: gasModel() });
    expect(forced.result.correlation).toBe('turner');
    expect(forced.result.warnings.map((w) => w.code)).toContain('correlationChoice');
  });

  it('condensate loads at a lower rate than water on the same well', () => {
    const water = runGasWellAnalysis({ form: form(), model: gasModel() });
    const cond = runGasWellAnalysis({
      form: form({ sigmaDyneCm: '20', rhoLiquidLbFt3: '45' }), model: gasModel(),
    });
    expect(cond.result.loading.controlling.criticalRateMscfd)
      .toBeLessThan(water.result.loading.controlling.criticalRateMscfd);
  });

  it('flags a well that is loading, and one that has little margin left', () => {
    // A big string at a low rate: the classic loaded gas well.
    const inputs = gasInputs();
    inputs.completion.idIn = '3.958';
    inputs.gasInflow.c = '0.0004';
    const r = runGasWellAnalysis({ form: form(), model: buildWellModel(inputs) });
    expect(r.ok).toBe(true);
    expect(r.result.loading.loaded).toBe(true);
    expect(r.result.warnings.map((w) => w.code)).toContain('loading');
  });

  it('refuses an oil-phase record rather than running a gas inflow on it', () => {
    const r = runGasWellAnalysis({ form: form(), model: buildWellModel(defaultWellInputs()) });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/described as an oil well/);
  });

  it('refuses a missing number by name', () => {
    const r = runGasWellAnalysis({ form: form({ whp: '' }), model: gasModel() });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/Wellhead pressure/);
  });

  it('a well that cannot flow at that wellhead pressure is reported, not given a rate', () => {
    const r = runGasWellAnalysis({ form: form({ whp: '2400' }), model: gasModel() });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/does not flow at all/);
  });
});

describe('the loading forecast', () => {
  it('finds the reservoir pressure at which the well starts to load', () => {
    // The point of the studio: deliverability falls faster than the
    // critical rate as the reservoir depletes, and the crossing is what
    // a tubing change or a plunger gets justified against.
    const inputs = gasInputs();
    const model = buildWellModel(inputs);
    const f = loadingForecast({
      model, inputs, whp: 400, gasSg: 0.65, sigmaDyneCm: 60, rhoLiquidLbFt3: 67,
      correlation: 'coleman', prFrom: 2200, prTo: 900, nPoints: 7,
    });
    expect(f.ok).toBe(true);
    expect(f.points).toHaveLength(7);
    expect(f.crossingPrPsia).toBeGreaterThan(900);
    expect(f.crossingPrPsia).toBeLessThan(2200);
    // rate falls monotonically as the reservoir depletes
    const rates = f.points.map((p) => p.qMscfd);
    for (let i = 1; i < rates.length; i += 1) expect(rates[i]).toBeLessThan(rates[i - 1]);
    // and the well is unloaded above the crossing and loaded below it
    const above = f.points.find((p) => p.prPsia > f.crossingPrPsia);
    const below = f.points.filter((p) => p.prPsia < f.crossingPrPsia).pop();
    expect(above.loaded).toBe(false);
    expect(below.loaded).toBe(true);
  });

  it('the deliverability coefficients are held: this is a depletion, not a different well', () => {
    const inputs = gasInputs();
    const model = buildWellModel(inputs);
    const f = loadingForecast({
      model, inputs, whp: 400, gasSg: 0.65, sigmaDyneCm: 60, rhoLiquidLbFt3: 67,
      correlation: 'coleman', prFrom: 2200, prTo: 2200, nPoints: 2,
    });
    // At today's reservoir pressure the forecast reproduces today's rate.
    const today = runGasWellAnalysis({ form: form(), model });
    expect(Math.abs(f.points[0].qMscfd - today.result.qMscfd) / today.result.qMscfd)
      .toBeLessThan(0.01);
  });

  it('a pressure at which the well no longer flows is reported, not dropped', () => {
    const inputs = gasInputs();
    const model = buildWellModel(inputs);
    const f = loadingForecast({
      model, inputs, whp: 400, gasSg: 0.65, sigmaDyneCm: 60, rhoLiquidLbFt3: 67,
      correlation: 'coleman', prFrom: 600, prTo: 300, nPoints: 3,
    });
    expect(f.points.some((p) => p.reason)).toBe(true);
  });
}, 120000);

describe('tubing screening', () => {
  it('smaller strings carry liquid at lower rates, and the largest that works is named', () => {
    const r = runGasWellAnalysis({ form: form(), model: gasModel() });
    const t = tubingOptions({
      result: r.result, sigmaDyneCm: 60, rhoLiquidLbFt3: 67,
      correlation: r.result.correlation, gasSg: 0.65,
    });
    const rates = t.rows.map((x) => x.criticalRateMscfd);
    for (let i = 1; i < rates.length; i += 1) expect(rates[i]).toBeLessThan(rates[i - 1]);
    expect(TUBING_CANDIDATES_IN.length).toBeGreaterThan(4);
    if (t.largestUnloaded) expect(t.largestUnloaded.ratio).toBeGreaterThanOrEqual(1);
  });
});

describe('plunger screening on this well', () => {
  const plungerForm = {
    casingPressurePsia: '900', linePressurePsia: '400', slugLengthFt: '150',
    liquidSg: '1.02', plungerWeightLb: '6', wellGlrScfBbl: '20000',
    frictionPsi: '0', afterflowMin: '20', shutInMin: '30',
  };

  it('uses the well\'s own depth, tubing and column temperatures', () => {
    const model = gasModel();
    const r = runGasWellAnalysis({ form: form(), model });
    const p = plungerScreen({ model, result: r.result, form: plungerForm });
    expect(p.ok).toBe(true);
    // rise time is the well's depth over the rise velocity
    expect(p.design.timing.riseMin).toBeCloseTo(model.tvdMax / 750, 6);
    expect(p.design.requiredGlrScfBbl).toBeGreaterThan(0);
    expect(p.design.ruleOfThumbGlrScfBbl).toBeCloseTo(400 * (model.tvdMax / 1000), 6);
  });

  it('the longest slug the casing pressure could lift is bounded by the well', () => {
    const model = gasModel();
    const r = runGasWellAnalysis({ form: form(), model });
    const max = largestSlug({ model, result: r.result, form: plungerForm });
    expect(max.ok).toBe(true);
    expect(max.ft).toBeGreaterThan(0);
    expect(max.ft).toBeLessThanOrEqual(model.tvdMax);
    // item 34: a casing pressure that cannot lift a bare plunger is a
    // refusal with a reason, not a slug of zero feet
    const none = largestSlug({
      model, result: r.result, form: { ...plungerForm, casingPressurePsia: '200' },
    });
    expect(none.ok).toBe(false);
    expect(none.ft).toBeNull();
    expect(none.reason).toMatch(/no slug this well can lift/);
  });
});
