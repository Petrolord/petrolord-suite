// Import from disk with no upload (Local Workspace L1,
// docs/scope/LocalWorkspace-DESIGN.md section 7). The existing v4 conversion
// (scan, optional crop, transcode, both copies) writes into this computer's
// workspace in place of the upload spool; nothing of the seismic is sent.
// The cloud gets only what colleagues need to see the volume exists: the row
// (location 'local', this computer's device, the Suite project), the
// manifest (geometry, brick lattice, statistics), the identity hashes and,
// unless the project or the volume says not to, small previews.
//
//   1. register the row (prepare), location local, no cloud quota
//   2. convert into the local pack store, while a second worker hashes the
//      whole source file (full SHA-256) for the volume identity
//   3. seal: brick root, content id, manifest complete (both copies), the
//      registry record 'ready', a ready replica row, the row 'ready'
//   4. previews (optional, never blocking)
//
// Pure orchestration over injected dependencies (localImportRuntime.js
// wires the real ones), so jest drives it end to end.

import { buildManifestV4, volumeDir, withV4Complete } from '../engine/manifest';
import { v4SurveyMeta } from './v4SurveyMeta';
import { applyCrsToScan } from './ingestCrs';
import { scanForManifest, traceDelayRecord } from '../lib/segyDoor';
import { applyVerticalToManifest } from '../lib/verticalDomain';
import { contentIdOf } from '@/lib/localWorkspace/identity';

/** Disk a local import needs: the float copy about 1.0 times the SEG-Y (or its crop), the display copy about 0.3 more. */
export function localImportBytes(sourceBytes) {
  return Math.ceil(Number(sourceBytes || 0) * 1.3);
}

/**
 * What the import dialog shows for the two choices.
 * @param {{bytes: number, readMBps?: number, uploadMBps?: ?number}} p
 */
export function localVsUploadEstimate({ bytes, readMBps = 60, uploadMBps = null }) {
  const keepS = bytes / (readMBps * 1e6);
  const upS = uploadMBps ? bytes / (uploadMBps * 1e6) : null;
  return { keepSeconds: keepS, uploadSeconds: upS, diskBytes: localImportBytes(bytes) };
}

