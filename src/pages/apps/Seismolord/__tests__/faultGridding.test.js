/**
 * Fault-blocked TPS gridding vs analytic truth: two planar fault blocks
 * with 300 ft of throw across a vertical fault, and a pick gap around
 * the fault (the realistic case — picks near faults get erased).
 *
 * Blocked gridding must reproduce each plane exactly right up to the
 * barrier (TPS extends planar data exactly); the unblocked path is
 * asserted to smear the throw across the gap — the documented bug this
 * feature fixes.
 */
import {
  gridSurface, gridSurfaceBlocked,
} from '@/pages/apps/Seismolord/engine/gridding';
import { NULL_VALUE } from '@/pages/apps/Seismolord/engine/manifest';

const NULL_F32 = Math.fround(NULL_VALUE);

// 40 x 40 lattice, 25 m bins, fault between columns 19 and 20.
// left block:  z = -5000 + 0.4 * y_m   (gentle dip along y)
// right block: z = -5300 + 0.4 * y_m   (same dip, 300 ft down-thrown)
const N = 40;
const BIN = 25;
const FAULT_J = 19.5;
const GAP = 3;                       // pick-free columns each side
const truthZ = (jCol, yM) => (jCol < FAULT_J ? -5000 : -5300) + 0.4 * yM;
const blockOf = (jCol) => {
  if (Math.abs(jCol - FAULT_J) <= 0.5) return -1;   // barrier columns 19, 20
  return jCol < FAULT_J ? 0 : 1;
};

function makeInputs() {
  const points = [];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if (Math.abs(j - FAULT_J) < GAP + 0.5) continue;   // pick gap at fault
      points.push({
        x: j * BIN, y: i * BIN, z: truthZ(j, i * BIN), block: blockOf(j),
      });
    }
  }
  const spec = { x0: 0, y0: 0, dx: BIN, dy: BIN, nx: N, ny: N };
  const nodeBlocks = new Int32Array(N * N);
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) nodeBlocks[r * N + c] = blockOf(c);
  }
  return { points, spec, nodeBlocks };
}

const opts = { maxExtrapolation: 10 * BIN };  // reach across the pick gap

describe('fault-blocked TPS', () => {
  const { points, spec, nodeBlocks } = makeInputs();

  test('each block reproduces its plane exactly, throw preserved at the fault', () => {
    const res = gridSurfaceBlocked(points, spec, { ...opts, nodeBlocks });
    expect(res.blockCount).toBe(2);
    expect(res.skippedBlocks).toBe(0);
    let maxErr = 0;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const v = res.z[r * N + c];
        if (nodeBlocks[r * N + c] < 0) {
          expect(v).toBe(NULL_F32);              // fault gap stays null
          continue;
        }
        expect(v).not.toBe(NULL_F32);
        maxErr = Math.max(maxErr, Math.abs(v - truthZ(c, r * BIN)));
      }
    }
    expect(maxErr).toBeLessThan(0.01);           // planes exact per block
    // full 300 ft throw between the columns flanking the barrier
    const r = 20;
    expect(res.z[r * N + 19 - 1] - res.z[r * N + 21]).toBeCloseTo(300, 1);
  });

  test('the unblocked path smears the throw across the gap (the bug being fixed)', () => {
    const res = gridSurface(points, spec, opts);
    // at the fault-adjacent gap columns the global TPS rides a ramp
    // between the blocks — tens of feet of error against either truth
    const r = 20;
    let worst = 0;
    for (const c of [17, 18, 19, 20, 21, 22]) {
      const v = res.z[r * N + c];
      if (v === NULL_F32) continue;
      worst = Math.max(worst, Math.abs(v - truthZ(c, r * BIN)));
    }
    expect(worst).toBeGreaterThan(50);
  });

  test('a block with too few points is skipped, not fatal; the rest still grids', () => {
    // strip the right block down to 2 points
    const few = points.filter((p) => p.block !== 1);
    few.push({ x: 30 * BIN, y: 5 * BIN, z: -5250, block: 1 });
    few.push({ x: 32 * BIN, y: 7 * BIN, z: -5250, block: 1 });
    const res = gridSurfaceBlocked(few, spec, { ...opts, nodeBlocks });
    expect(res.blockCount).toBe(1);
    expect(res.skippedBlocks).toBe(1);
    expect(res.z[20 * N + 30]).toBe(NULL_F32);   // skipped block is null
    expect(res.z[20 * N + 5]).not.toBe(NULL_F32); // left block unaffected
  });

  test('barrier-cell control points are dropped from the fit', () => {
    const withBarrierPick = [...points,
      { x: 19 * BIN, y: 20 * BIN, z: -9999, block: -1 }]; // garbage on the fault
    const res = gridSurfaceBlocked(withBarrierPick, spec, { ...opts, nodeBlocks });
    let maxErr = 0;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const v = res.z[r * N + c];
        if (v === NULL_F32) continue;
        maxErr = Math.max(maxErr, Math.abs(v - truthZ(c, r * BIN)));
      }
    }
    expect(maxErr).toBeLessThan(0.01);           // garbage never entered
  });

  test('missing nodeBlocks is a clear error', () => {
    expect(() => gridSurfaceBlocked(points, spec, opts))
      .toThrow(/block id per output node/);
  });
});
