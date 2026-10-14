// Traps and charge (2026-10-14): the traps this model's kitchen charges, kept
// with the model, each assessed on the run (services/traps.js over
// src/lib/basinCharge.js), and one trap at a time sent to Prospect Risking
// with its numbers filled in.

import React, { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, Upload, Send } from 'lucide-react';
import { NumText } from '@/components/wells/LayoutPanel';
import { writeBasinCharge } from '@/lib/basinCharge';
import { useBasinFlow } from '../contexts/BasinFlowContext';
import { newTrap, parseTrapsText, assessTraps, TRAP_UNITS } from '../services/traps';

const cell = 'h-7 w-full rounded border border-pl-border-strong bg-pl-surface px-1.5 text-xs text-pl-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-pl-focus';
const fmt = (v, p = 3) => (Number.isFinite(v) ? Number(v.toPrecision(p)).toLocaleString('en-US') : '');

/**
 * @param {{ payload: object|null, sendFor: (trap) => ({payload, href})|null, readOnly?: boolean }} p
 *   payload: the model's charge (no trap) for the table; sendFor: the payload and link for one trap
 */
export default function TrapsPanel({ payload, sendFor, readOnly = false }) {
  const { state, dispatch } = useBasinFlow();
  const traps = useMemo(() => (Array.isArray(state.settings?.traps) ? state.settings.traps : []), [state.settings?.traps]);
  const sources = useMemo(() => (state.stratigraphy || []).filter((l) => l.sourceRock?.isSource), [state.stratigraphy]);
  const [problems, setProblems] = useState([]);
  const fileRef = useRef(null);
  const save = (next) => dispatch({ type: 'UPDATE_SETTINGS', payload: { traps: next } });
  const setTrap = (i, patch) => save(traps.map((t, k) => (k === i ? { ...t, ...patch } : t)));
  const rows = useMemo(() => assessTraps(traps, payload), [traps, payload]);

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const { traps: read, problems: p } = parseTrapsText(await f.text(), state.stratigraphy || []);
    setProblems(p);
    if (read.length) save(read);
  };

  return (
    <div className="rounded-lg border border-pl-border bg-pl-surface p-3 space-y-2" data-testid="bf-traps">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-pl-text">Traps and charge</h3>
        <span className="text-[11px] text-pl-muted">When each trap formed, the area it drains, the share of the expelled petroleum that reaches it (migration efficiency) and the source layers on its path.</span>
        <div className="ml-auto flex gap-1">
          <button type="button" disabled={readOnly} data-testid="bf-trap-import" onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1 px-2 py-0.5 text-xs rounded border border-pl-border text-pl-text hover:bg-pl-sunken disabled:opacity-40"><Upload className="w-3 h-3" /> Traps file</button>
          <input ref={fileRef} type="file" accept=".csv,.txt,.tsv" className="hidden" data-testid="bf-trap-import-input" onChange={onFile} />
          <button type="button" disabled={readOnly} data-testid="bf-trap-add" onClick={() => save([...traps, newTrap(traps.length)])}
            className="flex items-center gap-1 px-2 py-0.5 text-xs rounded border border-pl-border text-pl-text hover:bg-pl-sunken disabled:opacity-40"><Plus className="w-3 h-3" /> Add trap</button>
        </div>
      </div>
      {problems.length > 0 && <div className="text-[11px] text-pl-warning-text" data-testid="bf-trap-problems">{problems.join(' ')}</div>}
      {traps.length === 0 ? (
        <p className="text-[11px] text-pl-muted" data-testid="bf-traps-empty">No traps yet. Add one, or read a traps file (trap, formed_ma, fetch_km2, migration_efficiency, charged_by, in_place, in_place_unit).</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-pl-text min-w-[900px]">
            <thead>
              <tr className="text-left text-pl-muted">
                <th className="font-normal pr-1">Trap</th>
                <th className="font-normal pr-1 w-20">Formed (Ma)</th>
                <th className="font-normal pr-1 w-20">Fetch (km²)</th>
                <th className="font-normal pr-1 w-20">Efficiency</th>
                <th className="font-normal pr-1">Charged by</th>
                <th className="font-normal pr-1 w-20">In place</th>
                <th className="font-normal pr-1 w-20">Unit</th>
                <th className="font-normal w-6" />
              </tr>
            </thead>
            <tbody>
              {traps.map((t, i) => (
                <tr key={t.id} data-testid={`bf-trap-row-${i}`}>
                  <td className="pr-1 py-0.5"><input className={cell} value={t.name} disabled={readOnly} data-testid={`bf-trap-name-${i}`} onChange={(e) => setTrap(i, { name: e.target.value })} /></td>
                  <td className="pr-1"><NumText className={cell} value={t.formedMa} disabled={readOnly} data-testid={`bf-trap-age-${i}`} onCommit={(v) => setTrap(i, { formedMa: v })} /></td>
                  <td className="pr-1"><NumText className={cell} value={t.fetchKm2} disabled={readOnly} data-testid={`bf-trap-area-${i}`} onCommit={(v) => setTrap(i, { fetchKm2: v })} /></td>
                  <td className="pr-1"><NumText className={cell} value={t.efficiency} disabled={readOnly} data-testid={`bf-trap-eff-${i}`} onCommit={(v) => setTrap(i, { efficiency: v })} /></td>
                  <td className="pr-1">
                    <select className={cell} disabled={readOnly} data-testid={`bf-trap-src-${i}`} value={t.sourceIds?.length === 1 ? t.sourceIds[0] : ''}
                      onChange={(e) => setTrap(i, { sourceIds: e.target.value ? [e.target.value] : [] })}>
                      <option value="">Every source layer</option>
                      {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </td>
                  <td className="pr-1"><NumText className={cell} value={t.inPlace} disabled={readOnly} data-testid={`bf-trap-vol-${i}`} onCommit={(v) => setTrap(i, { inPlace: v })} /></td>
                  <td className="pr-1">
                    <select className={cell} disabled={readOnly} data-testid={`bf-trap-unit-${i}`} value={t.inPlaceUnit || 'MMstb'} onChange={(e) => setTrap(i, { inPlaceUnit: e.target.value })}>
                      {TRAP_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </td>
                  <td><button type="button" disabled={readOnly} aria-label={`Delete ${t.name}`} data-testid={`bf-trap-del-${i}`} onClick={() => save(traps.filter((_, k) => k !== i))} className="p-1 text-pl-muted hover:text-pl-danger-text disabled:opacity-40"><Trash2 className="w-3.5 h-3.5" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {traps.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-pl-text min-w-[900px]" data-testid="bf-trap-results">
            <thead>
              <tr className="text-left text-pl-muted border-t border-pl-border">
                <th className="font-normal pt-1">Trap</th>
                <th className="font-normal pt-1 text-right">After it formed</th>
                <th className="font-normal pt-1 text-right">Reaches it (MMboe)</th>
                <th className="font-normal pt-1 text-right">Oil (MMbbl)</th>
                <th className="font-normal pt-1 text-right">Gas (Bcf)</th>
                <th className="font-normal pt-1 text-right">In place (MMboe)</th>
                <th className="font-normal pt-1 text-right">Times the fill</th>
                <th className="font-normal pt-1 text-right">Charge factor</th>
                <th className="font-normal pt-1" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ trap: t, required, a }, i) => (
                <tr key={t.id} className="border-t border-pl-border" data-testid={`bf-trap-result-${i}`}>
                  <td className="py-1">{t.name}</td>
                  {!payload ? <td colSpan={8} className="text-pl-muted">Run the model to charge the traps.</td> : !a?.ok ? <td colSpan={8} className="text-pl-muted" data-testid={`bf-trap-reason-${i}`}>{a?.reason}</td> : (
                    <>
                      <td className="text-right font-mono" data-testid={`bf-trap-after-${i}`}>{(100 * (1 - a.beforeTrapFraction)).toFixed(0)} %</td>
                      <td className="text-right font-mono" data-testid={`bf-trap-charge-${i}`}>{fmt(a.chargeMMboe)}</td>
                      <td className="text-right font-mono" data-testid={`bf-trap-oil-${i}`}>{fmt(a.oilMMbbl)}</td>
                      <td className="text-right font-mono" data-testid={`bf-trap-gas-${i}`}>{fmt(a.gasBcf)}</td>
                      <td className="text-right font-mono">{required != null ? fmt(required) : ''}</td>
                      <td className="text-right font-mono" data-testid={`bf-trap-ratio-${i}`}>{a.ratio != null ? fmt(a.ratio, 2) : ''}</td>
                      <td className="text-right font-mono font-semibold" data-testid={`bf-trap-factor-${i}`}>{a.factor ?? ''}</td>
                      <td className="text-right pl-2">
                        <Link to={sendFor?.(t)?.href || '#'} data-testid={`bf-trap-send-${i}`}
                          onClick={() => { const p = sendFor?.(t)?.payload; if (p) writeBasinCharge(p); }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-pl-border text-pl-text hover:bg-pl-sunken whitespace-nowrap"><Send className="w-3 h-3" /> Prospect Risking</Link>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.some((r) => r.a?.ok) && (
            <p className="text-[11px] text-pl-muted pt-1" data-testid="bf-trap-note">
              {rows.filter((r) => r.a?.ok).map((r) => `${r.trap.name}: ${r.a.text}`).join(' ')} Expelled below 1.3 %Ro counts as oil, above it as gas. The 1D model has no migration path: the fetch area and the efficiency carry that risk.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
