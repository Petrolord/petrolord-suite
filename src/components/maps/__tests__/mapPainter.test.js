// Pure painters against a recording canvas context (jsdom has no
// canvas): the raster flip, posted wells, polygon styles, contour
// weights and labels, the colour bar and the scale bar.
import { MapTransform } from '../mapTransform';
import {
  nodeExtent, rasterBitmap, paintRaster, contourPaths, paintContours, paintWells,
  paintPolygons, paintColorbar, paintScaleBar, paintNorthArrow, paintAxes, sampleAtScreen,
} from '../mapPainter';
import { STRUCTURE_LUT } from '../lut';

function makeCtx() {
  const calls = [];
  const rec = (name) => (...args) => { calls.push([name, ...args]); };
  const ctx = {
    calls, canvas: { width: 800, height: 480 },
    fillStyle: null, strokeStyle: null, font: '', textAlign: '', textBaseline: '', lineWidth: 1, globalAlpha: 1, imageSmoothingEnabled: true,
    fillRect: rec('fillRect'), strokeRect: rec('strokeRect'), beginPath: rec('beginPath'), moveTo: rec('moveTo'),
    lineTo: rec('lineTo'), closePath: rec('closePath'), arc: rec('arc'),
    stroke: () => { calls.push(['stroke', ctx.strokeStyle, ctx.lineWidth]); },
    fill: () => { calls.push(['fill', ctx.fillStyle]); },
    save: rec('save'), restore: rec('restore'), translate: rec('translate'), rotate: rec('rotate'), scale: rec('scale'),
    setLineDash: rec('setLineDash'), drawImage: rec('drawImage'), putImageData: rec('putImageData'),
    fillText: (...a) => { calls.push(['fillText', ...a, { fillStyle: ctx.fillStyle, align: ctx.textAlign }]); },
    strokeText: rec('strokeText'),
    measureText: (s) => ({ width: 6 * String(s).length }),
  };
  return ctx;
}
const of = (ctx, name) => ctx.calls.filter((c) => c[0] === name);
const texts = (ctx) => of(ctx, 'fillText').map((c) => c[1]);

// a tilted plane on a 5x4 grid, dx 100
const spec = { x0: 0, y0: 0, dx: 100, dy: 100, nx: 5, ny: 4 };
const grid = Float32Array.from({ length: 20 }, (_, i) => -1500 + (i % 5) * 10 + Math.floor(i / 5) * 5);
const tr = () => new MapTransform().setWorld(nodeExtent(spec)).setViewport(800, 480);

beforeAll(() => {
  global.ImageData = class { constructor(data, w, h) { this.data = data; this.width = w; this.height = h; } };
});

test('rasterBitmap draws nx x ny pixels; paintRaster anchors at the south-west corner and flips y', () => {
  const off = makeCtx();
  const bitmap = rasterBitmap({ grid, spec, lut: STRUCTURE_LUT, zMin: -1500, zMax: -1445, makeCanvas: () => ({ getContext: () => off }) });
  expect(bitmap.width).toBe(5);
  expect(bitmap.height).toBe(4);
  expect(of(off, 'putImageData')[0][1].width).toBe(5);
  const ctx = makeCtx();
  const t = tr();
  paintRaster(ctx, { bitmap, spec, transform: t });
  const sw = t.worldToScreen(-50, -50);   // cell extent: half a cell beyond the nodes
  const ne = t.worldToScreen(450, 350);
  const tl = of(ctx, 'translate')[0];
  expect(tl[1]).toBeCloseTo(sw.x, 9);
  expect(tl[2]).toBeCloseTo(sw.y, 9);
  const sc = of(ctx, 'scale')[0];
  expect(sc[1]).toBeCloseTo((ne.x - sw.x) / 5, 9);
  expect(sc[2]).toBeCloseTo((ne.y - sw.y) / 4, 9);
  expect(sc[2]).toBeLessThan(0); // the flip: bitmap row 0 (south) lands at the bottom
  expect(of(ctx, 'drawImage')[0][1]).toBe(bitmap);
});

test('contourPaths honours a fixed step in world coordinates and falls back to automatic when the step is absurd', () => {
  const c = contourPaths(grid, spec, { step: 10 });
  expect(c.auto).toBe(false);
  expect(c.step).toBe(10);
  expect(c.levels[0]).toBe(-1500);
  expect(c.levels[c.levels.length - 1]).toBe(-1450);
  // every path vertex lies inside the node extent, in metres
  for (const polys of c.paths) for (const p of polys) for (let k = 0; k < p.length; k += 2) {
    expect(p[k]).toBeGreaterThanOrEqual(0); expect(p[k]).toBeLessThanOrEqual(400);
    expect(p[k + 1]).toBeGreaterThanOrEqual(0); expect(p[k + 1]).toBeLessThanOrEqual(300);
  }
  const tiny = contourPaths(grid, spec, { step: 1e-4 });
  expect(tiny.auto).toBe(true);
  expect(contourPaths(grid, spec).auto).toBe(true);
});

