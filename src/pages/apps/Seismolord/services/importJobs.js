// Background SEG-Y import jobs for manifest v4 volumes (large-survey plan,
// sections 3 and 5). A job converts the file into the local spool, then
// uploads it in two stages while the user keeps working: the import
// dialog closes as soon as the job starts, progress shows in the status
// bar, and the page warns before unload while a job is pending.
//
// Row status (seismic_volumes.status is free text; no DDL):
//   'converting'     registered; conversion and the display upload run
//   'display_ready'  display copy and manifest (display.complete) are up;
//                    the survey opens from the server; float32 uploading
//   'ready'          float32 copy up too (f32.complete)
//
// The manager is built from injected dependencies so jest can drive the
// whole job (conversion, upload, row transitions, resume) against mocks;
// the production singleton (getImportJobs) wires Supabase, OPFS and the
// conversion worker.

import { useSyncExternalStore } from 'react';
import { buildManifestV4, volumeDir } from '../engine/manifest';
import { createTwoStageUpload, UPLOAD_STATUS } from './uploadV4';
import { applyCrsToScan } from './ingestCrs';
import { publishConversionProgress, clearConversionProgress } from '../sources/conversionProgress';

export const V4_STATUS = Object.freeze({
  CONVERTING: 'converting',
  DISPLAY_READY: 'display_ready',
  READY: 'ready',
});

/** Row statuses a viewer can open (display_ready serves the display copy). */
export const OPENABLE_STATUSES = Object.freeze([V4_STATUS.READY, V4_STATUS.DISPLAY_READY]);
export const isOpenableVolume = (v) => OPENABLE_STATUSES.includes(v?.status);

/** What a worker needs to read a v4 store through the v1 brick names
 *  (engine v4BrickFetcher); null for every other manifest. */
export const v4ReadInfo = (m) => (m?.manifest_version === 4 ? {
  manifest_version: 4,
  f32: { complete: Boolean(m.f32?.complete), compression: m.f32?.compression },
  display: { clip: m.display?.clip, compression: m.display?.compression },
} : null);

/** Job phases shown in the status bar. */
export const JOB_PHASE = Object.freeze({
  CONVERTING: 'converting',
  UPLOADING: 'uploading',
  PAUSED: 'paused',
  OFFLINE: 'offline',
  FAILED: 'failed',
  DONE: 'done',
  CANCELLED: 'cancelled',
  RESUMABLE: 'resumable',
});

const PENDING = new Set([JOB_PHASE.CONVERTING, JOB_PHASE.UPLOADING, JOB_PHASE.PAUSED, JOB_PHASE.OFFLINE]);
export const isPendingJob = (job) => PENDING.has(job?.phase);

/**
 * The survey_meta a v4 row carries once the display copy is up: the v1
 * fields (so every existing consumer reads it unchanged) plus the v4
 * copy sizes. storage_bytes is what is actually stored (compressed).
 */
export function v4SurveyMeta(manifest, record, ingestRec) {
  const g = manifest.geometry;
  const displayBytes = record.bricks.display.storedBytes;
  const f32Bytes = record.bricks.f32.storedBytes;
  return {
    il: g.il,
    xl: g.xl,
    ns: g.ns,
    dt_us: g.dt_us,
    corners: g.corners,
    ...(g.affine ? { affine: g.affine } : {}),
    ...(g.coord_scalar != null ? { coord_scalar: g.coord_scalar } : {}),
    ...(g.crs ? { crs: g.crs } : {}),
    sample_format: manifest.source.sample_format,
    il_byte: manifest.source.il_byte,
    xl_byte: manifest.source.xl_byte,
    brick: manifest.brick.grid,
    brick_size: manifest.brick.size,
    stats: manifest.stats,
    storage_bytes: displayBytes + f32Bytes,
    v4: {
      display_bytes: displayBytes,
      f32_bytes: f32Bytes,
      clip: manifest.display.clip,
      levels: manifest.display.levels.length,
    },
    ingest: ingestRec,
  };
}

/**
 * @param {Object} deps
 * @param {(p: Object) => Promise<Object>} deps.prepare register the row:
 *   ({file, mapping, nativeCrs, name}) -> {volumeId, userId, name, ingestRec,
 *   crsPlan, customDefs}
 * @param {(volumeId: string, patch: Object) => Promise<Object>} deps.updateRow
 * @param {(volumeId: string) => Promise<?Object>} deps.getRow
 * @param {(volumeId: string) => Promise<Object>} deps.openSpool
 * @param {() => Promise<string[]>} deps.listSpools
 * @param {(volumeId: string) => Promise<void>} deps.removeSpool
 * @param {(p: {file, scan, volumeId, onProgress, cancelToken}) => Promise<Object>} deps.convert
 *   runs the conversion into the spool, resolves conversionRecord
 * @param {Object} deps.storage upload storage client (seismicStorageClient)
 * @param {Object} [deps.uploadOptions] passed to createTwoStageUpload
 *   (network, sleep, retry, concurrency)
 * @param {(fn: Function) => Function} [deps.onBeforeUnload] install a
 *   beforeunload guard; returns the remover
 * @param {(p: Object) => void} [deps.publish] conversion progress sink
 */
