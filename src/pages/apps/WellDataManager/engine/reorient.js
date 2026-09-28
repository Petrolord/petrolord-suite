// Curves stored bottom-up by earlier releases (AppUpgrade WDM-U2-010,
// finding WDM-U1-032). Before Step 1 the LAS door stored a file logged
// bottom-up as it came: depth DEcreasing, start_md_m deeper than
// stop_md_m, step null. New imports are reversed at the door
// (engine/lasIndex.js orientLasIndex); rows already stored stay as they
// were. This module fixes them without any schema change:
//
//   on read     orientForDisplay() hands the quick view an ascending copy,
//               so the well reads correctly here even before a repair
//               (and for read-only org wells, which only the owner can fix)
//   repair      planReorient() reverses every bottom-up curve of a well in
//               place (same log ids, so Petrophysics' input_log_ids and
//               Well Correlation's references keep pointing at them),
//               swaps start and stop, recomputes the step from the reversed
//               depth curve and records the repair in provenance
//
// Pure functions, no I/O.

import { uniformStepM } from './lasImport';
import { isDepthAlias } from './lasIndex';

const has = (v) => v !== null && v !== undefined && Number.isFinite(Number(v));

/** Logs whose metadata says depth decreases (start deeper than stop). */
export const bottomUpLogs = (logs) => (logs || []).filter((l) => has(l.start_md_m) && has(l.stop_md_m) && Number(l.start_md_m) > Number(l.stop_md_m));

const reversed = (data) => Float32Array.from(data).reverse();

/** Step of an ascending depth vector: the mean spacing when the spacing is
 *  uniform (uniformStepM's float32 tolerance), else null. The first
 *  difference alone carries float32 jitter (0.15234 for a 0.1524 m log). */
function stepOf(depth) {
  if (uniformStepM(depth) == null) return null;
  return (depth[depth.length - 1] - depth[0]) / (depth.length - 1);
}

/**
 * The ascending view of one stored curve for plotting. A curve already
 * ascending comes back untouched (same objects).
 * @param {Object} log registry row @param {Float32Array} data
 * @param {?Float32Array} [depthData] samples of the well's depth curve (to recompute the step)
 */
export function orientForDisplay(log, data, depthData = null) {
  if (!(has(log.start_md_m) && has(log.stop_md_m) && Number(log.start_md_m) > Number(log.stop_md_m))) return { log, data, reoriented: false };
  let step = null;
  if (depthData && depthData.length === data.length) step = stepOf(reversed(depthData));
  return {
    log: { ...log, start_md_m: Number(log.stop_md_m), stop_md_m: Number(log.start_md_m), step_m: step },
    data: reversed(data),
    reoriented: true,
  };
}

/**
 * Repair plan for one well: every bottom-up curve reversed in place.
 * @param {Object[]} logs registry rows of the well
 * @param {Map<string, Float32Array>} dataById samples of every bottom-up log
 * @param {{now?: Date}} [opts]
 * @returns {{writes: {log: Object, data: Float32Array, patch: Object}[], startMdM: ?number, stopMdM: ?number, stepM: ?number}}
 */
export function planReorient(logs, dataById, { now = new Date() } = {}) {
  const todo = bottomUpLogs(logs);
  if (!todo.length) return { writes: [], startMdM: null, stopMdM: null, stepM: null };
  const depth = todo.find((l) => isDepthAlias(l.mnemonic));
  const depthData = depth ? dataById.get(depth.id) : null;
  const stepAll = depthData ? stepOf(reversed(depthData)) : null;
  const writes = todo.map((l) => {
    const data = dataById.get(l.id);
    if (!data) throw new Error(`The samples of ${l.mnemonic} are not loaded.`);
    if (data.length !== Number(l.n_samples)) throw new Error(`${l.mnemonic}: ${data.length} samples stored, the row says ${l.n_samples}. Re-import this log.`);
    const sameGrid = depth && Number(l.n_samples) === Number(depth.n_samples);
    return {
      log: l,
      data: reversed(data),
      patch: {
        start_md_m: Number(l.stop_md_m),
        stop_md_m: Number(l.start_md_m),
        step_m: sameGrid ? stepAll : l.step_m ?? null,
        provenance: {
          ...(l.provenance || {}),
          reversed_from_bottom_up: true,
          reoriented_at: now.toISOString(),
          reoriented_by: 'well-data-manager',
        },
      },
    };
  });
  return {
    writes,
    startMdM: Math.min(...writes.map((w) => w.patch.start_md_m)),
    stopMdM: Math.max(...writes.map((w) => w.patch.stop_md_m)),
    stepM: stepAll,
  };
}
