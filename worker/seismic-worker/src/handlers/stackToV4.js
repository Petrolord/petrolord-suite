// stack_to_v4: convert an uploaded post-stack SEG-Y into a Seismolord
// manifest v4 volume on the server (QI programme Q0; Q0b makes it the path
// for large surveys). It runs the browser import's own code, in the same
// order as importJobs.start(): openSegyDoor -> convertToSpool -> manifest ->
// two-stage upload with the same row transitions (converting ->
// display_ready -> ready). Only the reader (object store ranges), the spool
// (scratch disk) and the storage client (service role) differ.
//
// The browser does the parts that need the user's local file or settings
// (scan preview, fingerprint, CRS plan) and registers the seismic_volumes
// row as 'converting' before it enqueues, exactly as its own prepare() does.
//
// params: { dataset_id, volume_id, name, file_name, scan, crs_plan,
//           custom_defs, ingest_rec }
//
// The worker runs with the service role, so this handler checks what RLS
// and the storage policy would otherwise check: the dataset and the volume
// both belong to the job's user, and the converted volume fits the user's
// seismic quota.
import path from 'node:path';
import { JobFailure } from '../runJob.js';
import { seismicQuota, overQuotaMessage } from '../quota.js';
import { openSegyDoor, scanForManifest } from '../../../../src/pages/apps/Seismolord/lib/segyDoor.js';
import { convertToSpool } from '../../../../src/pages/apps/Seismolord/services/conversionV4.js';
import { createTwoStageUpload } from '../../../../src/pages/apps/Seismolord/services/uploadV4.js';
import { applyCrsToScan } from '../../../../src/pages/apps/Seismolord/services/ingestCrs.js';
import { v4SurveyMeta } from '../../../../src/pages/apps/Seismolord/services/v4SurveyMeta.js';
import { buildManifestV4, volumeDir } from '../../../../packages/engines/engines/seismolord/manifest.js';
import { s3RangeReader } from '../s3.js';
import { diskSpool } from '../diskSpool.js';

export const SEISMIC_BUCKET = 'seismic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALWAYS_ONLINE = { isOnline: () => true, onOnline: () => () => {} };

export function validateParams(p) {
  if (!p || typeof p !== 'object') return 'Missing job settings.';
  if (!UUID.test(String(p.dataset_id))) return 'dataset_id is required.';
  if (!UUID.test(String(p.volume_id))) return 'volume_id is required.';
  if (!p.scan || typeof p.scan !== 'object' || !p.scan.il || !p.scan.xl) return 'scan is required (the import preview).';
  if (!p.crs_plan || typeof p.crs_plan !== 'object') return 'crs_plan is required.';
  if (!p.ingest_rec || typeof p.ingest_rec !== 'object') return 'ingest_rec is required.';
  return null;
}

/**
 * @param {Object} ctx runJob context (job, params, progress, cancelled, log)
 * @param {Object} deps
 * @param {Object} deps.admin supabase-js client with the service role
 * @param {Object} deps.storage upload storage client for the seismic bucket
 * @param {Function} deps.sign makeSigner(cfg.s3)
 * @param {string} deps.scratchDir
 * @param {Object} [deps.codec] brick codec ({compression, deflate})
 * @param {number} [deps.memoryBudgetBytes]
 * @param {Function} [deps.fetchImpl]
 * @param {Function} [deps.makeReader] (dataset) => ByteReader (tests)
 * @param {Object} [deps.convertOptions] extra convertToSpool options (tests:
 *   a small brickSize and levels so a tiny fixture spans several bricks)
 */
