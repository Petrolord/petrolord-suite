// The gauge import worker's message protocol (WTA-U2-010, 2026-10-04).
// Pure: the worker file only wires `self` to `handleGaugeMessage`, so jest
// runs the exact code the worker runs, and the page falls back to it on
// its own thread where no Worker exists.
//
// WTA-U1-020: a 388,800-reading date-stamped file froze the page for 27 s
// while it was read on the main thread. The reading now runs in a Web
// Worker that keeps the parsed table; the page holds only the headers and
// the converted rows, shows progress, and Cancel terminates the worker.
//
// Messages in:  { type: 'read', id, text, defaults: { defaultPressure, defaultTemperature } }
//               { type: 'convert', id, mapping }   (re-read the kept table with another mapping)
// Messages out: { type: 'progress', id, stage: 'reading' | 'converting', done, total }
//               { type: 'done', id, table: { headers, columnCount, rowCount, decimal }, mapping, result }
//                 (from the worker, result.rows is null and result.packed holds the rows as
//                 transferred Float64Arrays; the client unpacks them)
//               { type: 'error', id, message }
// result is convertGaugeRows' { rows, skipped, temperatureCount, dateQuestion? }.

import { readGaugeTable, detectGaugeMapping, convertGaugeRows } from './gaugeImport.js';

/**
 * Rows as three Float64Arrays (t, p, T with NaN where a row has no
 * temperature), so the worker can hand them over without a copy; the page
 * unpacks them into the { t, p, T? } rows the studio keeps.
 */
export function packRows(rows) {
  const n = rows.length;
  const t = new Float64Array(n); const p = new Float64Array(n); const T = new Float64Array(n);
  for (let i = 0; i < n; i += 1) { t[i] = rows[i].t; p[i] = rows[i].p; T[i] = rows[i].T === undefined ? NaN : rows[i].T; }
  return { t, p, T };
}
export function unpackRows({ t, p, T }) {
  const out = new Array(t.length);
  for (let i = 0; i < t.length; i += 1) out[i] = Number.isNaN(T[i]) ? { t: t[i], p: p[i] } : { t: t[i], p: p[i], T: T[i] };
  return out;
}

/** The part of a table the page needs for the mapping card (no rows). */
export const lightTable = (table) => ({
  headers: table.headers, columnCount: table.columnCount, rowCount: table.rows.length, decimal: table.decimal,
});

/**
 * A stateful handler: it keeps the last table read, so a mapping change
 * re-converts without sending the file again.
 * @returns {(msg: object, post: (m: object) => void) => void}
 */
export function createGaugeHandler({ packed = false } = {}) {
  let kept = null;
  return (msg, post) => {
    if (!msg || (msg.type !== 'read' && msg.type !== 'convert')) return;
    const { id } = msg;
    const progress = (stage) => (done, total) => post({ type: 'progress', id, stage, done, total });
    try {
      let mapping = msg.mapping;
      if (msg.type === 'read') {
        post({ type: 'progress', id, stage: 'reading', done: 0, total: 1 });
        kept = readGaugeTable(msg.text);
        mapping = { ...detectGaugeMapping(kept, msg.defaults || {}), ...(msg.mapping || {}) };
      } else if (!kept) {
        post({ type: 'error', id, message: 'No gauge file is held; import it again.' });
        return;
      }
      const result = kept.rows.length ? convertGaugeRows(kept, mapping, { onProgress: progress('converting') }) : { rows: [], skipped: 0, temperatureCount: 0 };
      if (packed) {
        // in the worker: the rows travel as transferable arrays
        const cols = packRows(result.rows);
        post({ type: 'done', id, table: lightTable(kept), mapping, result: { ...result, rows: null, packed: cols } }, [cols.t.buffer, cols.p.buffer, cols.T.buffer]);
      } else {
        post({ type: 'done', id, table: lightTable(kept), mapping, result });
      }
    } catch (e) {
      post({ type: 'error', id, message: e?.message || String(e) });
    }
  };
}
