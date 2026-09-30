// U2-007 (Mapping upgrade Step 2): the shared door for geo_surfaces rows.
// Every case calls the shipped readDepthSurface; the negative controls
// show what the older per-app readers did with the same row.
import fs from 'fs';
import path from 'path';
import { readDepthSurface, surfaceDomainOf, SURFACE_DOMAINS } from '../readDepthSurface';
import { surfaceZToDepthDown } from '../surfaceConvention';

const fx = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'e2e/fixtures/map/saved/surfaces.json'), 'utf8'));
const saved = Object.fromEntries(fx.surfaces.map((s) => [s.row.id, { row: s.row, grid: Float32Array.from(s.grid) }]));
const isNull = (v) => !Number.isFinite(v) || Math.abs(v) >= 1e29;
const frame = { origin_x: 1000, origin_y: 2000, nx: 3, ny: 2, dx: 100, dy: 100 };

describe('readDepthSurface: every saved release reads', () => {
  test.each(Object.keys(saved))('%s', (id) => {
    const { row, grid } = saved[id];
    const r = readDepthSurface(row, grid, { requireProjected: false });
    expect(r.ok).toBe(true);
    expect(r.grid).toHaveLength(row.nx * row.ny);
    expect(SURFACE_DOMAINS).toContain(r.domain);
  });

  test('the feet and the US-feet rows of one dome come back in metres with one cell area', () => {
    const m = readDepthSurface(saved['saved-t1'].row, saved['saved-t1'].grid);
    const us = readDepthSurface(saved['saved-u1-ftus'].row, saved['saved-u1-ftus'].grid);
    expect(us.zUnit).toBe('m');
    expect(us.xyUnit).toBe('ftUS');
    expect(us.cellAreaM2 / m.cellAreaM2).toBeCloseTo(1, 4);
    // negative control: dx * dy read as square metres (the MAP-U1-029 defect)
    expect(Math.abs(us.spec.dx * us.spec.dy) / m.cellAreaM2).toBeCloseTo(10.7639, 3);
    // the crest is one depth in metres on both frames
    const crest = (g) => Math.max(...Array.from(g).filter((v) => !isNull(v)));
    expect(crest(us.grid)).toBeCloseTo(crest(m.grid), 0);
    const g4 = readDepthSurface(saved['saved-g4'].row, saved['saved-g4'].grid);
    expect(crest(g4.grid)).toBeCloseTo(crest(saved['saved-g4'].grid) * 0.3048, 3);
    expect(g4.notes.join(' ')).toMatch(/no CRS or XY unit/);
  });

  test('xy "m" scales the frame to metres; the rotation is kept and honoured by nodeXY and sampleAt', () => {
    const us = readDepthSurface(saved['saved-u1-ftus'].row, saved['saved-u1-ftus'].grid, { xy: 'm' });
    expect(us.xyUnit).toBe('m');
    expect(us.xyToM).toBe(1);
    expect(us.spec.dx).toBeCloseTo(200, 3);
    const rot = readDepthSurface(saved['saved-ms5-rot'].row, saved['saved-ms5-rot'].grid);
    expect(rot.spec.rotation_deg).toBe(30);
    const p = rot.nodeXY(0, 1);
    const c30 = Math.cos(Math.PI / 6); const s30 = Math.sin(Math.PI / 6);
    expect(p.x).toBeCloseTo(rot.spec.x0 + 200 * c30, 6);
    expect(p.y).toBeCloseTo(rot.spec.y0 + 200 * s30, 6);
    const q = rot.nodeXY(3, 4);
    expect(rot.sampleAt(q.x, q.y)).toBeCloseTo(rot.grid[3 * rot.spec.nx + 4], 3);
    // negative control: the unrotated arithmetic puts node (0, 1) 27 m away
    expect(Math.hypot(rot.spec.x0 + 200 - p.x, rot.spec.y0 - p.y)).toBeGreaterThan(50);
  });
});

