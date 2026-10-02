// Calibration import door (AppUpgrade PP-U2-002). A file (or pasted table)
// of RFT/MDT points, LOT/FIT/XLOT tests or mud weights: the app shows what
// it read (columns, rows, separator, the units it found in the header) and
// the user declares the columns, the depth reference, the depth unit and
// the pressure unit before anything is added. Rows not read are listed
// with their reasons.

import React, { useMemo, useState } from 'react';
import { FileUp } from 'lucide-react';
import {
  parseCalibrationTable, convertCalibration, missingChoices, CAL_KINDS, DEPTH_REFS, VALUE_UNITS,
} from '../services/calibrationImport';
import { EMPTY_VALUE } from '@/lib/emptyValue';

const sel = 'bg-pl-surface border border-pl-border-strong rounded px-1 py-0.5 text-[11px] text-pl-text max-w-[9rem]';

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
      setM({ ...t.guess, kind: t.guess.kind || '' });
    } catch (e) {
      setTable(null);
      setError(e.message);
    }
  };

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (/\.(xlsx?|xlsm)$/i.test(f.name)) { setError(`${f.name} is a spreadsheet: save it as CSV or paste the cells here.`); return; }
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
    setM((prev) => ({ ...prev, [k]: ['depthCol', 'valueCol', 'kindCol'].includes(k) ? (v === '' ? null : Number(v)) : v }));
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
    onImport(result.points, { name, read: result.points.length, skipped: result.skipped });
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
          <Row label="Depth column"><select data-testid="pp-cal-depthcol" className={sel} value={m.depthCol ?? ''} onChange={set('depthCol')}>{colOptions(false)}</select></Row>
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
              {result.points.length} point{result.points.length === 1 ? '' : 's'} read
              {result.points.slice(0, 3).map((p, k) => <span key={k} className="block text-pl-muted">{p.raw} = {fmtZ(p.z)} bml, {fmtP(p.pMpa)}</span>)}
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
            Add {result && !result.error ? result.points.length : EMPTY_VALUE} points
          </button>
        </>
      )}
    </div>
  );
}
