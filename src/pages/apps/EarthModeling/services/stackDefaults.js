// Stack defaults (Earth Modeling, Ekene walk 2026-10-14). A surface named
// "Ekene Sand top (6-well map)" or "Ekene Sand base (6-well map)" ties to
// the well tops "Ekene Sand" and "Ekene Sand Base", and the zone below a
// tied top reads the registry zone of the same name. Before this the ties
// stayed empty unless the names matched exactly, and the first zone of the
// first well ("Seabed" on the Ekene wells) was picked for every new zone,
// so the zone populated from the wrong interval without saying so.

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

/** The surface name without its parenthetical notes, a "Project:" prefix and trailing map words. */
function core(name) {
  let s = norm(name).replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/\b(surface|map|grid|depth|tvdss|structure)\b/g, ' ').replace(/\s+/g, ' ').trim();
  return s;
}

/**
 * The well top a stacked surface ties to, or '' when none is a clear match.
 * Exact names win; then "<name> top" ties to <name>, "<name> base" to
 * "<name> base" (or "<name> bottom"), and a plain name to itself. A
 * "Project: " prefix is dropped when nothing matches with it.
 * @param {string} surfaceName
 * @param {string[]} topNames
 */
export function matchTopName(surfaceName, topNames = []) {
  if (!surfaceName || !topNames.length) return '';
  const exact = topNames.find((t) => t === surfaceName);
  if (exact) return exact;
  const byNorm = new Map(topNames.map((t) => [norm(t), t]));
  const tryCore = (c) => {
    if (!c) return '';
    if (byNorm.has(c)) return byNorm.get(c);
    const top = c.match(/^(.*\S)\s+top$/);
    if (top && byNorm.has(top[1])) return byNorm.get(top[1]);
    const base = c.match(/^(.*\S)\s+(base|bottom)$/);
    if (base) {
      for (const k of [`${base[1]} base`, `${base[1]} bottom`]) if (byNorm.has(k)) return byNorm.get(k);
    }
    return '';
  };
  const c = core(surfaceName);
  const hit = tryCore(c);
  if (hit) return hit;
  const colon = c.indexOf(':');
  return colon >= 0 ? tryCore(c.slice(colon + 1).trim()) : '';
}

/**
 * The registry zone a new model zone reads: the zone named after the tie
 * top of the surface above it, else none (the user picks one). Never the
 * first zone in the list.
 */
export function defaultZone(i, tieTop, zoneNames = []) {
  let reg = '';
  if (tieTop) {
    const byNorm = new Map(zoneNames.map((z) => [norm(z), z]));
    const n = norm(tieTop);
    const bare = n.replace(/^top\s*/, '').replace(/\s*top$/, '').trim();
    reg = zoneNames.includes(tieTop) ? tieTop : (byNorm.get(n) || (bare && byNorm.get(bare)) || '');
  }
  return { name: reg || `Zone ${i + 1}`, registryZone: reg };
}

/** Two wells for the first section: the first two (by name) with tops. */
export function defaultSectionPair(wells = []) {
  const withTops = wells.filter((w) => (w.tops || []).length > 0)
    .sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true }));
  const pool = withTops.length >= 2 ? withTops : wells;
  return pool.length >= 2 ? { a: pool[0].id, b: pool[1].id } : { a: '', b: '' };
}
