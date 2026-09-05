import { planImport, detectSign } from '../services/importPlan';
import { parseSurfaceFile } from '@/lib/gridding/surfaceImport';
import fs from 'fs';
import path from 'path';

const GOLD = path.join(__dirname, '..', '..', '..', '..', '..', 'test-data', 'seismolord', 'surfaces');
const dome = () => parseSurfaceFile(fs.readFileSync(path.join(GOLD, 'dome_surface_cps3.dat'), 'utf8'));
const isNull = (v) => !Number.isFinite(v) || Math.abs(v) >= 1e29;

test('detectSign reads the majority of live nodes', () => {
  expect(detectSign(Float32Array.from([-1, -2, 3, 1e30]))).toBe('negative');
  expect(detectSign(Float32Array.from([1, 2, -3]))).toBe('positive');
});

test('a negative-down feet grid imports as elevation in feet, unchanged', () => {
  const g = dome();
  const plan = planImport({ g, fileName: 'dome_surface_cps3.dat', domain: 'depth', zUnit: 'ft' });
  expect(plan.effSign).toBe('negative');
  expect(plan.kind).toBe('structure');
  expect(plan.zDomain).toBe('depth');
  expect(plan.zUnit).toBe('ft');
  expect(plan.name).toBe('dome_surface_cps3');
  expect(plan.spec).toEqual({ x0: 500000, y0: 6700000, dx: 20, dy: 20, nx: 50, ny: 40 });
  expect(plan.provenance.stats.live).toBe(1376);
  expect(plan.provenance.stats.z_min).toBeCloseTo(-7114.4, 1);
  expect(plan.provenance.z_convention).toBe('elevation');
  expect(plan.crs).toBeNull();
  expect(Array.from(plan.grid)).toEqual(Array.from(g.z));
});

test('a positive-down depth grid is flipped to elevation; a forced sign wins over detection', () => {
  const g = { format: 'xyz', nx: 2, ny: 2, x0: 0, y0: 0, dx: 1, dy: 1, z: Float32Array.from([1500, 1510, 1e30, 1520]) };
  const auto = planImport({ g, fileName: 'a.xyz', domain: 'depth', zUnit: 'm' });
  expect(auto.effSign).toBe('positive');
  expect(Array.from(auto.grid).slice(0, 2)).toEqual([-1500, -1510]);
  expect(isNull(auto.grid[2])).toBe(true);
  const forced = planImport({ g, fileName: 'a.xyz', domain: 'depth', zUnit: 'm', zSign: 'negative' });
  expect(Array.from(forced.grid).slice(0, 2)).toEqual([1500, 1510]);
});

test('time stays positive TWT ms; attributes are raw with no unit', () => {
  const g = { format: 'xyz', nx: 2, ny: 1, x0: 0, y0: 0, dx: 1, dy: 1, z: Float32Array.from([-1200, -1300]) };
  const t = planImport({ g, fileName: 't.xyz', domain: 'time' });
  expect(t.zUnit).toBe('ms');
  expect(Array.from(t.grid)).toEqual([1200, 1300]);
  const a = planImport({ g, fileName: 'phi.xyz', domain: 'attribute', name: 'Porosity' });
  expect(a.kind).toBe('attribute');
  expect(a.zUnit).toBeNull();
  expect(a.name).toBe('Porosity');
  expect(Array.from(a.grid)).toEqual([-1200, -1300]);
});

test('a declared CRS is kept when there is no project CRS, converted when both are known, refused on a local mismatch', () => {
  const g = { format: 'xyz', nx: 3, ny: 3, x0: 500000, y0: 6700000, dx: 100, dy: 100, z: Float32Array.from({ length: 9 }, () => -1500) };
  const kept = planImport({ g, fileName: 'k.xyz', declaredTag: 'EPSG:32630' });
  expect(kept.crs).toBe('EPSG:32630');
  expect(kept.xyUnit).toBe('m');
  expect(kept.reprojected).toBeNull();
  const conv = planImport({ g, fileName: 'c.xyz', declaredTag: 'EPSG:32630', projectTag: 'EPSG:32631' });
  expect(conv.crs).toBe('EPSG:32631');
  expect(conv.reprojected.from).toBe('EPSG:32630');
  expect(conv.spec.x0).not.toBe(500000);
  expect(() => planImport({ g, fileName: 'l.xyz', declaredTag: 'LOCAL', projectTag: 'EPSG:32630' })).toThrow(/local grid/);
  expect(() => planImport({ g: { ...g, z: Float32Array.from([1e30]) , nx: 1, ny: 1 }, fileName: 'e.xyz' })).toThrow(/no live nodes/);
});
