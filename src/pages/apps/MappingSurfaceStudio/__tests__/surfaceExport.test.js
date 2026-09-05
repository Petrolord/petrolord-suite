import fs from 'fs';
import path from 'path';
import { parseSurfaceFile } from '@/lib/gridding/surfaceImport';
import { exportSurfaceText, controlPointsCsv, describeSurface, gridInUnit } from '../services/surfaceExport';

const GOLD = path.join(__dirname, '..', '..', '..', '..', '..', 'test-data', 'seismolord', 'surfaces');
const read = (n) => fs.readFileSync(path.join(GOLD, n), 'utf8');

const rowOf = (g, extra = {}) => ({
  id: 's1', name: 'Dome', kind: 'structure', z_domain: 'depth', z_unit: 'ft',
  origin_x: g.x0, origin_y: g.y0, dx: g.dx, dy: g.dy, nx: g.nx, ny: g.ny, crs: null, provenance: {}, ...extra,
});

test('a feet elevation surface exported in feet round-trips through every writer', () => {
  const g = parseSurfaceFile(read('dome_surface_cps3.dat'));
  const row = rowOf(g);
  for (const fmt of ['cps3', 'zmap', 'irap', 'xyz']) {
    const { text, fileName, unit } = exportSurfaceText(row, g.z, fmt, { unit: 'ft' });
    expect(unit).toBe('ft');
    expect(fileName).toBe(`dome-ft.${{ cps3: 'cps3.dat', zmap: 'zmap.dat', irap: 'irap.dat', xyz: 'xyz' }[fmt]}`);
    const back = parseSurfaceFile(text);
    expect(back.nx).toBe(50);
    expect(back.ny).toBe(40);
    const again = exportSurfaceText(rowOf(back), back.z, fmt, { unit: 'ft' }).text;
    expect(again).toBe(text); // the writers are stable under their own parse
  }
});

test('export in metres converts a feet grid and keeps nulls; attributes ignore the unit', () => {
  const g = parseSurfaceFile(read('dome_surface_cps3.dat'));
  const row = rowOf(g);
  const { text, fileName } = exportSurfaceText(row, g.z, 'xyz', { unit: 'm' });
  expect(fileName).toBe('dome-m.xyz');
  const back = parseSurfaceFile(text);
  let checked = 0;
  for (let i = 0; i < g.z.length; i++) {
    if (Math.abs(g.z[i]) >= 1e29) { expect(Math.abs(back.z[i])).toBeGreaterThanOrEqual(1e29); continue; }
    expect(back.z[i]).toBeCloseTo(g.z[i] * 0.3048, 2);
    checked += 1;
  }
  expect(checked).toBe(1376);
  const attr = rowOf(g, { kind: 'attribute', z_domain: 'attribute', z_unit: null });
  expect(gridInUnit(attr, g.z, 'm')).toBe(g.z);
  expect(exportSurfaceText(attr, g.z, 'xyz', { unit: 'm' }).fileName).toBe('dome-attr.xyz');
});

test('ZMAP+ carries the CRS label only for a transformable tag', () => {
  const g = parseSurfaceFile(read('dome_surface_cps3.dat'));
  expect(exportSurfaceText(rowOf(g, { crs: 'EPSG:32630' }), g.z, 'zmap', { unit: 'ft' }).text).toContain('CRS: EPSG:32630');
  expect(exportSurfaceText(rowOf(g, { crs: 'LOCAL' }), g.z, 'zmap', { unit: 'ft' }).text).not.toContain('CRS:');
});

test('control points CSV in the display unit, sorted by well; none recorded is an error', () => {
  const row = rowOf({ x0: 0, y0: 0, dx: 1, dy: 1, nx: 2, ny: 2 }, {
    z_unit: 'm',
    provenance: { points: [{ well: 'B', x: 2, y: 3, z: -1500, md: 1530, extrapolated: false }, { well: 'A', x: 1, y: 1, z: -1470, md: 1500, extrapolated: true }] },
  });
  const { text, fileName } = controlPointsCsv(row, { unit: 'ft' });
  expect(fileName).toBe('dome-control-points.csv');
  const lines = text.trim().split('\n');
  expect(lines[0]).toBe('well,x,y,z_ft,md_m,extrapolated');
  expect(lines[1]).toBe(`A,1,1,${(-1470 / 0.3048).toFixed(3)},1500.000,yes`);
  expect(lines[2].startsWith('B,2,3,')).toBe(true);
  expect(() => controlPointsCsv(rowOf({ x0: 0, y0: 0, dx: 1, dy: 1, nx: 2, ny: 2 }))).toThrow(/no control points/);
});

test('describeSurface names the domain, the CRS state and the origin', () => {
  expect(describeSurface({ kind: 'structure', z_domain: 'depth', z_unit: 'm', crs: 'EPSG:32630', provenance: { source: { type: 'top', key: 'Top Dome' }, control_points: 5, depth_ref: 'tvdss', cell_m: 150, history: [{}] } }))
    .toBe('structure · depth (m) · EPSG:32630 · gridded from top Top Dome (5 wells, TVDSS, cell 150 m) · re-gridded 1x');
  expect(describeSurface({ kind: 'structure', z_domain: 'time', z_unit: 'ms', crs: null, provenance: { imported_from: { file_name: 'h.dat' } } }))
    .toBe('structure · time (ms) · placement unverified (no CRS) · imported from h.dat');
  expect(describeSurface({ kind: 'isochore', z_domain: 'depth', z_unit: 'm', provenance: { thickness: {} } })).toContain('thickness of two surfaces');
});

test('gridInUnit brings a feet-stored surface into metres for the workstation (the double-conversion the e2e caught)', () => {
  const row = { kind: 'structure', z_domain: 'depth', z_unit: 'ft' };
  const m = gridInUnit(row, Float32Array.from([-7114.4, 1e30]), 'm');
  expect(m[0]).toBeCloseTo(-7114.4 * 0.3048, 2);
  expect(Math.abs(m[1])).toBeGreaterThanOrEqual(1e29);
  // a metre row passes through untouched, by identity
  const g = Float32Array.from([-1500]);
  expect(gridInUnit({ kind: 'structure', z_domain: 'depth', z_unit: 'm' }, g, 'm')).toBe(g);
  expect(gridInUnit({ kind: 'structure', z_domain: 'depth', z_unit: null }, g, 'm')).toBe(g);
});
