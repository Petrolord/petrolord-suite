// Project Data Inventory: the registry reads (read only). Wells with their
// log metadata, zones and tops in one query per table (paged past
// PostgREST's 1,000-row cap, as Well Data Manager's inventory reads them);
// Seismolord volumes with their survey metadata, horizons and faults; the
// surfaces registry; the QI worker's files. Curve samples on demand. Every
// read goes through RLS, so the inventory shows what the user may see.
import { supabase } from '@/lib/customSupabaseClient';
import { listWells, listAllLogMeta, listAllTops, downloadCurve } from '@/lib/wellsRegistry';

const PAGE = 1000;
async function selectAll(table, columns) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select(columns).order('id', { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw new Error(`Could not read ${table}: ${error.message}`);
    out.push(...(data || []));
    if (!data || data.length < PAGE) return out;
  }
}
const soft = (p) => p.catch(() => []);

/** Group child rows by well id onto the well rows: [{ well, logs, zones, tops }]. */
export function bundleWells(wells, logs = [], zones = [], tops = []) {
  const by = (rows) => {
    const m = new Map();
    for (const r of rows) { if (!m.has(r.well_id)) m.set(r.well_id, []); m.get(r.well_id).push(r); }
    return m;
  };
  const L = by(logs); const Z = by(zones); const T = by(tops);
  return (wells || []).map((w) => ({
    well: w,
    logs: L.get(w.id) || [],
    zones: (Z.get(w.id) || []).slice().sort((a, b) => a.top_md_m - b.top_md_m),
    tops: (T.get(w.id) || []).slice().sort((a, b) => a.md_m - b.md_m),
  }));
}

/**
 * @param {{wellIds?: string[]}} [opts] restrict the wells (QI Studio's study wells); all visible wells otherwise
 */
export function makeRegistryInventorySource() {
  return {
    async loadWells({ wellIds = null } = {}) {
      const [wells, logs, zones, tops] = await Promise.all([
        listWells(), listAllLogMeta(), soft(selectAll('geo_wells_zones', 'id, well_id, name, top_md_m, base_md_m')), soft(listAllTops()),
      ]);
      const chosen = wellIds && wellIds.length ? wells.filter((w) => wellIds.includes(w.id)) : wells;
      return bundleWells(chosen.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'en', { numeric: true })), logs, zones, tops);
    },
    async loadSeismic({ volumeIds = null } = {}) {
      const [volumes, datasets, horizons, faults, surfaces] = await Promise.all([
        soft(selectAll('seismic_volumes', 'id, name, kind, status, crs, survey_meta, attribute_params, parent_volume_id, created_at')),
        soft(selectAll('qi_datasets', 'id, name, kind, status, original_filename, bytes, meta')),
        soft(selectAll('seismic_horizons', 'id, name, domain, volume_id, archived_at')),
        soft(selectAll('seismic_faults', 'id, name, volume_id, archived_at')),
        soft(selectAll('geo_surfaces', 'id, name, kind, z_domain, z_unit')),
      ]);
      // a study that chose its volumes sees those and their derived products
      const keep = volumeIds && volumeIds.length
        ? volumes.filter((v) => volumeIds.includes(v.id) || volumeIds.includes(v.parent_volume_id))
        : volumes;
      return { volumes: keep, datasets, horizons, faults, surfaces };
    },
    downloadCurve,
  };
}
