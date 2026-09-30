// The real backend adapter for Stratigraphy Studio (ST0): everything the
// workstation touches goes through this one object, so the /dev harness
// swaps in inMemoryBackend and the whole app runs without auth or DB (the
// Well Correlation / Petrophysics harness pattern).
//
// Wells and tops come from the shared registry (src/lib/wellsRegistry.js:
// geo_wells, geo_wells_tops with the ST0 typed-surface columns); the
// stratigraphic column from src/lib/stratRegistry.js (geo_strat_units).
// No app-local Supabase calls against registry tables (plan section 4).

import { listWells, listTops, listAllTops, updateTop, saveTop, listLogs, downloadCurve, listZones } from '@/lib/wellsRegistry';
import { listSurfaces, downloadSurfaceGrid } from '@/lib/surfacesRegistry';
import { supabase } from '@/lib/customSupabaseClient';
import { makeRegistryBackend as makeBasinBackend } from '@/pages/apps/BasinFlowGenesis/services/backend';
import { loadSection, saveSection, listSections } from '@/lib/sectionsRegistry';
import {
  listUnits, saveUnit, updateUnit, deleteUnit,
  listIntervals, replaceIntervals, listCoreImages, uploadCoreImage, updateCoreImage, deleteCoreImage, coreImageUrl,
  loadStratProject, saveStratProject,
} from '@/lib/stratRegistry';

export function makeRegistryBackend() {
  const basin = makeBasinBackend();
  return {
    listWells, listTops, updateTop, saveTop, listLogs, downloadCurve, listUnits, saveUnit, updateUnit, deleteUnit,
    // ST3: the Basin handoff writes a bf_wells row through Basin's own backend
    async currentUserId() { const { data: { user } } = await supabase.auth.getUser(); return user?.id || null; },
    createBasinModel: (row) => basin.insertWell(row),
    listIntervals, replaceIntervals, listCoreImages, uploadCoreImage, updateCoreImage, deleteCoreImage, coreImageUrl,
    // ST2: the shared section (same rows as Well Correlation) and the app-private view state
    loadSection, saveSection, loadStratProject, saveStratProject,
    // STRAT-U2-002: the section picker (STRAT-U1-009) listed nothing here, only
    // on the harness; Seismolord horizons and Petrophysics zones, read only
    listSections, listSurfaces, downloadSurfaceGrid, listZones,
    // STRAT-U2-003: every visible top in one read, for the chart-version flags
    listAllTops,
  };
}
