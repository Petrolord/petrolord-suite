// LAS import wizard: pick a file → parse off-thread (backend facade) →
// choose the TARGET (the selected well by default — owner finding
// 2026-09-03: a well built from survey + checkshots must receive its LAS
// without a second well appearing) → review curves, rename any mnemonic,
// settle clashes with curves the well already has → persist. Into an
// existing well the LAS depth is not written twice: curves are resampled
// onto the well's depth grid (engine/mergeImport.js, pure and tested).
// For a new well the header is suggested from ~Well/~Params; surface X/Y
// stay manual — most LAS files don't carry them.
//
// The unit column shows exactly what the SI layer decided: converted
// curves display source → SI with the factor recorded in provenance;
// unrecognised units stay as-is and are marked, never guessed
// (engine/lasImport.js contract).

import React, { useEffect, useMemo, useState } from 'react';
import { planMerge, findDepthLog, clashFor } from '../engine/mergeImport';
import { Loader2, Upload, FileText } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import CrsPicker from '@/components/crs/CrsPicker';
import useCrsContext from '@/components/crs/useCrsContext';
import { placeWellLocation } from '@/lib/crs/wellPlacement';
import { UNKNOWN } from '@/lib/crs/tags';

const inputCls = 'rounded-md bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-1 text-xs w-full';
const thCls = 'text-left font-medium text-slate-500 pr-3 pb-1';
const tdCls = 'pr-3 py-0.5 text-slate-300 whitespace-nowrap';

const KNOWN_SI = new Set(['M', 'US/M', 'MS', 'S', 'GAPI', 'API', 'G/C3', 'G/CM3', 'KG/M3', 'V/V', 'OHMM', 'OHM.M', 'MV', 'IN', 'MM', 'B/E', '%', '']);

const emptyHeader = { name: '', uwi: '', x: '', y: '', kb: '', td: '', crs: '' };

/**
 * @param {?string} [p.initialTargetId] well selected in the tree; when it
 *   is one of the caller's own wells the wizard targets it by default
 */
