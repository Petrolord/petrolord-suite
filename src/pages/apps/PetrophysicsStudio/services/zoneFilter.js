// Crossplot zone filter (PT8, 2026-09-05): which of the well's zones a
// crossplot is showing, and what colour a point takes when several are.
// Pure — the panel owns the selection state, this decides what it means.
//
// A Pickett plot over the whole well mixes every interval it has, and the
// picture the interpreter wants is the reservoir sand alone, or two sands
// side by side. Zones are already the app's interval vocabulary, so the
// filter is a selection over them rather than another pair of depth boxes.
//
// Overlapping zones resolve first-by-top, the same rule the zoned pipeline
// uses for parameter overrides, so a sample never belongs to two zones.

// Distinct from the facies palette so a zone-coloured plot never reads as
// a facies-coloured one. Chart-standard hues (src/utils/chartTheme.js).
export const ZONE_COLORS = ['#0891b2', '#d97706', '#059669', '#7c3aed', '#dc2626', '#2563eb', '#ca8a04', '#db2777'];

// Number(null) and Number('') are 0, not NaN, so a zone missing a depth
// would otherwise resolve to a band at the origin and swallow samples.
const depthOf = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));

/** Zones sorted shallowest first, dropping any without usable depths. */
const usable = (zones) => (zones || [])
  .filter((z) => Number.isFinite(depthOf(z.top_md_m)) && Number.isFinite(depthOf(z.base_md_m)))
  .slice()
  .sort((a, b) => depthOf(a.top_md_m) - depthOf(b.top_md_m));

/**
 * Resolve a zone selection into everything a plot needs.
 *
 * @param {Array} zones the well's geo_wells_zones rows
 * @param {?Array<string>} ids selected zone ids; null or empty means ALL
 *   zones, which is also the "no filter" case — the plot shows every
 *   sample, including those outside every zone
 * @returns {{
 *   filtering: boolean,   // does this hide any sample?
 *   colouring: boolean,   // more than one zone selected -> colour by zone
 *   selected: Array,      // the resolved zone rows, shallowest first
 *   zoneAt: (mdM: number) => ?Object,   // selected zone containing a depth
 *   inFilter: (mdM: number) => boolean, // does this depth survive?
 *   colorOf: (mdM: number) => ?string,  // zone colour, else null
 *   legend: Array<{name: string, color: string}>,
 *   label: string,        // for a caption or a status line
 * }}
 */
export function planZoneFilter(zones, ids) {
  const all = usable(zones);
  const wanted = Array.isArray(ids) && ids.length ? new Set(ids) : null;
  const live = wanted ? all.filter((z) => wanted.has(z.id)) : all;
  // a selection naming no zone that still exists is treated as no filter,
  // so a stale id from a deleted zone cannot blank the plot
  const filtering = !!wanted && live.length > 0;
  const selected = filtering ? live : all;
  const colouring = filtering && selected.length > 1;
  const colorById = new Map(selected.map((z, i) => [z.id, ZONE_COLORS[i % ZONE_COLORS.length]]));

  const zoneAt = (mdM) => {
    if (!Number.isFinite(mdM)) return null;
    for (const z of selected) {
      if (mdM >= depthOf(z.top_md_m) && mdM <= depthOf(z.base_md_m)) return z;
    }
    return null;
  };

  return {
    filtering,
    colouring,
    selected,
    zoneAt,
    inFilter: (mdM) => (filtering ? zoneAt(mdM) !== null : true),
    colorOf: (mdM) => {
      if (!colouring) return null;
      const z = zoneAt(mdM);
      return z ? colorById.get(z.id) : null;
    },
    legend: colouring ? selected.map((z) => ({ name: z.name, color: colorById.get(z.id) })) : [],
    label: filtering ? selected.map((z) => z.name).join(', ') : 'all zones',
  };
}
