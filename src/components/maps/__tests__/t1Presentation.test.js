// Mapping T1 presentation (MAP-T1-010/-011/-013): upsampled raster with a
// crisp null edge, colour-bar levels round in the display unit, the depth
// sign, and the two scene themes.
import { upsampledPixels, rasterUpsample, MAP_THEMES } from '../mapPainter';
import { colorbarLevelsFor, displaySign, contourPlan } from '@/pages/apps/MappingSurfaceStudio/components/MapCanvas';

const lut = new Uint8ClampedArray(256 * 4).map((_, i) => (i % 4 === 3 ? 255 : Math.floor(i / 4)));

test('upsampled raster: interior pixels are bilinear, pixels nearest a null node stay clear', () => {
  const spec = { nx: 3, ny: 2 };
  const N = 1e30;
  const grid = Float32Array.from([0, 100, N, 0, 100, N]);
  const { rgba, w, h } = upsampledPixels(grid, spec, lut, 0, 100, 4);
  expect([w, h]).toEqual([12, 8]);
  const red = (c, r) => rgba[(r * w + c) * 4];
  const alpha = (c, r) => rgba[(r * w + c) * 4 + 3];
  // between node 0 (z 0) and node 1 (z 100) the colour ramps smoothly
  const ramp = [2, 3, 4, 5].map((c) => red(c, 1));
  for (let i = 1; i < ramp.length; i++) expect(ramp[i]).toBeGreaterThan(ramp[i - 1]);
  // the third column is null: its pixels have no colour at all (crisp edge)
  for (let c = 10; c < 12; c++) expect(alpha(c, 2)).toBe(0);
  expect(alpha(0, 0)).toBe(255);
  expect(rasterUpsample({ nx: 22, ny: 14 })).toBe(8);
  expect(rasterUpsample({ nx: 505, ny: 262 })).toBe(2);
  expect(rasterUpsample({ nx: 2000, ny: 10 })).toBe(1);
});

test('colour-bar levels are round in feet for a metre grid', () => {
  const plan = contourPlan({ grid: null, unit: 'ft', isLength: true });
  const levels = colorbarLevelsFor(plan.toDisp, plan.fromDisp)(-1528, -1443, 5); // metres, -5013 to -4734 ft
  const ft = levels.map((m) => Math.round((m / 0.3048) * 1e6) / 1e6);
  expect(ft.length).toBeGreaterThan(2);
  for (const v of ft) expect(Math.abs(v % 50)).toBeLessThan(1e-6);
});

test('depth positive flips only depth structures, never isochores, time or attributes', () => {
  expect(displaySign({ z_domain: 'depth', kind: 'structure' }, true)).toBe(-1);
  expect(displaySign({ z_domain: 'depth', kind: 'structure' }, false)).toBe(1);
  expect(displaySign({ z_domain: 'depth', kind: 'isochore' }, true)).toBe(1);
  expect(displaySign({ z_domain: 'time', kind: 'structure' }, true)).toBe(1);
  expect(displaySign({ z_domain: 'attribute', kind: 'attribute' }, true)).toBe(1);
  const plan = contourPlan({ grid: null, unit: 'm', isLength: true, sign: -1 });
  expect(plan.toDisp(-1500)).toBe(1500);
  expect(plan.fromDisp(1500)).toBe(-1500);
});

test('the print theme is a white page with dark ink', () => {
  expect(MAP_THEMES.print.bg).toBe('#ffffff');
  expect(MAP_THEMES.print.ink).toBe('#0f172a');
  expect(MAP_THEMES.screen.bg).toBe('#0f172a');
});

test('paintRaster scales per bitmap pixel, so an upsampled bitmap still spans the cell extent', async () => {
  const { paintRaster } = await import('../mapPainter');
  const { MapTransform } = await import('../mapTransform');
  const t = new MapTransform();
  const spec = { x0: 0, y0: 0, dx: 10, dy: 10, nx: 4, ny: 3 };
  t.setWorld({ x0: 0, y0: 0, x1: 30, y1: 20 });
  t.setViewport(400, 300);
  const calls = [];
  const ctx = { save() {}, restore() {}, set imageSmoothingEnabled(v) {}, transform: (...a) => calls.push(a), drawImage() {} };
  paintRaster(ctx, { bitmap: { width: 4, height: 3 }, spec, transform: t });
  paintRaster(ctx, { bitmap: { width: 32, height: 24 }, spec, transform: t });
  expect(calls[1][0]).toBeCloseTo(calls[0][0] / 8, 9);
  expect(calls[1][3]).toBeCloseTo(calls[0][3] / 8, 9);
  expect(calls[1][4]).toBeCloseTo(calls[0][4], 9);
});

test('the contour step is a positive magnitude with the depth sign flipped', () => {
  const grid = Float32Array.from([-1500, -1450, -1400, -1350]);
  const up = contourPlan({ grid, unit: 'm', isLength: true, sign: 1 });
  const down = contourPlan({ grid, unit: 'm', isLength: true, sign: -1 });
  expect(down.stepM).toBeGreaterThan(0);
  expect(down.stepM).toBeCloseTo(up.stepM, 9);
});

test('well symbols follow the registry status, and the legend lists only the kinds present', async () => {
  const { defaultSymbol, paintWellLegend } = await import('../mapPainter');
  expect(['oil', 'gas', 'oil_gas', 'water', 'injector_water', 'dry', 'planned', 'suspended', null].map((st) => defaultSymbol({ status: st })))
    .toEqual(['oil', 'gas', 'oilgas', 'water', 'injector', 'cross', 'ring', 'suspended', 'circle']);
  const texts = [];
  const ctx = new Proxy({ measureText: () => ({ width: 40 }), fillText: (t) => texts.push(t) }, { get: (o, k) => (k in o ? o[k] : () => {}), set: () => true });
  expect(paintWellLegend(ctx, { wells: [{ name: 'A' }], x: 0, bottom: 100 })).toBe(0);
  const h = paintWellLegend(ctx, { wells: [{ status: 'oil' }, { status: 'gas' }, { status: 'oil' }], x: 0, bottom: 100 });
  expect(h).toBe(36);
  expect(texts).toEqual(['Oil', 'Gas']);
});
