// The shared track painter (2026-09-03) against a recording canvas
// context: jsdom has no canvas, so the assertions are on the draw calls
// the primitives emit. Pins the TrackViewer geometry the Petrophysics
// e2e relies on (title y 12, scale rows y 24/33, readouts y 46, ramp
// legend at headerH - 4) and the fill and tag semantics.
import {
  visibleRange, paintDepthAxis, paintTrackHeader, paintTrackBody, paintTrackColumn, paintReadouts, paintTopMarker, PALETTES,
} from '../trackPainter';

function makeCtx() {
  const calls = [];
  const rec = (name) => (...args) => { calls.push([name, ...args]); };
  const ctx = {
    calls,
    fillStyle: null, strokeStyle: null, font: '', textAlign: '', lineWidth: 1, globalAlpha: 1,
    fillRect: rec('fillRect'), strokeRect: rec('strokeRect'), beginPath: rec('beginPath'), moveTo: rec('moveTo'),
    lineTo: rec('lineTo'), stroke: rec('stroke'), closePath: rec('closePath'),
    fill: () => { calls.push(['fill', ctx.fillStyle]); },
    save: rec('save'), restore: rec('restore'), translate: rec('translate'), rotate: rec('rotate'),
    setLineDash: rec('setLineDash'),
    fillText: (...a) => { calls.push(['fillText', ...a, { fillStyle: ctx.fillStyle, align: ctx.textAlign }]); },
    measureText: (s) => ({ width: 6 * String(s).length }),
    createLinearGradient: () => ({ addColorStop: rec('addColorStop') }),
  };
  return ctx;
}
const texts = (ctx) => ctx.calls.filter((c) => c[0] === 'fillText');

const depth = Float64Array.from({ length: 101 }, (_, i) => 2000 + i);
const yOf = (d) => 52 + ((d - 2000) / 100) * 400; // plotTop 52, plotH 400

describe('visibleRange', () => {
  test('matches the scan semantics with a one-sample margin', () => {
    expect(visibleRange(depth, 2010, 2020)).toEqual({ i0: 9, i1: 21 });
    expect(visibleRange(depth, 2000, 2100)).toEqual({ i0: 0, i1: 100 });
    expect(visibleRange(depth, 1900, 1950)).toEqual({ i0: 0, i1: 1 });   // window above the log
    expect(visibleRange(depth, 2200, 2300)).toEqual({ i0: 99, i1: 100 }); // window below the log
    expect(visibleRange(new Float64Array(0), 0, 1)).toEqual({ i0: 0, i1: -1 });
  });
  test('works on a non-uniform depth array', () => {
    const d = Float64Array.from([1400, 1400.5, 1402, 1409, 1430, 1500, 1750]);
    expect(visibleRange(d, 1405, 1440)).toEqual({ i0: 2, i1: 5 });
  });
});

describe('paintTrackHeader', () => {
  const dn = {
    title: 'Density–Neutron', scale: 'linear', min: 1.95, max: 2.95,
    curves: [
      { name: 'RHOB', color: '#dc2626', min: 1.95, max: 2.95, data: [] },
      { name: 'NPHI', color: '#3b82f6', min: 0.45, max: -0.15, style: 'dash', data: [] },
    ],
  };
  test('title at y 12 and one scale row per distinct range, in the curve colour', () => {
    const ctx = makeCtx();
    paintTrackHeader(ctx, { track: dn, x0: 56, w: 200, headerH: 50 });
    const t = texts(ctx);
    expect(t[0].slice(1, 4)).toEqual(['Density–Neutron', 156, 12]);
    // row 1 (RHOB) at y 24, row 2 (NPHI) at y 33
    expect(t.find((c) => c[1] === '1.95')[3]).toBe(24);
    expect(t.find((c) => c[1] === '2.95')[3]).toBe(24);
    expect(t.find((c) => c[1] === '0.45')[3]).toBe(33);
    expect(t.find((c) => c[1] === '0.45')[4].fillStyle).toBe('#3b82f6');
    expect(t.find((c) => c[1] === '-0.15')[4].align).toBe('right');
  });
  test('a single-range track gets one grey row, log scale marked', () => {
    const ctx = makeCtx();
    const rt = { title: 'RT', scale: 'log', min: 0.2, max: 2000, curves: [{ name: 'RT', color: '#dc2626', data: [] }] };
    paintTrackHeader(ctx, { track: rt, x0: 0, w: 100, headerH: 50 });
    const t = texts(ctx);
    expect(t).toHaveLength(3);
    expect(t[1][4].fillStyle).toBe(PALETTES.light.axisText);
    expect(t[2][1]).toBe('2000 log');
  });
});