test('paintContours strokes majors heavier and labels only majors (halo then ink)', () => {
  const ctx = makeCtx();
  const c = contourPaths(grid, spec, { step: 10 });
  paintContours(ctx, { contours: c, transform: tr(), labels: true, fmt: (v) => `${v}` });
  const widths = new Set(of(ctx, 'stroke').map((s) => s[2]));
  expect(widths.has(1.6)).toBe(true);
  expect(widths.has(1)).toBe(true);
  const labels = texts(ctx);
  expect(labels.length).toBeGreaterThan(0);
  for (const l of labels) expect(Math.abs(Math.round(Number(l) / 10) % 5)).toBe(0);
  expect(of(ctx, 'strokeText').length).toBe(labels.length);
  const off = makeCtx();
  paintContours(off, { contours: c, transform: tr(), labels: false });
  expect(texts(off)).toEqual([]);
});

test('paintWells posts the symbol, the name and the value, and marks a displaced borehole', () => {
  const ctx = makeCtx();
  const t = tr();
  const wells = [
    { name: 'A-1', surface_x: 100, surface_y: 100 },
    { name: 'D-2', surface_x: 200, surface_y: 200, status: 'planned' },
    { name: 'X-3', surface_x: null, surface_y: 1 },
  ];
  paintWells(ctx, { wells, transform: t, posted: { 'A-1': { z: -1490, x: 100, y: 100 }, 'D-2': { z: -1480, x: 300, y: 150 } }, fmt: (v) => `${v.toFixed(0)} m` });
  expect(texts(ctx)).toEqual(['A-1  -1490 m', 'D-2  -1480 m']);
  // A-1 at the wellhead: no borehole square; D-2 displaced: dashed line + square
  expect(of(ctx, 'setLineDash').filter((c) => c[1].length === 2)).toHaveLength(1);
  expect(of(ctx, 'fillRect')).toHaveLength(1);
  const b = t.worldToScreen(300, 150);
  expect(of(ctx, 'fillRect')[0].slice(1, 3)).toEqual([b.x - 2, b.y - 2]);
  // one filled circle (A-1) and one ring (D-2, planned)
  expect(of(ctx, 'arc')).toHaveLength(2);
  expect(of(ctx, 'fill')).toHaveLength(1);
  const noNames = makeCtx();
  paintWells(noNames, { wells, transform: t, showNames: false });
  expect(texts(noNames)).toEqual([]);
});

test('paintPolygons closes committed rings in gold and dashes the draft with vertex squares', () => {
  const ctx = makeCtx();
  paintPolygons(ctx, { polygons: [{ vertices: [[0, 0], [100, 0], [100, 100]] }], pending: [[10, 10], [20, 20]], transform: tr() });
  expect(of(ctx, 'closePath')).toHaveLength(1);
  const strokes = of(ctx, 'stroke');
  expect(strokes[0][1]).toBe('#eab308');
  expect(strokes[1][1]).toBe('#f97316');
  expect(of(ctx, 'setLineDash').some((c) => c[1].length === 2 && c[1][0] === 4 && c[1][1] === 3)).toBe(true);
  expect(of(ctx, 'fillRect')).toHaveLength(2);
});

test('paintColorbar labels the ends and nice ticks and prints the contour interval', () => {
  const ctx = makeCtx();
  paintColorbar(ctx, { x: 780, y: 44, w: 10, h: 300, lut: STRUCTURE_LUT, zMin: -1500, zMax: -1445, fmt: (v) => v.toFixed(0), unit: 'm', step: 10 });
  const t = texts(ctx);
  expect(t[0]).toBe('-1445');
  expect(t[1]).toBe('-1500');
  expect(t).toContain('-1480'); // nice ticks at 20 across a 55 m span
  expect(t[t.length - 1]).toBe('CI 10 m');
  expect(of(ctx, 'fillRect')).toHaveLength(300);
});

test('paintScaleBar picks the longest nice length; north arrow labels N above the circle; axes tick both edges', () => {
  const ctx = makeCtx();
  const t = tr();
  paintScaleBar(ctx, { x: 12, y: 468, transform: t, maxPx: 180 });
  const label = texts(ctx)[0];
  expect(label).toMatch(/^\d+ m$|^\d+(\.\d+)? km$/);
  const n = makeCtx();
  paintNorthArrow(n, { x: 26, y: 30 });
  const nt = of(n, 'fillText')[0];
  expect(nt[1]).toBe('N');
  expect(nt[3]).toBeLessThan(30 - 14);
  const a = makeCtx();
  paintAxes(a, { transform: t });
  expect(of(a, 'rotate').length).toBeGreaterThan(0);
  expect(texts(a).length).toBeGreaterThan(2);
});

test('sampleAtScreen reads the node under the pointer and reports null off the grid', () => {
  const t = tr();
  const s = t.worldToScreen(200, 100);
  const hit = sampleAtScreen(grid, spec, t, s.x, s.y);
  expect(hit.z).toBe(grid[1 * 5 + 2]);
  expect(hit.x).toBeCloseTo(200, 6);
  const miss = sampleAtScreen(grid, spec, t, 1, 1);
  expect(miss.z).toBeNull();
});
