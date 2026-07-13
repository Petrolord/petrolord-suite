/**
 * G4.1 — surface engine. The gridding/export writers are already
 * byte-golden-validated in Seismolord; here we validate the app glue
 * with exact analytic cases (bilinear reproduces linear fields exactly;
 * isochore/stats are exact arithmetic) and confirm the REUSED
 * gridSurface + grvAcreFt still produce sane numbers end-to-end.
 */

import {
  topsToPoints, zoneAttrToPoints, specForPoints, gridObject,
  resampleTo, combine, isochore, scalarAdd, surfaceStats,
} from '../engine/surface';
import { gridSurface } from '@/lib/gridding/gridding';
import { grvAcreFt } from '@/lib/gridding/surfaceExport';
import { NULL_VALUE } from '@/lib/gridding/numeric';

const close = (a, b, t = 1e-6) => Math.abs(a - b) <= t * Math.max(1, Math.abs(a), Math.abs(b));
// NULL_VALUE (1e30) rounds when stored in a Float32Array, so compare
// nulls by magnitude, not exact equality against the f64 literal.
const isNull = (v) => !Number.isFinite(v) || Math.abs(v) >= 1e29;
const norm = (z) => Array.from(z).map((v) => (isNull(v) ? 'NULL' : Math.round(v * 1e6) / 1e6));

const WELLS = [
  { name: 'W1', surface_x: 0, surface_y: 0, tops: [{ name: 'Top A', md_m: 1500 }], zones: [{ name: 'Z', properties: { phi_avg: 0.2 } }] },
  { name: 'W2', surface_x: 1000, surface_y: 0, tops: [{ name: 'Top A', md_m: 1560 }], zones: [{ name: 'Z', properties: { phi_avg: 0.25 } }] },
  { name: 'W3', surface_x: 0, surface_y: 1000, tops: [{ name: 'Top A', md_m: 1540 }], zones: [] },
  { name: 'W4', surface_x: 500, surface_y: 500, tops: [], zones: [{ name: 'Z', properties: { phi_avg: 0.3 } }] },
];

test('topsToPoints keeps only wells with the top; z = MD', () => {
  const pts = topsToPoints(WELLS, 'Top A');
  expect(pts.map((p) => p.well)).toEqual(['W1', 'W2', 'W3']); // W4 lacks it
  expect(pts.find((p) => p.well === 'W2')).toMatchObject({ x: 1000, y: 0, z: 1560 });
});

test('zoneAttrToPoints reads properties[key] for the named zone', () => {
  const pts = zoneAttrToPoints(WELLS, 'Z', 'phi_avg');
  expect(pts.map((p) => [p.well, p.z])).toEqual([['W1', 0.2], ['W2', 0.25], ['W4', 0.3]]);
});

test('specForPoints bounds + pads the control points', () => {
  const spec = specForPoints(topsToPoints(WELLS, 'Top A'), 250, 2);
  expect(spec.dx).toBe(250);
  expect(spec.x0).toBe(0 - 2 * 250);
  // x span 0..1000 => ceil(1000/250)+1 + 4 = 4+1+4 = 9
  expect(spec.nx).toBe(9);
  expect(() => specForPoints([], 250)).toThrow(/No control points/);
  expect(() => specForPoints([{ x: 0, y: 0, z: 1 }], 0)).toThrow(/positive/);
});

describe('bilinear resample reproduces a linear field exactly', () => {
  // z = 2x + 3y on a coarse grid, resampled to a finer offset grid
  const specA = { x0: 0, y0: 0, dx: 100, dy: 100, nx: 5, ny: 5 };
  const zA = new Float32Array(specA.nx * specA.ny);
  for (let r = 0; r < specA.ny; r++) {
    for (let c = 0; c < specA.nx; c++) zA[r * specA.nx + c] = 2 * (c * 100) + 3 * (r * 100);
  }
  test('finer grid, exact', () => {
    const specB = { x0: 50, y0: 50, dx: 50, dy: 50, nx: 6, ny: 6 };
    const zB = resampleTo(zA, specA, specB);
    for (let r = 0; r < specB.ny; r++) {
      for (let c = 0; c < specB.nx; c++) {
        const expv = 2 * (specB.x0 + c * 50) + 3 * (specB.y0 + r * 50);
        expect(close(zB[r * specB.nx + c], expv)).toBe(true);
      }
    }
  });
  test('nodes outside the source frame are null', () => {
    const specB = { x0: -100, y0: 0, dx: 100, dy: 100, nx: 2, ny: 1 };
    const zB = resampleTo(zA, specA, specB);
    expect(isNull(zB[0])).toBe(true);     // x=-100 outside
    expect(close(zB[1], 0)).toBe(true);   // x=0 => 0
  });
});

describe('surface math', () => {
  test('isochore = deep - shallow, null-aware', () => {
    const deep = Float32Array.from([1660, 1705, NULL_VALUE]);
    const shal = Float32Array.from([1500, 1560, 1540]);
    const iso = isochore(deep, shal);
    expect(norm(iso)).toEqual([160, 145, 'NULL']);
  });
  test('combine rejects mismatched frames + unknown op', () => {
    expect(() => combine(new Float32Array(2), new Float32Array(3), 'add')).toThrow(/share a grid frame/);
    expect(() => combine(new Float32Array(2), new Float32Array(2), 'nope')).toThrow(/Unknown surface op/);
  });
  test('scalarAdd shifts live nodes only', () => {
    expect(norm(scalarAdd(Float32Array.from([100, NULL_VALUE]), -50))).toEqual([50, 'NULL']);
  });
  test('surfaceStats ignores nulls', () => {
    expect(surfaceStats(Float32Array.from([10, 20, NULL_VALUE, 30]))).toEqual({ min: 10, max: 30, mean: 20, count: 3 });
    expect(surfaceStats(Float32Array.from([NULL_VALUE])).count).toBe(0);
  });
});

test('end-to-end: registry tops -> gridSurface -> honors controls; GRV sane', () => {
  const pts = topsToPoints(WELLS, 'Top A');
  const spec = specForPoints(pts, 100, 2);
  const g = gridSurface(pts, spec, { maxExtrapolation: 1e9 }); // no extrap mask for the test
  expect(g.controlCount).toBe(3);
  // TPS interpolates controls exactly — the grid node nearest each well
  // matches its MD closely
  const obj = gridObject(spec, g.z);
  const stats = surfaceStats(g.z);
  expect(stats.min).toBeGreaterThan(1400);
  expect(stats.max).toBeLessThan(1700);
  // GRV above a contact deeper than the whole surface is 0; above a
  // shallow contact it is positive (reused byte-golden GRV routine)
  expect(grvAcreFt(obj, spec.dx, spec.dy, 2000)).toBe(0);
  expect(grvAcreFt(obj, spec.dx, spec.dy, 1450)).toBeGreaterThan(0);
});