describe('paintTrackBody', () => {
  test('a strip track paints one band per visible sample', () => {
    const ctx = makeCtx();
    const strip = { type: 'strip', title: 'Facies', colors: ['#111111', '#222222'], curves: [{ name: 'facies', data: Float64Array.from({ length: 101 }, (_, i) => i % 2) }] };
    paintTrackBody(ctx, { track: strip, depth, yOf, i0: 10, i1: 20, x0: 56, w: 100, plotTop: 52, plotH: 400 });
    const rects = ctx.calls.filter((c) => c[0] === 'fillRect');
    expect(rects).toHaveLength(10);
    expect(rects[0].slice(1)).toEqual([58, yOf(2010), 96, 4]);
  });
  test('a threshold fill paints on the chosen side with an alpha suffix, colour2 on the other', () => {
    const ctx = makeCtx();
    const gr = {
      title: 'GR', scale: 'linear', min: 0, max: 150,
      curves: [{ name: 'GR', color: '#059669', data: Float64Array.from({ length: 101 }, (_, i) => (i < 50 ? 30 : 120)) }],
      fills: [{ mode: 'threshold', a: 0, value: 75, side: 'below', color: '#fde047', color2: '#9ca3af', opacity: 0.35 }],
    };
    paintTrackBody(ctx, { track: gr, depth, yOf, i0: 0, i1: 100, x0: 56, w: 100, plotTop: 52, plotH: 400 });
    const fillStyles = ctx.calls.filter((c) => c[0] === 'fill').map((c) => c[1]);
    // both sides filled, each with the 0.35 alpha suffix (0x59)
    expect(fillStyles).toContain('#fde04759');
    expect(fillStyles).toContain('#9ca3af59');
  });
  test('a ramp fill paints strips and a legend bar at headerH - 4 only when asked', () => {
    const litho = {
      title: 'Lithology', scale: 'linear', min: 0, max: 150,
      curves: [{ name: 'GR', color: '#475569', data: Float64Array.from({ length: 101 }, (_, i) => 15 + i) }],
      fills: [{ mode: 'ramp', a: 0, fillTo: 'track', stops: [{ value: 15, color: '#f5e6a8' }, { value: 150, color: '#5c3a1e' }], opacity: 0.9 }],
    };
    const withLegend = makeCtx();
    paintTrackBody(withLegend, { track: litho, depth, yOf, i0: 0, i1: 100, x0: 56, w: 100, plotTop: 52, plotH: 400, headerH: 50 });
    const legend = withLegend.calls.filter((c) => c[0] === 'fillRect' && c[2] === 46 && c[4] === 3);
    expect(legend).toHaveLength(1);
    expect(withLegend.calls.filter((c) => c[0] === 'addColorStop')).toHaveLength(2);
    const without = makeCtx();
    paintTrackBody(without, { track: litho, depth, yOf, i0: 0, i1: 100, x0: 56, w: 100, plotTop: 52, plotH: 400 });
    expect(without.calls.filter((c) => c[0] === 'addColorStop')).toHaveLength(0);
    expect(without.calls.filter((c) => c[0] === 'fillRect').length).toBeGreaterThan(50);
  });
  test('an empty visible range draws only the frame', () => {
    const ctx = makeCtx();
    const gr = { title: 'GR', scale: 'linear', min: 0, max: 150, curves: [{ name: 'GR', color: '#059669', data: depth }] };
    paintTrackBody(ctx, { track: gr, depth, yOf, i0: 5, i1: 4, x0: 0, w: 100, plotTop: 52, plotH: 400 });
    expect(ctx.calls.map((c) => c[0])).toEqual(['strokeRect']);
  });
});

describe('paintTrackColumn and paintReadouts', () => {
  const tracks = [
    { title: 'GR', scale: 'linear', min: 0, max: 150, curves: [{ name: 'GR', color: '#059669', data: Float64Array.from({ length: 101 }, () => 42.5) }] },
    { title: 'RT', scale: 'log', min: 0.2, max: 2000, curves: [{ name: 'RT', color: '#dc2626', data: Float64Array.from({ length: 101 }, () => NaN) }] },
  ];
  const geom = [{ x0: 56, w: 100 }, { x0: 156, w: 100 }];
  test('headers can be skipped; bodies always paint', () => {
    const on = makeCtx();
    paintTrackColumn(on, { tracks, geom, depth, yOf, i0: 0, i1: 100, headerH: 50, plotTop: 52, plotH: 400 });
    expect(texts(on).map((c) => c[1])).toEqual(expect.arrayContaining(['GR', 'RT', '0', '150', '2000 log']));
    const off = makeCtx();
    paintTrackColumn(off, { tracks, geom, depth, yOf, i0: 0, i1: 100, headerH: 50, plotTop: 52, plotH: 400, headers: false });
    expect(texts(off)).toHaveLength(0);
    expect(off.calls.filter((c) => c[0] === 'strokeRect')).toHaveLength(2);
  });
  test('readouts sit at y 46 in the curve colour, NaN reads as a dash', () => {
    const ctx = makeCtx();
    paintReadouts(ctx, { tracks, geom, idx: 3 });
    const t = texts(ctx);
    expect(t[0].slice(1, 4)).toEqual(['GR 42.50', 106, 46]);
    expect(t[0][4].fillStyle).toBe('#059669');
    expect(t[1][1]).toBe('RT —');
  });
});

