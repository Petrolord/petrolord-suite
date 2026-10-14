// Calibration import door (AppUpgrade PP-U2-002). A file (or pasted table)
// of RFT/MDT points, LOT/FIT/XLOT tests or mud weights: the app shows what
// it read (columns, rows, separator, the units it found in the header) and
// the user declares the columns, the depth reference, the depth unit and
// the pressure unit before anything is added. Rows not read are listed
// with their reasons.

import React, { useMemo, useState } from 'react';
import { FileUp } from 'lucide-react';
import {
  parseCalibrationTable, convertCalibration, missingChoices, guessWell, sheetToText, CAL_KINDS, DEPTH_REFS, VALUE_UNITS,
} from '../services/calibrationImport';
import { classifyFile, parseWorkbook } from '@/lib/tabularFile';
import { EMPTY_VALUE } from '@/lib/emptyValue';

const sel = 'bg-pl-surface border border-pl-border-strong rounded px-1 py-0.5 text-[11px] text-pl-text max-w-[9rem]';

/** "8 RFT/MDT pressure" or "5 mud weight intervals, 1 that took an influx". */
export function previewText(points) {
  const n = { rft: 0, kick: 0, lot: 0, fit: 0, xlot: 0, mw: 0, mwkick: 0, mwloss: 0 };
  const seen = new Set();
  for (const p of points) {
    if (p.interval) { if (seen.has(p.interval)) continue; seen.add(p.interval); }
    n[p.kind] = (n[p.kind] || 0) + 1;
  }
  const words = {
    rft: ['pressure point', 'pressure points'], kick: ['kick', 'kicks'], lot: ['LOT', 'LOTs'], fit: ['FIT', 'FITs'], xlot: ['XLOT', 'XLOTs'],
    mw: ['mud weight', 'mud weights'], mwkick: ['mud weight that took an influx', 'mud weights that took an influx'], mwloss: ['mud weight with losses', 'mud weights with losses'],
  };
  const parts = Object.entries(n).filter(([, v]) => v > 0).map(([k, v]) => `${v} ${words[k][v === 1 ? 0 : 1]}${k === 'mw' && seen.size ? ' held over intervals' : ''}`);
  return `${parts.join(', ') || 'nothing'} read`;
}

function Row({ label, children }) {
  return (
    <label className="flex items-center justify-between gap-2 text-[11px] text-pl-muted">
      <span>{label}</span>
      {children}
    </label>
  );
}

/**
 * @param {{ctx: {frame?, kbM?, mudlineMdM?, waterDepthM?}, onImport: (points, summary) => void,
 *   fmtZ: (m) => string, fmtP: (mpa) => string}} props
 */
const rowCount = (points) => new Set(points.map((p, i) => p.interval || `p${i}`)).size;

