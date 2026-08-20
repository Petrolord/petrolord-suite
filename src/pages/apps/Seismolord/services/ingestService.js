// Main-thread side of ingestion: drives the ingest worker, uploads bricks
// to the private 'seismic' bucket under the owner path (Storage RLS lets
// the client write {user_id}/... directly), and registers the volume in
// seismic_volumes with a direct RLS insert — house pattern, no edge-fn hop.

import { supabase } from '@/lib/customSupabaseClient';
import { buildManifest, brickRelPath, volumeDir, manifestPath } from '../engine/manifest';
import { encodeBrickInt16, bytesPerVoxel, INT16_DTYPE, INT16_HEADER_BYTES } from '../engine/brickCodec';
import { fileFingerprint, ingestRecord, resumeGate } from './ingestResume';
import { planCrs, planFromRecord, applyCrsToScan } from './ingestCrs';
import { getProjectCrs, setProjectCrs } from '@/lib/crs/settingsService';
import { crsDisplayName, crsUnit } from '@/lib/crs';
import { UNKNOWN } from '@/lib/crs/tags';

// Constants live in seismicStorage.js (import.meta-free) so other
// services can use them without inheriting this module's inline worker
// URL, which babel-jest cannot parse. Re-exported for existing callers.
import { SEISMIC_BUCKET, STORAGE_QUOTA_BYTES } from './seismicStorage';

export { SEISMIC_BUCKET, STORAGE_QUOTA_BYTES };
// Concurrency is governed by the worker's MAX_UNACKED_BRICKS backpressure
// window (one ack per completed upload), not a separate counter here.

async function assertQuota(estimateBytes) {
  const { data, error } = await supabase.from('seismic_volumes')
    .select('survey_meta');
  if (error) return;                                  // quota check must never block on a read hiccup
  const used = (data || []).reduce(
    (sum, v) => sum + (Number(v.survey_meta?.storage_bytes) || 0), 0);
  if (used + estimateBytes > STORAGE_QUOTA_BYTES) {
    const gib = (n) => (n / 1024 ** 3).toFixed(1);
    throw new Error(
      `Storage quota exceeded: ${gib(used)} GiB used + ~${gib(estimateBytes)} GiB new `
      + `> ${gib(STORAGE_QUOTA_BYTES)} GiB. Delete old volumes first.`);
  }
}

const newWorker = () =>
  new Worker(new URL('../workers/ingest.worker.js', import.meta.url), { type: 'module' });

let nextJobId = 1;

async function currentUserId() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('You must be signed in to import seismic data.');
  return user.id;
}

/**
 * Scan a SEG-Y file (headers only, sampled) for the mapping preview UI.
 * @param {File} file
 * @param {{ilByte?: number, xlByte?: number}} mapping
 * @param {(p:{phase:string,done:number,total:number})=>void} [onProgress]
 */
export function scanFile(file, mapping, onProgress) {
  const worker = newWorker();
  const id = nextJobId++;
  return new Promise((resolve, reject) => {
    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.id !== id) return;
      if (msg.type === 'progress' && onProgress) onProgress(msg);
      else if (msg.type === 'scan:done') {
        worker.terminate();
        resolve({ scan: msg.scan, textLines: msg.textLines, preview: msg.preview });
      } else if (msg.type === 'error') {
        worker.terminate();
        reject(new Error(msg.message));
      }
    };
    worker.onerror = (e) => { worker.terminate(); reject(new Error(e.message)); };
    worker.postMessage({ type: 'scan', id, file, mapping });
  });
}

async function uploadObject(path, body, contentType, skipExisting) {
  const { error } = await supabase.storage.from(SEISMIC_BUCKET)
    .upload(path, body, { contentType, upsert: !skipExisting });
  if (error) {
    // resume path: an already-uploaded brick is success, not failure
    if (skipExisting && /already exists/i.test(error.message)) return 'skipped';
    throw new Error(`Upload failed for ${path}: ${error.message}`);
  }
  return 'uploaded';
}

/**
 * Full ingestion pipeline: scan -> transcode -> brick uploads -> manifest
 * -> seismic_volumes registration.
 *
 * @param {Object} p
 * @param {File} p.file
 * @param {{ilByte?: number, xlByte?: number}} p.mapping ignored on resume —
 *   the transcode reruns under the ORIGINAL mapping stored on the row
 * @param {string} [p.name] display name, defaults to file name
 * @param {string} [p.resumeVolumeId] reuse a prior 'ingesting' volume id;
 *   the file must fingerprint-match the row's survey_meta.ingest identity
 *   (resumeGate), and already-uploaded bricks are skipped
 * @param {?string} [p.nativeCrs] the CRS the user declared for THIS file
 *   in the import panel (tag: EPSG:/CUSTOM:/LOCAL/UNKNOWN). Storage is in
 *   the Project CRS: a differing transformable declaration reprojects
 *   the survey affine at commit; the first placed import with no Project
 *   CRS defines it (Petrel behavior). Ignored on resume — the original
 *   declaration on the row wins.
 * @param {number} [p.memoryBudgetBytes]
 * @param {(p:{phase:string,done:number,total:number})=>void} [p.onProgress]
 * @param {{cancelled?: boolean}} [p.cancelToken] set .cancelled = true to abort
 */
