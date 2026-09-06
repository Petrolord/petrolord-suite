// Zone creation planning (PT4, 2026-09-03): pure helpers behind the three
// ways a zone is made in the Zones panel: typed depths, between two tops,
// or a two-click pick on the track. Metres MD throughout; the panel
// converts display units before calling in. The database keeps the
// base > top CHECK as the backstop.

const key = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/** null when the window is valid, else a user-facing message. */
export function validateZoneWindow(topMdM, baseMdM, unit = 'm') {
  if (!Number.isFinite(topMdM) || !Number.isFinite(baseMdM) || !(baseMdM > topMdM)) {
    return `Top and base must be numbers with base below top (${unit === 'ft' ? 'ft' : 'm'} MD).`;
  }
  return null;
}

/** A zone spanning two tops (either order); the name defaults to the upper top's name. */
export function planZoneFromTops(topA, topB, name = null) {
  if (!topA || !topB || topA.id === topB.id) throw new Error('Pick two different tops.');
  const a = Number(topA.md_m);
  const b = Number(topB.md_m);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) throw new Error('The two tops must sit at different depths.');
  const upper = a < b ? topA : topB;
  const lower = a < b ? topB : topA;
  const topMdM = Math.min(a, b);
  const baseMdM = Math.max(a, b);
  // PT8: remember which tops drew the edges, so moving one of them moves
  // this zone exactly instead of by depth coincidence
  return {
    name: String(name || upper.name).trim(),
    topMdM,
    baseMdM,
    fromTops: { top: upper.id, base: lower.id },
  };
}

/**
 * One zone per consecutive pair of tops, named after the upper top; pairs
 * whose upper top's name already has a zone are skipped, as are zero
 * spans. Optionally a last zone from the deepest top to TD.
 */
export function planZonesBetweenConsecutiveTops(tops, { existingZones = [], tdM = null, includeToTd = false } = {}) {
  const sorted = (tops || []).filter((t) => Number.isFinite(Number(t.md_m))).slice().sort((x, y) => x.md_m - y.md_m);
  const taken = new Set((existingZones || []).map((z) => key(z.name)));
  const out = [];
  const skipped = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (!(b.md_m > a.md_m)) { skipped.push({ name: a.name, reason: 'zero span' }); continue; }
    if (taken.has(key(a.name))) { skipped.push({ name: a.name, reason: 'zone exists' }); continue; }
    out.push({ name: a.name, topMdM: a.md_m, baseMdM: b.md_m, fromTops: { top: a.id, base: b.id } });
    taken.add(key(a.name));
  }
  if (includeToTd && sorted.length && Number.isFinite(Number(tdM))) {
    const last = sorted[sorted.length - 1];
    if (tdM > last.md_m && !taken.has(key(last.name))) {
      out.push({ name: last.name, topMdM: last.md_m, baseMdM: Number(tdM), fromTops: { top: last.id, base: null } });
    }
  }
  return { zones: out, skipped };
}

/** Name suggestion for a picked window: the nearest top at or above it,
 *  else "Zone N". */
export function defaultZoneNameAt(mdM, tops, zones) {
  let best = null;
  for (const t of tops || []) if (t.md_m <= mdM + 1e-9 && (!best || t.md_m > best.md_m)) best = t;
  return best ? best.name : `Zone ${(zones || []).length + 1}`;
}

// ---- following a moved top (PT8, 2026-09-05) --------------------------------
// A zone is a depth window; nothing in the row points back at a top. Two
// rules, in order, decide whether a moved top takes a zone edge with it:
//
//   1. provenance — the zone was created from tops and records their ids
//      in properties.from_tops, so the match is exact;
//   2. depth coincidence — a zone with NO provenance whose edge sits on
//      the top's old depth. This is what carries zones that already
//      existed before the link was recorded.
//
// A zone that records provenance is judged by rule 1 ALONE: if its link
// does not name this top, a coincident edge is a coincidence, not a
// reference, and it stays put.

/** Metres. A drag commits to 2 dp, so the window absorbs that rounding. */
export const TOP_FOLLOW_TOL_M = 0.011;

/**
 * How a top's move re-cuts the zones that reference it.
 *
 * @param {Array} zones geo_wells_zones rows
 * @param {{id: string, fromMdM: number, toMdM: number}} move
 * @returns {{moves: Array<{zone, patch, edge, by: 'link'|'depth'}>,
 *            blocked: Array<{zone, edge, reason: string}>}}
 *   `moves` are the patches to apply; `blocked` are zones that reference
 *   the top but cannot follow it without inverting (base above top), which
 *   the caller reports instead of silently dropping.
 */
export function planZonesAfterTopMove(zones, { id, fromMdM, toMdM }, { tol = TOP_FOLLOW_TOL_M } = {}) {
  const moves = [];
  const blocked = [];
  if (!Number.isFinite(fromMdM) || !Number.isFinite(toMdM)) return { moves, blocked };
  for (const z of zones || []) {
    const link = z.properties?.from_tops;
    let edge = null;
    let by = null;
    if (link && (link.top || link.base)) {
      if (link.top && link.top === id) { edge = 'top'; by = 'link'; }
      else if (link.base && link.base === id) { edge = 'base'; by = 'link'; }
    } else {
      if (Math.abs(Number(z.top_md_m) - fromMdM) <= tol) { edge = 'top'; by = 'depth'; }
      else if (Math.abs(Number(z.base_md_m) - fromMdM) <= tol) { edge = 'base'; by = 'depth'; }
    }
    if (!edge) continue;
    const nextTop = edge === 'top' ? toMdM : Number(z.top_md_m);
    const nextBase = edge === 'base' ? toMdM : Number(z.base_md_m);
    if (!(nextBase > nextTop)) {
      blocked.push({ zone: z, edge, reason: `${z.name} would have its base at or above its top` });
      continue;
    }
    moves.push({ zone: z, edge, by, patch: edge === 'top' ? { top_md_m: toMdM } : { base_md_m: toMdM } });
  }
  return { moves, blocked };
}
