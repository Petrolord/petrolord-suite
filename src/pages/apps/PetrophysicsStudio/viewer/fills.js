// Track fill geometry (Petrophysics Studio PS1). Pure device-space
// polygon builders for the TrackViewer canvas: two-color crossover
// fills (density-neutron gas effect) and one-sided threshold fills
// (Vsh shading against the clean line, pay/porosity cutoff shading).
//
// Everything works on ALREADY-PROJECTED per-sample coordinates (x from
// the curve's own value scale, y from the depth scale), so one
// algorithm serves linear, log and reversed axes alike. NaN in either
// input lifts the pen: gaps are never bridged.

/**
 * Split the region between two projected curves into sign-consistent
 * polygons. "pos" collects spans where xA > xB (curve A plots right of
 * curve B), "neg" where xA < xB; crossings are split at the linearly
 * interpolated intersection so each polygon is single-colored.
 *
 * @param {ArrayLike<number>} xA projected x of curve A per sample
 * @param {ArrayLike<number>} xB projected x of curve B per sample
 * @param {ArrayLike<number>} y  projected y per sample
 * @param {number} [i0] first sample index (inclusive)
 * @param {number} [i1] last sample index (inclusive)
 * @returns {{pos: Array<Array<[number, number]>>, neg: Array<Array<[number, number]>>}}
 *   device-space polygons ready for ctx.fill()
 */
export function crossoverPolys(xA, xB, y, i0 = 0, i1 = xA.length - 1) {
  const pos = [];
  const neg = [];
  let run = null; // {sign, A: [[x,y]...], B: [[x,y]...]}

  const close = () => {
    if (run && run.sign !== 0 && run.A.length >= 2) {
      (run.sign > 0 ? pos : neg).push(run.A.concat(run.B.reverse()));
    }
    run = null;
  };

  let prev = null; // {a, b, y, d}
  for (let i = i0; i <= i1; i++) {
    const a = xA[i];
    const b = xB[i];
    const yy = y[i];
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(yy)) {
      close();
      prev = null;
      continue;
    }
    const d = a - b;
    const s = Math.sign(d);
    if (run && prev && s !== 0 && run.sign !== 0 && s !== run.sign) {
      const t = prev.d / (prev.d - d); // in (0, 1]: prev.d and d differ in sign
      const cx = prev.a + t * (a - prev.a);
      const cy = prev.y + t * (yy - prev.y);
      run.A.push([cx, cy]);
      run.B.push([cx, cy]);
      close();
      run = { sign: s, A: [[cx, cy]], B: [[cx, cy]] };
    }
    if (!run) run = { sign: s, A: [], B: [] };
    if (run.sign === 0 && s !== 0) run.sign = s; // equal-start runs adopt the first real side
    run.A.push([a, yy]);
    run.B.push([b, yy]);
    prev = { a, b, y: yy, d };
  }
  close();
  return { pos, neg };
}

/**
 * One-sided threshold fill: the region between a projected curve and a
 * constant projected threshold, kept only on the requested side.
 * side 'above' keeps spans where the curve value plots RIGHT of the
 * threshold on an ascending axis — pass the projected threshold from
 * the same scale as the curve and the meaning holds on reversed and
 * log axes too.
 *
 * @param {ArrayLike<number>} x projected curve x per sample
 * @param {number} xThr projected threshold x
 * @param {ArrayLike<number>} y projected y per sample
 * @param {'above'|'below'} side which side of the threshold to keep
 * @returns {Array<Array<[number, number]>>} device-space polygons
 */
export function thresholdPolys(x, xThr, y, side, i0 = 0, i1 = x.length - 1) {
  if (!Number.isFinite(xThr)) return [];
  const thr = new Float64Array(i1 + 1).fill(xThr);
  const { pos, neg } = crossoverPolys(x, thr, y, i0, i1);
  return side === 'above' ? pos : neg;
}

/** Paint a polygon list onto a 2D context in one fill style. */
export function fillPolys(ctx, polys, fillStyle) {
  if (!polys.length) return;
  ctx.fillStyle = fillStyle;
  ctx.beginPath();
  for (const poly of polys) {
    ctx.moveTo(poly[0][0], poly[0][1]);
    for (let k = 1; k < poly.length; k++) ctx.lineTo(poly[k][0], poly[k][1]);
    ctx.closePath();
  }
  ctx.fill();
}
