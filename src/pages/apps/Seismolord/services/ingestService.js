// Main-thread side of ingestion: drives the ingest worker, uploads bricks
// to the private 'seismic' bucket under the owner path (Storage RLS lets
// the client write {user_id}/... directly), and registers the volume in
// seismic_volumes with a direct RLS insert — house pattern, no edge-fn hop.

import { supabase } from '@/lib/customSupabaseClient';
import { buildManifest, brickRelPath, volumeDir, manifestPath } from '../engine/manifest';

export const SEISMIC_BUCKET = 'seismic';
// Concurrency is governed by the worker's MAX_UNACKED_BRICKS backpressure
// window (one ack per completed upload), not a separate counter here.

// Per-user storage quota. This client check is the FRIENDLY layer: it
// fails an ingest up-front with a clear message before any upload work.
// The AUTHORITATIVE layer is server-side since migration
// 20260712120000_seismic_storage_quota.sql: the 'seismic' bucket's
// INSERT policy refuses new objects once the user's bucket footprint
// reaches the same 20 GiB (updates/deletes stay quota-free so an
// over-quota user can still save work and free space). Keep the two
// constants in lockstep.
export const STORAGE_QUOTA_BYTES = 20 * 1024 ** 3;   // 20 GiB

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
 * @param {{ilByte?: number, xlByte?: number}} p.mapping
 * @param {string} [p.name] display name, defaults to file name
 * @param {string} [p.resumeVolumeId] reuse a prior 'ingesting' volume id;
 *   already-uploaded bricks are skipped
 * @param {number} [p.memoryBudgetBytes]
 * @param {(p:{phase:string,done:number,total:number})=>void} [p.onProgress]
 * @param {{cancelled?: boolean}} [p.cancelToken] set .cancelled = true to abort
 */
export async function ingestVolume({
  file, mapping, name, resumeVolumeId, memoryBudgetBytes, onProgress, cancelToken = {},
}) {
  const userId = await currentUserId();
  const volumeId = resumeVolumeId || crypto.randomUUID();
  const dir = volumeDir(userId, volumeId);
  const displayName = name || file.name;

  if (!resumeVolumeId) await assertQuota(file.size);   // brick store ≈ sample bytes

  // Register (or find) the row first so a failed ingest is visible and
  // resumable instead of leaving orphan storage objects.
  let row;
  if (resumeVolumeId) {
    const { data, error } = await supabase.from('seismic_volumes')
      .select('*').eq('id', resumeVolumeId).single();
    if (error || !data) throw new Error('Volume to resume was not found.');
    row = data;
  } else {
    const { data, error } = await supabase.from('seismic_volumes')
      .insert({
        id: volumeId,
        user_id: userId,
        name: displayName,
        storage_path: dir,
        status: 'ingesting',
      })
      .select().single();
    if (error) throw new Error(`Could not register volume: ${error.message}`);
    row = data;
  }

  const existing = new Set();
  if (resumeVolumeId) {
    const { data } = await supabase.storage.from(SEISMIC_BUCKET)
      .list(`${dir}/bricks`, { limit: 100000 });
    (data || []).forEach((o) => existing.add(o.name));
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
              await uploadObject(`${dir}/${rel}`,
                new Blob([msg.buffer], { type: 'application/octet-stream' }),
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
    worker.postMessage({ type: 'ingest', id, file, mapping, memoryBudgetBytes });
  }).finally(() => worker.terminate());

  const manifest = buildManifest({
    volumeId,
    name: displayName,
    scan: finish.scan,
    transcode: finish.result,
    sourceFileName: file.name,
    sourceFileSize: file.size,
  });
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
      survey_meta: {
        il: manifest.geometry.il,
        xl: manifest.geometry.xl,
        ns: manifest.geometry.ns,
        dt_us: manifest.geometry.dt_us,
        corners: manifest.geometry.corners,
        sample_format: manifest.source.sample_format,
        il_byte: manifest.source.il_byte,
        xl_byte: manifest.source.xl_byte,
        brick: manifest.brick.grid,
        brick_size: manifest.brick.size,
        stats: manifest.stats,
        // quota accounting: actual brick-store footprint of this volume
        storage_bytes: manifest.brick.count * manifest.brick.size ** 3 * 4,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', volumeId)
    .select().single();
  if (updateError) throw new Error(`Volume ingested but registration failed: ${updateError.message}`);

  return { volumeId, manifest, row: updated || row };
}