export default function CalibrationImport({ ctx, onImport, fmtZ = (m) => `${m.toFixed(1)} m`, fmtP = (p) => `${p.toFixed(2)} MPa`, wellsiteSource = null }) {
  // Wellsite Studio U2-008: the mud weights a live well published come in through this same door,
  // as a table with its units in the header, for the user to check and declare like any other file
  const [wsNote, setWsNote] = useState(null);
  const loadWellsite = async () => {
    setError(null); setWsNote(null);
    try {
      const src = await wellsiteSource();
      if (!src || !src.text) { setWsNote((src && src.note) || 'No mud weight curve from Wellsite Studio is on this well.'); return; }
      setText(src.text);
      read(src.text, src.name);
      setWsNote(src.note || null);
    } catch (e) { setError(e.message); }
  };
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [table, setTable] = useState(null);
  const [error, setError] = useState(null);
  const [m, setM] = useState({});

  const read = (raw, fileName) => {
    setError(null);
    setName(fileName || 'pasted table');
    try {
      const t = parseCalibrationTable(raw);
      setTable(t);
      setM({ ...t.guess, kind: t.guess.kind || '', well: t.guess.wellCol != null ? (guessWell(t.wells, ctx?.wellName) || '') : null });
    } catch (e) {
      setTable(null);
      setError(e.message);
    }
  };

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    // 2026-10-14: a workbook is read from its first sheet
    if (classifyFile(f.name) === 'workbook') {
      try {
        const { sheets } = parseWorkbook(new Uint8Array(await f.arrayBuffer()));
        read(sheetToText(sheets[0].rows), `${f.name} (sheet ${sheets[0].name})`);
      } catch (err) { setError(`${f.name} could not be read: ${err.message}`); }
      e.target.value = '';
      return;
    }
    read(await f.text(), f.name);
    e.target.value = '';
  };

  const missing = table ? missingChoices(m, ctx) : [];
  const result = useMemo(() => {
    if (!table || missing.length) return null;
    try { return convertCalibration(table, m, { ...ctx, source: name }); } catch (e) { return { error: e.message }; }
  }, [table, m, ctx, name, missing.length]);

  const set = (k) => (e) => {
    const v = e.target.value;
    setM((prev) => ({ ...prev, [k]: ['depthCol', 'valueCol', 'kindCol', 'baseCol', 'wellCol', 'outcomeCol'].includes(k) ? (v === '' ? null : Number(v)) : v }));
  };
  const colOptions = (allowNone) => (
    <>
      {allowNone && <option value="">none</option>}
      {!allowNone && <option value="">choose</option>}
      {table.columns.map((c, i) => <option key={c + i} value={i}>{c}{table.units[i] ? ` (${table.units[i]})` : ''}</option>)}
    </>
  );

  const add = () => {
    if (!result || result.error || !result.points.length) return;
    onImport(result.points, { name, read: rowCount(result.points), skipped: result.skipped });
    setTable(null); setText(''); setOpen(false);
  };

  if (!open) {
    return (
      <button type="button" data-testid="pp-cal-import-open" onClick={() => setOpen(true)}
        className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-pl-border text-pl-text hover:bg-pl-sunken self-start">
        <FileUp className="w-3.5 h-3.5" /> Import RFT/MDT, LOT/FIT or mud weights
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-1.5 rounded border border-pl-border p-2" data-testid="pp-cal-import">
      <div className="flex items-center gap-2 text-[11px]">
        <input type="file" accept=".csv,.txt,.tsv,.dat,.prn,.xlsx,.xls" data-testid="pp-cal-import-file" onChange={onFile} className="text-[11px] max-w-[11rem]" />
        <button type="button" className="ml-auto text-pl-muted hover:text-pl-text" onClick={() => { setOpen(false); setTable(null); setError(null); }}>Close</button>
      </div>
      <textarea
        data-testid="pp-cal-import-paste"
        rows={3}
        placeholder="or paste a table with its header"
        className="w-full px-2 py-1 rounded bg-pl-surface border border-pl-border-strong text-pl-text text-[11px] font-mono"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {wellsiteSource && (
        <button type="button" data-testid="pp-cal-import-wellsite" onClick={loadWellsite} title="Mud weights in use (ECD where logged, otherwise mud weight in) published by the Wellsite Studio live well of this registry well"
          className="self-start px-2 py-0.5 text-[11px] rounded border border-pl-border text-pl-text hover:bg-pl-sunken">Mud weights from Wellsite Studio</button>
      )}
      {wsNote && <div className="text-[11px] text-pl-muted" data-testid="pp-cal-import-wellsite-note">{wsNote}</div>}
      {text.trim() && (
        <button type="button" data-testid="pp-cal-import-read" onClick={() => read(text, 'pasted table')}
          className="self-start px-2 py-0.5 text-[11px] rounded border border-pl-border text-pl-text hover:bg-pl-sunken">Read pasted table</button>
      )}
      {error && <div className="text-[11px] text-pl-warning-text" data-testid="pp-cal-import-error">{error}</div>}
      {table && (
        <>
          <div className="text-[11px] text-pl-muted" data-testid="pp-cal-import-read-summary">
            {name}: {table.rows.length} rows, {table.columns.length} columns ({table.columns.join(', ')}), separated by {table.delim}{table.commaDecimal ? ', comma decimals' : ''}{table.headerLines === 2 ? ', units in the second header line' : ''}.
          </div>
          {m.wellCol != null && (
            <Row label="Rows for well">
              <select data-testid="pp-cal-well" className={sel} value={m.well || ''} onChange={set('well')}>
                <option value="">choose</option>
                {table.wells.map((w) => <option key={w} value={w}>{w}</option>)}
                <option value="*">every well in the file</option>
              </select>
            </Row>
          )}
          <Row label="Depth column"><select data-testid="pp-cal-depthcol" className={sel} value={m.depthCol ?? ''} onChange={set('depthCol')}>{colOptions(false)}</select></Row>
          <Row label="Interval base column"><select data-testid="pp-cal-basecol" className={sel} value={m.baseCol ?? ''} onChange={set('baseCol')}>{colOptions(true)}</select></Row>
          <Row label="Depth reference">
            <select data-testid="pp-cal-depthref" className={sel} value={m.depthRef || ''} onChange={set('depthRef')}>
              <option value="">declare</option>
              {DEPTH_REFS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </Row>
          <Row label="Depth unit">
            <select data-testid="pp-cal-depthunit" className={sel} value={m.depthUnit || ''} onChange={set('depthUnit')}>
              <option value="">declare</option><option value="m">m</option><option value="ft">ft</option>
            </select>
          </Row>
          <Row label="Value column"><select data-testid="pp-cal-valuecol" className={sel} value={m.valueCol ?? ''} onChange={set('valueCol')}>{colOptions(false)}</select></Row>
          <Row label="Value unit">
            <select data-testid="pp-cal-valueunit" className={sel} value={m.valueUnit || ''} onChange={set('valueUnit')}>
              <option value="">declare</option>
              {VALUE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </Row>
          <Row label="Type column"><select data-testid="pp-cal-kindcol" className={sel} value={m.kindCol ?? ''} onChange={set('kindCol')}>{colOptions(true)}</select></Row>
          <Row label="Outcome column"><select data-testid="pp-cal-outcomecol" className={sel} value={m.outcomeCol ?? ''} onChange={set('outcomeCol')}>{colOptions(true)}</select></Row>
          <Row label={m.kindCol != null ? 'Type where the column is blank' : 'The values are'}>
            <select data-testid="pp-cal-kind" className={sel} value={m.kind || ''} onChange={set('kind')}>
              <option value="">choose</option>
              {CAL_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
            </select>
          </Row>
          {missing.length > 0 && <div className="text-[11px] text-pl-warning-text" data-testid="pp-cal-import-missing">To import: {missing.join('; ')}.</div>}
          {result?.error && <div className="text-[11px] text-pl-warning-text" data-testid="pp-cal-import-error">{result.error}</div>}
          {result && !result.error && (
            <div className="text-[11px] text-pl-text" data-testid="pp-cal-import-preview" data-read={result.points.length} data-skipped={result.skipped.length}>
              {previewText(result.points)}
              {result.points.filter((p) => p.raw).slice(0, 3).map((p, k) => <span key={k} className="block text-pl-muted">{p.raw} = {fmtZ(p.z)} bml, {fmtP(p.pMpa)}</span>)}
              {result.skipped.length > 0 && (
                <span className="block text-pl-warning-text" data-testid="pp-cal-import-skipped">
                  {result.skipped.length} not read: {result.skipped.slice(0, 4).map((s) => `line ${s.line} (${s.reason})`).join('; ')}{result.skipped.length > 4 ? '; ...' : ''}
                </span>
              )}
            </div>
          )}
          <button type="button" data-testid="pp-cal-import-add" onClick={add}
            disabled={!result || !!result.error || !result.points.length}
            title={missing.length ? `To import: ${missing.join('; ')}` : undefined}
            className="self-start px-2 py-1 text-xs rounded border border-pl-primary text-pl-primary-text hover:bg-pl-primary/10 disabled:opacity-40">
            Add {result && !result.error ? rowCount(result.points) : EMPTY_VALUE} rows
          </button>
        </>
      )}
    </div>
  );
}
