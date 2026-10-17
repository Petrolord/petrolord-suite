// Status-bar readout of background SEG-Y imports (large-survey plan,
// section 5): per-stage progress (converting, display copy, full
// precision), pause and resume, retry after a failure, and uploads a
// previous session left unfinished. Self-contained, like the CRS chip:
// it discovers resumable uploads on mount and reads the job store.

import React, { useEffect } from 'react';
import {
  Loader2, Pause, Play, RotateCcw, X, CheckCircle2, XCircle, WifiOff, Eye,
} from 'lucide-react';
import {
  useServerUploads, pauseServerUpload, resumeServerUpload, dismissServerUpload, UPLOAD_PHASE,
} from '../../services/serverUploadsRuntime';
import { useImportJobs, getImportJobs, JOB_PHASE, V4_STATUS } from '../../services/importJobsRuntime';
import { useLocalImports, dismissLocalImport } from '../../services/localImportRuntime';
import { useBrowserJobs } from '@/lib/localWorkspace/runtime';

/** One line for an import to this computer (Local Workspace). */
export function describeLocalImport(job) {
  const name = job.name || 'SEG-Y import';
  if (job.phase === 'converting') {
    const c = job.convert;
    const conv = !c || c.phase === 'clip' ? 'measuring amplitudes' : `converting ${pct(c.done, c.total)}%`;
    const h = job.hash ? `, checking the file ${pct(job.hash.done, job.hash.total)}%` : '';
    return `${name}: to this computer, ${conv}${h}`;
  }
  if (job.phase === 'done') return `${name}: on this computer${job.previewError ? ' (preview not shared)' : ''}`;
  if (job.phase === 'cancelled') return `${name}: cancelled`;
  return `${name}: import to this computer failed. ${job.error || ''}`.trim();
}

const MB = 1024 * 1024;
const pct = (done, total) => (total ? Math.min(100, Math.floor((done / total) * 100)) : 0);
const mb = (b) => (b >= 10 * MB ? `${Math.round(b / MB).toLocaleString('en-US')} MB` : `${(b / MB).toFixed(1)} MB`);

/** One line of text for a job (exported for tests and the tooltip). */
export function describeImportJob(job) {
  const name = job.name || job.fileName || 'SEG-Y import';
  switch (job.phase) {
    case JOB_PHASE.CONVERTING: {
      const c = job.convert;
      if (!c || c.phase === 'clip') return `${name}: measuring amplitudes`;
      // SEIS-U1-018: the lattice pass of an irregular or unsorted file
      if (c.phase === 'index') return `${name}: indexing trace headers ${pct(c.done, c.total)}%`;
      return `${name}: converting ${pct(c.done, c.total)}%`;
    }
    case JOB_PHASE.UPLOADING:
    case JOB_PHASE.PAUSED:
    case JOB_PHASE.OFFLINE: {
      const second = job.stage === 'f32' || job.stage === 'f32_manifest';
      const s = second ? job.f32 : job.display;
      const what = second ? 'full precision' : 'display copy';
      const size = s?.totalBytes ? ` of ${mb(s.totalBytes)}` : '';
      const lead = job.phase === JOB_PHASE.PAUSED ? 'paused, '
        : job.phase === JOB_PHASE.OFFLINE ? 'waiting for the connection, ' : '';
      return `${name}: ${lead}uploading ${what} ${pct(s?.done, s?.total)}%${s?.bytes ? ` (${mb(s.bytes)}${size})` : ''}`;
    }
    case JOB_PHASE.RESUMABLE:
      return `${name}: upload not finished`;
    case JOB_PHASE.FAILED:
      return `${name}: ${job.conversionFailed ? 'conversion' : 'upload'} failed. ${job.error || ''}`.trim();
    case JOB_PHASE.CANCELLED:
      return `${name}: cancelled`;
    case JOB_PHASE.DONE:
      return `${name}: imported`;
    default:
      return name;
  }
}

