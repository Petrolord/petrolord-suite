// Project Data Inventory (owner request 2026-10-11): the start-of-project
// data grid, built from what is loaded in Petrolord with no typing, plus
// what the user records about data held elsewhere. Shared by QI Studio and
// Petrophysics Studio; the host passes a data source, the saved state and
// a setter (it saves the state inside its own project payload).
//
// The board is white paper in both themes (chart template standard); the
// controls around it follow the theme. Presentation view shows the board
// full width; PNG, PDF and CSV come from the same built inventory.
import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  Presentation, Image as ImageIcon, FileText, FileSpreadsheet, X, Loader2, RefreshCw, Plus, Trash2,
} from 'lucide-react';
import {
  buildInventory, logsToScan, inventoryCsv, STATUS, OVERRIDE_CHOICES, MANUAL_STATES, MANUAL_KINDS, COLUMN_BY_KEY,
  setCellOverride, setRemark, setInterval as setIntervalState, upsertManual, removeManual, setNote, sanitiseInventoryState,
} from '@/lib/projectInventory';
import { downloadText } from '@/lib/fullPrecision';
import InventoryBoard from './InventoryBoard';
import { StatusGlyph } from './StatusArt';

const card = 'rounded-lg border border-pl-border bg-pl-surface p-3';
const field = 'rounded border border-pl-border-strong bg-pl-surface px-1.5 py-1 text-xs text-pl-text';
const btn = 'inline-flex items-center gap-1 whitespace-nowrap px-2 py-1 text-xs rounded border border-pl-border text-pl-text hover:bg-pl-sunken disabled:opacity-50';
const PRESENT_W = 1920;
const SCAN_CONCURRENCY = 4;
const SCAN_MAX_CURVES = 600;

const safeName = (s) => String(s || 'project').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 60);

/** Curve samples for the scan: the best curve per family of every well, a few at a time. */
function useCurveScan(bundles, downloadCurve, enabled) {
  const [samples, setSamples] = useState({});
  const [progress, setProgress] = useState({ done: 0, total: 0, failed: 0 });
  const seen = useRef(new Set());
  useEffect(() => {
    if (!enabled || !bundles || !downloadCurve) return undefined;
    let live = true;
    const queue = [];
    for (const b of bundles) for (const l of logsToScan(b)) if (!seen.current.has(l.id) && l.storage_path !== null) queue.push(l);
    const todo = queue.slice(0, SCAN_MAX_CURVES);
    if (!todo.length) return undefined;
    todo.forEach((l) => seen.current.add(l.id));
    setProgress((p) => ({ done: p.done, total: p.total + todo.length, failed: p.failed }));
    let pending = {};
    let flushTimer = null;
    const flush = () => { if (!live) return; const batch = pending; pending = {}; setSamples((s) => ({ ...s, ...batch })); flushTimer = null; };
    let next = 0;
    const worker = async () => {
      while (live && next < todo.length) {
        const l = todo[next++];
        try {
          const v = await downloadCurve(l);
          pending[l.id] = v;
          if (!flushTimer) flushTimer = setTimeout(flush, 250);
          if (live) setProgress((p) => ({ ...p, done: p.done + 1 }));
        } catch {
          if (live) setProgress((p) => ({ ...p, done: p.done + 1, failed: p.failed + 1 }));
        }
      }
    };
    Promise.all(Array.from({ length: SCAN_CONCURRENCY }, worker)).then(() => { if (flushTimer) clearTimeout(flushTimer); flush(); });
    return () => { live = false; if (flushTimer) clearTimeout(flushTimer); };
  }, [bundles, downloadCurve, enabled]);
  return { samples, progress };
}

