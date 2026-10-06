// attribute_volume: compute a derived attribute volume on the server (QI
// programme Q0b). It runs exactly what the browser's attribute worker runs
// (workers/volumeJob.worker.js): the parent's float32 bricks through
// v4BrickFetcher, then runVolumeJob (per-trace attributes) or
// runNeighborhoodJob (discontinuity and structure attributes), then the v2
// derived manifest and the same row metadata (attributeSurveyMeta.js). Only
// the brick reads (service role), the uploads (service role, four in flight)
// and the progress channel differ.
//
// The browser registers the derived row ('ingesting', kind 'attribute') as it
// does today and enqueues. params: { volume_id, parent_volume_id,
// attribute: { name, params, north? } }
//
// The worker uses the service role, so this handler checks what RLS would:
// both rows belong to the job's user (server jobs run on the user's own
// volumes; a colleague's shared volume is computed in the browser for now),
// and the derived volume fits the user's seismic quota.
import { JobFailure } from '../runJob.js';
import { seismicQuota, overQuotaMessage } from '../quota.js';
import { affineForNorth } from '../../../../src/pages/apps/Seismolord/lib/northReference.js';
import {
  ALL_ATTRIBUTE_DEFS, attributePrecheck, assertFloat32Parent, derivedStorageBytes, derivedSurveyMeta,
} from '../../../../src/pages/apps/Seismolord/services/attributeSurveyMeta.js';
import { BrickCache, storageBrickFetcher } from '../../../../packages/engines/engines/seismolord/brickCache.js';
import { v4BrickFetcher } from '../../../../packages/engines/engines/seismolord/brickCodecV4.js';
import { geomFromManifest, brickKey } from '../../../../packages/engines/engines/seismolord/sliceAssembly.js';
import { makeTraceCompute } from '../../../../packages/engines/engines/seismolord/attributes.js';
import { DISCONTINUITY_DEFS } from '../../../../packages/engines/engines/seismolord/discontinuity.js';
import { makeDiscontinuityJob } from '../../../../packages/engines/engines/seismolord/discontinuityJobs.js';
import { surveyAffine } from '../../../../packages/engines/engines/seismolord/surveyGeometry.js';
import { runVolumeJob, runNeighborhoodJob } from '../../../../packages/engines/engines/seismolord/volumeJob.js';
import {
  buildDerivedManifest, brickRelPath, volumeDir, manifestPath,
} from '../../../../packages/engines/engines/seismolord/manifest.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UPLOADS_IN_FLIGHT = 4;

export function validateAttributeParams(p) {
  if (!p || typeof p !== 'object') return 'Missing job settings.';
  if (!UUID.test(String(p.volume_id))) return 'volume_id is required.';
  if (!UUID.test(String(p.parent_volume_id))) return 'parent_volume_id is required.';
  const name = p.attribute?.name;
  if (!name || !Object.prototype.hasOwnProperty.call(ALL_ATTRIBUTE_DEFS, name)) return `Unknown attribute "${name}".`;
  return null;
}

/**
 * @param {Object} ctx runJob context
 * @param {Object} deps
 * @param {Object} deps.admin supabase-js client with the service role
 * @param {Object} deps.storage upload storage client for the seismic bucket
 * @param {string} deps.supabaseUrl
 * @param {string} deps.serviceRoleKey
 * @param {Function} [deps.makeFetcher] (manifest) => async (path) => ArrayBuffer (tests)
 * @param {Function} [deps.readManifest] (path) => manifest (tests)
 */