/** Plain size words: "350 MB", "2.4 GB", "104 GB" (never "0 GB" for a small file). */
export function sizeWords(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return 'unknown';
  if (bytes < 1e9) return `${Math.max(1, Math.round(bytes / 1e6))} MB`;
  if (bytes < 10e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  return `${Math.round(bytes / 1e9)} GB`;
}

/** Plain duration words: "about 25 min", "about 22 h", "about 4.6 days". */
export function durationWords(s) {
  if (!Number.isFinite(s)) return 'unknown';
  if (s < 90) return 'about a minute';
  if (s < 5400) return `about ${Math.round(s / 60)} min`;
  if (s < 2 * 86400) return `about ${Math.round(s / 3600)} h`;
  return `about ${(s / 86400).toFixed(1)} days`;
}

/**
 * @param {Object} deps
 * @param {(p: Object) => Promise<Object>} deps.prepare prepareV4Row with the local location
 * @param {(p: Object) => Promise<Object>} deps.convert conversion into the local store; resolves the record
 * @param {(file: Blob, o: Object) => Promise<string>} deps.hashFile full SHA-256 hex
 * @param {(volumeId: string, o: Object) => Promise<Object>} deps.openStore the volume's pack store
 * @param {Object} deps.registry local registry
 * @param {(path: string, manifest: Object) => Promise<void>} deps.uploadManifest manifest to the cloud
 * @param {(volumeId: string, patch: Object) => Promise<Object>} deps.updateRow
 * @param {(p: Object) => Promise<void>} deps.recordReplica
 * @param {() => Promise<{deviceId: ?string, label: string, userId: string, projectId: ?string}>} deps.device
 * @param {(volumeId: string, manifest: Object) => Promise<void>} [deps.previews]
 * @param {(volumeId: string) => Promise<void>} [deps.abandon] remove the row and files after a failure
 * @param {Object} p {file, mapping, scan, nativeCrs, name, crop, vertical, onProgress, cancelToken}
 */
export async function runLocalImport(deps, {
  file, mapping, scan, nativeCrs = null, name = null, crop = null, vertical = null, traceDelay = null,
  onProgress = () => {}, onRegistered = () => {}, cancelToken = { cancelled: false },
}) {
  const dev = await deps.device();
  const prep = await deps.prepare({
    file, mapping, nativeCrs, name, crop: crop?.provenance || null, vertical,
    location: { storage_location: 'local', device_id: dev.deviceId || null },
  });
  const { volumeId, userId } = prep;
  onRegistered(volumeId, prep);
  await deps.registry.putVolume({
    volumeId, userId, projectId: dev.projectId || null, backend: dev.backend || 'folder', state: 'writing', bytes: 0, name: prep.name, createdAt: Date.now(),
  });
  try {
    const store = await deps.openStore(volumeId, { write: true, create: true, userId, projectId: dev.projectId || null });
    const hashTarget = crop?.sourceFile || file;
    const [record, sha256] = await Promise.all([
      deps.convert({
        file, scan, volumeId, spool: store, cancelToken, crop: crop?.request || null,
        // F-5: the uncropped file's trace delay, as the upload path applies it
        delayShift: !crop && traceDelay?.applied ? traceDelay.shift_samples : 0,
        onProgress: (q) => onProgress({ ...q, stage: 'convert' }),
      }),
      deps.hashFile(hashTarget, {
        isCancelled: () => cancelToken.cancelled,
        onProgress: (done, total) => onProgress({ stage: 'hash', phase: 'hash', done, total }),
      }),
    ]);
    if (cancelToken.cancelled) throw Object.assign(new Error('Import cancelled.'), { cancelled: true });

    // the store the conversion wrote may be the worker's own; reopen to read its index
    const sealed = await deps.openStore(volumeId, { write: false });
    const brickRoot = await sealed.brickRoot();
    const bytes = await sealed.bytes();
    const { scan: placed, crsBlock } = applyCrsToScan(scanForManifest(scan, record), prep.crsPlan, prep.customDefs);
    let manifest = buildManifestV4({
      volumeId, name: prep.name, scan: placed, transcode: record, sourceFileName: file.name, sourceFileSize: file.size, crs: crsBlock,
    });
    manifest.source.fingerprint = prep.ingestRec.fingerprint;
    manifest.source.sha256 = sha256;
    if (crop?.provenance) manifest.source.crop = crop.provenance;
    const td = traceDelayRecord(crop ? crop.provenance?.trace_delay : traceDelay);
    if (td) manifest.source.trace_delay = td;
    applyVerticalToManifest(manifest, prep.ingestRec.vertical);
    manifest = withV4Complete(manifest, { display: true, f32: true });
    const contentId = await contentIdOf({
      source: { sha256, size: hashTarget.size },
      mapping: prep.ingestRec.mapping || mapping || null,
      crop: crop?.provenance || null,
      codec: { display: manifest.display?.compression || null, f32: manifest.f32?.compression || null, brick: manifest.brick?.size || null, levels: manifest.display?.levels?.length || null },
    });
    manifest.local = { content_id: contentId, brick_root: brickRoot, stored_bytes: bytes };

    const writer = await deps.openStore(volumeId, { write: true });
    await writer.putJson('manifest', manifest);
    await writer.putJson('state', { state: 'ready', brick_root: brickRoot, content_id: contentId, sealed_at: new Date().toISOString() });
    await writer.close();

    await deps.registry.patchVolume(volumeId, { state: 'ready', bytes, brickRoot, contentId });
    await deps.uploadManifest(`${volumeDir(userId, volumeId)}/manifest.json`, manifest);
    const row = await deps.updateRow(volumeId, {
      status: 'ready',
      survey_meta: { ...v4SurveyMeta(manifest, record, prep.ingestRec), local_bytes: bytes },
      content_id: contentId,
      brick_root: brickRoot,
    });
    if (dev.deviceId) await deps.recordReplica({ volumeId, deviceId: dev.deviceId, deviceLabel: dev.label, state: 'ready', bytes, verified: true });
    let previewError = null;
    if (deps.previews) {
      try { await deps.previews(volumeId, manifest); } catch (e) { previewError = e.message; }
    }
    return { volumeId, manifest, row, brickRoot, contentId, bytes, sha256, previewError };
  } catch (e) {
    await deps.registry.patchVolume(volumeId, { state: 'failed' }).catch(() => {});
    if (deps.abandon) await deps.abandon(volumeId).catch(() => {});
    throw e;
  }
}
