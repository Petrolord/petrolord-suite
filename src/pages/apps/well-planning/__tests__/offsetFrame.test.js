// Offsets on the Design plots: one definition of the candidates (shared
// with the Anti-collision picker) and of the conversion into THIS
// wellbore's frame (wellhead-relative N/E in its depth unit, VS on its
// azimuth, TVD below its KB).

import {
  projectToSection, pickOffsetDesign, assembleOffsetCandidates, chooseDisplayOffsets,
  offsetToChart, NEARBY_RADIUS_M,
} from '../services/offsetFrame';
import { M_TO_FT } from '../engine/surveyMath';

const HEAD = { x: 500000, y: 6000000 };
const vertical = (tdM) => [{ md: 0, inc: 0, azi: 0 }, { md: tdM, inc: 0, azi: 0 }];
const cand = (over = {}) => ({
  id: 'wp:w2', name: 'W-2', kind: 'wp-plan', stations: vertical(2000),
  headX: HEAD.x + 100, headY: HEAD.y, kbElevM: 30, ...over,
});

describe('offsetToChart', () => {
  test('a vertical offset 100 m east plots at e=100 and at vs=100 sin(az)', () => {
    const az = 35;
    const r = offsetToChart(cand(), { wellhead: HEAD, kbM: 30, mdUnit: 'm', vsAzimuthDeg: az });
    expect(r.ok).toBe(true);
    for (const row of r.rows) {
      expect(row.e).toBeCloseTo(100, 9);
      expect(row.n).toBeCloseTo(0, 9);
      expect(row.vs).toBeCloseTo(100 * Math.sin((az * Math.PI) / 180), 9);
    }
    expect(r.rows[r.rows.length - 1].tvd).toBeCloseTo(2000, 9);
  });

  test('section projection matches the target projection (N cos + E sin)', () => {
    expect(projectToSection(100, 0, 0)).toBeCloseTo(100, 12);
    expect(projectToSection(0, 100, 90)).toBeCloseTo(100, 12);
    expect(projectToSection(0, 100, 270)).toBeCloseTo(-100, 12);
    const r = offsetToChart(cand({ headX: HEAD.x, headY: HEAD.y + 50 }), { wellhead: HEAD, vsAzimuthDeg: 180 });
    expect(r.rows[0].vs).toBeCloseTo(-50, 9);
  });

  test('TVD is referenced to this well\'s KB (KB elevations differ)', () => {
    // offset KB 40 m above datum, this KB 30 m: 1,000 m below the offset
    // KB is 960 m below datum, i.e. 990 m below this KB.
    const r = offsetToChart(cand({ stations: vertical(1000), kbElevM: 40 }), { wellhead: HEAD, kbM: 30, vsAzimuthDeg: 0 });
    expect(r.rows[1].tvd).toBeCloseTo(990, 9);
    expect(r.rows[0].tvd).toBeCloseTo(-10, 9); // its wellhead sits 10 m above this KB
  });

  test('a ft wellbore gets ft offsets throughout', () => {
    const r = offsetToChart(cand({ kbElevM: 30 }), { wellhead: HEAD, kbM: 30, mdUnit: 'ft', vsAzimuthDeg: 90 });
    const last = r.rows[r.rows.length - 1];
    expect(last.e).toBeCloseTo(100 * M_TO_FT, 6);
    expect(last.vs).toBeCloseTo(100 * M_TO_FT, 6);
    expect(last.tvd).toBeCloseTo(2000 * M_TO_FT, 6);
    expect(last.md).toBeCloseTo(2000 * M_TO_FT, 6);
  });

  test('a deviated offset follows minimum curvature from its own wellhead', () => {
    // hold at 90 deg inclination due north for 100 m after a vertical 1000 m
    const stations = [{ md: 0, inc: 0, azi: 0 }, { md: 1000, inc: 0, azi: 0 }, { md: 1000.001, inc: 90, azi: 0 }, { md: 1100, inc: 90, azi: 0 }];
    const r = offsetToChart(cand({ stations, headX: HEAD.x, headY: HEAD.y }), { wellhead: HEAD, kbM: 30, vsAzimuthDeg: 0 });
    const last = r.rows[r.rows.length - 1];
    expect(last.n).toBeCloseTo(100, 1);
    expect(last.vs).toBeCloseTo(last.n, 9);
  });

  test('refusals are returned, never thrown', () => {
    expect(offsetToChart(cand(), { wellhead: null }).ok).toBe(false);
    expect(offsetToChart(cand({ stations: [{ md: 0, inc: 0, azi: 0 }] }), { wellhead: HEAD }).ok).toBe(false);
    expect(offsetToChart(cand({ headX: null }), { wellhead: HEAD }).ok).toBe(false);
    const far = offsetToChart(cand({ headX: HEAD.x + 400000 }), { wellhead: HEAD });
    expect(far.ok).toBe(false);
    expect(far.error).toMatch(/not in the same coordinate frame/);
  });

  test('no VS azimuth leaves vs null (plan still works)', () => {
    const r = offsetToChart(cand(), { wellhead: HEAD, vsAzimuthDeg: null });
    expect(r.rows[0].vs).toBeNull();
    expect(r.rows[0].e).toBeCloseTo(100, 9);
  });
});

