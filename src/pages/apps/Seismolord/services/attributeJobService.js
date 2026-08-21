// Main-thread side of attribute-volume computation (W2.1): registers the
// derived volume in seismic_volumes, drives the volumeJob worker (which
// reads the parent's bricks itself), uploads the emitted bricks under
// the ingest ack backpressure — one ack per completed upload — then
// writes the v2 manifest and flips the row to 'ready'. Mirrors
// ingestService except: no file (the parent brick store is the source),
// quota estimated from the parent lattice, and an interrupted job is
// resumed by RECOMPUTING (skipExisting uploads make the rerun cheap;
// there is no partial-compute state worth persisting).

import { supabase } from '@/lib/customSupabaseClient';
import { buildDerivedManifest, brickRelPath, volumeDir, manifestPath } from '../engine/manifest';
import { ATTRIBUTE_DEFS } from '../engine/attributes';
import { DISCONTINUITY_DEFS } from '../engine/discontinuity';
import { SEISMIC_BUCKET, assertQuota } from './seismicStorage';
import { deleteVolume } from './volumesService';
import { newAttributeWorker } from './attributeWorkerFactory';

let nextJobId = 1;

/** Every computable derived-volume attribute: per-trace + neighborhood. */
export const ALL_ATTRIBUTE_DEFS = { ...ATTRIBUTE_DEFS, ...DISCONTINUITY_DEFS };

/** Brick-store footprint of a volume on the parent's lattice. */
export function derivedStorageBytes(parentManifest) {
  const b = parentManifest?.brick;
  if (!b?.count || !b?.size) throw new Error('Parent manifest has no brick block.');
  // derived volumes always write float32 bricks on the parent's PADDED grid
  return b.count * b.size ** 3 * 4;
}

/** W4.4: attribute math needs full-precision input — surface the engine
 *  rule as friendly copy before any work starts. */
export function assertFloat32Parent(parentManifest) {
  const dtype = parentManifest?.brick?.dtype ?? 'float32le';
  if (dtype !== 'float32le') {
    throw new Error('Attribute volumes need a float32 parent — this volume was imported with 16-bit storage. Re-import it without compression to compute attributes.');
  }
}

/** Default display name for a derived volume. */
export function defaultDerivedName(parentName, attributeName, params = {}) {
  const def = ALL_ATTRIBUTE_DEFS[attributeName];
  const label = def ? def.label.replace(/\s*\(.*\)$/, '') : attributeName;
  const win = params.windowMs ? ` ${params.windowMs} ms` : '';
  return `${parentName} [${label}${win}]`;
}

async function uploadObject(path, body, contentType, skipExisting) {
  const { error } = await supabase.storage.from(SEISMIC_BUCKET)
    .upload(path, body, { contentType, upsert: !skipExisting });
  if (error) {
    // recompute path: an already-uploaded brick is success, not failure
    if (skipExisting && /already exists/i.test(error.message)) return 'skipped';
    throw new Error(`Upload failed for ${path}: ${error.message}`);
  }
  return 'uploaded';
}

const storageBase = () => supabase.storage.from(SEISMIC_BUCKET)
  .getPublicUrl('x').data.publicUrl.split('/storage/v1/')[0];

async function accessToken() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');
  return session.access_token;
}

/**
 * Compute a derived attribute volume from a ready parent volume.
 *
 * @param {Object} p
 * @param {Object} p.parent seismic_volumes row of the parent (status 'ready')
 * @param {Object} p.parentManifest the parent's EFFECTIVE manifest (the
 *   viewer's composed manifest — row-authoritative interp state included)
 * @param {{name: string, params?: Object}} p.attribute registry attribute
 * @param {string} [p.name] display name (defaultDerivedName otherwise)
 * @param {(p:{phase:string,done:number,total:number})=>void} [p.onProgress]
 * @param {{cancelled?: boolean}} [p.cancelToken] set .cancelled = true to abort
 * @param {() => Worker} [p.workerFactory] test seam
 * @returns {Promise<{volumeId: string, manifest: Object, row: Object}>}
 */
