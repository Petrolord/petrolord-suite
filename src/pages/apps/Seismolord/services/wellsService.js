// Seismolord's well persistence — since G1.4 an ADAPTER over the
// shared geo_wells registry (src/lib/wellsRegistry.js, Well Data
// Manager's tables): same three exports, same row shapes the viewers
// consume, zero viewer changes. Wells imported in Well Data Manager
// appear here with no re-import, and org-shared wells arrive read-only
// (deletes on them surface the registry's owner-only error).
//
// Shape bridging: the registry normalizes tops into geo_wells_tops
// rows ({name, md_m}); Seismolord's engines (wellSection, wellTie)
// consume the legacy jsonb shape ({name, md}) attached to the well
// row, so the adapter converts on both directions. deviation and
// checkshots are byte-compatible and pass straight through.
//   deviation:  [{md, inc, azi}]   md ascending (validated at import)
//   tops:       [{name, md}]
//   checkshots: [{tvdss_m, twt_ms}] strictly monotonic (validated)

import {
  saveWell as registrySaveWell,
  listWellsWithTops,
  replaceTops,
  deleteWell as registryDeleteWell,
  listLogs as registryListLogs,
  downloadCurve as registryDownloadCurve,
  updateWell,
} from '@/lib/wellsRegistry';

const legacyTops = (tops) => (tops || []).map((t) => ({ name: t.name, md: t.md_m }));

/**
 * @param {{name: string, uwi?: ?string, surfaceX: number, surfaceY: number,
 *   kbM?: number, tdMdM?: ?number, crsNote?: ?string, unitsNote?: ?string,
 *   deviation?: Array, tops?: Array, checkshots?: Array}} w
 */
export async function saveWell(w) {
  const well = await registrySaveWell({
    name: w.name,
    uwi: w.uwi,
    surfaceX: w.surfaceX,
    surfaceY: w.surfaceY,
    kbM: w.kbM,
    tdMdM: w.tdMdM,
    crs: w.crs,
    xyUnit: w.xyUnit,
    crsProvenance: w.crsProvenance,
    crsNote: w.crsNote,
    unitsNote: w.unitsNote,
    deviation: w.deviation || [],
    checkshots: w.checkshots || [],
  });
  const tops = w.tops?.length ? await replaceTops(well.id, w.tops) : [];
  return { ...well, tops: legacyTops(tops) };
}

export async function listWells() {
  const wells = await listWellsWithTops();
  return wells.map((w) => ({ ...w, tops: legacyTops(w.tops) }));
}

export async function deleteWell(well) {
  return registryDeleteWell(well);
}

// LAS log access for the synthetics window (G5): metadata rows
// ({mnemonic, unit, start_md_m, stop_md_m, step_m — null = irregular,
// n_samples, storage_path, …}) and float32 curve samples. Registry
// shapes pass straight through; the UI never imports wellsRegistry
// directly (adapter rule).

/** @param {string} wellId @returns {Promise<Array>} geo_wells_logs rows */
export async function listLogs(wellId) {
  return registryListLogs(wellId);
}

/** @param {Object} log a listLogs row @returns {Promise<Float32Array>} */
export async function downloadCurve(log) {
  return registryDownloadCurve(log);
}

/**
 * W3.3 well tie 2.0: the effective checkshot set — a committed
 * tie-derived set wins over imported checkshots when present (imported
 * data itself is never touched).
 * @returns {{rows: Array, derived: boolean}}
 */
export function effectiveCheckshots(well) {
  const d = well?.checkshots_derived;
  if (Array.isArray(d?.rows) && d.rows.length >= 2) {
    return { rows: d.rows, derived: true };
  }
  return { rows: well?.checkshots || [], derived: false };
}

/** Persist (or clear, with null) a well's derived checkshot set. */
export async function saveDerivedCheckshots(wellId, payload) {
  return updateWell(wellId, { checkshots_derived: payload });
}
