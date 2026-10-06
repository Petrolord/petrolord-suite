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
import { SEISMIC_BUCKET, assertQuota } from './seismicStorage';
import { deleteVolume } from './volumesService';
import { newAttributeWorker } from './attributeWorkerFactory';
import {
  ALL_ATTRIBUTE_DEFS, attributePrecheck, assertFloat32Parent, derivedStorageBytes, derivedSurveyMeta,
} from './attributeSurveyMeta';

// moved to a pure module so the seismic worker can share them
export {
  ALL_ATTRIBUTE_DEFS, attributePrecheck, assertFloat32Parent, derivedStorageBytes, derivedSurveyMeta,
};

let nextJobId = 1;

/** Default display name for a derived volume. */
export function defaultDerivedName(parentName, attributeName, params = {}) {
  const def = Object.prototype.hasOwnProperty.call(ALL_ATTRIBUTE_DEFS, attributeName)
    ? ALL_ATTRIBUTE_DEFS[attributeName] : null;
  const label = def ? def.label.replace(/\s*\(.*\)$/, '') : attributeName;
  const freq = params.freqHz ? ` ${params.freqHz} Hz` : '';
  const win = params.windowMs ? ` ${params.windowMs} ms` : '';
  return `${parentName} [${label}${freq}${win}]`;
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
 * Check the parent and register the derived row ('ingesting'). The first
 * step of both routes: the browser computation below, and the server job
 * (serverAttribute.js), so a row is registered the same way either way.
 * @returns {Promise<{row: Object, volumeId: string, userId: string, dir: string, displayName: string}>}
 */
export async function registerAttributeVolume({ parent, parentManifest, attribute, name }) {
  if (parent?.status === 'display_ready') {
    // v4: only the 8-bit display copy is up; attributes compute on float32
    throw new Error('This volume is still uploading its full-precision copy. Attributes can be computed once that finishes.');
  }
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
  const why = attributePrecheck(attribute.name, parentManifest);
  if (why) throw new Error(why);
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
      attribute_params: { name: attribute.name, params: attribute.params ?? {}, ...(attribute.north ? { north: attribute.north } : {}) },
      crs: parent.crs,
      survey_meta: {},
    })
    .select().single();
  if (insertError) throw new Error(`Could not register the attribute volume: ${insertError.message}`);
  return { row, volumeId, userId, dir, displayName };
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
  const { row, volumeId, userId, dir, displayName } = await registerAttributeVolume({
    parent, parentManifest, attribute, name,
  });

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
        survey_meta: derivedSurveyMeta(manifest, parent.id),
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
