// Edit logs (QI programme Q1 / A3, 2026-10-06): splice runs, interval
// edits with a ledger, and sonic drift correction against the well's
// checkshots. Every result is saved as a NEW curve (<MNEM>_SPL, _ED, _DC)
// with what was done in its provenance; the imported logs are never
// changed. The maths is the engines' (petrophysics/logEdit.js).

import React, { useMemo, useState } from 'react';
import { prepareSplice, prepareEdits, prepareDrift } from '../services/logEdit';
import { toDisp, fromDisp, unitText } from '../engine/displayUnits';

const btnCls = 'px-2 py-0.5 rounded border text-xs border-pl-border text-pl-text hover:bg-pl-sunken disabled:opacity-50';
const inputCls = 'w-20 rounded border border-pl-border-strong bg-pl-surface px-1.5 py-0.5 text-xs text-pl-text';
const selectCls = 'rounded border border-pl-border-strong bg-pl-surface px-1.5 py-0.5 text-xs text-pl-text';
const OPS = [
  { op: 'null', label: 'Set to null', fields: [] },
  { op: 'constant', label: 'Constant', fields: ['value'] },
  { op: 'interpolate', label: 'Interpolate across', fields: [] },
  { op: 'scale', label: 'Scale', fields: ['factor'] },
  { op: 'offset', label: 'Offset', fields: ['value'] },
  { op: 'despike', label: 'Despike (Hampel)', fields: ['halfWindow', 'nSigma'] },
  { op: 'clip', label: 'Clip to range', fields: ['min', 'max'] },
];
const FIELD_LABEL = { value: 'Value', factor: 'Factor', halfWindow: 'Half window (samples)', nSigma: 'Threshold (MAD sigma)', min: 'Min', max: 'Max' };
const isSonic = (l) => /^(DT|DTC|DTCO|AC|DT4P|DT24|DTP)(_.*)?(:\d+)?$/i.test(l.mnemonic) || /US\/(M|F|FT)/i.test(String(l.unit || ''));
const num = (s) => (s === '' || s == null ? NaN : Number(s));

