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
//           custom_defs, ingest_rec,
//           pad_top_samples?, crop_provenance?   a file the browser cropped
//                                                before upload: the window's
//                                                top is padded back with nulls
//                                                (also read from the file's
//                                                crop card, which must agree)
//           crop? {def, definition_id}           crop while converting a
//                                                stored file (import from a
//                                                link): only the kept traces
//                                                and samples are converted }
//
// The worker runs with the service role, so this handler checks what RLS
// and the storage policy would otherwise check: the dataset and the volume
// both belong to the job's user, and the converted volume fits the user's
// seismic quota.
import path from 'node:path';
import fsp from 'node:fs/promises';
import { JobFailure } from '../runJob.js';
import { seismicQuota, overQuotaMessage } from '../quota.js';
import {
  openSegyDoor, scanForManifest, alignTraceDelay, scanOnReader, traceDelayRecord,
} from '../../../../src/pages/apps/Seismolord/lib/segyDoor.js';
import { convertToSpool } from '../../../../src/pages/apps/Seismolord/services/conversionV4.js';
import { createTwoStageUpload } from '../../../../src/pages/apps/Seismolord/services/uploadV4.js';
import { applyCrsToScan } from '../../../../src/pages/apps/Seismolord/services/ingestCrs.js';
import { v4SurveyMeta } from '../../../../src/pages/apps/Seismolord/services/v4SurveyMeta.js';
import { applyVerticalToManifest, depthDtUs } from '../../../../src/pages/apps/Seismolord/lib/verticalDomain.js';
import { buildManifestV4, volumeDir } from '../../../../packages/engines/engines/seismolord/manifest.js';
import { datasetReader } from '../datasetReader.js';
import { zgyAwareSource } from '../zgySource.js';
import { readTextualHeader } from '../../../../packages/engines/engines/seismolord/segyScan.js';
import { parseCropCard, padTopReader, croppedSegyReader } from '../../../../packages/engines/engines/seismolord/segyCrop.js';
import {
  planImportCrop, conversionView, scanConversionView, importCropProvenance,
} from '../../../../src/pages/apps/Seismolord/services/cropImport.js';
import { diskSpool } from '../diskSpool.js';
import { isLinkDataset } from '../datasetReader.js';
import { copyToScratch } from '../scratchCopy.js';

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
  if (p.pad_top_samples != null && !(Number.isInteger(p.pad_top_samples) && p.pad_top_samples >= 0 && p.pad_top_samples < 32767)) return 'pad_top_samples must be a whole number of samples.';
  if (p.crop != null && (typeof p.crop !== 'object' || typeof p.crop.def !== 'object' || !p.crop.def)) return 'crop needs a definition.';
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

  // the worker's store, or the link itself for a ranged link import
  const raw = datasetReader(dataset, deps);
  const spoolDir = path.join(deps.scratchDir, `stack_to_v4-${ctx.job.id}-${ctx.job.attempt}`);
  const spool = await diskSpool(spoolDir);
  // a linked file (ranged link import): what the conversion reads (the
  // cropped file, or the whole file) is copied from the link once, into scratch
  const scratch = isLinkDataset(dataset) ? { file: `${spoolDir}.source.sgy`, ctx } : null;
  let copy = null;
  const zgyCopyFile = `${spoolDir}.source.zgy`;
  try {
    // a Petrel ZGY (uploaded as it is, or linked) is read as the SEG-Y it
    // holds, from a scratch copy: its view reads many small ranges, which
    // the store or a link would serve one request each (zgySource.js)
    const zgySrc = await zgyAwareSource(raw, {
      name: p.file_name || dataset.original_filename,
      toScratch: (r) => copyToScratch(r, zgyCopyFile, {
        isCancelled: () => ctx.cancelled,
        onProgress: (done, total) => ctx.progress(0.02 * (done / total), 'Copying the ZGY to the worker'),
      }),
    }, deps);
    copy = zgySrc.scratchCopy;
    const { reader, scan, cropRecord, scratchCopy, traceDelay } = await cropAwareSource(zgySrc.reader, p, dataset, ctx, zgySrc.zgy ? null : scratch);
    copy = copy || scratchCopy || null;
    const record = await convertToSpool({
      reader,
      scan,
      ...(zgySrc.clip ? { clip: zgySrc.clip } : {}),
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

    const { scan: placed, crsBlock } = applyCrsToScan(scanForManifest(scan, record), p.crs_plan, p.custom_defs || {});
    const td = traceDelayRecord(traceDelay);
    const ingestRec = { ...p.ingest_rec, ...(cropRecord ? { crop: cropRecord } : {}), ...(td ? { trace_delay: td } : {}) };
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
    if (cropRecord) manifest.source.crop = cropRecord;
    if (td) manifest.source.trace_delay = td;
    // a depth import (P1.6): the vertical axis the user declared
    applyVerticalToManifest(manifest, p.ingest_rec?.vertical);

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
          await updateRow({ status: 'display_ready', survey_meta: v4SurveyMeta(manifest, record, ingestRec) });
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
    await copy?.remove();
    if (scratch) await fsp.rm(scratch.file, { force: true }); // a copy cut short by a failure
    await fsp.rm(zgyCopyFile, { force: true });
  }
}

/**
 * The reader and scan a conversion runs on:
 *  - a plain upload: the file through the SEG-Y door;
 *  - a plain upload's trace delay (byte 109) is honoured (F-5): the
 *    samples move onto their true times on the 0 ms axis;
 *  - a file cropped before upload: the same, with the window's top padded
 *    back so the volume keeps the 0 ms origin (from the cropped file's
 *    delay, else the crop card's first sample, which must agree with the
 *    browser's);
 *  - a crop while converting (import from a link): only the kept traces and
 *    samples of the stored file are read, and the scan is re-measured on them.
 */
export async function cropAwareSource(raw, p, dataset, ctx = {}, scratch = null) {
  const toScratch = async (reader) => {
    if (!scratch) return { reader, scratchCopy: null };
    const c = await copyToScratch(reader, scratch.file, {
      isCancelled: () => ctx.cancelled,
      onProgress: (done, total) => ctx.progress?.(0.02 * (done / total), `Reading ${scratch.what || 'the file'} from the link`),
    });
    return { reader: c, scratchCopy: c };
  };
  if (p.crop?.def) {
    ctx.progress?.(0.01, 'Finding the kept traces');
    let prep;
    try {
      // a depth import's window is in its depth unit, read by the declared interval (P1.6)
      const vertical = p.ingest_rec?.vertical?.domain === 'depth' ? p.ingest_rec.vertical : null;
      prep = await planImportCrop({
        raw, scan: p.scan, def: p.crop.def, mapping: p.scan.mapping, isCancelled: () => ctx.cancelled, ...(vertical ? { dtUs: depthDtUs(vertical) } : {}),
      });
    } catch (e) {
      throw new JobFailure('validate_failed', `The crop could not be applied: ${e.message}`);
    }
    const name = p.file_name || dataset.original_filename;
    const cropped0 = croppedSegyReader(raw, prep.layout, prep.plan, prep.crop, { sourceName: name, mapping: p.scan.mapping });
    if (scratch) scratch.what = 'the kept traces';
    const { reader: cropped, scratchCopy } = await toScratch(cropped0);
    const reader = await conversionView(cropped, prep.crop);
    const scan = await scanConversionView(reader, p.scan.mapping);
    const cropRecord = importCropProvenance(prep, {
      file: { name, size: Number(dataset.bytes) }, mode: 'server', definitionId: p.crop.definition_id || null, vertical: p.ingest_rec?.vertical || null,
    });
    return { reader, scan, cropRecord, scratchCopy, traceDelay: prep.traceDelay };
  }
  const { reader: whole, scratchCopy } = await toScratch(raw);
  const { reader } = await openSegyDoor(whole);
  const card = parseCropCard(await readTextualHeader(reader));
  const pad = card ? card.first : 0;
  if (p.pad_top_samples != null && p.pad_top_samples !== pad) {
    throw new JobFailure('validate_failed', `The uploaded file's crop starts at sample ${pad}; the import said ${p.pad_top_samples}. Upload the file again.`);
  }
  const cropRecord = p.crop_provenance || null;
  // F-5: the trace delay honoured. A cropped file's delay is its source's
  // plus the window's top (the crop writes byte 109), so this places the
  // window too, at its true times; the scan follows the shifted traces.
  const domain = p.ingest_rec?.vertical?.domain === 'depth' ? 'depth' : 'time';
  const aligned = await alignTraceDelay(reader, { domain });
  const traceDelay = card ? (cropRecord?.trace_delay || null) : aligned.traceDelay;
  if (aligned.traceDelay.applied) {
    return { reader: aligned.reader, scan: await scanOnReader(p.scan, aligned.reader), cropRecord, traceDelay, scratchCopy };
  }
  if (!pad) return { reader, scan: p.scan, cropRecord, traceDelay, scratchCopy };
  return { reader: await padTopReader(reader, pad), scan: p.scan, cropRecord, traceDelay, scratchCopy };
}
