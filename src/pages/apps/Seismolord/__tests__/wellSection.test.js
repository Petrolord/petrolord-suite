/**
 * Wells Phase W2 acceptance (Seismolord-WELLS-PLAN.md): T(z) resolution
 * (checkshots first, inverted velocity model second) reproduces the
 * golden T(z) to < 1 sample; a top sitting exactly on the dome surface
 * plots on the horizon overlay within 1 sample on sections AND
 * traverses; corridor projection pen-breaks outside ~1.5 cells.
 */
import fs from 'fs';
import path from 'path';

import {
  makeTvdssToTwt, buildWellLatticePath, projectWellToSection, normalizeStations,
} from '@/pages/apps/Seismolord/engine/wellSection';
import { projectStickToTraverse } from '@/pages/apps/Seismolord/engine/traverse';
import { surveyAffine } from '@/pages/apps/Seismolord/engine/surveyGeometry';
import { normalizeVelocity } from '@/pages/apps/Seismolord/engine/velocityModel';
import { wellPolylines, wellTopMarkers } from '@/pages/apps/Seismolord/viewer/interpMesh';

const GOLDEN = JSON.parse(fs.readFileSync(path.join(
  __dirname, '..', '..', '..', '..', '..',
  'test-data', 'seismolord', 'wells', 'wells.json',
), 'utf8'));

// the dome_ieee fixture's frame: 32x32x64 @ 4 ms
const GEOM = { nIl: 32, nXl: 32, ns: 64 };
const DT_US = 4000;
const DT_MS = 4;
const MAX_TWT = (GEOM.ns - 1) * DT_MS;
const AFFINE = surveyAffine({ affine: GOLDEN.lattice_affines.dome_ieee });
const VELOCITY = normalizeVelocity({ v0: GOLDEN.velocity.v0, k: GOLDEN.velocity.k });

/** Golden truth T(z), independent of the app (matches gen_wells.py). */
const truthTwt = (z) => 2000.0 * Math.log1p(GOLDEN.velocity.k * z / GOLDEN.velocity.v0)
  / GOLDEN.velocity.k;

/** Analytic dome TWT at a world position (golden dome block). */
const domeTwt = (x, y) => {
  const d = GOLDEN.dome;
  const r2 = (x - d.xc) ** 2 + (y - d.yc) ** 2;
  return d.t_crest_ms + d.t_relief_ms * (r2 / d.rmax2);
};

const asWell = (w) => ({
  deviation: w.stations.length > 2 ? w.stations : null,
  tdMdM: w.td_md_m,
  surfaceX: w.surface.x,
  surfaceY: w.surface.y,
  kbM: w.kb_m,
  tops: w.tops.map((t) => ({ name: t.name, md: t.md_m })),
});

describe('makeTvdssToTwt', () => {
  test('checkshots take priority and reproduce the table exactly + linearly between', () => {
    const w = GOLDEN.wells[1];                        // KETA-S1
    const conv = makeTvdssToTwt({
      checkshots: w.checkshots, velocity: VELOCITY, dtUs: DT_US, maxTwtMs: MAX_TWT,
    });
    expect(conv.source).toBe('checkshots');
    for (const cs of w.checkshots) {
      expect(conv.toTwtMs(cs.tvdss_m)).toBeCloseTo(cs.twt_ms, 9);
    }
    const a = w.checkshots[2];
    const b = w.checkshots[3];
    const zm = (a.tvdss_m + b.tvdss_m) / 2;
    expect(conv.toTwtMs(zm)).toBeCloseTo((a.twt_ms + b.twt_ms) / 2, 9);
  });

  test('model inversion matches the golden analytic T(z) to << 1 sample', () => {
    const conv = makeTvdssToTwt({
      checkshots: null, velocity: VELOCITY, dtUs: DT_US, maxTwtMs: MAX_TWT,
    });
    expect(conv.source).toBe('model');
    for (const z of [1, 25, 91.13, 150, 200]) {
      expect(Math.abs(conv.toTwtMs(z) - truthTwt(z))).toBeLessThan(1e-6);
    }
    expect(conv.toTwtMs(0)).toBe(0);
    expect(conv.toTwtMs(-5)).toBeNull();              // above datum
    expect(conv.toTwtMs(1e6)).toBeNull();             // below the window
  });

  test('layer-cake inversion round-trips through the app depth converter', () => {
    const boundaryS = new Float32Array(4).fill(25);   // boundary at 100 ms on a 2x2 grid
    const model = normalizeVelocity({
      type: 'layercake',
      layers: [
        { base_horizon_id: 'h1', v0: 1500, k: 0 },
        { base_horizon_id: null, v0: 3000, k: 0 },
      ],
    });
    const conv = makeTvdssToTwt({
      checkshots: null, velocity: model, boundaries: [boundaryS],
      dtUs: DT_US, maxTwtMs: MAX_TWT,
    });
    // layer 1: 1500 m/s to 100 ms -> 75 m; below: 3000 m/s
    expect(conv.toTwtMs(75, 0)).toBeCloseTo(100, 6);
    expect(conv.toTwtMs(75 + 150, 0)).toBeCloseTo(200, 6);
  });

  test('no checkshots and no model -> null (map-only well)', () => {
    expect(makeTvdssToTwt({ checkshots: [], velocity: null, dtUs: DT_US, maxTwtMs: MAX_TWT }))
      .toBeNull();
  });
});

