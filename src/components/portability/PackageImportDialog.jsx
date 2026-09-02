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
      <DialogContent className="max-w-lg bg-slate-900 border-slate-700 text-slate-200" data-testid="pld-import-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><PackageOpen className="w-4 h-4 text-cyan-400" /> Import project package</DialogTitle>
          <DialogDescription className="text-slate-400">
            Open a .pld file and get an independent copy of its wells, surfaces and interpretations under your account. Nothing you already have is changed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {phase !== 'done' && (
            <label className="block text-xs text-slate-400">
              Package file
              <input
                type="file"
                accept=".pld,.zip"
                multiple
                data-testid="pld-import-file"
                disabled={busy}
                onChange={onFile}
                className="mt-1 block w-full text-xs text-slate-300 file:mr-2 file:rounded file:border-0 file:bg-slate-800 file:px-2 file:py-1 file:text-xs file:text-cyan-300"
              />
              {fileName ? <span className="text-slate-500">{fileName}</span> : null}
            </label>
          )}

          {phase === 'checking' && (
            <div className="flex items-center gap-2 text-xs text-slate-400 py-2" data-testid="pld-import-progress">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" /> Checking package
            </div>
          )}

          {error && (
            <div className="rounded border border-red-700/60 bg-red-950/40 px-2 py-1.5 text-xs text-red-300 space-y-1" data-testid="pld-import-error">
              <div className="flex items-start gap-2">
                {error.code ? <span className="rounded bg-red-900/60 px-1 text-[10px] uppercase tracking-wider text-red-200 shrink-0">{error.code}</span> : null}
                <span>{error.message}</span>
              </div>
              {error.jobId && bytes ? (
                <Button size="sm" variant="outline" data-testid="pld-import-retry" className="h-6 text-xs border-red-700/60 text-red-200" onClick={retry} disabled={busy}>
                  Retry
                </Button>
              ) : null}
            </div>
          )}

          {(phase === 'review' || phase === 'running') && plan && manifest && (
            <div className="rounded border border-slate-700 bg-slate-950/40 px-2 py-1.5 text-xs space-y-1.5" data-testid="pld-import-review">
              <div className="text-slate-200 font-medium">{manifest.name || 'Unnamed package'}</div>
              <div className="text-slate-400">
                Created {fmtDate(manifest.created_at)} with build {manifest.platform?.sha || 'unknown'}.
                {' '}Source: {manifest.source?.organization_name || 'private account'}.
              </div>
              <div className="text-emerald-300/90">All {preflight.pkg.integrity?.checked ?? 0} files verified.</div>
              {Array.isArray(manifest.parts) ? (
                <div className="text-emerald-300/90" data-testid="pld-import-parts">{manifest.parts.length} parts, all present and verified.</div>
              ) : null}
              {(() => {
                const sig = preflight.pkg.signature || { status: 'unsigned', key_id: null };
                const [label, cls] = SIGNATURE_TAG[sig.status] || SIGNATURE_TAG.unsigned;
                return (
                  <div className="text-slate-400 flex items-start gap-2" data-testid="pld-import-signature">
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${cls}`}>{label}</span>
                    <span>{signatureMessage(sig)}</span>
                  </div>
                );
              })()}
              <ul className="text-slate-400 grid grid-cols-2 gap-x-3">
                {tableRows.map(([t, n]) => (
                  <li key={t}><span className="text-slate-500">{t}</span> {n}</li>
                ))}
                <li><span className="text-slate-500">binary files</span> {plan.counts.blobs}</li>
              </ul>
              {plan.warnings.length > 0 && (
                <ul className="list-disc pl-4 text-amber-300/90">
                  {plan.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              )}
              {plan.notes.length > 0 && (
                <ul className="list-disc pl-4 text-slate-400">
                  {plan.notes.map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              )}
              <div className="pt-1 space-y-1">
                <div className="text-slate-500 uppercase tracking-wider text-[10px]">Import into</div>
                <label className="flex items-center gap-2 text-slate-300">
                  <input type="radio" name="pld-scope" data-testid="pld-import-scope-private" checked={!shareWithOrg} disabled={busy} onChange={() => changeScope(false)} className="accent-cyan-500" />
                  Private (only me)
                </label>
                <label className={`flex items-center gap-2 ${hasOrg ? 'text-slate-300' : 'text-slate-500'}`}>
                  <input type="radio" name="pld-scope" data-testid="pld-import-scope-org" checked={shareWithOrg} disabled={busy || !hasOrg} onChange={() => changeScope(true)} className="accent-cyan-500" />
                  Share with my organization
                  {!hasOrg ? <span className="text-[10px] text-slate-500">(you are not in an organization)</span> : null}
                </label>
              </div>
            </div>
          )}

          {phase === 'running' && (
            <div className="flex items-center gap-2 text-xs text-slate-400" data-testid="pld-import-progress">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" /> {progress}
            </div>
          )}

          {phase === 'done' && summary && (
            <div className="rounded border border-slate-700 bg-slate-950/40 px-2 py-1.5 text-xs space-y-1" data-testid="pld-import-summary">
              <div className="text-slate-200">
                Imported {summary.rowsWritten} rows and {summary.blobsWritten} binary files{summary.skipped ? `, ${summary.skipped} already present from an earlier run` : ''}.
              </div>
              {summary.warnings?.length > 0 && (
                <ul className="list-disc pl-4 text-amber-300/90">
                  {summary.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              )}
              {summary.notes?.length > 0 && (
                <ul className="list-disc pl-4 text-slate-400">
                  {summary.notes.map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              )}
            </div>
          )}

          <div className="border-t border-slate-800 pt-1.5">
            <button type="button" className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200" onClick={() => setHistoryOpen((v) => !v)}>
              {historyOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />} Import history
            </button>
            {historyOpen && (
              <div className="mt-1 text-xs" data-testid="pld-import-history">
                {jobs === null ? (
                  <div className="text-slate-500">Loading</div>
                ) : jobs.length === 0 ? (
                  <div className="text-slate-500">No imports yet.</div>
                ) : (
                  <ul className="space-y-0.5">
                    {jobs.map((j) => (
                      <li key={j.id} className="flex items-center gap-2 text-slate-300">
                        <span className="truncate">{j.package_name || j.package_id}</span>
                        <span className={`text-[10px] uppercase ${j.status === 'done' ? 'text-emerald-300' : j.status === 'failed' ? 'text-red-300' : 'text-slate-400'}`}>{j.status}</span>
                        <span className="text-slate-500">{j.rows_written}/{j.rows_planned} rows</span>
                        <span className="ml-auto text-slate-500">{fmtDate(j.created_at)}</span>
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
            <Button size="sm" className="bg-cyan-600 hover:bg-cyan-500 text-white" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" className="border-slate-700 text-slate-300" onClick={() => onOpenChange(false)} disabled={phase === 'running'}>
                Close
              </Button>
              <Button
                size="sm"
                data-testid="pld-import-run"
                disabled={phase !== 'review' || !preflight}
                className="bg-cyan-600 hover:bg-cyan-500 text-white"
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
