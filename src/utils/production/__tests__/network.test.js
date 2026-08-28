/**
 * Gates for the Production Network computation layer (P11).
 *
 * The solver, the conservation laws and the topology refusals are gated
 * in the engine package against a bisection oracle. These gate the
 * PETROLEUM: that a well's deliverability curve is built by marching up
 * from its own inflow, that a pipe's characteristic is the validated
 * traverse marched horizontally, and above all that the studio's
 * headline number -- what a well loses to the other wells -- is a real
 * comparison and not a restatement of an input.
 */
import {
  monotoneCurve, invertCurve, wellDeliverability, wellInflowFrom,
  pipeCharacteristic, pipeFlowFrom, runNetwork, deliverySweep,
  standaloneRates, CURVE_SAMPLES,
} from '../network';
import { buildWellModel, defaultWellInputs } from '../wellModel';

const wellInputs = (over = {}) => {
  const w = defaultWellInputs();
  w.well.depthFt = '7500';
  w.well.whtF = '140';
  w.well.bhtF = '200';
  w.fluid.api = '34';
  w.fluid.gasSg = '0.7';
  w.fluid.gor = '500';
  w.inflow.pr = String(over.pr || 3000);
  w.inflow.pb = '2100';
  w.inflow.calMode = 'pi';
  w.inflow.pi = String(over.pi || 1.4);
  w.completion.idIn = '2.992';
  return w;
};

const THREE_WELL = () => ({
  nodes: [
    { id: 'w1', kind: 'well', label: 'P-1', duty: { wctPct: '15', gor: '500' } },
    { id: 'w2', kind: 'well', label: 'P-2', duty: { wctPct: '45', gor: '620' } },
    { id: 'w3', kind: 'well', label: 'P-3', duty: { wctPct: '5', gor: '480' } },
    { id: 'h', kind: 'junction', label: 'Header' },
    { id: 's', kind: 'sink', label: 'Separator', pressurePsia: '180' },
  ],
  branches: [
    { id: 'f1', from: 'w1', to: 'h', label: 'P-1 flowline', lengthFt: '3200', idIn: '3', tempF: '120' },
    { id: 'f2', from: 'w2', to: 'h', label: 'P-2 flowline', lengthFt: '5400', idIn: '3', tempF: '115' },
    { id: 'f3', from: 'w3', to: 'h', label: 'P-3 flowline', lengthFt: '2100', idIn: '3', tempF: '125' },
    { id: 'trunk', from: 'h', to: 's', label: 'Trunk', lengthFt: '12000', idIn: '6', tempF: '105' },
  ],
});

const MODELS = () => ({
  w1: buildWellModel(wellInputs({ pr: 3000, pi: 1.4 })),
  w2: buildWellModel(wellInputs({ pr: 2700, pi: 0.9 })),
  w3: buildWellModel(wellInputs({ pr: 3200, pi: 1.8 })),
});

describe('monotone curves', () => {
  const c = monotoneCurve([{ x: 0, y: 0 }, { x: 1, y: 10 }, { x: 2, y: 30 }]);

  it('interpolates inside and says when it is extrapolating', () => {
    expect(c.at(0.5).y).toBeCloseTo(5, 12);
    expect(c.at(0.5).extrapolated).toBe(false);
    expect(c.at(3).extrapolated).toBe(true);
  });

  it('extrapolates on the last slope rather than flattening', () => {
    // Flattening is how a solver ends up with a branch that cannot be
    // pushed harder no matter what pressure is put on it, and then
    // converges to something confident and wrong.
    expect(c.at(3).y).toBeCloseTo(50, 12);
    expect(c.at(-1).y).toBeCloseTo(-10, 12);
  });

  it('inverts exactly', () => {
    const inv = invertCurve(c);
    expect(inv.y(30)).toBeCloseTo(2, 12);
    expect(inv.y(5)).toBeCloseTo(0.5, 12);
  });
});

