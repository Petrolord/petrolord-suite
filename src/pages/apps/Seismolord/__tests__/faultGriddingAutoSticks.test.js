/**
 * Fault-blocked gridding with the fault as the automatic picker leaves it:
 * a stick every 8th inline from the first, none on the last, so the sticks
 * stop 7 lines short of the survey edge (the Ekene growth fault). The
 * blocks come from buildFaultBlocks, as in Make surface; before the barrier
 * reached the edge they made ONE block and the gridder smoothed the throw
 * across the fault, worst near the end the sticks do not reach.
 */
import { gridSurfaceBlocked } from '@/lib/gridding/gridding';
import { buildFaultBlocks } from '@/pages/apps/Seismolord/engine/faultBarriers';
import { NULL_VALUE } from '@/pages/apps/Seismolord/engine/manifest';

const NULL_F32 = Math.fround(NULL_VALUE);
const N = 40;              // 40 x 40 lattice, 25 m bins
const BIN = 25;
const FAULT_J = 19.5;      // vertical fault between crosslines 19 and 20
const GAP = 0;             // picks right up to the fault (it crosses them)
const geom = { nIl: N, nXl: N };
// horizon in samples: 12 samples down on the east block, gentle dip along inlines
const truthS = (i, j) => 200 + 0.2 * i + (j > FAULT_J ? 12 : 0);
const sticks = [];
for (let i = 0; i < N - 7; i += 8) {
  sticks.push({ points: [150, 180, 210, 240].map((s) => ({ il: i, xl: FAULT_J, s })) });
}

test('the gridded horizon keeps the full throw at the fault, right to the edge the sticks do not reach', () => {
  const picks = new Float32Array(N * N).fill(NULL_F32);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) if (Math.abs(j - FAULT_J) > GAP) picks[i * N + j] = truthS(i, j);
  }
  const blocks = buildFaultBlocks([{ sticks }], picks, geom);
  expect(blocks.count).toBe(2);
  const points = [];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const v = picks[i * N + j];
      if (v !== NULL_F32) points.push({ x: j * BIN, y: i * BIN, z: v, block: blocks.labels[i * N + j] });
    }
  }
  const spec = { x0: 0, y0: 0, dx: BIN, dy: BIN, nx: N, ny: N };
  const res = gridSurfaceBlocked(points, spec, { maxExtrapolation: 10 * BIN, nodeBlocks: blocks.labels });
  // the last rows, past the last stick: each side of the fault on its own plane
  for (const i of [35, 37, 39]) {
    const west = res.z[i * N + 18];
    const east = res.z[i * N + 21];
    expect(Math.abs(west - truthS(i, 18))).toBeLessThan(0.05);
    expect(Math.abs(east - truthS(i, 21))).toBeLessThan(0.05);
    expect(east - west).toBeCloseTo(12, 1);
  }
});
