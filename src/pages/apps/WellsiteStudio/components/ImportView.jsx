// Data import (upgrade U2-003): a mudlogging unit's export (CSV, delimited
// text or LAS, depth or time based) read at the door. The view shows what
// it read (columns, units found in the header, the first rows), asks for
// what each column is and its unit, the datum of the depths and, for a time
// file, the date order and the clock, then says exactly what will be
// imported and what was not read and why. Nothing is assumed: a header
// unit only pre-fills the choice. Earlier imports are listed and can be
// withdrawn with a reason. A single row of drilling parameters can also be
// typed, in the units of the view.

import React, { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import DepthEntry from './DepthEntry';
import { toRigLocal } from '@/lib/wellsite/time';
import { datumElevationM } from '@/lib/wellsite/depth';
import { fmtDepth, parseFieldNumber } from '../services/units';
import { parseMudlogFile, initialMapping, missingChoices, convertMudlog, QUANTITIES, quantity, displayUnit, lagRecordsFromRows } from '../services/mudlogImport';

const TYPED = ['rop', 'wob', 'rpm', 'mw', 'ecd', 'total_gas', 'bit_size'];

export default function ImportView({ ctx, defaults, unit, pressureUnit, offsetMin, imports = [], series = null, onImport, onWithdraw, onTypedRow, onStatus, userName, extraSlot = null }) {
  const [fileName, setFileName] = useState('');
  const [text, setText] = useState('');
  const [table, setTable] = useState(null);
  const [mapping, setMapping] = useState(null);
  const [error, setError] = useState('');
  const [withLag, setWithLag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [withdraw, setWithdraw] = useState(null); // { id, reason }
  const [typed, setTyped] = useState({});
  const [typedDepth, setTypedDepth] = useState({ value: NaN, unit: defaults.unit, reference: 'MD', datum: defaults.datum });
  const fileRef = useRef(null);
  const sel = 'bg-pl-surface border border-pl-border-strong rounded px-1 py-0.5 text-xs text-pl-text';

  const read = (name, body) => {
    setError(''); setFileName(name); setText(body);
    try {
      const t = parseMudlogFile(body, { fileName: name });
      setTable(t); setMapping(initialMapping(t));
      onStatus?.(`${name || 'Pasted table'} read: ${t.columns.length} column(s), ${t.rows.length} row(s). Check what each column is before importing.`);
    } catch (e) { setTable(null); setMapping(null); setError(e.message); onStatus?.(e.message); }
  };
  const onFile = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const body = await f.text();
    read(f.name, body);
    e.target.value = '';
  };
  const setCol = (i, patch) => setMapping((m) => ({ ...m, columns: m.columns.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const missing = useMemo(() => (table && mapping ? missingChoices(table, mapping) : []), [table, mapping]);
  const datumShiftM = useMemo(() => {
    if (!mapping || !ctx || !['KB', 'RT', 'GL', 'MSL'].includes(mapping.depthDatum)) return 0;
    const elev = datumElevationM(mapping.depthDatum, ctx);
    return Number.isFinite(elev) && Number.isFinite(ctx.kbElevM) ? ctx.kbElevM - elev : NaN;
  }, [mapping, ctx]);
  const preview = useMemo(() => {
    if (!table || !mapping || missing.length) return null;
    if (!Number.isFinite(datumShiftM)) return { error: `Datum ${mapping.depthDatum} needs its elevation on the well (Config, Header).` };
    try { return convertMudlog(table, mapping, { offsetMin, datumShiftM }); } catch (e) { return { error: e.message }; }
  }, [table, mapping, missing, offsetMin, datumShiftM]);
  const lagRows = useMemo(() => (preview && !preview.error && preview.index === 'time' ? lagRecordsFromRows(preview.rows) : null), [preview]);
  const hasTime = !!(mapping && mapping.columns.some((c) => c.quantity === 'time' || c.quantity === 'date'));

  const doImport = async () => {
    if (!preview || preview.error) return;
    setBusy(true);
    try {
      await onImport({ conv: preview, table, mapping, fileName: fileName || 'pasted table', lag: withLag && lagRows ? lagRows : null });
      setTable(null); setMapping(null); setText(''); setFileName(''); setWithLag(false);
    } catch (e) { setError(e.message); onStatus?.(e.message); } finally { setBusy(false); }
  };
  const saveTyped = async () => {
    try {
      const values = {};
      for (const k of TYPED) {
        const raw = typed[k];
        if (raw == null || String(raw).trim() === '') continue;
        const v = parseFieldNumber(raw);
        if (!Number.isFinite(v)) throw new Error(`${quantity(k).label} is not a number.`);
        const [u] = displayUnit(k, unit, pressureUnit);
        values[k] = quantity(k).units[u](v);
      }
      await onTypedRow({ depthEntry: typedDepth, values });
      setTyped({}); setTypedDepth({ ...typedDepth, value: NaN });
    } catch (e) { setError(e.message); onStatus?.(e.message); }
  };
  const local = (iso) => toRigLocal(Date.parse(iso), offsetMin).iso.replace('T', ' ');

  return (
    <div className="p-4 space-y-4" data-testid="ws-import">
      <h2 className="text-sm font-semibold text-pl-text">Import mudlogging data</h2>
      <p className="text-[11px] text-pl-muted max-w-3xl">A CSV, a delimited text file or a LAS file from the mudlogging unit, by depth or by time. The app shows what it read and asks what each column is and its unit before anything is stored. Depths are measured depths.</p>
      <div className="flex items-center gap-2 flex-wrap">
        <input ref={fileRef} type="file" accept=".csv,.txt,.las,.tsv,.asc,text/plain,text/csv" onChange={onFile} data-testid="ws-import-file" className="text-xs text-pl-text" />
        <span className="text-[11px] text-pl-muted">or paste the table below and press Read</span>
      </div>
      <div className="flex items-start gap-2">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} spellCheck={false} data-testid="ws-import-paste" placeholder="Depth (ft), ROP (ft/hr), WOB (klb), Total Gas (%)" className="w-full max-w-3xl bg-pl-surface border border-pl-border-strong rounded px-2 py-1 text-[11px] font-mono text-pl-text" />
        <Button size="sm" variant="outline" onClick={() => read('pasted table', text)} disabled={!text.trim()} data-testid="ws-import-read">Read</Button>
      </div>
      {error && <div className="text-[11px] text-pl-warning-text" data-testid="ws-import-error">{error}</div>}

      {table && mapping && (
        <div className="space-y-2" data-testid="ws-import-mapping">
          <div className="text-[11px] text-pl-text" data-testid="ws-import-read-summary">
            Read {table.format === 'las' ? 'a LAS file' : `a text table separated by ${table.delim}`}: {table.columns.length} column(s), {table.rows.length} row(s){table.commaDecimal ? ', comma decimals' : ''}. {table.notes.join(' ')}
          </div>
          <div className="overflow-x-auto">
            <table className="text-xs text-pl-text">
              <thead><tr className="text-[10px] uppercase text-pl-muted text-left"><th className="pr-3">Column</th><th className="pr-3">Unit in the file</th><th className="pr-3">First values</th><th className="pr-3">This column is</th><th className="pr-3">Unit</th></tr></thead>
              <tbody>
                {table.columns.map((c, i) => {
                  const m = mapping.columns[i];
                  const q = quantity(m.quantity);
                  return (
                    <tr key={`${c}-${i}`} data-testid={`ws-import-col-${i}`} className="align-top">
                      <td className="pr-3 whitespace-nowrap">{c}</td>
                      <td className="pr-3 whitespace-nowrap text-pl-muted">{table.units[i] || 'none'}</td>
                      <td className="pr-3 whitespace-nowrap text-pl-muted">{table.rows.slice(0, 3).map((r) => (r.cells[i] == null ? 'null' : String(r.cells[i]))).join(' | ')}</td>
                      <td className="pr-3">
                        <select className={sel} value={m.quantity || ''} data-testid={`ws-import-quantity-${i}`} onChange={(e) => { const nq = quantity(e.target.value); setCol(i, { quantity: e.target.value || null, unit: nq && nq.units && Object.keys(nq.units).length === 1 ? Object.keys(nq.units)[0] : null }); }}>
                          <option value="">not imported</option>
                          {QUANTITIES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                        </select>
                      </td>
                      <td className="pr-3">
                        {q && q.units ? (
                          <select className={`${sel} ${q.units[m.unit] ? '' : 'border-pl-warning'}`} value={m.unit || ''} data-testid={`ws-import-unit-${i}`} onChange={(e) => setCol(i, { unit: e.target.value || null })}>
                            <option value="">declare the unit</option>
                            {Object.keys(q.units).map((u) => <option key={u} value={u}>{u === 'units' ? 'chromatograph units' : u}</option>)}
                          </select>
                        ) : <span className="text-pl-muted">{q ? 'see below' : ''}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-end gap-3 flex-wrap">
            <label className="text-[10px] text-pl-muted">Depths are measured from<br />
              <select className={sel} value={mapping.depthDatum || ''} data-testid="ws-import-datum" onChange={(e) => setMapping({ ...mapping, depthDatum: e.target.value || null })}>
                <option value="">declare the datum</option>{['KB', 'RT', 'GL', 'MSL'].map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            {hasTime && (
              <>
                <label className="text-[10px] text-pl-muted">Dates are written<br />
                  <select className={sel} value={mapping.dateOrder || ''} data-testid="ws-import-dateorder" onChange={(e) => setMapping({ ...mapping, dateOrder: e.target.value || null })}>
                    <option value="">declare the date order</option><option value="dmy">day first (31/12/2026)</option><option value="mdy">month first (12/31/2026)</option><option value="iso">year first (2026-12-31)</option>
                  </select>
                </label>
                <label className="text-[10px] text-pl-muted">Times are<br />
                  <select className={sel} value={mapping.timeZone || ''} data-testid="ws-import-zone" onChange={(e) => setMapping({ ...mapping, timeZone: e.target.value || null })}>
                    <option value="">declare the clock</option><option value="rig">rig time</option><option value="utc">UTC</option>
                  </select>
                </label>
              </>
            )}
          </div>
          {missing.length > 0 && <div className="text-[11px] text-pl-warning-text" data-testid="ws-import-missing">Before import: {missing.join('; ')}.</div>}
          {preview && preview.error && <div className="text-[11px] text-pl-warning-text" data-testid="ws-import-preview-error">{preview.error}</div>}
          {preview && !preview.error && (
            <div className="space-y-1 text-[11px] text-pl-text" data-testid="ws-import-preview">
              <div data-testid="ws-import-preview-rows">{preview.rows.length} row(s) will be imported, {fmtDepth(preview.mdRange[0], unit)} to {fmtDepth(preview.mdRange[1], unit)} MD below KB{preview.timeRange ? `, ${local(new Date(preview.timeRange[0]).toISOString())} to ${local(new Date(preview.timeRange[1]).toISOString())} rig time` : ''}.</div>
              <div data-testid="ws-import-preview-curves">{preview.curves.map((k) => `${(quantity(k === 'total_gas_units' ? 'total_gas' : k) || { label: k }).label} ${preview.kept[k === 'total_gas_units' ? 'total_gas' : k] || 0}`).join(', ')} value(s).</div>
              {Object.keys(preview.dropped).length > 0 && <div className="text-pl-warning-text" data-testid="ws-import-dropped">Values outside the possible range were left out: {Object.entries(preview.dropped).map(([k, d]) => `${quantity(k).label} ${d.count} (for example ${d.example})`).join('; ')}.</div>}
              {preview.skipped.length > 0 && (
                <details data-testid="ws-import-skipped" open={preview.skipped.length <= 5}>
                  <summary className="cursor-pointer text-pl-warning-text">{preview.skipped.length} row(s) not read</summary>
                  <ul className="list-disc pl-5 text-pl-muted">{preview.skipped.slice(0, 20).map((s) => <li key={s.line}>line {s.line}: {s.reason}</li>)}</ul>
                </details>
              )}
              {lagRows && (lagRows.bitKept > 0 || lagRows.pumpRates.length > 0) && (
                <label className="flex items-center gap-1" data-testid="ws-import-lag-label"><input type="checkbox" checked={withLag} onChange={(e) => setWithLag(e.target.checked)} data-testid="ws-import-lag" />
                  Also record {lagRows.bitKept} bit depth(s){lagRows.bitKept < lagRows.bitTotal ? ` (thinned from ${lagRows.bitTotal})` : ''} and {lagRows.pumpRates.length} pump rate change(s) from this file for the lag, marked externally observed.</label>
              )}
              <Button size="sm" onClick={doImport} disabled={busy} data-testid="ws-import-go">{busy ? 'Importing' : `Import ${preview.rows.length} row(s)`}</Button>
            </div>
          )}
        </div>
      )}

      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-pl-text">Type one row of drilling parameters</h3>
        <div className="flex items-end gap-2 flex-wrap">
          <div><div className="text-[10px] text-pl-muted">Depth</div><DepthEntry value={typedDepth} onChange={setTypedDepth} kind="bit_depth" ctx={ctx} compact testIdPrefix="ws-typed-depth" /></div>
          {TYPED.map((k) => (
            <label key={k} className="text-[10px] text-pl-muted">{quantity(k).label} ({displayUnit(k, unit, pressureUnit)[0]})<br />
              <input inputMode="decimal" className={`${sel} w-20`} value={typed[k] ?? ''} onChange={(e) => setTyped({ ...typed, [k]: e.target.value })} data-testid={`ws-typed-${k}`} /></label>
          ))}
          <Button size="sm" variant="outline" onClick={saveTyped} data-testid="ws-typed-save">Record</Button>
        </div>
        {series && <div className="text-[11px] text-pl-muted" data-testid="ws-import-series">{series.points.length} data row(s) on this well: {series.imports} import(s), {series.typed} typed.</div>}
      </section>

      {extraSlot}

      <section className="space-y-1">
        <h3 className="text-xs font-semibold text-pl-text">Imports on this well</h3>
        {imports.length === 0 && <div className="text-[11px] text-pl-muted" data-testid="ws-import-none">Nothing imported yet.</div>}
        {imports.map((h) => (
          <div key={h.id} className="text-[11px] text-pl-text" data-testid={`ws-import-row-${h.id}`} data-withdrawn={h.payload.withdrawn ? 'yes' : 'no'}>
            <span className={h.payload.withdrawn ? 'line-through text-pl-muted' : ''}>{local(h.occurred_at)}: {h.payload.file_name}, {h.payload.rows} row(s), {fmtDepth(h.payload.md_from_m, unit)} to {fmtDepth(h.payload.md_to_m, unit)}; declared {h.payload.declared.map((d) => `${d.column} as ${(quantity(d.quantity) || { label: d.quantity }).label}${d.unit ? ` in ${d.unit}` : ''}`).join(', ')}; depths from {h.payload.depth_datum}{h.payload.rows_skipped ? `; ${h.payload.rows_skipped} row(s) not read` : ''}.</span>
            {h.payload.withdrawn ? <span className="text-pl-warning-text"> Withdrawn{h.payload.withdrawn_by ? ` by ${h.payload.withdrawn_by}` : ''}: {h.payload.withdrawn_reason}</span> : (
              withdraw && withdraw.id === h.id ? (
                <span className="inline-flex items-center gap-1 ml-2">
                  <input className={`${sel} w-56`} placeholder="why it is withdrawn" value={withdraw.reason} onChange={(e) => setWithdraw({ ...withdraw, reason: e.target.value })} data-testid="ws-import-withdraw-reason" />
                  <Button size="sm" variant="outline" data-testid="ws-import-withdraw-confirm" onClick={async () => { try { await onWithdraw(h, { reason: withdraw.reason, person: userName }); setWithdraw(null); } catch (e) { setError(e.message); onStatus?.(e.message); } }}>Withdraw</Button>
                </span>
              ) : <button type="button" className="ml-2 px-1.5 py-0.5 rounded border border-pl-border hover:bg-pl-sunken" onClick={() => setWithdraw({ id: h.id, reason: '' })} data-testid={`ws-import-withdraw-${h.id}`}>Withdraw</button>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
