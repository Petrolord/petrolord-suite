// How the CRS picker lays out the catalog (WD tester feedback 2026-09-22).
//
// The catalog opens with the 120 WGS 84 / UTM zones, so a picker that
// showed "the first 30 entries" with an empty search showed nothing but
// UTM zones 1N to 15S, and a tester concluded Minna / Nigeria was missing.
// Browsing now lists the regional and national systems grouped by region
// (Nigeria first, the Suite's home market), and folds the WGS 84 / UTM
// zones into one group the user opens or searches.

import { CRS_CATALOG, searchCatalog } from '@/lib/crs';

export const PRIORITY_REGIONS = Object.freeze(['Nigeria onshore', 'Nigeria offshore', 'Nigeria']);
export const SEARCH_LIMIT = 50;
export const UTM_GROUP_KEY = 'wgs84-utm';

/** True for the 120 WGS 84 / UTM zones (EPSG:326xx north, 327xx south). */
export function isWgs84Utm(entry) {
  return /^EPSG:32[67]\d\d$/.test(entry?.code || '');
}

function regionRank(region) {
  const i = PRIORITY_REGIONS.indexOf(region);
  return i === -1 ? PRIORITY_REGIONS.length : i;
}

/**
 * Browse layout for an empty search: regional/national groups (priority
 * regions first, then alphabetical), then the WGS 84 / UTM group.
 * @returns {{key: string, label: string, entries: Object[]}[]}
 */
export function browseGroups(catalog = CRS_CATALOG) {
  const byRegion = new Map();
  const utm = [];
  for (const e of catalog) {
    if (isWgs84Utm(e)) { utm.push(e); continue; }
    const r = e.region || 'Other';
    if (!byRegion.has(r)) byRegion.set(r, []);
    byRegion.get(r).push(e);
  }
  const regions = [...byRegion.keys()].sort((a, b) => (
    regionRank(a) - regionRank(b) || a.localeCompare(b)
  ));
  const groups = regions.map((r) => ({ key: `region:${r}`, label: r, entries: byRegion.get(r) }));
  if (utm.length) groups.push({ key: UTM_GROUP_KEY, label: 'WGS 84 / UTM', entries: utm });
  return groups;
}

/** Search results capped at `limit`, with the full match count. */
export function searchResults(query, limit = SEARCH_LIMIT) {
  const all = searchCatalog(query);
  return { entries: all.slice(0, limit), total: all.length };
}
