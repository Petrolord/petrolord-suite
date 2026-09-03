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
  const topMdM = Math.min(a, b);
  const baseMdM = Math.max(a, b);
  return { name: String(name || upper.name).trim(), topMdM, baseMdM };
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
    out.push({ name: a.name, topMdM: a.md_m, baseMdM: b.md_m });
    taken.add(key(a.name));
  }
  if (includeToTd && sorted.length && Number.isFinite(Number(tdM))) {
    const last = sorted[sorted.length - 1];
    if (tdM > last.md_m && !taken.has(key(last.name))) out.push({ name: last.name, topMdM: last.md_m, baseMdM: Number(tdM) });
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
