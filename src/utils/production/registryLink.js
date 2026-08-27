// wellsRegistry linkage (P1): match po_wells (as-imported labels) to
// geo_wells registry rows so production data joins subsurface data by
// id, never by free-text name. Pure module — the productionSpine
// service applies the suggestions; the P2+ UIs let the user confirm or
// override before anything is written.

/**
 * Canonical form of a well name/UWI for matching: uppercase, all
 * separators and spaces removed, leading zeros stripped from every
 * digit run — so "P-01", "p 1" and "P_001" all key to "P1".
 */
export function normalizeWellKey(value) {
  const s = String(value ?? '').trim().toUpperCase();
  if (!s) return '';
  return s
    .replace(/[^A-Z0-9]+/g, '')
    // zeros dropped only at the START of a digit run: P-001 -> P1, P-100 -> P100
    .replace(/(^|\D)0+(?=\d)/g, '$1');
}

/**
 * Suggest geo_wells links for a set of po_wells. UWI matches outrank
 * name matches; a key claimed by two or more registry wells is
 * ambiguous and yields no suggestion (the user picks by hand). Wells
 * already linked (geo_well_id set) are left alone.
 *
 * @param {Array<{id: string, name: string, uwi?: ?string, geo_well_id?: ?string}>} poWells
 * @param {Array<{id: string, name: string, uwi?: ?string}>} geoWells
 * @returns {Array<{poWellId: string, geoWellId: string, basis: 'uwi'|'name'}>}
 */
export function suggestRegistryLinks(poWells, geoWells) {
  const byUwi = new Map();
  const byName = new Map();
  (geoWells || []).forEach((g) => {
    const uwiKey = normalizeWellKey(g.uwi);
    if (uwiKey) byUwi.set(uwiKey, byUwi.has(uwiKey) ? null : g.id); // null = ambiguous
    const nameKey = normalizeWellKey(g.name);
    if (nameKey) byName.set(nameKey, byName.has(nameKey) ? null : g.id);
  });

  const suggestions = [];
  (poWells || []).forEach((w) => {
    if (w.geo_well_id) return;
    const uwiKey = normalizeWellKey(w.uwi);
    if (uwiKey && byUwi.get(uwiKey)) {
      suggestions.push({ poWellId: w.id, geoWellId: byUwi.get(uwiKey), basis: 'uwi' });
      return;
    }
    const nameKey = normalizeWellKey(w.name);
    if (nameKey && byName.get(nameKey)) {
      suggestions.push({ poWellId: w.id, geoWellId: byName.get(nameKey), basis: 'name' });
    }
  });
  return suggestions;
}
