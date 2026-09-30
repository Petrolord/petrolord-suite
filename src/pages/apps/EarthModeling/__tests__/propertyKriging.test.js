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
  expect(describeProvenance(provenance)).toMatch(/block 0: trend \(plane\) from 3 wells, fell back \(3 control points/);
});

test('a typed variogram is honoured and validated', () => {
  const vg = propertyVariogram(pts, { fit: false, model: 'exponential', range: '600', sill: '0.001', nugget: '0.0001' });
  expect(vg).toMatchObject({ model: 'exponential', range: 600, sill: 0.001, nugget: 0.0001, fitted: false });
  expect(() => propertyVariogram(pts, { fit: false, range: '', sill: '' })).toThrow(/range and a sill/);
  const { provenance } = populateZonePropertyOk(spec, null, { 0: pts }, pts, { fit: false, model: 'spherical', range: '600', sill: '0.001' });
  expect(provenance[0].variogram).toMatchObject({ range: 600, fitted: false });
});

// EM-U1-015 (PL10): grouped kriging equals the engine's per-target path
describe('krigeTargetsGrouped', () => {
  // eslint-disable-next-line global-require
  const { krigeTargetsGrouped } = require('../services/propertyKriging');
  // eslint-disable-next-line global-require
  const { krigePoints } = require('@/lib/gridding/kriging');
  const pts = Array.from({ length: 60 }, (_, i) => ({ x: (i * 7919) % 5000, y: (i * 104729) % 5000, z: 0.2 + 0.05 * Math.sin(i / 3) + 1e-5 * ((i * 7919) % 5000) }));
  const T = [];
  for (let r = 0; r < 40; r++) for (let c = 0; c < 40; c++) T.push([c * 125 + 3, r * 125 + 7]);
  const vg = { model: 'spherical', range: 2500, sill: 0.002, nugget: 0.0001, neighbours: 24 };

  test.each([true, false])('detrend %s: values and variances match krigePoints to 1e-9 with far fewer systems', (detrend) => {
    const a = krigePoints(pts, T, { ...vg, detrend });
    const b = krigeTargetsGrouped(pts, T, { ...vg, detrend });
    for (let i = 0; i < T.length; i++) {
      expect(Math.abs(a.values[i] - b.values[i])).toBeLessThan(1e-9);
      expect(Math.abs(a.variances[i] - b.variances[i])).toBeLessThan(1e-9);
    }
    expect(b.groups).toBeLessThan(T.length / 3);
  });

  test('negative control: a plane fitted per group (not once on every point) moves the values', () => {
    const a = krigePoints(pts, T, { ...vg, detrend: true });
    // the wrong way: detrend inside each group
    let worst = 0;
    const sample = T.filter((_, i) => i % 97 === 0);
    for (const t of sample) {
      const near = [...pts].sort((p, q) => ((p.x - t[0]) ** 2 + (p.y - t[1]) ** 2) - ((q.x - t[0]) ** 2 + (q.y - t[1]) ** 2)).slice(0, 24);
      const w = krigePoints(near, [t], { ...vg, detrend: true }).values[0];
      worst = Math.max(worst, Math.abs(w - a.values[T.indexOf(t)]));
    }
    expect(worst).toBeGreaterThan(1e-6);
  });

  test('a small point set (at most k) takes the global system as before', () => {
    const few = pts.slice(0, 10);
    const a = krigePoints(few, T.slice(0, 50), { ...vg, detrend: true });
    const b = krigeTargetsGrouped(few, T.slice(0, 50), { ...vg, detrend: true });
    expect(b.groups).toBe(1);
    b.values.forEach((v, i) => expect(v).toBeCloseTo(a.values[i], 12));
  });
});
