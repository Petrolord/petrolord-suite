// Seismolord's running work in the Suite-wide Activity list (Guided Journey
// design 6.4): browser imports, imports to this computer, uploads to the
// server and jobs running on this computer. Started once when Seismolord
// first mounts and kept for the life of the tab, so the work stays visible
// from every other app. Pure mapping functions are exported for tests.

import { publishActivity } from '@/lib/activity/activity';
import { browserJobs } from '@/lib/localWorkspace/runtime';
import { getImportJobs, JOB_PHASE } from './importJobsRuntime';
import { subscribeLocalImports, getLocalImports, dismissLocalImport } from './localImportRuntime';
import {
  subscribeServerUploads, getServerUploads, pauseServerUpload, resumeServerUpload, dismissServerUpload, UPLOAD_PHASE,
} from './serverUploadsRuntime';
import { describeImportJob, describeServerUpload, describeLocalImport } from '../components/workspace/ImportJobsIndicator';

const HREF = '/dashboard/apps/geoscience/seismolord';
const base = { appId: 'seismolord', appName: 'Seismolord', href: HREF, onLeave: 'continues' };
const frac = (done, total) => (total ? Math.min(1, done / total) : null);

export function importJobItem(job, mgr) {
  const state = job.phase === JOB_PHASE.CONVERTING || job.phase === JOB_PHASE.UPLOADING || job.phase === JOB_PHASE.OFFLINE ? 'running'
    : job.phase === JOB_PHASE.PAUSED || job.phase === JOB_PHASE.RESUMABLE ? 'paused'
      : job.phase === JOB_PHASE.FAILED ? 'failed' : 'done';
  const s = job.stage === 'f32' || job.stage === 'f32_manifest' ? job.f32 : job.display;
  const progress = job.phase === JOB_PHASE.CONVERTING ? frac(job.convert?.done, job.convert?.total) : frac(s?.done, s?.total);
  return {
    ...base,
    id: `sl-import:${job.id}`,
    kind: job.phase === JOB_PHASE.CONVERTING ? 'conversion' : 'upload',
    title: describeImportJob(job),
    progress: state === 'running' ? progress : null,
    state,
    actions: mgr ? {
      ...(job.phase === JOB_PHASE.UPLOADING ? { pause: () => mgr.pause(job.id) } : {}),
      ...(state === 'paused' || (state === 'failed' && !job.conversionFailed) ? { resume: () => mgr.resume(job.id) } : {}),
      ...(state === 'done' ? { dismiss: () => mgr.dismiss(job.id) } : {}),
    } : {},
  };
}

export function localImportItem(job) {
  const state = job.phase === 'converting' ? 'running' : job.phase === 'failed' ? 'failed' : 'done';
  return {
    ...base,
    id: `sl-local:${job.id}`,
    kind: 'conversion',
    title: describeLocalImport(job),
    progress: state === 'running' ? frac(job.convert?.done, job.convert?.total) : null,
    state,
    actions: state === 'running' ? (job.cancel ? { cancel: () => job.cancel() } : {}) : { dismiss: () => dismissLocalImport(job.id) },
  };
}

export function serverUploadItem(u) {
  const state = u.phase === UPLOAD_PHASE.UPLOADING ? 'running' : u.phase === UPLOAD_PHASE.PAUSED ? 'paused'
    : u.phase === UPLOAD_PHASE.FAILED ? 'failed' : 'done';
  return {
    ...base,
    id: `sl-upload:${u.id}`,
    kind: 'upload',
    title: describeServerUpload(u),
    progress: state === 'running' ? frac(u.bytesDone, u.bytesTotal) : null,
    state,
    actions: {
      ...(state === 'running' ? { pause: () => pauseServerUpload(u.id) } : {}),
      ...(state === 'paused' || state === 'failed' ? { resume: () => resumeServerUpload(u.id) } : {}),
      ...(state !== 'running' ? { dismiss: () => dismissServerUpload(u.id) } : {}),
    },
  };
}

export function browserJobItem(j) {
  const state = j.phase === 'running' || j.phase === 'waiting' ? 'running' : j.phase === 'failed' ? 'failed' : 'done';
  return {
    ...base,
    id: `sl-browser-job:${j.id}`,
    kind: 'conversion',
    title: `${j.name}: ${state === 'running' ? `${Math.round((j.fraction || 0) * 100)}% on this computer` : state === 'failed' ? `failed. ${j.error || ''}`.trim() : 'finished on this computer'}`,
    progress: state === 'running' ? j.fraction || 0 : null,
    state,
  };
}

let started = false;

/** Publish Seismolord's work to Activity from now on (idempotent). */
export function startSeismolordActivity() {
  if (started) return;
  started = true;
  const mgr = getImportJobs();
  const jobs = browserJobs();
  const publish = () => publishActivity('seismolord', [
    ...mgr.getSnapshot().map((j) => importJobItem(j, mgr)),
    ...getLocalImports().map(localImportItem),
    ...getServerUploads().map(serverUploadItem),
    ...jobs.getSnapshot().map(browserJobItem),
  ]);
  mgr.subscribe(publish);
  subscribeLocalImports(publish);
  subscribeServerUploads(publish);
  jobs.subscribe(publish);
  publish();
}
