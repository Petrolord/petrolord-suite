// Fault stick editing operations (group 5 interpretation toolbox).
//
// A fault draft is an array of sticks; a stick is an array of points
// {il, xl, s} (lattice indices, s a sub-sample float, time down). Every
// operation here is PURE: it returns a new sticks array (untouched sticks
// are shared, edited ones copied) and never mutates its input, so the
// caller can keep the previous array for undo.
//
// Distances are measured in the section a pick came from: along-line
// traces (weighted, one trace ~ LAT_WEIGHT samples) and samples. Points
// that are not drawn on that section (more than one line away, the
// SliceView "near" rule) are never hit.

export const LAT_WEIGHT = 4;

/**
 * @typedef {{il: number, xl: number, s: number}} StickPoint
 * @typedef {StickPoint[]} Stick
 * @typedef {{ilIdx: number, xlIdx: number, sample: number}} Pick
 * @typedef {'inline'|'xline'|null} SectionAxis
 */

/** Along-line coordinate and off-line distance of a point on a section. */
function onSection(p, pick, axis) {
  if (axis === 'inline') return { u: p.xl, pu: pick.xlIdx, off: Math.abs(p.il - pick.ilIdx) };
  if (axis === 'xline') return { u: p.il, pu: pick.ilIdx, off: Math.abs(p.xl - pick.xlIdx) };
  // no axis: lateral distance in both index directions
  return {
    u: p.il + p.xl, pu: pick.ilIdx + pick.xlIdx, off: 0,
  };
}

/** Weighted distance from a point to a pick; Infinity when off-section. */
export function pointDistance(p, pick, axis = null) {
  const c = onSection(p, pick, axis);
  if (c.off > 1) return Infinity;
  if (!axis) {
    const dLat = Math.abs(p.il - pick.ilIdx) + Math.abs(p.xl - pick.xlIdx);
    return Math.hypot(dLat * LAT_WEIGHT, p.s - pick.sample);
  }
  return Math.hypot((c.u - c.pu) * LAT_WEIGHT, p.s - pick.sample);
}

/** Weighted distance from a pick to the segment a-b (section plane). */
function segmentDistance(a, b, pick, axis) {
  const ca = onSection(a, pick, axis);
  const cb = onSection(b, pick, axis);
  if (ca.off > 1 || cb.off > 1) return Infinity;
  const ax = ca.u * LAT_WEIGHT;
  const bx = cb.u * LAT_WEIGHT;
  const px = ca.pu * LAT_WEIGHT;
  const dx = bx - ax;
  const dy = b.s - a.s;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.min(1, Math.max(0, ((px - ax) * dx + (pick.sample - a.s) * dy) / len2)) : 0;
  return Math.hypot(ax + t * dx - px, a.s + t * dy - pick.sample);
}

/**
 * Nearest stick node to a pick.
 * @param {Stick[]} sticks
 * @param {Pick} pick
 * @param {Object} [o]
 * @param {SectionAxis} [o.axis]
 * @param {number} [o.maxDist] weighted distance tolerance
 * @param {?number} [o.stick] restrict to one stick index
 * @returns {?{si: number, pi: number, dist: number}}
 */
export function nearestNode(sticks, pick, { axis = null, maxDist = 16, stick = null } = {}) {
  let best = null;
  sticks.forEach((st, si) => {
    if (stick != null && si !== stick) return;
    st.forEach((p, pi) => {
      const d = pointDistance(p, pick, axis);
      if (d <= maxDist && (!best || d < best.dist)) best = { si, pi, dist: d };
    });
  });
  return best;
}

/**
 * Nearest stick (by its nodes and its segments) to a pick.
 * @returns {number} stick index, or -1 when none is within maxDist
 */
export function nearestStick(sticks, pick, { axis = null, maxDist = 24 } = {}) {
  let best = -1;
  let bestD = Infinity;
  sticks.forEach((st, si) => {
    for (let i = 0; i < st.length; i++) {
      let d = pointDistance(st[i], pick, axis);
      if (i > 0) d = Math.min(d, segmentDistance(st[i - 1], st[i], pick, axis));
      if (d <= maxDist && d < bestD) { bestD = d; best = si; }
    }
  });
  return best;
}

