// Manual rig and geological observations (spec section 21): ten types,
// each with a value and unit or a description, the depth it refers to
// and its source, listed by period. Continuous feeds are Release 2.

import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import DepthEntry from './DepthEntry';
import { OBSERVATION_TYPES, observationType, observationParams, observationLabel, SOURCES } from '../services/observations';
import { fmtDepth, depthToDisplay } from '../services/units';
import { toRigLocal, reportPeriod } from '@/lib/wellsite/time';

export default function ObservationsView({ backend, well, ctx, observations, latestBit, lag, defaults, unit, offsetMin, tourCfg, nowMs, onChanged, onStatus }) {
  const [type, setType] = useState('total_gas');
  const [value, setValue] = useState('');
  const [unitSel, setUnitSel] = useState('%');
  const [text, setText] = useState('');
  const [source, setSource] = useState('manual');
  const [depthMode, setDepthMode] = useState('lagged');
  const [depth, setDepth] = useState({ value: NaN, unit: defaults.unit, reference: 'MD', datum: 'KB' });
  const [scope, setScope] = useState('day');
  const t = observationType(type);
  const sel = 'bg-slate-950 border border-slate-700 rounded px-1 py-0.5 text-xs text-slate-100';
  const local = (iso) => toRigLocal(Date.parse(iso), offsetMin).hhmm;

  const depthEntry = useMemo(() => {
    if (depthMode === 'bit' && latestBit) return { entry: { value: latestBit.depth_value, unit: latestBit.depth_unit, reference: latestBit.depth_ref, datum: latestBit.depth_datum }, kind: 'bit_depth' };
    if (depthMode === 'lagged' && lag && lag.available && Number.isFinite(lag.laggedMdM)) return { entry: { value: depthToDisplay(lag.laggedMdM, 'm'), unit: 'm', reference: 'MD', datum: 'KB' }, kind: 'lagged_sample' };
    if (depthMode === 'typed') return { entry: depth, kind: 'lagged_sample' };
    return { entry: null, kind: 'lagged_sample' };
  }, [depthMode, latestBit, lag, depth]);

  const save = async () => {
    try {
      const p = observationParams({ type, value: t.numeric ? Number(value) : null, unit: t.numeric ? unitSel : null, text, source, depthEntry: depthEntry.entry, depthKind: depthEntry.kind });
      const { row } = await backend.addRecord(well.id, p);
      onStatus?.(`${observationLabel(row)} recorded${Number.isFinite(row.md_calc_m) ? ` at ${fmtDepth(row.md_calc_m, unit)}` : ''}.`);
      setValue(''); setText('');
      onChanged?.(row);
    } catch (e) { onStatus?.(e.message); }
  };

  const period = useMemo(() => {
    if (scope === 'all') return { startUtc: 0, endUtc: nowMs };
    const p = reportPeriod(nowMs, tourCfg);
    return { startUtc: p.startUtc, endUtc: nowMs };
  }, [scope, nowMs, tourCfg]);
  const rows = useMemo(() => observations.filter((r) => Date.parse(r.occurred_at) >= period.startUtc).reverse(), [observations, period]);

  return (
    <div className="p-4 space-y-4" data-testid="ws-observations">
      <h2 className="text-sm font-semibold text-slate-100">Observations</h2>
      <div className="flex flex-wrap gap-1">
        {OBSERVATION_TYPES.map((o) => (
          <button key={o.code} type="button" data-testid={`ws-obs-type-${o.code}`} onClick={() => { setType(o.code); if (o.numeric) setUnitSel(o.units[0]); }}
            className={`px-2 py-1 text-xs rounded border ${type === o.code ? 'border-cyan-500/60 text-cyan-300' : 'border-slate-700 text-slate-400 hover:bg-slate-800'}`}>{o.name}</button>
        ))}
      </div>
      <div className="flex items-end gap-2 flex-wrap">
        {t.numeric && (
          <>
            <label className="text-[10px] text-slate-400">Value<br /><input type="number" step="any" value={value} onChange={(e) => setValue(e.target.value)} data-testid="ws-obs-value" className={`${sel} w-24`} /></label>
            <label className="text-[10px] text-slate-400">Unit<br />
              <select value={unitSel} onChange={(e) => setUnitSel(e.target.value)} data-testid="ws-obs-unit" className={sel}>{t.units.map((u) => <option key={u} value={u}>{u}</option>)}</select>
            </label>
          </>
        )}
        <label className="text-[10px] text-slate-400 grow">{t.numeric ? 'Note' : 'Description'}{t.hint ? ` (${t.hint})` : ''}<br />
          <input value={text} onChange={(e) => setText(e.target.value)} data-testid="ws-obs-text" className={`${sel} w-full`} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
        </label>
        <label className="text-[10px] text-slate-400">Source<br />
          <select value={source} onChange={(e) => setSource(e.target.value)} data-testid="ws-obs-source" className={sel}>{SOURCES.map((s) => <option key={s} value={s}>{s === 'manual' ? 'manual' : 'externally observed'}</option>)}</select>
        </label>
        <label className="text-[10px] text-slate-400">Depth<br />
          <select value={depthMode} onChange={(e) => setDepthMode(e.target.value)} data-testid="ws-obs-depth-mode" className={sel}>
            <option value="lagged">lagged sample depth now</option>
            <option value="bit">bit depth now</option>
            <option value="typed">typed</option>
            <option value="none">none</option>
          </select>
        </label>
        {depthMode === 'typed' && <DepthEntry value={depth} onChange={setDepth} kind="lagged_sample" ctx={ctx} compact testIdPrefix="ws-obs-depth" />}
        <Button size="sm" onClick={save} data-testid="ws-obs-save">Record</Button>
      </div>
      {depthMode === 'lagged' && !(lag && lag.available && Number.isFinite(lag.laggedMdM)) && <div className="text-[11px] text-amber-400" data-testid="ws-obs-depth-note">No lagged depth is available yet; the observation will carry no depth unless you choose another option.</div>}
      <div className="flex items-center gap-2 text-[11px]">
        {[['day', 'Report day'], ['all', 'Whole well']].map(([k, l]) => (
          <button key={k} type="button" data-testid={`ws-obs-scope-${k}`} onClick={() => setScope(k)} className={`px-2 py-0.5 rounded border ${scope === k ? 'border-cyan-500/60 text-cyan-300' : 'border-slate-700 text-slate-400'}`}>{l}</button>
        ))}
        <span className="text-slate-500">{rows.length} observation(s)</span>
      </div>
      <table className="text-xs text-slate-300 w-full"><tbody>
        {rows.slice(0, 50).map((r) => (
          <tr key={r.id} data-testid={`ws-obs-row-${r.id}`} data-type={r.subtype} className="align-top">
            <td className="pr-3 whitespace-nowrap text-slate-500">{local(r.occurred_at)}</td>
            <td className="pr-3 whitespace-nowrap">{Number.isFinite(r.md_calc_m) ? fmtDepth(r.md_calc_m, unit) : ''}</td>
            <td className="pr-3">{observationLabel(r)}</td>
            <td className="whitespace-nowrap text-slate-500">{r.payload && r.payload.source === 'external' ? 'externally observed' : 'manual'}</td>
          </tr>
        ))}
      </tbody></table>
    </div>
  );
}