/** One line for a background upload to the Petrolord server (exported for tests). */
export function describeServerUpload(u) {
  const what = u.kind === 'gathers' ? 'gathers' : 'to the server';
  const pctDone = pct(u.bytesDone, u.bytesTotal);
  const size = u.bytesTotal ? ` (${mb(u.bytesDone || 0)} of ${mb(u.bytesTotal)})` : '';
  switch (u.phase) {
    case UPLOAD_PHASE.UPLOADING: {
      const left = u.mbps && u.bytesTotal ? Math.max(0, (u.bytesTotal - (u.bytesDone || 0)) / (u.mbps * MB)) : null;
      const eta = left == null ? '' : left < 90 ? `, about ${Math.ceil(left)} s left` : `, about ${Math.ceil(left / 60)} min left`;
      return `${u.name}: uploading ${what} ${pctDone}%${size}${eta}`;
    }
    case UPLOAD_PHASE.PAUSED: return `${u.name}: upload paused at ${pctDone}%`;
    case UPLOAD_PHASE.FAILED: return `${u.name}: upload stopped. ${u.error || ''}`.trim();
    case UPLOAD_PHASE.DONE: return u.kind === 'gathers' ? `${u.name}: gathers uploaded` : `${u.name}: uploaded, converting on the server`;
    default: return u.name;
  }
}

const Btn = ({ title, onClick, children }) => (
  <button type="button" title={title} aria-label={title} onClick={onClick} className="hover:text-pl-text p-0.5">
    {children}
  </button>
);

