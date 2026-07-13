// The app's real backend adapter: everything PetroWorkstation touches
// goes through this one object, so the /dev harness can swap in
// inMemoryBackend and the WHOLE app runs without auth or DB (the
// harness philosophy, same as Well Data Manager's pair).
//
// Reads/writes go straight to the shared G1/G2 registry
// (src/lib/wellsRegistry.js): geo_wells, geo_wells_logs (+ f32 curve
// objects), geo_wells_tops, geo_wells_zones — RLS enforces ownership
// and org read-only sharing server-side.

import {
  listWells, listLogs, downloadCurve, listTops,
  listZones, saveZone, updateZone, deleteZone,
} from '@/lib/wellsRegistry';

export function makeRegistryBackend() {
  return {
    listWells,
    listLogs,
    downloadCurve,
    listTops,
    listZones,
    saveZone,
    updateZone,
    deleteZone,
  };
}
