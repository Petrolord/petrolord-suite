/**
 * Wells Phase W3 acceptance (Seismolord-WELLS-PLAN.md): calibration on
 * ties from a KNOWN layer cake recovers each layer's V0 to < 1% from
 * perturbed starting values; residuals are honest (an inconsistent top
 * shows a large residual, never a silently averaged-away fit); the
 * single-function model fits V0 (and optionally k) and recovers the
 * golden wells' truth model exactly.
 */
import fs from 'fs';
import path from 'path';

import {
  segGain, sampleGridAt, buildTiePoints, fitWellTie,
} from '@/pages/apps/Seismolord/engine/wellTie';
import {
  normalizeVelocity, layerTimesMs, layercakeDepthM, makeDepthConverter,
} from '@/pages/apps/Seismolord/engine/velocityModel';
import { surveyAffine, ilxlToWorld } from '@/pages/apps/Seismolord/engine/surveyGeometry';
import { NULL_VALUE } from '@/pages/apps/Seismolord/engine/manifest';

const NULL_F32 = Math.fround(NULL_VALUE);

const GOLDEN = JSON.parse(fs.readFileSync(path.join(
  __dirname, '..', '..', '..', '..', '..',
  'test-data', 'seismolord', 'wells', 'wells.json',
), 'utf8'));

const DT_US = 4000;

describe('layerTimesMs consistency with layercakeDepthM', () => {
  const layers = [{ v0: 1500, k: 0.2 }, { v0: 2400, k: 0 }, { v0: 3200, k: 0.4 }];
  const cases = [
    [[100, 180], 250],
    [[100, 180], 60],          // inside layer 1
    [[null, 180], 250],        // null boundary: layer 1 extends
    [[200, 150], 250],         // crossing picks: clamp to zero thickness
    [[100, 180], 100],         // exactly on a boundary
  ];
  test.each(cases)('boundaries %j at t=%d', (bms, t) => {
    const times = layerTimesMs(layers, bms, t);
    expect(times.reduce((s, x) => s + x, 0)).toBeCloseTo(t, 9);
    const viaTimes = layers.reduce(
      (s, l, i) => s + l.v0 * segGain(l.k, times[i] / 2000), 0,
    );
    expect(viaTimes).toBeCloseTo(layercakeDepthM(layers, bms, t), 9);
  });
});

describe('sampleGridAt', () => {
  const grid = Float32Array.from([10, 20, 30, 40]);   // 2x2

  test('bilinear over live nodes; nearest live when a node is null', () => {
    expect(sampleGridAt(grid, 2, 2, 0.5, 0.5)).toBeCloseTo(25, 9);
    expect(sampleGridAt(grid, 2, 2, 0, 0)).toBe(10);
    const holed = Float32Array.from([10, NULL_F32, 30, 40]);
    expect(sampleGridAt(holed, 2, 2, 0.1, 0.9)).toBe(10);   // nearest live
    const dead = new Float32Array(4).fill(NULL_F32);
    expect(sampleGridAt(dead, 2, 2, 0.5, 0.5)).toBeNull();
    expect(sampleGridAt(grid, 2, 2, -2, 0)).toBeNull();     // off survey
  });
});

// ---------------------------------------------------------------------
// Known layer cake: 3 layers over a 16x16 lattice, boundaries B1 at
// 100 ms and B2 at 180 ms (flat), tie horizons inside each layer.
// Ties are synthesized from the TRUE model, then fitting starts from a
// heavily perturbed model.
// ---------------------------------------------------------------------
const GEOM16 = { nIl: 16, nXl: 16 };
const TRUE_CAKE = normalizeVelocity({
  type: 'layercake',
  layers: [
    { base_horizon_id: 'b1', v0: 1600, k: 0 },
    { base_horizon_id: 'b2', v0: 2400, k: 0 },
    { base_horizon_id: null, v0: 3400, k: 0 },
  ],
});
const PERTURBED_CAKE = normalizeVelocity({
  type: 'layercake',
  layers: [
    { base_horizon_id: 'b1', v0: 1900, k: 0 },
    { base_horizon_id: 'b2', v0: 2000, k: 0 },
    { base_horizon_id: null, v0: 4200, k: 0 },
  ],
});
const flatGrid = (s) => new Float32Array(GEOM16.nIl * GEOM16.nXl).fill(s);
const BOUNDARIES = [flatGrid(25), flatGrid(45)];   // 100 ms, 180 ms @ 4 ms

