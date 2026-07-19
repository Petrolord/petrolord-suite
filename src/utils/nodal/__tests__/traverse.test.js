/**
 * Gates for the NA2 marching traverse: step convergence, direction
 * round-trip, hydrostatic identity, VLP curve shape.
 */
import { buildFluidModel } from '../pvt.js';
import { buildTrajectory } from '../trajectory.js';
import { linearGeothermal } from '../temperature.js';
import { computeTraverse, bhpFromWhp, whpFromBhp, vlpCurve } from '../traverse.js';

const fluidModel = buildFluidModel({ api: 35, gasSg: 0.75, gor: 600, salinityPpm: 30000 });
const vertical = buildTrajectory({ mode: 'vertical', depthFt: 8000 });
const tAt = linearGeothermal({ whtF: 100, bhtF: 180, tvdMaxFt: 8000 });

const base = {
  fluidModel,
  trajectory: vertical,
  tAt,
  idIn: 2.441,
  correlation: 'beggsBrill',
};

describe('traverse marching', () => {
  test('halving the step barely moves the answer (second-order marcher)', () => {
    const opts = { ...base, rates: { qo: 800, wct: 0.2, gor: 600 }, whp: 250, nodeMd: 8000 };
    const coarse = bhpFromWhp({ ...opts, stepFt: 200 });
    const fine = bhpFromWhp({ ...opts, stepFt: 25 });
    expect(coarse.ok).toBe(true);
    expect(Math.abs(coarse.pEnd - fine.pEnd) / fine.pEnd).toBeLessThan(2e-3);
  });

  test('down-then-up round trip recovers the wellhead pressure', () => {
    const rates = { qo: 800, wct: 0.2, gor: 600 };
    const down = bhpFromWhp({ ...base, rates, whp: 250, nodeMd: 8000, stepFt: 50 });
    const up = whpFromBhp({ ...base, rates, bhp: down.pEnd, nodeMd: 8000, stepFt: 50 });
    expect(up.ok).toBe(true);
    expect(Math.abs(up.pEnd - 250)).toBeLessThan(1);
  });

  test('zero-rate vertical traverse is the hydrostatic oil column', () => {
    const res = bhpFromWhp({
      ...base,
      correlation: 'noSlip',
      rates: { qo: 0, wct: 0, gor: 600 },
      whp: 500,
      nodeMd: 8000,
      stepFt: 50,
    });
    // dead oil column ~ 0.3 psi/ft: sanity bracket plus zero friction
    const gradAvg = (res.pEnd - 500) / 8000;
    expect(gradAvg).toBeGreaterThan(0.25);
    expect(gradAvg).toBeLessThan(0.42);
    for (const pt of res.points) expect(pt.gradFric).toBe(0);
  });

  test('horizontal tail adds no hydrostatic head at zero rate', () => {
    const lWell = buildTrajectory({
      mode: 'deviated',
      survey: [
        { md: 0, inc: 0, azi: 0 },
        { md: 4000, inc: 0, azi: 0 },
        { md: 5000, inc: 90, azi: 0 },
        { md: 7000, inc: 90, azi: 0 },
      ],
    });
    const opts = {
      ...base,
      trajectory: lWell,
      correlation: 'noSlip',
      rates: { qo: 0, wct: 0, gor: 600 },
      whp: 500,
      stepFt: 50,
    };
    const heel = bhpFromWhp({ ...opts, nodeMd: 5000 });
    const toe = bhpFromWhp({ ...opts, nodeMd: 7000 });
    expect(Math.abs(toe.pEnd - heel.pEnd)).toBeLessThan(1e-6);
  });

  test('unliftable column marching up flags not sustainable', () => {
    const res = whpFromBhp({
      ...base,
      rates: { qo: 200, wct: 0.9, gor: 200 },
      bhp: 900, // far too low to lift 8000 ft of wet crude
      nodeMd: 8000,
      stepFt: 50,
    });
    expect(res.ok).toBe(false);
    expect(res.warnings[0]).toMatch(/not sustainable/);
  });

  test('explicit computeTraverse start/end pressures line up with points', () => {
    const res = computeTraverse({
      ...base,
      rates: { qo: 500, wct: 0, gor: 600 },
      pStart: 300,
      mdStart: 0,
      mdEnd: 4000,
      stepFt: 100,
    });
    expect(res.points[0].p).toBe(300);
    expect(res.points[res.points.length - 1].p).toBe(res.pEnd);
    expect(res.points[res.points.length - 1].md).toBe(4000);
  });
});

describe('VLP curve', () => {
  test('is friction-dominated (rising) at high rate and reports every point', () => {
    const qos = [100, 400, 800, 1500, 3000, 6000];
    const curve = vlpCurve({
      ...base,
      qos,
      rates: { wct: 0.2, gor: 600 },
      whp: 250,
      nodeMd: 8000,
      stepFt: 100,
    });
    expect(curve).toHaveLength(qos.length);
    // right branch: more rate needs more BHP
    expect(curve[5].bhp).toBeGreaterThan(curve[3].bhp);
    for (const pt of curve) expect(pt.bhp).toBeGreaterThan(250);
  });
});