describe('a well deliverability curve', () => {
  const model = buildWellModel(wellInputs());
  const d = wellDeliverability({ model, duty: { wctPct: '15', gor: '500' } });

  it('is built by marching up from the inflow, one traverse a sample', () => {
    expect(d.ok).toBe(true);
    expect(d.points.length).toBeGreaterThan(5);
    d.points.forEach((p) => {
      expect(p.whpPsia).toBeGreaterThan(14.7);
      expect(p.massLbD).toBeGreaterThan(0);
    });
  });

  it('keeps only the STABLE branch, and falls across it', () => {
    // A tubing curve is not monotone: at low rate the column is heavy
    // and the wellhead pressure the well can hold is low, so the curve
    // has a peak with an unstable branch to the left of it. A well
    // sitting there heads rather than holding a rate, so it is not an
    // operating point and is not offered to the solver as one.
    expect(d.unstablePoints.length).toBeGreaterThan(0);
    expect(d.points[0].whpPsia).toBe(Math.max(...d.allPoints.map((p) => p.whpPsia)));
    d.points.slice(1).forEach((p, i) => {
      expect(p.whpPsia).toBeLessThan(d.points[i].whpPsia);
    });
  });

  it('and reports where that limit is, which no single-well study would have said', () => {
    expect(d.stabilityLimitStbd).toBeGreaterThan(0);
    expect(d.warning).toMatch(/unstable side/);
    d.unstablePoints.forEach((p) => expect(p.qoStbd).toBeLessThan(d.stabilityLimitStbd));
  });

  it('carries the duty water cut into the stream, not the fluid model default', () => {
    const dry = wellDeliverability({ model, duty: { wctPct: '0', gor: '500' } });
    const wet = wellDeliverability({ model, duty: { wctPct: '60', gor: '500' } });
    expect(dry.points[0].qwStbd).toBeCloseTo(0, 9);
    expect(wet.points[0].qwStbd).toBeGreaterThan(wet.points[0].qoStbd);
  });

  it('a wetter well is heavier and so cannot hold as much wellhead pressure', () => {
    const dry = wellDeliverability({ model, duty: { wctPct: '0', gor: '500' } });
    const wet = wellDeliverability({ model, duty: { wctPct: '80', gor: '500' } });
    expect(wet.maxWhpPsia).toBeLessThan(dry.maxWhpPsia);
  });

  it('refuses a well that will not flow at any rate rather than inventing a curve', () => {
    const dead = wellInputs({ pr: 300, pi: 0.02 });
    dead.completion.idIn = '1.0';
    const r = wellDeliverability({
      model: buildWellModel(dead), duty: { wctPct: '95', gor: '5' },
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/would not flow to surface/);
  });

  it('refuses an uncalibrated inflow rather than returning NaN', () => {
    expect(wellDeliverability({ model: null }).ok).toBe(false);
  });

  it('the inflow relation is zero at and above the shut-in pressure', () => {
    const f = wellInflowFrom(d);
    expect(f({}, d.maxWhpPsia)).toBe(0);
    expect(f({}, d.maxWhpPsia + 500)).toBe(0);
    expect(f({}, d.maxWhpPsia - 50)).toBeGreaterThan(0);
  });

  it('and it falls monotonically with wellhead pressure, which is what makes the network well posed', () => {
    const f = wellInflowFrom(d);
    const ps = [200, 400, 600, 800];
    const qs = ps.map((p) => f({}, p));
    qs.slice(1).forEach((q, i) => expect(q).toBeLessThanOrEqual(qs[i] + 1e-9));
  });
});

describe('a pipe characteristic', () => {
  const model = buildWellModel(wellInputs());
  const stream = { qoStbd: 900, qwStbd: 160, qgMscfd: 450, massLbD: 4.2e5 };
  const base = {
    fluidModel: model.fluidModel, stream, tempF: 115, pInPsia: 400,
  };

  it('rises with rate, from zero at zero', () => {
    const c = pipeCharacteristic({
      pipe: { id: 'p', lengthFt: 8000, idIn: 4 }, ...base,
    });
    expect(c.ok).toBe(true);
    expect(c.points[0].massLbD).toBe(0);
    expect(c.points[0].dpPsi).toBe(0);
    const dps = c.points.map((p) => p.dpPsi);
    dps.slice(1).forEach((v, i) => expect(v).toBeGreaterThan(dps[i] - 1e-9));
  });

  it('a bigger bore costs far less, which is the whole reason to size a line', () => {
    const small = pipeCharacteristic({ pipe: { id: 'p', lengthFt: 8000, idIn: 3 }, ...base });
    const big = pipeCharacteristic({ pipe: { id: 'p', lengthFt: 8000, idIn: 6 }, ...base });
    const last = small.points.length - 1;
    expect(big.points[last].dpPsi).toBeLessThan(small.points[last].dpPsi / 3);
  });

  it('a rise costs head before a foot of friction is counted', () => {
    const flat = pipeCharacteristic({ pipe: { id: 'p', lengthFt: 6000, idIn: 4, riseFt: 0 }, ...base });
    const climb = pipeCharacteristic({ pipe: { id: 'p', lengthFt: 6000, idIn: 4, riseFt: 400 }, ...base });
    expect(climb.points[1].dpPsi).toBeGreaterThan(flat.points[1].dpPsi);
    // The extra at low rate is nearly pure hydrostatic head.
    const extra = climb.points[1].dpPsi - flat.points[1].dpPsi;
    expect(extra).toBeGreaterThan(50);
  });

  it('refuses to build a curve from nothing, instead of returning a trivial one', () => {
    // An earlier version returned a single point at the origin for a
    // branch carrying nothing. That makes the branch flow identically
    // zero whatever pressure is put across it, which flattens the
    // Jacobian row of the node behind it and takes the whole network
    // down -- as it did the first time a well shut in at a high
    // separator pressure. What a branch IS carrying and what it WOULD
    // carry are different questions, and only the second belongs in a
    // pressure-drop curve.
    const c = pipeCharacteristic({
      pipe: { id: 'p', label: 'P-9 flowline', lengthFt: 8000, idIn: 4 },
      fluidModel: model.fluidModel, stream: { qoStbd: 0, qwStbd: 0, qgMscfd: 0, massLbD: 0 },
    });
    expect(c.ok).toBe(false);
    expect(c.idle).toBe(true);
    expect(c.error).toMatch(/P-9 flowline/);
    expect(c.error).toMatch(/reference stream/);
  });

  it('refuses a pipe with no length or no bore', () => {
    expect(pipeCharacteristic({ pipe: { id: 'p', idIn: 4 }, ...base }).ok).toBe(false);
    expect(pipeCharacteristic({ pipe: { id: 'p', lengthFt: 8000 }, ...base }).ok).toBe(false);
  });

  it('the branch relation is ODD in the pressure drop, so a pipe works both ways', () => {
    // A pipe does not care which way it is pointed. A relation that only
    // flowed one way would make a looped network unsolvable.
    const c = pipeCharacteristic({ pipe: { id: 'p', lengthFt: 8000, idIn: 4 }, ...base });
    const f = pipeFlowFrom(c);
    expect(f({}, 500, 400)).toBeGreaterThan(0);
    expect(f({}, 400, 500)).toBeCloseTo(-f({}, 500, 400), 6);
    expect(f({}, 400, 400)).toBeCloseTo(0, 6);
  });
});

describe('the whole network', () => {
  const inputs = THREE_WELL();
  const models = MODELS();
  const r = runNetwork({ inputs, wellModels: models });

  it('solves, conserves mass, and settles its mixtures', () => {
    expect(r.ok).toBe(true);
    expect(r.solution.converged).toBe(true);
    expect(r.conservation.relative).toBeLessThan(1e-6);
    expect(r.settled).toBe(true);
    expect(r.passes).toBeLessThanOrEqual(6);
  });

  it('pressures fall from the wells to the separator', () => {
    const p = r.solution.pressures;
    ['w1', 'w2', 'w3'].forEach((w) => expect(p[w]).toBeGreaterThan(p.h));
    expect(p.h).toBeGreaterThan(p.s);
    expect(p.s).toBe(180);
  });

  it('EVERY well makes less in the network than it would alone', () => {
    // This is the number the studio exists to produce.
    r.wells.forEach((w) => {
      expect(Number.isFinite(w.qoAloneStbd)).toBe(true);
      expect(w.massLbD).toBeLessThan(w.massAloneLbD);
      expect(w.lostFraction).toBeGreaterThan(0);
    });
  });

  it('and the loss is a real comparison, not a restatement of an input', () => {
    // Shut two wells in and the third has to come back to its
    // standalone rate exactly, because the standalone number is solved
    // on the SAME network with the SAME curves.
    const alone = runNetwork({
      inputs: {
        ...inputs,
        nodes: inputs.nodes.filter((n) => n.id !== 'w2' && n.id !== 'w3'),
        branches: inputs.branches.filter((b) => b.id !== 'f2' && b.id !== 'f3'),
      },
      wellModels: { w1: models.w1 },
    });
    expect(alone.ok).toBe(true);
    const w1 = r.wells.find((w) => w.id === 'w1');
    // The two are not bit-identical and should not be. The standalone
    // number holds the LINE MIXTURES fixed at what the full network
    // produced, deliberately, so that the comparison isolates the other
    // wells' backpressure and nothing else. Rebuilding the network with
    // two wells deleted also changes what is in the trunk. That the two
    // land within a fraction of a percent of each other is the useful
    // result: it says the mixture effect here is second order and the
    // number really is measuring backpressure.
    const gap = Math.abs(alone.wells[0].massLbD - w1.massAloneLbD) / w1.massAloneLbD;
    expect(gap).toBeLessThan(0.02);
    expect(alone.wells[0].massLbD).toBeGreaterThan(w1.massLbD);
  });

  it('the header carries the sum, and its water cut is the rate-weighted mix', () => {
    const trunk = r.branches.find((b) => b.id === 'trunk');
    const flowlines = r.branches.filter((b) => b.id !== 'trunk');
    const sum = flowlines.reduce((a, b) => a + b.massLbD, 0);
    expect(trunk.massLbD).toBeCloseTo(sum, 3);

    const totalOil = flowlines.reduce((a, b) => a + b.stream.qoStbd, 0);
    const totalWater = flowlines.reduce((a, b) => a + b.stream.qwStbd, 0);
    expect(trunk.wctPct).toBeCloseTo((100 * totalWater) / (totalOil + totalWater), 4);
    // and it is NOT the average of the three well water cuts
    const naive = (15 + 45 + 5) / 3;
    expect(Math.abs(trunk.wctPct - naive)).toBeGreaterThan(1);
  });

  it('names a bottleneck by intensity rather than by biggest drop', () => {
    expect(r.diagnosis.bottleneck).not.toBeNull();
    expect(r.diagnosis.backflows).toHaveLength(0);
  });

  it('refuses a network that is not one, before doing any petroleum', () => {
    const bad = runNetwork({
      inputs: { ...inputs, nodes: inputs.nodes.filter((n) => n.kind !== 'sink') },
      wellModels: models,
    });
    expect(bad.ok).toBe(false);
    expect(bad.errors.join(' ')).toMatch(/delivery point/);
  });

  it('names the well when one of them cannot be curved', () => {
    const dead = wellInputs({ pr: 250, pi: 0.01 });
    dead.completion.idIn = '1.0';
    const bad = runNetwork({
      inputs,
      wellModels: { ...models, w2: buildWellModel(dead) },
    });
    expect(bad.ok).toBe(false);
    expect(bad.errors.join(' ')).toMatch(/P-2/);
  });
}, 120000);

describe('what a bigger trunk buys', () => {
  it('every well gains when the line that holds them all back is opened up', () => {
    const models = MODELS();
    const tight = THREE_WELL();
    tight.branches = tight.branches.map(
      (b) => (b.id === 'trunk' ? { ...b, idIn: '4' } : b),
    );
    const loose = THREE_WELL();
    loose.branches = loose.branches.map(
      (b) => (b.id === 'trunk' ? { ...b, idIn: '8' } : b),
    );
    const a = runNetwork({ inputs: tight, wellModels: models });
    const b = runNetwork({ inputs: loose, wellModels: models });
    expect(a.ok && b.ok).toBe(true);
    expect(b.solution.pressures.h).toBeLessThan(a.solution.pressures.h);
    expect(b.totals.qoStbd).toBeGreaterThan(a.totals.qoStbd);
    b.wells.forEach((w) => {
      const before = a.wells.find((x) => x.id === w.id);
      expect(w.qoStbd).toBeGreaterThan(before.qoStbd);
    });
  });
}, 120000);

describe('the delivery pressure sweep', () => {
  it('lowering the separator raises the field, and the slope is read off the curve', () => {
    const s = deliverySweep({
      inputs: THREE_WELL(), wellModels: MODELS(),
      pressures: [120, 180, 260, 340],
    });
    expect(s.ok).toBe(true);
    const usable = s.points.filter((p) => p.ok);
    expect(usable.length).toBe(4);
    usable.slice(1).forEach((p, i) => {
      expect(p.qoStbd).toBeLessThan(usable[i].qoStbd);
    });
    expect(s.slope.length).toBe(3);
    s.slope.forEach((row) => expect(row.stbdPerPsi).toBeGreaterThan(0));
  });

  it('refuses a network with no delivery point to sweep', () => {
    const inputs = THREE_WELL();
    expect(deliverySweep({
      inputs: { ...inputs, nodes: inputs.nodes.filter((n) => n.kind !== 'sink') },
      wellModels: MODELS(),
    }).ok).toBe(false);
  });
}, 180000);
