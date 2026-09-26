// How far a map reaches (Mapping T1 MAP-T1-007, 2026-09-26). By default a
// map stops at the convex hull of its control points; in exploration and
// appraisal the flanks and the spill lie beyond the outermost wells, so
// the user may extend the map a stated distance past that hull. Nodes
// inside the hull always stay; outside it, only nodes within the distance
// of the hull are kept. The hull ring is returned so the map can draw it
// and a reader can tell measured area from extrapolated area. Pure.

import { convexHull } from '@/lib/gridding/gridding';
import { isNull, gridXY } from '@/lib/gridding/gridmath';
import { NULL_VALUE } from '@/lib/gridding/numeric';

export const EXTENT_MODES = Object.freeze([
  { key: 'hull', label: 'Map inside the wells' },
  { key: 'beyond', label: 'Map beyond the wells by' },
]);

/** Distance from (x, y) to the segment a-b. */
function segDist(x, y, a, b) {
  const vx = b.x - a.x; const vy = b.y - a.y;
  const L2 = vx * vx + vy * vy;
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / L2)) : 0;
  return Math.hypot(x - (a.x + t * vx), y - (a.y + t * vy));
}

/** Inside a CCW convex ring. */
function insideRing(ring, x, y) {
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]; const b = ring[(i + 1) % ring.length];
    if ((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) < 0) return false;
  }
  return true;
}

/** Distance from a point to a convex ring (0 inside). */
export function distanceToHull(ring, x, y) {
  if (ring.length >= 3 && insideRing(ring, x, y)) return 0;
  let d = Infinity;
  for (let i = 0; i < ring.length; i++) d = Math.min(d, segDist(x, y, ring[i], ring[(i + 1) % ring.length]));
  return d;
}

/** The convex hull of the control points as a CCW ring of {x, y}. */
export function hullRing(points) {
  return convexHull(points.map((p) => ({ x: p.x, y: p.y })));
}

/**
 * Null every node farther than `beyond` outside the hull of `points`.
 * @returns {{z: Float32Array, extrapolatedNodes: number, ring: Array<{x,y}>}}
 */
export function extentMask(z, spec, points, beyond) {
  if (!(beyond > 0) || !Number.isFinite(beyond)) throw new Error('Type how far past the wells to map, in metres.');
  const ring = hullRing(points);
  const out = new Float32Array(z.length);
  let extrapolatedNodes = 0;
  for (let r = 0; r < spec.ny; r++) {
    for (let c = 0; c < spec.nx; c++) {
      const i = r * spec.nx + c;
      if (isNull(z[i])) { out[i] = NULL_VALUE; continue; }
      const w = gridXY(spec, r, c);
      const d = distanceToHull(ring, w.x, w.y);
      if (d > beyond) { out[i] = NULL_VALUE; continue; }
      if (d > 0) extrapolatedNodes += 1;
      out[i] = z[i];
    }
  }
  return { z: out, extrapolatedNodes, ring };
}