export default function LasImportDialog({ open, onOpenChange, backend, wells, onDone, initialTargetId = null }) {
  const { crsContext, commitAutoSetProject } = useCrsContext();
  const [crsTag, setCrsTag] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState(null);
  const [parsed, setParsed] = useState(null);       // {meta, prep}
  const [keep, setKeep] = useState({});             // mnemonic -> bool
  const [target, setTarget] = useState('new');      // 'new' | existing well id
  const [head, setHead] = useState(emptyHeader);
  const [names, setNames] = useState({});           // mnemonic -> save-as name
  const [onClash, setOnClash] = useState({});       // mnemonic -> 'suffix' | 'replace'
  const [existing, setExisting] = useState({ wellId: null, logs: [], depth: null, busy: false });

  const ownWells = useMemo(() => (wells || []).filter((w) => w.is_own), [wells]);

  // default target: the selected own well, else a new well
  useEffect(() => {
    if (!open) return;
    const own = ownWells.find((w) => w.id === initialTargetId);
    setTarget(own ? own.id : 'new');
  }, [open, initialTargetId, ownWells]);

  // what the target well already holds (names to clash against, depth
  // grid to resample onto)
  useEffect(() => {
    if (!open || target === 'new') { setExisting({ wellId: null, logs: [], depth: null, busy: false }); return; }
    let live = true;
    setExisting((e) => ({ ...e, wellId: target, busy: true }));
    (async () => {
      try {
        const logs = await backend.listLogs(target);
        const depthLog = findDepthLog(logs);
        const depth = depthLog ? { log: depthLog, data: await backend.downloadCurve(depthLog) } : null;
        if (live) setExisting({ wellId: target, logs, depth, busy: false });
      } catch (e) {
        if (live) { setExisting({ wellId: target, logs: [], depth: null, busy: false }); setError(e.message); }
      }
    })();
    return () => { live = false; };
  }, [open, target, backend]);

  const reset = () => {
    setBusy(false);
    setError(null);
    setFileName(null);
    setParsed(null);
    setKeep({});
    setNames({});
    setOnClash({});
    setTarget('new');
    setHead(emptyHeader);
  };

  const close = (v) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const pickFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    setParsed(null);
    setFileName(file.name);
    try {
      const result = await backend.parseLasFile(file);
      setParsed(result);
      const keepAll = {};
      // the depth curve always persists (it IS the depth vector for
      // irregular logs) — it has no checkbox below
      result.prep.logs.forEach((l) => { keepAll[l.mnemonic] = true; });
      setKeep(keepAll);
      setNames({});
      setOnClash({});
      const s = result.meta.suggestedHeader;
      setHead({
        name: s.name || '',
        uwi: s.uwi || '',
        x: '',
        y: '',
        kb: s.kbM != null ? String(Number(s.kbM.toFixed(3))) : '',
        td: s.tdMdM != null ? String(Number(s.tdMdM.toFixed(2))) : '',
        crs: '',
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const setHeadField = (k) => (e) => setHead((h) => ({ ...h, [k]: e.target.value }));

  const doImport = async () => {
    const logs = parsed.prep.logs.filter((l, i) => i === 0 || keep[l.mnemonic]);
    if (logs.length < 2) {
      setError('Keep at least one curve besides depth.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let well = null;
      let wellId = target;
      if (target === 'new') {
        const name = head.name.trim();
        if (!name) throw new Error('The well needs a name.');
        const surfaceX = Number(head.x);
        const surfaceY = Number(head.y);
        if (head.x.trim() === '' || head.y.trim() === ''
          || !Number.isFinite(surfaceX) || !Number.isFinite(surfaceY)) {
          throw new Error('Surface X and Y must be world coordinates in metres '
            + '(LAS files rarely carry them — enter them here).');
        }
        const kbM = head.kb.trim() === '' ? 0 : Number(head.kb);
        if (!Number.isFinite(kbM)) throw new Error('KB must be a number (metres above datum).');
        const tdMdM = head.td.trim() === '' ? null : Number(head.td);
        if (tdMdM !== null && !(tdMdM > 0)) throw new Error('TD must be a positive number (m MD).');
        // Structured placement: declared CRS -> Project CRS (Phase 4).
        const placed = placeWellLocation(
          {
            mode: 'xy',
            crsTag: crsTag || crsContext?.projectTag || UNKNOWN,
            x: surfaceX,
            y: surfaceY,
          },
          crsContext || {},
        );
        well = await backend.saveWell({
          name,
          uwi: head.uwi.trim() || null,
          surfaceX: placed.surfaceX,
          surfaceY: placed.surfaceY,
          kbM,
          tdMdM,
          crs: placed.crs,
          xyUnit: placed.xyUnit,
          crsProvenance: placed.crsProvenance,
          crsNote: head.crs.trim() || null,
          unitsNote: parsed.meta.suggestedHeader.unitsNote,
        });
        await commitAutoSetProject(placed.autoSetProject);
        wellId = well.id;
      }
      let toSave = logs;
      let note = '';
      if (target !== 'new') {
        if (existing.busy || existing.wellId !== target) throw new Error('Still reading the target well — try again in a moment.');
        const plan = planMerge({
          prepLogs: parsed.prep.logs, keep, names, onClash,
          existingLogs: existing.logs, existingDepth: existing.depth,
        });
        if (plan.errors.length) throw new Error(plan.errors[0]);
        if (!plan.logs.length) throw new Error('Keep at least one curve to add.');
        for (const old of plan.deletions) await backend.deleteLog(old);
        toSave = plan.logs;
        const parts = [];
        if (plan.depthReused) parts.push(plan.resampled ? `${plan.resampled} curve${plan.resampled === 1 ? '' : 's'} resampled onto the well's depth grid` : 'same depth grid, samples kept');
        if (plan.deletions.length) parts.push(`${plan.deletions.length} replaced`);
        const suffixed = plan.report.filter((r) => r.action === 'add-suffixed').length;
        if (suffixed) parts.push(`${suffixed} kept alongside with a :n suffix`);
        note = parts.join(' · ');
      } else {
        // new well: names still apply (rename before first save)
        const plan = planMerge({ prepLogs: parsed.prep.logs, keep, names });
        if (plan.errors.length) throw new Error(plan.errors[0]);
        toSave = plan.logs;
      }
      const saved = await backend.saveLogs(wellId, toSave);
      close(false);
      onDone({ wellId, well, nLogs: saved.length, fileName, note });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const prep = parsed?.prep;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        className="max-w-3xl bg-slate-900 border-slate-700 text-slate-200"
        data-testid="wdm-las-dialog"
      >
        <DialogHeader>
          <DialogTitle>Import LAS logs</DialogTitle>
          <DialogDescription className="text-slate-400">
            LAS 1.2, 2.0 and 3.0 — curves convert to SI on import (factors recorded in provenance).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="inline-flex items-center gap-2 px-2.5 py-1.5 text-xs rounded border
            border-cyan-700/60 text-cyan-300 hover:bg-cyan-500/10 cursor-pointer w-fit"
          >
            {busy && !parsed ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {fileName ? 'Choose a different file…' : 'Choose a LAS file…'}
            <input
              type="file"
              accept=".las,.LAS,.txt"
              className="hidden"
              data-testid="wdm-las-file"
              onChange={pickFile}
            />
          </label>
          {fileName && (
            <span className="ml-2 text-xs text-slate-400 inline-flex items-center gap-1">
              <FileText className="w-3.5 h-3.5" /> {fileName}
            </span>
          )}

          {parsed && (
            <>
              <div className="flex items-center gap-4 text-xs rounded border border-slate-800 bg-slate-950/40 px-2 py-1.5"
                data-testid="wdm-las-target"
              >
                <span className="text-slate-500">Load into</span>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="wdm-las-target"
                    disabled={!ownWells.length}
                    checked={target !== 'new'}
                    onChange={() => setTarget(ownWells.find((w) => w.id === initialTargetId)?.id || ownWells[0]?.id)}
                    data-testid="wdm-las-target-existing"
                  />
                  an existing well
                </label>
                {target !== 'new' && (
                  <select
                    className="rounded-md bg-slate-950 border border-slate-700 px-1.5 py-1 text-xs"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    data-testid="wdm-las-target-well"
                  >
                    {ownWells.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                )}
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="wdm-las-target"
                    checked={target === 'new'}
                    onChange={() => setTarget('new')}
                    data-testid="wdm-las-target-new"
                  />
                  a new well
                </label>
                {target !== 'new' && (
                  <span className="ml-auto text-slate-500" data-testid="wdm-las-target-note">
                    {existing.busy ? 'reading well…'
                      : existing.depth
                        ? `well depth grid ${existing.depth.log.start_md_m ?? '?'}–${existing.depth.log.stop_md_m ?? '?'} m${existing.depth.log.step_m != null ? ` step ${existing.depth.log.step_m}` : ''}; curves resample onto it`
                        : 'no depth curve yet; this file\'s depth becomes the well\'s grid'}
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-400" data-testid="wdm-las-summary">
                LAS {parsed.meta.version}{String(parsed.meta.wrap).toUpperCase() === 'YES' ? ', wrapped' : ''} · depth in{' '}
                {prep.depthUnit}{prep.depthFactor !== 1 ? ` → m (×${prep.depthFactor})` : ' (m)'} ·{' '}
                {prep.startMdM?.toFixed(1)}–{prep.stopMdM?.toFixed(1)} m ·{' '}
                {prep.stepM == null ? 'irregular step' : `step ${prep.stepM.toFixed(3)} m`} ·{' '}
                {prep.logs.length - 1} curves
                {parsed.meta.version >= 3 && parsed.meta.delimiter && parsed.meta.delimiter !== 'space' ? ` · ${parsed.meta.delimiter}-delimited` : ''}
              </p>
              {(parsed.meta.skippedCurves?.length > 0 || parsed.meta.ignoredSections?.length > 0) && (
                <p className="text-xs text-amber-300/90" data-testid="wdm-las-las3-note">
                  {parsed.meta.skippedCurves?.length > 0 && (
                    <>Not imported (text columns): {parsed.meta.skippedCurves.map((c) => `${c.mnemonic}${c.format ? ` {${c.format}}` : ''}`).join(', ')}. </>
                  )}
                  {parsed.meta.ignoredSections?.length > 0 && (
                    <>Other LAS 3.0 data blocks left out: {parsed.meta.ignoredSections.join(', ')} (only ~Log_Data imports as curves).</>
                  )}
                </p>
              )}

              <div className="max-h-48 overflow-auto border border-slate-800 rounded p-2">
                <table className="text-xs w-full" data-testid="wdm-las-curves">
                  <thead>
                    <tr>
                      <th className={thCls}>Keep</th>
                      <th className={thCls}>Mnemonic</th>
                      <th className={thCls}>Save as</th>
                      {target !== 'new' && <th className={thCls}>In well</th>}
                      <th className={thCls}>Description</th>
                      <th className={thCls}>Unit</th>
                      <th className={thCls}>Kind</th>
                      <th className={thCls}>Nulls</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prep.logs.map((l, i) => {
                      const unknownUnit = !l.converted && l.unit
                        && !KNOWN_SI.has(String(l.unit).toUpperCase());
                      return (
                        <tr key={l.mnemonic} data-testid={`wdm-las-curve-${l.mnemonic}`}>
                          <td className={tdCls}>
                            {i === 0 ? (
                              <span title="The depth curve always imports" className="text-slate-500">—</span>
                            ) : (
                              <input
                                type="checkbox"
                                data-testid={`wdm-las-keep-${l.mnemonic}`}
                                checked={!!keep[l.mnemonic]}
                                onChange={() => setKeep((k) => ({ ...k, [l.mnemonic]: !k[l.mnemonic] }))}
                              />
                            )}
                          </td>
                          <td className={`${tdCls} text-slate-100`}>{l.mnemonic}</td>
                          <td className={tdCls}>
                            {i === 0 ? (
                              <span className="text-slate-500">{target !== 'new' && existing.depth ? `${existing.depth.log.mnemonic} (well)` : l.mnemonic}</span>
                            ) : (
                              <input
                                className="rounded bg-slate-950 border border-slate-700 text-slate-200 px-1 py-0.5 text-xs w-24"
                                value={names[l.mnemonic] ?? l.mnemonic}
                                title="Mnemonic to save this curve under (keep the file's name or type your own)"
                                data-testid={`wdm-las-name-${l.mnemonic}`}
                                onChange={(e) => setNames((n) => ({ ...n, [l.mnemonic]: e.target.value }))}
                              />
                            )}
                          </td>
                          {target !== 'new' && (
                            <td className={tdCls}>
                              {i === 0 ? '—' : (() => {
                                const clash = clashFor(names[l.mnemonic] ?? l.mnemonic, existing.logs);
                                if (!clash) return <span className="text-slate-600">new</span>;
                                return (
                                  <select
                                    className="rounded bg-slate-950 border border-amber-700/60 text-amber-200 px-1 py-0.5 text-[11px]"
                                    value={onClash[l.mnemonic] || 'suffix'}
                                    title={`The well already has ${clash.mnemonic}`}
                                    data-testid={`wdm-las-clash-${l.mnemonic}`}
                                    onChange={(e) => setOnClash((c) => ({ ...c, [l.mnemonic]: e.target.value }))}
                                  >
                                    <option value="suffix">exists · keep both (:n)</option>
                                    <option value="replace">exists · replace</option>
                                  </select>
                                );
                              })()}
                            </td>
                          )}
                          <td className={`${tdCls} text-slate-400 max-w-[180px] truncate`}>{l.description}</td>
                          <td className={tdCls}>
                            {l.converted
                              ? <span className="text-emerald-300">{l.sourceUnit} → {l.unit}</span>
                              : l.unit || '—'}
                            {unknownUnit && (
                              <span
                                className="ml-1 rounded bg-amber-500/15 text-amber-300 px-1 text-[10px]"
                                title="Unit not recognised — imported unchanged, no conversion applied"
                              >
                                as-is
                              </span>
                            )}
                          </td>
                          <td className={`${tdCls} text-slate-400`}>{l.kind || '—'}</td>
                          <td className={tdCls}>{l.nullCount}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {target === 'new' && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <input className={inputCls} placeholder="Well name *" value={head.name}
                    onChange={setHeadField('name')} data-testid="wdm-las-name" />
                  <input className={inputCls} placeholder="UWI (optional)" value={head.uwi}
                    onChange={setHeadField('uwi')} />
                  <input className={inputCls} placeholder="Surface X (m) *" value={head.x}
                    onChange={setHeadField('x')} data-testid="wdm-las-x"
                    title="LAS files rarely carry surface coordinates — enter world metres" />
                  <input className={inputCls} placeholder="Surface Y (m) *" value={head.y}
                    onChange={setHeadField('y')} data-testid="wdm-las-y" />
                  <input className={inputCls} placeholder="KB m above datum" value={head.kb}
                    onChange={setHeadField('kb')} />
                  <input className={inputCls} placeholder="TD m MD" value={head.td}
                    onChange={setHeadField('td')} />
                  <div className="col-span-2">
                    <CrsPicker
                      value={crsTag || crsContext?.projectTag || null}
                      onChange={(tag) => setCrsTag(tag)}
                      customDefs={crsContext?.customDefs || {}}
                    />
                  </div>
                  <input className={`${inputCls} col-span-2`} placeholder="CRS note (optional context)"
                    value={head.crs} onChange={setHeadField('crs')} />
                </div>
              )}
            </>
          )}

          {error && (
            <div className="text-xs text-red-400" data-testid="wdm-las-error">{error}</div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" className="border-slate-700 text-slate-300"
            onClick={() => close(false)}
          >
            Cancel
          </Button>
          <Button size="sm" className="bg-cyan-600 hover:bg-cyan-500 text-white"
            disabled={!parsed || busy} onClick={doImport} data-testid="wdm-las-import"
          >
            {busy && parsed ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