const trueConv = makeDepthConverter(
  { type: 'layercake', layers: TRUE_CAKE.layers.map((l) => ({ base_horizon_id: l.baseHorizonId, v0: l.v0, k: l.k })) },
  { dtUs: DT_US, boundaries: BOUNDARIES },
);
/** A tie at time t (ms) with the TRUE depth (optionally biased). */
const tieAt = (tMs, cell = 0, biasM = 0, name = `t${tMs}`) => ({
  wellName: 'SYN', topName: name, horizonId: 'h', il: 0, xl: 0, cell,
  twtMs: tMs, zTopM: trueConv.toDepthM(tMs, cell) + biasM,
});

describe('layer-cake calibration (W3 acceptance)', () => {
  test('recovers every sampled layer V0 to < 1% from a perturbed start', () => {
    const ties = [tieAt(60), tieAt(140), tieAt(150), tieAt(240), tieAt(300)];
    const res = fitWellTie(ties, PERTURBED_CAKE, { boundaries: BOUNDARIES, dtUs: DT_US });
    const v0s = res.model.layers.map((l) => l.v0);
    expect(Math.abs(v0s[0] - 1600) / 1600).toBeLessThan(0.01);
    expect(Math.abs(v0s[1] - 2400) / 2400).toBeLessThan(0.01);
    expect(Math.abs(v0s[2] - 3400) / 3400).toBeLessThan(0.01);
    expect(res.fittedLayers).toEqual([true, true, true]);
    expect(res.rmsBeforeM).toBeGreaterThan(5);
    expect(res.rmsAfterM).toBeLessThan(0.1);
    for (const r of res.residuals) expect(Math.abs(r.afterM)).toBeLessThan(0.1);
  });

  test('an unsampled deep layer keeps its current V0 and is reported', () => {
    const ties = [tieAt(60), tieAt(90)];               // never leaves layer 1
    const res = fitWellTie(ties, PERTURBED_CAKE, { boundaries: BOUNDARIES, dtUs: DT_US });
    expect(res.fittedLayers).toEqual([true, false, false]);
    expect(res.model.layers[0].v0).toBeCloseTo(1600, 0);
    expect(res.model.layers[1].v0).toBe(2000);         // untouched
    expect(res.model.layers[2].v0).toBe(4200);
  });

  test('an inconsistent top shows a LARGE residual, not a silent average', () => {
    const ties = [
      tieAt(60), tieAt(80),                            // layer 1
      tieAt(120), tieAt(130), tieAt(140), tieAt(160), tieAt(170),  // layer 2
      tieAt(240), tieAt(300),                          // layer 3
      tieAt(150, 0, 80, 'bad'),                        // 80 m off the truth
    ];
    const res = fitWellTie(ties, PERTURBED_CAKE, { boundaries: BOUNDARIES, dtUs: DT_US });
    const bad = res.residuals.find((r) => r.topName === 'bad');
    const worstGood = Math.max(...res.residuals
      .filter((r) => r.topName !== 'bad').map((r) => Math.abs(r.afterM)));
    expect(Math.abs(bad.afterM)).toBeGreaterThan(30);  // not absorbed
    expect(Math.abs(bad.afterM)).toBeGreaterThan(worstGood * 2);
  });

  test('domain errors: no ties, missing boundaries, non-positive fit', () => {
    expect(() => fitWellTie([], TRUE_CAKE, { boundaries: BOUNDARIES, dtUs: DT_US }))
      .toThrow(/No usable tie points/);
    expect(() => fitWellTie([tieAt(60)], TRUE_CAKE, { dtUs: DT_US }))
      .toThrow(/boundary horizon grids/);
    const impossible = [tieAt(60), { ...tieAt(140), zTopM: -400 }];
    expect(() => fitWellTie(impossible, PERTURBED_CAKE, {
      boundaries: BOUNDARIES, dtUs: DT_US,
    })).toThrow(/not positive|inconsistent/);
  });
});

