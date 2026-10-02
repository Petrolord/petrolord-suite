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

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { planMerge, findDepthLog, clashFor, sameGrid } from '../engine/mergeImport';
import { Loader2, Upload, FileText } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import CrsPicker from '@/components/crs/CrsPicker';
import useCrsContext from '@/components/crs/useCrsContext';
import { placeWellLocation } from '@/lib/crs/wellPlacement';
import { UNKNOWN } from '@/lib/crs/tags';
import { intervalsFromLasBlocks } from '../engine/lasBlocks';
import { topsFromLasBlocks } from '../engine/lasTops';
import { isDepthAlias } from '../engine/lasIndex';
import { crsUnit } from '@/lib/crs';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { editCell, fromDisp, fmtDepth, unitText } from '../engine/displayUnits';
import { datumFromEntry, datumToEntry } from '@/lib/wellDatum';
import { DatumFields, DatumProblems, EMPTY_DATUM_FIELDS } from '@/components/wells/DatumEditor';

const inputCls = 'rounded-md bg-pl-surface border border-pl-border-strong text-pl-text px-1.5 py-1 text-xs w-full';
const thCls = 'text-left font-medium text-pl-muted pr-3 pb-1';
const tdCls = 'pr-3 py-0.5 text-pl-text whitespace-nowrap';

// Units the registry keeps as they are (no conversion needed). WDM-U1-012:
// common spellings of the same units (m3/m3, pu, ohm-m, degC ...) are listed
// so they are not flagged "as-is" as if they were unknown.
const KNOWN_SI = new Set(['M', 'US/M', 'MS', 'S', 'GAPI', 'API', 'G/C3', 'G/CM3', 'G/CC', 'KG/M3', 'V/V', 'M3/M3', 'CFCF', 'PU', 'DEC', 'FRAC',
  'OHMM', 'OHM.M', 'OHM-M', 'OHM_M', 'MV', 'IN', 'MM', 'CM', 'B/E', 'BARN/E', '%', 'PPM', 'DEGC', 'DEG C', 'DEGF', 'DEG', 'KPA', 'MPA', 'PSI',
  'N/A', 'UNITLESS', 'NONE', '']);

const isDepthRow = (l) => isDepthAlias(l.mnemonic);

const XY_UNITS = [['m', 'metres'], ['ft', 'feet'], ['ftUS', 'US survey feet']];

/** A header input that keeps its label once filled (WDM-U1-007). */
function HeadField({ label, children }) {
  return (
    <label className="flex flex-col gap-0.5 text-[11px] text-pl-muted">
      <span>{label}</span>
      {children}
    </label>
  );
}

const emptyHeader = { name: '', uwi: '', x: '', y: '', kb: '', td: '', crs: '' };

/**
 * @param {?string} [p.initialTargetId] well selected in the tree; when it
 *   is one of the caller's own wells the wizard targets it by default
 */
