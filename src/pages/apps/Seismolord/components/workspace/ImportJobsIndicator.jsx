// Status-bar readout of background SEG-Y imports (large-survey plan,
// section 5): per-stage progress (converting, display copy, full
// precision), pause and resume, retry after a failure, and uploads a
// previous session left unfinished. Self-contained, like the CRS chip:
// it discovers resumable uploads on mount and reads the job store.

import React, { useEffect } from 'react';
import {
  Loader2, Pause, Play, RotateCcw, X, CheckCircle2, XCircle, WifiOff, Eye,
} from 'lucide-react';
import { useImportJobs, getImportJobs, JOB_PHASE, V4_STATUS } from '../../services/importJobsRuntime';

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

const Btn = ({ title, onClick, children }) => (
  <button type="button" title={title} aria-label={title} onClick={onClick} className="hover:text-slate-100 p-0.5">
    {children}
  </button>
);

export default function ImportJobsIndicator() {
  const jobs = useImportJobs();

  useEffect(() => {
    getImportJobs().discover().catch(() => {});
  }, []);

  if (!jobs.length) return null;
  const mgr = getImportJobs();

  return (
    <span className="flex items-center gap-3 min-w-0" data-testid="import-jobs">
      {jobs.map((job) => {
        const text = describeImportJob(job);
        const viewable = job.status === V4_STATUS.DISPLAY_READY || job.status === V4_STATUS.READY;
        const busy = job.phase === JOB_PHASE.CONVERTING || job.phase === JOB_PHASE.UPLOADING;
        const color = job.phase === JOB_PHASE.FAILED ? 'text-red-400'
          : job.phase === JOB_PHASE.DONE ? 'text-emerald-400'
            : job.phase === JOB_PHASE.RESUMABLE || job.phase === JOB_PHASE.PAUSED ? 'text-amber-300'
              : 'text-cyan-300';
        return (
          <span key={job.id} className={`flex items-center gap-1.5 min-w-0 ${color}`} title={text}>
            {busy && <Loader2 className="w-3 h-3 animate-spin shrink-0" />}
            {job.phase === JOB_PHASE.OFFLINE && <WifiOff className="w-3 h-3 shrink-0" />}
            {job.phase === JOB_PHASE.DONE && <CheckCircle2 className="w-3 h-3 shrink-0" />}
            {job.phase === JOB_PHASE.FAILED && <XCircle className="w-3 h-3 shrink-0" />}
            <span className="truncate max-w-[340px]">{text}</span>
            {viewable && job.phase !== JOB_PHASE.DONE && (
              <span className="flex items-center gap-0.5 text-emerald-400" title="The display copy is uploaded: this survey opens from the server now">
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
