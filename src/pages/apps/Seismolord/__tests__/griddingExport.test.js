/**
 * Phase 4 acceptance (docs/scope/Seismolord-PLAN.md):
 *  - export writers byte-identical to the committed Phase 0 reference
 *    grids (the segyio-side oracle wrote those from the same analytic
 *    dome, so float64 arithmetic must line up exactly);
 *  - GRV assertions against the analytic dome truth;
 *  - round-trip: our XYZ imported by ReservoirCalc Pro's SurfaceParser
 *    reproduces the surface;
 *  - TPS gridding: exact at controls, reproduces the dome from decimated
 *    picks, hull + max-extrapolation masking to 1.0E+30 nulls.
 */
import fs from 'fs';
import path from 'path';

import {
  fitTps, gridSurface, convexHull, picksToPoints, exportGridSpec,
} from '@/lib/gridding/gridding';
import {
  writeXYZ, writeCPS3, writeZMAP, grvAcreFt, pyExp,
} from '@/lib/gridding/surfaceExport';
import { NULL_VALUE } from '@/pages/apps/Seismolord/engine/manifest';
import { affineFromCorners } from '@/pages/apps/Seismolord/engine/surveyGeometry';
import { SurfaceParser } from '@/pages/apps/ReservoirCalcPro/services/SurfaceParser';

const NULL_F32 = Math.fround(NULL_VALUE);
const DATA_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'test-data', 'seismolord');
const SURF_DIR = path.join(DATA_DIR, 'surfaces');

const meta = JSON.parse(fs.readFileSync(path.join(SURF_DIR, 'dome_surface_meta.json'), 'utf8'));

/** Recompute the analytic dome grid in float64, mirroring model.py
 *  surface_grid() operation-for-operation (JS doubles == numpy float64). */
function analyticGrid() {
  const { nx, ny, x0, y0, dx, dy } = meta.grid;
  const k = meta.grv.k_ft_per_m2;
  const crest = meta.z_crest_ft;
  const hull = meta.hull_radius_m;
  const x = Array.from({ length: nx }, (_, c) => x0 + c * dx);
  const y = Array.from({ length: ny }, (_, r) => y0 + r * dy);
  const xc = x0 + ((nx - 1) * dx) / 2;
  const yc = y0 + ((ny - 1) * dy) / 2;
  const z = new Float64Array(nx * ny);
  for (let r = 0; r < ny; r++) {
    for (let c = 0; c < nx; c++) {
      const r2 = (x[c] - xc) ** 2 + (y[r] - yc) ** 2;
      z[r * nx + c] = Math.sqrt(r2) > hull ? NULL_VALUE : crest - k * r2;
    }
  }
  return { x, y, z, nx, ny, dx, dy };
}

describe('export writers vs committed Phase 0 reference files (byte identity)', () => {
  const g = analyticGrid();

  test('XYZ writer matches dome_surface.xyz byte-for-byte', () => {
    const ref = fs.readFileSync(path.join(SURF_DIR, 'dome_surface.xyz'), 'utf8');
    expect(writeXYZ(g)).toBe(ref);
  });

  test('CPS-3 writer matches dome_surface_cps3.dat byte-for-byte', () => {
    const ref = fs.readFileSync(path.join(SURF_DIR, 'dome_surface_cps3.dat'), 'utf8');
    expect(writeCPS3(g)).toBe(ref);
  });

  test('ZMAP+ writer matches dome_surface_zmap.dat byte-for-byte', () => {
    const ref = fs.readFileSync(path.join(SURF_DIR, 'dome_surface_zmap.dat'), 'utf8');
    expect(writeZMAP({
      ...g, name: 'dome_surface_zmap', commentSuffix: ' (Seismolord validation golden)',
    })).toBe(ref);
  });

  test('pyExp matches the Python %.7E dialect on edge values', () => {
    expect(pyExp(1.0e30).trim()).toBe('1.0000000E+30');
    expect(pyExp(-5002.4).trim()).toBe('-5.0024000E+03');
    expect(pyExp(0).trim()).toBe('0.0000000E+00');
  });
});

describe('GRV vs analytic dome truth', () => {
  const g = analyticGrid();

  test('cell-summed GRV of the analytic grid matches the analytic cap volume', () => {
    const grv = grvAcreFt(g, meta.grid.dx, meta.grid.dy, meta.grv.contact_ft);
    const truth = meta.grv.grv_acre_ft_analytic;      // 46,578.3 acre-ft
    expect(Math.abs(grv - truth) / truth).toBeLessThan(0.015);
  });

  test('null cells contribute nothing to GRV', () => {
    const withExtraNulls = { ...g, z: Float64Array.from(g.z) };
    // nulling cells BELOW the contact must not change GRV at all
    let changed = 0;
    for (let i = 0; i < withExtraNulls.z.length; i++) {
      if (!Number.isFinite(withExtraNulls.z[i])) continue;
      if (Math.abs(withExtraNulls.z[i]) < 1e29 && withExtraNulls.z[i] < meta.grv.contact_ft) {
        withExtraNulls.z[i] = NULL_VALUE;
        changed += 1;
      }
    }
    expect(changed).toBeGreaterThan(0);
    expect(grvAcreFt(withExtraNulls, meta.grid.dx, meta.grid.dy, meta.grv.contact_ft))
      .toBeCloseTo(grvAcreFt(g, meta.grid.dx, meta.grid.dy, meta.grv.contact_ft), 6);
  });
});

