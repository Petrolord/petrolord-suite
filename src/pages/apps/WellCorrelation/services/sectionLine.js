// Section line and corridor (AppUpgrade WC-U2-012): the Petra way to build a
// regional section. The user draws a polyline on the map and gives a corridor
// half-width; the wells whose borehole comes within the corridor are taken in
// order of their distance along the line. A deviated well is projected at its
// wellhead and at its bottom hole (the survey), so a well drilled towards the
// line from outside it is found, and its position along the line is the mean
// of the two. Distances are metres in the wells' own frame; wells in another
// coordinate system, geographic or unlocated wells are left out and named.
// Pure.

import { unitToMetres } from '../../../../../packages/engines/lib/crs/catalog';

const metresPer = (u) => { try { return unitToMetres(u || 'm'); } catch { return NaN; } };
const num = (v) => (v == null || v === '' ? NaN : Number(v));

/** Closest point of a polyline to p: distance along the line and off it (same units as the input). */
export function projectOntoLine(p, line) {
  let best = null; let run = 0;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i]; const b = line[i + 1];
    const vx = b.x - a.x; const vy = b.y - a.y;
    const L2 = vx * vx + vy * vy;
    const L = Math.sqrt(L2);
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / L2)) : 0;
    const qx = a.x + t * vx; const qy = a.y + t * vy;
    const off = Math.hypot(p.x - qx, p.y - qy);
    if (!best || off < best.offset - 1e-9) best = { along: run + t * L, offset: off, segment: i };
    run += L;
  }
  return best;
}

/** Total length of a polyline. */
export const lineLength = (line) => line.reduce((s, p, i) => (i ? s + Math.hypot(p.x - line[i - 1].x, p.y - line[i - 1].y) : 0), 0);

/**
 * Wells in a corridor along a line drawn in the wells' frame.
 * @param {Object[]} wells registry wells with surface_x/y, crs, xy_unit, frame? (makeDepthFrame) and td_md_m
 * @param {Array<{x, y}>} line in the frame's units
 * @param {{halfWidthM: number, crs?: ?string, unit?: string}} opts the frame the line was drawn in
 * @returns {{picked: Array<{id, name, alongM, offsetM, deviated: boolean}>, left: Array<{name, reason}>, lengthM: number}}
 */
export function wellsInCorridor(wells, line, { halfWidthM = 500, crs = null, unit = 'm' } = {}) {
  const m = metresPer(unit);
  const picked = []; const left = [];
  if (!line || line.length < 2 || !Number.isFinite(m)) return { picked, left, lengthM: 0 };
  const L = line.map((p) => ({ x: p.x * m, y: p.y * m }));
  for (const w of wells) {
    const x = num(w.surface_x); const y = num(w.surface_y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) { left.push({ name: w.name, reason: 'no surface location' }); continue; }
    if (crs && w.crs && String(w.crs).toUpperCase() !== String(crs).toUpperCase()) { left.push({ name: w.name, reason: `in ${w.crs}` }); continue; }
    const wm = metresPer(w.xy_unit);
    if (!Number.isFinite(wm)) { left.push({ name: w.name, reason: 'geographic coordinates' }); continue; }
    const head = { x: x * wm, y: y * wm };
    const pts = [head];
    let deviated = false;
    if (w.frame && !w.frame.isVertical) {
      const td = Number(w.td_md_m) || w.frame.mdRange?.[1];
      try { const off = w.frame.mdToPosition(td); pts.push({ x: head.x + off.x, y: head.y + off.y }); deviated = Math.hypot(off.x, off.y) > 1; } catch { /* no bottom hole */ }
    }
    const pr = pts.map((pt) => projectOntoLine(pt, L));
    const inside = pr.filter((q) => q.offset <= halfWidthM);
    if (!inside.length) continue; // outside the corridor: not a problem, just not on this section
    picked.push({ id: w.id, name: w.name, alongM: pr.reduce((s, q) => s + q.along, 0) / pr.length, offsetM: Math.min(...pr.map((q) => q.offset)), deviated });
  }
  picked.sort((a, b) => a.alongM - b.alongM);
  return { picked, left, lengthM: lineLength(L) };
}