export default function ImportJobsIndicator() {
  const jobs = useImportJobs();
  const local = useLocalImports();
  const running = useBrowserJobs().filter((j) => j.phase === 'running' || j.phase === 'waiting');
  const uploads = useServerUploads();

  useEffect(() => {
    getImportJobs().discover().catch(() => {});
  }, []);

  if (!jobs.length && !local.length && !running.length && !uploads.length) return null;
  const mgr = getImportJobs();

  return (
    <span className="flex items-center gap-3 min-w-0" data-testid="import-jobs">
      {uploads.map((u) => {
        const text = describeServerUpload(u);
        const color = u.phase === UPLOAD_PHASE.FAILED ? 'text-pl-danger-text'
          : u.phase === UPLOAD_PHASE.DONE ? 'text-pl-success-text'
            : u.phase === UPLOAD_PHASE.PAUSED ? 'text-pl-warning-text' : 'text-pl-primary-text';
        return (
          <span key={u.id} className={`flex items-center gap-1.5 min-w-0 ${color}`} title={text} data-testid="server-upload-job">
            {u.phase === UPLOAD_PHASE.UPLOADING && <Loader2 className="w-3 h-3 animate-spin shrink-0" />}
            {u.phase === UPLOAD_PHASE.DONE && <CheckCircle2 className="w-3 h-3 shrink-0" />}
            {u.phase === UPLOAD_PHASE.FAILED && <XCircle className="w-3 h-3 shrink-0" />}
            <span className="truncate max-w-[340px]">{text}</span>
            {u.phase === UPLOAD_PHASE.UPLOADING && <Btn title="Pause the upload" onClick={() => pauseServerUpload(u.id)}><Pause className="w-3 h-3" /></Btn>}
            {(u.phase === UPLOAD_PHASE.PAUSED || u.phase === UPLOAD_PHASE.FAILED) && (
              <Btn title="Resume: the parts already stored are not sent again" onClick={() => resumeServerUpload(u.id)}><Play className="w-3 h-3" /></Btn>
            )}
            {u.phase !== UPLOAD_PHASE.UPLOADING && <Btn title="Dismiss" onClick={() => dismissServerUpload(u.id)}><X className="w-3 h-3" /></Btn>}
          </span>
        );
      })}
      {local.map((job) => (
        <span key={job.id} className={`flex items-center gap-1.5 min-w-0 ${job.phase === 'failed' ? 'text-pl-danger-text' : job.phase === 'done' ? 'text-pl-success-text' : 'text-pl-primary-text'}`} title={describeLocalImport(job)} data-testid="local-import-job">
          {job.phase === 'converting' && <Loader2 className="w-3 h-3 animate-spin shrink-0" />}
          {job.phase === 'done' && <CheckCircle2 className="w-3 h-3 shrink-0" />}
          {job.phase === 'failed' && <XCircle className="w-3 h-3 shrink-0" />}
          <span className="truncate max-w-[340px]">{describeLocalImport(job)}</span>
          {job.phase === 'converting' && job.cancel && <Btn title="Cancel the import" onClick={() => job.cancel()}><X className="w-3 h-3" /></Btn>}
          {job.phase !== 'converting' && <Btn title="Dismiss" onClick={() => dismissLocalImport(job.id)}><X className="w-3 h-3" /></Btn>}
        </span>
      ))}
      {running.length > 0 && (
        <span className="flex items-center gap-1.5 text-pl-primary-text" data-testid="local-jobs-running" title={running.map((j) => `${j.name}: ${Math.round((j.fraction || 0) * 100)}%`).join('\n')}>
          <Loader2 className="w-3 h-3 animate-spin shrink-0" />
          {`${running.length} job${running.length === 1 ? '' : 's'} on this computer`}
        </span>
      )}
      {jobs.map((job) => {
        const text = describeImportJob(job);
        const viewable = job.status === V4_STATUS.DISPLAY_READY || job.status === V4_STATUS.READY;
        const busy = job.phase === JOB_PHASE.CONVERTING || job.phase === JOB_PHASE.UPLOADING;
        const color = job.phase === JOB_PHASE.FAILED ? 'text-pl-danger-text'
          : job.phase === JOB_PHASE.DONE ? 'text-pl-success-text'
            : job.phase === JOB_PHASE.RESUMABLE || job.phase === JOB_PHASE.PAUSED ? 'text-pl-warning-text'
              : 'text-pl-primary-text';
        return (
          <span key={job.id} className={`flex items-center gap-1.5 min-w-0 ${color}`} title={text}>
            {busy && <Loader2 className="w-3 h-3 animate-spin shrink-0" />}
            {job.phase === JOB_PHASE.OFFLINE && <WifiOff className="w-3 h-3 shrink-0" />}
            {job.phase === JOB_PHASE.DONE && <CheckCircle2 className="w-3 h-3 shrink-0" />}
            {job.phase === JOB_PHASE.FAILED && <XCircle className="w-3 h-3 shrink-0" />}
            <span className="truncate max-w-[340px]">{text}</span>
            {viewable && job.phase !== JOB_PHASE.DONE && (
              <span className="flex items-center gap-0.5 text-pl-success-text" title="The display copy is uploaded: this survey opens from the server now">
                <Eye className="w-3 h-3" />
                viewable
              </span>
            )}
            {job.phase === JOB_PHASE.CONVERTING && (
              <Btn title="Cancel the conversion (the partial import can then be discarded from the import dialog)" onClick={() => mgr.cancel(job.id)}><X className="w-3 h-3" /></Btn>
            )}
            {job.phase === JOB_PHASE.UPLOADING && (
              <Btn title="Pause the upload" onClick={() => mgr.pause(job.id)}><Pause className="w-3 h-3" /></Btn>
            )}
            {(job.phase === JOB_PHASE.PAUSED || job.phase === JOB_PHASE.RESUMABLE) && (
              <Btn title="Resume the upload from the local copy" onClick={() => mgr.resume(job.id)}><Play className="w-3 h-3" /></Btn>
            )}
            {job.phase === JOB_PHASE.FAILED && !job.conversionFailed && (
              <Btn title="Retry: objects already uploaded are skipped" onClick={() => mgr.resume(job.id)}><RotateCcw className="w-3 h-3" /></Btn>
            )}
            {(job.phase === JOB_PHASE.DONE || job.phase === JOB_PHASE.CANCELLED
              || (job.phase === JOB_PHASE.FAILED && job.conversionFailed)) && (
              <Btn title="Dismiss" onClick={() => mgr.dismiss(job.id)}><X className="w-3 h-3" /></Btn>
            )}
          </span>
        );
      })}
    </span>
  );
}
