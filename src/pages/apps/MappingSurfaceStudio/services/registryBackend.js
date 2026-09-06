// The real backend adapter: everything MappingWorkstation touches goes
// through this one object, so the /dev harness swaps in inMemoryBackend
// and the whole app runs without auth or DB (the house harness
// pattern). Wells + tops + zones come from the shared well registry;
// surfaces from the new geo_surfaces registry.

import { listWellsWithTops, listZones } from '@/lib/wellsRegistry';
import {
  listSurfaces, saveSurface, downloadSurfaceGrid, deleteSurface,
  shareSurface, unshareSurface, updateSurface, replaceSurfaceGrid,
} from '@/lib/surfacesRegistry';
import {
  listCulture, downloadCultureFeatures, saveCulture, updateCulture, deleteCulture,
} from '@/lib/cultureRegistry';
import { listVolumes, getManifest } from '@/pages/apps/Seismolord/services/volumesService';
import { normalizeVelocity } from '@/pages/apps/Seismolord/engine/velocityModel';
import { resolveUserOrgId } from '@/lib/orgContext';
import { supabase } from '@/lib/customSupabaseClient';

/** The caller's organization id, resolved once per session; null when
 *  they belong to no organization (the share action explains instead
 *  of failing) — the Seismolord explorer's pattern. */
let orgIdPromise; // undefined = not yet requested
function myOrgId() {
  if (orgIdPromise === undefined) {
    orgIdPromise = supabase.auth.getUser()
      .then(({ data: { user } }) => (user ? resolveUserOrgId(user.id) : null))
      .catch(() => null);
  }
  return orgIdPromise;
}

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
    // MS2: rename and re-grid in place (owner-only, RLS re-checks)
    updateSurface,
    replaceSurfaceGrid,
    /** Share/unshare an OWN surface with the caller's organization
     *  (read-only for members — the geo_wells model; RLS + storage
     *  policies have existed since G4). Returns the updated row. */
    async setSurfaceShared(surface, shared) {
      if (!shared) return unshareSurface(surface.id);
      const org = await myOrgId();
      if (!org) throw new Error('You belong to no organization — nothing to share with.');
      return shareSurface(surface.id, org);
    },
    // culture / GIS layers (W1.3): shared geo_culture registry; MS3 draws
    // fault-block and boundary polygons into it
    listCulture,
    downloadCultureFeatures,
    saveCulture,
    updateCulture,
    deleteCulture,
    canImportCulture: true,
    // MS3 time-to-depth: Seismolord volumes' velocity models (linear
    // usable here; layer cakes listed so the refusal can name them)
    async listVelocityModels() {
      const out = [];
      let volumes = [];
      try { volumes = await listVolumes(); } catch { return out; }
      for (const v of volumes) {
        if (v.kind === 'attribute') continue;
        try {
          const manifest = await getManifest(v);
          const m = normalizeVelocity(manifest?.velocity);
          if (!m) continue;
          out.push({ id: v.id, name: v.name, kind: m.kind, velocity: manifest.velocity });
        } catch { /* a volume without a readable manifest has no model to offer */ }
      }
      return out;
    },
  };
}