describe('single-function calibration on the golden wells', () => {
  // ties straight from the goldens: each well's Dome top depth vs the
  // analytic dome TWT at the top location — synthesized by the oracle
  // from the truth model v0=1800, k=0.5
  const domeTwt = (x, y) => {
    const d = GOLDEN.dome;
    const r2 = (x - d.xc) ** 2 + (y - d.yc) ** 2;
    return d.t_crest_ms + d.t_relief_ms * (r2 / d.rmax2);
  };
  const ties = GOLDEN.wells.map((w) => ({
    wellName: w.name, topName: 'Dome', horizonId: 'dome', il: 0, xl: 0,
    cell: 0, twtMs: domeTwt(w.tops[0].x, w.tops[0].y), zTopM: w.tops[0].tvdss_m,
  }));

  test('fits V0 with k fixed: exact recovery of the truth 1800 m/s', () => {
    const start = normalizeVelocity({ v0: 2400, k: GOLDEN.velocity.k });
    const res = fitWellTie(ties, start, { dtUs: DT_US });
    expect(res.model.kind).toBe('linear');
    expect(res.model.v0).toBeCloseTo(GOLDEN.velocity.v0, 1);
    expect(res.rmsAfterM).toBeLessThan(0.05);
    expect(res.rmsBeforeM).toBeGreaterThan(10);
  });

  test('fitK recovers BOTH v0 and k from a fully wrong start', () => {
    const start = normalizeVelocity({ v0: 3000, k: 0 });
    const res = fitWellTie(ties, start, { dtUs: DT_US, fitK: true });
    expect(res.model.v0).toBeCloseTo(GOLDEN.velocity.v0, 0);
    expect(res.model.k).toBeCloseTo(GOLDEN.velocity.k, 2);
    expect(res.rmsAfterM).toBeLessThan(0.05);
  });
});

describe('buildTiePoints', () => {
  test('golden well tops tie to a synthetic horizon at the right TWT and depth', () => {
    const affine = surveyAffine({ affine: GOLDEN.lattice_affines.dome_ieee });
    const geom = { nIl: 32, nXl: 32 };
    // a horizon grid that IS the analytic dome sampled on the lattice
    const d = GOLDEN.dome;
    const grid = new Float32Array(geom.nIl * geom.nXl);
    for (let i = 0; i < geom.nIl; i++) {
      for (let j = 0; j < geom.nXl; j++) {
        const wpt = ilxlToWorld(affine, i, j);
        const r2 = (wpt.x - d.xc) ** 2 + (wpt.y - d.yc) ** 2;
        grid[i * geom.nXl + j] = (d.t_crest_ms + d.t_relief_ms * (r2 / d.rmax2)) / 4;
      }
    }
    const wells = GOLDEN.wells.map((w) => ({
      name: w.name,
      deviation: w.stations.length > 2 ? w.stations : null,
      tdMdM: w.td_md_m,
      surfaceX: w.surface.x,
      surfaceY: w.surface.y,
      kbM: w.kb_m,
      tops: w.tops.map((t) => ({ name: t.name, md: t.md_m })),
    }));
    const ties = buildTiePoints(wells, [{ topName: 'Dome', horizonId: 'dome' }], {
      affine, geom, dtUs: DT_US, horizonGrids: new Map([['dome', grid]]),
    });
    expect(ties).toHaveLength(GOLDEN.wells.length);
    for (let i = 0; i < ties.length; i++) {
      const g = GOLDEN.wells[i].tops[0];
      expect(ties[i].zTopM).toBeCloseTo(g.tvdss_m, 6);
      // bilinear over the curved dome differs from the point value only
      // by the lattice discretisation — well under a sample
      const truth = d.t_crest_ms + d.t_relief_ms
        * (((g.x - d.xc) ** 2 + (g.y - d.yc) ** 2) / d.rmax2);
      expect(Math.abs(ties[i].twtMs - truth)).toBeLessThan(4);
    }
    // an unpaired name or missing grid yields no ties
    expect(buildTiePoints(wells, [{ topName: 'Nope', horizonId: 'dome' }], {
      affine, geom, dtUs: DT_US, horizonGrids: new Map([['dome', grid]]),
    })).toHaveLength(0);
  });
});