export async function ingestVolume({
  file, mapping, name, resumeVolumeId, nativeCrs, memoryBudgetBytes, onProgress, cancelToken = {},
  compress16 = false,
}) {
  const userId = await currentUserId();
  const volumeId = resumeVolumeId || crypto.randomUUID();
  const dir = volumeDir(userId, volumeId);
  const displayName = name || file.name;

  // pre-scan estimate: sample bytes approximate the PADDED brick store
  // well for regular grids; the exact padded accounting lands on the row
  // (storage_bytes) after transcode. int16 halves it.
  if (!resumeVolumeId) await assertQuota(compress16 ? Math.ceil(file.size / 2) : file.size);

  // Source identity, computed before anything is registered or uploaded.
  const fingerprint = await fileFingerprint(file);

  // Register (or find) the row first so a failed ingest is visible and
  // resumable instead of leaving orphan storage objects. The identity
  // record rides on the row (survey_meta.ingest) from the very start —
  // an interrupted ingest has no manifest, so the row is the only place
  // a later resume can verify the file against.
  let row;
  let ingestRec;
  let effectiveMapping = mapping;
  let crsPlan;
  let customDefs = {};
  if (resumeVolumeId) {
    const { data, error } = await supabase.from('seismic_volumes')
      .select('*').eq('id', resumeVolumeId).single();
    if (error || !data) throw new Error('Volume to resume was not found.');
    row = data;
    effectiveMapping = resumeGate(row, fingerprint).mapping;
    ingestRec = row.survey_meta.ingest;
    // finish under the ORIGINAL declaration, never the current settings
    crsPlan = planFromRecord(ingestRec);
    if (crsPlan.needsTransform) {
      customDefs = (await getProjectCrs()).customDefs;
    }
  } else {
    const project = await getProjectCrs();
    customDefs = project.customDefs;
    crsPlan = planCrs(nativeCrs, project.tag);
    ingestRec = ingestRecord(fingerprint, mapping, file, {
      native: crsPlan.nativeTag,
      project: crsPlan.projectTag,
    });
    // W4.4: the brick encoding is part of the ingest identity — a resume
    // must finish with the SAME codec the first bricks were written in
    if (compress16) ingestRec.dtype = INT16_DTYPE;
    const { data, error } = await supabase.from('seismic_volumes')
      .insert({
        id: volumeId,
        user_id: userId,
        name: displayName,
        storage_path: dir,
        status: 'ingesting',
        crs: crsPlan.storeTag,
        survey_meta: { ingest: ingestRec },
      })
      .select().single();
    if (error) throw new Error(`Could not register volume: ${error.message}`);
    row = data;
    if (crsPlan.autoSetProject && crsPlan.projectTag !== UNKNOWN) {
      // Petrel behavior: the first placed dataset defines the Project
      // CRS. allowWithData because this volume's own row already counts.
      await setProjectCrs({
        tag: crsPlan.projectTag,
        name: crsDisplayName(crsPlan.projectTag, customDefs),
        xyUnit: crsUnit(crsPlan.projectTag, customDefs),
        allowWithData: true,
      });
    }
  }

  const dtype = ingestRec.dtype || 'float32le';

  const existing = new Set();
  if (resumeVolumeId) {
    // paginate: list() pages cap at 1000 regardless of the limit asked,
    // and a large volume easily exceeds 1000 bricks — an incomplete set
    // here only costs redundant uploads (skipExisting tolerates them),
    // but a resume should not re-send gigabytes
    let offset = 0;
    for (;;) {
      const { data } = await supabase.storage.from(SEISMIC_BUCKET)
        .list(`${dir}/bricks`, { limit: 1000, offset });
      (data || []).forEach((o) => existing.add(o.name));
      if (!data || data.length < 1000) break;
      offset += data.length;
    }
  }

  const worker = newWorker();
  const id = nextJobId++;
  const inflight = new Set();
  let uploadedBricks = 0;
  let failed = null;

  const finish = await new Promise((resolve, reject) => {
    const fail = (err) => {
      failed = failed || err;
      worker.postMessage({ type: 'cancel', id });
      reject(err);
    };

    worker.onmessage = async (e) => {
      const msg = e.data;
      if (msg.id !== id) return;
      try {
        if (msg.type === 'progress') {
          if (onProgress) onProgress(msg);
          if (cancelToken.cancelled) worker.postMessage({ type: 'cancel', id });
        } else if (msg.type === 'brick') {
          const rel = brickRelPath(msg.i, msg.j, msg.k);
          const task = (async () => {
            if (!existing.has(rel.split('/').pop())) {
              // W4.4: int16 volumes encode here, on the upload edge —
              // the worker and every engine stage stay float32
              const payload = dtype === INT16_DTYPE
                ? encodeBrickInt16(new Float32Array(msg.buffer)) : msg.buffer;
              await uploadObject(`${dir}/${rel}`,
                new Blob([payload], { type: 'application/octet-stream' }),
                'application/octet-stream', Boolean(resumeVolumeId));
            }
            uploadedBricks += 1;
            if (onProgress) onProgress({ phase: 'upload', done: uploadedBricks, total: null });
          })();
          inflight.add(task);
          // Exactly ONE ack per completed upload — this, not a per-message
          // counter, is what bounds concurrency: the worker parks after
          // MAX_UNACKED_BRICKS unacked bricks, so at most that many uploads
          // are ever in flight. (The old Promise.race pattern released every
          // pending ack on a single completion, so uploads outran the cap.)
          task.then(
            () => {
              if (!failed && !cancelToken.cancelled) {
                worker.postMessage({ type: 'brick:ack', id });
              }
            },
            fail,
          ).finally(() => inflight.delete(task));
        } else if (msg.type === 'ingest:done') {
          await Promise.all([...inflight]);
          if (failed) return;
          resolve({ scan: msg.scan, result: msg.result });
        } else if (msg.type === 'error') {
          fail(new Error(msg.message));
        }
      } catch (err) {
        fail(err);
      }
    };
    worker.onerror = (e) => fail(new Error(e.message));
    worker.postMessage({ type: 'ingest', id, file, mapping: effectiveMapping, memoryBudgetBytes });
  }).finally(() => worker.terminate());

  // Convert-on-import: the stored affine/corners are in the Project CRS;
  // the crs block preserves the native declaration and native affine so
  // any later reprojection restarts from native, never chains.
  const { scan: placedScan, crsBlock } = applyCrsToScan(finish.scan, crsPlan, customDefs);

  const manifest = buildManifest({
    volumeId,
    name: displayName,
    scan: placedScan,
    transcode: finish.result,
    sourceFileName: file.name,
    sourceFileSize: file.size,
    crs: crsBlock,
  });
  // additive manifest field (still manifest_version 1): the source
  // identity the ingest was gated on, for future re-import dedup hints
  manifest.source.fingerprint = ingestRec.fingerprint;
  // W4.4: record the codec; the aged W0.1 gate turns this into upgrade
  // copy on pre-W4.4 clients instead of garbage
  manifest.brick.dtype = dtype;
  await uploadObject(manifestPath(userId, volumeId),
    new Blob([JSON.stringify(manifest, null, 1)], { type: 'application/json' }),
    'application/json', false).catch(async (err) => {
    // manifest may exist from an interrupted previous completion
    if (!/already exists/i.test(err.message)) throw err;
    await supabase.storage.from(SEISMIC_BUCKET).update(
      manifestPath(userId, volumeId),
      new Blob([JSON.stringify(manifest, null, 1)], { type: 'application/json' }));
  });

  const { data: updated, error: updateError } = await supabase.from('seismic_volumes')
    .update({
      status: 'ready',
      crs: crsPlan.storeTag,
      survey_meta: {
        il: manifest.geometry.il,
        xl: manifest.geometry.xl,
        ns: manifest.geometry.ns,
        dt_us: manifest.geometry.dt_us,
        corners: manifest.geometry.corners,
        // world-placement identity: without these, SQL-level consumers
        // saw corners only and every world question re-read the manifest
        ...(manifest.geometry.affine ? { affine: manifest.geometry.affine } : {}),
        ...(manifest.geometry.coord_scalar != null
          ? { coord_scalar: manifest.geometry.coord_scalar } : {}),
        ...(manifest.geometry.crs ? { crs: manifest.geometry.crs } : {}),
        sample_format: manifest.source.sample_format,
        il_byte: manifest.source.il_byte,
        xl_byte: manifest.source.xl_byte,
        brick: manifest.brick.grid,
        brick_size: manifest.brick.size,
        stats: manifest.stats,
        // quota accounting: actual PADDED brick-store footprint (bricks
        // pad to size^3 at every ragged edge; int16 halves the voxels
        // and adds an 8-byte header per brick)
        storage_bytes: manifest.brick.count
          * (manifest.brick.size ** 3 * bytesPerVoxel(dtype)
            + (dtype === INT16_DTYPE ? INT16_HEADER_BYTES : 0)),
        // identity survives readiness (survey_meta is replaced wholesale
        // here, and the completion of an interrupted-then-resumed ingest
        // must not erase what it was resumed from)
        ingest: ingestRec,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', volumeId)
    .select().single();
  if (updateError) throw new Error(`Volume ingested but registration failed: ${updateError.message}`);

  return { volumeId, manifest, row: updated || row };
}
