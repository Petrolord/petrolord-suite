// Mapping & Surface Studio upgrade Step 2 (2026-09-30): service tests, one
// block per item (docs/upgrade/MappingSurfaceStudio-UPGRADE.md). Every
// gate calls the shipped function; numeric items carry a negative control.
import { runGriddingSync } from '../services/gridSync';
import { blocksForPoints, nodeBlocksFor } from '../services/polygonTools';
import { isNull } from '@/lib/gridding/gridmath';

// a N-S fault at x = 500 with a 100 m throw; the east block is a polygon
const planeW = (x, y) => -1500 - 0.05 * x + 0.02 * y;
const planeE = (x, y) => planeW(x, y) - 100;
const eastBlock = [[500, -50], [1100, -50], [1100, 1100], [500, 1100]];
const spec = { x0: 0, y0: 0, dx: 25, dy: 25, nx: 41, ny: 41 };
const wellXY = [[60, 80], [300, 120], [420, 700], [150, 950], [260, 450], [380, 300], [620, 90], [900, 200], [760, 640], [980, 930], [560, 500], [840, 420]];
const wells = wellXY.map(([x, y]) => ({ x, y, z: x < 500 ? planeW(x, y) : planeE(x, y), well: `W${x}` }));

describe('MAP-U2-001: fault blocks with the spline in tension and kriging', () => {
  const nodeBlocks = nodeBlocksFor(spec, [eastBlock]);
  const pts = blocksForPoints(wells, [eastBlock]);
  const worst = (z) => {
    let m = 0;
    for (let r = 0; r < spec.ny; r++) for (let c = 0; c < spec.nx; c++) {
      const v = z[r * spec.nx + c]; if (isNull(v)) continue;
      const x = c * spec.dx; const y = r * spec.dy;
      m = Math.max(m, Math.abs(v - (nodeBlocks[r * spec.nx + c] ? planeE(x, y) : planeW(x, y))));
    }
    return m;
  };
  test.each([
    ['blocked-tension', { tension: 0.5, smoothing: 0, maxExtrapolation: 1e9 }],
    ['blocked-kriging', { model: 'spherical', range: 600, sill: 100, nugget: 0, detrend: true, maxExtrapolation: 1e9 }],
  ])('%s keeps the 100 m throw as a step at the polygon edge', (method, opts) => {
    const g = runGriddingSync(method, pts, spec, { ...opts, nodeBlocks });
    expect(worst(g.z)).toBeLessThan(2e-3);
    expect(g.blockCount).toBe(2);
    // across the fault, one cell apart, the map steps by the throw
    const r = 20; const cW = 19; const cE = 20;
    expect(g.z[r * spec.nx + cW] - g.z[r * spec.nx + cE]).toBeGreaterThan(95);
  });
  test('negative control: the same wells without the polygon smear the throw', () => {
    const t = runGriddingSync('tension', wells, spec, { tension: 0.5, mask: 'none' });
    expect(worst(t.z)).toBeGreaterThan(20);
    const k = runGriddingSync('kriging', wells, spec, { model: 'spherical', range: 600, sill: 100, nugget: 0, detrend: true, mask: 'none', maxExtrapolation: 1e9 });
    expect(worst(k.z)).toBeGreaterThan(20);
  });
});

