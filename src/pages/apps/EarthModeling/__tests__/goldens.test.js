/**
 * G8.1 acceptance — the earth-modeling engine matches the INDEPENDENT
 * oracle goldens (test-data/earthmodel/, anchors A1–A9 asserted at
 * generation; see the goldens README). Engine computes in float64 on
 * the float64 fixture grids, so structural/trajectory/population
 * comparisons run at 1e-12 relative (1e-9 where normal-equation
 * conditioning dominates); float32 happens only at the publish edge.
 */

import fs from 'fs';
import path from 'path';
import { buildFramework, isNull } from '../engine/framework';
import { labelBlocks, blockCensus, pointInPolygon } from '../engine/blocks';
import { minCurvature, positionAtMd, wellTies, zoneControlPoints } from '../engine/wellties';
import { weightedMean, planeFit, simpleKrige, populateZoneProperty } from '../engine/properties';
import { zoneVolumes } from '../engine/volumes';

const DATA_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'test-data', 'earthmodel');
const G = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'goldens.json'), 'utf8'));

const close = (a, b, tol = 1e-12) =>
  Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

function expectClose(actual, golden, label, tol = 1e-12) {
  if (!close(actual, golden, tol)) {
    throw new Error(`${label}: engine ${actual} vs golden ${golden}`);
  }
  expect(true).toBe(true);
}

const SPEC = G.model_spec;
const SURFACES = ['s1', 's2', 's3'].map((k) => ({
  z: Float64Array.from(G.source_grids[k]),
  spec: G.source_specs[k],
}));

const WELLS = Object.entries(G.wells).map(([name, w]) => ({
  name,
  x: w.head.x,
  y: w.head.y,
  kb_m: w.head.kb,
  deviation: w.deviation,
  tops: Object.entries(w.tops).map(([topName, md]) => ({ name: topName, md_m: md })),
  zones: Object.entries(w.zones).map(([zoneName, z]) => ({
    name: zoneName, top_md_m: z.top_md, base_md_m: z.base_md,
  })),
}));

const FRAME = buildFramework(SURFACES, SPEC);
const LABELS = labelBlocks(SPEC, [G.fault_polygon]);

describe('structural framework vs goldens', () => {
  test('resampled stack matches the oracle node-for-node', () => {
    FRAME.grids.forEach((z, i) => {
      const gold = G.framework.resampled[i];
      for (let j = 0; j < z.length; j++) expectClose(z[j], gold[j], `resampled[${i}][${j}]`);
    });
  });

  test('monotonic clamp: grids, counts and the 180-node pinch-out', () => {
    expect(FRAME.counts).toEqual(G.framework.clamp_counts);
    FRAME.clamped.forEach((z, i) => {
      const gold = G.framework.clamped[i];
      for (let j = 0; j < z.length; j++) expectClose(z[j], gold[j], `clamped[${i}][${j}]`);
    });
  });

  test('zone thickness grids (incl. the clamped-to-zero pinch-out)', () => {
    const goldT = [G.framework.thickness_a, G.framework.thickness_b];
    FRAME.thickness.forEach((z, i) => {
      for (let j = 0; j < z.length; j++) {
        if (isNull(goldT[i][j])) expect(isNull(z[j])).toBe(true);
        else expectClose(z[j], goldT[i][j], `thickness[${i}][${j}]`);
      }
    });
  });
});

describe('fault blocks vs goldens', () => {
  test('labels match exactly and the census is {0:326, 1:174}', () => {
    expect(Array.from(LABELS)).toEqual(G.blocks.labels);
    expect(blockCensus(LABELS)).toEqual(
      Object.fromEntries(Object.entries(G.blocks.census).map(([k, v]) => [k, v])),
    );
  });
});

describe('well paths and ties vs goldens', () => {
  test('minimum-curvature trajectories', () => {
    for (const [name, w] of Object.entries(G.wells)) {
      const traj = minCurvature(w.deviation, w.head.kb, w.head.x, w.head.y);
      expect(traj.length).toBe(w.traj.length);
      traj.forEach((st, i) => {
        for (const k of ['md', 'x', 'y', 'tvd', 'tvdss']) {
          expectClose(st[k], w.traj[i][k], `${name} traj[${i}].${k}`);
        }
      });
    }
  });

  test('position interpolation hits stations exactly', () => {
    const w2 = G.wells.W2;
    const traj = minCurvature(w2.deviation, w2.head.kb, w2.head.x, w2.head.y);
    const st = traj[2];
    const pos = positionAtMd(traj, st.md);
    expect(pos.x).toBe(st.x);
    expect(pos.tvdss).toBe(st.tvdss);
  });

  test('well-tie residuals against the clamped framework', () => {
    const rows = wellTies(WELLS, FRAME.clamped, SPEC, { TopA: 0, TopB: 1, BaseB: 2 });
    const goldByKey = new Map(G.well_ties.map((r) => [`${r.well}|${r.top}`, r]));
    expect(rows.length).toBe(G.well_ties.length);
    for (const row of rows) {
      const gold = goldByKey.get(`${row.well}|${row.top}`);
      expect(gold).toBeDefined();
      for (const [k, gk] of [['x', 'x'], ['y', 'y'], ['tvdss', 'tvdss']]) {
        expectClose(row[k], gold[gk], `${row.well}/${row.top}.${k}`);
      }
      if (gold.residual_m === null) {
        expect(row.residualM).toBeNull();
      } else {
        expectClose(row.surfaceZ, gold.surface_z, `${row.well}/${row.top}.surfaceZ`);
        expectClose(row.residualM, gold.residual_m, `${row.well}/${row.top}.residual`);
      }
    }
  });

  test('zone-A control points (midpoint XY along path, interval weight)', () => {
    const pts = zoneControlPoints(WELLS, 'A');
    const goldByWell = new Map(G.control_points_a.map((p) => [p.well, p]));
    expect(pts.length).toBe(G.control_points_a.length);
    for (const p of pts) {
      const gold = goldByWell.get(p.well);
      expectClose(p.x, gold.x, `${p.well}.x`);
      expectClose(p.y, gold.y, `${p.well}.y`);
      expectClose(p.w, gold.w, `${p.well}.w`);
    }
  });
});

