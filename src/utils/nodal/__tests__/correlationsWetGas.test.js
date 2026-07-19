/**
 * Behavior gates for the NA2 chart-based correlations: modified
 * Hagedorn-Brown, Gray, Fancher-Brown. Oracle transcription gates live in
 * goldens.test.js; literature anchors in literature.test.js.
 */
import {
  hagedornBrownGradient,
  cnlOf,
  hlOverPsiOf,
  psiOf,
  griffithHoldup,
  griffithBoundary,
} from '../correlations/hagedornBrown.js';
import { grayGradient, grayHoldup, grayEffectiveRoughness } from '../correlations/gray.js';
import { fancherBrownGradient, fancherBrownFriction } from '../correlations/fancherBrown.js';
import { noSlipGradient } from '../correlations/noSlip.js';

const twoPhase = ({ vsl, vsg, rhoL = 47, rhoG = 5, muL = 1, muG = 0.015, sigmaL = 25 }) => {
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
const base = { p: 2000, thetaDeg: 90, dIn: 2.441, rough: 0.00024, pvt: pvtStub };

describe('modified Hagedorn-Brown', () => {
  test('chart fits stay on their published ranges', () => {
    expect(cnlOf(0.001)).toBe(0.0019);
    expect(cnlOf(0.5)).toBe(0.0115);
    expect(hlOverPsiOf(0)).toBeCloseTo(Math.sqrt(0.0047), 10);
    expect(hlOverPsiOf(0.01)).toBeLessThanOrEqual(1);
    expect(psiOf(0)).toBe(1); // clamped at the chart floor
    expect(psiOf(0.09)).toBeLessThanOrEqual(1.8);
  });

  test('holdup respects the no-slip floor and unity ceiling', () => {
    for (const [vsl, vsg] of [[0.3, 6], [2, 4], [5, 2], [0.1, 20]]) {
      const flows = twoPhase({ vsl, vsg });
      const g = hagedornBrownGradient({ ...base, flows });
      expect(g.holdup).toBeGreaterThanOrEqual(flows.lambdaL - 1e-12);
      expect(g.holdup).toBeLessThanOrEqual(1);
    }
  });

  test('Griffith branch engages at low gas fraction with single-phase liquid friction', () => {
    const flows = twoPhase({ vsl: 4, vsg: 0.3 });
    expect(flows.vsg / flows.vm).toBeLessThan(griffithBoundary(flows.vm, 2.441 / 12));
    const g = hagedornBrownGradient({ ...base, flows });
    expect(g.pattern).toBe('bubble (Griffith)');
    expect(g.holdup).toBeGreaterThan(flows.lambdaL); // bubbles slip upward
  });

  test('Griffith holdup solves its defining quadratic', () => {
    // hg = 1 - HL is the root of hg^2 - hg(1 + vm/vs) + vsg/vs = 0, vs = 0.8
    const vsl = 2;
    const vsg = 1;
    const vm = vsl + vsg;
    const hg = 1 - griffithHoldup(vsl, vsg);
    expect(hg * hg - hg * (1 + vm / 0.8) + vsg / 0.8).toBeCloseTo(0, 10);
  });

  test('gas-free stream reduces to single-phase', () => {
    const flows = { vsl: 4, vsg: 0, vm: 4, lambdaL: 1, rhoL: 62.4, muL: 1, sigmaL: 30, rhoNs: 62.4, muNs: 1 };
    const g = hagedornBrownGradient({ ...base, flows });
    expect(g.pattern).toBe('single-phase');
    expect(g.holdup).toBe(1);
  });
});

describe('Gray', () => {
  const wetGas = twoPhase({ vsl: 0.15, vsg: 18, rhoL: 55, rhoG: 4, muL: 0.6, muG: 0.014, sigmaL: 40 });

  test('holdup sits between no-slip and unity for a loaded gas well', () => {
    const hl = grayHoldup({ ...wetGas, rhoG: 4, dFt: 2.441 / 12 });
    expect(hl).toBeGreaterThan(wetGas.lambdaL);
    expect(hl).toBeLessThan(1);
  });

  test('more liquid loading raises holdup', () => {
    const dry = twoPhase({ vsl: 0.05, vsg: 18, rhoL: 55, rhoG: 4, sigmaL: 40 });
    const wet = twoPhase({ vsl: 0.6, vsg: 18, rhoL: 55, rhoG: 4, sigmaL: 40 });
    const hlDry = grayHoldup({ ...dry, rhoG: 4, dFt: 2.441 / 12 });
    const hlWet = grayHoldup({ ...wet, rhoG: 4, dFt: 2.441 / 12 });
    expect(hlWet).toBeGreaterThan(hlDry);
  });

  test('pseudo-roughness takes over at high liquid ratio and floors at 2.77e-5 ft', () => {
    const ke = grayEffectiveRoughness({ vsl: 1, vsg: 10, vm: 11, rhoNs: 8, sigmaL: 40, roughFt: 1e-5 });
    const k0 = ((28.5 / 453.592) * 40) / (8 * 121);
    expect(ke).toBeCloseTo(Math.max(k0, 2.77e-5), 12);
    const keFast = grayEffectiveRoughness({ vsl: 1, vsg: 100, vm: 101, rhoNs: 5, sigmaL: 40, roughFt: 1e-5 });
    expect(keFast).toBeGreaterThanOrEqual(2.77e-5);
  });

  test('gradient exceeds the no-slip bound (slip weight of the liquid film)', () => {
    const g = grayGradient({ ...base, flows: wetGas, pvt: { rhoG: 4, muG: 0.014 } });
    const ns = noSlipGradient({ ...base, flows: wetGas });
    expect(g.gradGrav).toBeGreaterThan(ns.gradGrav);
  });
});

describe('Fancher-Brown', () => {
  test('friction falls with mass velocity and with GLR band', () => {
    expect(fancherBrownFriction(5, 800)).toBeGreaterThan(fancherBrownFriction(30, 800));
    expect(fancherBrownFriction(10, 800)).toBeGreaterThan(fancherBrownFriction(10, 2000));
    expect(fancherBrownFriction(10, 2000)).toBeGreaterThan(fancherBrownFriction(10, 4000));
  });

  test('table ends clamp instead of extrapolating', () => {
    expect(fancherBrownFriction(0.1, 800)).toBe(fancherBrownFriction(3.42747, 800));
    expect(fancherBrownFriction(1e4, 800)).toBe(fancherBrownFriction(72.9019, 800));
  });

  test('is the lightest column: gradient below Beggs-Brill class slip gradients', () => {
    const flows = twoPhase({ vsl: 1.5, vsg: 4 });
    const fb = fancherBrownGradient({ ...base, flows, glr: 2000 });
    expect(fb.holdup).toBe(flows.lambdaL); // no slip by construction
    expect(fb.gradGrav).toBeCloseTo((flows.rhoNs * 1) / 144, 12);
  });
});
