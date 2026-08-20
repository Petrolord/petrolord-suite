/**
 * W3.1 fault-object deliverables (Suite side): stored-surface
 * preference, XYZ / polygon-CSV writers against the analytic faulted
 * horizon the engine oracles use, and the export-grid node mask that
 * nulls the heave gap after gridding.
 */

import {
  faultSurfaceOf, faultSurfaceXyz, faultPolygonCsv,
  faultIntersections, maskGridNodesByRings,
} from '@/pages/apps/Seismolord/lib/faultObjectsExport';
import {
  loftFaultSurface, faultHorizonIntersection,
} from '@/pages/apps/Seismolord/engine/faultObjects';
import { NULL_VALUE } from '@/pages/apps/Seismolord/engine/manifest';

const NULL_F32 = Math.fround(NULL_VALUE);

const NIL = 64;
const NXL = 64;
const geom = { nIl: NIL, nXl: NXL };
// 25 m bins, axis-aligned, origin (1000, 2000): world checks stay hand-computable
const affine = {
  origin: { x: 1000, y: 2000 },
  ilVec: { x: 0, y: 25 },
  xlVec: { x: 25, y: 0 },
};
const DT_MS = 4;

const BETA = 0.5;
function stepHorizon() {
  const picks = new Float32Array(NIL * NXL).fill(NULL_F32);
  const xlNeg = 32 + BETA * (40 - 50);
  const xlPos = 32 + BETA * (48 - 50);
  for (let i = 0; i < NIL; i++) {
    for (let j = 0; j < NXL; j++) {
      if (j < xlNeg) picks[i * NXL + j] = 40;
      else if (j >= xlPos) picks[i * NXL + j] = 48;
    }
  }
  return picks;
}
const makeFault = () => ({
  name: 'F1',
  sticks: [8, 24, 40, 56].map((il) => ({
    points: Array.from({ length: 13 }, (_, n) => {
      const s = 20 + n * 5;
      return { il, xl: 32 + BETA * (s - 50), s };
    }),
  })),
});

describe('faultSurfaceOf', () => {
  test('a stored surface wins; sticks loft as the fallback', () => {
    const fault = makeFault();
    const stored = { version: 1, samples: 2, rails: [[[0, 0, 0], [0, 0, 1]], [[1, 0, 0], [1, 0, 1]]] };
    expect(faultSurfaceOf({ ...fault, surface: stored })).toBe(stored);
    const lofted = faultSurfaceOf(fault);
    expect(lofted.version).toBe(1);
    expect(lofted.rails).toHaveLength(4);
  });

  test('single-stick faults have no surface', () => {
    expect(faultSurfaceOf({ sticks: [makeFault().sticks[0]] })).toBeNull();
  });
});

describe('faultSurfaceXyz', () => {
  test('world coordinates + signed TWT ms, one row per surface point', () => {
    const fault = makeFault();
    const out = faultSurfaceXyz(fault, affine, DT_MS, 'negative');
    const surf = loftFaultSurface(fault.sticks);
    expect(out.points).toBe(surf.rails.length * surf.samples);
    const first = out.text.split('\n')[0].split(' ').map(Number);
    // first surface point = first stick's first point (il 8, xl 17, s 20)
    expect(first[0]).toBeCloseTo(1000 + 17 * 25, 2);
    expect(first[1]).toBeCloseTo(2000 + 8 * 25, 2);
    expect(first[2]).toBeCloseTo(-20 * DT_MS, 2);
    const positive = faultSurfaceXyz(fault, affine, DT_MS, 'positive');
    expect(Number(positive.text.split('\n')[0].split(' ')[2])).toBeCloseTo(20 * DT_MS, 2);
  });

  test('null without at least two sticks', () => {
    expect(faultSurfaceXyz({ sticks: [makeFault().sticks[0]] }, affine, DT_MS)).toBeNull();
  });
});

describe('faultPolygonCsv', () => {
  test('throw in ms and heave in world metres match the analytic fault', () => {
    const picks = stepHorizon();
    const fault = makeFault();
    const x = faultHorizonIntersection(fault, picks, geom);
    const { text, segments } = faultPolygonCsv({
      intersection: x, affine, dtMs: DT_MS, faultName: 'F1', horizonName: 'Top A',
    });
    expect(segments).toBe(4);
    const throwRows = text.split('\n').filter((l) => l.startsWith('throw,'));
    expect(throwRows).toHaveLength(4);
    for (const row of throwRows) {
      const cols = row.split(',');
      // throw = 8 samples x 4 ms; heave = beta x 8 cells x 25 m/cell
      expect(Math.abs(Number(cols[6]))).toBeCloseTo(8 * DT_MS, 1);
      expect(Number(cols[7])).toBeCloseTo(BETA * 8 * 25, 0);
    }
    // both cutoff walls present with world coordinates
    expect(text).toContain('cutoff,footwall,0,');
    expect(text).toContain('cutoff,hangingwall,0,');
  });
});

describe('faultIntersections / maskGridNodesByRings', () => {
  test('rings null exactly the heave-gap nodes of an aligned export grid', () => {
    const picks = stepHorizon();
    const found = faultIntersections([makeFault()], picks, geom);
    expect(found).toHaveLength(1);
    const rings = found.map(({ intersection }) => intersection.polygon);
    // export grid = the lattice itself (25 m nodes at cell centres)
    const spec = { x0: 1000, y0: 2000, dx: 25, dy: 25, nx: NXL, ny: NIL };
    const nodes = maskGridNodesByRings(rings, geom, affine, spec);
    expect(nodes).not.toBeNull();
    let count = 0;
    for (const v of nodes) count += v;
    expect(count).toBeGreaterThan(0);
    // the gap is bounded by the cutoff crosslines 27..31: no masked node
    // outside that band, and the band is masked at the sticks' inlines
    for (let r = 0; r < NIL; r++) {
      for (let c = 0; c < NXL; c++) {
        if (nodes[r * NXL + c]) {
          expect(c).toBeGreaterThanOrEqual(26);
          expect(c).toBeLessThanOrEqual(32);
        }
      }
    }
    expect(nodes[24 * NXL + 29]).toBe(1); // mid-gap at a stick inline
  });

  test('no rings -> null (gridding untouched)', () => {
    expect(maskGridNodesByRings([], geom, affine,
      { x0: 0, y0: 0, dx: 25, dy: 25, nx: 4, ny: 4 })).toBeNull();
  });

  test('faults that do not cross are filtered out', () => {
    const flat = new Float32Array(NIL * NXL).fill(5); // above every stick
    expect(faultIntersections([makeFault()], flat, geom)).toHaveLength(0);
  });
});
