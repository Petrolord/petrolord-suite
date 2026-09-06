// The real backend adapter for Stratigraphy Studio (ST0): everything the
// workstation touches goes through this one object, so the /dev harness
// swaps in inMemoryBackend and the whole app runs without auth or DB (the
// Well Correlation / Petrophysics harness pattern).
//
// Wells and tops come from the shared registry (src/lib/wellsRegistry.js:
// geo_wells, geo_wells_tops with the ST0 typed-surface columns); the
// stratigraphic column from src/lib/stratRegistry.js (geo_strat_units).
// No app-local Supabase calls against registry tables (plan section 4).

import { listWells, listTops, updateTop } from '@/lib/wellsRegistry';
import {
  listUnits, saveUnit, updateUnit, deleteUnit,
  listIntervals, replaceIntervals, listCoreImages, uploadCoreImage, updateCoreImage, deleteCoreImage, coreImageUrl,
} from '@/lib/stratRegistry';

export function makeRegistryBackend() {
  return {
    listWells, listTops, updateTop, listUnits, saveUnit, updateUnit, deleteUnit,
    listIntervals, replaceIntervals, listCoreImages, uploadCoreImage, updateCoreImage, deleteCoreImage, coreImageUrl,
  };
}
