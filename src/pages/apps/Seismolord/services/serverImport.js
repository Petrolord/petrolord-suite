// Server import of a SEG-Y (QI programme Q0; Q0b makes it the default for
// large surveys). The file goes straight to the seismic worker's store by
// resumable multipart upload; once it is all there, the volume row is
// registered exactly as a browser import registers it (prepareV4Row) and a
// stack_to_v4 job converts it on the server with the same code. Upload first,
// register second: an interrupted upload leaves no half-made volume, and
// picking the same file again resumes from the parts already stored.
import { uploadLargeFile } from '@/lib/qiUpload';
import { enqueueJob, watchJob } from '@/lib/qiService';
import { prepareV4Row } from './importJobsRuntime';
import { fileFingerprint } from './ingestResume';
import { supabase } from '@/lib/customSupabaseClient';

/** Drop a just-registered volume row whose conversion job was never queued (it holds no storage yet). */
async function discardRow(volumeId) {
  await supabase.from('seismic_volumes').delete().eq('id', volumeId);
}

/**
 * Queue the conversion of a registered row. If the queue refuses it (four
 * jobs already queued or running, the daily limit), the row is removed,
 * because nothing would ever convert it and it would sit in "converting".
 */
async function enqueueConversion(enqueue, params, prep, deps) {
  try {
    return await enqueue('stack_to_v4', params);
  } catch (e) {
    try { await (deps.discard || discardRow)(prep.volumeId); } catch { /* best effort: the error below is what matters */ }
    throw e;
  }
}

const GiB = 1024 ** 3;

/** Size from which the dialog recommends the server import. */
export const SERVER_IMPORT_SUGGEST_BYTES = 2 * GiB;

/**
 * Whether to offer the server import, and whether to choose it by default.
 * @param {number} fileSize
 * @param {?{ok: boolean, reason?: string}} v4Support local v4 import support
 */
export function serverImportAdvice(fileSize, v4Support) {
  if (!Number.isFinite(fileSize) || fileSize <= 0) return { offer: false, preferred: false, reason: null };
  if (fileSize >= SERVER_IMPORT_SUGGEST_BYTES) {
    return { offer: true, preferred: true, reason: 'large' };
  }
  if (v4Support && !v4Support.ok) return { offer: true, preferred: true, reason: 'browser' };
  return { offer: true, preferred: false, reason: null };
}

/**
 * @param {Object} p
 * @param {File} p.file
 * @param {Object} p.mapping byte positions the user confirmed
 * @param {Object} p.scan the preview scan (scanGeometry result)
 * @param {?string} p.nativeCrs
 * @param {string} [p.name]
 * @param {(p: {bytesDone: number, bytesTotal: number}) => void} [p.onUploadProgress]
 * @param {AbortSignal} [p.signal] pauses the upload (it resumes next time)
 * @param {?Object} [p.crop] crop before upload: {fileLike (the cropped file,
 *   cropImport.cropFileLike), scan (the preview scan of its conversion view),
 *   padTop (samples above the window), provenance}. Only the cropped file is
 *   uploaded; the server pads the top back so the volume keeps 0 ms.
 * @param {Object} [deps] injected for tests: upload, prepare, enqueue
 * @returns {Promise<{jobId: string, volumeId: string, datasetId: string}>}
 */
export async function startServerImport({
  file, mapping, scan, nativeCrs, name, onUploadProgress, signal, crop = null, vertical = null,
}, deps = {}) {
  const upload = deps.upload || uploadLargeFile;
  const prepare = deps.prepare || prepareV4Row;
  const enqueue = deps.enqueue || enqueueJob;
  // the same sampled fingerprint the volume row records: with it the server
  // resumes this user's unfinished upload of the file from any browser
  const fingerprint = deps.fingerprint || fileFingerprint;
  const sent = crop ? crop.fileLike : file;
  const dataset = await upload(sent, { name: name || file.name, onProgress: onUploadProgress, signal, fingerprint });
  // the row records the source file's name; its size and fingerprint are the uploaded file's
  const v = vertical ? { vertical } : {};
  const prep = await prepare(crop
    ? { file: { ...sent, name: file.name }, mapping, nativeCrs, name, crop: crop.provenance, ...v }
    : { file, mapping, nativeCrs, name, ...v });
  const jobId = await enqueueConversion(enqueue, {
    dataset_id: dataset.id,
    volume_id: prep.volumeId,
    name: prep.name,
    file_name: file.name,
    scan: crop ? crop.scan : scan,
    crs_plan: prep.crsPlan,
    custom_defs: prep.customDefs || {},
    ingest_rec: prep.ingestRec,
    ...(crop ? { pad_top_samples: crop.padTop, crop_provenance: crop.provenance } : {}),
  }, prep, deps);
  return { jobId, volumeId: prep.volumeId, datasetId: dataset.id };
}

