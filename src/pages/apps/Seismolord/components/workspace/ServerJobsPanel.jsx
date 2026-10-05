// Jobs dock (QI programme Q0): the user's seismic worker jobs, newest first,
// with progress, cancel and Open for a server import. Polls every 5 s while
// a job is waiting or running (the house pattern: plain polling, no
// realtime), and once when the tab is shown.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, CheckCircle2, XCircle, CircleSlash, Clock3, FolderOpen } from 'lucide-react';
import { listJobs, cancelJob, friendlyError } from '@/lib/qiService';
import { jobView, volumesChanged } from '../../lib/serverJobsView';

const POLL_MS = 5000;

const ICON = {
  queued: <Clock3 className="w-4 h-4 text-pl-muted shrink-0" aria-hidden="true" />,
  running: <Loader2 className="w-4 h-4 text-pl-primary-text shrink-0 animate-spin" aria-hidden="true" />,
  succeeded: <CheckCircle2 className="w-4 h-4 text-pl-success-text shrink-0" aria-hidden="true" />,
  failed: <XCircle className="w-4 h-4 text-pl-danger-text shrink-0" aria-hidden="true" />,
  cancelled: <CircleSlash className="w-4 h-4 text-pl-muted shrink-0" aria-hidden="true" />,
};

/**
 * @param {Object} p
 * @param {boolean} p.visible the tab is showing (polls only then)
 * @param {(volumeId: string) => void} [p.onOpenVolume]
 * @param {() => void} [p.onVolumesChanged] a server import became openable
 * @param {number} [p.refreshKey] bump to re-read at once (a job was just started)
 * @param {Object} [p.api] injected for tests: { listJobs, cancelJob }
 */
export default function ServerJobsPanel({
  visible, onOpenVolume, onVolumesChanged, refreshKey = 0, api = { listJobs, cancelJob },
}) {
  const [jobs, setJobs] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const prevRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const rows = await api.listJobs({ limit: 30 });
      if (prevRef.current && volumesChanged(prevRef.current, rows) && onVolumesChanged) onVolumesChanged();
      prevRef.current = rows;
      setJobs(rows);
      setError(null);
    } catch (e) {
      setError(friendlyError(e));
    }
  }, [api, onVolumesChanged]);

  useEffect(() => { if (visible) load(); }, [visible, refreshKey, load]);

  const anyActive = (jobs || []).some((j) => jobView(j).active);
  useEffect(() => {
    if (!visible || !anyActive) return undefined;
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [visible, anyActive, load]);

  const cancel = async (id) => {
    setBusyId(id);
    try {
      await api.cancelJob(id);
      await load();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="h-full min-h-0 overflow-y-auto p-3 space-y-3 text-xs text-pl-text" data-testid="sl-server-jobs">
      <p className="text-pl-muted">
        Work the Petrolord server does for you, such as converting a large SEG-Y you imported on the server.
        It carries on if you close this tab.
      </p>
      {error && <p className="text-pl-danger-text" role="alert">{error}</p>}
      {jobs === null && !error && <p className="text-pl-muted">Loading…</p>}
      {jobs && jobs.length === 0 && <p className="text-pl-muted">No server jobs yet.</p>}
      <ul className="space-y-2">
        {(jobs || []).map((j) => {
          const v = jobView(j);
          return (
            <li key={v.id} className="rounded border border-pl-border bg-pl-sunken/40 p-2" data-testid="sl-server-job">
              <div className="flex items-center gap-1.5">
                {ICON[v.status]}
                <span className="font-semibold truncate" title={v.title}>{v.title}</span>
                <span className="ml-auto text-[11px] text-pl-muted whitespace-nowrap">{v.kind}</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div
                  className="flex-1 h-1.5 rounded bg-pl-border overflow-hidden"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={v.pct}
                  aria-label={`${v.title} progress`}
                >
                  <div
                    className={`h-full ${v.status === 'failed' ? 'bg-pl-danger' : 'bg-pl-primary'}`}
                    style={{ width: `${v.pct}%` }}
                  />
                </div>
                <span className="w-9 text-right tabular-nums">{v.pct}%</span>
              </div>
              <div className="mt-1 text-pl-muted">
                {v.cancelling ? 'Stopping…' : v.statusLabel}
                {v.detail ? <span className={v.status === 'failed' ? 'text-pl-danger-text' : ''}>{`: ${v.detail}`}</span> : null}
              </div>
              {(v.canCancel || (v.canOpen && onOpenVolume)) && (
                <div className="mt-1.5 flex gap-2">
                  {v.canOpen && onOpenVolume && (
                    <button
                      type="button"
                      className="flex items-center gap-1 px-2 py-0.5 rounded border border-pl-border hover:bg-pl-sunken"
                      onClick={() => onOpenVolume(v.volumeId)}
                    >
                      <FolderOpen className="w-3.5 h-3.5" /> Open
                    </button>
                  )}
                  {v.canCancel && (
                    <button
                      type="button"
                      disabled={busyId === v.id}
                      className="px-2 py-0.5 rounded border border-pl-border text-pl-danger-text hover:bg-pl-sunken disabled:opacity-50"
                      onClick={() => cancel(v.id)}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
