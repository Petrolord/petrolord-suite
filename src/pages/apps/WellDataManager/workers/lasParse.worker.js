// LAS parse worker: runs the parser + import preparation off the main
// thread so a 50 MB LAS never blocks the UI (G1.2 acceptance). All
// numerics live in the engine modules (jest-tested); this file is only
// the postMessage shell (the Seismolord ingest.worker pattern).
//
// Protocol (main -> worker):
//   {type:'parse', id, file}          File/Blob; read + parse + prepare
//   {type:'parse:text', id, text}     already-read text (harness use)
// (worker -> main):
//   {type:'parse:done', id, meta, prep}   curve Float32Arrays transferred
//   {type:'error', id, message}
//
// meta  = parseLas output minus the sample arrays (header preview);
// prep  = prepareLogs output, SI-converted, arrays transferred.

import { parseLas } from '../engine/lasParse';
import { prepareLogs, suggestWellHeader } from '../engine/lasImport';

function run(id, text, sourceFile) {
  const parsed = parseLas(text);
  const prep = prepareLogs(parsed, { sourceFile });
  const meta = {
    version: parsed.version,
    wrap: parsed.wrap,
    nullValue: parsed.nullValue,
    well: parsed.well,
    params: parsed.params,
    depthUnit: parsed.depthUnit,
    suggestedHeader: suggestWellHeader(parsed),
    curves: parsed.curves.map(({ data, ...rest }) => rest),
  };
  const transfers = prep.logs.map((l) => l.data.buffer);
  self.postMessage({ type: 'parse:done', id, meta, prep }, transfers);
}

self.onmessage = async (e) => {
  const { type, id } = e.data || {};
  try {
    if (type === 'parse') {
      run(id, await e.data.file.text(), e.data.file.name || null);
    } else if (type === 'parse:text') {
      run(id, e.data.text, e.data.sourceFile || null);
    }
  } catch (err) {
    self.postMessage({ type: 'error', id, message: err.message || String(err) });
  }
};