/**
 * Upload only (prestack gathers for QI Studio, with or without a crop): the
 * file goes to the worker store and stops there; QI Studio's Prestack tab
 * builds the gather store from it.
 */
export async function uploadForQi({ file, name, onUploadProgress, signal, crop = null }, deps = {}) {
  const upload = deps.upload || uploadLargeFile;
  const fingerprint = deps.fingerprint || fileFingerprint;
  const sent = crop ? crop.fileLike : file;
  const dataset = await upload(sent, { name: name || file.name, onProgress: onUploadProgress, signal, fingerprint });
  return { datasetId: dataset.id, name: dataset.name };
}

/** Resolves a job's final row once it leaves queued/running; onUpdate sees every poll. */
export function waitForJob(jobId, { onUpdate = () => {}, watch = watchJob, intervalMs = 3000 } = {}) {
  return new Promise((resolve, reject) => {
    const stop = watch(jobId, (job, err) => {
      if (err) return; // transient read error: keep polling
      onUpdate(job);
      if (job && job.status !== 'queued' && job.status !== 'running') {
        stop();
        if (job.status === 'succeeded') resolve(job);
        else reject(Object.assign(new Error(job.error_message || `The server job ${job.status}.`), { stage: job.failure_stage, status: job.status }));
      }
    }, { intervalMs });
  });
}

/**
 * Import from a link, step 1: the worker registers the link (a server that
 * serves byte ranges: later jobs read only what they need from it) or
 * fetches the file into its store. Resolves the remote file the dialog works
 * with from then on.
 */
export async function fetchFromLink({ url, name, onProgress, signalJob }, deps = {}) {
  const enqueue = deps.enqueue || enqueueJob;
  const wait = deps.wait || waitForJob;
  const jobId = await enqueue('ingest_url', { url, ...(name ? { name } : {}) });
  if (signalJob) signalJob(jobId);
  const job = await wait(jobId, { onUpdate: (j) => onProgress && onProgress({ progress: Number(j.progress) || 0, message: j.progress_message }) });
  const r = job.result_refs || {};
  return { remote: true, datasetId: r.dataset_id, name: r.file_name, size: Number(r.bytes), fingerprint: r.fingerprint, linked: Boolean(r.linked), jobId };
}

/** Step 2: the import preview, scanned on the server under the byte mapping. */
export async function scanRemoteFile(remote, mapping, deps = {}) {
  const enqueue = deps.enqueue || enqueueJob;
  const wait = deps.wait || waitForJob;
  const jobId = await enqueue('scan_dataset', { dataset_id: remote.datasetId, mapping });
  const job = await wait(jobId);
  const r = job.result_refs || {};
  return { scan: r.scan, textLines: r.textLines || [], preview: r.preview || [] };
}

/**
 * Step 3: register the row as any import does and convert on the server.
 * With `crop` ({def, definitionId}) the worker keeps only the crop while it
 * reads the stored file: only the kept traces and samples are converted and
 * stored as the volume.
 */
export async function startRemoteConversion({ remote, mapping, scan, nativeCrs, name, crop = null, vertical = null }, deps = {}) {
  const prepare = deps.prepare || prepareV4Row;
  const enqueue = deps.enqueue || enqueueJob;
  const prep = await prepare({
    file: { name: remote.name, size: crop?.estimatedBytes || remote.size }, mapping, nativeCrs, name, fingerprint: remote.fingerprint, ...(vertical ? { vertical } : {}),
  });
  const jobId = await enqueueConversion(enqueue, {
    dataset_id: remote.datasetId,
    volume_id: prep.volumeId,
    name: prep.name,
    file_name: remote.name,
    scan,
    crs_plan: prep.crsPlan,
    custom_defs: prep.customDefs || {},
    ingest_rec: prep.ingestRec,
    ...(crop ? { crop: { def: crop.def, definition_id: crop.definitionId || null } } : {}),
  }, prep, deps);
  return { jobId, volumeId: prep.volumeId, datasetId: remote.datasetId };
}
