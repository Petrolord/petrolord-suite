// Section geometry (Earth Modeling EM3, 2026-09-06): a section line is
// a polyline of world vertices (drawn on the map, or the two wells of
// the old well-pair section); the framework is sampled along it by arc
// length, wells within a projection distance are placed at their
// nearest point on the line, and the vertical scale follows a vertical
// exaggeration against the horizontal scale. Pure, no I/O.

export const VE_OPTIONS = Object.freeze([1, 2, 5, 10]);

/** Cumulative arc lengths of a polyline; total is the last entry. */
export function arcLengths(vertices) {
  const s = [0];
  for (let i = 1; i < vertices.length; i++) {
    const [ax, ay] = vertices[i - 1]; const [bx, by] = vertices[i];
    s.push(s[i - 1] + Math.hypot(bx - ax, by - ay));
  }
  return s;
}

/** The world point at arc length `d` along the polyline. */
export function pointAt(vertices, s, d) {
  if (vertices.length === 1) return [vertices[0][0], vertices[0][1]];
  const total = s[s.length - 1];
  const t = Math.max(0, Math.min(total, d));
  let i = 1;
  while (i < s.length - 1 && s[i] < t) i += 1;
  const seg = s[i] - s[i - 1];
  const f = seg > 0 ? (t - s[i - 1]) / seg : 0;
  const [ax, ay] = vertices[i - 1]; const [bx, by] = vertices[i];
  return [ax + f * (bx - ax), ay + f * (by - ay)];
}

/**
 * `n` samples along the polyline by arc length.
 * @returns {{x:Float64Array, y:Float64Array, s:Float64Array, total:number}}
 */
export function pathSamples(vertices, n = 200) {
  if (!Array.isArray(vertices) || vertices.length < 2) throw new Error('A section needs at least two vertices.');
  const cum = arcLengths(vertices);
  const total = cum[cum.length - 1];
  if (!(total > 0)) throw new Error('The section line has no length.');
  const x = new Float64Array(n); const y = new Float64Array(n); const s = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const d = (i / (n - 1)) * total;
    const [px, py] = pointAt(vertices, cum, d);
    x[i] = px; y[i] = py; s[i] = d;
  }
  return { x, y, s, total };
}

/** Nearest point on the polyline to (x, y): arc length and offset. */
export function nearestOnPath(vertices, x, y) {
  const cum = arcLengths(vertices);
  let best = { s: 0, offset: Infinity };
  for (let i = 1; i < vertices.length; i++) {
    const [ax, ay] = vertices[i - 1]; const [bx, by] = vertices[i];
    const vx = bx - ax; const vy = by - ay;
    const len2 = vx * vx + vy * vy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / len2)) : 0;
    const px = ax + t * vx; const py = ay + t * vy;
    const off = Math.hypot(x - px, y - py);
    if (off < best.offset) best = { s: cum[i - 1] + t * Math.sqrt(len2), offset: off };
  }
  return best;
}

/**
 * Wells within `maxOffset` of the line, placed at their projection.
 * @returns {Array<{well, s:number, offset:number}>} sorted along the line
 */
export function projectWells(wells, vertices, maxOffset) {
  const out = [];
  for (const w of wells || []) {
    if (!Number.isFinite(w?.surface_x) || !Number.isFinite(w?.surface_y)) continue;
    const p = nearestOnPath(vertices, w.surface_x, w.surface_y);
    if (p.offset <= maxOffset) out.push({ well: w, s: p.s, offset: p.offset });
  }
  return out.sort((a, b) => a.s - b.s);
}

/**
 * Plot geometry for a vertical exaggeration: horizontal px per metre
 * from the plot width, vertical = ve times that; the plot height follows
 * the depth range (clamped between minH and maxH).
 */
export function sectionScale({ total, zMin, zMax, plotW, ve = 1, minH = 200, maxH = 2400 }) {
  const hScale = total > 0 ? plotW / total : 1;
  const vScale = ve * hScale;
  const range = Math.max(1, zMax - zMin);
  const plotH = Math.max(minH, Math.min(maxH, range * vScale));
  return { hScale, vScale: plotH / range, plotH, exaggeration: (plotH / range) / hScale };
}
