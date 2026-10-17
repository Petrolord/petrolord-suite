// The measured closure drawn on the map (Geoscience video Part B). The
// masks come straight off the closure engine's spill flood; on an analytic
// cone every area is closed-form (a disc of radius (crest - level) / slope),
// so the node counts are checked against pi r^2 / (dx dy).
import { quickGrv } from '../services/quickGrv';
import { floodMask, maskContour, closureLayers, CLOSURE_STYLE } from '../services/closureDisplay';
import { fillBitmaps, paintLayerLegend, paintMarkers } from '@/components/maps/mapPainter';

const cone = (x, y, cx = 0, top = -1800) => top - 0.1 * Math.hypot(x - cx, y);
const gridOf = (fn, spec) => {
  const z = new Float32Array(spec.nx * spec.ny);
  for (let r = 0; r < spec.ny; r++) for (let c = 0; c < spec.nx; c++) z[r * spec.nx + c] = fn(spec.x0 + c * spec.dx, spec.y0 + r * spec.dy);
  return z;
};
const count = (m) => m.reduce((a, b) => a + b, 0);
const fmtDepth = (m) => `${Math.round(-m / 0.3048).toLocaleString('en-US')} ft`;
const spec = { x0: -1500, y0: -1500, dx: 25, dy: 25, nx: 121, ny: 121 };
const z = gridOf(cone, spec);

describe('closure masks read off the spill flood', () => {
  const r = quickGrv({ spec, gridM: z, contactM: -1900 });

  test('the closed area to the spill is the disc inside the spill level', () => {
    // spill at the map edge level -1950 m: radius 1500 m
    expect(r.spill.z).toBeCloseTo(-1950, 3);
    const { mask, nodes } = floodMask(r.spillFlood, spec, r.spill.z);
    expect(count(mask)).toBe(nodes);
    expect(Math.abs(nodes / ((Math.PI * 1500 ** 2) / 625) - 1)).toBeLessThan(0.01);
  });

  test('the area above the contact matches the engine closure exactly', () => {
    const { nodes } = floodMask(r.spillFlood, spec, -1900);
    expect(nodes).toBe(r.nodesAbove);
    expect(Math.abs(nodes / ((Math.PI * 1000 ** 2) / 625) - 1)).toBeLessThan(0.01);
  });

  test('the contact outline is one closed ring of radius 1000 m round the crest', () => {
    const { mask } = floodMask(r.spillFlood, spec, -1900);
    const rings = maskContour(z, spec, mask, -1900);
    expect(rings).toHaveLength(1);
    const p = rings[0];
    expect(Math.hypot(p[0] - p[p.length - 2], p[1] - p[p.length - 1])).toBeLessThan(1e-6);
    let sum = 0; const n = p.length / 2;
    for (let k = 0; k < p.length; k += 2) sum += Math.hypot(p[k], p[k + 1]);
    expect(Math.abs(sum / n - 1000)).toBeLessThan(15);
  });

  test('negative control: a neighbouring high above the same level draws no second ring', () => {
    // two separate cones; the mask holds only the western one
    const s2 = { x0: -3000, y0: -1500, dx: 25, dy: 25, nx: 241, ny: 121 };
    const z2 = gridOf((x, y) => Math.max(cone(x, y, -1500), cone(x, y, 1500, -1820)), s2);
    const unmasked = maskContour(z2, s2, new Uint8Array(z2.length).fill(1), -1901.3);
    expect(unmasked).toHaveLength(2);
    const r2 = quickGrv({ spec: s2, gridM: z2, contactM: -1901.3 });
    const { mask } = floodMask(r2.spillFlood, s2, -1901.3);
    const rings = maskContour(z2, s2, mask, -1901.3);
    expect(rings).toHaveLength(1);
    expect(rings[0][0]).toBeLessThan(0); // the western cone
  });
});

