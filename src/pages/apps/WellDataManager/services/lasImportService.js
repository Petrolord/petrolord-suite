// Main-thread facade over the LAS parse worker: one promise per file,
// worker torn down when it settles. Import pipeline end-to-end:
//   parseLasFile(file)      -> {meta, prep}   (off-thread parse + SI prep)
//   importParsedLas(...)    -> well + logs persisted via wellsService
// UI (G1.3) confirms the header/mnemonic mapping between the two calls.

import { saveWell, saveLogs } from '@/lib/wellsRegistry';

const makeWorker = () =>
  new Worker(new URL('../workers/lasParse.worker.js', import.meta.url), { type: 'module' });

let nextId = 1;

/**
 * Parse + SI-prepare a LAS file off the main thread.
 * @param {File|Blob} file
 * @returns {Promise<{meta: Object, prep: Object}>} rejects with the
 *   engine's line-numbered domain Error messages.
 */
export function parseLasFile(file) {
  return new Promise((resolve, reject) => {
    const worker = makeWorker();
    const id = nextId++;
    const done = (fn, arg) => { worker.terminate(); fn(arg); };
    worker.onmessage = (e) => {
      if (e.data?.id !== id) return;
      if (e.data.type === 'parse:done') done(resolve, { meta: e.data.meta, prep: e.data.prep });
      else if (e.data.type === 'error') done(reject, new Error(e.data.message));
    };
    worker.onerror = (e) => done(reject, new Error(e.message || 'LAS parse worker failed.'));
    worker.postMessage({ type: 'parse', id, file });
  });
}

/**
 * Persist a confirmed LAS import: create the well (or use wellId to add
 * logs to an existing one), then store every selected curve.
 *
 * @param {{header?: Object, wellId?: string, logs: Array}} confirmed
 *   header: saveWell payload (new well); wellId: existing well target;
 *   logs: prepareLogs entries the user kept after mapping.
 * @returns {Promise<{well: ?Object, logs: Array}>}
 */
export async function importParsedLas(confirmed) {
  let well = null;
  let wellId = confirmed.wellId;
  if (!wellId) {
    well = await saveWell(confirmed.header);
    wellId = well.id;
  }
  const logs = await saveLogs(wellId, confirmed.logs);
  return { well, logs };
}
