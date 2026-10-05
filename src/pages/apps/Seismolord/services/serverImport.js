// Server import of a SEG-Y (QI programme Q0; Q0b makes it the default for
// large surveys). The file goes straight to the seismic worker's store by
// resumable multipart upload; once it is all there, the volume row is
// registered exactly as a browser import registers it (prepareV4Row) and a
// stack_to_v4 job converts it on the server with the same code. Upload first,
// register second: an interrupted upload leaves no half-made volume, and
// picking the same file again resumes from the parts already stored.
import { uploadLargeFile } from '@/lib/qiUpload';
import { enqueueJob } from '@/lib/qiService';
import { prepareV4Row } from './importJobsRuntime';
import { fileFingerprint } from './ingestResume';

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
 * @param {Object} [deps] injected for tests: upload, prepare, enqueue
 * @returns {Promise<{jobId: string, volumeId: string, datasetId: string}>}
 */
export async function startServerImport({
  file, mapping, scan, nativeCrs, name, onUploadProgress, signal,
}, deps = {}) {
  const upload = deps.upload || uploadLargeFile;
  const prepare = deps.prepare || prepareV4Row;
  const enqueue = deps.enqueue || enqueueJob;
  // the same sampled fingerprint the volume row records: with it the server
  // resumes this user's unfinished upload of the file from any browser
  const fingerprint = deps.fingerprint || fileFingerprint;
  const dataset = await upload(file, { name: name || file.name, onProgress: onUploadProgress, signal, fingerprint });
  const prep = await prepare({ file, mapping, nativeCrs, name });
  const jobId = await enqueue('stack_to_v4', {
    dataset_id: dataset.id,
    volume_id: prep.volumeId,
    name: prep.name,
    file_name: file.name,
    scan,
    crs_plan: prep.crsPlan,
    custom_defs: prep.customDefs || {},
    ingest_rec: prep.ingestRec,
  });
  return { jobId, volumeId: prep.volumeId, datasetId: dataset.id };
}