describe('closureLayers', () => {
  test('fills, outlines, crest and the legend for a contact inside the closure', () => {
    const r = quickGrv({ spec, gridM: z, contactM: -1900 });
    const L = closureLayers({ grv: r, gridM: z, spec, fmtDepth });
    expect(L.fills.map((f) => f.color)).toEqual([CLOSURE_STYLE.closedFill, CLOSURE_STYLE.hcFill]);
    expect(L.lines.map((l) => l.color)).toEqual([CLOSURE_STYLE.spillLine, CLOSURE_STYLE.contactLine]);
    expect(L.lines[1].dash).toEqual([8, 5]);
    expect(L.markers[0]).toMatchObject({ x: 0, y: 0, label: 'crest 5,906 ft', shape: 'cross' });
    expect(L.legend.map((x) => x.label)).toEqual(['Closure to spill 6,398 ft', 'Spill contour', 'Above the contact', 'Contact 6,234 ft']);
  });

  test('a contact below the spill fills the trap to the spill and draws no contact line', () => {
    const r = quickGrv({ spec, gridM: z, contactM: -1990 });
    const L = closureLayers({ grv: r, gridM: z, spec, fmtDepth });
    expect(L.lines).toHaveLength(1);
    expect(count(L.fills[1].mask)).toBe(count(L.fills[0].mask));
    expect(L.legend.map((x) => x.label)).toContain('Filled to spill (contact 6,529 ft)');
  });

  test('a gas-oil contact adds the gas cap above it', () => {
    const r = quickGrv({ spec, gridM: z, contactM: -1900 });
    const L = closureLayers({ grv: r, gridM: z, spec, fmtDepth, gocM: -1850 });
    expect(L.fills).toHaveLength(3);
    expect(Math.abs(count(L.fills[2].mask) / ((Math.PI * 500 ** 2) / 625) - 1)).toBeLessThan(0.02);
    expect(L.legend.map((x) => x.label)).toContain('GOC 6,070 ft');
  });

  test('nothing to draw without a measured closure', () => {
    expect(closureLayers({ grv: null, gridM: z, spec, fmtDepth })).toBeNull();
    expect(closureLayers({ grv: { kind: 'none' }, gridM: z, spec, fmtDepth })).toBeNull();
  });
});

describe('map painters for the closure', () => {
  const recorder = () => {
    const calls = [];
    const ctx = new Proxy({ calls }, {
      get: (t, k) => (k in t ? t[k] : k === 'measureText' ? (s) => ({ width: String(s).length * 6 }) : (...a) => { calls.push([k, ...a]); }),
      set: (t, k, v) => { calls.push([`=${String(k)}`, v]); return true; },
    });
    return ctx;
  };

  test('fillBitmaps paints the mask nodes in the fill colour and leaves the rest clear', () => {
    let put = null;
    const fake = () => ({ width: 0, height: 0, getContext: () => ({ putImageData: (img) => { put = img; } }) });
    global.ImageData = global.ImageData || class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } };
    const s = { nx: 3, ny: 2 };
    const [c] = fillBitmaps([{ mask: Uint8Array.from([0, 1, 0, 0, 0, 1]), color: [250, 204, 21, 0.3] }], s, fake);
    expect([c.width, c.height]).toEqual([3, 2]);
    expect(Array.from(put.data.slice(4, 8))).toEqual([250, 204, 21, 77]);
    expect(Array.from(put.data.slice(0, 4))).toEqual([0, 0, 0, 0]);
  });

  test('the layer legend draws one swatch or line per item with its label', () => {
    const ctx = recorder();
    paintLayerLegend(ctx, { x: 8, y: 56, items: [{ kind: 'fill', color: 'rgba(1,2,3,0.5)', label: 'Closure to spill 6,398 ft' }, { kind: 'line', color: '#2563eb', dash: [8, 5], label: 'Contact 6,234 ft' }] });
    const texts = ctx.calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);
    expect(texts).toEqual(['Closure to spill 6,398 ft', 'Contact 6,234 ft']);
    expect(ctx.calls.some((c) => c[0] === 'setLineDash' && c[1].length === 2)).toBe(true);
  });

  test('a cross marker (the crest) strokes a cross and labels it in its own colour', () => {
    const ctx = recorder();
    paintMarkers(ctx, { markers: [{ x: 0, y: 0, label: 'crest 5,906 ft', color: '#fde047', shape: 'cross' }], transform: { worldToScreen: (x, y) => ({ x, y }) } });
    expect(ctx.calls.filter((c) => c[0] === 'stroke')).toHaveLength(2);
    expect(ctx.calls.find((c) => c[0] === 'fillText')[1]).toBe('crest 5,906 ft');
    expect(ctx.calls.filter((c) => c[0] === '=fillStyle').pop()[1]).toBe('#fde047');
  });
});
