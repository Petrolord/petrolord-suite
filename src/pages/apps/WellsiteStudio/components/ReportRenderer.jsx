// A report model on screen (WS7, WS8): generated facts are read-only and
// each row can show the records it came from; narrative sections edit
// their own record and the report regenerates. Never a second copy.
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { fmtDepth } from '../services/units';

const cellText = (c, unit) => {
  if (c == null) return '';
  if (typeof c === 'object' && 'value_m' in c) return Number.isFinite(c.value_m) ? fmtDepth(c.value_m, unit) : '';
  return String(c);
};
const kvText = (r, unit) => (r.text != null ? r.text : Number.isFinite(r.value_m) ? `${fmtDepth(r.value_m, unit)}${Number.isFinite(r.tvd_m) ? ` (TVD ${fmtDepth(r.tvd_m, unit)})` : ''}` : '');

export default function ReportRenderer({ model, unit, onNarrativeSave, canEdit = true, showSources = false }) {
  const [editing, setEditing] = useState(null); // { id, text }
  const refs = (r) => (showSources && r.refs && r.refs.length ? <span className="text-[9px] text-slate-600 ml-1" title={r.refs.join(', ')} data-refs={r.refs.join(',')}>[{r.refs.length}]</span> : null);
  return (
    <div className="space-y-4" data-testid="ws-report-body">
      {model.sections.map((s) => (
        <section key={s.id} data-testid={`ws-report-section-${s.id}`} data-kind={s.kind}>
          <h3 className="text-xs font-semibold text-slate-200 mb-1">{s.title}</h3>
          {s.kind === 'kv' && (
            <table className="text-xs text-slate-300"><tbody>
              {s.rows.map((r, i) => <tr key={i}><td className="pr-3 text-slate-500">{r.label}</td><td>{kvText(r, unit)}{refs(r)}</td></tr>)}
              {s.rows.length === 0 && <tr><td className="text-slate-500">nothing recorded</td></tr>}
            </tbody></table>
          )}
          {s.kind === 'table' && (
            <div>
              {s.summary && <div className="text-[11px] text-slate-400 mb-1">{(Array.isArray(s.summary) ? s.summary : [s.summary]).map((x, i) => <span key={i} className="mr-3">{x.label}: {x.text}{refs(x)}</span>)}</div>}
              {s.rows.length ? (
                <table className="text-xs text-slate-300 w-full">
                  <thead><tr className="text-[10px] uppercase text-slate-500">{s.columns.map((c) => <th key={c} className="text-left pr-3">{c}</th>)}</tr></thead>
                  <tbody>{s.rows.map((r, i) => <tr key={i}>{r.cells.map((c, k) => <td key={k} className="pr-3 align-top">{cellText(c, unit)}{k === r.cells.length - 1 ? refs(r) : null}</td>)}</tr>)}</tbody>
                </table>
              ) : <div className="text-xs text-slate-500">None in the period.</div>}
            </div>
          )}
          {s.kind === 'list' && (
            <ul className="text-xs text-slate-300 list-disc pl-4">{s.rows.map((r, i) => <li key={i}>{r.text}{refs(r)}</li>)}{s.rows.length === 0 && <li className="list-none text-slate-500">None.</li>}</ul>
          )}
          {s.kind === 'narrative' && (
            <div data-testid={`ws-report-narrative-${s.narrative}`}>
              {editing && editing.id === s.id ? (
                <div className="space-y-1">
                  <textarea value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} rows={3} data-testid={`ws-report-narrative-input-${s.narrative}`} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100" />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={async () => { await onNarrativeSave(s.narrative, editing.text); setEditing(null); }} data-testid={`ws-report-narrative-save-${s.narrative}`}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <div className={`text-xs ${s.text ? 'text-slate-200' : 'text-slate-500'} whitespace-pre-wrap`} data-testid={`ws-report-narrative-text-${s.narrative}`}>{s.text || 'Not written.'}{refs(s)}</div>
                  {canEdit && onNarrativeSave && <button type="button" onClick={() => setEditing({ id: s.id, text: s.text || '' })} data-testid={`ws-report-narrative-edit-${s.narrative}`} className="text-[11px] text-cyan-300 hover:underline">edit</button>}
                </div>
              )}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