describe('readDepthSurface: domains', () => {
  test('an isochore stays a positive thickness in metres (the older depth-down door negated it)', () => {
    const row = { ...frame, name: 'Iso', kind: 'isochore', z_domain: 'depth', z_unit: 'ft' };
    const grid = Float32Array.from([100, 100, 100, 100, 100, 1e30]);
    const r = readDepthSurface(row, grid, { as: 'depth' });
    expect(r.domain).toBe('isochore');
    expect(r.grid[0]).toBeCloseTo(30.48, 4);
    expect(isNull(r.grid[5])).toBe(true);
    expect(surfaceZToDepthDown(row, grid)[0]).toBeLessThan(0); // negative control
  });

  test('a depth row comes back as elevation or positive-down depth on request', () => {
    const row = { ...frame, name: 'Top', kind: 'structure', z_domain: 'depth', z_unit: 'ft' };
    const grid = Float32Array.from([-5000, -5000, -5000, -5000, -5000, -5000]);
    expect(readDepthSurface(row, grid).grid[0]).toBeCloseTo(-1524, 3);
    const d = readDepthSurface(row, grid, { as: 'depth' });
    expect(d.domain).toBe('depth');
    expect(d.grid[0]).toBeCloseTo(1524, 3);
  });

  test('time rows read as positive TWT, and a depth-only consumer refuses them with the way out', () => {
    const row = { ...frame, name: 'H1 TWT', kind: 'structure', z_domain: 'time', z_unit: null };
    const grid = Float32Array.from([-1400, -1400, -1400, -1400, -1400, -1400]);
    const t = readDepthSurface(row, grid);
    expect(t.domain).toBe('time');
    expect(t.zUnit).toBe('ms');
    expect(t.grid[0]).toBe(1400);
    const r = readDepthSurface(row, grid, { accept: ['depth'] });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('domain');
    expect(r.reason).toMatch(/time surface.*needs a depth structure.*Depth-convert/);
  });

  test('attributes: feet converted, other units raw; a TVD map keeps its depth reference', () => {
    const md = readDepthSurface(saved['saved-t1-md'].row, saved['saved-t1-md'].grid);
    expect(md.domain).toBe('attribute');
    expect(md.zUnit).toBeNull();
    const ft = readDepthSurface({ ...frame, kind: 'attribute', z_domain: 'attribute', z_unit: 'ft', provenance: { depth_ref: 'tvd' } }, Float32Array.from([10, 10, 10, 10, 10, 10]));
    expect(ft.grid[0]).toBeCloseTo(3.048, 5);
    expect(ft.zUnit).toBe('m');
    expect(ft.depthRef).toBe('tvd');
    expect(readDepthSurface({ ...frame, kind: 'attribute', z_domain: 'attribute' }, new Float32Array(6).fill(1), { accept: ['elevation'] }).code).toBe('domain');
    expect(surfaceDomainOf({ kind: 'attribute' })).toBe('attribute');
  });
});

describe('readDepthSurface: hostile rows refuse with a reason (PL2)', () => {
  const good = { ...frame, name: 'Top', kind: 'structure', z_domain: 'depth', z_unit: 'm' };
  const g6 = new Float32Array(6).fill(-1500);
  test.each([
    ['grid', { ...good }, new Float32Array(5), /6|3 x 2/],
    ['grid', { ...good }, null, /0 nodes/],
    ['frame', { ...good, dx: 0 }, g6, /grid frame/],
    ['frame', { ...good, nx: 'x' }, g6, /grid frame/],
    ['z-unit', { ...good, z_unit: 'km' }, g6, /"km"/],
    ['xy-unit', { ...good, crs: 'EPSG:4326', xy_unit: 'deg' }, g6, /geographic/],
    ['xy-unit', { ...good, xy_unit: 'chain' }, g6, /unknown XY unit/],
    ['empty', { ...good }, new Float32Array(6).fill(1e30), /no live nodes/],
  ])('%s', (code, row, grid, re) => {
    const r = readDepthSurface(row, grid);
    expect(r.ok).toBe(false);
    expect(r.code).toBe(code);
    expect(r.reason).toMatch(re);
    expect(r.reason).not.toMatch(/—/);
  });

  test('legacy rows say what was assumed; positive values on an elevation row are flagged', () => {
    const r = readDepthSurface({ ...frame, name: 'Old' }, new Float32Array(6).fill(1500));
    expect(r.ok).toBe(true);
    expect(r.notes.join(' ')).toMatch(/no z domain recorded/);
    expect(r.notes.join(' ')).toMatch(/no depth unit recorded/);
    expect(r.notes.join(' ')).toMatch(/every value is above the datum/);
    expect(readDepthSurface({ ...good, crs: 'EPSG:4326', xy_unit: 'deg' }, g6, { requireProjected: false }).ok).toBe(true);
    expect(() => readDepthSurface(good, g6, { as: 'tvd' })).toThrow(/elevation or depth/);
  });
});
