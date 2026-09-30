// A section line across the surfaces (Mapping & Surface Studio upgrade
// U2-013, 2026-09-30): draw a line on the map, and every depth surface
// is sampled along it (bilinear, rotation honoured) with the wells near
// the line posted at their distance along it. Quick structural QC
// without leaving Mapping; Well Correlation remains the place for a
// correlation panel. Distances are METRES along the line whatever the
// frame's XY unit. Pure.

import { sampleAtXY, isNull } from '@/lib/gridding/gridmath';

/** Cumulative length of a polyline in map units. */
function lengths(line) {
  const out = [0];
  for (let i = 1; i < line.length; i++) out.push(out[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
  return out;
}

/** The point at arc length s (map units) along the polyline. */
function pointAt(line, cum, s) {
  let k = 1;
  while (k < line.length - 1 && cum[k] < s) k += 1;
  const seg = cum[k] - cum[k - 1] || 1;
  const t = Math.max(0, Math.min(1, (s - cum[k - 1]) / seg));
  return [line[k - 1][0] + t * (line[k][0] - line[k - 1][0]), line[k - 1][1] + t * (line[k][1] - line[k - 1][1])];
}

/** Distance along the polyline of the nearest point to (x, y), and the offset from it (map units). */
export function projectOnLine(line, x, y) {
  const cum = lengths(line);
  let best = { along: 0, offset: Infinity };
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = line[i - 1]; const [bx, by] = line[i];
    const vx = bx - ax; const vy = by - ay;
    const L2 = vx * vx + vy * vy;
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / L2)) : 0;
    const d = Math.hypot(x - (ax + t * vx), y - (ay + t * vy));
    if (d < best.offset) best = { along: cum[i - 1] + t * Math.sqrt(L2), offset: d };
  }
  return best;
}

/**
 * @param {Object} p
 * @param {Array<[number,number]>} p.line two or more vertices in the map frame
 * @param {Array<{name:string, spec:object, grid:ArrayLike<number>}>} p.surfaces elevation grids in metres, on the map frame
 * @param {Array<{name:string, x:number, y:number}>} [p.wells]
 * @param {number} [p.xyToM] metres per map unit
 * @param {number} [p.samples] points along the line
 * @param {number} [p.bufferM] wells within this distance of the line are posted
 * @returns {{lengthM:number, rows:Array<Object>, series:Array<{key:string, name:string, live:number}>,
 *   wells:Array<{name:string, alongM:number, offsetM:number}>}}
 */
export function sectionProfile({ line, surfaces, wells = [], xyToM = 1, samples = 200, bufferM = 500 }) {
  if (!Array.isArray(line) || line.length < 2) throw new Error('Click two or more points on the map to draw the section line.');
  if (!(xyToM > 0) || !Number.isFinite(xyToM)) throw new Error('A section needs a projected frame (metres per map unit).');
  const cum = lengths(line);
  const total = cum[cum.length - 1];
  if (!(total > 0)) throw new Error('The section line has no length: click two different points.');
  const n = Math.max(2, Math.min(2000, Math.floor(samples)));
  const series = surfaces.map((s, i) => ({ key: `s${i}`, name: s.name, live: 0 }));
  const rows = [];
  for (let k = 0; k < n; k++) {
    const s = (total * k) / (n - 1);
    const [x, y] = pointAt(line, cum, s);
    const row = { distM: s * xyToM };
    surfaces.forEach((sf, i) => {
      const v = sampleAtXY(sf.grid, sf.spec, x, y);
      row[`s${i}`] = isNull(v) ? null : v;
      if (!isNull(v)) series[i].live += 1;
    });
    rows.push(row);
  }
  const posted = [];
  for (const w of wells) {
    if (!Number.isFinite(w.x) || !Number.isFinite(w.y)) continue;
    const p = projectOnLine(line, w.x, w.y);
    if (p.offset * xyToM <= bufferM) posted.push({ name: w.name, alongM: p.along * xyToM, offsetM: p.offset * xyToM });
  }
  return { lengthM: total * xyToM, rows, series, wells: posted.sort((a, b) => a.alongM - b.alongM) };
}

/** Vertical exaggeration of a chart box: horizontal metres per pixel over vertical metres per pixel. */
export function verticalExaggeration({ lengthM, zRangeM, widthPx, heightPx }) {
  if (!(lengthM > 0) || !(zRangeM > 0) || !(widthPx > 0) || !(heightPx > 0)) return null;
  return (lengthM / widthPx) / (zRangeM / heightPx);
}
