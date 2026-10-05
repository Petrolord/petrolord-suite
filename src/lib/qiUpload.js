// Resumable large-file upload to the seismic worker's store (QI programme
// Q0, docs/scope/QI-PLAN.md). The browser never holds a storage key: the
// qi-upload-url edge function hands out presigned part URLs and assembles
// the file. A reload resumes: the dataset id is remembered per file
// (name, size, last-modified) and the server's part list says what is left.
//
// Dependencies are injected so the protocol is testable without a network:
//   invoke(body)  -> resolves the function's JSON, or throws { status, message }
//   fetchImpl     -> fetch for the part PUTs
//   storage       -> localStorage-like (getItem/setItem/removeItem); may throw
import { supabase } from '@/lib/customSupabaseClient';

export const UPLOAD_FUNCTION = 'qi-upload-url';
const KEY_PREFIX = 'qi-upload:';
const SIGN_BATCH = 50;

export const fileFingerprint = (file) => `${file.name}|${file.size}|${file.lastModified || 0}`;

const safeStorage = (storage) => ({
  get: (k) => { try { return storage?.getItem(k) ?? null; } catch { return null; } },
  set: (k, v) => { try { storage?.setItem(k, v); } catch { /* private window: no resume */ } },
  del: (k) => { try { storage?.removeItem(k); } catch { /* ignore */ } },
});

export async function invokeUploadFunction(body) {
  const { data, error } = await supabase.functions.invoke(UPLOAD_FUNCTION, { body });
  if (error) {
    let message = error.message;
    let status = error.context?.status;
    try {
      const j = await error.context?.json?.();
      if (j?.error) message = j.error;
    } catch { /* keep the generic message */ }
    const e = new Error(message);
    e.status = status;
    throw e;
  }
  return data;
}

const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

export async function uploadLargeFile(file, {
  invoke = invokeUploadFunction,
  fetchImpl = (...a) => fetch(...a),
  storage = typeof localStorage === 'undefined' ? null : localStorage,
  onProgress = () => {},
  signal,
  concurrency = 4,
  name,
  organizationId = null,
  sleep = sleepMs,
} = {}) {
  const store = safeStorage(storage);
  const memoKey = KEY_PREFIX + fileFingerprint(file);
  let datasetId = store.get(memoKey);
  let partSize;
  let partCount;
  const done = new Set();

  if (datasetId) {
    try {
      const r = await invoke({ action: 'parts', dataset_id: datasetId });
      partSize = r.part_size;
      partCount = r.part_count;
      for (const p of r.parts || []) {
        const expected = p.partNumber < partCount ? partSize : file.size - partSize * (partCount - 1);
        if (p.size === expected) done.add(p.partNumber);
      }
    } catch (e) {
      if (e.status === 404 || e.status === 409 || e.status === 403) { store.del(memoKey); datasetId = null; } else throw e;
    }
  }
  if (!datasetId) {
    const r = await invoke({ action: 'start', filename: file.name, bytes: file.size, name: name || file.name, organization_id: organizationId });
    datasetId = r.dataset_id;
    partSize = r.part_size;
    partCount = r.part_count;
    store.set(memoKey, datasetId);
  }

  const sizeOf = (n) => (n < partCount ? partSize : file.size - partSize * (partCount - 1));
  let bytesDone = [...done].reduce((a, n) => a + sizeOf(n), 0);
  const report = () => onProgress({ datasetId, bytesDone, bytesTotal: file.size, partsDone: done.size, partCount });
  report();

  const queue = [];
  for (let n = 1; n <= partCount; n += 1) if (!done.has(n)) queue.push(n);
  const urls = new Map();

  async function urlFor(n, fresh = false) {
    if (!fresh && urls.has(n)) return urls.get(n);
    const want = [n, ...queue.filter((q) => !urls.has(q)).slice(0, SIGN_BATCH - 1)];
    const r = await invoke({ action: 'sign', dataset_id: datasetId, part_numbers: want });
    for (const [k, v] of Object.entries(r.urls || {})) urls.set(Number(k), v);
    if (!urls.has(n)) throw new Error(`No upload address for part ${n}.`);
    return urls.get(n);
  }

  async function putPart(n) {
    const start = (n - 1) * partSize;
    const blob = file.slice(start, start + sizeOf(n));
    for (let attempt = 1; ; attempt += 1) {
      if (signal?.aborted) throw new DOMException('Upload paused', 'AbortError');
      const url = await urlFor(n, attempt > 1);
      let resp;
      try {
        resp = await fetchImpl(url, { method: 'PUT', body: blob, signal });
      } catch (e) {
        if (e?.name === 'AbortError') throw e;
        resp = null;
      }
      if (resp?.ok) return;
      if (attempt >= 4) throw new Error(`Part ${n} failed to upload (${resp ? resp.status : 'network error'}).`);
      await sleep(1000 * 2 ** (attempt - 1));
    }
  }

  async function worker() {
    while (queue.length) {
      const n = queue.shift();
      await putPart(n);
      done.add(n);
      bytesDone += sizeOf(n);
      report();
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, queue.length || 1)) }, worker));

  const { dataset } = await invoke({ action: 'complete', dataset_id: datasetId });
  store.del(memoKey);
  return dataset;
}

// Gives up an unfinished upload and frees its parts on the server.
export async function abandonUpload(file, { invoke = invokeUploadFunction, storage = typeof localStorage === 'undefined' ? null : localStorage } = {}) {
  const store = safeStorage(storage);
  const memoKey = KEY_PREFIX + fileFingerprint(file);
  const id = store.get(memoKey);
  store.del(memoKey);
  if (id) await invoke({ action: 'abort', dataset_id: id });
}
