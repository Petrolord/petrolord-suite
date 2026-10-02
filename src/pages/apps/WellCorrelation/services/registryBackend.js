// The real backend adapter: everything CorrelationWorkstation touches
// goes through this one object, so the /dev harness swaps in
// inMemoryBackend and the whole app runs without auth or DB (the
// WDM/Petrophysics harness pattern).
//
// Wells/curves/tops come from the shared registry
// (src/lib/wellsRegistry.js — geo_wells, geo_wells_logs, geo_wells_tops
// with owner-or-org RLS). Section state is the owner's
// (geo_correlation_sections), shareable with the organisation.

import {
  listWells, listLogs, downloadCurve, listTops, listAllTops, listZones,
  saveTop, updateTop, deleteTop, propagateTop,
} from '@/lib/wellsRegistry';
import { listIntervals, listUnits } from '@/lib/stratRegistry';
// U2-003: horizons are read only from the shared surface registry
import { listSurfaces, downloadSurfaceGrid } from '@/lib/surfacesRegistry';
import {
  loadSection, saveSection, listSections, createSection, renameSection, deleteSection,
} from '@/lib/sectionsRegistry';
import { supabaseSharingStore } from '@/lib/recordSharing';

// Seismolord U2-002: a seismic backdrop read along the section (lazy: the
// seismic code loads only when a volume is chosen)
const listSeismicVolumes = async () => (await import('@/pages/apps/Seismolord/services/sectionBackdrop')).listBackdropVolumes();
const loadSeismicBackdrop = async (volume, wells) => (await import('@/pages/apps/Seismolord/services/sectionBackdrop')).loadVolumeBackdrop(volume, wells);

export function makeRegistryBackend() {
  return {
    listSeismicVolumes, loadSeismicBackdrop,
    listWells, listLogs, downloadCurve, listTops, listAllTops, listIntervals, listSurfaces, downloadSurfaceGrid,
    listZones, listUnits, // U2-008: Petrophysics zones, Stratigraphy column (read only)
    saveTop, updateTop, deleteTop, propagateTop,
    loadSection, saveSection, listSections, createSection, renameSection, deleteSection,
    // organisation sharing of sections (src/lib/recordSharing)
    sharing: supabaseSharingStore(),
  };
}