describe('MAP-U2-004: fault polygon files become fault blocks', () => {
  // eslint-disable-next-line global-require
  const fs = require('fs');
  // eslint-disable-next-line global-require
  const path = require('path');
  const { parsePolygonLinesFile, parseZmapLines, parseIrapLines, polygonRingsOf, detectPolygonFileFormat } = require('@/lib/culturePolygonFiles');
  const { parseGeoJSON } = require('@/lib/cultureImport');
  const { maskOutsideRings } = require('../services/polygonTools');
  const hostile = (f) => fs.readFileSync(path.join(process.cwd(), 'e2e/fixtures/map/hostile', f), 'utf8');

  test('the Petrel ZMAP+ lines export reads as one closed fault polygon', () => {
    const r = parsePolygonLinesFile(hostile('petrel_fault_polygons_zmap_lines.dat'));
    expect(r.format).toBe('zmap-lines');
    expect(r.features).toHaveLength(1);
    expect(r.features[0].type).toBe('polygon');
    expect(polygonRingsOf(r.features)[0]).toEqual([[501700, 6699200], [501800, 6699200], [501900, 6700800], [501800, 6700800]]);
  });

  test('two polygons by id or by null rows, and Irap lines with 999 separators', () => {
    const z = parseZmapLines(['@F HEADER, POLYGON, 4', '20, -999, , 4, 1', '@',
      '0 0 1 1', '10 0 1 1', '10 10 1 1', '0 0 1 1',
      '20 0 1 2', '30 0 1 2', '30 10 1 2', '20 0 1 2',
      '-999 -999 -999 2', '40 0 1 2', '41 5 1 2'].join('\n'));
    expect(z.features.map((f) => f.type)).toEqual(['polygon', 'polygon', 'polyline']); // two points cannot close
    const lineSet = parseZmapLines(['@Traces HEADER, LINE, 4', '20, 1E+30, , 4, 1', '@', '0 0 1 1', '10 5 1 1'].join('\n'));
    expect(lineSet.features[0].type).toBe('polyline');
    const irap = parseIrapLines(['0 0 -1500', '100 0 -1500', '100 100 -1500', '0 0 -1500', '999.000000 999.000000 999.000000', '200 0 -1', '300 50 -1', '999 999 999'].join('\n'));
    expect(irap.features.map((f) => f.type)).toEqual(['polygon', 'polyline']);
    expect(detectPolygonFileFormat('999 999 999\n1 2 3')).toBe('irap-lines');
    expect(() => parsePolygonLinesFile('X,Y,Z\n1,2,3')).toThrow(/ZMAP\+ lines .* Irap classic lines/);
    expect(() => parseZmapLines('@F HEADER, POLYGON\n20, 1E+30')).toThrow(/closing @/);
  });

  test('every polygon of a two-fault GeoJSON is a block (the map used only the first)', () => {
    const feats = parseGeoJSON(hostile('fault_polygons_two.geojson')).features;
    const rings = polygonRingsOf(feats);
    expect(rings).toHaveLength(2);
    const s = { x0: 501500, y0: 6699000, dx: 50, dy: 50, nx: 41, ny: 41 };
    const labels = nodeBlocksFor(s, rings);
    expect(new Set(labels)).toEqual(new Set([0, 1, 2]));
    // negative control: the first feature alone gives two labels
    expect(new Set(nodeBlocksFor(s, rings.slice(0, 1)))).toEqual(new Set([0, 1]));
  });

  test('a boundary with two polygons keeps the union', () => {
    const s = { x0: 0, y0: 0, dx: 10, dy: 10, nx: 11, ny: 3 };
    const z = new Float32Array(33).fill(-1500);
    const out = maskOutsideRings(z, s, [[[-5, -5], [25, -5], [25, 25], [-5, 25]], [[75, -5], [105, -5], [105, 25], [75, 25]]]);
    const kept = Array.from(out).filter((v) => !isNull(v)).length;
    expect(kept).toBe(3 * 3 + 3 * 3);
    expect(() => maskOutsideRings(z, s, [])).toThrow(/boundary/);
  });
});

describe('MAP-U2-005: gas cap, oil leg and fault-block volumes against an analytic cone', () => {
  // eslint-disable-next-line global-require
  const { contactVolumes } = require('../services/contactVolumes');
  // eslint-disable-next-line global-require
  const { quickGrv } = require('../services/quickGrv');
  // a cone z = -1800 - 0.1 r: the volume above a contact h below the crest is pi (10 h)^2 h / 3
  const s = { x0: -1500, y0: -1500, dx: 10, dy: 10, nx: 301, ny: 301 };
  const z = new Float32Array(s.nx * s.ny);
  for (let r = 0; r < s.ny; r++) for (let c = 0; c < s.nx; c++) z[r * s.nx + c] = -1800 - 0.1 * Math.hypot(s.x0 + c * s.dx, s.y0 + r * s.dy);
  const cone = (h) => (Math.PI * (10 * h) ** 2 * h) / 3;
  const owc = -1900; const goc = -1850;
  test('gas cap and oil leg match the analytic cone and add up to the closure GRV exactly', () => {
    const v = contactVolumes({ spec: s, gridM: z, owcM: owc, gocM: goc });
    expect(Math.abs(v.gasM3 / cone(50) - 1)).toBeLessThan(0.01);
    expect(Math.abs(v.oilM3 / (cone(100) - cone(50)) - 1)).toBeLessThan(0.005);
    expect((v.gasM3 + v.oilM3) / v.totalM3).toBeCloseTo(1, 12);
    expect(v.totalM3 / quickGrv({ spec: s, gridM: z, contactM: owc }).grvM3).toBeCloseTo(1, 12);
    // negative control: one contact (the old read-out) books the gas cap as oil
    expect(v.totalM3 / (cone(100) - cone(50))).toBeGreaterThan(1.1);
  });
  test('two fault blocks split the cone in half; their sum is the total', () => {
    const nodeBlocks = new Int32Array(s.nx * s.ny);
    for (let i = 0; i < nodeBlocks.length; i++) nodeBlocks[i] = s.x0 + (i % s.nx) * s.dx > 0 ? 1 : 0;
    const v = contactVolumes({ spec: s, gridM: z, owcM: owc, gocM: goc, nodeBlocks, blockNames: { 1: 'East' } });
    const [west, east] = v.blocks;
    expect(east.name).toBe('East');
    expect(Math.abs(east.totalM3 / (cone(100) / 2) - 1)).toBeLessThan(0.02);
    expect(Math.abs(west.totalM3 / (cone(100) / 2) - 1)).toBeLessThan(0.02);
    expect((west.totalM3 + east.totalM3) / v.totalM3).toBeCloseTo(1, 12);
    expect((east.gasM3 + east.oilM3) / east.totalM3).toBeCloseTo(1, 12);
    // negative control: no block labels gives one block holding everything
    expect(contactVolumes({ spec: s, gridM: z, owcM: owc }).blocks).toHaveLength(0);
  });
  test('a feet frame keeps square metres; hostile contacts refuse', () => {
    const k = 1200 / 3937;
    const ft = contactVolumes({ spec: { ...s, dx: s.dx / k, dy: s.dy / k }, gridM: z, owcM: owc, gocM: goc, xyToM: k });
    expect(ft.totalM3 / contactVolumes({ spec: s, gridM: z, owcM: owc }).totalM3).toBeCloseTo(1, 9);
    expect(() => contactVolumes({ spec: s, gridM: z, owcM: owc, gocM: -1950 })).toThrow(/above \(shallower than\)/);
    expect(() => contactVolumes({ spec: s, gridM: z, owcM: NaN })).toThrow(/oil-water/);
    expect(contactVolumes({ spec: s, gridM: z, owcM: owc, gocM: -1700 }).gasCapAboveCrest).toBe(true);
    expect(contactVolumes({ spec: s, gridM: z, owcM: -1700 }).kind).toBe('none');
  });
});

