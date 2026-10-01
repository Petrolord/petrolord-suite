// The real backend adapter: everything MappingWorkstation touches goes
// through this one object, so the /dev harness swaps in inMemoryBackend
// and the whole app runs without auth or DB (the house harness
// pattern). Wells + tops + zones come from the shared well registry;
// surfaces from the new geo_surfaces registry.

import { listPublishedVelocityModels } from '@/lib/velocityModels';
import { listWellsWithTops, listZones } from '@/lib/wellsRegistry';
import { listIntervals } from '@/lib/stratRegistry';
import {
  listSurfaces, saveSurface, downloadSurfaceGrid, deleteSurface, downloadArchivedGrid,
  shareSurface, unshareSurface, updateSurface, replaceSurfaceGrid,
} from '@/lib/surfacesRegistry';
import {
  listCulture, downloadCultureFeatures, saveCulture, updateCulture, deleteCulture,
} from '@/lib/cultureRegistry';
import { listVolumes, getManifest } from '@/pages/apps/Seismolord/services/volumesService';
import { resolveUserOrgId } from '@/lib/orgContext';
import { getDepthUnit, setDepthUnit } from '@/lib/crs/settingsService';
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
        // ST4: lithology and environment intervals for thickness and environment maps
        intervals: w.is_own || w.organization_id ? await listIntervals(w.id).catch(() => []) : [],
      })));
    },
    listSurfaces,
    saveSurface,
    downloadSurfaceGrid,
    downloadArchivedGrid,
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
    // MS5: per-user depth display unit (geoscience_settings.depth_unit)
    getDepthUnit,
    setDepthUnit,
    // MS3 time-to-depth: Seismolord volumes' velocity models (linear
    // usable here; layer cakes listed so the refusal can name them)
    async listVelocityModels() {
      // Seismolord U2-006: the shared reader (row model first, manifest as
      // the pre-W0.2 fallback; layer cakes with their boundary horizons)
      return listPublishedVelocityModels({ listVolumes, getManifest });
    },
  };
}
