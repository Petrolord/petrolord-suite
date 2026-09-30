// Zone properties as map sources (AppUpgrade PETRO-U2-008, 2026-09-29).
// Petrophysics Studio publishes, per zone, net pay, net reservoir, gross
// (along hole and true vertical), porosity, pore-volume weighted Sw, NTG and
// the hydrocarbon pore thickness HCPV = sum h phi (1 - Sw), the property a
// volumetric map wants (an HCPV map times area is the hydrocarbon pore
// volume). The picker used to list every numeric key raw, bookkeeping
// included (pipeline_version); this table names them, orders the
// volumetric ones first and says which are thicknesses (metres).

export const ZONE_PROPERTIES = Object.freeze([
  { key: 'hcpv_tvt_m', label: 'HCPV, hydrocarbon pore thickness (TVT)', length: true },
  { key: 'hcpv_m', label: 'HCPV, hydrocarbon pore thickness (MD)', length: true },
  { key: 'net_tvt_m', label: 'Net pay (TVT)', length: true },
  { key: 'net_m', label: 'Net pay (MD)', length: true },
  { key: 'net_res_tvt_m', label: 'Net reservoir (TVT)', length: true },
  { key: 'net_res_m', label: 'Net reservoir (MD)', length: true },
  { key: 'gross_tvt_m', label: 'Gross (TVT)', length: true },
  { key: 'gross_m', label: 'Gross (MD)', length: true },
  { key: 'ntg', label: 'Net to gross', length: false },
  { key: 'phi_avg', label: 'Porosity average (PHIE)', length: false },
  { key: 'sw_avg', label: 'Sw average (pore-volume weighted)', length: false },
  { key: 'vsh_avg', label: 'Vsh average', length: false },
  { key: 'k_gm_md', label: 'Permeability geometric mean (mD)', length: false },
]);

/** Bookkeeping numbers a zone row carries that are not mappable properties. */
export const NOT_MAPPABLE = Object.freeze(['pipeline_version']);

const byKey = Object.fromEntries(ZONE_PROPERTIES.map((p) => [p.key, p]));

/** The numeric keys present, known ones first in table order, bookkeeping dropped. */
export function orderZoneKeys(keys) {
  const set = new Set(keys);
  const known = ZONE_PROPERTIES.map((p) => p.key).filter((k) => set.has(k));
  const rest = [...set].filter((k) => !byKey[k] && !NOT_MAPPABLE.includes(k)).sort();
  return [...known, ...rest];
}

/** Picker label: the name, the raw key, and (m) for thicknesses. */
export const zoneKeyLabel = (k) => (byKey[k] ? `${byKey[k].label}${byKey[k].length ? ' (m)' : ''} [${k}]` : k);

/** A thickness in metres (the map carries a length unit). */
export const isLengthKey = (k) => !!byKey[k]?.length;