function CellEditor({ inv, selected, canWrite, onChange, onClose }) {
  const row = inv.rows.find((r) => r.wellId === selected.wellId);
  const col = COLUMN_BY_KEY[selected.column];
  if (!row || !col) return null;
  const cell = row.cells[col.key];
  const s = STATUS[cell.status];
  return (
    <section className={`${card} text-xs space-y-2`} data-testid="pdi-cell-detail">
      <div className="flex items-center gap-2">
        <StatusGlyph status={cell.status} size={16} />
        <span className="font-semibold text-pl-text">{`${row.wellName}: ${col.title}`}</span>
        <span className="text-pl-muted">{s?.label}</span>
        <button type="button" className="ml-auto text-pl-muted hover:text-pl-text" onClick={onClose} aria-label="Close the cell detail"><X className="w-4 h-4" /></button>
      </div>
      <p className="text-pl-text">{cell.text}</p>
      {cell.overridden && cell.auto && <p className="text-pl-muted">{`Petrolord found: ${STATUS[cell.auto.status]?.label}. ${cell.auto.text}`}</p>}
      {cell.curve?.provenance?.engine && <p className="text-pl-muted">{`Provenance: ${cell.curve.provenance.engine}${cell.curve.provenance.pipeline_version ? ` ${cell.curve.provenance.pipeline_version}` : ''}.`}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1">
          <span className="text-pl-muted">Set by hand</span>
          <select className={field} value={cell.overridden ? cell.status : 'auto'} disabled={!canWrite} data-testid="pdi-cell-override"
            onChange={(e) => onChange(setCellOverride(inv._state, row.wellId, col.key, { status: e.target.value }))}>
            {OVERRIDE_CHOICES.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1 flex-1 min-w-[220px]">
          <span className="text-pl-muted">Note</span>
          <input className={`${field} flex-1`} defaultValue={cell.note || ''} key={`${row.wellId}-${col.key}`} disabled={!canWrite} data-testid="pdi-cell-note"
            placeholder="Source, date or reason"
            onBlur={(e) => { if (e.target.value !== (cell.note || '')) onChange(setCellOverride(inv._state, row.wellId, col.key, { note: e.target.value })); }} />
        </label>
      </div>
    </section>
  );
}

function ManualEditor({ inv, wells, canWrite, onChange }) {
  const blank = { kind: 'fwr', title: '', well: '', state: 'received', source: '', date: '', note: '' };
  const [draft, setDraft] = useState(blank);
  const add = () => { onChange(upsertManual(inv._state, draft)); setDraft(blank); };
  return (
    <section className={`${card} space-y-2`} data-testid="pdi-manual">
      <div className="flex items-baseline gap-2">
        <h3 className="text-sm font-semibold text-pl-text">Data held outside Petrolord</h3>
        <span className="text-xs text-pl-muted">Reports, hard copies and files not loaded: they appear on the board and change the notes (a PVT or pressure report closes those gaps).</span>
      </div>
      {inv.manual.length > 0 && (
        <table className="text-xs w-full">
          <thead><tr className="text-left text-pl-muted">{['', 'Item', 'Kind', 'Well', 'State', 'Source', 'Date', 'Note', ''].map((h, i) => <th key={i} className="font-medium pr-2 pb-1">{h}</th>)}</tr></thead>
          <tbody>
            {inv.manual.map((m) => (
              <tr key={m.id} data-testid="pdi-manual-row" className="text-pl-text">
                <td className="pr-1"><StatusGlyph status={m.status} size={13} /></td>
                <td className="pr-2">{m.title || m.kindLabel}</td>
                <td className="pr-2 text-pl-muted">{m.kindLabel}</td>
                <td className="pr-2">{m.well || 'Project'}</td>
                <td className="pr-2">
                  <select className={field} value={m.state} disabled={!canWrite} onChange={(e) => onChange(upsertManual(inv._state, { ...m, state: e.target.value }))}>
                    {MANUAL_STATES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </td>
                <td className="pr-2">{m.source}</td>
                <td className="pr-2">{m.date}</td>
                <td className="pr-2 text-pl-muted">{m.note}</td>
                <td>{canWrite && <button type="button" className="text-pl-muted hover:text-pl-danger-text" aria-label={`Remove ${m.title || m.kindLabel}`} onClick={() => onChange(removeManual(inv._state, m.id))}><Trash2 className="w-3.5 h-3.5" /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {canWrite && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs" data-testid="pdi-manual-add">
          <select className={field} value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })} data-testid="pdi-manual-kind" aria-label="Kind">
            {MANUAL_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
          <input className={`${field} w-44`} placeholder="Title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} data-testid="pdi-manual-title" aria-label="Title" />
          <select className={field} value={draft.well} onChange={(e) => setDraft({ ...draft, well: e.target.value })} aria-label="Well">
            <option value="">Project</option>
            {wells.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
          <select className={field} value={draft.state} onChange={(e) => setDraft({ ...draft, state: e.target.value })} data-testid="pdi-manual-state" aria-label="State">
            {MANUAL_STATES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <input className={`${field} w-36`} placeholder="Source" value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value })} aria-label="Source" />
          <input type="date" className={field} value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} aria-label="Date" />
          <input className={`${field} w-48`} placeholder="Note" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} aria-label="Note" />
          <button type="button" className={btn} onClick={add} data-testid="pdi-manual-add-btn"><Plus className="w-3.5 h-3.5" /> Add</button>
        </div>
      )}
    </section>
  );
}

function PresentationOverlay({ children, onClose, onPng, onPdf, busy }) {
  const wrapRef = useRef(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(Math.min(1, (window.innerWidth - 16) / PRESENT_W));
    fit();
    window.addEventListener('resize', fit);
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('resize', fit); window.removeEventListener('keydown', onKey); };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] overflow-auto" style={{ background: '#e2e8f0' }} data-testid="pdi-present" role="dialog" aria-label="Presentation view">
      <div className="sticky top-0 z-10 flex justify-end gap-2 p-2" data-html2canvas-ignore="true">
        <button type="button" className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50" onClick={onPng} disabled={busy} data-testid="pdi-present-png"><ImageIcon className="w-3.5 h-3.5" /> PNG</button>
        <button type="button" className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50" onClick={onPdf} disabled={busy} data-testid="pdi-present-pdf"><FileText className="w-3.5 h-3.5" /> PDF</button>
        <button type="button" className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800 shadow-sm hover:bg-slate-50" onClick={onClose} data-testid="pdi-present-close"><X className="w-3.5 h-3.5" /> Close</button>
      </div>
      <div ref={wrapRef} style={{ width: PRESENT_W * scale, margin: '0 auto 24px' }}>
        <div data-pdi-scale="true" style={{ width: PRESENT_W, transform: `scale(${scale})`, transformOrigin: 'top left', boxShadow: '0 10px 30px rgba(15,23,42,0.18)' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * @param {Object} p
 * @param {{loadWells: Function, loadSeismic: Function, downloadCurve?: Function}} p.source
 * @param {string} [p.reloadKey] changes when the host's well or volume choice changes
 * @param {Object} p.state the saved additions (lib/projectInventory/state.js)
 * @param {(next) => void} p.onStateChange
 * @param {boolean} [p.canWrite]
 * @param {'qi'|'petro'} p.audience
 * @param {'ft'|'m'} [p.unit]
 * @param {Object} [p.defaultInterval] { mode: 'zones', names } for the host's targets
 * @param {{velocity?, records?}} [p.extras]
 * @param {string} [p.saveHint] where the additions are saved, in words
 */
export default function ProjectDataInventory({
  source, reloadKey = '', state, onStateChange, canWrite = true, audience = 'qi', unit = 'ft', projectName = '', appLabel = '',
  defaultInterval = { mode: 'well' }, extras, saveHint = '', wellsOverride = null, scan = true,
}) {
  const [bundles, setBundles] = useState(null);
  const [seismicData, setSeismicData] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [present, setPresent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exportBoard, setExportBoard] = useState(false);
  const [reload, setReload] = useState(0);
  const [remarkFor, setRemarkFor] = useState(null);
  const presentRef = useRef(null);
  const exportRef = useRef(null);

  useEffect(() => {
    let live = true;
    setError(null);
    (async () => {
      try {
        const [b, s] = await Promise.all([wellsOverride ? Promise.resolve(wellsOverride) : source.loadWells(), source.loadSeismic().catch(() => ({}))]);
        if (live) { setBundles(b); setSeismicData(s || {}); }
      } catch (e) {
        if (live) { setError(e.message || String(e)); setBundles([]); setSeismicData({}); }
      }
    })();
    return () => { live = false; };
  }, [source, reloadKey, reload, wellsOverride]);

  const { samples, progress } = useCurveScan(bundles, source.downloadCurve, scan);
  const clean = useMemo(() => sanitiseInventoryState(state), [state]);
  const inv = useMemo(() => {
    if (!bundles) return null;
    const built = buildInventory({ wells: bundles, seismicData: seismicData || {}, samples, state: clean, audience, unit, defaultInterval, extras });
    built._state = clean;
    return built;
  }, [bundles, seismicData, samples, clean, audience, unit, defaultInterval, extras]);

  const zoneNames = useMemo(() => [...new Set((bundles || []).flatMap((b) => (b.zones || []).map((z) => z.name)))].sort(), [bundles]);
  const intervalValue = inv ? (inv.interval?.mode === 'zones' ? `zones:${inv.interval.names.join('|')}` : 'well') : 'well';
  const intervalOptions = useMemo(() => {
    const opts = [{ value: 'well', label: 'Logged interval of each well' }];
    if (defaultInterval?.mode === 'zones' && defaultInterval.names?.length > 1) opts.push({ value: `zones:${defaultInterval.names.join('|')}`, label: `Study targets (${defaultInterval.names.join(', ')})` });
    for (const z of zoneNames) opts.push({ value: `zones:${z}`, label: `Zone: ${z}` });
    if (inv?.interval?.mode === 'zones' && !opts.some((o) => o.value === intervalValue)) opts.push({ value: intervalValue, label: inv.interval.names.join(', ') });
    return opts;
  }, [zoneNames, defaultInterval, inv, intervalValue]);

  const change = useCallback((next) => { if (canWrite) onStateChange(next); }, [canWrite, onStateChange]);

  const fileBase = `${safeName(projectName)}_data_inventory`;
  const capture = useCallback(async (node) => {
    const { default: html2canvas } = await import('html2canvas');
    const scaled = node.closest('[data-pdi-scale]');
    const prev = scaled ? scaled.style.transform : null;
    if (scaled) scaled.style.transform = 'none';
    try {
      return await html2canvas(node, { scale: 2, backgroundColor: '#ffffff', width: PRESENT_W, windowWidth: PRESENT_W, useCORS: true, logging: false });
    } finally {
      if (scaled) scaled.style.transform = prev;
    }
  }, []);
  const doPng = useCallback(async () => {
    setBusy(true);
    try {
      let node = presentRef.current;
      if (!node) {
        setExportBoard(true);
        await new Promise((r) => setTimeout(r, 300));
        node = exportRef.current;
      }
      const canvas = await capture(node);
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `${fileBase}.png`;
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) {
      setError(`The image could not be made: ${e.message}`);
    } finally {
      setExportBoard(false);
      setBusy(false);
    }
  }, [capture, fileBase]);
  const doPdf = useCallback(async () => {
    if (!inv) return;
    setBusy(true);
    try {
      const { inventoryPdf } = await import('@/lib/projectInventory/pdf');
      const doc = await inventoryPdf(inv, { projectName, appLabel });
      doc.save(`${fileBase}.pdf`);
    } catch (e) {
      setError(`The PDF could not be made: ${e.message}`);
    } finally { setBusy(false); }
  }, [inv, projectName, appLabel, fileBase]);
  const doCsv = useCallback(() => { if (inv) downloadText(`${fileBase}.csv`, inventoryCsv(inv, { projectName }), 'text/csv'); }, [inv, projectName, fileBase]);

  if (!inv) {
    return (
      <div className={`${card} flex items-center gap-2 text-xs text-pl-muted`} data-testid="pdi-loading">
        <Loader2 className="w-4 h-4 animate-spin" /> Reading the project registries
      </div>
    );
  }
  const scanning = progress.total > 0 && progress.done < progress.total;
  const noteActions = (f) => (
    <div className="flex items-center gap-2 mt-1.5" data-html2canvas-ignore="true">
      <button type="button" disabled={!canWrite} onClick={() => change(setNote(clean, f.id, { dismissed: !f.dismissed }))} data-testid={`pdi-note-dismiss-${f.id}`}
        style={{ fontSize: 11, color: '#1d4ed8', background: 'none', border: 0, padding: 0, cursor: canWrite ? 'pointer' : 'default' }}>
        {f.dismissed ? 'Restore' : 'Dismiss'}
      </button>
      <button type="button" disabled={!canWrite} data-testid={`pdi-note-comment-${f.id}`}
        onClick={() => { const c = window.prompt('Comment on this note (shown on the board and in the exports)', f.comment || ''); if (c !== null) change(setNote(clean, f.id, { comment: c })); }}
        style={{ fontSize: 11, color: '#1d4ed8', background: 'none', border: 0, padding: 0, cursor: canWrite ? 'pointer' : 'default' }}>
        {f.comment ? 'Edit comment' : 'Comment'}
      </button>
    </div>
  );
  const wellNames = inv.rows.map((r) => r.wellName);

  return (
    <div className="space-y-3" data-testid="pdi-root">
      <div className={`${card} flex flex-wrap items-center gap-2`} data-testid="pdi-toolbar">
        <label className="flex items-center gap-1.5 text-xs">
          <span className="text-pl-muted">Interval of interest</span>
          <select className={field} value={intervalValue} disabled={!canWrite && !!state?.interval} data-testid="pdi-interval"
            onChange={(e) => {
              const v = e.target.value;
              const next = v === 'well' ? { mode: 'well' } : { mode: 'zones', names: v.slice(6).split('|') };
              change(setIntervalState(clean, next));
            }}>
            {intervalOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <span className="text-xs text-pl-muted" data-testid="pdi-scan-state">
          {scanning ? `Reading curve samples ${progress.done} of ${progress.total}` : progress.total ? `Coverage from ${progress.total - progress.failed} curves' samples` : 'Coverage from curve extents'}
          {progress.failed ? `, ${progress.failed} could not be read` : ''}
        </span>
        {scanning && <Loader2 className="w-3.5 h-3.5 animate-spin text-pl-muted" />}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <button type="button" className={btn} onClick={() => setReload((n) => n + 1)} title="Read the registries again" data-testid="pdi-refresh"><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
          <button type="button" className={`${btn} border-pl-primary text-pl-primary-text`} onClick={() => setPresent(true)} data-testid="pdi-present-open"><Presentation className="w-3.5 h-3.5" /> Presentation view</button>
          <button type="button" className={btn} onClick={doPng} disabled={busy} data-testid="pdi-export-png"><ImageIcon className="w-3.5 h-3.5" /> PNG</button>
          <button type="button" className={btn} onClick={doPdf} disabled={busy} data-testid="pdi-export-pdf"><FileText className="w-3.5 h-3.5" /> PDF</button>
          <button type="button" className={btn} onClick={doCsv} data-testid="pdi-export-csv"><FileSpreadsheet className="w-3.5 h-3.5" /> CSV</button>
        </div>
        {(saveHint || !canWrite) && <p className="basis-full text-[11px] text-pl-muted" data-testid="pdi-save-hint">{canWrite ? saveHint : 'Open read-only: what you set here is not saved.'}</p>}
        {error && <p className="basis-full text-xs text-pl-danger-text" data-testid="pdi-error">{error}</p>}
      </div>

      <InventoryBoard
        inv={inv}
        mode="screen"
        projectName={projectName}
        appLabel={appLabel}
        selected={selected}
        onCellClick={(sel) => setSelected((cur) => (cur && cur.wellId === sel.wellId && cur.column === sel.column ? null : sel))}
        onRemarkClick={canWrite ? setRemarkFor : null}
        renderNoteActions={noteActions}
      />

      {selected && <CellEditor inv={inv} selected={selected} canWrite={canWrite} onChange={change} onClose={() => setSelected(null)} />}
      {remarkFor && (
        <section className={`${card} text-xs flex flex-wrap items-center gap-2`} data-testid="pdi-remark-editor">
          <span className="text-pl-muted">{`Remark for ${inv.rows.find((r) => r.wellId === remarkFor)?.wellName}`}</span>
          <input className={`${field} flex-1 min-w-[260px]`} defaultValue={clean.remarks[remarkFor] || inv.rows.find((r) => r.wellId === remarkFor)?.autoRemark || ''} key={remarkFor} data-testid="pdi-remark-input"
            onKeyDown={(e) => { if (e.key === 'Enter') { change(setRemark(clean, remarkFor, e.currentTarget.value)); setRemarkFor(null); } }} />
          <button type="button" className={btn} onClick={() => { change(setRemark(clean, remarkFor, '')); setRemarkFor(null); }}>Use the automatic remark</button>
          <button type="button" className={btn} onClick={() => setRemarkFor(null)}>Close</button>
        </section>
      )}
      <ManualEditor inv={inv} wells={wellNames} canWrite={canWrite} onChange={change} />

      {present && (
        <PresentationOverlay onClose={() => setPresent(false)} onPng={doPng} onPdf={doPdf} busy={busy}>
          <InventoryBoard inv={inv} mode="present" projectName={projectName} appLabel={appLabel} maxNotes={9} boardRef={presentRef} />
        </PresentationOverlay>
      )}
      {exportBoard && !present && (
        <div style={{ position: 'fixed', left: -20000, top: 0, width: PRESENT_W }} aria-hidden="true">
          <InventoryBoard inv={inv} mode="present" projectName={projectName} appLabel={appLabel} maxNotes={9} boardRef={exportRef} />
        </div>
      )}
    </div>
  );
}
