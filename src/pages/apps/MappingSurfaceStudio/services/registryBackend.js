// The real backend adapter: everything MappingWorkstation touches goes
// through this one object, so the /dev harness swaps in inMemoryBackend
// and the whole app runs without auth or DB (the house harness
// pattern). Wells + tops + zones come from the shared well registry;
// surfaces from the new geo_surfaces registry.

import { listWellsWithTops, listZones } from '@/lib/wellsRegistry';
import { listSurfaces, saveSurface, downloadSurfaceGrid, deleteSurface } from '@/lib/surfacesRegistry';

export function makeRegistryBackend() {
  return {
    // wells with tops embedded; zones fetched per well on demand for
    // attribute maps (kept lazy — most maps are structure maps on tops)
    async listWells() {
      const wells = await listWellsWithTops();
      return Promise.all(wells.map(async (w) => ({
        ...w,
        zones: w.is_own || w.organization_id ? await listZones(w.id).catch(() => []) : [],
      })));
    },
    listSurfaces,
    saveSurface,
    downloadSurfaceGrid,
    deleteSurface,
  };
}
