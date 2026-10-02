// Strip log geometry (upgrades U2-001 and U2-006): depth runs DOWN the
// page, every track shares the one depth scale, and curve tracks carry a
// linear or a logarithmic value scale. Pure, so jest can check where a
// point lands without a browser.

/** Depth to y: top of the window at 0, base at height. */
export function depthScale(topM, baseM, heightPx) {
  const span = baseM - topM;
  if (!(span > 0)) throw new Error('The depth window needs a base below its top.');
  return { topM, baseM, heightPx, y: (mdM) => ((mdM - topM) / span) * heightPx, pxPerM: heightPx / span };
}

/** Pixels per metre for a paper scale 1:N on a 96 dpi screen (1 m at 1:500 is 2 mm). */
export const pxPerMetreAtScale = (n) => (1000 / n) * (96 / 25.4);

/** A value scale across a track: linear, or log10 (values at or below zero have no place). */
export function valueScale({ min, max, log = false }, widthPx) {
  if (log) {
    const lo = Math.log10(min); const hi = Math.log10(max);
    return { min, max, log: true, widthPx, x: (v) => (v > 0 ? ((Math.log10(v) - lo) / (hi - lo)) * widthPx : NaN) };
  }
  return { min, max, log: false, widthPx, x: (v) => ((v - min) / (max - min)) * widthPx };
}

/** A sensible linear range: zero to the next "nice" number above the data. */
export function niceMax(v) {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

/** Whole decades covering positive data. */
export function logRange(values) {
  const pos = values.filter((v) => v > 0);
  if (!pos.length) return { min: 0.1, max: 10 };
  const lo = 10 ** Math.floor(Math.log10(Math.min(...pos)));
  let hi = 10 ** Math.ceil(Math.log10(Math.max(...pos)));
  if (hi <= lo) hi = lo * 10;
  return { min: lo, max: hi };
}

/** Depth ticks at a round interval giving about one label every 60 px. */
export function depthTicks(topDisp, baseDisp, heightPx) {
  const span = baseDisp - topDisp;
  const target = span / Math.max(2, heightPx / 60);
  const p = 10 ** Math.floor(Math.log10(target));
  const step = [1, 2, 5, 10].map((m) => m * p).find((s) => s >= target) || 10 * p;
  const out = [];
  for (let v = Math.ceil(topDisp / step) * step; v <= baseDisp + 1e-9; v += step) out.push(Number(v.toFixed(6)));
  return { step, ticks: out };
}

/** An SVG polyline path for points in depth order; gaps (non-finite values or a jump of more than gapM) break the line. */
export function curvePath(points, ds, vs, { gapM = Infinity } = {}) {
  let d = ''; let pen = false; let last = null;
  for (const p of points) {
    const x = vs.x(p.v); const y = ds.y(p.mdM);
    if (!Number.isFinite(x) || !Number.isFinite(y) || p.mdM < ds.topM || p.mdM > ds.baseM) { pen = false; continue; }
    const cx = Math.max(0, Math.min(vs.widthPx, x));
    if (pen && last != null && p.mdM - last > gapM) pen = false;
    d += `${pen ? 'L' : 'M'}${cx.toFixed(1)},${y.toFixed(1)}`;
    pen = true; last = p.mdM;
  }
  return d;
}