export default function LogEditPanel({ well, logs, backend, unit, onSaved, loadCurve }) {
  const u = unitText(unit);
  const d = (m) => Number(toDisp(m, unit).toFixed(2));
  const [mode, setMode] = useState('splice');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null); // {kind: 'ok'|'error', text}
  const [preview, setPreview] = useState(null);
  const names = useMemo(() => logs.map((l) => l.mnemonic), [logs]);
  const regular = logs.filter((l) => l.step_m != null);

  // splice: chosen runs in priority order with their depth ranges (display units)
  const [runs, setRuns] = useState([]);
  const [matchWin, setMatchWin] = useState('');
  // edits
  const [editLog, setEditLog] = useState('');
  const [edits, setEdits] = useState([]);
  // drift
  const [sonicId, setSonicId] = useState('');

  const reset = (m) => { setMode(m); setPreview(null); setNote(null); };
  const run = async (fn) => {
    setBusy(true); setNote(null);
    try { await fn(); } catch (e) { setNote({ kind: 'error', text: e.message }); } finally { setBusy(false); }
  };
  const save = (prepared, what) => run(async () => {
    await backend.saveLogs(well.id, [prepared.log]);
    setNote({ kind: 'ok', text: `${prepared.log.mnemonic} saved (${what}). The original curves are unchanged.` });
    setPreview(null);
    onSaved?.();
  });

  // ---- splice
  const toggleRun = (log) => setRuns((rs) => (rs.some((r) => r.id === log.id)
    ? rs.filter((r) => r.id !== log.id)
    : [...rs, { id: log.id, top: String(d(log.start_md_m)), base: String(d(log.stop_md_m)) }]));
  const buildSplice = async () => prepareSplice(
    await Promise.all(runs.map(async (r) => {
      const log = logs.find((l) => l.id === r.id);
      return { log, data: await loadCurve(log), top: fromDisp(num(r.top), unit), base: fromDisp(num(r.base), unit) };
    })),
    { matchWindowM: Number.isFinite(num(matchWin)) ? fromDisp(num(matchWin), unit) : 0, existingNames: names },
  );

  // ---- edits
  const addEdit = () => setEdits((es) => [...es, { op: 'null', top: '', base: '' }]);
  const buildEdits = async () => {
    const log = logs.find((l) => l.id === editLog);
    if (!log) throw new Error('Choose a curve to edit.');
    const list = edits.map((e) => {
      const spec = OPS.find((o) => o.op === e.op);
      const out = { op: e.op, top: fromDisp(num(e.top), unit), base: fromDisp(num(e.base), unit) };
      if (!Number.isFinite(out.top) || !Number.isFinite(out.base)) throw new Error('Every edit needs a top and a base.');
      for (const f of spec.fields) if (e[f] !== undefined && e[f] !== '') out[f] = num(e[f]);
      return out;
    });
    return prepareEdits(log, await loadCurve(log), list, { existingNames: names });
  };

  // ---- drift
  const sonics = regular.filter(isSonic);
  const buildDrift = async () => {
    const log = logs.find((l) => l.id === sonicId);
    if (!log) throw new Error('Choose the sonic to correct.');
    return prepareDrift(well, log, await loadCurve(log), { existingNames: names });
  };

  const builders = { splice: buildSplice, edit: buildEdits, drift: buildDrift };
  const what = { splice: 'splice', edit: 'edits', drift: 'drift correction' };
  const doPreview = () => run(async () => setPreview(await builders[mode]()));

  return (
    <div className="space-y-2 rounded border border-pl-border p-3" data-testid="wdm-log-edit">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {[['splice', 'Splice runs'], ['edit', 'Edit a curve'], ['drift', 'Sonic drift']].map(([m, label]) => (
          <button key={m} type="button" className={`${btnCls} ${mode === m ? 'border-pl-primary bg-pl-primary/10 text-pl-primary-text' : ''}`} onClick={() => reset(m)} data-testid={`wdm-edit-mode-${m}`}>{label}</button>
        ))}
        <span className="text-pl-muted">Results are saved as new curves; the imported logs are never changed.</span>
      </div>

      {mode === 'splice' && (
        <div className="space-y-1 text-xs" data-testid="wdm-splice">
          <p className="text-pl-muted">Tick the runs in priority order. Each depth takes the first ticked run that has a value there.</p>
          {regular.map((l) => {
            const r = runs.find((x) => x.id === l.id);
            const order = runs.findIndex((x) => x.id === l.id);
            return (
              <div key={l.id} className="flex items-center gap-2">
                <label className="flex items-center gap-1 w-44">
                  <input type="checkbox" checked={!!r} onChange={() => toggleRun(l)} data-testid={`wdm-splice-run-${l.mnemonic}`} />
                  <span>{l.mnemonic}</span>
                  {order >= 0 && <span className="text-pl-muted">{`(${order + 1})`}</span>}
                </label>
                {r && (
                  <>
                    <span className="text-pl-muted">{`from (${u})`}</span>
                    <input className={inputCls} value={r.top} onChange={(e) => setRuns((rs) => rs.map((x) => (x.id === l.id ? { ...x, top: e.target.value } : x)))} />
                    <span className="text-pl-muted">to</span>
                    <input className={inputCls} value={r.base} onChange={(e) => setRuns((rs) => rs.map((x) => (x.id === l.id ? { ...x, base: e.target.value } : x)))} />
                  </>
                )}
              </div>
            );
          })}
          <label className="flex items-center gap-1" title="Shift each later run by its mean difference to the curve above, over this window around the join">
            <span className="text-pl-muted">{`Match levels over (${u})`}</span>
            <input className={inputCls} value={matchWin} onChange={(e) => setMatchWin(e.target.value)} placeholder="off" data-testid="wdm-splice-window" />
          </label>
        </div>
      )}

      {mode === 'edit' && (
        <div className="space-y-1 text-xs" data-testid="wdm-edits">
          <label className="flex items-center gap-1">
            <span className="text-pl-muted">Curve</span>
            <select className={selectCls} value={editLog} onChange={(e) => setEditLog(e.target.value)} data-testid="wdm-edit-curve">
              <option value="">Choose</option>
              {regular.map((l) => <option key={l.id} value={l.id}>{l.mnemonic}</option>)}
            </select>
          </label>
          {edits.map((e, k) => {
            const spec = OPS.find((o) => o.op === e.op);
            const set = (patch) => setEdits((es) => es.map((x, j) => (j === k ? { ...x, ...patch } : x)));
            return (
              <div key={k} className="flex flex-wrap items-center gap-2" data-testid="wdm-edit-row">
                <select className={selectCls} value={e.op} onChange={(ev) => set({ op: ev.target.value })}>
                  {OPS.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
                </select>
                <span className="text-pl-muted">{`from (${u})`}</span>
                <input className={inputCls} value={e.top} onChange={(ev) => set({ top: ev.target.value })} />
                <span className="text-pl-muted">to</span>
                <input className={inputCls} value={e.base} onChange={(ev) => set({ base: ev.target.value })} />
                {spec.fields.map((f) => (
                  <label key={f} className="flex items-center gap-1">
                    <span className="text-pl-muted">{FIELD_LABEL[f]}</span>
                    <input className={inputCls} value={e[f] ?? ''} onChange={(ev) => set({ [f]: ev.target.value })} />
                  </label>
                ))}
                <button type="button" className={btnCls} onClick={() => setEdits((es) => es.filter((_, j) => j !== k))}>Remove</button>
              </div>
            );
          })}
          <button type="button" className={btnCls} onClick={addEdit} data-testid="wdm-edit-add">Add an edit</button>
          <p className="text-pl-muted">Edits run in order; the saved curve lists each one and how many samples it changed.</p>
        </div>
      )}

      {mode === 'drift' && (
        <div className="space-y-1 text-xs" data-testid="wdm-drift">
          <label className="flex items-center gap-1">
            <span className="text-pl-muted">Sonic</span>
            <select className={selectCls} value={sonicId} onChange={(e) => setSonicId(e.target.value)} data-testid="wdm-drift-sonic">
              <option value="">Choose</option>
              {sonics.map((l) => <option key={l.id} value={l.id}>{`${l.mnemonic} (${l.unit || 'no unit'})`}</option>)}
            </select>
          </label>
          <p className="text-pl-muted">
            {`${(well.checkshots || []).length} checkshot level${(well.checkshots || []).length === 1 ? '' : 's'} on this well. The sonic is integrated on TVDSS like the checkshot times, and the drift between two levels is spread as a constant slowness correction, so the corrected sonic matches each checkshot. Above the first and below the last level it is left as it was.`}
          </p>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button type="button" className={btnCls} onClick={doPreview} disabled={busy} data-testid="wdm-edit-preview">Preview</button>
        {preview && <button type="button" className={`${btnCls} border-pl-primary text-pl-primary-text`} onClick={() => save(preview, what[mode])} disabled={busy} data-testid="wdm-edit-save">{`Save ${preview.log.mnemonic}`}</button>}
      </div>

      {preview && mode === 'splice' && (
        <p className="text-xs text-pl-text" data-testid="wdm-edit-result">
          {preview.joins.map((j) => `Join at ${d(j.at)} ${u} to ${j.run}: shifted by ${Number(j.offset.toPrecision(4))} over ${j.nOverlap} overlap samples.`).join(' ')}
        </p>
      )}
      {preview && mode === 'edit' && (
        <ul className="text-xs text-pl-text list-disc pl-5" data-testid="wdm-edit-result">
          {preview.ledger.map((l, k) => <li key={k}>{`${OPS.find((o) => o.op === l.op)?.label} from ${d(l.top)} to ${d(l.base)} ${u}: ${l.changed} sample${l.changed === 1 ? '' : 's'} changed`}</li>)}
        </ul>
      )}
      {preview && mode === 'drift' && (
        <div className="text-xs text-pl-text" data-testid="wdm-edit-result">
          <table>
            <thead><tr className="text-pl-muted text-left"><th className="pr-4">{`TVDSS (${u})`}</th><th className="pr-4">Checkshot OWT (ms)</th><th className="pr-4">Sonic OWT (ms)</th><th>Drift (ms)</th></tr></thead>
            <tbody className="font-mono tabular-nums">
              {preview.report.drift.map((r) => (
                <tr key={r.md}><td className="pr-4">{d(r.md)}</td><td className="pr-4">{(r.owtS * 1e3).toFixed(2)}</td><td className="pr-4">{(r.sonicS * 1e3).toFixed(2)}</td><td>{r.driftMs.toFixed(2)}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1">{`The corrected sonic matches the checkshots to ${preview.report.closureMs.toFixed(3)} ms.${preview.report.outside.above || preview.report.outside.below ? ` Not corrected ${[preview.report.outside.above ? 'above the first level' : '', preview.report.outside.below ? 'below the last level' : ''].filter(Boolean).join(' or ')}.` : ''}${preview.report.gapM > 0 ? ` ${d(preview.report.gapM)} ${u} of gaps were bridged for the integration only.` : ''}`}</p>
        </div>
      )}
      {note && <p className={`text-xs ${note.kind === 'error' ? 'text-pl-danger-text' : 'text-pl-success-text'}`} data-testid="wdm-edit-note">{note.text}</p>}
    </div>
  );
}
