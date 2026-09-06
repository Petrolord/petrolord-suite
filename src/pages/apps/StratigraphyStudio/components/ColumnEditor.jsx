// Stratigraphic column editor (Stratigraphy Studio ST0). One table of
// units in drawing order (the engine's orderedUnits): name, rank, parent,
// sibling order, top and base ages (typed, or filled from a timescale
// stage), colour. Save validates with the engine (validateColumn) and
// refuses the whole save on a problem, so a half-valid column never lands.
// New rows carry a temporary id until saved; a new child of a new parent
// is saved after its parent with the real id substituted.

import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Save, Loader2 } from 'lucide-react';
import { RANKS, orderedUnits, validateColumn } from '@/lib/stratigraphy/column';
import { unitsOfRank, ageBounds, TIMESCALE_VERSION } from '@/lib/stratigraphy/timescale';

const cellCls = 'bg-slate-950 border border-slate-700 rounded px-1 py-0.5 text-xs text-slate-100 w-full';
const btnCls = 'flex items-center gap-1 px-2 py-1 text-xs rounded border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40';

const toRow = (u) => ({
  id: u.id, name: u.name || '', rank: u.rank || 'formation', parent_id: u.parent_id || '',
  order_index: u.order_index == null ? '' : String(u.order_index),
  age_top_ma: u.age_top_ma == null ? '' : String(u.age_top_ma),
  age_base_ma: u.age_base_ma == null ? '' : String(u.age_base_ma),
  colour: u.colour || '#94a3b8', is_new: false,
});

const toUnit = (r) => ({
  id: r.id, name: String(r.name || '').trim(), rank: r.rank, parent_id: r.parent_id || null,
  order_index: r.order_index === '' ? null : Number(r.order_index),
  age_top_ma: r.age_top_ma === '' ? null : Number(r.age_top_ma),
  age_base_ma: r.age_base_ma === '' ? null : Number(r.age_base_ma),
  colour: r.colour || null,
});

let tmp = 0;

/**
 * @param {Object} p
 * @param {Array} p.units registry rows
 * @param {boolean} p.canEdit
 * @param {(ops: {create: Array, update: Array<{id, patch}>, remove: Array}) => Promise<void>} p.onSave
 * @param {(msg: string) => void} p.onStatus
 */
