// The real backend adapter: everything CorrelationWorkstation touches
// goes through this one object, so the /dev harness swaps in
// inMemoryBackend and the whole app runs without auth or DB (the
// WDM/Petrophysics harness pattern).
//
// Wells/curves/tops come from the shared registry
// (src/lib/wellsRegistry.js — geo_wells, geo_wells_logs, geo_wells_tops
// with owner-or-org RLS). Section state is app-private
// (geo_correlation_sections, owner-only).

import {
  listWells, listLogs, downloadCurve, listTops,
  saveTop, updateTop, deleteTop, propagateTop,
} from '@/lib/wellsRegistry';
import { listIntervals } from '@/lib/stratRegistry';
import { loadSection, saveSection } from '@/lib/sectionsRegistry';

export function makeRegistryBackend() {
  return {
    listWells, listLogs, downloadCurve, listTops, listIntervals,
    saveTop, updateTop, deleteTop, propagateTop,
    loadSection, saveSection,
  };
}
