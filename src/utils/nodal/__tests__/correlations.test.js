/**
 * Analytic gates for the NA2 gradient correlations. Oracle equality gates
 * live in goldens.test.js / the harness; these pin the exact limits and
 * published closed forms.
 */
import { moodyFrictionFactor, reynoldsNumber } from '../friction.js';
import { noSlipGradient } from '../correlations/noSlip.js';
import {
  beggsBrillGradient,
  flowPattern,
  patternBoundaries,
  frictionRatioExponent,
} from '../correlations/beggsBrill.js';

const G = 32.174;

// Synthetic in-situ bundles let the gates hit exact limits without PVT noise.
const liquidFlows = (v, rho = 62.4, mu = 1) => ({
  vsl: v,
  vsg: 0,
  vm: v,
  lambdaL: 1,
  rhoL: rho,
  muL: mu,
  sigmaL: 30,
  rhoNs: rho,
  muNs: mu,
});

const twoPhaseFlows = ({ vsl, vsg, rhoL = 47, rhoG = 5, muL = 1, muG = 0.015, sigmaL = 25 }) => {
  const vm = vsl + vsg;
  const lambdaL = vsl / vm;
  return {
    vsl,
    vsg,
    vm,
    lambdaL,
    rhoL,
    muL,
    sigmaL,
    rhoNs: rhoL * lambdaL + rhoG * (1 - lambdaL),
    muNs: muL * lambdaL + muG * (1 - lambdaL),
  };
};

const pvtStub = { rhoG: 5, muG: 0.015 };

describe('no-slip correlation exact limits', () => {
  test('zero rate is the exact hydrostatic column', () => {
    const g = noSlipGradient({ p: 2000, thetaDeg: 90, dIn: 2.441, flows: liquidFlows(0) });
    expect(g.dpdz).toBeCloseTo(62.4 / 144, 12);
    expect(g.gradFric).toBe(0);
  });

  test('gas-free stream is exactly single-phase Darcy-Weisbach', () => {
    const v = 4;
    const dFt = 2.441 / 12;
    const flows = liquidFlows(v);
    const g = noSlipGradient({ p: 2000, thetaDeg: 90, dIn: 2.441, rough: 0.0006, flows });
    const f = moodyFrictionFactor(reynoldsNumber(62.4, v, dFt, 1), 0.0006);
    const expected =
      (62.4 / 144 + (f * 62.4 * v * v) / (2 * G * dFt) / 144) /
      (1 - 0); // vsg = 0 so Ek = 0
    expect(g.dpdz).toBeCloseTo(expected, 12);
  });

  test('horizontal pipe has zero hydrostatic gradient', () => {
    const g = noSlipGradient({ p: 2000, thetaDeg: 0, dIn: 2.441, flows: liquidFlows(4) });
    expect(g.gradGrav).toBe(0);
    expect(g.gradFric).toBeGreaterThan(0);
  });
});

describe('Beggs & Brill pattern map', () => {
  test('boundaries follow the published power laws', () => {
    const b = patternBoundaries(0.1);
    expect(b.l1).toBeCloseTo(316 * 0.1 ** 0.302, 12);
    expect(b.l2).toBeCloseTo(0.0009252 * 0.1 ** -2.4684, 12);
    expect(b.l3).toBeCloseTo(0.1 * 0.1 ** -1.4516, 12);
    expect(b.l4).toBeCloseTo(0.5 * 0.1 ** -6.738, 12);
  });

  test('classifies the canonical regions', () => {
    // lambda 0.1: l2 ~ 0.446, l3 ~ 2.62, l1 ~ 158, l4 ~ 273407
    expect(flowPattern(0.1, 0.1)).toBe('segregated');
    expect(flowPattern(0.1, 1)).toBe('transition');
    expect(flowPattern(0.1, 10)).toBe('intermittent');
    expect(flowPattern(0.1, 1000)).toBe('distributed');
    expect(flowPattern(0.001, 0.05)).toBe('segregated');
    expect(flowPattern(0.5, 1000)).toBe('distributed');
  });
});

