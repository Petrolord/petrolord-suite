// MS3 pure services: polygon payloads and blocks, surface arithmetic,
// the quick GRV against the dome golden, and linear time-to-depth.
import fs from 'fs';
import path from 'path';
import { parseSurfaceFile } from '@/lib/gridding/surfaceImport';
import { polygonPayload, blocksForPoints, nodeBlocksFor, ringOf, isPolygonLayer, POLYGON_KINDS } from '../services/polygonTools';
import { runArithmetic, ARITH_OPS } from '../services/arithmetic';
import { quickGrv, describeGrv } from '../services/quickGrv';
import { twtGridToElevation, usableModel } from '../services/timeDepth';
import { gridInUnit } from '../services/surfaceExport';

const GOLD = path.join(__dirname, '..', '..', '..', '..', '..', 'test-data', 'seismolord', 'surfaces');
const isNull = (v) => !Number.isFinite(v) || Math.abs(v) >= 1e29;

describe('polygonTools', () => {
  test('polygonPayload validates, closes the ring, styles by kind and keeps the frame', () => {
    const p = polygonPayload({ name: ' Block A ', kind: POLYGON_KINDS.fault, vertices: [[0, 0], [100, 0], [100, 100], [0, 100]], crs: 'EPSG:32630', xyUnit: 'm', drawnOn: 's1' });
    expect(p.name).toBe('Block A');
    expect(p.geometryType).toBe('polygon');
    expect(p.features[0].rings[0]).toEqual([[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]);
    expect(p.style.color).toBe('#eab308');
    expect(p.bbox).toEqual({ x0: 0, y0: 0, x1: 100, y1: 100 });
    expect(p.crs).toBe('EPSG:32630');
    expect(p.provenance.drawn_on).toBe('s1');
    expect(() => polygonPayload({ name: '', kind: 'boundary', vertices: [[0, 0], [1, 0], [1, 1]] })).toThrow(/name/);
    expect(() => polygonPayload({ name: 'x', kind: 'lease', vertices: [[0, 0], [1, 0], [1, 1]] })).toThrow(/kind/);
    expect(() => polygonPayload({ name: 'x', kind: 'boundary', vertices: [[0, 0], [1, 1]] })).toThrow(/3 vertices/);
    expect(() => polygonPayload({ name: 'x', kind: 'boundary', vertices: [[0, 0], [2, 2], [2, 0], [0, 3]] })).toThrow(/self-intersect/);
    expect(() => polygonPayload({ name: 'x', kind: 'boundary', vertices: [[0, 0], [1, 1], [2, 2]] })).toThrow(/degenerate/);
  });
  test('ringOf drops the closing vertex; blocks follow the first containing polygon', () => {
    expect(ringOf({ rings: [[[0, 0], [1, 0], [1, 1], [0, 0]]] })).toEqual([[0, 0], [1, 0], [1, 1]]);
    const rings = [[[0, 0], [100, 0], [100, 100], [0, 100]]];
    const pts = blocksForPoints([{ x: 50, y: 50, z: 1 }, { x: 150, y: 50, z: 2 }], rings);
    expect(pts.map((p) => p.block)).toEqual([1, 0]);
    // nodes at x = 0, 40, 80, 120 on y = 40: the edge itself counts as outside under even-odd
    const nb = nodeBlocksFor({ x0: 0, y0: 40, dx: 40, dy: 40, nx: 4, ny: 1 }, rings);
    expect(Array.from(nb)).toEqual([1, 1, 1, 0]);
    expect(isPolygonLayer({ kind: 'fault_polygon' })).toBe(true);
    expect(isPolygonLayer({ kind: 'license_block' })).toBe(false);
  });
});

describe('arithmetic', () => {
  const spec = { origin_x: 0, origin_y: 0, dx: 100, dy: 100, nx: 3, ny: 2 };
  const A = { surface: { id: 'a', name: 'Top', kind: 'structure', z_domain: 'depth', ...spec }, grid: Float32Array.from([-1500, -1510, -1520, -1530, 1e30, -1550]) };
  const B = { surface: { id: 'b', name: 'Base', kind: 'structure', z_domain: 'depth', ...spec }, grid: Float32Array.from([-1600, -1600, -1600, -1600, -1600, -1600]) };
  test('thickness is top minus base, an isochore; products are attributes; min is the shallower elevation', () => {
    const t = runArithmetic({ op: 'thickness', a: A, b: B });
    expect(t.kind).toBe('isochore');
    expect(Array.from(t.grid).slice(0, 4)).toEqual([100, 90, 80, 70]);
    expect(isNull(t.grid[4])).toBe(true);
    expect(t.name).toBe('Top to Base isochore');
    expect(t.provenance.thickness).toEqual({ top: 'a', base: 'b' });
    const m = runArithmetic({ op: 'multiply', a: A, b: B });
    expect(m.kind).toBe('attribute');
    const mn = runArithmetic({ op: 'min', a: A, b: B });
    expect(mn.grid[0]).toBe(-1500);
    expect(mn.kind).toBe('structure');
    const k = runArithmetic({ op: 'scalarAdd', a: A, k: 25 });
    expect(k.grid[0]).toBe(-1475);
    expect(k.zDomain).toBe('depth');
    const km = runArithmetic({ op: 'scalarMultiply', a: A, k: 2 });
    expect(km.kind).toBe('attribute');
  });
  test('clip nulls outside the boundary; errors are plain', () => {
    const c = runArithmetic({ op: 'clip', a: A, boundary: { id: 'p', name: 'Lease', ring: [[-10, -10], [150, -10], [150, 150], [-10, 150]] } });
    expect(isNull(c.grid[2])).toBe(true); // x = 200
    expect(c.grid[0]).toBe(-1500);
    expect(c.name).toBe('Top clipped to Lease');
    expect(() => runArithmetic({ op: 'nope', a: A })).toThrow(/operation/);
    expect(() => runArithmetic({ op: 'add', a: A, b: A })).toThrow(/different/);
    expect(() => runArithmetic({ op: 'scalarAdd', a: A, k: 'x' })).toThrow(/number/);
    expect(ARITH_OPS.find((o) => o.key === 'clip').needsBoundary).toBe(true);
  });
});

describe('quickGrv', () => {
  test('the dome golden: GRV above the -6200 ft contact matches the oracle within the 20 m grid discretisation', () => {
    const g = parseSurfaceFile(fs.readFileSync(path.join(GOLD, 'dome_surface_cps3.dat'), 'utf8'));
    const meta = JSON.parse(fs.readFileSync(path.join(GOLD, 'dome_surface_meta.json'), 'utf8'));
    const row = { kind: 'structure', z_domain: 'depth', z_unit: 'ft' };
    const gridM = gridInUnit(row, g.z, 'm');
    const spec = { x0: g.x0, y0: g.y0, dx: g.dx, dy: g.dy, nx: g.nx, ny: g.ny };
    const r = quickGrv({ spec, gridM, contactM: meta.grv.contact_ft * 0.3048 });
    expect(Math.abs(r.grvAcreFt - meta.grv.grv_acre_ft_analytic) / meta.grv.grv_acre_ft_analytic).toBeLessThan(0.03);
    expect(r.grvM3).toBeCloseTo(r.grvAcreFt * 1233.48183754752, 3);
    // the area above the contact is a circle of radius 316.2 m on the oracle's model
    expect(Math.abs(r.areaM2 - Math.PI * meta.grv.contact_radius_m ** 2) / (Math.PI * meta.grv.contact_radius_m ** 2)).toBeLessThan(0.05);
    expect(describeGrv(r, { contactLabel: '-6200 ft' })).toMatch(/^GRV [\d,]+ acre-ft \([\d.]+ million m³\) above -6200 ft; area [\d.]+ km²/);
    expect(() => quickGrv({ spec, gridM, contactM: NaN })).toThrow(/contact/);
  });
});

describe('timeDepth', () => {
  test('linear V(z): the closed form, as elevation in feet by default and metres on demand; nulls kept', () => {
    const twt = Float32Array.from([1000, 2000, 1e30]);
    const model = { v0: 2000, k: 0.3 };
    const ft = twtGridToElevation(twt, model);
    const zm = (t) => (2000 / 0.3) * (Math.exp(0.3 * (t / 2000)) - 1);
    expect(ft[0]).toBeCloseTo(-zm(1000) / 0.3048, 1);
    expect(ft[1]).toBeCloseTo(-zm(2000) / 0.3048, 1);
    expect(isNull(ft[2])).toBe(true);
    const m = twtGridToElevation(twt, model, { unit: 'm' });
    expect(m[0]).toBeCloseTo(-zm(1000), 2);
    const k0 = twtGridToElevation(Float32Array.from([2000]), { v0: 2000, k: 0 }, { unit: 'm' });
    expect(k0[0]).toBeCloseTo(-2000, 6); // 1 s one-way at 2000 m/s
  });
  test('a layer cake is refused with the Seismolord message; junk is refused', () => {
    expect(usableModel({ velocity: { type: 'layercake', layers: [{ v0: 2000, k: 0 }] } }).reason).toMatch(/Seismolord/);
    expect(usableModel({ velocity: null }).reason).toMatch(/no usable/);
    expect(() => twtGridToElevation(Float32Array.from([1]), { type: 'layercake', layers: [{ v0: 2000, k: 0 }] })).toThrow(/layer-cake/);
  });
});