describe('paintDepthAxis: PT8 multiple depth columns', () => {
  const args = { plotTop: 52, plotH: 400, plotRight: 500, vTop: 2000, vBase: 2100, yOf };
  const moves = (ctx) => ctx.calls.filter((c) => c[0] === 'moveTo');

  test('only the first column draws the rules, and they start past the whole gutter', () => {
    const first = makeCtx();
    paintDepthAxis(first, { ...args, axisW: 56, gridLeft: 168, drawGrid: true, title: 'MD (m)' });
    // every rule starts at the plot edge, not at this column's own edge
    expect(moves(first).length).toBeGreaterThan(0);
    for (const m of moves(first)) expect(m[1]).toBe(168);

    const second = makeCtx();
    paintDepthAxis(second, { ...args, axisW: 112, gridLeft: 168, drawGrid: false, title: 'TVD (m)', titleX: 66 });
    expect(moves(second)).toHaveLength(0);
    expect(second.calls.filter((c) => c[0] === 'stroke')).toHaveLength(0);
  });

  test('each column right-aligns its labels in its own gutter', () => {
    const ctx = makeCtx();
    paintDepthAxis(ctx, { ...args, axisW: 112, gridLeft: 168, drawGrid: false, labelOf: (d) => d - 30, title: 'TVDSS (m)' });
    const nums = texts(ctx).filter((c) => c[1] !== 'TVDSS (m)');
    expect(nums.length).toBeGreaterThan(0);
    for (const n of nums) {
      expect(n[2]).toBe(112 - 4);              // x = this column's right edge
      expect(n[4].align).toBe('right');
    }
    // the labelOf shift is what makes this column a different reference
    expect(nums.map((n) => Number(n[1]))).toContain(2000 - 30);
  });

  test('a column whose reference cannot place a depth prints a dash, not a guess', () => {
    const ctx = makeCtx();
    paintDepthAxis(ctx, { ...args, axisW: 56, labelOf: () => NaN, title: 'TVD (m)' });
    const nums = texts(ctx).filter((c) => c[1] !== 'TVD (m)');
    expect(nums.length).toBeGreaterThan(0);
    for (const n of nums) expect(n[1]).toBe('—');
  });

  test('the default is unchanged: rules start at the single gutter and are drawn', () => {
    const ctx = makeCtx();
    paintDepthAxis(ctx, { ...args, axisW: 56, title: 'MD (m)' });
    for (const m of moves(ctx)) expect(m[1]).toBe(56);
  });
});

describe('paintDepthAxis', () => {
  test('gridlines land on round display units and labels use the unit factor', () => {
    const ctx = makeCtx();
    const F = 1 / 0.3048;
    paintDepthAxis(ctx, { axisW: 56, plotTop: 52, plotH: 400, plotRight: 500, vTop: 2000, vBase: 2100, yOf, F, title: 'MD (ft)' });
    const labels = texts(ctx).map((c) => c[1]);
    expect(labels).toContain('MD (ft)');
    const nums = labels.filter((l) => l !== 'MD (ft)').map(Number);
    expect(nums.every((n) => n % 50 === 0)).toBe(true); // 328 ft span -> 50 ft grid
    expect(nums[0]).toBeGreaterThanOrEqual(Math.ceil(2000 * F));
  });
  test('labelOf swaps the label value only', () => {
    const ctx = makeCtx();
    paintDepthAxis(ctx, { axisW: 56, plotTop: 52, plotH: 400, plotRight: 500, vTop: 2000, vBase: 2100, yOf, labelOf: (d) => d - 1000 });
    const nums = texts(ctx).map((c) => Number(c[1]));
    expect(Math.max(...nums)).toBeLessThanOrEqual(1100);
  });
});

describe('paintTopMarker', () => {
  test('dashed line across the plot and a tag at the right edge, grip only when draggable', () => {
    const ctx = makeCtx();
    const box = paintTopMarker(ctx, { name: 'Top Dome', color: '#d97706', y: 100, xLeft: 56, xRight: 500, grip: true });
    const tagW = Math.min(120, 6 * 8 + 18);
    expect(box).toEqual({ tagLeft: 500 - tagW - 2, tagW, top: 87, height: 12 });
    expect(ctx.calls.find((c) => c[0] === 'setLineDash')[1]).toEqual([5, 3]);
    expect(ctx.calls.filter((c) => c[0] === 'fillRect')).toHaveLength(4); // tag + 3 grip bars
    const label = texts(ctx)[0];
    expect(label[2]).toBe(box.tagLeft + 10);
    const plain = makeCtx();
    paintTopMarker(plain, { name: 'Top Dome', color: '#d97706', y: 100, xLeft: 56, xRight: 500 });
    expect(plain.calls.filter((c) => c[0] === 'fillRect')).toHaveLength(1);
    expect(texts(plain)[0][2]).toBe(box.tagLeft + 4);
  });
  test('long names are capped at tagMax', () => {
    const ctx = makeCtx();
    const box = paintTopMarker(ctx, { name: 'A very long formation top name', color: '#000', y: 10, xLeft: 0, xRight: 300, tagMax: 120 });
    expect(box.tagW).toBe(120);
  });
});
