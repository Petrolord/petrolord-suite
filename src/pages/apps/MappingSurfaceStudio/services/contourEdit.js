// Contour hand-editing (Mapping MS5, 2026-09-06). A geologist picks up
// a contour on the map, drags it to where the geology says it belongs,
// and the moved line becomes guide points at that level; the surface is
// then re-gridded through them (the Petrel "edit contours, re-grid with
// them as guide lines" workflow). Pure geometry on the painter's
// contour paths, no I/O.

/** Squared distance from (x, y) to segment ab, and the parameter t. */
function segDist2(ax, ay, bx, by, x, y) {
  const vx = bx - ax; const vy = by - ay;
  const wx = x - ax; const wy = y - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2)) : 0;
  const px = ax + t * vx; const py = ay + t * vy;
  return (x - px) ** 2 + (y - py) ** 2;
}

/** Distance from a world point to a flat [x0, y0, x1, y1, ...] polyline. */
export function distanceToPath(path, x, y) {
  if (!path || path.length < 2) return Infinity;
  if (path.length < 4) return Math.hypot(path[0] - x, path[1] - y);
  let best = Infinity;
  for (let i = 2; i < path.length; i += 2) {
    const d2 = segDist2(path[i - 2], path[i - 1], path[i], path[i + 1], x, y);
    if (d2 < best) best = d2;
  }
  return Math.sqrt(best);
}

/**
 * The contour nearest a world point, within `tolerance` (world units).
 * @param {{levels:number[], paths:Float64Array[][]}} contours contourPaths output
 * @returns {{level:number, levelIndex:number, pathIndex:number, path:Float64Array, dist:number}|null}
 */
export function nearestContour(contours, x, y, tolerance = Infinity) {
  if (!contours?.levels?.length) return null;
  let best = null;
  contours.levels.forEach((level, li) => {
    (contours.paths[li] || []).forEach((path, pi) => {
      const d = distanceToPath(path, x, y);
      if (d <= tolerance && (!best || d < best.dist)) best = { level, levelIndex: li, pathIndex: pi, path, dist: d };
    });
  });
  return best;
}

/** A copy of the path shifted by (dx, dy). */
export function translatePath(path, dx, dy) {
  const out = new Float64Array(path.length);
  for (let i = 0; i < path.length; i += 2) { out[i] = path[i] + dx; out[i + 1] = path[i + 1] + dy; }
  return out;
}

/**
 * Guide points along a path at one value, resampled by arc length every
 * `spacing` world units (both ends kept, a closed ring's duplicate end
 * dropped). Labels `${prefix}.1`, `${prefix}.2`, ...
 * @returns {{x:number,y:number,z:number,label:string}[]}
 */
export function guidesFromPath(path, z, spacing, prefix = 'C1') {
  if (!path || path.length < 4) throw new Error('The contour is too short to make guide points.');
  if (!(spacing > 0)) throw new Error('Guide spacing must be positive.');
  const pts = [];
  const push = (x, y) => {
    const last = pts[pts.length - 1];
    if (last && Math.hypot(last.x - x, last.y - y) < spacing * 0.25) return;
    pts.push({ x, y });
  };
  push(path[0], path[1]);
  let carry = spacing;
  for (let i = 2; i < path.length; i += 2) {
    const ax = path[i - 2]; const ay = path[i - 1]; const bx = path[i]; const by = path[i + 1];
    const seg = Math.hypot(bx - ax, by - ay);
    if (seg === 0) continue;
    let s = carry;
    while (s <= seg) {
      const f = s / seg;
      push(ax + (bx - ax) * f, ay + (by - ay) * f);
      s += spacing;
    }
    carry = s - seg;
  }
  push(path[path.length - 2], path[path.length - 1]);
  const first = pts[0]; const last = pts[pts.length - 1];
  if (pts.length > 2 && Math.hypot(first.x - last.x, first.y - last.y) < spacing * 0.25) pts.pop();
  return pts.map((p, k) => ({ x: p.x, y: p.y, z, label: `${prefix}.${k + 1}` }));
}

/**
 * The whole edit: pick the contour nearest `from`, shift it by the drag
 * vector to `to`, and turn it into guide points at its level.
 * @param {{levels, paths}} contours
 * @param {{x,y}} from where the drag started
 * @param {{x,y}} to where it ended
 * @param {{tolerance:number, spacing:number, prefix?:string}} opts
 * @returns {{level:number, path:Float64Array, moved:Float64Array, guides:Array, shift:{dx,dy}}}
 */
export function contourEditPlan(contours, from, to, { tolerance, spacing, prefix = 'C1' }) {
  const hit = nearestContour(contours, from.x, from.y, tolerance);
  if (!hit) throw new Error('No contour within reach of that point. Start the drag on a contour line.');
  const dx = to.x - from.x; const dy = to.y - from.y;
  const moved = translatePath(hit.path, dx, dy);
  const guides = guidesFromPath(moved, hit.level, spacing, prefix);
  return { level: hit.level, path: hit.path, moved, guides, shift: { dx, dy } };
}
