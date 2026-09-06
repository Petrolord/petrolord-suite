import { populateZonePropertyOk, propertyVariogram, describeProvenance, MIN_OK_POINTS } from '../services/propertyKriging';
import { isNull } from '@/lib/gridding/gridmath';

const spec = { x0: 0, y0: 0, dx: 100, dy: 100, nx: 11, ny: 11 };
// a planar porosity field sampled at nine wells
const plane = (x, y) => 0.2 + 1e-4 * x - 5e-5 * y;
const pts = [];
for (const x of [100, 500, 900]) for (const y of [100, 500, 900]) pts.push({ x, y, v: plane(x, y), w: 1 });

test('ordinary kriging with trend removal reproduces a planar property at the wells and returns a variance grid', () => {
  const { z, variance, provenance } = populateZonePropertyOk(spec, null, { 0: pts }, pts, { model: 'gaussian', fit: true });
  expect(provenance[0].methodUsed).toBe('okrige');
  expect(provenance[0].fellBack).toBe(false);
  expect(provenance[0].variogram.fitted).toBe(true);
  for (const p of pts) {
    const j = (p.y / 100) * spec.nx + p.x / 100;
    expect(Math.abs(z[j] - p.v)).toBeLessThan(1e-6);
    expect(variance[j]).toBeLessThan(1e-9);
  }
  // an interior node off the wells carries a positive variance
  expect(variance[3 * spec.nx + 3]).toBeGreaterThan(0);
  expect(z.every((v) => !isNull(v))).toBe(true);
});

test('too few points in a block falls back through trend then constant and says why', () => {
  const few = [pts[0], pts[1], pts[3]]; // three points that are not collinear, so a plane fits
  const { provenance } = populateZonePropertyOk(spec, null, { 0: few }, few, { fit: true });
  expect(provenance[0].methodUsed).toBe('trend');
  expect(provenance[0].fellBack).toBe(true);
  expect(provenance[0].note).toMatch(new RegExp(`needs ${MIN_OK_POINTS}`));
  const one = pts.slice(0, 1);
  expect(populateZonePropertyOk(spec, null, { 0: one }, one, {}).provenance[0].methodUsed).toBe('constant');
  expect(describeProvenance(provenance)).toMatch(/block 0 trend\(3w\) FELL BACK: 3 control points/);
});

test('a typed variogram is honoured and validated', () => {
  const vg = propertyVariogram(pts, { fit: false, model: 'exponential', range: '600', sill: '0.001', nugget: '0.0001' });
  expect(vg).toMatchObject({ model: 'exponential', range: 600, sill: 0.001, nugget: 0.0001, fitted: false });
  expect(() => propertyVariogram(pts, { fit: false, range: '', sill: '' })).toThrow(/range and a sill/);
  const { provenance } = populateZonePropertyOk(spec, null, { 0: pts }, pts, { fit: false, model: 'spherical', range: '600', sill: '0.001' });
  expect(provenance[0].variogram).toMatchObject({ range: 600, fitted: false });
});