describe('TPS gridding', () => {
  test('interpolates exactly at control points', () => {
    const pts = [];
    for (let i = 0; i < 25; i++) {
      const x = (i % 5) * 100 + 17 * Math.sin(i);
      const y = Math.floor(i / 5) * 100 + 13 * Math.cos(2 * i);
      pts.push({ x, y, z: Math.sin(x / 90) * 50 + y * 0.1 });
    }
    const tps = fitTps(pts);
    for (const p of pts) {
      expect(Math.abs(tps(p.x, p.y) - p.z)).toBeLessThan(1e-6);
    }
  });

  test('reproduces the analytic dome from decimated controls, with masking', () => {
    const g = analyticGrid();
    // control points: the live analytic nodes (gridSurface decimates to <=700)
    const pts = [];
    for (let r = 0; r < g.ny; r++) {
      for (let c = 0; c < g.nx; c++) {
        const z = g.z[r * g.nx + c];
        if (Math.abs(z) > 1e29) continue;
        pts.push({ x: g.x[c], y: g.y[r], z });
      }
    }
    const spec = {
      x0: meta.grid.x0, y0: meta.grid.y0, dx: meta.grid.dx, dy: meta.grid.dy,
      nx: g.nx, ny: g.ny,
    };
    const result = gridSurface(pts, spec, { maxControl: 800 });
    expect(result.controlCount).toBeLessThanOrEqual(800);
    expect(result.dropped).toBeGreaterThan(0);
    expect(result.live).toBeGreaterThan(0);

    let compared = 0;
    let within = 0;
    let maxErr = 0;
    for (let i = 0; i < result.z.length; i++) {
      const ours = result.z[i];
      const truth = g.z[i];
      if (ours === NULL_F32 || Math.abs(truth) > 1e29) continue;
      compared += 1;
      const err = Math.abs(ours - truth);
      if (err <= 1.0) within += 1;                    // 1 ft on a 2100 ft relief
      if (err > maxErr) maxErr = err;
    }
    expect(compared).toBeGreaterThan(800);
    expect(within / compared).toBeGreaterThanOrEqual(0.95);
    expect(maxErr).toBeLessThan(5);

    // GRV from the TPS surface vs analytic truth
    const grv = grvAcreFt(result, spec.dx, spec.dy, meta.grv.contact_ft);
    expect(Math.abs(grv - meta.grv.grv_acre_ft_analytic) / meta.grv.grv_acre_ft_analytic)
      .toBeLessThan(0.02);
  });

  test('max-extrapolation mask nulls far nodes even inside the hull', () => {
    // ring of controls with an empty centre: hull covers the centre but
    // no control is near it
    const pts = [];
    for (let a = 0; a < 16; a++) {
      const th = (a / 16) * 2 * Math.PI;
      pts.push({ x: 1000 * Math.cos(th), y: 1000 * Math.sin(th), z: 100 });
    }
    const spec = { x0: -1000, y0: -1000, dx: 100, dy: 100, nx: 21, ny: 21 };
    const result = gridSurface(pts, spec, { maxExtrapolation: 250 });
    const centre = result.z[10 * 21 + 10];
    expect(centre).toBe(NULL_F32);                     // hull-inside but far
    expect(result.live).toBeGreaterThan(0);            // rim nodes survive
  });

  test('convex hull is sane', () => {
    const hull = convexHull([
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
      { x: 5, y: 5 }, { x: 2, y: 8 },
    ]);
    expect(hull).toHaveLength(4);
  });

  test('picksToPoints maps pick grid to world coordinates and skips nulls', () => {
    const geom = { nIl: 3, nXl: 4 };
    const picks = new Float32Array(12).fill(NULL_F32);
    picks[0] = 10;                                     // il 0, xl 0
    picks[1 * 4 + 2] = 20;                             // il 1, xl 2
    // legacy corner fallback: identical output to the old axis-aligned path
    const affine = affineFromCorners({
      corners: { first: { x: 1000, y: 5000 }, last: { x: 1075, y: 5050 } },
      il: { count: 3 }, xl: { count: 4 },
    });
    const pts = picksToPoints(picks, geom, affine, (s) => s * 4); // dt 4ms
    expect(pts).toHaveLength(2);
    expect(pts[0]).toEqual({ x: 1000, y: 5000, z: 40 });
    expect(pts[1]).toEqual({ x: 1050, y: 5025, z: 80 });
  });

  test('picksToPoints places rotated-survey picks at the true header coordinates', () => {
    const golden = JSON.parse(fs.readFileSync(
      path.join(DATA_DIR, 'goldens', 'dome_rot.json'), 'utf8'));
    const t = golden.affine_truth;
    const affine = {
      origin: t.origin,
      ilVec: t.il_vec,
      xlVec: t.xl_vec,
    };
    const { n_il: nIl, n_xl: nXl } = golden.geometry;
    const picks = new Float32Array(nIl * nXl);
    for (let k = 0; k < picks.length; k++) picks[k] = 25; // any live sample
    const pts = picksToPoints(picks, { nIl, nXl }, affine, (s) => -s);
    expect(pts).toHaveLength(nIl * nXl);
    // header coordinates round to cm (scalar -100); the affine is exact
    const cxBytes = Buffer.from(golden.coord_grids.x.base64, 'base64');
    const cyBytes = Buffer.from(golden.coord_grids.y.base64, 'base64');
    const cx = new Float64Array(cxBytes.buffer, cxBytes.byteOffset, nIl * nXl);
    const cy = new Float64Array(cyBytes.buffer, cyBytes.byteOffset, nIl * nXl);
    let maxErr = 0;
    for (let k = 0; k < pts.length; k++) {
      maxErr = Math.max(maxErr, Math.abs(pts[k].x - cx[k]), Math.abs(pts[k].y - cy[k]));
    }
    expect(maxErr).toBeLessThan(0.006);
    // and the old axis-aligned assumption would have been >100 m wrong here
    const legacy = affineFromCorners({
      corners: { first: golden.corner_coords.first, last: golden.corner_coords.last },
      il: { count: nIl }, xl: { count: nXl },
    });
    const wrong = picksToPoints(picks, { nIl, nXl }, legacy, (s) => -s);
    const worst = Math.max(...wrong.map((p, k) =>
      Math.hypot(p.x - cx[k], p.y - cy[k])));
    expect(worst).toBeGreaterThan(100);
  });
});

