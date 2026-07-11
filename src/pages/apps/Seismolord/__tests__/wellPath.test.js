/**
 * Wells Phase W0 acceptance (Seismolord-WELLS-PLAN.md): the JS
 * minimum-curvature engine matches the published worked example and
 * the Python-oracle goldens to < 1 cm over paths up to 5 km; the
 * vertical-well header shortcut bit-matches the general method; the
 * goldens' checkshots and dome tops are consistent with the app's OWN
 * velocity engine (engine/velocityModel.js), tying W0 to W2/W3 math.
 */
import fs from 'fs';
import path from 'path';

import {
  computeWellPath, verticalWellPath, positionAtMd, doglegRad, ratioFactor,
} from '@/pages/apps/Seismolord/engine/wellPath';
import { twtMsToDepthM } from '@/pages/apps/Seismolord/engine/velocityModel';
import { surveyAffine, worldToIlxl } from '@/pages/apps/Seismolord/engine/surveyGeometry';

const GOLDEN = JSON.parse(fs.readFileSync(path.join(
  __dirname, '..', '..', '..', '..', '..',
  'test-data', 'seismolord', 'wells', 'wells.json',
), 'utf8'));

const TOL_M = 0.01;                       // 1 cm acceptance

describe('published worked example (drillingformulas.com)', () => {
  test('ΔN/ΔE/ΔTVD reproduce the printed results', () => {
    const ex = GOLDEN.published_example;
    const p = computeWellPath(ex.stations);
    const last = p[p.length - 1];
    expect(last.y).toBeCloseTo(ex.expected.d_north, 2);   // 27.22 ft
    expect(last.x).toBeCloseTo(ex.expected.d_east, 2);    // 19.45 ft
    expect(last.tvd).toBeCloseTo(ex.expected.d_tvd, 2);   // 94.01 ft
  });
});

describe.each(GOLDEN.wells.map((w) => [w.name, w]))('%s', (_name, w) => {
  const opts = { surfaceX: w.surface.x, surfaceY: w.surface.y, kb: w.kb_m };
  const jsPath = computeWellPath(w.stations, opts);

  test('station positions match the oracle to < 1 cm', () => {
    expect(jsPath).toHaveLength(w.path.length);
    let worst = 0;
    for (let i = 0; i < w.path.length; i++) {
      const g = w.path[i];
      const p = jsPath[i];
      expect(p.md).toBe(g.md);
      worst = Math.max(worst,
        Math.abs(p.x - g.x), Math.abs(p.y - g.y),
        Math.abs(p.tvd - g.tvd), Math.abs(p.tvdss - g.tvdss));
    }
    expect(worst).toBeLessThan(TOL_M);
    // independent implementations of the same float64 math: the real
    // agreement is far tighter than the acceptance bound
    expect(worst).toBeLessThan(1e-6);
  });

  test('arc interpolation matches the oracle fine path to < 1 cm', () => {
    for (const g of w.fine_path) {
      const p = positionAtMd(w.stations, jsPath, g.md);
      expect(p).not.toBeNull();
      expect(Math.abs(p.x - g.x)).toBeLessThan(TOL_M);
      expect(Math.abs(p.y - g.y)).toBeLessThan(TOL_M);
      expect(Math.abs(p.tvdss - g.tvdss)).toBeLessThan(TOL_M);
    }
    expect(positionAtMd(w.stations, jsPath, -1)).toBeNull();
    expect(positionAtMd(w.stations, jsPath, w.td_md_m + 1)).toBeNull();
  });

  test('checkshots agree with the app velocity engine (round trip)', () => {
    const { v0, k } = GOLDEN.velocity;
    for (const cs of w.checkshots) {
      expect(twtMsToDepthM(cs.twt_ms, { v0, k })).toBeCloseTo(cs.tvdss_m, 6);
    }
  });

  test('the Dome top sits on the dome surface through the velocity model', () => {
    const top = w.tops[0];
    const d = GOLDEN.dome;
    const r2 = (top.x - d.xc) ** 2 + (top.y - d.yc) ** 2;
    const twt = d.t_crest_ms + d.t_relief_ms * (r2 / d.rmax2);
    const zDome = twtMsToDepthM(twt, GOLDEN.velocity);
    expect(Math.abs(top.tvdss_m - zDome)).toBeLessThan(TOL_M);
    // and the top lies ON the interpolated path at its MD
    const p = positionAtMd(w.stations, jsPath, top.md_m);
    expect(Math.abs(p.tvdss - top.tvdss_m)).toBeLessThan(TOL_M);
    expect(Math.abs(p.x - top.x)).toBeLessThan(TOL_M);
    expect(Math.abs(p.y - top.y)).toBeLessThan(TOL_M);
  });
});

