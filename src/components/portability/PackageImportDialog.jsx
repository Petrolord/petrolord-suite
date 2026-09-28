// Import a Petrolord Project Package (.pld) (Project Portability PP2,
// docs/scope/ProjectPortability-PLAN.md §4.5). Pick a file, review what it
// carries and where it will land, import it as an independent copy. Reading,
// planning and writing live in src/lib/portability/importPackage.js; this
// dialog only drives them and shows the outcome.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, PackageOpen, ChevronDown, ChevronRight } from 'lucide-react';
import { makeSupabaseSink } from '@/lib/portability/supabaseSink';
import { preflightPackage, executeImport, importPackage } from '@/lib/portability/importPackage';
import { signatureMessage } from '@/lib/portability/signing';
import { useThemeClass } from '@/design/themeClass';

// Design system (W0C): themed strings for tc(); outside an opted-in scope
// tc() returns the legacy string unchanged.
// Buttons and the dialog panel take the themed ui defaults (the legacy
// overrides drop inside a scope); the Dialog carries the scope to its portal.
const THEMED_CLASSES = {
  "accent-cyan-500":
    "accent-pl-primary",
  "block text-xs text-slate-400":
    "block text-xs text-pl-muted",
  "flex items-center gap-2 text-xs text-slate-400 py-2":
    "flex items-center gap-2 text-xs text-pl-muted py-2",
  "max-w-lg bg-slate-900 border-slate-700 text-slate-200":
    "max-w-lg",
  "text-slate-400 grid grid-cols-2 gap-x-3":
    "text-pl-muted grid grid-cols-2 gap-x-3",
  "text-slate-400":
    "text-pl-muted",
  "text-slate-500":
    "text-pl-muted",
  "w-3.5 h-3.5 animate-spin text-cyan-400":
    "w-3.5 h-3.5 animate-spin text-pl-primary-text",
  "w-4 h-4 text-cyan-400":
    "w-4 h-4 text-pl-primary-text",
  "rounded border border-slate-700 bg-slate-950/40 px-2 py-1.5 text-xs space-y-1":
    "rounded border border-pl-border bg-pl-sunken px-2 py-1.5 text-xs space-y-1",
  "bg-emerald-500/20 text-emerald-300":
    "bg-pl-success-bg text-pl-success-text",
  "bg-slate-700/60 text-slate-300":
    "bg-pl-sunken text-pl-muted",
  "bg-amber-500/20 text-amber-300":
    "bg-pl-warning-bg text-pl-warning-text",
  "bg-red-500/20 text-red-300":
    "bg-pl-danger-bg text-pl-danger-text",
  "text-emerald-300":
    "text-pl-success-text",
  "text-red-300":
    "text-pl-danger-text",
  "text-slate-300":
    "text-pl-text",
  "mt-1 block w-full text-xs text-slate-300 file:mr-2 file:rounded file:border-0 file:bg-slate-800 file:px-2 file:py-1 file:text-xs file:text-cyan-300":
    "mt-1 block w-full text-xs text-pl-text file:mr-2 file:rounded file:border file:border-pl-border-strong file:bg-pl-surface file:px-2 file:py-1 file:text-xs file:text-pl-primary-text",
  "rounded border border-red-700/60 bg-red-950/40 px-2 py-1.5 text-xs text-red-300 space-y-1":
    "rounded border border-pl-danger bg-pl-danger-bg px-2 py-1.5 text-xs text-pl-danger-text space-y-1",
  "rounded bg-red-900/60 px-1 text-[10px] uppercase tracking-wider text-red-200 shrink-0":
    "rounded bg-pl-danger px-1 text-[10px] uppercase tracking-wider text-pl-danger-fg shrink-0",
  "h-6 text-xs border-red-700/60 text-red-200":
    "h-6 text-xs border-pl-danger text-pl-danger-text",
  "rounded border border-slate-700 bg-slate-950/40 px-2 py-1.5 text-xs space-y-1.5":
    "rounded border border-pl-border bg-pl-sunken px-2 py-1.5 text-xs space-y-1.5",
  "text-slate-200 font-medium":
    "text-pl-text font-medium",
  "text-emerald-300/90":
    "text-pl-success-text",
  "text-slate-400 flex items-start gap-2":
    "text-pl-muted flex items-start gap-2",
  "list-disc pl-4 text-amber-300/90":
    "list-disc pl-4 text-pl-warning-text",
  "list-disc pl-4 text-slate-400":
    "list-disc pl-4 text-pl-muted",
  "text-slate-500 uppercase tracking-wider text-[10px]":
    "text-pl-muted uppercase tracking-wider text-[10px]",
  "flex items-center gap-2 text-slate-300":
    "flex items-center gap-2 text-pl-text",
  "text-[10px] text-slate-500":
    "text-[10px] text-pl-muted",
  "flex items-center gap-2 text-xs text-slate-400":
    "flex items-center gap-2 text-xs text-pl-muted",
  "text-slate-200":
    "text-pl-text",
  "border-t border-slate-800 pt-1.5":
    "border-t border-pl-border pt-1.5",
  "flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200":
    "flex items-center gap-1 text-xs text-pl-muted hover:text-pl-text",
  "ml-auto text-slate-500":
    "ml-auto text-pl-muted",
};