const replaceStick = (sticks, si, stick) => sticks.map((s, i) => (i === si ? stick : s));

/**
 * Extend a stick with a new point at whichever END is nearer the point,
 * so picking above the top of a stick grows the top (it used to append
 * to the bottom and zig-zag back up). A one-point stick orders by time.
 * @returns {Stick[]}
 */
export function extendStick(sticks, si, point, axis = null) {
  const st = sticks[si];
  if (!st) return [...sticks, [point]];
  if (st.length === 0) return replaceStick(sticks, si, [point]);
  let atStart;
  if (st.length === 1) {
    atStart = point.s < st[0].s;
  } else {
    const pick = { ilIdx: point.il, xlIdx: point.xl, sample: point.s };
    const dFirst = pointDistance(st[0], pick, axis);
    const dLast = pointDistance(st[st.length - 1], pick, axis);
    if (dFirst === dLast) {
      // equidistant (or both ends off this section): go by time, a point
      // in the shallower half joins the shallower end
      const firstIsTop = st[0].s <= st[st.length - 1].s;
      const mid = (st[0].s + st[st.length - 1].s) / 2;
      atStart = (point.s < mid) === firstIsTop;
    } else {
      atStart = dFirst < dLast;
    }
  }
  return replaceStick(sticks, si, atStart ? [point, ...st] : [...st, point]);
}

/** Move one node to a new position. */
export function moveNode(sticks, si, pi, point) {
  const st = sticks[si];
  if (!st || !st[pi]) return sticks;
  return replaceStick(sticks, si, st.map((p, i) => (i === pi ? { ...point } : p)));
}

/** Delete one node; a stick left empty is removed. */
export function deleteNode(sticks, si, pi) {
  const st = sticks[si];
  if (!st || !st[pi]) return sticks;
  const next = st.filter((_, i) => i !== pi);
  if (!next.length) return sticks.filter((_, i) => i !== si);
  return replaceStick(sticks, si, next);
}

/** Delete a whole stick. */
export function deleteStick(sticks, si) {
  if (!sticks[si]) return sticks;
  return sticks.filter((_, i) => i !== si);
}

/**
 * Shorten a stick by removing `count` nodes from its TOP (shallowest end)
 * or BOTTOM (deepest end). A stick left empty is removed.
 * @param {'top'|'bottom'} end
 */
export function shortenStick(sticks, si, end, count = 1) {
  const st = sticks[si];
  if (!st || !st.length || count < 1) return sticks;
  const firstIsTop = st[0].s <= st[st.length - 1].s;
  const fromStart = (end === 'top') === firstIsTop;
  const next = fromStart ? st.slice(count) : st.slice(0, Math.max(0, st.length - count));
  if (!next.length) return sticks.filter((_, i) => i !== si);
  return replaceStick(sticks, si, next);
}

/**
 * Trim a stick at node `pi`: that node and everything between it and the
 * nearer end are removed (clicking an end node removes just that node).
 * Ties (the middle node of an odd stick) go by the click: a click above
 * the node trims toward the shallower end.
 * @param {number} [clickSample] the click's sample, for the tie rule
 */
export function trimStickAt(sticks, si, pi, clickSample = null) {
  const st = sticks[si];
  if (!st || !st[pi]) return sticks;
  const toStart = pi;
  const toEnd = st.length - 1 - pi;
  let fromStart;
  if (toStart !== toEnd) {
    fromStart = toStart < toEnd;
  } else {
    const firstIsTop = st[0].s <= st[st.length - 1].s;
    const above = clickSample != null && clickSample < st[pi].s;
    fromStart = above === firstIsTop;
  }
  const next = fromStart ? st.slice(pi + 1) : st.slice(0, pi);
  if (!next.length) return sticks.filter((_, i) => i !== si);
  return replaceStick(sticks, si, next);
}

/** Append an empty stick (unless the last one is already empty). */
export function newStick(sticks) {
  if (sticks.length && sticks[sticks.length - 1].length === 0) return sticks;
  return [...sticks, []];
}

/** Sticks as saved: at least two points each, in the row's jsonb shape. */
export function savableSticks(sticks) {
  return sticks.filter((s) => s.length >= 2).map((points) => ({ points }));
}
