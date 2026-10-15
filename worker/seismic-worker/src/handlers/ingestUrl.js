// ingest_url: fetch a SEG-Y from an https link into the worker's store
// (QI programme Q0b-3, "import from a link"). Clients often deliver data by
// link; the browser never downloads the file. The fetch goes through
// netGuard (https only, public addresses only, pinned connection, vetted
// redirects). The bytes stream straight into an S3 multipart upload in
// 64 MiB parts; the stored size is confirmed, the file is fingerprinted
// exactly as the browser fingerprints a local file (ingestResume.js), and
// a qi_datasets row is registered. A scan_dataset job then gives the import
// dialog its preview.
//
// Since 2026-10-15 (QI round 3): when the link serves byte ranges, nothing is
// copied. The dataset records the link (meta.link: url, size, ETag,
// Last-Modified) and every later read (preview scan, crop plan, conversion)
// asks the link for only the bytes it needs (linkReader.js), so a crop of an
// 80 GB stack reads the crop. A link without ranges is copied as before, and
// copy: true forces the copy. The link's URL was already in the job's params;
// it is kept on the user's own dataset row so later jobs can read it.
//
// params: { url, name?, copy? }
import { JobFailure } from '../runJob.js';
import { projectFrom } from '../project.js';
import { guardedGet, urlProblem } from '../netGuard.js';
import { s3RangeReader } from '../s3.js';
import { probeRanges, linkRangeReader } from '../linkReader.js';
import {
  PART_SIZE, MAX_FILE_BYTES, USER_RAW_QUOTA_BYTES, objectKeyFor, parseUploadId, completeXml,
} from '../../../../supabase/functions/qi-upload-url/logic.ts';
import { fileFingerprint } from '../../../../src/pages/apps/Seismolord/services/ingestResume.js';
import { webcrypto } from 'node:crypto';

const GiB = 1024 ** 3;

/** A file name for the stored object: Content-Disposition, else the URL path. */
export function fileNameFor(finalUrl, disposition) {
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition || '');
  if (m) return decodeURIComponent(m[1]).split(/[\\/]/).pop();
  const last = decodeURIComponent(new URL(finalUrl).pathname.split('/').pop() || '');
  return last || 'download.sgy';
}

/** Where the data came from, without the query (it may carry a signed token). */
export const describeSource = (url) => { const u = new URL(url); return `${u.host}${u.pathname}`; };

/**
 * @param {Object} deps
 * @param {Object} deps.admin
 * @param {Function} deps.sign makeSigner(cfg.s3), worker identity, internal endpoint
 * @param {string} deps.rawBucket
 * @param {Function} [deps.get] guardedGet (tests inject a fake)
 * @param {Function} [deps.fetchImpl]
 * @param {Function} [deps.newId]
 */