export async function computeAttributeVolume({
  parent, parentManifest, attribute, name, onProgress, cancelToken = {}, workerFactory,
}) {
  if (!parent || parent.status !== 'ready') {
    throw new Error('Attributes need a fully ingested (ready) parent volume.');
  }
  if (!ALL_ATTRIBUTE_DEFS[attribute?.name]) {
    throw new Error(`Unknown attribute "${attribute?.name}".`);
  }
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('You must be signed in to compute attributes.');
  const userId = user.id;

  assertFloat32Parent(parentManifest);
  await assertQuota(derivedStorageBytes(parentManifest));

  const volumeId = crypto.randomUUID();
  const dir = volumeDir(userId, volumeId);
  const displayName = name || defaultDerivedName(parent.name, attribute.name, attribute.params);

  const { data: row, error: insertError } = await supabase.from('seismic_volumes')
    .insert({
      id: volumeId,
      user_id: userId,
      name: displayName,
      storage_path: dir,
      status: 'ingesting',
      kind: 'attribute',
      parent_volume_id: parent.id,
      attribute_params: { name: attribute.name, params: attribute.params ?? {} },
      crs: parent.crs,
      survey_meta: {},
    })
    .select().single();
  if (insertError) throw new Error(`Could not register the attribute volume: ${insertError.message}`);

  // Failed/cancelled derived jobs are deleted, not resumed: recompute is
  // the resume story, and a dangling 'ingesting' attribute row would only
  // confuse the import panel's file-resume flow.
  const cleanup = async () => {
    try {
      await deleteVolume(row);
    } catch { /* best effort */ }
  };

  const worker = (workerFactory || newAttributeWorker)();
  const id = nextJobId++;
  const token = await accessToken();

  try {
    const inflight = new Set();
    let uploadedBricks = 0;
    let failed = null;

    const result = await new Promise((resolve, reject) => {
      const fail = (err) => {
        failed = failed || err;
        worker.postMessage({ type: 'cancel', id });
        reject(err);
      };

      worker.onmessage = async (e) => {
        const msg = e.data;
        if (msg.type === 'need-token') {
          worker.postMessage({ type: 'token', nonce: msg.nonce, token: await accessToken() });
          return;
        }
        if (msg.id !== id) return;
        try {
          if (msg.type === 'progress') {
            if (onProgress) onProgress(msg);
            if (cancelToken.cancelled) worker.postMessage({ type: 'cancel', id });
          } else if (msg.type === 'brick') {
            const task = (async () => {
              await uploadObject(`${dir}/${brickRelPath(msg.i, msg.j, msg.k)}`,
                new Blob([msg.buffer], { type: 'application/octet-stream' }),
                'application/octet-stream', true);
              uploadedBricks += 1;
              if (onProgress) onProgress({ phase: 'upload', done: uploadedBricks, total: null });
            })();
            inflight.add(task);
            // Exactly ONE ack per completed upload — this, not a counter,
            // is what bounds concurrency (see brickAckChannel).
            task.then(
              () => {
                if (!failed && !cancelToken.cancelled) {
                  worker.postMessage({ type: 'brick:ack', id });
                }
              },
              fail,
            ).finally(() => inflight.delete(task));
          } else if (msg.type === 'compute:done') {
            await Promise.all([...inflight]);
            if (failed) return;
            resolve(msg.result);
          } else if (msg.type === 'error') {
            fail(new Error(msg.message));
          }
        } catch (err) {
          fail(err);
        }
      };
      worker.onerror = (e) => fail(new Error(e.message));
      worker.postMessage({
        type: 'compute',
        id,
        config: {
          supabaseUrl: storageBase(),
          token,
          bucket: SEISMIC_BUCKET,
          storagePath: parent.storage_path,
          manifest: parentManifest,
          attribute: { name: attribute.name, params: attribute.params ?? {} },
        },
      });
    }).finally(() => worker.terminate());

    const manifest = buildDerivedManifest({
      volumeId,
      name: displayName,
      parentManifest,
      attribute,
      job: result,
    });
    await uploadObject(manifestPath(userId, volumeId),
      new Blob([JSON.stringify(manifest, null, 1)], { type: 'application/json' }),
      'application/json', false).catch(async (err) => {
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
          ...(manifest.geometry.affine ? { affine: manifest.geometry.affine } : {}),
          ...(manifest.geometry.coord_scalar != null
            ? { coord_scalar: manifest.geometry.coord_scalar } : {}),
          ...(manifest.geometry.crs ? { crs: manifest.geometry.crs } : {}),
          brick: manifest.brick.grid,
          brick_size: manifest.brick.size,
          stats: manifest.stats,
          storage_bytes: derivedStorageBytes(manifest),
          attribute: manifest.attribute,
          parent_volume_id: parent.id,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', volumeId)
      .select().single();
    if (updateError) {
      throw new Error(`Attribute computed but registration failed: ${updateError.message}`);
    }

    return { volumeId, manifest, row: updated || row };
  } catch (err) {
    await cleanup();
    throw err;
  }
}