describe.each(GOLDEN.wells.map((w) => [w.name, w]))('%s lattice path', (_name, w) => {
  const conv = makeTvdssToTwt({
    checkshots: null, velocity: VELOCITY, dtUs: DT_US, maxTwtMs: MAX_TWT,
  });
  // stepM 10 aligns the samples with the oracle's 10 m fine path, so
  // every on-survey point compares against the truth at the SAME MD
  const built = buildWellLatticePath(asWell(w), {
    affine: AFFINE, timeConv: conv, geom: GEOM, dtUs: DT_US, stepM: 10,
  });

  test('projected TWT matches the golden T(z) to < 1 sample everywhere on-survey', () => {
    expect(built).not.toBeNull();
    const stations = normalizeStations(asWell(w));
    expect(stations.length).toBeGreaterThanOrEqual(2);
    const fineByMd = new Map(w.fine_path.map((f) => [f.md, f]));
    let checked = 0;
    for (const q of built.points) {
      if (q.s == null) continue;
      const g = fineByMd.get(q.md);
      if (!g) continue;
      const sTruth = truthTwt(g.tvdss) / DT_MS;
      expect(Math.abs(q.s - sTruth)).toBeLessThan(1);
      // measured agreement is bisection-tight, nowhere near the gate
      expect(Math.abs(q.s - sTruth)).toBeLessThan(1e-6);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(3);
  });

  test('the Dome top plots on the horizon overlay within 1 sample — section AND traverse', () => {
    const top = built.tops.find((t) => t.name === 'Dome');
    expect(top).toBeDefined();

    // horizon overlay truth: the analytic dome grid in sample units
    const gTop = w.tops[0];
    const sDome = domeTwt(gTop.x, gTop.y) / DT_MS;
    expect(Math.abs(top.s - sDome)).toBeLessThan(1);

    // section: the top falls inside the corridor of its nearest inline
    // and its projected s is the same value the overlay draws
    const idx = Math.round(top.il);
    const proj = projectWellToSection([top], 'inline', idx);
    expect(proj[0]).not.toBeNull();
    expect(Math.abs(proj[0].s - sDome)).toBeLessThan(1);

    // traverse: a path running through the top's crossline row
    const positions = Array.from({ length: GEOM.nXl }, (_, xl) => ({ il: idx, xl }));
    const tproj = projectStickToTraverse([top], positions);
    expect(tproj).not.toBeNull();
    // nearest column (a dead-centre 15.5 may tie either way)
    expect(Math.abs(tproj[0].trace - top.xl)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(tproj[0].s - sDome)).toBeLessThan(1);
  });
});

describe('corridor projection + cube-space geometry', () => {
  const pts = [
    { il: 10.0, xl: 4, s: 10 },
    { il: 10.8, xl: 5, s: 20 },
    { il: 12.0, xl: 6, s: 30 },   // 2 cells off inline 10 — break
    { il: 10.4, xl: 7, s: null }, // no time — break
    { il: 9.2, xl: 8, s: 50 },
  ];

  test('pen-breaks outside ~1.5 cells and on timeless samples', () => {
    const proj = projectWellToSection(pts, 'inline', 10);
    expect(proj[0]).toEqual({ trace: 4, s: 10, dist: 0 });
    expect(proj[1].dist).toBeCloseTo(0.8, 9);
    expect(proj[2]).toBeNull();
    expect(proj[3]).toBeNull();
    expect(proj[4].trace).toBe(8);
    expect(projectWellToSection(pts, 'xline', 200)).toBeNull();
  });

  test('H1 leaves the survey: off-survey samples are pen-breaks, never drawn', () => {
    const h1 = GOLDEN.wells.find((w) => w.kind === 'horizontal');
    const conv = makeTvdssToTwt({
      checkshots: null, velocity: VELOCITY, dtUs: DT_US, maxTwtMs: MAX_TWT,
    });
    const built = buildWellLatticePath(asWell(h1), {
      affine: AFFINE, timeConv: conv, geom: GEOM, dtUs: DT_US,
    });
    const last = built.points[built.points.length - 1];  // 3.9 km lateral end
    expect(last.s).toBeNull();
    expect(built.points.some((q) => q.s != null)).toBe(true);
  });

  test('wellPolylines breaks segments at null s; top markers are 3 crossed segments', () => {
    const soup = wellPolylines(pts, GEOM);
    // pairs: (0,1), (1,2)? no — 2 is live... breaks only at null s:
    // live run 0,1,2 -> 2 segments; break at 3; then 4 alone -> 0
    expect(soup.length).toBe(2 * 2 * 3);
    const marks = wellTopMarkers([{ il: 10, xl: 4, s: 10 }], GEOM);
    expect(marks.length).toBe(3 * 2 * 3);
    expect(wellTopMarkers([{ il: 1, xl: 1, s: null }], GEOM).length).toBe(0);
  });
});
