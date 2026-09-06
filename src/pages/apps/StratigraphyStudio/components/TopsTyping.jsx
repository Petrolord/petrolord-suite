// Typed surfaces on one well (Stratigraphy Studio ST0): every top of the
// selected well with its surface type (Catuneanu code, labelled in the
// display scheme), the unit it is the top of, confidence and age. Writes
// go to the same geo_wells_tops rows every other app draws, through the
// backend's updateTop, one row at a time so one refused write never
// loses the others.

import React, { useEffect, useMemo, useState } from 'react';
import { Save, Loader2 } from 'lucide-react';
import { SURFACE_TYPES, displayLabel, normalizeSurfaceType, expectedTract, surfaceLineStyle } from '@/lib/stratigraphy/vocabulary';
import { orderedUnits } from '@/lib/stratigraphy/column';
import { FallbackBadge, StyleSwatch } from './Glossary';

const cellCls = 'bg-slate-950 border border-slate-700 rounded px-1 py-0.5 text-xs text-slate-100';
const btnCls = 'flex items-center gap-1 px-2 py-1 text-xs rounded border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40';

const toRow = (t) => ({
  id: t.id, name: t.name, md_m: t.md_m,
  surface_type: normalizeSurfaceType(t.surface_type), unit_id: t.unit_id || '', confidence: t.confidence || '',
  age_ma: t.age_ma == null ? '' : String(t.age_ma),
});

/**
 * @param {Object} p
 * @param {Object} p.well
 * @param {Array} p.tops registry rows of the well, shallow to deep
 * @param {Array} p.units the column
 * @param {'catuneanu'|'exxon'} p.scheme
 * @param {(topId: string, patch: Object) => Promise<void>} p.onSaveTop
 * @param {(msg: string) => void} p.onStatus
 */
