// Zone import panel (AppUpgrade PETRO-U2-004): paste or load a zonation
// from Techlog, IP, Petrel or a spreadsheet, see what was read (delimiter,
// columns, unit and where it came from, rows kept, every row skipped and
// why), correct the unit or the columns, then create the zones in one go.
// Parsing lives in services/zoneImport.js.

import React, { useMemo, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import { parseZoneTable } from '../services/zoneImport';
import { depthLabel } from '../viewer/depthModes';

const inputCls = 'rounded bg-pl-surface border border-pl-border-strong text-pl-text px-1.5 py-0.5 text-xs';

/** @param {{name?: string, uwi?: string}} p.well the selected well (multi-well files keep its rows) */
export default function ZoneImportPanel({ well = null, zones = [], depthUnit = 'm', logRange = null, busy = false, onImport }) {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState(null);
  const [unit, setUnit] = useState('auto');
  const [picks, setPicks] = useState({});
  const parsed = useMemo(() => (text.trim()
    ? parseZoneTable(text, {
      defaultUnit: depthUnit === 'ft' ? 'ft' : 'm', unit: unit === 'auto' ? null : unit, columns: picks, well, existingZones: zones, logRange,
    })
    : null), [text, depthUnit, unit, picks, well, zones, logRange]);

  const loadFile = async (f) => {
    if (!f) return;
    setFileName(f.name);
    setPicks({});
    setText(await f.text());
  };
  const colOptions = parsed?.header || null;
  const run = async () => {
    if (!parsed?.rows.length) return;
    await onImport(parsed.rows.map((r) => ({ name: r.name, topMdM: r.topMdM, baseMdM: r.baseMdM })), { fileName, skipped: parsed.skipped.length });
    setText('');
    setFileName(null);
    setPicks({});
  };

  return (
    <div className="space-y-1" data-testid="petro-zone-import">
      <p className="text-pl-muted">Paste a zonation (Techlog, IP, Petrel or a spreadsheet) or load a CSV or text file. Any column order; units in the headers or a unit column are read.</p>
      <div className="flex items-center gap-1 flex-wrap">
        <label className="flex items-center gap-1 px-2 py-0.5 rounded border border-pl-border text-pl-text hover:bg-pl-sunken cursor-pointer">
          <UploadCloud className="w-3 h-3" /> File…
          <input type="file" accept=".csv,.txt,.tsv,.dat,text/plain,text/csv" className="hidden" data-testid="petro-zone-import-file"
            onChange={(e) => loadFile(e.target.files?.[0])} />
        </label>
        {fileName && <span className="text-pl-muted truncate max-w-[10rem]" title={fileName}>{fileName}</span>}
        <label className="ml-auto flex items-center gap-1 text-pl-muted">
          depths in
          <select className={inputCls} value={unit} onChange={(e) => setUnit(e.target.value)} data-testid="petro-zone-import-unit">
            <option value="auto">as the file says</option>
            <option value="m">m</option>
            <option value="ft">ft</option>
          </select>
        </label>
      </div>
      <textarea
        className={`${inputCls} w-full h-20 font-mono`}
        placeholder={'Zone,Top (ft),Bottom (ft)\nOil sand,5003.3,5083.7'}
        value={text}
        data-testid="petro-zone-import-text"
        onChange={(e) => { setText(e.target.value); setFileName(null); }}
      />
      {parsed && colOptions && (
        <div className="flex items-center gap-1 flex-wrap text-pl-muted" data-testid="petro-zone-import-columns">
          {[['name', 'Name'], ['top', 'Top'], ['base', 'Base']].map(([k, label]) => (
            <label key={k} className="flex items-center gap-0.5">
              {label}
              <select className={inputCls} value={String(parsed.columns[k] ?? -1)} data-testid={`petro-zone-import-col-${k}`}
                onChange={(e) => setPicks((p) => ({ ...p, [k]: Number(e.target.value) }))}>
                <option value="-1">none</option>
                {colOptions.map((h, i) => <option key={`${h}-${i}`} value={String(i)}>{h || `column ${i + 1}`}</option>)}
              </select>
            </label>
          ))}
        </div>
      )}
      {parsed && (
        <div className="rounded border border-pl-border p-1 space-y-0.5" data-testid="petro-zone-import-preview">
          {parsed.refused ? (
            <p className="text-pl-danger-text" data-testid="petro-zone-import-refused">{parsed.refused}</p>
          ) : (
            <>
              <p className="text-pl-muted" data-testid="petro-zone-import-summary">
                Read {parsed.rows.length} zone{parsed.rows.length === 1 ? '' : 's'}, {parsed.skipped.length} row{parsed.skipped.length === 1 ? '' : 's'} skipped;
                {' '}delimiter {parsed.delimiter === '\t' ? 'tab' : parsed.delimiter}; depths in {parsed.unit} MD from {parsed.unitSource}.
              </p>
              {parsed.rows.map((r) => (
                <div key={r.line} className="flex gap-2 text-pl-text" data-testid="petro-zone-import-row">
                  <span className="flex-1 truncate">{r.name}</span>
                  <span>{depthLabel(r.topMdM, depthUnit)} to {depthLabel(r.baseMdM, depthUnit)}</span>
                </div>
              ))}
            </>
          )}
          {parsed.skipped.map((s) => (
            <div key={`s${s.line}`} className="text-pl-warning-text" data-testid="petro-zone-import-skipped">line {s.line}: {s.reason}</div>
          ))}
          {parsed.notes.map((n) => <div key={n} className="text-pl-muted">{n}</div>)}
        </div>
      )}
      <button type="button" data-testid="petro-zone-import-apply" disabled={busy || !parsed?.rows.length}
        className="flex items-center gap-1 px-2 py-0.5 rounded border border-pl-primary/60 text-pl-primary-text hover:bg-pl-primary/10 disabled:opacity-50"
        onClick={run}>
        Import {parsed?.rows.length || 0} zone{parsed?.rows.length === 1 ? '' : 's'}
      </button>
    </div>
  );
}
