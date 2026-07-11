/**
 * Fault barriers: stick-horizon crossings, trace rasterization and
 * block labeling — all against analytic truth (validation-first).
 */
import {
  horizonSampleAt,
  stickCrossing,
  faultTraces,
  rasterizeTraces,
  labelBlocks,
  buildFaultBlocks,
} from '@/pages/apps/Seismolord/engine/faultBarriers';
import { NULL_VALUE } from '@/pages/apps/Seismolord/engine/manifest';

const NULL_F32 = Math.fround(NULL_VALUE);

/** Planar horizon s = a + b*i + c*j on an nIl x nXl lattice. */
function planarPicks(nIl, nXl, a, b, c) {
  const picks = new Float32Array(nIl * nXl);
  for (let i = 0; i < nIl; i++) {
    for (let j = 0; j < nXl; j++) picks[i * nXl + j] = a + b * i + c * j;
  }
  return picks;
}

describe('horizonSampleAt', () => {
  const geom = { nIl: 8, nXl: 10 };
  const picks = planarPicks(8, 10, 20, 2, 0.5);

  test('bilinear on a plane is exact', () => {
    expect(horizonSampleAt(picks, geom, 3, 4)).toBeCloseTo(20 + 6 + 2, 10);
    expect(horizonSampleAt(picks, geom, 2.25, 6.5))
      .toBeCloseTo(20 + 2 * 2.25 + 0.5 * 6.5, 10);
  });

  test('null neighbours are renormalized away; full holes return null', () => {
    const holed = planarPicks(8, 10, 20, 2, 0.5);
    holed[3 * 10 + 4] = NULL_F32;                    // one corner of the cell
    const v = horizonSampleAt(holed, geom, 3.5, 4.5);
    expect(v).not.toBeNull();
    expect(Number.isFinite(v)).toBe(true);
    expect(Math.abs(v) < 1e29).toBe(true);           // 1e30 never leaks in
    holed.fill(NULL_F32);
    expect(horizonSampleAt(holed, geom, 3.5, 4.5)).toBeNull();
  });
});

describe('stickCrossing', () => {
  const geom = { nIl: 16, nXl: 16 };
  const picks = planarPicks(16, 16, 40, 0, 0);       // flat at s = 40

  test('vertical stick crossing interpolates the exact sub-sample point', () => {
    const stick = { points: [{ il: 5, xl: 7, s: 10 }, { il: 5, xl: 7, s: 70 }] };
    const c = stickCrossing(stick, picks, geom);
    expect(c.i).toBeCloseTo(5, 10);
    expect(c.j).toBeCloseTo(7, 10);
  });

  test('dipping stick crosses at the interpolated lateral position', () => {
    // stick runs il 2 -> 10 while s runs 20 -> 60; horizon at 40 =>
    // crossing halfway: il 6
    const stick = { points: [{ il: 2, xl: 3, s: 20 }, { il: 10, xl: 3, s: 60 }] };
    const c = stickCrossing(stick, picks, geom);
    expect(c.i).toBeCloseTo(6, 10);
    expect(c.j).toBeCloseTo(3, 10);
  });

  test('stick entirely above or below the horizon yields no crossing', () => {
    expect(stickCrossing(
      { points: [{ il: 5, xl: 7, s: 10 }, { il: 5, xl: 7, s: 30 }] }, picks, geom,
    )).toBeNull();
    expect(stickCrossing(
      { points: [{ il: 5, xl: 7, s: 50 }, { il: 5, xl: 7, s: 90 }] }, picks, geom,
    )).toBeNull();
  });

  test('segments over horizon holes are skipped, later crossings still found', () => {
    const holed = planarPicks(16, 16, 40, 0, 0);
    for (let j = 0; j < 16; j++) holed[2 * 16 + j] = NULL_F32; // hole band at il 2
    for (let j = 0; j < 16; j++) holed[3 * 16 + j] = NULL_F32; // (bilinear support)
    const stick = {
      points: [
        { il: 2.5, xl: 4, s: 10 },   // over the hole — no horizon here
        { il: 6, xl: 4, s: 30 },
        { il: 6, xl: 4, s: 55 },     // crossing between these two
      ],
    };
    const c = stickCrossing(stick, holed, geom);
    expect(c.i).toBeCloseTo(6, 10);
  });
});