export async function ingestUrl(ctx, deps) {
  const p = ctx.params || {};
  const problem = urlProblem(p.url);
  if (problem) throw new JobFailure('validate_failed', problem);
  const uid = ctx.job.user_id;
  const { admin, sign, rawBucket = 'seismic-raw' } = deps;
  const fetchImpl = deps.fetchImpl || fetch;

  const { data: used, error: qErr } = await admin.rpc('qi_user_storage_bytes', { p_user_id: uid });
  if (qErr) throw new Error(`Could not check your storage allowance: ${qErr.message}`);
  const room = USER_RAW_QUOTA_BYTES - Number(used || 0);

  ctx.progress(0, 'Connecting');
  const get = deps.get || guardedGet;
  let got;
  try {
    got = p.copy ? { ranged: false, ...(await get(p.url)) } : await probeRanges(p.url, { get });
  } catch (e) {
    throw new JobFailure('fetch_refused', e.message);
  }
  if (got.ranged) return registerLink(ctx, deps, { url: p.url, name: p.name, probe: got, uid });
  const { res, finalUrl } = got;
  if (res.statusCode !== 200) {
    res.resume?.();
    throw new JobFailure('fetch_failed', `The link answered ${res.statusCode}; it must serve the file directly.`);
  }
  const declared = Number(res.headers['content-length']);
  const known = Number.isFinite(declared) && declared > 0 ? declared : null;
  if (known && known > MAX_FILE_BYTES) { res.destroy?.(); throw new JobFailure('too_large', `The file is ${(known / GiB).toFixed(1)} GiB; the limit is ${MAX_FILE_BYTES / GiB} GiB.`); }
  if (known && known > room) { res.destroy?.(); throw new JobFailure('over_quota', `The file is ${(known / GiB).toFixed(1)} GiB and you have ${(room / GiB).toFixed(1)} GiB of your worker storage allowance left.`); }

  const id = (deps.newId || (() => webcrypto.randomUUID()))();
  const fileName = fileNameFor(finalUrl, res.headers['content-disposition']);
  const key = objectKeyFor(uid, id, fileName);
  const init = await fetchImpl(await sign('POST', rawBucket, key, { uploads: '' }), { method: 'POST' });
  const uploadId = init.ok ? parseUploadId(await init.text()) : null;
  if (!uploadId) { res.destroy?.(); throw new Error(`The store refused to start the upload (${init.status}).`); }
  const abort = async () => { try { await fetchImpl(await sign('DELETE', rawBucket, key, { uploadId }), { method: 'DELETE' }); } catch { /* best effort */ } };

  const parts = [];
  let buffered = [];
  let bufferedBytes = 0;
  let total = 0;
  const putPart = async (bytes) => {
    const n = parts.length + 1;
    const r = await fetchImpl(await sign('PUT', rawBucket, key, { partNumber: String(n), uploadId }), { method: 'PUT', body: bytes });
    if (!r.ok) throw new Error(`Storing part ${n} failed (${r.status}).`);
    parts.push({ partNumber: n, etag: r.headers.get('etag') });
  };
  const flush = async (all) => {
    while (bufferedBytes >= PART_SIZE || (all && bufferedBytes > 0)) {
      const take = all ? Math.min(bufferedBytes, PART_SIZE) : PART_SIZE;
      const out = new Uint8Array(take);
      let at = 0;
      while (at < take) {
        const c = buffered[0];
        const need = take - at;
        if (c.length <= need) { out.set(c, at); at += c.length; buffered.shift(); } else { out.set(c.subarray(0, need), at); buffered[0] = c.subarray(need); at += need; }
      }
      bufferedBytes -= take;
      await putPart(out);
    }
  };

  try {
    for await (const chunk of res) {
      if (ctx.cancelled) { res.destroy?.(); await abort(); return null; }
      const c = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
      total += c.length;
      if (total > MAX_FILE_BYTES) throw new JobFailure('too_large', `The file is larger than the ${MAX_FILE_BYTES / GiB} GiB limit.`);
      if (total > room) throw new JobFailure('over_quota', `The file is larger than the ${(room / GiB).toFixed(1)} GiB left in your worker storage allowance.`);
      buffered.push(c);
      bufferedBytes += c.length;
      if (bufferedBytes >= PART_SIZE) await flush(false);
      ctx.progress(known ? 0.95 * (total / known) : 0.5, `Fetched ${(total / GiB).toFixed(2)} GiB${known ? ` of ${(known / GiB).toFixed(2)} GiB` : ''}`);
    }
    await flush(true);
    if (known && total !== known) throw new JobFailure('fetch_failed', `The link sent ${total} bytes but declared ${known}.`);
    if (total === 0) throw new JobFailure('fetch_failed', 'The link sent an empty file.');
    const done = await fetchImpl(await sign('POST', rawBucket, key, { uploadId }), { method: 'POST', body: completeXml(parts) });
    if (!done.ok) throw new Error(`The store could not assemble the file (${done.status}).`);
  } catch (e) {
    res.destroy?.();
    await abort();
    throw e;
  } finally {
    buffered = [];
  }

  // the browser's own fingerprint, from three ranged reads of the stored file
  const reader = s3RangeReader({ sign, bucket: rawBucket, key, size: total, fetchImpl });
  const pseudoFile = { size: total, slice: (a, b) => ({ arrayBuffer: () => reader.read(a, b - a) }) };
  const fingerprint = await fileFingerprint(pseudoFile, (bytes) => webcrypto.subtle.digest('SHA-256', bytes));

  const name = typeof p.name === 'string' && p.name.trim() ? p.name.trim().slice(0, 200) : fileName.slice(0, 200);
  const { error } = await admin.from('qi_datasets').insert({
    id, user_id: uid, ...projectFrom(ctx.job), name, kind: 'segy_upload', status: 'uploaded', original_filename: fileName.slice(0, 500),
    bucket: rawBucket, object_key: key, bytes: total, part_size: PART_SIZE, part_count: Math.max(1, parts.length),
    upload_id: null, uploaded_at: new Date().toISOString(), meta: { fingerprint, source: describeSource(finalUrl) },
  });
  if (error) throw new Error(`The file is stored but could not be registered: ${error.message}`);
  ctx.progress(1, 'Fetched');
  return { dataset_id: id, bytes: total, file_name: fileName, fingerprint };
}

/**
 * A link that serves ranges: register it without copying (the dataset's
 * reads go to the link, datasetReader.js). The fingerprint is the browser's,
 * from three ranged reads.
 */
async function registerLink(ctx, deps, { url, name: given, probe, uid }) {
  const { admin, rawBucket = 'seismic-raw' } = deps;
  const size = probe.size;
  if (size > MAX_FILE_BYTES) throw new JobFailure('too_large', `The file is ${(size / GiB).toFixed(1)} GiB; the limit is ${MAX_FILE_BYTES / GiB} GiB.`);
  const id = (deps.newId || (() => webcrypto.randomUUID()))();
  const fileName = fileNameFor(probe.finalUrl, probe.headers['content-disposition']);
  ctx.progress(0.3, 'The link serves parts of the file; reading only what the import needs');
  const reader = linkRangeReader({ url, size, version: probe.version, get: deps.get || guardedGet });
  const pseudoFile = { size, slice: (a, b) => ({ arrayBuffer: () => reader.read(a, b - a) }) };
  const fingerprint = await fileFingerprint(pseudoFile, (bytes) => webcrypto.subtle.digest('SHA-256', bytes));
  const name = typeof given === 'string' && given.trim() ? given.trim().slice(0, 200) : fileName.slice(0, 200);
  const link = { url, size, etag: probe.version.etag, last_modified: probe.version.last_modified, linked_at: new Date().toISOString() };
  const { error } = await admin.from('qi_datasets').insert({
    id, user_id: uid, ...projectFrom(ctx.job), name, kind: 'segy_upload', status: 'uploaded', original_filename: fileName.slice(0, 500),
    // no object is stored: the key is unique and names where a copy would go
    bucket: rawBucket, object_key: objectKeyFor(uid, id, fileName), bytes: size, part_size: PART_SIZE, part_count: 1,
    upload_id: null, uploaded_at: new Date().toISOString(), meta: { fingerprint, source: describeSource(probe.finalUrl), link },
  });
  if (error) throw new Error(`The link could not be registered: ${error.message}`);
  ctx.progress(1, 'Linked');
  return { dataset_id: id, bytes: size, file_name: fileName, fingerprint, linked: true, fetched_bytes: reader.stats.bytes };
}