export async function attributeVolume(ctx, deps) {
  const p = ctx.params;
  const problem = validateAttributeParams(p);
  if (problem) throw new JobFailure('validate_failed', problem);
  const uid = ctx.job.user_id;
  const { admin } = deps;

  const rowOf = async (id) => {
    const { data, error } = await admin.from('seismic_volumes')
      .select('id,user_id,status,name,kind,parent_volume_id,storage_path,crs').eq('id', id).maybeSingle();
    if (error) throw new Error(`Could not read volume ${id}: ${error.message}`);
    return data;
  };
  const derived = await rowOf(p.volume_id);
  if (!derived || derived.user_id !== uid) throw new JobFailure('not_found', 'The attribute volume was not found in your account.');
  if (derived.kind !== 'attribute' || derived.parent_volume_id !== p.parent_volume_id) {
    throw new JobFailure('validate_failed', 'The attribute volume does not belong to that parent.');
  }
  if (derived.status !== 'ingesting') throw new JobFailure('validate_failed', `The attribute volume is ${derived.status}; only a new one can be computed.`);
  const parent = await rowOf(p.parent_volume_id);
  if (!parent || parent.user_id !== uid) {
    throw new JobFailure('not_found', 'The parent volume was not found in your account. Server attributes run on your own volumes; compute a shared volume in the browser.');
  }
  if (parent.status !== 'ready') throw new JobFailure('validate_failed', 'Attributes need a fully uploaded (ready) parent volume.');

  const dir = volumeDir(uid, derived.id);
  const uploaded = [];
  const cleanup = async () => {
    try {
      const names = uploaded.length ? uploaded : [];
      for (let i = 0; i < names.length; i += 500) await admin.storage.from('seismic').remove(names.slice(i, i + 500));
      await admin.from('seismic_volumes').delete().eq('id', derived.id).eq('user_id', uid);
    } catch (e) {
      ctx.log?.warn?.(`cleanup of ${derived.id} failed: ${e.message}`);
    }
  };

  const readManifest = deps.readManifest || (async (path) => {
    const { data, error } = await admin.storage.from('seismic').download(path);
    if (error) throw new Error(`Could not read the parent manifest: ${error.message}`);
    return JSON.parse(await data.text());
  });
  // The parent's own manifest (the attribute maths needs only its geometry,
  // brick block and v4 read info), the attribute rules, and the quota.
  const checkParent = async () => {
    const manifest = await readManifest(`${parent.storage_path}/manifest.json`);
    try {
      assertFloat32Parent(manifest);
    } catch (e) {
      throw new JobFailure('validate_failed', e.message);
    }
    const why = attributePrecheck(p.attribute.name, manifest);
    if (why) throw new JobFailure('validate_failed', why);
    const need = derivedStorageBytes(manifest);
    const q = await seismicQuota(admin, uid);
    if (q.used + need > q.quota) throw new JobFailure('over_quota', overQuotaMessage('The attribute volume', need, q));
    return manifest;
  };
  let parentManifest;
  try {
    parentManifest = await checkParent();
  } catch (e) {
    // the browser registered the row before enqueueing; a job that cannot
    // start removes it, as the browser's own failure path does
    await cleanup();
    throw e;
  }

  // the browser worker's reader, with the service key as the token
  const fetcher = deps.makeFetcher
    ? deps.makeFetcher(parentManifest)
    : v4BrickFetcher(storageBrickFetcher({
      supabaseUrl: deps.supabaseUrl, getToken: async () => deps.serviceRoleKey, bucket: 'seismic',
    }), parentManifest);
  const geom = geomFromManifest(parentManifest);
  const { name, params = {} } = p.attribute;
  const neighborhood = Boolean(DISCONTINUITY_DEFS[name]);
  let fetchBrick;
  if (neighborhood) {
    const cache = new BrickCache(fetcher, { maxBytes: 1024 * 1024 * 1024 });
    fetchBrick = (i, j, k) => cache.get(brickKey(parent.storage_path, i, j, k));
  } else {
    fetchBrick = async (i, j, k) => new Float32Array(await fetcher(brickKey(parent.storage_path, i, j, k)));
  }

  const inflight = new Set();
  let uploadError = null;
  const onBrick = async ({ i, j, k, data }) => {
    if (uploadError) throw uploadError;
    const path = `${dir}/${brickRelPath(i, j, k)}`;
    const task = deps.storage.upload(path, new Uint8Array(data.buffer, data.byteOffset, data.byteLength), { contentType: 'application/octet-stream', upsert: false })
      .then(() => { uploaded.push(path); })
      .catch((e) => { uploadError = uploadError || e; })
      .finally(() => inflight.delete(task));
    inflight.add(task);
    if (inflight.size >= UPLOADS_IN_FLIGHT) await Promise.race(inflight);
  };

  const shared = {
    geom,
    fetchBrick,
    shouldCancel: () => ctx.cancelled,
    onProgress: (done, total) => ctx.progress(0.95 * (total ? done / total : 0), 'Computing'),
    onBrick,
  };

  let result;
  try {
    if (neighborhood) {
      const job = makeDiscontinuityJob(name, params, {
        dtUs: parentManifest.geometry.dt_us, nIl: geom.nIl, nXl: geom.nXl, ns: geom.ns,
        affine: affineForNorth(surveyAffine(parentManifest.geometry), p.attribute.north),
      });
      result = await runNeighborhoodJob({ ...shared, ...job });
    } else {
      result = await runVolumeJob({ ...shared, compute: makeTraceCompute(name, params, { dtUs: parentManifest.geometry.dt_us }) });
    }
    await Promise.all(inflight);
    if (uploadError) throw new JobFailure('upload_failed', `Uploading the attribute bricks failed: ${uploadError.message}`);
  } catch (e) {
    await Promise.allSettled(inflight);
    await cleanup();
    if (ctx.cancelled) return null;
    throw e;
  }

  try {
    const attribute = { name, params, ...(p.attribute.north ? { north: p.attribute.north } : {}) };
    const manifest = buildDerivedManifest({ volumeId: derived.id, name: derived.name, parentManifest, attribute, job: result });
    await deps.storage.upload(manifestPath(uid, derived.id), new TextEncoder().encode(JSON.stringify(manifest, null, 1)), { contentType: 'application/json', upsert: true });
    const { error } = await admin.from('seismic_volumes')
      .update({ status: 'ready', survey_meta: derivedSurveyMeta(manifest, parent.id), updated_at: new Date().toISOString() })
      .eq('id', derived.id).eq('user_id', uid);
    if (error) throw new Error(`Attribute computed but registration failed: ${error.message}`);
    ctx.progress(1, 'Done');
    return { volume_id: derived.id, parent_volume_id: parent.id, attribute: name, bricks: uploaded.length, trace_count: result.traceCount };
  } catch (e) {
    await cleanup();
    throw e;
  }
}
