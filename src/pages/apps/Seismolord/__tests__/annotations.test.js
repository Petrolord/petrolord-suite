import {
  niceStepDown, niceStepUp, fmtTick, axisTicks, scaleBarSpec,
  surveySpacing, northScreenDir, northLocalDir,
} from '../viewer/annotations';

describe('nice steps', () => {
  test('niceStepUp snaps to 1/2/5 decades', () => {
    expect(niceStepUp(0.3)).toBeCloseTo(0.5);
    expect(niceStepUp(1)).toBe(1);
    expect(niceStepUp(1.1)).toBe(2);
    expect(niceStepUp(3)).toBe(5);
    expect(niceStepUp(7)).toBe(10);
    expect(niceStepUp(230)).toBe(500);
  });

  test('niceStepDown snaps to 1/2/5 decades', () => {
    expect(niceStepDown(0.3)).toBeCloseTo(0.2);
    expect(niceStepDown(7)).toBe(5);
    expect(niceStepDown(230)).toBe(200);
    expect(niceStepDown(1999)).toBe(1000);
  });

  test('fmtTick uses integers for integer steps, decimals otherwise', () => {
    expect(fmtTick(1200, 100)).toBe('1200');
    expect(fmtTick(0.25, 0.05)).toBe('0.25');
  });
});

describe('axisTicks', () => {
  // crossline axis: 400 cells, XL numbers 1000..1798 step 2
  const base = {
    world0: 0, world1: 400, worldMax: 400, pxPerCell: 2,
    valueAtZero: 1000, valuePerCell: 2, targetPx: 90,
  };

  test('ticks land on nice values inside the data and label the value', () => {
    const ticks = axisTicks(base);
    expect(ticks.length).toBeGreaterThan(4);
    for (const t of ticks) {
      expect(t.value % 100).toBe(0);                    // nice step (100)
      expect(t.world).toBeGreaterThanOrEqual(0.5);
      expect(t.world).toBeLessThanOrEqual(399.5);
      expect(t.label).toBe(String(t.value));
      // cell centre of the index carrying that value
      expect(t.world).toBeCloseTo((t.value - 1000) / 2 + 0.5);
    }
  });

  test('zooming in yields a finer step, similar screen spacing', () => {
    const coarse = axisTicks(base);
    const fine = axisTicks({ ...base, world0: 100, world1: 140, pxPerCell: 20 });
    const stepOf = (ts) => ts[1].value - ts[0].value;
    expect(stepOf(fine)).toBeLessThan(stepOf(coarse));
    const spacingPx = (fine[1].world - fine[0].world) * 20;
    expect(spacingPx).toBeGreaterThanOrEqual(45);
    expect(spacingPx).toBeLessThanOrEqual(200);
  });

  test('time axis in ms (fractional per-cell value)', () => {
    // 1500 samples at 4 ms
    const ticks = axisTicks({
      world0: 0, world1: 1500, worldMax: 1500, pxPerCell: 0.4,
      valueAtZero: 0, valuePerCell: 4, targetPx: 60,
    });
    expect(ticks[0].value % 500).toBe(0);               // 60px/0.4 * 4 = 600 -> 1000? no: raw 600 -> nice 1000
    expect(ticks.every((t) => t.value >= 0 && t.value <= 5996)).toBe(true);
  });

  test('view clamped to data even when the visible rect overshoots', () => {
    const ticks = axisTicks({ ...base, world0: -200, world1: 800 });
    for (const t of ticks) {
      expect(t.world).toBeGreaterThanOrEqual(0);
      expect(t.world).toBeLessThanOrEqual(400);
    }
  });

  test('degenerate input returns no ticks', () => {
    expect(axisTicks({ ...base, pxPerCell: 0 })).toEqual([]);
    expect(axisTicks({ ...base, valuePerCell: 0 })).toEqual([]);
    expect(axisTicks({ ...base, world0: 500, world1: 600 })).toEqual([]);
  });
});

describe('scaleBarSpec', () => {
  test('longest nice distance that fits', () => {
    // 1.337 m/px, 180 px budget -> 240.6 m raw -> 200 m -> 149.6 px
    const s = scaleBarSpec(1.337, 180);
    expect(s.meters).toBe(200);
    expect(s.px).toBeCloseTo(149.6, 1);
    expect(s.label).toBe('200 m');
  });

  test('kilometre labels', () => {
    const s = scaleBarSpec(30, 180); // 5400 m raw -> 5000 m
    expect(s.meters).toBe(5000);
    expect(s.label).toBe('5 km');
  });

  test('invalid spacing yields null', () => {
    expect(scaleBarSpec(0, 180)).toBeNull();
    expect(scaleBarSpec(NaN, 180)).toBeNull();
  });
});

describe('surveySpacing / northScreenDir', () => {
  const manifest = (first, last, nIl = 101, nXl = 201) => ({
    geometry: {
      il: { count: nIl }, xl: { count: nXl },
      corners: { first, last },
    },
  });

  test('spacing from the corner diagonal (axis-aligned assumption)', () => {
    const m = manifest({ x: 100000, y: 5000000 }, { x: 105000, y: 5002500 });
    const s = surveySpacing(m);
    expect(s.xlSpacing).toBeCloseTo(25);    // 5000 m over 200 xl steps
    expect(s.ilSpacing).toBeCloseTo(25);    // 2500 m over 100 il steps
  });

  test('north points down-screen when world y grows with inline index', () => {
    const m = manifest({ x: 0, y: 0 }, { x: 5000, y: 2500 });
    expect(northScreenDir(m)).toEqual({ x: 0, y: 1 });
  });

  test('north points up-screen when world y shrinks with inline index', () => {
    const m = manifest({ x: 0, y: 2500 }, { x: 5000, y: 0 });
    expect(northScreenDir(m)).toEqual({ x: 0, y: -1 });
  });

  test('missing or degenerate corners yield null (hide, never guess)', () => {
    expect(surveySpacing({ geometry: {} })).toBeNull();
    expect(surveySpacing(manifest({ x: 0, y: 0 }, { x: 0, y: 0 }))).toBeNull();
    expect(northScreenDir(manifest({ x: 0, y: 7 }, { x: 5000, y: 7 }))).toBeNull();
  });

  test('measured affine wins: rotated survey reports true bins + bearing', () => {
    // 30 deg rotation, xl bin 25 m / il bin 37.5 m (the dome_rot layout);
    // the corner diagonal would report nonsense — the affine must win
    const cos = Math.cos(Math.PI / 6);
    const sin = Math.sin(Math.PI / 6);
    const m = {
      geometry: {
        il: { count: 16 }, xl: { count: 16 },
        corners: { first: { x: 500000, y: 6700000 }, last: { x: 500043.51, y: 6700674.64 } },
        affine: {
          origin: { x: 500000, y: 6700000 },
          il_vec: { x: -37.5 * sin, y: 37.5 * cos },
          xl_vec: { x: 25 * cos, y: 25 * sin },
        },
      },
    };
    const s = surveySpacing(m);
    expect(s.xlSpacing).toBeCloseTo(25, 6);
    expect(s.ilSpacing).toBeCloseTo(37.5, 6);
    // world north in the local frame: (sin 30, cos 30) over xl/il axes
    const n = northLocalDir(m);
    expect(n.xl).toBeCloseTo(sin, 6);
    expect(n.il).toBeCloseTo(cos, 6);
    const sc = northScreenDir(m);
    expect(sc.x).toBeCloseTo(sin, 6);
    expect(sc.y).toBeCloseTo(cos, 6);
  });
});
