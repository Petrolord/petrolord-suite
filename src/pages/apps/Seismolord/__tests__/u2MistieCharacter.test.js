// U2-014: phase and amplitude misties at 2D crossings.
import {
  crossingCharacter, solveCharacter, solveNetwork, applyCharacter, composeCharacter, wrapDeg,
} from '@/pages/apps/Seismolord/lib/mistieCharacter';
import { rotateConstantPhase } from '@/pages/apps/Seismolord/engine/tieWarp';

const ns = 200;
const ricker = (x, w = 4) => { const a = (x / w) ** 2; return (1 - 2 * a) * Math.exp(-a); };
/** A reflectivity-like trace: three Ricker events around sample 100. */
const base = () => Float32Array.from({ length: ns }, (_, s) => ricker(s - 90) - 0.6 * ricker(s - 104) + 0.4 * ricker(s - 118));
const rotScale = (tr, deg, k) => { const r = rotateConstantPhase(tr, (deg * Math.PI) / 180); return Float32Array.from(r, (v) => v * k); };

describe('crossingCharacter (analytic: B is A rotated and scaled)', () => {
  test('recovers a 30 degree rotation and a 1.5 amplitude ratio', () => {
    const a = base();
    const b = rotScale(a, 30, 1.5);
    const c = crossingCharacter(a, b, 100, 100, { half: 40 });
    expect(c.phiDeg).toBeCloseTo(30, 0);
    expect(c.ratio).toBeCloseTo(1.5, 2);
    expect(c.corr).toBeGreaterThan(0.99);
    expect(c.corr).toBeGreaterThan(c.corr0);
  });

  test('negative control: identical traces have no phase or amplitude mistie', () => {
    const a = base();
    const c = crossingCharacter(a, Float32Array.from(a), 100, 100, { half: 40 });
    expect(Math.abs(c.phiDeg)).toBeLessThan(1e-6);
    expect(c.ratio).toBeCloseTo(1, 12);
  });

  test('the windows follow each line pick (time mistie removed first)', () => {
    const a = base();
    const b = new Float32Array(ns);
    for (let s = 0; s < ns; s++) b[s] = s >= 6 ? a[s - 6] : 0; // B 6 samples later
    const c = crossingCharacter(a, b, 100, 106, { half: 40 });
    expect(Math.abs(c.phiDeg)).toBeLessThan(2);
  });

  test('a dead trace is refused (null), never a zero mistie (PL4)', () => {
    expect(crossingCharacter(base(), new Float32Array(ns), 100, 100)).toBeNull();
  });
});

describe('network solve', () => {
  test('three lines rotated 0, 30, -20 degrees and scaled 1, 1.5, 0.8: applying the corrections ties them', () => {
    const a = base();
    const truth = [[0, 1], [30, 1.5], [-20, 0.8]];
    const lines = truth.map(([d, k]) => rotScale(a, d, k));
    const pairs = [[0, 1], [0, 2], [1, 2]];
    const measure = (ls) => pairs.map(([i, j]) => ({ a: i, b: j, ...crossingCharacter(ls[i], ls[j], 100, 100, { half: 40 }) }));
    const before = measure(lines);
    const sol = solveCharacter(3, before);
    expect(sol.rmsPhaseBefore).toBeGreaterThan(20);
    expect(sol.rmsPhaseAfter).toBeLessThan(1);
    // mean-zero rotations: -(truth - mean(truth))
    const mean = (0 + 30 - 20) / 3;
    sol.rotationDeg.forEach((r, i) => expect(r).toBeCloseTo(-(truth[i][0] - mean), 0));
    const gm = Math.cbrt(1 * 1.5 * 0.8);
    sol.scale.forEach((s, i) => expect(s).toBeCloseTo(gm / truth[i][1], 2));
    // apply to each line section and measure again: the misties are gone
    const fixed = lines.map((tr, i) => applyCharacter({ data: tr, width: ns, height: 1 }, { rotation_deg: sol.rotationDeg[i], amp_scale: sol.scale[i] }).data);
    for (const c of measure(fixed)) {
      expect(Math.abs(c.phiDeg)).toBeLessThan(1);
      expect(c.ratio).toBeCloseTo(1, 2);
    }
  });

  test('network gauge and helpers', () => {
    const c = solveNetwork(2, [{ a: 0, b: 1, value: 10 }]);
    expect(c[1] - c[0]).toBeCloseTo(10, 12);
    expect(c[0] + c[1]).toBeCloseTo(0, 12);
    expect(wrapDeg(190)).toBe(-170);
    expect(wrapDeg(-180)).toBe(180);
    expect(composeCharacter({ rotation_deg: 170, amp_scale: 2 }, 20, 0.5)).toEqual({ rotation_deg: -170, amp_scale: 1 });
    const sec = { data: Float32Array.from([1, 2]), width: 2, height: 1 };
    expect(applyCharacter(sec, null)).toBe(sec);
  });
});