describe('ReservoirCalc Pro round-trip', () => {
  test('our XYZ export imports through SurfaceParser and reproduces the surface', async () => {
    const g = analyticGrid();
    const text = writeXYZ(g);
    const file = new File([text], 'seismolord_export.xyz');
    const result = await SurfaceParser.parse(file);
    expect(result.points.length).toBe(meta.live_nodes);
    const zs = result.points.map((p) => p.z);
    expect(Math.min(...zs)).toBeCloseTo(meta.z_min_ft, 3);
    expect(Math.max(...zs)).toBeCloseTo(meta.z_max_ft, 3);
    expect(Math.max(...zs)).toBeLessThan(0);           // negative-down held
  });
});

describe('export guards (ML5 / L2 hardening)', () => {
  const bounds = { x0: 0, y0: 0, x1: 5000, y1: 4000 };

  test('exportGridSpec falls back to the bin on bad cells and honours good ones', () => {
    expect(exportGridSpec(bounds, 0, 25).dx).toBe(25);
    expect(exportGridSpec(bounds, NaN, 25).dx).toBe(25);
    expect(exportGridSpec(bounds, -10, 25).dx).toBe(25);
    const s = exportGridSpec(bounds, 50, 25);
    expect(s.dx).toBe(50);
    expect(s.nx).toBe(101);
    expect(s.ny).toBe(81);
  });

  test('exportGridSpec refuses a cell that blows the node ceiling, naming the minimum', () => {
    // 0.05 m over 5 km x 4 km = 8e9 nodes
    expect(() => exportGridSpec(bounds, 0.05, 25))
      .toThrow(/ceiling.*use a cell of ~\d+ m or larger/s);
    // custom ceiling to keep the test cheap: 100x80 nodes ok, 1000x800 not
    expect(() => exportGridSpec(bounds, 5, 25, 10000)).toThrow(/ceiling/);
    expect(exportGridSpec(bounds, 51, 25, 10000).nx).toBe(99);
  });

  test('writeCPS3 refuses an all-null grid instead of writing Infinity limits', () => {
    const g = {
      z: new Float32Array(9).fill(NULL_F32),
      nx: 3,
      ny: 3,
      dx: 25,
      dy: 25,
      x: [0, 25, 50],
      y: [0, 25, 50],
    };
    expect(() => writeCPS3(g)).toThrow(/no live nodes/);
    // one live node makes it valid again
    g.z[4] = -6000;
    expect(writeCPS3(g)).toContain('FSLIMI');
  });
});