export default function TopsTyping({ well, tops, units, scheme, onSaveTop, onStatus }) {
  const [rows, setRows] = useState(() => tops.map(toRow));
  const [busy, setBusy] = useState(false);
  useEffect(() => { setRows(tops.map(toRow)); }, [tops]);
  const canEdit = !!well?.is_own;
  const unitOptions = useMemo(() => orderedUnits(units).map((u) => ({ value: u.id, label: `${'  '.repeat(u.depth)}${u.name} (${u.rank})` })), [units]);
  const typeOptions = useMemo(() => SURFACE_TYPES.map((s) => {
    const d = displayLabel(s.code, scheme, { kind: 'surface' });
    return { value: s.code, label: `${displayLabel(s.code, scheme, { kind: 'surface', short: true }).label}: ${d.label}${d.fallback ? ' (Catuneanu)' : ''}` };
  }), [scheme]);

  const setCell = (id, key, value) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [key]: value } : r)));
  const changed = useMemo(() => {
    const before = new Map(tops.map((t) => [t.id, toRow(t)]));
    return rows.filter((r) => {
      const o = before.get(r.id);
      return o && (o.surface_type !== r.surface_type || o.unit_id !== r.unit_id || o.confidence !== r.confidence || o.age_ma !== r.age_ma);
    });
  }, [rows, tops]);

  const save = async () => {
    setBusy(true);
    let n = 0;
    try {
      for (const r of changed) {
        if (r.age_ma !== '' && !Number.isFinite(Number(r.age_ma))) throw new Error(`"${r.name}": the age "${r.age_ma}" is not a number.`);
        await onSaveTop(r.id, {
          surface_type: r.surface_type, unit_id: r.unit_id || null, confidence: r.confidence || null,
          age_ma: r.age_ma === '' ? null : Number(r.age_ma),
        });
        n += 1;
      }
      onStatus?.(`${n} top${n === 1 ? '' : 's'} typed on ${well.name}.`);
    } catch (e) {
      onStatus?.(`${e.message}${n ? ` (${n} saved before it)` : ''}`);
    } finally {
      setBusy(false);
    }
  };

  // the tract each consecutive typed pair bounds (base to top), read-only guidance for ST2
  const pairs = useMemo(() => {
    const sorted = [...rows].sort((a, b) => a.md_m - b.md_m);
    const out = new Map();
    for (let i = 0; i < sorted.length - 1; i++) {
      const upper = sorted[i]; const lower = sorted[i + 1];
      const t = expectedTract(lower.surface_type, upper.surface_type);
      if (t) out.set(upper.id, t);
    }
    return out;
  }, [rows]);

  if (!well) return <div className="h-full flex items-center justify-center text-slate-500 text-sm" data-testid="strat-tops-empty">Pick a well on the left to type its tops.</div>;

  return (
    <div className="p-3 space-y-2 text-xs" data-testid="strat-tops-typing">
      <div className="flex items-center gap-2">
        <span className="text-slate-300 font-medium">{well.name}</span>
        <span className="text-slate-500">{tops.length} top{tops.length === 1 ? '' : 's'}{canEdit ? '' : ' · shared with you, read-only'}</span>
        <div className="ml-auto">
          <button type="button" className={`${btnCls} ${changed.length ? 'border-cyan-500/60 text-cyan-300' : ''}`} disabled={!canEdit || busy || !changed.length} onClick={save} data-testid="strat-tops-save">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save {changed.length ? `(${changed.length})` : ''}
          </button>
        </div>
      </div>
      {!rows.length ? (
        <div className="text-slate-500">This well has no tops. Pick them in Well Correlation or Petrophysics Studio, or paste them in Well Data Manager.</div>
      ) : (
        <table className="text-xs">
          <thead>
            <tr>
              {['Top', 'MD (m)', 'Marker', 'Surface type', 'Unit', 'Confidence', 'Age (Ma)', 'Tract below'].map((h) => (
                <th key={h} className="text-left font-medium text-slate-500 pr-3 pb-1">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const d = displayLabel(r.surface_type, scheme, { kind: 'surface' });
              const tract = pairs.get(r.id);
              return (
                <tr key={r.id} data-testid={`strat-top-row-${r.name}`} data-surface-type={r.surface_type}>
                  <td className="pr-3 py-0.5 text-slate-100">{r.name}</td>
                  <td className="pr-3 py-0.5 text-slate-300 font-mono">{Number(r.md_m).toFixed(1)}</td>
                  <td className="pr-3 py-0.5"><StyleSwatch style={surfaceLineStyle(r.surface_type)} width={40} /></td>
                  <td className="pr-3 py-0.5">
                    <select className={cellCls} style={{ width: 300 }} value={r.surface_type} disabled={!canEdit} onChange={(e) => setCell(r.id, 'surface_type', e.target.value)} data-testid={`strat-top-type-${r.name}`} title={d.label}>
                      {typeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    {d.fallback && <FallbackBadge code={r.surface_type} />}
                  </td>
                  <td className="pr-3 py-0.5">
                    <select className={cellCls} style={{ width: 170 }} value={r.unit_id} disabled={!canEdit} onChange={(e) => setCell(r.id, 'unit_id', e.target.value)} data-testid={`strat-top-unit-${r.name}`}>
                      <option value="">none</option>
                      {unitOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </td>
                  <td className="pr-3 py-0.5">
                    <select className={cellCls} value={r.confidence} disabled={!canEdit} onChange={(e) => setCell(r.id, 'confidence', e.target.value)} data-testid={`strat-top-confidence-${r.name}`}>
                      <option value="">not stated</option>
                      <option value="high">high</option>
                      <option value="medium">medium</option>
                      <option value="low">low</option>
                    </select>
                  </td>
                  <td className="pr-3 py-0.5"><input className={cellCls} style={{ width: 72 }} value={r.age_ma} disabled={!canEdit} inputMode="decimal" onChange={(e) => setCell(r.id, 'age_ma', e.target.value)} data-testid={`strat-top-age-${r.name}`} /></td>
                  <td className="py-0.5 text-slate-400" data-testid={`strat-top-tract-${r.name}`}>
                    {tract ? <>{displayLabel(tract.code, scheme, { kind: 'tract', short: true }).label}{!tract.certain ? ' ?' : ''}{displayLabel(tract.code, scheme, { kind: 'tract' }).fallback && <FallbackBadge code={tract.code} />}</> : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="text-slate-500">Types, units, confidence and ages write to the shared tops rows: Well Correlation, Petrophysics Studio and Well Data Manager draw and list them at once. The tract column reads the pair of surfaces above and below; systems tracts are recorded in ST2.</p>
    </div>
  );
}