describe('Beggs & Brill friction ratio', () => {
  test('s(1) = 0 so ftp = fn at y = 1', () => {
    expect(frictionRatioExponent(1) === 0).toBe(true);
  });

  test('discontinuity patch applies on 1 < y < 1.2', () => {
    expect(frictionRatioExponent(1.1)).toBeCloseTo(Math.log(2.2 * 1.1 - 1.2), 12);
  });

  test('published quartic outside the patch window', () => {
    const y = 2.5;
    const ln = Math.log(y);
    const expected = ln / (-0.0523 + 3.182 * ln - 0.8725 * ln ** 2 + 0.01853 * ln ** 4);
    expect(frictionRatioExponent(y)).toBeCloseTo(expected, 12);
  });
});

describe('Beggs & Brill gradient behavior', () => {
  const base = { p: 2000, thetaDeg: 90, dIn: 2.441, rough: 0.0006, pvt: pvtStub };

  test('single-phase liquid guard reduces exactly to Darcy-Weisbach', () => {
    const v = 4;
    const dFt = 2.441 / 12;
    const g = beggsBrillGradient({ ...base, flows: liquidFlows(v) });
    const f = moodyFrictionFactor(reynoldsNumber(62.4, v, dFt, 1), 0.0006);
    expect(g.pattern).toBe('single-phase');
    expect(g.holdup).toBe(1);
    expect(g.dpdz).toBeCloseTo(62.4 / 144 + (f * 62.4 * v * v) / (2 * G * dFt) / 144, 12);
  });

  test('holdup stays within [lambdaL-ish, 1] and above no-slip for uphill slug flow', () => {
    const flows = twoPhaseFlows({ vsl: 3, vsg: 5 });
    const g = beggsBrillGradient({ ...base, flows });
    expect(g.holdup).toBeGreaterThan(flows.lambdaL);
    expect(g.holdup).toBeLessThanOrEqual(1);
    // slip makes the flowing column heavier than no-slip
    expect(g.gradGrav).toBeGreaterThan((flows.rhoNs * 1) / 144);
  });

  test('transition holdup interpolates between segregated and intermittent', () => {
    const flows = twoPhaseFlows({ vsl: 0.5, vsg: 4.5 });
    const { l2, l3 } = patternBoundaries(flows.lambdaL);
    // pick a diameter so NFr lands mid-transition; solve d from NFr target
    const nfrTarget = (l2 + l3) / 2;
    const dFt = (flows.vm * flows.vm) / (G * nfrTarget);
    const g = beggsBrillGradient({ ...base, dIn: dFt * 12, flows });
    expect(g.pattern).toBe('transition');
    expect(g.holdup).toBeGreaterThan(flows.lambdaL * 0.9);
    expect(g.holdup).toBeLessThanOrEqual(1);
  });

  test('downhill flow uses the downhill C and Payne 0.685 (lighter column than uphill)', () => {
    const flows = twoPhaseFlows({ vsl: 2, vsg: 4 });
    const up = beggsBrillGradient({ ...base, flows });
    const down = beggsBrillGradient({ ...base, thetaDeg: -90, flows });
    expect(Math.abs(down.holdup)).toBeLessThan(up.holdup);
    expect(down.gradGrav).toBeLessThan(0); // hydrostatic aids downhill flow
  });

  test('acceleration term inflates the gradient at low pressure', () => {
    const flows = twoPhaseFlows({ vsl: 1, vsg: 20 });
    const lowP = beggsBrillGradient({ ...base, p: 100, flows });
    const highP = beggsBrillGradient({ ...base, p: 3000, flows });
    expect(lowP.ek).toBeGreaterThan(highP.ek);
    expect(lowP.dpdz).toBeGreaterThan((lowP.gradGrav + lowP.gradFric) * 1.0);
  });
});