const SIGNATURE_TAG = {
  valid: ['signed', 'bg-emerald-500/20 text-emerald-300'],
  unsigned: ['unsigned', 'bg-slate-700/60 text-slate-300'],
  'unknown-key': ['unknown key', 'bg-amber-500/20 text-amber-300'],
  invalid: ['altered', 'bg-red-500/20 text-red-300'],
  unsupported: ['unchecked', 'bg-amber-500/20 text-amber-300'],
};

async function fileBytes(file) {
  if (typeof file.arrayBuffer === 'function') return new Uint8Array(await file.arrayBuffer());
  const buf = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error('Could not read the file.'));
    r.readAsArrayBuffer(file);
  });
  return new Uint8Array(buf);
}

const fmtDate = (iso) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : (iso || '');
};

export default function PackageImportDialog({ open, onOpenChange, onImported, onStatus }) {
  const sink = useMemo(() => makeSupabaseSink(), []);
  const tc = useThemeClass(THEMED_CLASSES);
  const [phase, setPhase] = useState('pick'); // pick | checking | review | running | done
  const [fileName, setFileName] = useState('');
  const [bytes, setBytes] = useState(null);
  const [preflight, setPreflight] = useState(null); // { pkg, plan }
  const [shareWithOrg, setShareWithOrg] = useState(false);
  const [hasOrg, setHasOrg] = useState(false);
  const [error, setError] = useState(null); // { message, code, jobId }
  const [progress, setProgress] = useState('');
  const [summary, setSummary] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [jobs, setJobs] = useState(null);

  const reset = useCallback(() => {
    setPhase('pick');
    setFileName('');
    setBytes(null);
    setPreflight(null);
    setShareWithOrg(false);
    setError(null);
    setProgress('');
    setSummary(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    reset();
    let cancelled = false;
    (async () => {
      try {
        const who = await sink.currentUser();
        if (!cancelled) setHasOrg(!!who?.organization_id);
      } catch (e) {
        if (!cancelled) setHasOrg(false);
      }
      try {
        const list = await sink.listJobs();
        if (!cancelled) setJobs(list || []);
      } catch (e) {
        if (!cancelled) setJobs([]);
      }
    })();
    return () => { cancelled = true; };
  }, [open, sink, reset]);

  const runPreflight = useCallback(async (data, share) => {
    setPhase('checking');
    setError(null);
    setPreflight(null);
    try {
      const res = await preflightPackage(data, sink, { shareWithOrg: share });
      setPreflight(res);
      setPhase('review');
    } catch (e) {
      setError({ message: e?.message || String(e), code: e?.code || null });
      setPhase('pick');
    }
  }, [sink]);

  const onFile = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setFileName(files.length === 1 ? files[0].name : `${files.length} files (${files.map((f) => f.name).join(', ')})`);
    setSummary(null);
    try {
      // one or many: multi-part packages arrive as several files and travel as an array
      const data = [];
      for (const f of files) data.push(await fileBytes(f));
      setBytes(data);
      await runPreflight(data, shareWithOrg);
    } catch (err) {
      setError({ message: err?.message || String(err), code: null });
      setPhase('pick');
    }
  };

  const changeScope = async (share) => {
    setShareWithOrg(share);
    if (bytes && (phase === 'review' || error)) await runPreflight(bytes, share);
  };

  const finish = (s) => {
    setSummary(s);
    setPhase('done');
    setProgress('');
    onStatus?.(`Imported ${s.rowsWritten} rows and ${s.blobsWritten} files.`);
    onImported?.(s);
    sink.listJobs().then((list) => setJobs(list || [])).catch(() => {});
  };

  const run = async () => {
    if (!preflight) return;
    setPhase('running');
    setError(null);
    setProgress('Starting');
    try {
      const s = await executeImport(preflight.plan, sink, { onProgress: setProgress });
      finish(s);
    } catch (e) {
      setError({ message: e?.message || String(e), code: e?.code || null, jobId: e?.jobId || null });
      setPhase('review');
      setProgress('');
      onStatus?.(e?.message || String(e));
    }
  };

  const retry = async () => {
    if (!bytes) return;
    setPhase('running');
    const jobId = error?.jobId || null;
    setError(null);
    setProgress('Resuming');
    try {
      const { summary: s } = await importPackage(bytes, sink, { shareWithOrg, onProgress: setProgress, resumeJobId: jobId });
      finish(s);
    } catch (e) {
      setError({ message: e?.message || String(e), code: e?.code || null, jobId: e?.jobId || null });
      setPhase('review');
      setProgress('');
    }
  };

  const plan = preflight?.plan;
  const manifest = preflight?.pkg?.manifest;
  const tableRows = plan ? Object.entries(plan.counts.tables || {}) : [];
  const busy = phase === 'checking' || phase === 'running';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="pld-import-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><PackageOpen className="w-4 h-4 text-pl-primary-text" /> Import project package</DialogTitle>
          <DialogDescription className="text-pl-muted">
            Open a .pld file and get an independent copy of its wells, surfaces and interpretations under your account. Nothing you already have is changed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {phase !== 'done' && (
            <label className="block text-xs text-pl-muted">
              Package file
              <input
                type="file"
                accept=".pld,.zip"
                multiple
                data-testid="pld-import-file"
                disabled={busy}
                onChange={onFile}
                className="mt-1 block w-full text-xs text-pl-text file:mr-2 file:rounded file:border file:border-pl-border-strong file:bg-pl-surface file:px-2 file:py-1 file:text-xs file:text-pl-primary-text"
              />
              {fileName ? <span className="text-pl-muted">{fileName}</span> : null}
            </label>
          )}

          {phase === 'checking' && (
            <div className="flex items-center gap-2 text-xs text-pl-muted py-2" data-testid="pld-import-progress">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-pl-primary-text" /> Checking package
            </div>
          )}

          {error && (
            <div className="rounded border border-pl-danger bg-pl-danger-bg px-2 py-1.5 text-xs text-pl-danger-text space-y-1" data-testid="pld-import-error">
              <div className="flex items-start gap-2">
                {error.code ? <span className="rounded bg-pl-danger px-1 text-[10px] uppercase tracking-wider text-pl-danger-fg shrink-0">{error.code}</span> : null}
                <span>{error.message}</span>
              </div>
              {error.jobId && bytes ? (
                <Button size="sm" variant="outline" data-testid="pld-import-retry" className="h-6 text-xs border-pl-danger text-pl-danger-text" onClick={retry} disabled={busy}>
                  Retry
                </Button>
              ) : null}
            </div>
          )}

          {(phase === 'review' || phase === 'running') && plan && manifest && (
            <div className="rounded border border-pl-border bg-pl-sunken px-2 py-1.5 text-xs space-y-1.5" data-testid="pld-import-review">
              <div className="text-pl-text font-medium">{manifest.name || 'Unnamed package'}</div>
              <div className="text-pl-muted">
                Created {fmtDate(manifest.created_at)} with build {manifest.platform?.sha || 'unknown'}.
                {' '}Source: {manifest.source?.organization_name || 'private account'}.
              </div>
              <div className="text-pl-success-text">All {preflight.pkg.integrity?.checked ?? 0} files verified.</div>
              {Array.isArray(manifest.parts) ? (
                <div className="text-pl-success-text" data-testid="pld-import-parts">{manifest.parts.length} parts, all present and verified.</div>
              ) : null}
              {(() => {
                const sig = preflight.pkg.signature || { status: 'unsigned', key_id: null };
                const [label, cls] = SIGNATURE_TAG[sig.status] || SIGNATURE_TAG.unsigned;
                return (
                  <div className="text-pl-muted flex items-start gap-2" data-testid="pld-import-signature">
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${tc(cls)}`}>{label}</span>
                    <span>{signatureMessage(sig)}</span>
                  </div>
                );
              })()}
              <ul className="text-pl-muted grid grid-cols-2 gap-x-3">
                {tableRows.map(([t, n]) => (
                  <li key={t}><span className="text-pl-muted">{t}</span> {n}</li>
                ))}
                <li><span className="text-pl-muted">binary files</span> {plan.counts.blobs}</li>
              </ul>
              {plan.warnings.length > 0 && (
                <ul className="list-disc pl-4 text-pl-warning-text">
                  {plan.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              )}
              {plan.notes.length > 0 && (
                <ul className="list-disc pl-4 text-pl-muted">
                  {plan.notes.map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              )}
              <div className="pt-1 space-y-1">
                <div className="text-pl-muted uppercase tracking-wider text-[10px]">Import into</div>
                <label className="flex items-center gap-2 text-pl-text">
                  <input type="radio" name="pld-scope" data-testid="pld-import-scope-private" checked={!shareWithOrg} disabled={busy} onChange={() => changeScope(false)} className="accent-pl-primary" />
                  Private (only me)
                </label>
                <label className={`flex items-center gap-2 ${tc(hasOrg ? 'text-slate-300' : 'text-slate-500')}`}>
                  <input type="radio" name="pld-scope" data-testid="pld-import-scope-org" checked={shareWithOrg} disabled={busy || !hasOrg} onChange={() => changeScope(true)} className="accent-pl-primary" />
                  Share with my organization
                  {!hasOrg ? <span className="text-[10px] text-pl-muted">(you are not in an organization)</span> : null}
                </label>
              </div>
            </div>
          )}

          {phase === 'running' && (
            <div className="flex items-center gap-2 text-xs text-pl-muted" data-testid="pld-import-progress">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-pl-primary-text" /> {progress}
            </div>
          )}

          {phase === 'done' && summary && (
            <div className="rounded border border-pl-border bg-pl-sunken px-2 py-1.5 text-xs space-y-1" data-testid="pld-import-summary">
              <div className="text-pl-text">
                Imported {summary.rowsWritten} rows and {summary.blobsWritten} binary files{summary.skipped ? `, ${summary.skipped} already present from an earlier run` : ''}.
              </div>
              {summary.warnings?.length > 0 && (
                <ul className="list-disc pl-4 text-pl-warning-text">
                  {summary.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              )}
              {summary.notes?.length > 0 && (
                <ul className="list-disc pl-4 text-pl-muted">
                  {summary.notes.map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              )}
            </div>
          )}

          <div className="border-t border-pl-border pt-1.5">
            <button type="button" className="flex items-center gap-1 text-xs text-pl-muted hover:text-pl-text" onClick={() => setHistoryOpen((v) => !v)}>
              {historyOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />} Import history
            </button>
            {historyOpen && (
              <div className="mt-1 text-xs" data-testid="pld-import-history">
                {jobs === null ? (
                  <div className="text-pl-muted">Loading</div>
                ) : jobs.length === 0 ? (
                  <div className="text-pl-muted">No imports yet.</div>
                ) : (
                  <ul className="space-y-0.5">
                    {jobs.map((j) => (
                      <li key={j.id} className="flex items-center gap-2 text-pl-text">
                        <span className="truncate">{j.package_name || j.package_id}</span>
                        <span className={`text-[10px] uppercase ${tc(j.status === 'done' ? 'text-emerald-300' : j.status === 'failed' ? 'text-red-300' : 'text-slate-400')}`}>{j.status}</span>
                        <span className="text-pl-muted">{j.rows_written}/{j.rows_planned} rows</span>
                        <span className="ml-auto text-pl-muted">{fmtDate(j.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          {phase === 'done' ? (
            <Button size="sm" className={undefined} onClick={() => onOpenChange(false)}>
              Done
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" className={undefined} onClick={() => onOpenChange(false)} disabled={phase === 'running'}>
                Close
              </Button>
              <Button
                size="sm"
                data-testid="pld-import-run"
                disabled={phase !== 'review' || !preflight}
                className={undefined}
                onClick={run}
              >
                {phase === 'running' ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <PackageOpen className="w-3.5 h-3.5 mr-1" />}
                Import
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
