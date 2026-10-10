// Well logs in a worker job's settings, packed (2026-10-10). qi_enqueue caps
// a job's settings at 64 KB; a log on the volume's time axis is one number per
// sample with gaps (NaN) outside the logged interval, so four wells with AI,
// SI and density as JSON numbers came to well over that (the Ekene demo hit
// "Job settings are too large"). A packed log keeps only the logged interval
// and stores it as 16-bit steps between its least and greatest value, base64.
// The step is (range / 65534): for a log of ln(impedance), a range of 2
// gives steps of 3e-5, which is 0.003 percent in impedance. Logs that are
// whole numbers (facies codes) are stored exactly, one step per unit.
// The worker reads both forms, so a client that sends plain arrays still works.

const GAP = -32768;
const MID = 32767;

const toBase64 = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromBase64 = (text) => {
  const s = atob(text);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
};

/** A log (numbers, NaN or null for gaps) to {packed, ns, i0, n, lo, step, q}. */
export function packLog(values) {
  const ns = values.length;
  let i0 = -1; let i1 = -1; let lo = Infinity; let hi = -Infinity; let whole = true;
  for (let i = 0; i < ns; i++) {
    const v = values[i];
    if (v == null || !Number.isFinite(v)) continue;
    if (i0 < 0) i0 = i;
    i1 = i;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
    if (whole && !Number.isInteger(v)) whole = false;
  }
  if (i0 < 0) return { packed: 1, ns, i0: 0, n: 0, lo: 0, step: 1, q: '' };
  const step = whole && hi - lo <= 65534 ? 1 : (hi - lo) / 65534 || 1;
  const n = i1 - i0 + 1;
  const q = new Int16Array(n);
  for (let k = 0; k < n; k++) {
    const v = values[i0 + k];
    q[k] = v == null || !Number.isFinite(v) ? GAP : Math.round((v - lo) / step) - MID;
  }
  return { packed: 1, ns, i0, n, lo, step, q: toBase64(new Uint8Array(q.buffer)) };
}

/** A packed log or a plain array back to an array of numbers with NaN gaps. */
export function unpackLog(log) {
  if (Array.isArray(log)) return log.map((v) => (v != null && Number.isFinite(v) ? v : NaN));
  if (!log || log.packed !== 1) throw new Error('A well log in the job settings is neither an array nor a packed log.');
  const out = new Array(log.ns).fill(NaN);
  if (!log.n) return out;
  const bytes = fromBase64(log.q);
  if (bytes.length !== 2 * log.n) throw new Error('A packed well log is damaged (its length does not match).');
  const q = new Int16Array(bytes.buffer, bytes.byteOffset, log.n);
  for (let k = 0; k < log.n; k++) if (q[k] !== GAP) out[log.i0 + k] = log.lo + (q[k] + MID) * log.step;
  return out;
}

/**
 * The job settings with the wells' logs under params[key] unpacked, so the
 * validators and the run see plain arrays whichever form the client sent.
 */
export function withUnpackedLogs(params, key, logKeys) {
  const block = params?.[key];
  if (!block || !Array.isArray(block.wells)) return params;
  const wells = block.wells.map((w) => {
    if (!w || typeof w !== 'object') return w;
    const out = { ...w };
    for (const k of logKeys) if (w[k] != null) out[k] = unpackLog(w[k]);
    return out;
  });
  return { ...params, [key]: { ...block, wells } };
}
