import { contourLabelPositions, isMajorLevel } from '../contourLabels';

test('a straight 1000 px polyline labels at 90, 370, 650, 930', () => {
  const pts = [0, 0, 1000, 0];
  expect(contourLabelPositions(pts).map((p) => Math.round(p.x))).toEqual([90, 370, 650, 930]);
  expect(contourLabelPositions(pts).every((p) => p.angle === 0)).toBe(true);
});

test('angles are folded upright', () => {
  const left = contourLabelPositions([1000, 0, 0, 0]); // running right-to-left
  expect(left[0].angle).toBe(0);
  const down = contourLabelPositions([0, 0, 0, 1000]);
  expect(down[0].angle).toBeCloseTo(Math.PI / 2, 9);
  const up = contourLabelPositions([0, 1000, 0, 0]);
  expect(Math.abs(up[0].angle)).toBeCloseTo(Math.PI / 2, 9);
});

test('a polyline shorter than firstPx gets no label; spacing options apply', () => {
  expect(contourLabelPositions([0, 0, 50, 0])).toEqual([]);
  expect(contourLabelPositions([0, 0, 100, 0], { firstPx: 20, spacingPx: 30 }).map((p) => p.x)).toEqual([20, 50, 80]);
});

test('parity with the Seismolord MapView inline loop on a bent polyline', () => {
  const pts = [0, 0, 300, 400, 300, 900, 800, 900];
  // the reference loop, as MapView.jsx draws it (dpr 1)
  const ref = [];
  let acc = 0;
  let next = 90;
  for (let i = 2; i < pts.length; i += 2) {
    const a = { x: pts[i - 2], y: pts[i - 1] };
    const b = { x: pts[i], y: pts[i + 1] };
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    while (d > 0 && acc + d >= next) {
      const f = (next - acc) / d;
      let ang = Math.atan2(b.y - a.y, b.x - a.x);
      if (ang > Math.PI / 2) ang -= Math.PI;
      if (ang < -Math.PI / 2) ang += Math.PI;
      ref.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, angle: ang });
      next += 280;
    }
    acc += d;
  }
  expect(contourLabelPositions(pts)).toEqual(ref);
  expect(ref.length).toBe(6); // 1500 px of path: 90 + 5 x 280
});

test('isMajorLevel is every 5th step', () => {
  expect(isMajorLevel(1500, 10)).toBe(true);
  expect(isMajorLevel(1510, 10)).toBe(false);
  expect(isMajorLevel(-1550, 10)).toBe(true);
  expect(isMajorLevel(1500, 0)).toBe(false);
  expect(isMajorLevel(30, 10, 3)).toBe(true);
});