export default function LasImportDialog({ open, onOpenChange, backend, wells, onDone, initialTargetId = null, unit = 'm' }) {
  const u = unitText(unit); // WDM-U2-001: KB and TD typed in the display unit
  const { crsContext, commitAutoSetProject } = useCrsContext();
  const [crsTag, setCrsTag] = useState(null);
  const [lasIntervals, setLasIntervals] = useState(null);      // ST1 {intervals, skipped} from the LAS 3.0 blocks
  const [importIntervals, setImportIntervals] = useState(false);
  const [lasTops, setLasTops] = useState(null);                // WDM-U1-009 {tops, block, skipped} from ~Tops_Data
  const [importTops, setImportTops] = useState(false);
  const [importText, setImportText] = useState(true);          // WDM-U2-017 LAS 3.0 text channels
  const [upload, setUpload] = useState(null);                  // WDM-U2-013 {done, total, mnemonic}
  const cancelRef = useRef({ cancelled: false });
  const [xyUnit, setXyUnit] = useState('m');                   // unit of the typed surface X/Y (WDM-U1-004)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState(null);
  const [parsed, setParsed] = useState(null);       // {meta, prep}
  const [keep, setKeep] = useState({});             // mnemonic -> bool
  const [target, setTarget] = useState('new');      // 'new' | existing well id
  const [head, setHead] = useState(emptyHeader);
  // WDM-U2-007: the datum of the new well, pre-filled from the LAS header as
  // a proposal the user reads, corrects and confirms by importing
  const [datumFields, setDatumFields] = useState(EMPTY_DATUM_FIELDS);
  const datumColumns = typeof backend.hasDatumColumns === 'function' ? backend.hasDatumColumns() !== false : true;
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
    setLasTops(null);
    setImportTops(false);
    setXyUnit('m');
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
      // ST1: LAS 3.0 core / lithology blocks become interval logs, on by default
      const found = intervalsFromLasBlocks(result.meta.blocks || {});
      setLasIntervals(found);
      setImportIntervals(found.intervals.length > 0);
      const t = topsFromLasBlocks(result.meta.blocks || {});
      setLasTops(t);
      setImportTops(t.tops.length > 0);
      setImportText(true);
      const s = result.meta.suggestedHeader;
      // WDM-U1-008: XWELL/YWELL (or X/Y) from the file are offered, with the
      // unit the file states; the user still declares the CRS
      setXyUnit(s.xyUnit || 'm');
      setHead({
        name: s.name || '',
        uwi: s.uwi || '',
        x: s.surfaceX != null ? String(s.surfaceX) : '',
        y: s.surfaceY != null ? String(s.surfaceY) : '',
        kb: '',
        td: s.tdMdM != null ? editCell(s.tdMdM, u, 2) : '',
        crs: '',
      });
      const prop = s.datumProposal?.fields;
      setDatumFields(prop
        ? datumToEntry({ refKind: prop.refKind, refElevM: prop.refElevM, groundElevM: prop.groundElevM, environment: prop.environment, verticalDatum: prop.verticalDatum }, u, 3)
        : { ...EMPTY_DATUM_FIELDS, refElev: s.kbM != null ? editCell(s.kbM, u, 3) : '', refKind: s.kbM != null ? 'KB' : '' });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const setHeadField = (k) => (e) => setHead((h) => ({ ...h, [k]: e.target.value }));

  // WDM-U2-017: coded text curves are never interpolated, so they go in
  // only on the file's own grid (a new well, a well with no depth yet, or
  // a well whose depth grid is this file's)
  const textLogs = parsed?.prep?.textLogs || [];
  const textAllowed = target === 'new' || !existing.depth || (parsed && sameGrid(parsed.prep.logs[0].data, existing.depth.data));

  const doImport = async () => {
    const withText = importText && textAllowed && textLogs.length > 0;
    const prepLogs = withText ? [...parsed.prep.logs, ...textLogs] : parsed.prep.logs;
    const keepAll = withText ? { ...keep, ...Object.fromEntries(textLogs.map((l) => [l.mnemonic, true])) } : keep;
    const logs = prepLogs.filter((l, i) => i === 0 || keepAll[l.mnemonic]);
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
          throw new Error('Enter the surface X and Y in the coordinate system chosen below '
            + '(this file does not carry them).');
        }
        // a blank elevation is "not set", never 0; an elevation with no kind is a KB
        const entry = datumFromEntry({ ...datumFields, refKind: datumFields.refKind || (datumFields.refElev.trim() !== '' ? 'KB' : '') }, u);
        if (entry.errors.length) throw new Error(entry.errors[0]);
        const tdMdM = head.td.trim() === '' ? null : fromDisp(head.td, u);
        if (tdMdM !== null && !(tdMdM > 0)) throw new Error(`TD must be a positive number (${u} MD).`);
        // Structured placement: declared CRS -> Project CRS (Phase 4).
        const placed = placeWellLocation(
          {
            mode: 'xy',
            crsTag: crsTag || crsContext?.projectTag || UNKNOWN,
            x: surfaceX,
            y: surfaceY,
            xyUnit,
          },
          crsContext || {},
        );
        well = await backend.saveWell({
          name,
          uwi: head.uwi.trim() || null,
          surfaceX: placed.surfaceX,
          surfaceY: placed.surfaceY,
          datum: entry.datum,
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
        if (existing.busy || existing.wellId !== target) throw new Error('Still reading the target well. Try again in a moment.');
        const plan = planMerge({
          prepLogs, keep: keepAll, names, onClash,
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
        const plan = planMerge({ prepLogs, keep: keepAll, names });
        if (plan.errors.length) throw new Error(plan.errors[0]);
        toSave = plan.logs;
      }
      cancelRef.current = { cancelled: false };
      let saved;
      try {
        saved = await backend.saveLogs(wellId, toSave, { onProgress: setUpload, cancel: cancelRef.current });
      } catch (err) {
        if (err?.name !== 'LogsStoppedError') throw err;
        // honest partial result: what was saved stays, and the status says so
        setUpload(null);
        close(false);
        onDone({ wellId, well, nLogs: err.saved.length, nCurves: err.saved.filter((l) => !isDepthRow(l)).length, fileName, note: err.message });
        return;
      }
      setUpload(null);
      // WDM-U1-009: tops from the LAS 3.0 Tops block. A new well takes them
      // all; an existing well gains the names it does not have yet.
      let nTops = 0;
      let topsKept = 0;
      if (importTops && lasTops?.tops?.length && backend.saveTop) {
        const have = target === 'new' ? [] : await backend.listTops(wellId);
        const haveNames = new Set(have.map((x) => String(x.name).trim().toUpperCase()));
        for (const tp of lasTops.tops) {
          if (haveNames.has(tp.name.toUpperCase())) { topsKept++; continue; }
          await backend.saveTop(wellId, { name: tp.name, mdM: tp.md, interpreter: null });
          nTops++;
        }
      }
      let nIntervals = 0;
      if (importIntervals && lasIntervals?.intervals?.length && backend.replaceIntervals) {
        const byKind = new Map();
        for (const r of lasIntervals.intervals) { if (!byKind.has(r.kind)) byKind.set(r.kind, []); byKind.get(r.kind).push(r); }
        for (const [kind, rows] of byKind) { await backend.replaceIntervals(wellId, kind, rows); nIntervals += rows.length; }
      }
      close(false);
      const extra = [
        note,
        nIntervals ? `${nIntervals} interval${nIntervals === 1 ? '' : 's'} imported from the LAS 3.0 blocks` : '',
        nTops ? `${nTops} top${nTops === 1 ? '' : 's'} from the Tops block` : '',
        topsKept ? `${topsKept} top${topsKept === 1 ? '' : 's'} already on the well kept as they were` : '',
      ].filter(Boolean).join(' · ');
      const nCurves = saved.filter((l) => !isDepthRow(l)).length;
      onDone({ wellId, well, nLogs: saved.length, nCurves, nIntervals, nTops, fileName, note: extra });
    } catch (err) {
      setError(err.message);
      setBusy(false);
      setUpload(null);
    }
  };

  const prep = parsed?.prep;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        className="max-w-3xl"
        data-testid="wdm-las-dialog"
      >
        <DialogHeader>
          <DialogTitle>Import LAS logs</DialogTitle>
          <DialogDescription>
            LAS 1.2, 2.0 and 3.0. Curves convert to SI on import (factors recorded in provenance).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="inline-flex items-center gap-2 px-2.5 py-1.5 text-xs rounded border
            border-pl-primary/60 text-pl-primary-text hover:bg-pl-primary/10 cursor-pointer w-fit"
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
            <span className="ml-2 text-xs text-pl-muted inline-flex items-center gap-1">
              <FileText className="w-3.5 h-3.5" /> {fileName}
            </span>
          )}

          {parsed && (
            <>
              <div className="flex items-center gap-4 text-xs rounded border border-pl-border bg-pl-sunken px-2 py-1.5"
                data-testid="wdm-las-target"
              >
                <span className="text-pl-muted">Load into</span>
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
                    className="rounded-md bg-pl-surface border border-pl-border-strong px-1.5 py-1 text-xs"
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
                  <span className="ml-auto text-pl-muted" data-testid="wdm-las-target-note">
                    {existing.busy ? 'reading well…'
                      : existing.depth
                        ? `well depth grid ${existing.depth.log.start_md_m ?? '?'}–${existing.depth.log.stop_md_m ?? '?'} m${existing.depth.log.step_m != null ? ` step ${existing.depth.log.step_m}` : ''}; curves resample onto it`
                        : 'no depth curve yet; this file\'s depth becomes the well\'s grid'}
                  </span>
                )}
              </div>

              <p className="text-xs text-pl-muted" data-testid="wdm-las-summary">
                LAS {parsed.meta.version}{String(parsed.meta.wrap).toUpperCase() === 'YES' ? ', wrapped' : ''} · depth in{' '}
                {prep.depthUnit}{prep.depthFactor !== 1 ? ` → m (×${prep.depthFactor})` : ' (m)'} ·{' '}
                {fmtDepth(prep.startMdM, u)}–{fmtDepth(prep.stopMdM, u)} {u} ·{' '}
                {prep.stepM == null ? 'irregular step' : `step ${fmtDepth(prep.stepM, u, 3)} ${u}`} ·{' '}
                {prep.logs.length - 1} curve{prep.logs.length - 1 === 1 ? '' : 's'}
                {parsed.meta.version >= 3 && parsed.meta.delimiter && parsed.meta.delimiter !== 'space' ? ` · ${parsed.meta.delimiter}-delimited` : ''}
              </p>
              {parsed.meta.indexNotes?.length > 0 && (
                <p className="text-xs text-pl-warning-text" data-testid="wdm-las-index-note">{parsed.meta.indexNotes.join(' ')}</p>
              )}
              {(parsed.meta.skippedCurves?.length > 0 || parsed.meta.ignoredSections?.length > 0) && (
                <p className="text-xs text-pl-warning-text" data-testid="wdm-las-las3-note">
                  {parsed.meta.skippedCurves?.length > 0 && (
                    <>Text columns: {parsed.meta.skippedCurves.map((c) => `${c.mnemonic}${c.format ? ` {${c.format}}` : ''}`).join(', ')}. </>
                  )}
                  {textLogs.length > 0 && (
                    <label className="flex items-center gap-1 mt-1 text-pl-text" data-testid="wdm-las-text">
                      <input type="checkbox" checked={importText && textAllowed} disabled={!textAllowed} onChange={(e) => setImportText(e.target.checked)} data-testid="wdm-las-text-check" />
                      Import {textLogs.map((l) => (l.provenance.text_channel === 'datetime'
                        ? `${l.mnemonic} as seconds after ${l.provenance.time_origin}${l.provenance.zone_assumed_utc ? ' (no zone given, read as UTC)' : ''}`
                        : `${l.mnemonic} as codes (${Object.entries(l.provenance.codes).map(([k, v]) => `${k} = ${v}`).join(', ')})`)).join('; ')}
                      {!textAllowed ? ' (only on this file\'s own depth grid: coded values cannot be resampled onto the well\'s grid)' : ''}
                    </label>
                  )}
                  {parsed.meta.textSkipped?.length > 0 && (
                    <span className="block" data-testid="wdm-las-text-skipped">Not imported: {parsed.meta.textSkipped.map((x) => `${x.mnemonic} (${x.reason})`).join('; ')}.</span>
                  )}
                  {(() => {
                    // the Tops block is offered below when it yields tops (WDM-U1-009)
                    const other = (parsed.meta.ignoredSections || []).filter((n) => !(lasTops?.tops?.length && n === lasTops.block));
                    return other.length > 0 ? <>Other LAS 3.0 data blocks: {other.join(', ')} (only ~Log_Data imports as curves).</> : null;
                  })()}
                  {lasIntervals?.intervals?.length > 0 && (
                    <label className="flex items-center gap-1 mt-1 text-pl-text" data-testid="wdm-las-intervals">
                      <input type="checkbox" checked={importIntervals} onChange={(e) => setImportIntervals(e.target.checked)} data-testid="wdm-las-intervals-check" />
                      Import {lasIntervals.intervals.length} interval{lasIntervals.intervals.length === 1 ? '' : 's'} from the {Array.from(new Set(lasIntervals.intervals.map((r) => r.kind))).map((k) => k.replace(/_/g, ' ')).join(' and ')} block{new Set(lasIntervals.intervals.map((r) => r.kind)).size === 1 ? '' : 's'} (replaces those kinds on the well)
                    </label>
                  )}
                  {lasTops?.tops?.length > 0 && (
                    <label className="flex items-center gap-1 mt-1 text-pl-text" data-testid="wdm-las-tops">
                      <input type="checkbox" checked={importTops} onChange={(e) => setImportTops(e.target.checked)} data-testid="wdm-las-tops-check" />
                      Import {lasTops.tops.length} top{lasTops.tops.length === 1 ? '' : 's'} from the {lasTops.block} block ({lasTops.tops.map((x) => `${x.name} ${x.md.toFixed(1)} m MD`).join(', ')})
                      {target !== 'new' ? '; names the well already has are kept as they are' : ''}
                    </label>
                  )}
                  {lasTops?.skipped?.length > 0 && (
                    <span className="block text-pl-warning-text" data-testid="wdm-las-tops-skipped">Tops not imported: {lasTops.skipped.join('; ')}.</span>
                  )}
                  {lasIntervals?.skipped?.filter((x) => /dropped/.test(x.reason)).map((x) => (
                    <div key={x.block} className="text-pl-warning-text">{x.block}: {x.reason}.</div>
                  ))}
                </p>
              )}

              <div className="max-h-48 overflow-auto border border-pl-border rounded p-2">
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
                              <span title="The depth curve always imports" className="text-pl-muted">{EMPTY_VALUE}</span>
                            ) : (
                              <input
                                type="checkbox"
                                data-testid={`wdm-las-keep-${l.mnemonic}`}
                                checked={!!keep[l.mnemonic]}
                                onChange={() => setKeep((k) => ({ ...k, [l.mnemonic]: !k[l.mnemonic] }))}
                              />
                            )}
                          </td>
                          <td className={`${tdCls} text-pl-text`}>{l.mnemonic}</td>
                          <td className={tdCls}>
                            {i === 0 ? (
                              <span className="text-pl-muted">{target !== 'new' && existing.depth ? `${existing.depth.log.mnemonic} (well)` : l.mnemonic}</span>
                            ) : (
                              <input
                                className="rounded bg-pl-surface border border-pl-border-strong text-pl-text px-1 py-0.5 text-xs w-24"
                                value={names[l.mnemonic] ?? l.mnemonic}
                                title="Mnemonic to save this curve under (keep the file's name or type your own)"
                                data-testid={`wdm-las-name-${l.mnemonic}`}
                                onChange={(e) => setNames((n) => ({ ...n, [l.mnemonic]: e.target.value }))}
                              />
                            )}
                          </td>
                          {target !== 'new' && (
                            <td className={tdCls}>
                              {i === 0 ? EMPTY_VALUE : (() => {
                                const clash = clashFor(names[l.mnemonic] ?? l.mnemonic, existing.logs);
                                if (!clash) return <span className="text-pl-muted">new</span>;
                                return (
                                  <select
                                    className="rounded bg-pl-surface border border-pl-warning/60 text-pl-warning-text px-1 py-0.5 text-[11px]"
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
                          <td className={`${tdCls} text-pl-muted max-w-[180px] truncate`}>{l.description}</td>
                          <td className={tdCls}>
                            {l.converted
                              ? <span className="text-pl-success-text">{l.sourceUnit} → {l.unit}</span>
                              : l.unit || EMPTY_VALUE}
                            {unknownUnit && (
                              <span
                                className="ml-1 rounded bg-pl-warning-bg text-pl-warning-text px-1 text-[10px]"
                                title="Unit not recognised: imported unchanged, with no conversion applied"
                              >
                                as-is
                              </span>
                            )}
                          </td>
                          <td className={`${tdCls} text-pl-muted`}>{l.kind || EMPTY_VALUE}</td>
                          <td className={tdCls}>{l.nullCount}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {target === 'new' && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2" data-testid="wdm-las-header">
                  <HeadField label="Well name *">
                    <input className={inputCls} value={head.name} onChange={setHeadField('name')} data-testid="wdm-las-name" />
                  </HeadField>
                  <HeadField label="UWI (optional)">
                    <input className={inputCls} value={head.uwi} onChange={setHeadField('uwi')} data-testid="wdm-las-uwi" />
                  </HeadField>
                  <HeadField label={`Surface X (${xyUnit}) *`}>
                    <input className={inputCls} value={head.x} onChange={setHeadField('x')} data-testid="wdm-las-x"
                      title="Easting in the coordinate system chosen below" />
                  </HeadField>
                  <HeadField label={`Surface Y (${xyUnit}) *`}>
                    <input className={inputCls} value={head.y} onChange={setHeadField('y')} data-testid="wdm-las-y"
                      title="Northing in the coordinate system chosen below" />
                  </HeadField>
                  <HeadField label={`TD (${u} MD)`}>
                    <input className={inputCls} value={head.td} onChange={setHeadField('td')} data-testid="wdm-las-td" />
                  </HeadField>
                  <HeadField label="X and Y are in">
                    <select className={inputCls} value={xyUnit} onChange={(e) => setXyUnit(e.target.value)} data-testid="wdm-las-xyunit"
                      title="Unit of the X and Y numbers above; they convert to the coordinate system's own unit on import">
                      {XY_UNITS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </HeadField>
                  <HeadField label="CRS note (optional context)">
                    <input className={inputCls} value={head.crs} onChange={setHeadField('crs')} data-testid="wdm-las-crsnote" />
                  </HeadField>
                  <div className="col-span-2 md:col-span-4 rounded border border-pl-border p-2 space-y-1.5" data-testid="wdm-las-datum">
                    <div className="text-[11px] uppercase tracking-wider text-pl-muted">Depth reference</div>
                    {(() => {
                      const prop = parsed.meta.suggestedHeader?.datumProposal;
                      if (!prop || !prop.found.length) return <p className="text-[11px] text-pl-muted" data-testid="wdm-las-datum-source">The file header says nothing about the depth reference. Enter it here, or leave it not set and enter it later on the Header tab.</p>;
                      return (
                        <div className="text-[11px] text-pl-muted space-y-0.5" data-testid="wdm-las-datum-source">
                          <div>Proposed from the file header ({prop.found.map((x) => `${x.mnemonic} ${x.text}`).join(', ')}). Check it before importing: it is saved as shown below.</div>
                          {prop.conflicts.map((c) => <div key={c} className="text-pl-warning-text" data-testid="wdm-las-datum-conflict">{c}</div>)}
                          {prop.notes.map((n) => <div key={n}>{n}</div>)}
                        </div>
                      );
                    })()}
                    <DatumFields fields={datumFields} onChange={setDatumFields} unit={u} columns={datumColumns} testIdPrefix="wdm-las-datum" elevTestId="wdm-las-kb" />
                    <DatumProblems {...(() => { const r = datumFromEntry({ ...datumFields, refKind: datumFields.refKind || (datumFields.refElev.trim() !== '' ? 'KB' : '') }, u); return { errors: r.errors, warnings: r.warnings }; })()} testIdPrefix="wdm-las-datum" />
                  </div>
                  <div className="col-span-2 md:col-span-4">
                    <CrsPicker
                      value={crsTag || crsContext?.projectTag || null}
                      onChange={(tag) => setCrsTag(tag)}
                      customDefs={crsContext?.customDefs || {}}
                    />
                    {(() => {
                      const tag = crsTag || crsContext?.projectTag || null;
                      const native = tag ? crsUnit(tag, crsContext?.customDefs || {}) : null;
                      return native && native !== xyUnit ? (
                        <p className="mt-1 text-[11px] text-pl-muted" data-testid="wdm-las-xyunit-note">
                          This coordinate system works in {XY_UNITS.find(([v]) => v === native)?.[1] || native}; the {XY_UNITS.find(([v]) => v === xyUnit)?.[1]} you enter convert on import.
                        </p>
                      ) : null;
                    })()}
                    {parsed.meta.suggestedHeader?.surfaceX != null && (
                      <p className="mt-1 text-[11px] text-pl-muted" data-testid="wdm-las-xy-from-file">Surface X and Y come from the file's ~Well section; check the coordinate system they are in.</p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {upload && (
            <div data-testid="wdm-las-progress" className="space-y-1 text-xs">
              <div className="h-1.5 rounded bg-pl-sunken overflow-hidden">
                <div className="h-full bg-pl-primary" style={{ width: `${Math.round((upload.done / Math.max(1, upload.total)) * 100)}%` }} />
              </div>
              <div className="text-pl-muted">Saving curve {Math.min(upload.done + 1, upload.total)} of {upload.total}{upload.mnemonic ? ` (${upload.mnemonic})` : ''}</div>
            </div>
          )}
          {error && (
            <div className="text-xs text-pl-danger-text" data-testid="wdm-las-error">{error}</div>
          )}
        </div>

        <DialogFooter>
          {upload ? (
            <Button variant="outline" size="sm" onClick={() => { cancelRef.current.cancelled = true; }} data-testid="wdm-las-stop">
              Stop after this curve
            </Button>
          ) : (
            <Button variant="outline" size="sm"
              onClick={() => close(false)}
            >
              Cancel
            </Button>
          )}
          <Button size="sm"
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