describe('map placement (W1 acceptance): wells land at the correct IL/XL', () => {
  // the app resolves manifests through surveyAffine; the goldens carry
  // each fixture's exact affine truth plus an INDEPENDENT Python
  // inversion of every well's surface and TD point
  test.each(Object.keys(GOLDEN.lattice_affines))(
    '%s: surface and TD within 0.1 cell of the oracle inversion',
    (specName) => {
      const aff = surveyAffine({ affine: GOLDEN.lattice_affines[specName] });
      for (const w of GOLDEN.wells) {
        const surf = worldToIlxl(aff, w.surface.x, w.surface.y);
        const truthS = w.lattice.surface[specName];
        expect(Math.abs(surf.i - truthS.il)).toBeLessThan(0.1);
        expect(Math.abs(surf.j - truthS.xl)).toBeLessThan(0.1);
        const end = w.path[w.path.length - 1];
        const td = worldToIlxl(aff, end.x, end.y);
        const truthT = w.lattice.td[specName];
        expect(Math.abs(td.i - truthT.il)).toBeLessThan(0.1);
        expect(Math.abs(td.j - truthT.xl)).toBeLessThan(0.1);
        // measured agreement is float64-tight, not just inside the gate
        expect(Math.abs(surf.i - truthS.il)).toBeLessThan(1e-9);
        expect(Math.abs(surf.j - truthS.xl)).toBeLessThan(1e-9);
      }
    },
  );
});

describe('vertical shortcut and degenerate handling', () => {
  test('header-only vertical well bit-matches the general path', () => {
    const v = GOLDEN.wells.find((w) => w.kind === 'vertical');
    const short = verticalWellPath({
      surfaceX: v.surface.x, surfaceY: v.surface.y, kb: v.kb_m, td: v.td_md_m,
    });
    const general = computeWellPath(
      [{ md: 0, inc: 0, azi: 0 }, { md: v.td_md_m, inc: 0, azi: 0 }],
      { surfaceX: v.surface.x, surfaceY: v.surface.y, kb: v.kb_m },
    );
    expect(short).toEqual(general);
    const last = short[short.length - 1];
    expect(last.x).toBe(v.surface.x);                 // exactly no drift
    expect(last.y).toBe(v.surface.y);
    expect(last.tvd).toBe(v.td_md_m);
  });

  test('zero dogleg takes the exact straight-segment limit', () => {
    expect(ratioFactor(0)).toBe(1);
    expect(doglegRad(20, 45, 20, 45)).toBe(0);
    // straight inclined segment: analytic displacement
    const p = computeWellPath([
      { md: 0, inc: 30, azi: 90 }, { md: 200, inc: 30, azi: 90 },
    ]);
    expect(p[1].x).toBeCloseTo(200 * Math.sin(Math.PI / 6), 9);
    expect(p[1].y).toBeCloseTo(0, 9);
    expect(p[1].tvd).toBeCloseTo(200 * Math.cos(Math.PI / 6), 9);
  });

  test('malformed stations raise clear domain errors', () => {
    expect(() => computeWellPath([{ md: 0, inc: 0, azi: 0 }]))
      .toThrow(/at least 2/);
    expect(() => computeWellPath([
      { md: 0, inc: 0, azi: 0 }, { md: 0, inc: 5, azi: 0 },
    ])).toThrow(/must increase/);
    expect(() => computeWellPath([
      { md: 0, inc: 0, azi: 0 }, { md: 100, inc: NaN, azi: 0 },
    ])).toThrow(/non-numeric/);
    expect(() => computeWellPath([
      { md: 0, inc: 0, azi: 0 }, { md: 100, inc: 200, azi: 0 },
    ])).toThrow(/outside 0–180/);
  });
});
