import {
  ViewTransform, MIN_ZOOM, MAX_ZOOM, MIN_VEXAG, MAX_VEXAG,
} from '../viewer/viewTransform';

const close = (a, b, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('ViewTransform', () => {
  const make = () => {
    const t = new ViewTransform({ nx: 400, ny: 1000, vw: 800, vh: 500 });
    return t;
  };

  test('fit view is the identity uniform (legacy full-slice rendering)', () => {
    const t = make();
    expect(t.viewUniform()).toEqual([0, 0, 1, 1]);
    expect(t.isIdentity()).toBe(true);
  });

  test('screen/world round-trip', () => {
    const t = make();
    t.zoomAt(3.7, 123, 456);
    const w = t.screenToWorld(200, 300);
    const s = t.worldToScreen(w.x, w.y);
    close(s.x, 200);
    close(s.y, 300);
  });

  test('zoomAt keeps the world point under the cursor fixed', () => {
    const t = make();
    const before = t.screenToWorld(600, 100);
    t.zoomAt(2, 600, 100);
    const after = t.screenToWorld(600, 100);
    close(after.x, before.x);
    close(after.y, before.y);
    close(t.zoom, 2);
  });

  test('zoom clamps to [MIN_ZOOM, MAX_ZOOM]', () => {
    const t = make();
    t.zoomAt(0.01, 400, 250);
    close(t.zoom, MIN_ZOOM);
    t.zoomAt(1e9, 400, 250);
    close(t.zoom, MAX_ZOOM);
  });

  test('center clamps so the view never leaves the data when zoomed', () => {
    const t = make();
    t.zoomAt(4, 400, 250);
    t.panBy(1e7, -1e7); // drag world right/up beyond any limit
    const r = t.visibleRect();
    close(r.x0, 0);                  // stopped at left data edge
    close(r.y0 + r.h, t.ny);         // stopped at bottom data edge
  });

  test('at fit, panning is locked (whole extent visible)', () => {
    const t = make();
    t.panBy(500, 500);
    expect(t.viewUniform()).toEqual([0, 0, 1, 1]);
  });

  test('vertical exaggeration stretches y only and clamps', () => {
    const t = make();
    t.setVexag(2);
    const [, , w, h] = t.viewUniform();
    close(w, 1);
    close(h, 0.5);                   // half the samples visible at VE x2
    t.setVexag(1e9);
    close(t.vexag, MAX_VEXAG);
    t.setVexag(0);
    close(t.vexag, MIN_VEXAG);
  });

  test('vexag < 1 shows beyond the data and re-centres the axis', () => {
    const t = make();
    t.setVexag(0.5);
    const [, y0, , h] = t.viewUniform();
    close(h, 2);                     // world is half the viewport height
    close(y0, -0.5);                 // centred, background above and below
  });

  test('zoomToRect shows the whole rect and centres on it', () => {
    const t = make();
    const a = t.screenToWorld(100, 100);
    const b = t.screenToWorld(300, 400);
    t.zoomToRect(100, 100, 300, 400);
    const r = t.visibleRect();
    expect(r.x0).toBeLessThanOrEqual(a.x + 1e-9);
    expect(r.y0).toBeLessThanOrEqual(a.y + 1e-9);
    expect(r.x0 + r.w).toBeGreaterThanOrEqual(b.x - 1e-9);
    expect(r.y0 + r.h).toBeGreaterThanOrEqual(b.y - 1e-9);
  });

  test('viewport resize keeps the visible world fraction', () => {
    const t = make();
    t.zoomAt(4, 400, 250);
    const before = t.viewUniform();
    t.setViewport(1600, 1000);       // 2x both dims
    const after = t.viewUniform();
    before.forEach((v, i) => close(after[i], v, 1e-9));
  });

  test('setWorld with new dimensions refits, same dimensions keeps camera', () => {
    const t = make();
    t.zoomAt(4, 100, 100);
    const kept = t.viewUniform();
    t.setWorld(400, 1000);
    expect(t.viewUniform()).toEqual(kept);
    t.setWorld(200, 1000);
    expect(t.isIdentity()).toBe(true);
  });

  test('fit preserves exaggeration, reset clears it', () => {
    const t = make();
    t.setVexag(3);
    t.zoomAt(5, 10, 10);
    t.fit();
    close(t.zoom, 1);
    close(t.vexag, 3);
    t.reset();
    close(t.vexag, 1);
  });
});
