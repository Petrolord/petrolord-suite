// Manual rig and geological observations (spec section 21): ten types,
// each with a value and unit or a description, the depth it refers to
// and its source, listed by period. Continuous feeds are Release 2.

import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import DepthEntry from './DepthEntry';
import { OBSERVATION_TYPES, observationType, observationParams, observationLabel, SOURCES } from '../services/observations';
import { fmtDepth, depthToDisplay } from '../services/units';
import { toRigLocal, reportPeriod } from '@/lib/wellsite/time';
import { GAS_SUBTYPE, GAS_COMPONENTS, GAS_UNITS, parseComponents, chromatographParams, gasReading, gasRow } from '../services/gas';

const f1 = (v, dp = 1) => (Number.isFinite(v) ? v.toFixed(dp) : 'n/a');

export default function ObservationsView({ backend, well, ctx, observations, latestBit, lag, defaults, unit, offsetMin, tourCfg, nowMs, onChanged, onStatus }) {
  const [type, setType] = useState('total_gas');
  const [value, setValue] = useState('');
  const [unitSel, setUnitSel] = useState('%');
  const [text, setText] = useState('');
  const [source, setSource] = useState('manual');
  const [depthMode, setDepthMode] = useState('lagged');
  const [depth, setDepth] = useState({ value: NaN, unit: defaults.unit, reference: 'MD', datum: 'KB' });
  const [scope, setScope] = useState('day');
  // U2-002: chromatograph components as typed, and the unit they share
  const [gasText, setGasText] = useState({});
  const [gasUnit, setGasUnit] = useState('ppm');
  const isGas = type === GAS_SUBTYPE;
  const gasParsed = useMemo(() => parseComponents(gasText), [gasText]);
  const gasLive = useMemo(() => (isGas && !gasParsed.errors.length && Object.keys(gasParsed.components).length ? gasReading(gasParsed.components) : null), [isGas, gasParsed]);
  const t = observationType(type) || { name: 'Chromatograph', numeric: false, chromatograph: true };
  const sel = 'bg-pl-surface border border-pl-border-strong rounded px-1 py-0.5 text-xs text-pl-text';
  const local = (iso) => toRigLocal(Date.parse(iso), offsetMin).hhmm;

  const depthEntry = useMemo(() => {
    if (depthMode === 'bit' && latestBit) return { entry: { value: latestBit.depth_value, unit: latestBit.depth_unit, reference: latestBit.depth_ref, datum: latestBit.depth_datum }, kind: 'bit_depth' };
    if (depthMode === 'lagged' && lag && lag.available && Number.isFinite(lag.laggedMdM)) return { entry: { value: depthToDisplay(lag.laggedMdM, 'm'), unit: 'm', reference: 'MD', datum: 'KB' }, kind: 'lagged_sample' };
    if (depthMode === 'typed') return { entry: depth, kind: 'lagged_sample' };
    return { entry: null, kind: 'lagged_sample' };
  }, [depthMode, latestBit, lag, depth]);

  const save = async () => {
    try {
      if (isGas && gasParsed.errors.length) throw new Error(gasParsed.errors[0]);
      const p = isGas
        ? chromatographParams({ components: gasParsed.components, unit: gasUnit, source, note: text, depthEntry: depthEntry.entry, depthKind: depthEntry.kind })
        : observationParams({ type, value: t.numeric ? Number(value) : null, unit: t.numeric ? unitSel : null, text, source, depthEntry: depthEntry.entry, depthKind: depthEntry.kind });
      const { row } = await backend.addRecord(well.id, p);
      onStatus?.(isGas ? `Chromatograph reading recorded${Number.isFinite(row.md_calc_m) ? ` at ${fmtDepth(row.md_calc_m, unit)}` : ''}.` : `${observationLabel(row)} recorded${Number.isFinite(row.md_calc_m) ? ` at ${fmtDepth(row.md_calc_m, unit)}` : ''}.`);
      setValue(''); setText(''); setGasText({});
      onChanged?.(row);
    } catch (e) { onStatus?.(e.message); }
  };

  const period = useMemo(() => {
    if (scope === 'all') return { startUtc: 0, endUtc: nowMs };
    const p = reportPeriod(nowMs, tourCfg);
    return { startUtc: p.startUtc, endUtc: nowMs };
  }, [scope, nowMs, tourCfg]);
  const rows = useMemo(() => observations.filter((r) => Date.parse(r.occurred_at) >= period.startUtc).reverse(), [observations, period]);
  const gasRows = useMemo(() => rows.filter((r) => r.subtype === GAS_SUBTYPE).map(gasRow), [rows]);

  return (
    <div className="p-4 space-y-4" data-testid="ws-observations">
      <h2 className="text-sm font-semibold text-pl-text">Observations</h2>
      <div className="flex flex-wrap gap-1">
        {OBSERVATION_TYPES.map((o) => (
          <button key={o.code} type="button" data-testid={`ws-obs-type-${o.code}`} onClick={() => { setType(o.code); if (o.numeric) setUnitSel(o.units[0]); }}
            className={`px-2 py-1 text-xs rounded border ${type === o.code ? 'border-pl-primary bg-pl-primary/10 text-pl-primary-text' : 'border-pl-border text-pl-muted hover:bg-pl-sunken'}`}>{o.name}</button>
        ))}
        <button type="button" data-testid={`ws-obs-type-${GAS_SUBTYPE}`} onClick={() => setType(GAS_SUBTYPE)} title="C1 to C5 from the chromatograph, with the Haworth and Pixler ratios"
          className={`px-2 py-1 text-xs rounded border ${isGas ? 'border-pl-primary bg-pl-primary/10 text-pl-primary-text' : 'border-pl-border text-pl-muted hover:bg-pl-sunken'}`}>Chromatograph</button>
      </div>
      {isGas && (
        <div className="space-y-1" data-testid="ws-gas-form">
          <div className="flex items-end gap-1 flex-wrap">
            {GAS_COMPONENTS.map((c) => (
              <label key={c.key} className="text-[10px] text-pl-muted" title={c.name}>{c.label}<br />
                <input inputMode="decimal" value={gasText[c.key] ?? ''} onChange={(e) => setGasText({ ...gasText, [c.key]: e.target.value })} data-testid={`ws-gas-${c.key}`} className={`${sel} w-20`} /></label>
            ))}
            <label className="text-[10px] text-pl-muted" title="All seven components share this unit; the ratios need nothing else">Unit<br />
              <select value={gasUnit} onChange={(e) => setGasUnit(e.target.value)} data-testid="ws-gas-unit" className={sel}>{GAS_UNITS.map((u) => <option key={u} value={u}>{u === 'units' ? 'chromatograph units' : u}</option>)}</select>
            </label>
          </div>
          {gasParsed.errors.length > 0 && <div className="text-[11px] text-pl-warning-text" data-testid="ws-gas-error">{gasParsed.errors[0]}</div>}
          {gasLive && !gasLive.ok && <div className="text-[11px] text-pl-warning-text" data-testid="ws-gas-error">{gasLive.errors[0]}</div>}
          {gasLive && gasLive.ok && (
            <div className="text-[11px] text-pl-text" data-testid="ws-gas-live">
              <span data-testid="ws-gas-live-haworth">Wetness {f1(gasLive.haworth.wh)}, balance {f1(gasLive.haworth.bh)}, character {f1(gasLive.haworth.ch, 2)}: {gasLive.haworth.reading.text} (Haworth).</span>{' '}
              <span data-testid="ws-gas-live-pixler">C1/C2 {f1(gasLive.pixler.c1c2)}, C1/C3 {f1(gasLive.pixler.c1c3)}, C1/C4 {f1(gasLive.pixler.c1c4)}, C1/C5 {f1(gasLive.pixler.c1c5)}: {gasLive.pixler.reading.text}{gasLive.pixler.gravity ? `, ${gasLive.pixler.gravity}` : ''} (Pixler).</span>
              {gasLive.haworth.notes.map((n) => <span key={n} className="block text-pl-muted">{n}</span>)}
              <span className="block text-pl-muted">An indication from the gas alone. Read it with the cuttings, the shows and the drilling data.</span>
            </div>
          )}
        </div>
      )}
      <div className="flex items-end gap-2 flex-wrap">
        {t.numeric && (
          <>
            <label className="text-[10px] text-pl-muted">Value<br /><input type="number" step="any" value={value} onChange={(e) => setValue(e.target.value)} data-testid="ws-obs-value" className={`${sel} w-24`} /></label>
            <label className="text-[10px] text-pl-muted">Unit<br />
              <select value={unitSel} onChange={(e) => setUnitSel(e.target.value)} data-testid="ws-obs-unit" className={sel}>{t.units.map((u) => <option key={u} value={u}>{u}</option>)}</select>
            </label>
          </>
        )}
        <label className="text-[10px] text-pl-muted grow">{t.numeric || t.chromatograph ? 'Note' : 'Description'}{t.hint ? ` (${t.hint})` : ''}<br />
          <input value={text} onChange={(e) => setText(e.target.value)} data-testid="ws-obs-text" className={`${sel} w-full`} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
        </label>
        <label className="text-[10px] text-pl-muted">Source<br />
          <select value={source} onChange={(e) => setSource(e.target.value)} data-testid="ws-obs-source" className={sel}>{SOURCES.map((s) => <option key={s} value={s}>{s === 'manual' ? 'manual' : 'externally observed'}</option>)}</select>
        </label>
        <label className="text-[10px] text-pl-muted">Depth<br />
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
      {depthMode === 'lagged' && !(lag && lag.available && Number.isFinite(lag.laggedMdM)) && <div className="text-[11px] text-pl-warning-text" data-testid="ws-obs-depth-note">No lagged depth is available yet; the observation will carry no depth unless you choose another option.</div>}
      <div className="flex items-center gap-2 text-[11px]">
        {[['day', 'Report day'], ['all', 'Whole well']].map(([k, l]) => (
          <button key={k} type="button" data-testid={`ws-obs-scope-${k}`} onClick={() => setScope(k)} className={`px-2 py-0.5 rounded border ${scope === k ? 'border-pl-primary bg-pl-primary/10 text-pl-primary-text' : 'border-pl-border text-pl-muted'}`}>{l}</button>
        ))}
        <span className="text-pl-muted">{rows.length} observation(s)</span>
      </div>
      {gasRows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="text-xs text-pl-text" data-testid="ws-gas-table">
            <thead><tr className="text-[10px] uppercase text-pl-muted text-left">
              <th className="pr-3">Depth</th><th className="pr-3">C1</th><th className="pr-3">C2</th><th className="pr-3">C3</th><th className="pr-3">C4</th><th className="pr-3">C5</th><th className="pr-3">Unit</th>
              <th className="pr-3" title="Wetness, percent">Wh</th><th className="pr-3" title="Balance">Bh</th><th className="pr-3" title="Character">Ch</th><th className="pr-3">Haworth</th>
              <th className="pr-3">C1/C2</th><th className="pr-3">C1/C3</th><th className="pr-3">C1/C4</th><th className="pr-3">C1/C5</th><th className="pr-3">Pixler</th>
            </tr></thead>
            <tbody>
              {gasRows.slice(0, 50).map((g) => (
                <tr key={g.id} data-testid={`ws-gas-row-${g.id}`} className="align-top whitespace-nowrap">
                  <td className="pr-3">{Number.isFinite(g.mdM) ? fmtDepth(g.mdM, unit) : 'n/a'}</td>
                  <td className="pr-3">{g.components.c1 ?? 'n/a'}</td><td className="pr-3">{g.components.c2 ?? 'n/a'}</td><td className="pr-3">{g.components.c3 ?? 'n/a'}</td>
                  <td className="pr-3">{g.ok ? g.c4 : 'n/a'}</td><td className="pr-3">{g.ok ? g.c5 : 'n/a'}</td><td className="pr-3">{g.unit}</td>
                  <td className="pr-3" data-testid={`ws-gas-wh-${g.id}`}>{g.ok ? f1(g.haworth.wh) : 'n/a'}</td><td className="pr-3">{g.ok ? f1(g.haworth.bh) : 'n/a'}</td><td className="pr-3">{g.ok ? f1(g.haworth.ch, 2) : 'n/a'}</td>
                  <td className="pr-3" data-testid={`ws-gas-haworth-${g.id}`}>{g.ok ? g.haworth.reading.text : 'n/a'}</td>
                  <td className="pr-3">{g.ok ? f1(g.pixler.c1c2) : 'n/a'}</td><td className="pr-3">{g.ok ? f1(g.pixler.c1c3) : 'n/a'}</td><td className="pr-3">{g.ok ? f1(g.pixler.c1c4) : 'n/a'}</td><td className="pr-3">{g.ok ? f1(g.pixler.c1c5) : 'n/a'}</td>
                  <td className="pr-3 whitespace-normal" data-testid={`ws-gas-pixler-${g.id}`}>{g.ok ? g.pixler.reading.text : 'n/a'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <table className="text-xs text-pl-text w-full"><tbody>
        {rows.slice(0, 50).map((r) => (
          <tr key={r.id} data-testid={`ws-obs-row-${r.id}`} data-type={r.subtype} className="align-top">
            <td className="pr-3 whitespace-nowrap text-pl-muted">{local(r.occurred_at)}</td>
            <td className="pr-3 whitespace-nowrap">{Number.isFinite(r.md_calc_m) ? fmtDepth(r.md_calc_m, unit) : ''}</td>
            <td className="pr-3">{observationLabel(r)}</td>
            <td className="whitespace-nowrap text-pl-muted">{r.payload && r.payload.source === 'external' ? 'externally observed' : 'manual'}</td>
          </tr>
        ))}
      </tbody></table>
    </div>
  );
}
