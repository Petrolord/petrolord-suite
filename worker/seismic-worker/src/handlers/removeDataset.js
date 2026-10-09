// remove_dataset: a user removes one of their files from the worker's store
// (QI Studio, Prestack tab, 2026-10-09). Until now only the janitor removed
// them (raw SEG-Y 30 days after upload; gather stores never), so a wrong
// upload or an old gather store held the user's allowance with no way out.
//
// What goes: a raw upload or an angle stack is one object; a gather store is
// its manifest and every block the manifest lists (blocks_present, written by
// ingest_gathers and trim_gathers). The row is marked deleted, which frees the
// allowance (qi_user_storage_bytes counts uploading and uploaded rows only).
// Seismolord volumes converted from a file live in Supabase Storage and are
// kept. A file a queued or running job reads is refused, not pulled from
// under it. A store object already gone counts as removed.
//
// params: { dataset_id }
import { JobFailure } from '../runJob.js';
import { gatherBlockKey, foldBlockKey } from '../../../../packages/engines/engines/qi/gatherStore.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateRemoveParams(p) {
  if (!p || typeof p !== 'object') return 'Missing job settings.';
  if (!UUID.test(String(p.dataset_id))) return 'dataset_id is required.';
  return null;
}

/** The store keys a dataset row owns. */
export async function datasetKeys(ds, getObject) {
  if (ds.kind !== 'gathers_offset' && ds.kind !== 'gathers_angle') return [ds.object_key];
  const prefix = ds.object_key.replace(/\/manifest\.json$/, '');
  let blocks = [];
  try {
    const m = JSON.parse(new TextDecoder().decode(await getObject(ds.object_key)));
    blocks = m.blocks_present || [];
  } catch {
    // no readable manifest: the manifest key is still removed; blocks are
    // written before the manifest, so a store without one never registered
  }
  const keys = [];
  for (const [bi, bj] of blocks) keys.push(`${prefix}/${gatherBlockKey(bi, bj)}`, `${prefix}/${foldBlockKey(bi, bj)}`);
  keys.push(ds.object_key);
  return keys;
}

export async function removeDataset(ctx, deps) {
  const p = ctx.params || {};
  const problem = validateRemoveParams(p);
  if (problem) throw new JobFailure('validate_failed', problem);
  const uid = ctx.job.user_id;
  const { admin, sign } = deps;
  const fetchImpl = deps.fetchImpl || fetch;
  const { data: ds, error } = await admin.from('qi_datasets').select('*').eq('id', p.dataset_id).maybeSingle();
  if (error) throw new Error(`Could not read the file record: ${error.message}`);
  if (!ds || ds.user_id !== uid) throw new JobFailure('not_found', 'The file was not found in your account.');
  if (!['uploaded', 'failed'].includes(ds.status)) throw new JobFailure('validate_failed', `The file is ${ds.status}; only a finished or failed file can be removed.`);

  const { data: busy, error: bErr } = await admin.from('qi_jobs').select('id,kind,params')
    .eq('user_id', uid).in('status', ['queued', 'running']);
  if (bErr) throw new Error(`Could not check your running jobs: ${bErr.message}`);
  const user = (busy || []).find((j) => j.id !== ctx.job.id && j.params?.dataset_id === ds.id);
  if (user) throw new JobFailure('in_use', `A ${user.kind.replace(/_/g, ' ')} job is using this file. Wait for it to finish, then remove it.`);

  const getObject = deps.getObject || (async (key) => {
    const r = await fetchImpl(await sign('GET', ds.bucket, key));
    if (!r.ok) throw new Error(`Could not read ${key} (${r.status}).`);
    return r.arrayBuffer();
  });
  const keys = await datasetKeys(ds, getObject);
  let n = 0;
  for (const key of keys) {
    const r = await fetchImpl(await sign('DELETE', ds.bucket, key), { method: 'DELETE' });
    if (!r.ok && r.status !== 404) throw new Error(`Removing ${key} failed (${r.status}).`);
    n += 1;
    ctx.progress(0.95 * (n / keys.length), `Removing, ${n} of ${keys.length} objects`);
  }
  const { error: upErr } = await admin.from('qi_datasets')
    .update({ status: 'deleted', upload_id: null, meta: { ...(ds.meta || {}), removed: { by: 'user', at: new Date().toISOString(), objects: n } } })
    .eq('id', ds.id).eq('status', ds.status);
  if (upErr) throw new Error(`The objects are removed but the record could not be updated: ${upErr.message}`);
  ctx.progress(1, 'Done');
  return { dataset_id: ds.id, name: ds.name, kind: ds.kind, removed_objects: n, freed_bytes: Number(ds.bytes) || 0 };
}
