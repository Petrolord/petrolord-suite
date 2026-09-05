// The metre-world camera: the PAD-44 letterbox the Earth Modeling e2e
// derives its click pixels from, y up, zoom about the cursor, pan with
// the pointer, and the resize rule.
import { MapTransform, FIT_PAD } from '../mapTransform';

// the Earth Modeling goldens' model frame
const SPEC = { x0: 1000, y0: 2000, dx: 50, dy: 50, nx: 25, ny: 20 };
const extent = { x0: 1000, y0: 2000, x1: 1000 + 24 * 50, y1: 2000 + 19 * 50 };

const make = (w = 800, h = 480) => new MapTransform().setWorld(extent).setViewport(w, h);

test('fit reproduces the PAD-44 letterbox the Earth Modeling e2e derives from the canvas box', () => {
  const t = make();
  const scale = Math.min((800 - 2 * FIT_PAD) / (extent.x1 - extent.x0), (480 - 2 * FIT_PAD) / (extent.y1 - extent.y0));
  expect(t.scale).toBeCloseTo(scale, 12);
  expect(t.fitScale).toBe(t.scale);
  const cx = (extent.x0 + extent.x1) / 2;
  const cy = (extent.y0 + extent.y1) / 2;
  // the e2e formula: x = W/2 + (wx - cx) * scale, y = H/2 - (wy - cy) * scale
  for (const [wx, wy] of [[975, 1975], [1575, 2430], [1275, 2975]]) {
    const s = t.worldToScreen(wx, wy);
    expect(s.x).toBeCloseTo(800 / 2 + (wx - cx) * scale, 9);
    expect(s.y).toBeCloseTo(480 / 2 - (wy - cy) * scale, 9);
  }
  expect(SPEC.nx).toBe(25);
});

test('y grows up the screen and screenToWorld inverts worldToScreen', () => {
  const t = make();
  const a = t.worldToScreen(1500, 2000);
  const b = t.worldToScreen(1500, 2500);
  expect(b.y).toBeLessThan(a.y);
  const w = t.screenToWorld(123.4, 56.7);
  const s = t.worldToScreen(w.x, w.y);
  expect(s.x).toBeCloseTo(123.4, 9);
  expect(s.y).toBeCloseTo(56.7, 9);
});

test('zoomAt keeps the world point under the cursor fixed and marks the camera touched', () => {
  const t = make();
  const before = t.screenToWorld(200, 100);
  t.zoomAt(2, 200, 100);
  const after = t.screenToWorld(200, 100);
  expect(after.x).toBeCloseTo(before.x, 9);
  expect(after.y).toBeCloseTo(before.y, 9);
  expect(t.scale).toBeCloseTo(t.fitScale * 2, 12);
  expect(t.touched).toBe(true);
});

test('zoom is clamped between 1/8 and 256 of the fit', () => {
  const t = make();
  t.zoomAt(1e-6, 0, 0);
  expect(t.scale).toBeCloseTo(t.fitScale / 8, 12);
  t.zoomAt(1e9, 0, 0);
  expect(t.scale).toBeCloseTo(t.fitScale * 256, 9);
});

test('panBy moves the world with the pointer', () => {
  const t = make();
  const p = t.worldToScreen(1500, 2400);
  t.panBy(30, -20);
  const q = t.worldToScreen(1500, 2400);
  expect(q.x - p.x).toBeCloseTo(30, 9);
  expect(q.y - p.y).toBeCloseTo(-20, 9);
});

test('zoomToRect fills the viewport with the rectangle', () => {
  const t = make();
  const a = t.worldToScreen(1200, 2200);
  const b = t.worldToScreen(1400, 2300);
  t.zoomToRect(a.x, a.y, b.x, b.y);
  const r = t.visibleRect();
  expect(r.x0).toBeLessThanOrEqual(1200 + 1e-9);
  expect(r.x1).toBeGreaterThanOrEqual(1400 - 1e-9);
  expect(r.y0).toBeLessThanOrEqual(2200 + 1e-9);
  expect(r.y1).toBeGreaterThanOrEqual(2300 - 1e-9);
});

test('a resize refits only while the camera is untouched', () => {
  const t = make();
  t.setViewport(1000, 600);
  expect(t.scale).toBeCloseTo(t.fitScale, 12);
  t.zoomAt(1.5, 500, 300);
  const s = t.scale;
  t.setViewport(1200, 700);
  expect(t.scale).toBe(s);
  expect(t.fitScale).toBeCloseTo(Math.min((1200 - 88) / 1200, (700 - 88) / 950), 12);
});

test('a new world extent refits; the same extent does not', () => {
  const t = make();
  t.zoomAt(2, 100, 100);
  t.setWorld({ ...extent });
  expect(t.touched).toBe(true);
  t.setWorld({ x0: 0, y0: 0, x1: 100, y1: 100 });
  expect(t.touched).toBe(false);
  expect(t.cx).toBe(50);
});

test('camera round-trips through get/setCamera and metersPerPx is 1/scale', () => {
  const t = make();
  t.zoomAt(3, 10, 10);
  const c = t.getCamera();
  const u = make();
  u.setCamera(c);
  expect(u.getCamera()).toEqual(c);
  expect(u.metersPerPx).toBeCloseTo(1 / c.scale, 12);
});
