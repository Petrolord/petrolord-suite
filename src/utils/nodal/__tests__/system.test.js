/**
 * NA3 operating-point gates. Closed-form cases hit solveNodeCore (the
 * exact production solver) with analytic IPR/VLP functions; full-stack
 * cases check self-consistency of the wired solve.
 */
import { solveNodeCore, solveOperatingPoint, solveGasOperatingPoint, gasPwfAtRate, operatingPointSweep } from '../system.js';
import { computeIpr, rateAtPwf } from '../ipr.js';
import { backPressureIpr } from '../iprGas.js';
import { buildFluidModel } from '../pvt.js';
import { buildTrajectory } from '../trajectory.js';
import { linearGeothermal } from '../temperature.js';
import { bhpFromWhp } from '../traverse.js';
import { cullenderSmithBhp } from '../cullenderSmith.js';

describe('solveNodeCore closed forms', () => {
  test('linear IPR x linear VLP intersects at the exact algebraic root', () => {
    // pwf = pr - q/J ; bhp = a + b q  =>  q* = (pr - a)/(b + 1/J)
    const pr = 3000;
    const J = 1.5;
    const a = 900;
    const b = 0.4;
    const res = solveNodeCore({
      iprPwfAt: (q) => pr - q / J,
      vlpBhpAt: (q) => a + b * q,
      qMax: pr * J,
    });
    const qExact = (pr - a) / (b + 1 / J);
    expect(res.status).toBe('flowing');
    expect(res.op.q).toBeCloseTo(qExact, 4);
    expect(res.op.pwf).toBeCloseTo(pr - qExact / J, 4);
    expect(res.intersections).toHaveLength(1);
  });

  test('Vogel IPR x constant-pressure outflow recovers the Vogel identity', () => {
    const qmax = 1000;
    const pr = 2000;
    const target = 1200; // constant node pressure
    const r = target / pr;
    const qExact = qmax * (1 - 0.2 * r - 0.8 * r * r);
    const ipr = computeIpr({ model: 'vogel', pr, qmax });
    const res = solveNodeCore({
      iprPwfAt: (q) => {
        // invert Vogel via the engine's own inverse
        return q <= 0 ? pr : q >= qmax ? 0 : pr * ((-0.2 + Math.sqrt(0.04 + 3.2 * (1 - q / qmax))) / 1.6);
      },
      vlpBhpAt: () => target,
      qMax: qmax,
    });
    expect(res.status).toBe('flowing');
    expect(res.op.q).toBeCloseTo(qExact, 3);
    expect(rateAtPwf(ipr, target)).toBeCloseTo(qExact, 8);
  });

  test('J-curve VLP: two crossings, left unstable, right stable, op = right', () => {
    // vlp falls then rises; linear IPR crosses both branches
    const pr = 3000;
    const J = 2;
    const vlp = (q) => 3200 - 1.5 * q + 0.0005 * q * q;
    const res = solveNodeCore({
      iprPwfAt: (q) => pr - q / J,
      vlpBhpAt: vlp,
      qMax: pr * J,
      nGrid: 80,
    });
    expect(res.intersections.length).toBe(2);
    expect(res.intersections[0].stable).toBe(false);
    expect(res.intersections[1].stable).toBe(true);
    expect(res.status).toBe('flowing');
    expect(res.op.q).toBeCloseTo(res.intersections[1].q, 10);
    // analytic roots of 3200 - 1.5q + 0.0005q^2 = 3000 - q/2
    const [r1, r2] = quad(0.0005, -1, 200);
    expect(res.intersections[0].q).toBeCloseTo(Math.min(r1, r2), 2);
    expect(res.intersections[1].q).toBeCloseTo(Math.max(r1, r2), 2);
  });

  test('dead well: outflow above inflow everywhere', () => {
    const res = solveNodeCore({
      iprPwfAt: (q) => 2000 - q,
      vlpBhpAt: () => 2500,
      qMax: 2000,
    });
    expect(res.status).toBe('dead');
    expect(res.op).toBeNull();
  });
});

