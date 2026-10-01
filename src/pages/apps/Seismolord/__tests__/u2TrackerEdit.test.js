// U2-010: confidence filter with repick, guided two-point tracking.
import { confidenceFilter, confidenceHistogram, guidedTrack2D } from '@/pages/apps/Seismolord/lib/trackerEdit';
import { autotrack2D, regionGrow3D } from '@/pages/apps/Seismolord/engine/horizonTrack';

const NULL = Math.fround(1e30);
const ricker = (x, w = 3) => { const a = (x / w) ** 2; return (1 - 2 * a) * Math.exp(-a); };

/** A section with a dipping target event, dead traces, and a stronger event below from trace 70. */
function section({ ns = 160, n = 120, dead = [40, 44] } = {}) {
  const data = new Float32Array(ns * n);
  const truth = (t) => 60 + 0.3 * t;
  for (let t = 0; t < n; t++) {
    const isDead = t >= dead[0] && t <= dead[1];
    for (let s = 0; s < ns; s++) {
      let v = ricker(s - truth(t));
      if (t >= 70) v += 2.2 * ricker(s - (truth(t) + 7));
      data[t * ns + s] = isDead ? 0 : v + 0.01 * Math.sin(0.7 * s + t);
    }
  }
  return { slice: { data, width: ns, height: n }, truth };
}

describe('guidedTrack2D', () => {
  test('follows the event through a dead zone to the second point (sub-sample)', () => {
    const { slice, truth } = section();
    const g = guidedTrack2D(slice, { trace: 0, sample: truth(0) }, { trace: 119, sample: truth(119) }, { maxStep: 2 });
    expect(g.tracked).toBe(120);
    let worst = 0;
    for (let t = 0; t < 120; t++) {
      if (t >= 40 && t <= 44) continue; // dead traces carry no event
      worst = Math.max(worst, Math.abs(g.picks[t] - truth(t)));
    }
    expect(worst).toBeLessThan(0.35);
    // across the dead zone the path stays within a step of the line
    for (let t = 40; t <= 44; t++) expect(Math.abs(g.picks[t] - truth(t))).toBeLessThan(3);
  });

  test('negative control: the greedy tracker from the same point stops at the dead zone', () => {
    const { slice, truth } = section();
    const { picks } = autotrack2D(slice, 0, truth(0), { mode: 'peak', window: 3, maxJump: 3 });
    expect(picks[119]).toBe(NULL);
    const g = guidedTrack2D(slice, { trace: 60, sample: truth(60) }, { trace: 119, sample: truth(119) });
    expect(Math.abs(g.picks[100] - truth(100))).toBeLessThan(0.35);
  });

  test('hostile guide points are refused with the reason (PL2, PL4)', () => {
    const { slice } = section();
    expect(() => guidedTrack2D(slice, { trace: 5, sample: 60 }, { trace: 5, sample: 70 })).toThrow(/different traces/);
    expect(() => guidedTrack2D(slice, { trace: 0, sample: 10 }, { trace: 5, sample: 100 }, { maxStep: 2 })).toThrow(/cannot join them/);
    expect(() => guidedTrack2D(slice, { trace: 0, sample: -4 }, { trace: 5, sample: 60 })).toThrow(/outside the section/);
    // order does not matter
    const { slice: s2, truth } = section();
    const r = guidedTrack2D(s2, { trace: 119, sample: truth(119) }, { trace: 0, sample: truth(0) });
    expect(r.from).toBe(0);
    expect(r.to).toBe(119);
  });
});

describe('confidenceFilter', () => {
  test('rejects scored picks below the threshold, keeps unscored ones', () => {
    const picks = Float32Array.from([10, 11, 12, NULL, 14]);
    const conf = Float32Array.from([0.95, 0.6, NULL, 0.9, 0.79]);
    const r = confidenceFilter(picks, conf, 0.8);
    expect(r.rejected).toEqual([1, 4]);
    expect(Array.from(r.picks)).toEqual([10, NULL, 12, NULL, NULL]);
    expect(r.kept).toBe(2);
    expect(r.unscored).toBe(1);
    expect(r.confidence[1]).toBe(NULL);
    expect(picks[1]).toBe(11); // input untouched
    expect(() => confidenceFilter(picks, conf, 1.5)).toThrow(/between 0 and 1/);
    expect(confidenceHistogram(picks, conf)).toEqual({ bins: [0, 0, 0, 0, 0, 0, 1, 1, 0, 1], scored: 3 });
  });

  test('reject and repick: the grow brings back only cells that now correlate at the threshold', async () => {
    // a flat event over 6 x 6 traces, with one noisy trace whose event is weak
    const nIl = 6; const nXl = 6; const ns = 60;
    const traces = new Map();
    for (let i = 0; i < nIl; i++) {
      for (let x = 0; x < nXl; x++) {
        const tr = new Float32Array(ns);
        const noisy = i === 3 && x === 3;
        for (let s = 0; s < ns; s++) tr[s] = ricker(s - 30) + (noisy ? 0.8 * Math.sin(1.3 * s + 0.4) : 0);
        traces.set(i * nXl + x, tr);
      }
    }
    const getTrace = async (i, x) => traces.get(i * nXl + x);
    const geom = { nIl, nXl, ns };
    const opts = { mode: 'ncc', corrThreshold: 0.3, maxJump: 3 };
    const first = await regionGrow3D(getTrace, geom, { ilIdx: 0, xlIdx: 0, sample: 30 }, opts);
    const noisyCell = 3 * nXl + 3;
    expect(first.picks[noisyCell]).not.toBe(NULL);
    expect(first.confidence[noisyCell]).toBeLessThan(0.8);
    const f = confidenceFilter(first.picks, first.confidence, 0.8);
    expect(f.rejected).toContain(noisyCell);
    // a clean neighbour tracked FROM the noisy trace (rolling reference) scored low too
    const collateral = f.rejected.filter((c) => c !== noisyCell);
    expect(collateral.length).toBeGreaterThan(0);
    const again = await regionGrow3D(getTrace, geom, null, { ...opts, corrThreshold: 0.8, initialPicks: f.picks });
    expect(again.picks[noisyCell]).toBe(NULL);           // still below the threshold: stays rejected
    for (const c of collateral) {                        // repicked from clean neighbours, now confident
      expect(again.picks[c]).not.toBe(NULL);
      expect(again.confidence[c]).toBeGreaterThanOrEqual(0.8);
    }
    expect(again.picks[0]).toBe(first.picks[0]);           // kept picks exactly
  });
});