describe('rasterizeTraces + labelBlocks', () => {
  test('straight full-width barrier splits the lattice into two blocks', () => {
    const nIl = 12; const nXl = 12;
    const traces = [[{ i: 5.5, j: -0.5 }, { i: 5.5, j: 11.5 }]];
    const mask = rasterizeTraces(traces, nIl, nXl);
    const { labels, count } = labelBlocks(mask, nIl, nXl);
    expect(count).toBe(2);
    expect(labels[2 * nXl + 6]).not.toBe(labels[9 * nXl + 6]);
    expect(labels[2 * nXl + 1]).toBe(labels[2 * nXl + 10]); // same side connected
  });

  test('diagonal barrier cannot be leaked through (4-connected chain)', () => {
    const nIl = 20; const nXl = 20;
    // corner-to-corner diagonal — the classic 8-connected leak case
    const traces = [[{ i: -0.5, j: -0.5 }, { i: 19.5, j: 19.5 }]];
    const mask = rasterizeTraces(traces, nIl, nXl);
    const { labels, count } = labelBlocks(mask, nIl, nXl);
    expect(count).toBe(2);
    expect(labels[1 * nXl + 15]).not.toBe(labels[15 * nXl + 1]);
  });

  test('a barrier ending mid-lattice does NOT split it (blocks stay connected around the tip)', () => {
    const nIl = 12; const nXl = 12;
    const traces = [[{ i: 5.5, j: -0.5 }, { i: 5.5, j: 6 }]]; // stops at j=6
    const mask = rasterizeTraces(traces, nIl, nXl);
    const { count } = labelBlocks(mask, nIl, nXl);
    expect(count).toBe(1);
  });
});

describe('buildFaultBlocks (end-to-end)', () => {
  const geom = { nIl: 16, nXl: 16 };
  const picks = planarPicks(16, 16, 40, 0, 0);

  test('fault cutting the horizon splits it; stick order defines the trace', () => {
    // three sticks along crossline, each crossing s=40 at il=8
    const sticks = [3, 8, 13].map((xl) => ({
      points: [{ il: 8, xl, s: 10 }, { il: 8, xl, s: 70 }],
    }));
    // extend to the lattice edges is NOT done automatically — use sticks
    // that reach the edges so the split is complete
    const edgeSticks = [-0.5, 15.5].map((xl) => ({
      points: [{ il: 8, xl, s: 10 }, { il: 8, xl, s: 70 }],
    }));
    const blocks = buildFaultBlocks(
      [{ sticks: [edgeSticks[0], ...sticks, edgeSticks[1]] }], picks, geom,
    );
    expect(blocks).not.toBeNull();
    expect(blocks.count).toBe(2);
    expect(blocks.traces[0]).toHaveLength(5);
    expect(blocks.barrierCells).toBeGreaterThan(0);
    expect(blocks.labels[2 * 16 + 8]).not.toBe(blocks.labels[13 * 16 + 8]);
  });

  test('faults that never cut the horizon produce null (grid as before)', () => {
    const sticks = [{ points: [{ il: 4, xl: 4, s: 90 }, { il: 4, xl: 4, s: 120 }] }];
    expect(buildFaultBlocks([{ sticks }], picks, geom)).toBeNull();
    expect(buildFaultBlocks([], picks, geom)).toBeNull();
    expect(buildFaultBlocks(null, picks, geom)).toBeNull();
  });

  test('single-crossing fault (point, no direction) contributes no barrier', () => {
    const sticks = [{ points: [{ il: 4, xl: 4, s: 10 }, { il: 4, xl: 4, s: 70 }] }];
    expect(buildFaultBlocks([{ sticks }], picks, geom)).toBeNull();
  });
});
