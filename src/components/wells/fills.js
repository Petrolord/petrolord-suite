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

// ---- ramp fills (PT6, 2026-09-03) -----------------------------------------
// Colour by the curve's own value between stops (clean sand pale yellow to
// shale dark brown for GR), painted as horizontal strips between the
// curve and a track edge. Geometry in device coordinates like the
// polygons above; colours through src/utils/colorMaps.js interpolate.

import { interpolate } from '@/utils/colorMaps';

const hexToRgb = (hex) => {
  const h = String(hex || '').replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0').slice(0, 6);
  const n = parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/**
 * Colour function for a ramp: stops [{value, color}] (any order, >= 2
 * distinct values) -> (v) => 'rgb(r,g,b)' clamped at the ends. Memoised
 * on 64 levels so a redraw builds at most 64 strings.
 */
export function makeRamp(stops, levels = 64) {
  const sorted = (stops || [])
    .filter((st) => Number.isFinite(Number(st.value)) && st.color)
    .map((st) => ({ value: Number(st.value), color: st.color }))
    .sort((a, b) => a.value - b.value);
  if (sorted.length < 2 || !(sorted[sorted.length - 1].value > sorted[0].value)) return null;
  const lo = sorted[0].value;
  const hi = sorted[sorted.length - 1].value;
  const points = sorted.map((st) => [(st.value - lo) / (hi - lo), hexToRgb(st.color)]);
  const cache = new Array(levels + 1);
  const fn = (v) => {
    if (!Number.isFinite(v)) return null;
    const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
    const k = Math.round(t * levels);
    if (!cache[k]) {
      const [r, g, b] = interpolate(k / levels, points);
      cache[k] = `rgb(${r},${g},${b})`;
    }
    return cache[k];
  };
  fn.lo = lo;
  fn.hi = hi;
  fn.rgbAt = (v) => interpolate(Math.min(1, Math.max(0, (v - lo) / (hi - lo))), points);
  return fn;
}

/**
 * Strips to paint for a ramp fill: one per visible sample interval while
 * the samples are sparser than two per pixel row, otherwise one per pixel
 * row (value = mean of the finite samples in the row, xCurve = the row's
 * extreme x on the fill side), mirroring drawCurve's decimation so the
 * cost caps at O(plotH). NaN rows are skipped, never bridged.
 * @param {Float64Array} x   projected curve x per sample (NaN where absent)
 * @param {Float64Array} y   projected y per sample
 * @param {number} i0 first visible sample; @param {number} i1 last
 * @param {number} plotH plot height in px
 * @param {ArrayLike<number>} values curve values (for the colour)
 * @param {'left'|'right'|'track'} fillTo
 * @returns {Array<{y0:number, y1:number, xCurve:number, v:number}>}
 */
export function rampStrips(x, y, i0, i1, plotH, values, fillTo = 'left') {
  const out = [];
  const n = i1 - i0 + 1;
  if (n <= 0) return out;
  if (!(plotH > 0) || n <= 2 * plotH) {
    for (let i = i0; i < i1; i++) {
      const v = values[i];
      if (!Number.isFinite(v) || !Number.isFinite(x[i]) || !Number.isFinite(y[i]) || !Number.isFinite(y[i + 1])) continue;
      out.push({ y0: y[i], y1: y[i + 1], xCurve: x[i], v });
    }
    return out;
  }
  const rows = Math.max(1, Math.round(plotH));
  const yTop = y[i0];
  const yBot = y[i1];
  const span = (yBot - yTop) || 1;
  const sum = new Float64Array(rows);
  const cnt = new Uint32Array(rows);
  const xe = new Float64Array(rows).fill(NaN);
  for (let i = i0; i <= i1; i++) {
    const v = values[i];
    if (!Number.isFinite(v) || !Number.isFinite(x[i]) || !Number.isFinite(y[i])) continue;
    const r = Math.min(rows - 1, Math.max(0, Math.floor(((y[i] - yTop) / span) * rows)));
    sum[r] += v; cnt[r] += 1;
    if (Number.isNaN(xe[r])) xe[r] = x[i];
    else xe[r] = fillTo === 'right' ? Math.min(xe[r], x[i]) : Math.max(xe[r], x[i]);
  }
  const rowH = span / rows;
  for (let r = 0; r < rows; r++) {
    if (!cnt[r]) continue;
    out.push({ y0: yTop + r * rowH, y1: yTop + (r + 1) * rowH, xCurve: xe[r], v: sum[r] / cnt[r] });
  }
  return out;
}
