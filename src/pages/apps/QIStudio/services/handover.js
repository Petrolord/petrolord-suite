// Handover files of a QI study (QI programme Q11, 2026-10-07; SOW section
// 12): the wavelets as text, and the run record of every worker product
// (what was run, with which settings, on which inputs, by which engine), so
// a result can be reproduced and audited. SEG-Y of the volumes comes from the
// seismic worker (export_segy); LAS of the logs from Well Data Manager. Pure
// apart from `downloadText`.

export const RUN_RECORD_CONTRACT = 'qi-run-record-1';

/** A wavelet as a two-column text file (time in ms, amplitude), with a header of comment lines. */
export function waveletText({ name, dtMs, samples, source = '' }) {
  if (!(dtMs > 0) || !samples?.length) throw new Error('The wavelet has no samples.');
  const c = (samples.length - 1) / 2;
  const lines = [
    `# Petrolord QI Studio wavelet: ${name}`,
    ...(source ? [`# Source: ${source}`] : []),
    `# ${samples.length} samples at ${dtMs} ms, time zero at the centre sample`,
    '# time_ms amplitude',
    ...Array.from(samples, (v, i) => `${((i - c) * dtMs).toFixed(3)} ${Number(v).toPrecision(8)}`),
  ];
  return `${lines.join('\n')}\n`;
}

/** FNV-1a 32-bit of a string, as hex: a fingerprint to tell inputs apart, not a security hash. */
export function fingerprint(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/** The job's settings with every long numeric array replaced by its length and fingerprint. */
export function compactParams(value) {
  if (Array.isArray(value)) {
    if (value.length > 64 && value.every((v) => v === null || typeof v === 'number')) {
      return { values: value.length, fingerprint: fingerprint(JSON.stringify(value)) };
    }
    return value.map(compactParams);
  }
  // a packed well log (logPacking.js) is recorded the same way
  if (value && value.packed === 1 && typeof value.q === 'string') return { values: value.ns, fingerprint: fingerprint(value.q) };
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, compactParams(v)]));
  return value;
}

/** The run record of a worker job (a qi_jobs row). */
export function runRecord(job, { app = 'QI Studio', build = null, now = new Date().toISOString() } = {}) {
  if (!job?.id) throw new Error('No job to record.');
  const r = job.result_refs || {};
  return {
    contract: RUN_RECORD_CONTRACT,
    app,
    build,
    job: {
      id: job.id, kind: job.kind, status: job.status,
      queued_at: job.queued_at || null, started_at: job.started_at || null, finished_at: job.finished_at || null,
      engine_commit: job.engine_commit || null, attempt: job.attempt ?? null,
    },
    settings: compactParams(job.params || {}),
    inputs: job.input_refs || {},
    outputs: {
      volume_ids: r.volume_ids || (r.volume_id ? { volume: r.volume_id } : {}),
      ...(r.settings ? { recorded_settings: r.settings } : {}),
    },
    checks: compactParams({ blind: r.blind || undefined, sensitivity: r.sensitivity || undefined, rows: r.rows || undefined }),
    written_at: now,
  };
}

/** Save text as a file in the browser. */
export function downloadText(fileName, text, type = 'text/plain') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
