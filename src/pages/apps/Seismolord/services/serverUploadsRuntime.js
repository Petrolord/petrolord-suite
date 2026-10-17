// Server uploads as background jobs (owner report 2026-10-17). An upload to
// the Petrolord server used to run inside the import dialog: closing it,
// or leaving Seismolord, left the upload going with nothing to show its
// progress or pause it. Here it runs for the life of the tab, whatever is
// on screen; the status bar shows it, and pause and resume work from there.
// Resume needs no re-pick: the picked File is kept with the job, and the
// resumable upload carries on from the parts already stored.

import { useSyncExternalStore } from 'react';
import { speedMeter, saveUploadSpeed } from './cropImport';

export const UPLOAD_PHASE = Object.freeze({
  UPLOADING: 'uploading',
  PAUSED: 'paused',
  DONE: 'done',
  FAILED: 'failed',
});

let nextId = 1;
const jobs = new Map();
const listeners = new Set();
let snapshot = [];

function emit() {
  snapshot = [...jobs.values()].map((j) => ({ ...j.view }));
  listeners.forEach((l) => l());
}

function patch(job, p) {
  job.view = { ...job.view, ...p };
  emit();
}

let unloadGuard = null;
function syncUnloadGuard() {
  const running = [...jobs.values()].some((j) => j.view.phase === UPLOAD_PHASE.UPLOADING);
  if (running && !unloadGuard && typeof window !== 'undefined') {
    unloadGuard = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', unloadGuard);
  } else if (!running && unloadGuard) {
    window.removeEventListener('beforeunload', unloadGuard);
    unloadGuard = null;
  }
}

async function run(job) {
  const ctl = new AbortController();
  job.ctl = ctl;
  const meter = speedMeter();
  patch(job, { phase: UPLOAD_PHASE.UPLOADING, error: null });
  syncUnloadGuard();
  try {
    const result = await job.task({
      signal: ctl.signal,
      onUploadProgress: (p) => {
        meter.add(p.bytesDone + (p.bytesSending || 0));
        const v = meter.mbPerSecond();
        if (v) saveUploadSpeed(v);
        patch(job, { bytesDone: p.bytesDone, bytesTotal: p.bytesTotal || job.view.bytesTotal, mbps: v || job.view.mbps });
      },
    });
    patch(job, { phase: UPLOAD_PHASE.DONE, bytesDone: job.view.bytesTotal, finishedAt: Date.now() });
    job.onDone?.(result);
  } catch (e) {
    if (e?.name === 'AbortError') patch(job, { phase: UPLOAD_PHASE.PAUSED });
    else {
      patch(job, { phase: UPLOAD_PHASE.FAILED, error: e?.message || String(e) });
      job.onError?.(e);
    }
  } finally {
    job.ctl = null;
    syncUnloadGuard();
  }
}

/**
 * Start an upload in the background.
 * @param {Object} p
 * @param {string} p.name what the status bar calls it
 * @param {'volume'|'gathers'} [p.kind]
 * @param {number} p.bytesTotal
 * @param {(io: {signal: AbortSignal, onUploadProgress: Function}) => Promise<any>} p.task
 *   the upload (and registration); re-run as it is on resume
 * @param {(result: any) => void} [p.onDone]
 * @param {(error: Error) => void} [p.onError]
 * @returns {string} job id
 */
export function startServerUpload({ name, kind = 'volume', bytesTotal = 0, task, onDone, onError }) {
  const id = `upload-${nextId++}`;
  const job = {
    task,
    onDone,
    onError,
    ctl: null,
    view: { id, name, kind, phase: UPLOAD_PHASE.UPLOADING, bytesDone: 0, bytesTotal, mbps: null, error: null, startedAt: Date.now() },
  };
  jobs.set(id, job);
  run(job);
  return id;
}

export function pauseServerUpload(id) { jobs.get(id)?.ctl?.abort(); }

export function resumeServerUpload(id) {
  const job = jobs.get(id);
  if (job && !job.ctl && (job.view.phase === UPLOAD_PHASE.PAUSED || job.view.phase === UPLOAD_PHASE.FAILED)) run(job);
}

/** Remove a finished, failed or paused upload from the list (a running one is paused first). */
export function dismissServerUpload(id) {
  const job = jobs.get(id);
  if (!job) return;
  job.ctl?.abort();
  jobs.delete(id);
  emit();
  syncUnloadGuard();
}

export const getServerUploads = () => snapshot;
export const subscribeServerUploads = (l) => { listeners.add(l); return () => listeners.delete(l); };
export const useServerUploads = () => useSyncExternalStore(subscribeServerUploads, getServerUploads, getServerUploads);

/** Tests: start from nothing. */
export function resetServerUploads() {
  for (const j of jobs.values()) j.ctl?.abort();
  jobs.clear();
  emit();
  syncUnloadGuard();
}
