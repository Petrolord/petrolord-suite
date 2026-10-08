// Batch LAS import (AppUpgrade WDM-U2-004): choose many LAS files, read
// them off-thread one by one, review how each is matched (UWI, then name)
// and change any target, then import them in one pass with progress.
// Planning is pure (engine/batchMatch.js); execution is the runner
// (services/batchImport.js). Every file ends imported, skipped or failed,
// each with its reason.

import React, { useMemo, useRef, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import CrsPicker from '@/components/crs/CrsPicker';
import useCrsContext from '@/components/crs/useCrsContext';
import { wellNameKey } from '@/lib/wellNames';
import { planBatch, checkBatch, creatorRows } from '../engine/batchMatch';
import { runBatchImport, batchSummary } from '../services/batchImport';

const inputCls = 'rounded bg-pl-surface border border-pl-border-strong text-pl-text px-1 py-0.5 text-xs';
const thCls = 'sticky top-0 bg-pl-surface text-left font-medium text-pl-muted px-2 py-1 border-b border-pl-border whitespace-nowrap';
const tdCls = 'px-2 py-0.5 text-pl-text align-top';

export default function BatchLasDialog({ open, onOpenChange, backend, wells, onDone }) {
  const { crsContext, commitAutoSetProject } = useCrsContext();
  const [files, setFiles] = useState([]);       // [{fileName, parsed?, error?}]
  const [reading, setReading] = useState(null); // {done, total}
  const [overrides, setOverrides] = useState({}); // row index -> 'skip' | 'new' | wellId
  const [typedXy, setTypedXy] = useState({});
  const [xyUnit, setXyUnit] = useState('m');
  const [crsTag, setCrsTag] = useState(null);
  const [running, setRunning] = useState(null); // {done, total, fileName}
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const cancelRef = useRef({ cancelled: false });

  const ownWells = useMemo(() => (wells || []).filter((w) => w.is_own), [wells]);
  const base = useMemo(() => planBatch(files, wells), [files, wells]);
  const rows = useMemo(() => base.map((r) => {
    const o = overrides[r.i];
    if (!o || (r.reason && !files[r.i]?.parsed)) return r;
    if (o === 'skip') return { ...r, action: 'skip', reason: 'skipped by you', wellId: null };
    if (o === 'new') return { ...r, action: 'new', wellId: null, newKey: wellNameKey(r.wellName), reason: null };
    return { ...r, action: 'into', wellId: o, newKey: null, reason: null, note: `into ${ownWells.find((w) => w.id === o)?.name}` };
  }), [base, overrides, files, ownWells]);
  const problems = useMemo(() => (files.length ? checkBatch(rows, typedXy) : []), [rows, typedXy, files]);
  const needsXy = useMemo(() => new Set(creatorRows(rows).filter((r) => !r.xy).map((r) => r.i)), [rows]);

  const reset = () => {
    setFiles([]); setReading(null); setOverrides({}); setTypedXy({}); setResults(null); setError(null); setRunning(null);
  };
  const close = (v) => { if (!v && !running) reset(); if (!running) onOpenChange(v); };

  const pick = async (e) => {
    const list = Array.from(e.target.files || []);
    e.target.value = '';
    if (!list.length) return;
    reset();
    const out = [];
    for (let k = 0; k < list.length; k++) {
      setReading({ done: k, total: list.length });
      const f = list[k];
      try {
        out.push({ fileName: f.name, parsed: await backend.parseLasFile(f) });
      } catch (err) {
        out.push({ fileName: f.name, error: err.message });
      }
    }
    setReading(null);
    setFiles(out);
  };

  const run = async () => {
    if (problems.length) { setError(problems[0]); return; }
    setError(null);
    cancelRef.current = { cancelled: false };
    setRunning({ done: 0, total: rows.length, fileName: null });
    try {
      const { results: res, autoSetProject } = await runBatchImport({
        backend, rows, files, typedXy, xyUnit, crsTag, crsContext: crsContext || {}, onProgress: setRunning, cancel: cancelRef.current,
      });
      if (autoSetProject) await commitAutoSetProject(autoSetProject);
      setResults(res);
      onDone?.({ results: res, summary: batchSummary(res) });
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(null);
    }
  };

  const statusCls = { done: 'text-pl-success-text', skipped: 'text-pl-muted', failed: 'text-pl-danger-text' };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-5xl" data-testid="wdm-batch-dialog">
        <DialogHeader>
          <DialogTitle>Batch LAS import</DialogTitle>
          <DialogDescription>
            Each file is matched to a well by UWI, then by name. Unmatched files create new wells. Review the targets, then import.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-xs">
          <label className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded border border-pl-primary/60 text-pl-primary-text hover:bg-pl-primary/10 cursor-pointer w-fit">
            {reading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {files.length ? 'Choose other files…' : 'Choose LAS files…'}
            <input type="file" multiple accept=".las,.LAS,.txt" className="hidden" data-testid="wdm-batch-files" onChange={pick} disabled={!!running} />
          </label>
          {reading && <span className="ml-2 text-pl-muted" data-testid="wdm-batch-reading">Reading file {reading.done + 1} of {reading.total}…</span>}

          {files.length > 0 && !results && (
            <>
              <div className="max-h-80 overflow-auto border border-pl-border rounded">
                <table className="min-w-full" data-testid="wdm-batch-table">
                  <thead>
                    <tr>
                      <th className={thCls}>File</th>
                      <th className={thCls}>Well in the file</th>
                      <th className={thCls}>Curves</th>
                      <th className={thCls}>Load into</th>
                      <th className={thCls}>Surface X, Y</th>
                      <th className={thCls} title="Read from each file's header (EKB, EGL, EDF, APD, EPD, LMF, PDAT). Saved with a new well as shown; correct it afterwards on the well's Header tab.">Depth reference (new wells)</th>
                      <th className={thCls}>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.i} data-testid="wdm-batch-row" data-file={r.fileName} data-action={r.action}>
                        <td className={tdCls}>{r.fileName}</td>
                        <td className={tdCls}>{r.wellName || ''}{r.uwi ? <span className="text-pl-muted"> ({r.uwi})</span> : null}</td>
                        <td className={tdCls}>{r.nCurves || ''}</td>
                        <td className={tdCls}>
                          {files[r.i]?.parsed && r.nCurves > 0 ? (
                            <select className={inputCls} value={r.action === 'into' ? r.wellId : r.action} data-testid={`wdm-batch-target-${r.i}`}
                              onChange={(e) => setOverrides((o) => ({ ...o, [r.i]: e.target.value }))}>
                              <option value="skip">skip</option>
                              <option value="new">new well {r.wellName}</option>
                              {ownWells.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                            </select>
                          ) : <span className="text-pl-muted">skip</span>}
                        </td>
                        <td className={tdCls}>
                          {needsXy.has(r.i) ? (
                            <span className="flex gap-1">
                              <input className={`${inputCls} w-24`} placeholder="X" value={typedXy[r.i]?.x ?? ''} data-testid={`wdm-batch-x-${r.i}`}
                                onChange={(e) => setTypedXy((m) => ({ ...m, [r.i]: { ...(m[r.i] || {}), x: e.target.value } }))} />
                              <input className={`${inputCls} w-24`} placeholder="Y" value={typedXy[r.i]?.y ?? ''} data-testid={`wdm-batch-y-${r.i}`}
                                onChange={(e) => setTypedXy((m) => ({ ...m, [r.i]: { ...(m[r.i] || {}), y: e.target.value } }))} />
                            </span>
                          ) : r.action === 'new' && r.xy ? <span className="text-pl-muted">{r.xy.x}, {r.xy.y} (from file)</span> : ''}
                        </td>
                        <td className={`${tdCls} text-pl-muted`} data-testid={`wdm-batch-datum-${r.i}`} title={(r.datumConflicts || []).join(' ')}>
                          {r.action !== 'new' ? '' : r.datum && Number.isFinite(r.datum.refElevM)
                            ? `${r.datum.refKind || 'KB'} ${Number(r.datum.refElevM.toFixed(2))} m${r.datum.verticalDatum ? ` above ${r.datum.verticalDatum}` : ''}${Number.isFinite(r.datum.groundElevM) ? `, ground ${Number(r.datum.groundElevM.toFixed(2))} m` : ''}${Number.isFinite(r.datum.waterDepthM) ? `, water ${Number(r.datum.waterDepthM.toFixed(2))} m` : ''}${(r.datumConflicts || []).length ? ' (check)' : ''}`
                            : 'not in the file: left not set'}
                        </td>
                        <td className={`${tdCls} ${r.action === 'skip' ? 'text-pl-warning-text' : 'text-pl-muted'}`} data-testid={`wdm-batch-note-${r.i}`}>
                          {r.action === 'skip' ? `Skipped: ${r.reason}` : r.note}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {creatorRows(rows).length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-start">
                  <label className="flex flex-col gap-0.5 text-[11px] text-pl-muted">
                    New wells: X and Y typed here are in
                    <select className={inputCls} value={xyUnit} onChange={(e) => setXyUnit(e.target.value)} data-testid="wdm-batch-xyunit">
                      <option value="m">metres</option><option value="ft">feet</option><option value="ftUS">US survey feet</option>
                    </select>
                  </label>
                  <div className="md:col-span-2">
                    <div className="text-[11px] text-pl-muted mb-0.5">Coordinate system of the X and Y (from the files and typed)</div>
                    <CrsPicker value={crsTag || crsContext?.projectTag || null} onChange={setCrsTag} customDefs={crsContext?.customDefs || {}} />
                  </div>
                </div>
              )}
              <p className="text-pl-muted" data-testid="wdm-batch-summary">
                {rows.filter((r) => r.action === 'into').length} into existing wells, {creatorRows(rows).length} new well{creatorRows(rows).length === 1 ? '' : 's'},
                {' '}{rows.filter((r) => r.action === 'skip').length} skipped. Curves a well already has are kept alongside with a :n suffix.
              </p>
            </>
          )}

          {running && (
            <div data-testid="wdm-batch-progress" className="space-y-1">
              <div className="h-1.5 rounded bg-pl-sunken overflow-hidden">
                <div className="h-full bg-pl-primary" style={{ width: `${Math.round((running.done / Math.max(1, running.total)) * 100)}%` }} />
              </div>
              <div className="text-pl-muted">Importing {running.fileName || ''} ({running.done} of {running.total})</div>
            </div>
          )}

          {results && (
            <div className="max-h-80 overflow-auto border border-pl-border rounded p-2" data-testid="wdm-batch-results">
              <div className="text-pl-text mb-1">{batchSummary(results)}</div>
              {results.map((r) => (
                <div key={r.row.i} data-testid="wdm-batch-result" data-status={r.status} className={statusCls[r.status]}>
                  {r.row.fileName}: {r.status}{r.message ? `, ${r.message}` : ''}
                </div>
              ))}
            </div>
          )}
          {(error || (files.length > 0 && !results && problems.length > 0)) && (
            <div className="text-pl-danger-text" data-testid="wdm-batch-error">{error || problems[0]}</div>
          )}
        </div>
        <DialogFooter>
          {running ? (
            <Button variant="outline" size="sm" onClick={() => { cancelRef.current.cancelled = true; }} data-testid="wdm-batch-cancel">Stop after this file</Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => close(false)}>{results ? 'Close' : 'Cancel'}</Button>
          )}
          {!results && (
            <Button size="sm" disabled={!files.length || !!running || !!reading || problems.length > 0} onClick={run} data-testid="wdm-batch-import">
              {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Import {rows.filter((r) => r.action !== 'skip').length} file{rows.filter((r) => r.action !== 'skip').length === 1 ? '' : 's'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