describe('candidates (shared with the Anti-collision picker)', () => {
  const wellbores = [
    { id: 'w1', name: 'W-1', head_x: HEAD.x, head_y: HEAD.y, kb_elev_m: 30, geo_well_id: 'g-own' },
    { id: 'w2', name: 'W-2', head_x: HEAD.x + 20, head_y: HEAD.y, kb_elev_m: 31 },
    { id: 'w3', name: 'W-3', head_x: null, head_y: null },
  ];
  const d2 = { id: 'd2', name: 'Plan A', revision: 2, status: 'definitive', stations: vertical(1500) };
  const geoWells = [
    { id: 'g-own', name: 'Own', crs: 'EPSG:32631', deviation: vertical(10), surface_x: HEAD.x, surface_y: HEAD.y },
    { id: 'g-near', name: 'Near', crs: 'EPSG:32631', deviation: vertical(1000), surface_x: HEAD.x + 800, surface_y: HEAD.y, kb_m: 25 },
    { id: 'g-far', name: 'Far', crs: 'EPSG:32631', deviation: vertical(1000), surface_x: HEAD.x + 9000, surface_y: HEAD.y },
    { id: 'g-crs', name: 'OtherCrs', crs: 'EPSG:4326', deviation: vertical(1000), surface_x: 1, surface_y: 1 },
    { id: 'g-nodev', name: 'NoDev', crs: 'EPSG:32631', deviation: null, surface_x: HEAD.x, surface_y: HEAD.y },
  ];
  const all = assembleOffsetCandidates({
    wellbores, designsByWellbore: { w2: d2, w3: d2 }, geoWells, wellbore: wellbores[0], siteCrs: 'EPSG:32631',
  });

  test('site wellbores with a head and a design, and same-CRS registry wells other than our own', () => {
    expect(all.map((c) => c.id)).toEqual(['wp:w2', 'geo:g-near', 'geo:g-far']);
    expect(all[0]).toMatchObject({ name: 'W-2', kind: 'wp-plan', headX: HEAD.x + 20, kbElevM: 31 });
    expect(all[1]).toMatchObject({ name: 'Near', kind: 'geo', kbElevM: 25 });
    all.forEach((c) => expect(c.label).not.toMatch(/[—–]/));
  });

  test('pickOffsetDesign: definitive first, else the latest with stations', () => {
    const a = { status: 'draft', stations: vertical(10) };
    const b = { status: 'draft', stations: vertical(20) };
    const c = { status: 'definitive', stations: vertical(30) };
    expect(pickOffsetDesign([a, c, b])).toBe(c);
    expect(pickOffsetDesign([a, b, { status: 'definitive', stations: [] }])).toBe(b);
    expect(pickOffsetDesign([])).toBeNull();
  });

  test('choice: AC selection first, then the last saved run, then nearby', () => {
    const sel = chooseDisplayOffsets(all, { selectedIds: ['geo:g-far', 'geo:gone'], savedRunIds: ['wp:w2'] });
    expect(sel.source).toBe('ac-selection');
    expect(sel.list.map((c) => c.id)).toEqual(['geo:g-far']);
    expect(sel.missing).toBe(1);

    const run = chooseDisplayOffsets(all, { selectedIds: [], savedRunIds: ['wp:w2'] });
    expect(run.source).toBe('ac-run');
    expect(run.list.map((c) => c.id)).toEqual(['wp:w2']);

    const near = chooseDisplayOffsets(all, { wellhead: HEAD, reachM: 500 });
    expect(near.source).toBe('nearby');
    // site wellbore always, registry within radius + reach, nearest first
    expect(near.list.map((c) => c.id)).toEqual(['wp:w2', 'geo:g-near']);
    const wide = chooseDisplayOffsets(all, { wellhead: HEAD, reachM: 9000 - NEARBY_RADIUS_M });
    expect(wide.list.map((c) => c.id)).toContain('geo:g-far');
    expect(chooseDisplayOffsets(all, { wellhead: HEAD, reachM: 1e7, limit: 2 }).list).toHaveLength(2);
  });
});
