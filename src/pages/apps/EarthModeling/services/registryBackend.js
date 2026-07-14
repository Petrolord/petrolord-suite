// The real backend adapter (Earth Modeling G8.2): everything
// EarthWorkstation touches goes through this one object, so the
// /dev/earth-modeling harness swaps in inMemoryBackend and the whole
// app runs without auth or DB (the house pattern). Wells + tops +
// zones from the shared well registry; surfaces from geo_surfaces.
// Model persistence (em_projects) lands in G8.3 — until that
// migration ships, project methods degrade with a clear message.

import { listWellsWithTops, listZones } from '@/lib/wellsRegistry';
import { listSurfaces, saveSurface, downloadSurfaceGrid } from '@/lib/surfacesRegistry';

export function makeRegistryBackend() {
  return {
    async listWells() {
      const wells = await listWellsWithTops();
      return Promise.all(wells.map(async (w) => ({
        ...w,
        zones: w.is_own || w.organization_id ? await listZones(w.id).catch(() => []) : [],
      })));
    },
    listSurfaces,
    downloadSurfaceGrid,
    saveSurface,
    async listProjects() { return []; },
    async saveProject() { throw new Error('Model save arrives with the em_projects migration (G8.3).'); },
    async updateProject() { throw new Error('Model save arrives with the em_projects migration (G8.3).'); },
    async deleteProject() { throw new Error('Model save arrives with the em_projects migration (G8.3).'); },
  };
}
