// QI Studio reads (QI programme Q1 / A4): the shared wells registry (wells,
// curve metadata, zones, tops), Seismolord's volumes and the surfaces
// registry. Read only: QI Studio never writes another app's records.

import { listWells, listLogs, listZones, listTops } from '@/lib/wellsRegistry';
import { supabase } from '@/lib/customSupabaseClient';

export function makeRegistryBackend() {
  return {
    listWells,
    async loadWell(well) {
      const [logs, zones, tops] = await Promise.all([listLogs(well.id), listZones(well.id), listTops(well.id)]);
      return { well, logs, zones, tops };
    },
    async listVolumes() {
      const { data, error } = await supabase.from('seismic_volumes')
        .select('id, name, kind, status, user_id, created_at')
        .order('created_at', { ascending: false });
      if (error) throw new Error(`Could not load seismic volumes: ${error.message}`);
      return (data || []).filter((v) => (v.status || 'ready') === 'ready' && (!v.kind || v.kind === 'seismic'));
    },
    async countSurfaces() {
      const { count, error } = await supabase.from('geo_surfaces').select('id', { count: 'exact', head: true });
      return error ? 0 : (count || 0);
    },
  };
}