const quad = (a, b, c) => {
  const d = Math.sqrt(b * b - 4 * a * c);
  return [(-b - d) / (2 * a), (-b + d) / (2 * a)];
};

const fluidModel = buildFluidModel({ api: 35, gasSg: 0.75, gor: 600, salinityPpm: 30000 });
const vertical = buildTrajectory({ mode: 'vertical', depthFt: 8000 });
const tAt = linearGeothermal({ whtF: 100, bhtF: 180, tvdMaxFt: 8000 });
const baseVlp = {
  fluidModel,
  trajectory: vertical,
  tAt,
  idIn: 2.441,
  correlation: 'beggsBrill',
  whp: 250,
  nodeMd: 8000,
  stepFt: 250,
  rates: { wct: 0.2, gor: 600 },
};

describe('full-stack oil operating point', () => {
  const ipr = computeIpr({ model: 'composite', pr: 3200, pb: 2400, pi: 1.2 });

  test('flows, and the operating point satisfies both curves', () => {
    const res = solveOperatingPoint({ ipr, vlp: baseVlp, nGrid: 25 });
    expect(res.status).toBe('flowing');
    expect(res.op.q).toBeGreaterThan(100);
    expect(res.op.q).toBeLessThan(res.qMax);
    const bhp = bhpFromWhp({ ...baseVlp, rates: { ...baseVlp.rates, qo: res.op.q } }).pEnd;
    expect(Math.abs(bhp - res.op.pwf)).toBeLessThan(2);
  });

  test('sweep: higher wellhead pressure chokes the well back', () => {
    const sweep = operatingPointSweep(
      [150, 250, 400].map((whp) => ({
        label: `whp ${whp}`,
        value: whp,
        ipr,
        vlp: { ...baseVlp, whp },
        nGrid: 25,
      }))
    );
    expect(sweep[0].q).toBeGreaterThan(sweep[1].q);
    expect(sweep[1].q).toBeGreaterThan(sweep[2].q);
  });

  test('sweep: weaker reservoir pressure cuts the rate', () => {
    const low = solveOperatingPoint({
      ipr: computeIpr({ model: 'composite', pr: 2600, pb: 2400, pi: 1.2 }),
      vlp: baseVlp,
      nGrid: 25,
    });
    const high = solveOperatingPoint({ ipr, vlp: baseVlp, nGrid: 25 });
    expect(high.op.q).toBeGreaterThan(low.op.q);
  });
});

describe('full-stack gas operating point', () => {
  const iprResult = backPressureIpr({ pr: 3000, c: 0.01, n: 0.9 });

  test('interpolated inverse matches the closed form', () => {
    // back-pressure inverse: pwf = sqrt(pr^2 - (q/c)^(1/n))
    const q = iprResult.aof * 0.4;
    const exact = Math.sqrt(3000 ** 2 - Math.pow(q / 0.01, 1 / 0.9));
    expect(Math.abs(gasPwfAtRate(iprResult, q) - exact)).toBeLessThan(20);
  });

  test('Cullender-Smith node solve flows and is self-consistent', () => {
    const vlp = { ptf: 800, gasSg: 0.75, mdFt: 8000, whtF: 90, bhtF: 190, idIn: 2.441 };
    const res = solveGasOperatingPoint({ iprResult, vlp, nGrid: 30 });
    expect(res.status).toBe('flowing');
    expect(res.op.q).toBeGreaterThan(0);
    expect(res.op.q).toBeLessThan(iprResult.aof);
    const bhp = cullenderSmithBhp({ ...vlp, qMmscfd: res.op.q / 1000 }).pwf;
    expect(Math.abs(bhp - res.op.pwf)).toBeLessThan(25); // IPR interpolation width
  });
});