describe('property population vs goldens', () => {
  const PTS = G.population.points;

  test('weighted-mean constant', () => {
    expectClose(
      weightedMean(PTS.map((p) => p.v), PTS.map((p) => p.w)),
      G.population.constant_weighted, 'constant',
    );
  });

  test('planar trend recovery', () => {
    const [a, b, c] = planeFit(PTS);
    const [ga, gb, gc] = G.population.trend.coeffs;
    expectClose(a, ga, 'trend.a', 1e-9);
    expectClose(b, gb, 'trend.b', 1e-9);
    expectClose(c, gc, 'trend.c', 1e-9);
    for (const probe of G.population.trend.probes) {
      expectClose(a + b * probe.x + c * probe.y, probe.v, 'trend probe', 1e-9);
    }
  });

  test.each(['krige_spherical', 'krige_exponential'])('%s probes', (key) => {
    const fixture = G.population[key];
    const params = {
      model: fixture.params.model,
      range: fixture.params.range,
      sill: fixture.params.sill,
      nugget: fixture.params.nugget,
    };
    const values = simpleKrige(PTS, G.population.mean, params, fixture.targets);
    values.forEach((v, i) => expectClose(v, fixture.values[i], `${key}[${i}]`));
  });

  test('kriging honors the data and returns the mean far away', () => {
    const fixture = G.population.krige_spherical;
    const values = simpleKrige(PTS, G.population.mean, fixture.params, fixture.targets);
    expectClose(values[4], PTS[0].v, 'exact at data');
    expectClose(values[5], G.population.mean, 'mean at infinity');
  });
});

describe('per-block population + zone volumes vs goldens', () => {
  const zoneGrids = {}; // zone key -> { prop -> grid }

  const buildProps = (controlPoints) => {
    const grids = {};
    for (const prop of ['ntg', 'phi', 'sw']) {
      const all = controlPoints.map((p) => ({ x: p.x, y: p.y, v: p[prop], w: p.w }));
      const byBlock = { 0: [], 1: [] };
      all.forEach((p) => {
        byBlock[pointInPolygon(p.x, p.y, G.fault_polygon) ? 1 : 0].push(p);
      });
      const { z, provenance } = populateZoneProperty(SPEC, LABELS, byBlock, all, 'constant');
      grids[prop] = z;
      for (const p of provenance) {
        expect(p.methodUsed).toBe('constant');
        expect(p.fellBack).toBe(false);
      }
    }
    return grids;
  };

  beforeAll(() => {
    zoneGrids.zone_a = buildProps(G.control_points_a);
    zoneGrids.zone_b = buildProps(G.control_points_b);
  });

  test('constant-per-block values match the fixture (both zones)', () => {
    for (const key of ['zone_a', 'zone_b']) {
      for (const prop of ['ntg', 'phi', 'sw']) {
        const z = zoneGrids[key][prop];
        const gold = G.block_prop_values[key][prop];
        for (let j = 0; j < z.length; j++) {
          const want = LABELS[j] === 1 ? gold.block1 : gold.block0;
          expectClose(z[j], want, `${key}.${prop}[${j}]`);
        }
      }
    }
  });

  test.each([['zone_a', 0], ['zone_b', 1]])('%s volume table', (key, zoneIdx) => {
    const vols = zoneVolumes(SPEC, FRAME.thickness[zoneIdx], LABELS, zoneGrids[key]);
    const gold = G.volumes[key];
    expect(Object.keys(vols).sort()).toEqual(Object.keys(gold).sort());
    for (const [block, table] of Object.entries(gold)) {
      for (const field of ['bulk_m3', 'net_m3', 'pore_m3', 'hcpv_m3']) {
        expectClose(vols[block][field], table[field], `${key}.${block}.${field}`, 1e-9);
      }
      expect(vols[block].cells).toBe(table.cells);
    }
  });
});
