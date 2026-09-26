// Contour label placement (Mapping MS1, 2026-09-05): a pure port of the
// loop Seismolord's Map window paints with (components/MapView.jsx),
// so both maps label the same way. Labels ride the MAJOR levels, spaced
// in screen pixels along the polyline and kept upright.

/** A level is major when it is a whole multiple of `every` steps. */
export function isMajorLevel(level, step, every = 5) {
  if (!(step > 0)) return false;
  return Math.round(level / step) % every === 0;
}

/**
 * Label anchors along a screen-space polyline (flat [x0, y0, x1, y1, ...]):
 * the first `firstPx` in, then every `spacingPx`; `angle` is folded into
 * (-pi/2, pi/2] so the text reads upright.
 * @returns {Array<{x:number, y:number, angle:number}>}
 */
export function contourLabelPositions(pts, { firstPx = 90, spacingPx = 280, minPx = 40 } = {}) {
  const out = [];
  // Mapping T1 (MAP-T1-011): a line shorter than two first-label runs
  // still gets one label at its middle (above minPx), so short contours on
  // a well-bounded map are not left anonymous
  let total = 0;
  for (let i = 2; i < pts.length; i += 2) total += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
  if (total < minPx) return out;
  let acc = 0;
  let next = total < 2 * firstPx ? total / 2 : firstPx;
  for (let i = 2; i < pts.length; i += 2) {
    const ax = pts[i - 2];
    const ay = pts[i - 1];
    const bx = pts[i];
    const by = pts[i + 1];
    const d = Math.hypot(bx - ax, by - ay);
    while (d > 0 && acc + d >= next) {
      const f = (next - acc) / d;
      let angle = Math.atan2(by - ay, bx - ax);
      if (angle > Math.PI / 2) angle -= Math.PI;
      if (angle < -Math.PI / 2) angle += Math.PI;
      out.push({ x: ax + (bx - ax) * f, y: ay + (by - ay) * f, angle });
      next += spacingPx;
    }
    acc += d;
  }
  return out;
}
