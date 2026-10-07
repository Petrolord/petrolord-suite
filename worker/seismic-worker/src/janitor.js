// Housekeeping for the worker's object store (QI programme Q0b-2). Runs inside
// the worker between jobs, at most once an hour.
//
//   - An upload still unfinished 7 days after it started is abandoned: its
//     parts are aborted in the store and the dataset row is marked deleted,
//     so it stops holding the user's allowance.
//   - A raw SEG-Y is kept 30 days after its upload completed (long enough to
//     convert it again with other settings), then the object is deleted and
//     the row marked deleted. Converted volumes live in Supabase Storage and
//     are not touched.
//   - A SEG-Y export (export_segy, QI Q11) is kept 3 days after its job
//     finished (its download link lasts 24 hours), then the object is
//     deleted and the job's result notes it (result_refs.removed_at).
//
// Decisions recorded in docs/scope/QI-STATUS.md (Q0b). Every step is bounded
// (BATCH rows a run) and idempotent: a store object already gone counts as
// done.
export const ABANDON_AFTER_DAYS = 7;
export const RAW_RETENTION_DAYS = 30;
export const EXPORT_RETENTION_DAYS = 3;
export const BATCH = 50;
const DAY = 86400e3;

/**
 * @param {Object} deps
 * @param {Object} deps.admin supabase-js client (service role)
 * @param {Function} deps.sign makeSigner(cfg.s3) (worker identity)
 * @param {Function} [deps.fetchImpl]
 * @param {() => number} [deps.now]
 * @param {Object} [deps.log]
 * @returns {Promise<{abandoned: number, expired: number, errors: number}>}
 */
export async function runJanitor({ admin, sign, fetchImpl = fetch, now = Date.now, log = console }) {
  const out = { abandoned: 0, expired: 0, exports: 0, errors: 0 };
  const iso = (ms) => new Date(ms).toISOString();

  const mark = async (row, note) => {
    const { error } = await admin.from('qi_datasets')
      .update({ status: 'deleted', upload_id: null, meta: { ...(row.meta || {}), janitor: { note, at: iso(now()) } } })
      .eq('id', row.id).eq('status', row.status);
    if (error) throw new Error(error.message);
  };

  // 1. abandoned uploads
  const { data: stale, error: e1 } = await admin.from('qi_datasets')
    .select('id,status,bucket,object_key,upload_id,meta')
    .eq('status', 'uploading').lt('created_at', iso(now() - ABANDON_AFTER_DAYS * DAY))
    .order('created_at', { ascending: true }).limit(BATCH);
  if (e1) throw new Error(`janitor: ${e1.message}`);
  for (const row of stale || []) {
    try {
      if (row.upload_id) {
        const r = await fetchImpl(await sign('DELETE', row.bucket, row.object_key, { uploadId: row.upload_id }), { method: 'DELETE' });
        if (!r.ok && r.status !== 404) throw new Error(`abort ${r.status}`);
      }
      await mark(row, `Upload abandoned for more than ${ABANDON_AFTER_DAYS} days; its parts were removed.`);
      out.abandoned += 1;
    } catch (e) {
      out.errors += 1;
      log.warn?.(`janitor: could not abandon ${row.id}: ${e.message}`);
    }
  }

  // 2. raw SEG-Y past its retention
  const { data: old, error: e2 } = await admin.from('qi_datasets')
    .select('id,status,bucket,object_key,meta')
    .eq('status', 'uploaded').lt('uploaded_at', iso(now() - RAW_RETENTION_DAYS * DAY))
    .order('uploaded_at', { ascending: true }).limit(BATCH);
  if (e2) throw new Error(`janitor: ${e2.message}`);
  for (const row of old || []) {
    try {
      const r = await fetchImpl(await sign('DELETE', row.bucket, row.object_key), { method: 'DELETE' });
      if (!r.ok && r.status !== 404) throw new Error(`delete ${r.status}`);
      await mark(row, `Raw file removed ${RAW_RETENTION_DAYS} days after upload; converted volumes are kept.`);
      out.expired += 1;
    } catch (e) {
      out.errors += 1;
      log.warn?.(`janitor: could not expire ${row.id}: ${e.message}`);
    }
  }
  // 3. SEG-Y exports past their retention
  const { data: ex, error: e3 } = await admin.from('qi_jobs')
    .select('id,status,result_refs')
    .eq('kind', 'export_segy').eq('status', 'succeeded').lt('finished_at', iso(now() - EXPORT_RETENTION_DAYS * DAY))
    .is('result_refs->>removed_at', null)
    .order('finished_at', { ascending: true }).limit(BATCH);
  if (e3) throw new Error(`janitor: ${e3.message}`);
  for (const job of ex || []) {
    const ref = job.result_refs || {};
    try {
      if (ref.bucket && ref.key) {
        const r = await fetchImpl(await sign('DELETE', ref.bucket, ref.key), { method: 'DELETE' });
        if (!r.ok && r.status !== 404) throw new Error(`delete ${r.status}`);
      }
      const { error } = await admin.from('qi_jobs')
        .update({ result_refs: { ...ref, url: null, removed_at: iso(now()) } })
        .eq('id', job.id).eq('status', 'succeeded');
      if (error) throw new Error(error.message);
      out.exports += 1;
    } catch (e) {
      out.errors += 1;
      log.warn?.(`janitor: could not remove export ${job.id}: ${e.message}`);
    }
  }
  return out;
}