export async function stackToV4(ctx, deps) {
  const p = ctx.params;
  const problem = validateParams(p);
  if (problem) throw new JobFailure('validate_failed', problem);
  const uid = ctx.job.user_id;
  const { admin } = deps;

  const { data: dataset, error: dErr } = await admin.from('qi_datasets').select('*').eq('id', p.dataset_id).maybeSingle();
  if (dErr) throw new Error(`Could not read the uploaded file record: ${dErr.message}`);
  if (!dataset || dataset.user_id !== uid) throw new JobFailure('not_found', 'The uploaded file was not found in your account.');
  if (dataset.status !== 'uploaded') throw new JobFailure('validate_failed', `The uploaded file is ${dataset.status}, not ready to convert.`);

  const { data: volume, error: vErr } = await admin.from('seismic_volumes').select('id,user_id,status,name').eq('id', p.volume_id).maybeSingle();
  if (vErr) throw new Error(`Could not read the volume record: ${vErr.message}`);
  if (!volume || volume.user_id !== uid) throw new JobFailure('not_found', 'The volume to convert into was not found in your account.');
  if (volume.status !== 'converting') throw new JobFailure('validate_failed', `The volume is ${volume.status}; only a volume being imported can be converted into.`);

  const volumeId = volume.id;
  const updateRow = async (patch) => {
    const { error } = await admin.from('seismic_volumes')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', volumeId).eq('user_id', uid);
    if (error) throw new Error(`Could not update the volume: ${error.message}`);
  };

  const raw = deps.makeReader
    ? deps.makeReader(dataset)
    : s3RangeReader({ sign: deps.sign, bucket: dataset.bucket, key: dataset.object_key, size: Number(dataset.bytes), fetchImpl: deps.fetchImpl });
  const spool = await diskSpool(path.join(deps.scratchDir, `stack_to_v4-${ctx.job.id}-${ctx.job.attempt}`));
  try {
    const { reader } = await openSegyDoor(raw);
    const record = await convertToSpool({
      reader,
      scan: p.scan,
      spool,
      codec: deps.codec,
      ...(deps.convertOptions || {}),
      ...(deps.memoryBudgetBytes ? { memoryBudgetBytes: deps.memoryBudgetBytes } : {}),
      isCancelled: () => ctx.cancelled,
      onProgress: (e) => {
        const f = e.total ? e.done / e.total : 0;
        if (e.phase === 'convert') ctx.progress(0.05 + 0.6 * f, 'Converting');
        else ctx.progress(0.02, e.phase === 'index' ? 'Indexing traces' : 'Measuring amplitudes');
      },
    });
    if (ctx.cancelled) return null;

    const { scan: placed, crsBlock } = applyCrsToScan(scanForManifest(p.scan, record), p.crs_plan, p.custom_defs || {});
    const manifest = buildManifestV4({
      volumeId,
      name: p.name || volume.name,
      scan: placed,
      transcode: record,
      sourceFileName: p.file_name || dataset.original_filename,
      sourceFileSize: Number(dataset.bytes),
      crs: crsBlock,
    });
    manifest.source.fingerprint = p.ingest_rec.fingerprint;

    const need = record.bricks.display.storedBytes + record.bricks.f32.storedBytes;
    const q = await seismicQuota(admin, uid);
    if (q.used + need > q.quota) throw new JobFailure('over_quota', overQuotaMessage('The converted volume', need, q));

    const upload = createTwoStageUpload({
      storage: deps.storage,
      spool,
      dir: volumeDir(uid, volumeId),
      manifest,
      totals: { display: record.bricks.display, f32: record.bricks.f32 },
      network: ALWAYS_ONLINE,
      onStage: async (stage) => {
        if (stage === 'display_ready') {
          await updateRow({ status: 'display_ready', survey_meta: v4SurveyMeta(manifest, record, p.ingest_rec) });
        } else if (stage === 'ready') {
          await updateRow({ status: 'ready' });
        }
      },
      onProgress: (s) => {
        const total = (s.display.total || 0) + (s.f32.total || 0);
        const done = s.display.done + s.f32.done;
        ctx.progress(0.65 + 0.35 * (total ? done / total : 0), s.stage === 'f32' ? 'Uploading full-resolution copy' : 'Uploading display copy');
      },
    });
    const watch = setInterval(() => { if (ctx.cancelled) upload.cancel(); }, 1000);
    try {
      await upload.run();
    } catch (e) {
      if (e?.name === 'UploadCancelled') return null;
      throw new JobFailure('upload_failed', `Uploading the converted volume failed: ${e.message}`);
    } finally {
      clearInterval(watch);
    }
    return {
      volume_id: volumeId,
      display_bytes: record.bricks.display.storedBytes,
      f32_bytes: record.bricks.f32.storedBytes,
      bricks: record.bricks.display.bricks + record.bricks.f32.bricks,
      trace_count: record.traceCount,
    };
  } finally {
    await spool.destroy();
  }
}