describe('MAP-U2-003: scattered points and a rotated lattice from a file grid in the studio', () => {
  // eslint-disable-next-line global-require
  const fs = require('fs');
  // eslint-disable-next-line global-require
  const path = require('path');
  // eslint-disable-next-line global-require
  const { readSurfaceFile } = require('../services/surfaceFileDoor');
  // eslint-disable-next-line global-require
  const { planPointsSource } = require('../services/importPlan');
  // eslint-disable-next-line global-require
  const { describeGridResult } = require('../services/gridStatus');
  const lattice = fs.readFileSync(path.join(process.cwd(), 'e2e/fixtures/map/hostile/xyz_rotated_survey_lattice.xyz'), 'utf8');

  test('the rotated survey lattice reads as points (it was refused before) and grids through the engine', () => {
    const r = readSurfaceFile(lattice);
    expect(r.g).toBeNull();
    expect(r.points.length).toBeGreaterThan(50);
    expect(r.notes.join(' ')).toMatch(/Not a regular X\/Y grid .* points to grid/);
    const plan = planPointsSource({ points: r.points, fileName: 'lattice.xyz', domain: 'depth', zUnit: 'm' });
    expect(plan.points.every((p) => p.z < 0)).toBe(true); // positive depth in the file -> elevation
    const xs = plan.points.map((p) => p.x); const ys = plan.points.map((p) => p.y);
    const spec = { x0: Math.min(...xs), y0: Math.min(...ys), dx: 100, dy: 100, nx: Math.ceil((Math.max(...xs) - Math.min(...xs)) / 100) + 1, ny: Math.ceil((Math.max(...ys) - Math.min(...ys)) / 100) + 1 };
    const g = runGriddingSync('tps', plan.points, spec, { maxExtrapolation: 1e9 });
    expect(g.live).toBeGreaterThan(10);
    // the dome crest of the fixture is -1500 m at (502000, 6700000)
    expect(g.zMax).toBeGreaterThan(-1520);
    expect(g.zMax).toBeLessThan(-1480);
  });

  test('feet, sign and time resolve like a grid import; the status counts points', () => {
    const pts = [{ x: 0, y: 0, z: 5000 }, { x: 100, y: 0, z: 5100 }, { x: 0, y: 100, z: 5200 }];
    const ft = planPointsSource({ points: pts, domain: 'depth', zUnit: 'ft' });
    expect(ft.points[0].z).toBeCloseTo(-1524, 6);
    const neg = planPointsSource({ points: pts.map((p) => ({ ...p, z: -p.z })), domain: 'time' });
    expect(neg.points[0].z).toBe(5000);
    expect(planPointsSource({ points: pts, domain: 'attribute' }).points[2].z).toBe(5200);
    expect(() => planPointsSource({ points: pts.slice(0, 2) })).toThrow(/at least 3/);
    const txt = describeGridResult({ name: 'H1', result: { points: ft.points, skipped: [], depthRef: 'tvdss', sourceNoun: 'points' }, spec: { nx: 3, ny: 3 } });
    expect(txt).toMatch(/from 3 points/);
    // negative control: the regular-grid door still reads a regular file as a grid
    expect(readSurfaceFile('0 0 1\n10 0 2\n0 10 3\n10 10 4').g.nx).toBe(2);
  });
});