export function createImportJobManager(deps) {
  const jobs = new Map();
  const listeners = new Set();
  let snapshot = [];
  const publish = deps.publish || (() => {});

  let removeUnloadGuard = null;
  const syncUnloadGuard = () => {
    const pending = [...jobs.values()].some((j) => isPendingJob(j.view));
    if (pending && !removeUnloadGuard && deps.onBeforeUnload) {
      removeUnloadGuard = deps.onBeforeUnload(() => [...jobs.values()].some((j) => isPendingJob(j.view)));
    } else if (!pending && removeUnloadGuard) {
      removeUnloadGuard();
      removeUnloadGuard = null;
    }
  };

  const emit = () => {
    snapshot = [...jobs.values()].map((j) => ({ ...j.view }));
    syncUnloadGuard();
    for (const l of listeners) l();
  };

  const setView = (job, patch) => {
    job.view = { ...job.view, ...patch };
    emit();
  };

  const uploadPhase = (status) => ({
    [UPLOAD_STATUS.PAUSED]: JOB_PHASE.PAUSED,
    [UPLOAD_STATUS.OFFLINE]: JOB_PHASE.OFFLINE,
    [UPLOAD_STATUS.FAILED]: JOB_PHASE.FAILED,
    [UPLOAD_STATUS.CANCELLED]: JOB_PHASE.CANCELLED,
    [UPLOAD_STATUS.DONE]: JOB_PHASE.DONE,
  }[status] || JOB_PHASE.UPLOADING);

  async function runUpload(job) {
    const { volumeId, spool, record } = job;
    const saved = await spool.getJson('job');
    const { manifest, dir, ingestRec } = saved;
    job.upload = createTwoStageUpload({
      storage: deps.storage,
      spool,
      dir,
      manifest,
      totals: record ? { display: record.bricks.display, f32: record.bricks.f32 } : {},
      ...(deps.uploadOptions || {}),
      onStage: async (stage) => {
        if (stage === 'display_ready') {
          await deps.updateRow(volumeId, {
            status: V4_STATUS.DISPLAY_READY,
            survey_meta: v4SurveyMeta(manifest, saved.record, ingestRec),
          });
          setView(job, { status: V4_STATUS.DISPLAY_READY });
          if (job.onRowChange) job.onRowChange(V4_STATUS.DISPLAY_READY);
        } else if (stage === 'ready') {
          await deps.updateRow(volumeId, { status: V4_STATUS.READY });
          setView(job, { status: V4_STATUS.READY });
          if (job.onRowChange) job.onRowChange(V4_STATUS.READY);
        }
      },
      onProgress: (s) => {
        setView(job, {
          phase: uploadPhase(s.status),
          stage: s.stage,
          display: s.display,
          f32: s.f32,
          retries: s.retries,
          error: s.error,
        });
        publish({
          fileName: job.view.fileName,
          phase: 'upload',
          done: s.display.done + s.f32.done,
          total: (s.display.total || 0) + (s.f32.total || 0) || null,
        });
      },
    });
    try {
      await job.upload.run();
      await deps.removeSpool(volumeId);
      setView(job, { phase: JOB_PHASE.DONE });
    } catch (err) {
      if (err?.name === 'UploadCancelled') setView(job, { phase: JOB_PHASE.CANCELLED });
      else setView(job, { phase: JOB_PHASE.FAILED, error: err.message });
    } finally {
      publish(null);
    }
  }

  function newJob(volumeId, view) {
    const job = {
      volumeId,
      cancelToken: { cancelled: false },
      view: {
        id: volumeId,
        phase: JOB_PHASE.CONVERTING,
        status: V4_STATUS.CONVERTING,
        convert: null,
        display: null,
        f32: null,
        retries: 0,
        error: null,
        startedAt: Date.now(),
        ...view,
      },
    };
    jobs.set(volumeId, job);
    emit();
    return job;
  }

  /**
   * Start a background import. Resolves once the row is registered and
   * the conversion has started (the dialog can close); `done` resolves
   * when the whole job settles.
   * @param {{file: File, mapping: Object, scan: Object, nativeCrs?: string,
   *   name?: string, onRowChange?: (status: string) => void}} p
   */
  async function start({ file, mapping, scan, nativeCrs, name, onRowChange }) {
    const prep = await deps.prepare({ file, mapping, nativeCrs, name });
    const { volumeId, userId } = prep;
    const dir = volumeDir(userId, volumeId);
    const job = newJob(volumeId, { name: prep.name, fileName: file.name, fileSize: file.size });
    job.onRowChange = onRowChange;
    job.spool = await deps.openSpool(volumeId);

    const done = (async () => {
      try {
        const record = await deps.convert({
          file,
          scan,
          volumeId,
          spool: job.spool,
          cancelToken: job.cancelToken,
          onProgress: (p) => {
            setView(job, { convert: p });
            publish({ fileName: file.name, phase: 'transcode', done: p.done, total: p.total });
          },
        });
        job.record = record;
        const { scan: placed, crsBlock } = applyCrsToScan(scan, prep.crsPlan, prep.customDefs);
        const manifest = buildManifestV4({
          volumeId,
          name: prep.name,
          scan: placed,
          transcode: record,
          sourceFileName: file.name,
          sourceFileSize: file.size,
          crs: crsBlock,
        });
        manifest.source.fingerprint = prep.ingestRec.fingerprint;
        // everything a later session needs to finish the upload without
        // the SEG-Y: written only once the conversion is complete
        await job.spool.putJson('job', {
          volumeId, userId, dir, name: prep.name, fileName: file.name, manifest, record, ingestRec: prep.ingestRec,
        });
        setView(job, { phase: JOB_PHASE.UPLOADING });
        await runUpload(job);
      } catch (err) {
        if (job.cancelToken.cancelled) {
          setView(job, { phase: JOB_PHASE.CANCELLED });
        } else {
          setView(job, { phase: JOB_PHASE.FAILED, error: err.message, conversionFailed: !job.record });
        }
        publish(null);
        if (!job.record) await deps.removeSpool(volumeId).catch(() => {});
      }
    })();
    job.done = done;
    return { volumeId, done };
  }

  /** Find uploads a previous session left in the spool and list them as
   *  resumable (nothing is sent until the user resumes). */
  async function discover() {
    const ids = await deps.listSpools();
    const found = [];
    for (const volumeId of ids) {
      if (jobs.has(volumeId)) continue;
      // eslint-disable-next-line no-await-in-loop
      const spool = await deps.openSpool(volumeId);
      // eslint-disable-next-line no-await-in-loop
      const saved = await spool.getJson('job');
      // eslint-disable-next-line no-await-in-loop
      const row = await deps.getRow(volumeId).catch(() => null);
      const live = row && (row.status === V4_STATUS.CONVERTING || row.status === V4_STATUS.DISPLAY_READY);
      if (!saved || !live) {
        // an interrupted conversion (no job record), or a volume that is
        // gone or already complete: the local copy has no further use
        // eslint-disable-next-line no-await-in-loop
        await deps.removeSpool(volumeId).catch(() => {});
        continue;
      }
      const job = newJob(volumeId, {
        name: saved.name, fileName: saved.fileName, phase: JOB_PHASE.RESUMABLE, status: row.status,
      });
      job.spool = spool;
      job.record = saved.record;
      found.push(volumeId);
    }
    return found;
  }

  function get(volumeId) {
    const job = jobs.get(volumeId);
    if (!job) throw new Error('No such import.');
    return job;
  }

  return {
    start,
    discover,
    /** Resume a discovered upload, or retry a failed one (skips what is up). */
    resume(volumeId) {
      const job = get(volumeId);
      if (job.view.phase === JOB_PHASE.PAUSED) { job.upload.resume(); return job.done; }
      if (job.view.phase === JOB_PHASE.RESUMABLE || (job.view.phase === JOB_PHASE.FAILED && job.record)) {
        setView(job, { phase: JOB_PHASE.UPLOADING, error: null });
        job.done = runUpload(job);
        return job.done;
      }
      return job.done;
    },
    pause(volumeId) {
      const job = get(volumeId);
      if (job.upload) job.upload.pause();
    },
    cancel(volumeId) {
      const job = get(volumeId);
      job.cancelToken.cancelled = true;
      if (job.upload) job.upload.cancel();
    },
    /** Remove a settled job from the list (its spool stays if resumable). */
    dismiss(volumeId) {
      const job = jobs.get(volumeId);
      if (job && !isPendingJob(job.view)) { jobs.delete(volumeId); emit(); }
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    getSnapshot: () => snapshot,
    hasPending: () => [...jobs.values()].some((j) => isPendingJob(j.view)),
  };
}

// ---- production wiring ----------------------------------------------------

let singleton = null;
let singletonFactory = null;

/** Install the production dependency factory (importJobsRuntime.js). */
export function setImportJobsFactory(factory) {
  singletonFactory = factory;
}

export function getImportJobs() {
  if (!singleton) {
    if (!singletonFactory) throw new Error('Import jobs are not configured.');
    singleton = createImportJobManager({
      ...singletonFactory(),
      publish: (p) => (p ? publishConversionProgress(p) : clearConversionProgress()),
    });
  }
  return singleton;
}

const EMPTY = [];
const subscribeJobs = (fn) => (singleton || singletonFactory ? getImportJobs().subscribe(fn) : () => {});
const jobsSnapshot = () => (singleton ? singleton.getSnapshot() : EMPTY);

/** React hook: the job list ([] until the first job or discovery). */
export function useImportJobs() {
  return useSyncExternalStore(subscribeJobs, jobsSnapshot, jobsSnapshot);
}
