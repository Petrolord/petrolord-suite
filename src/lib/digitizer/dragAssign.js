// Assign contour values by dragging across them (Mapping & Surface Studio
// upgrade U2-006, 2026-09-30; finding MAP-U1-027). The Didger and Surfer
// way: type a start value and an increment, drag a line across the
// contours, and each contour the line crosses takes the next value in the
// order it was crossed. Typing values line by line is the slow part of
// digitizing a paper map.
//
// Rules, each said back to the user:
// - a contour is valued at its FIRST crossing; a line crossed again later
//   (a closed contour dragged right through) keeps that value and is listed;
// - lines the drag does not cross are left as they are;
// - a value already typed is overwritten, and the count says so.
// Coordinates are image pixels, the frame the lines are stored in. Pure.

/** Intersection parameter t on a-b and u on c-d, or null. */
function segHit(a, b, c, d) {
  const rx = b[0] - a[0]; const ry = b[1] - a[1];
  const sx = d[0] - c[0]; const sy = d[1] - c[1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const qx = c[0] - a[0]; const qy = c[1] - a[1];
  const t = (qx * sy - qy * sx) / den;
  const u = (qx * ry - qy * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return t;
}

/**
 * Every crossing of the drag path with a polyline, as distances along the drag.
 * @param {Array<[number,number]>} path the drag
 * @param {Array<[number,number]>} line a contour
 * @returns {number[]} sorted arc lengths along the drag
 */
export function crossingsAlong(path, line) {
  const out = [];
  let s0 = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]; const b = path[i];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let k = 1; k < line.length; k++) {
      const t = segHit(a, b, line[k - 1], line[k]);
      if (t != null) out.push(s0 + t * len);
    }
    s0 += len;
  }
  return out.sort((x, y) => x - y);
}

/**
 * @param {Array<{id:string, points:Array<[number,number]>, value:?number}>} lines the contour layer
 * @param {Array<[number,number]>} path the drag, in pixels
 * @param {{start:number, increment:number}} o
 * @returns {{values: Map<string, number>, order: string[], crossedAgain: string[], overwritten: number}}
 */
export function assignValuesByDrag(lines, path, { start, increment }) {
  if (!Number.isFinite(start)) throw new Error('Type the value of the first contour the drag crosses.');
  if (!Number.isFinite(increment) || increment === 0) throw new Error('Type the contour increment (negative when the values fall along the drag).');
  if (!Array.isArray(path) || path.length < 2) throw new Error('Drag across the contours to assign their values.');
  const hits = [];
  for (const l of lines || []) {
    if (!Array.isArray(l.points) || l.points.length < 2) continue;
    const c = crossingsAlong(path, l.points);
    if (c.length) hits.push({ id: l.id, at: c[0], n: c.length, had: l.value });
  }
  if (!hits.length) throw new Error('The drag crossed no contour line. Drag across the lines you want to value.');
  hits.sort((a, b) => a.at - b.at);
  const values = new Map();
  hits.forEach((h, i) => values.set(h.id, start + i * increment));
  return {
    values,
    order: hits.map((h) => h.id),
    crossedAgain: hits.filter((h) => h.n > 1).map((h) => h.id),
    overwritten: hits.filter((h) => h.had != null && h.had !== values.get(h.id)).length,
  };
}

/** The read-back sentence. */
export function describeDragAssign(r, { start, increment }) {
  const n = r.order.length;
  const last = start + (n - 1) * increment;
  const parts = [`${n} contour${n === 1 ? '' : 's'} valued from ${start} to ${last} in steps of ${increment}, in the order the drag crossed them.`];
  if (r.overwritten) parts.push(`${r.overwritten} typed value${r.overwritten === 1 ? ' was' : 's were'} replaced.`);
  if (r.crossedAgain.length) parts.push(`${r.crossedAgain.length} line${r.crossedAgain.length === 1 ? ' was' : 's were'} crossed twice and keep${r.crossedAgain.length === 1 ? 's' : ''} the value of the first crossing: drag from the crest outwards on a closed contour.`);
  return parts.join(' ');
}
