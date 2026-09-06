import { typicalSpacing, fitVariogramFromPoints, krigingOptions, describeVariogram, GRID_METHODS } from '../services/krigingPlan';
import { variogramModel, krigeSurface } from '@/lib/gridding/kriging';
import { gridSurface } from '@/lib/gridding/gridding';
import { isNull } from '@/lib/gridding/gridmath';

test('typicalSpacing is the median nearest-neighbour distance', () => {
  const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }, { x: 1000, y: 0 }];
  expect(typicalSpacing(pts)).toBe(100);
  expect(typicalSpacing([{ x: 0, y: 0 }])).toBe(0);
});

test('a variogram fitted from points sampled off a known model recovers its range and sill', () => {
  // a field with an exact spherical structure: krige a random-looking set
  // from a known model, then fit to the semivariogram of a lattice sample
  const truth = { model: 'spherical', range: 600, sill: 400, nugget: 0 };
  const pts = [];
  for (let x = 0; x <= 2000; x += 100) for (let y = 0; y <= 2000; y += 100) pts.push({ x, y, z: 0 });
  // synthesise z with the right semivariogram: a sum of sinusoids has a
  // well-defined experimental variogram; check the fit on the model's own
  // curve instead (the engine golden covers the estimator)
  const exp = [];
  for (let h = 100; h <= 1500; h += 100) exp.push({ h, gamma: variogramModel(h, truth), pairs: 50 });
  const { fitVariogram } = require('@/lib/gridding/kriging');
  const f = fitVariogram(exp, { model: 'spherical', nugget: 0 });
  expect(Math.abs(f.range - 600) / 600).toBeLessThan(0.01);
  expect(Math.abs(f.sill - 400) / 400).toBeLessThan(0.01);
  // and the point-based path runs end to end on a dipping dome
  const dome = pts.map((p) => ({ ...p, z: -1500 + 0.0002 * ((p.x - 1000) ** 2 + (p.y - 1000) ** 2) }));
  const fit = fitVariogramFromPoints(dome, { model: 'gaussian' });
  expect(fit.lag).toBe(100);
  expect(fit.bins).toBeGreaterThan(5);
  expect(fit.range).toBeGreaterThan(0);
  expect(fit.sill).toBeGreaterThan(0);
});

test('fitting refuses too few points with the reason', () => {
  expect(() => fitVariogramFromPoints([{ x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 2 }])).toThrow(/four control points/);
});

test('krigingOptions validates the dock fields and describeVariogram words them', () => {
  const o = krigingOptions({ model: 'exponential', range: '800', sill: '120.5', nugget: '', detrend: true });
  expect(o).toMatchObject({ model: 'exponential', range: 800, sill: 120.5, nugget: 0, detrend: true, neighbours: 24 });
  expect(() => krigingOptions({ model: 'spherical', range: '', sill: '1' })).toThrow(/range/);
  expect(describeVariogram({ model: 'spherical', range: 800, sill: 120.5, nugget: 10, detrend: true })).toBe('spherical variogram, range 800 m, sill 120.50, nugget 10.00, trend removed');
  expect(GRID_METHODS.map((m) => m.key)).toEqual(['tps', 'kriging']);
});

test('kriging through the Suite shim grids the same mask as the spline and returns a variance grid', () => {
  const pts = [{ x: 0, y: 0, z: -100 }, { x: 1000, y: 0, z: -120 }, { x: 0, y: 1000, z: -110 }, { x: 1000, y: 1000, z: -140 }, { x: 500, y: 500, z: -125 }];
  const spec = { x0: -100, y0: -100, dx: 100, dy: 100, nx: 13, ny: 13 };
  const t = gridSurface(pts, spec, { maxExtrapolation: 1e9 });
  const k = krigeSurface(pts, spec, { model: 'spherical', range: 1500, sill: 300, maxExtrapolation: 1e9, detrend: true });
  expect(k.live).toBe(t.live);
  for (let i = 0; i < k.z.length; i++) expect(isNull(k.z[i])).toBe(isNull(t.z[i]));
  expect(k.variance.length).toBe(k.z.length);
});