export default function ColumnEditor({ units, canEdit = true, onSave, onStatus }) {
  const [rows, setRows] = useState(() => units.map(toRow));
  const [problems, setProblems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { setRows(units.map(toRow)); setProblems([]); setDirty(false); }, [units]);

  const stages = useMemo(() => unitsOfRank('age'), []);
  const ordered = useMemo(() => orderedUnits(rows.map(toUnit)), [rows]);
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  const setCell = (id, key, value) => { setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [key]: value } : r))); setDirty(true); };
  const addRow = () => {
    tmp += 1;
    setRows((rs) => [...rs, { id: `new-${tmp}`, name: '', rank: 'formation', parent_id: '', order_index: '', age_top_ma: '', age_base_ma: '', colour: '#94a3b8', is_new: true }]);
    setDirty(true);
  };
  const delRow = (id) => { setRows((rs) => rs.filter((r) => r.id !== id).map((r) => (r.parent_id === id ? { ...r, parent_id: '' } : r))); setDirty(true); };
  const fillFromStage = (id, stageName) => {
    const b = ageBounds(stageName);
    if (!b) return;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, age_top_ma: String(b.top_ma), age_base_ma: String(b.base_ma) } : r)));
    setDirty(true);
  };

  const save = async () => {
    const list = rows.map(toUnit);
    const found = validateColumn(list);
    setProblems(found);
    if (found.length) { onStatus?.(`The column has ${found.length} problem${found.length === 1 ? '' : 's'}; nothing was saved.`); return; }
    const before = new Map(units.map((u) => [u.id, u]));
    const create = orderedUnits(list).filter((u) => byId.get(u.id)?.is_new);
    const update = [];
    for (const u of list) {
      const o = before.get(u.id);
      if (!o) continue;
      const patch = {};
      for (const k of ['name', 'rank', 'parent_id', 'order_index', 'age_top_ma', 'age_base_ma', 'colour']) {
        if ((o[k] ?? null) !== (u[k] ?? null)) patch[k] = u[k];
      }
      if (Object.keys(patch).length) update.push({ id: u.id, patch });
    }
    const keep = new Set(list.map((u) => u.id));
    const remove = units.filter((u) => !keep.has(u.id));
    setBusy(true);
    try {
      await onSave({ create, update, remove });
      onStatus?.(`Column saved (${create.length} added, ${update.length} changed, ${remove.length} removed).`);
      setDirty(false);
    } catch (e) {
      onStatus?.(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-3 space-y-2 text-xs" data-testid="strat-column-editor">
      <div className="flex items-center gap-2">
        <span className="text-slate-300 font-medium">Stratigraphic column</span>
        <span className="text-slate-500">{units.length} unit{units.length === 1 ? '' : 's'} · ages in Ma, timescale {TIMESCALE_VERSION}</span>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" className={btnCls} onClick={addRow} disabled={!canEdit} data-testid="strat-unit-add"><Plus className="w-3.5 h-3.5" /> Add unit</button>
          <button type="button" className={`${btnCls} ${dirty ? 'border-cyan-500/60 text-cyan-300' : ''}`} onClick={save} disabled={!canEdit || busy || !dirty} data-testid="strat-column-save">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save column
          </button>
        </div>
      </div>
      {problems.length > 0 && (
        <ul className="text-red-300 space-y-0.5" data-testid="strat-column-problems">
          {problems.map((p, i) => <li key={`${p.id}-${p.code}-${i}`}>{p.message}</li>)}
        </ul>
      )}
      {!rows.length ? (
        <div className="text-slate-500" data-testid="strat-column-empty">No units yet. Add a group, then the formations inside it.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="text-xs min-w-[880px]">
            <thead>
              <tr>
                {['Unit', 'Rank', 'Inside', 'Order', 'Top (Ma)', 'Base (Ma)', 'From stage', 'Colour', ''].map((h) => (
                  <th key={h} className="text-left font-medium text-slate-500 pr-3 pb-1">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ordered.map((u, i) => {
                const r = byId.get(u.id);
                return (
                  <tr key={u.id} data-testid={`strat-unit-row-${i}`} data-unit-id={u.id}>
                    <td className="pr-3 py-0.5" style={{ paddingLeft: 4 + u.depth * 14 }}>
                      <input className={cellCls} style={{ width: 180 }} value={r.name} disabled={!canEdit} placeholder="Unit name"
                        onChange={(e) => setCell(u.id, 'name', e.target.value)} data-testid={`strat-unit-name-${i}`} />
                    </td>
                    <td className="pr-3 py-0.5">
                      <select className={cellCls} value={r.rank} disabled={!canEdit} onChange={(e) => setCell(u.id, 'rank', e.target.value)} data-testid={`strat-unit-rank-${i}`}>
                        {RANKS.map((k) => <option key={k} value={k}>{k}</option>)}
                      </select>
                    </td>
                    <td className="pr-3 py-0.5">
                      <select className={cellCls} style={{ width: 150 }} value={r.parent_id} disabled={!canEdit} onChange={(e) => setCell(u.id, 'parent_id', e.target.value)} data-testid={`strat-unit-parent-${i}`}>
                        <option value="">none (top level)</option>
                        {rows.filter((o) => o.id !== u.id).map((o) => <option key={o.id} value={o.id}>{o.name || '(unnamed)'} ({o.rank})</option>)}
                      </select>
                    </td>
                    <td className="pr-3 py-0.5"><input className={cellCls} style={{ width: 48 }} value={r.order_index} disabled={!canEdit} inputMode="numeric" onChange={(e) => setCell(u.id, 'order_index', e.target.value)} data-testid={`strat-unit-order-${i}`} /></td>
                    <td className="pr-3 py-0.5"><input className={cellCls} style={{ width: 72 }} value={r.age_top_ma} disabled={!canEdit} inputMode="decimal" onChange={(e) => setCell(u.id, 'age_top_ma', e.target.value)} data-testid={`strat-unit-agetop-${i}`} /></td>
                    <td className="pr-3 py-0.5"><input className={cellCls} style={{ width: 72 }} value={r.age_base_ma} disabled={!canEdit} inputMode="decimal" onChange={(e) => setCell(u.id, 'age_base_ma', e.target.value)} data-testid={`strat-unit-agebase-${i}`} /></td>
                    <td className="pr-3 py-0.5">
                      <select className={cellCls} style={{ width: 130 }} value="" disabled={!canEdit} onChange={(e) => fillFromStage(u.id, e.target.value)} data-testid={`strat-unit-stage-${i}`} title="Fill both ages from a stage of the ICS chart">
                        <option value="">pick a stage</option>
                        {stages.map((s) => <option key={s.name} value={s.name}>{s.name} ({s.top_ma} to {s.base_ma})</option>)}
                      </select>
                    </td>
                    <td className="pr-3 py-0.5"><input type="color" value={r.colour} disabled={!canEdit} onChange={(e) => setCell(u.id, 'colour', e.target.value)} data-testid={`strat-unit-colour-${i}`} className="w-8 h-5 bg-transparent border-0 p-0" /></td>
                    <td className="py-0.5">
                      <button type="button" className="text-slate-500 hover:text-red-400" title="Remove unit" disabled={!canEdit} onClick={() => delRow(u.id)} data-testid={`strat-unit-del-${i}`}><Trash2 className="w-3 h-3" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-slate-500">Removing a unit keeps its children and any tops that named it; they lose the reference. Sharing the column with your organization shares all of it, read-only.</p>
    </div>
  );
}
