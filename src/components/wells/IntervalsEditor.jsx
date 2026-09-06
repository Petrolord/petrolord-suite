// Interval-log editor (Stratigraphy Studio ST1). ONE component, two
// hosts: the Well Data Manager Intervals tab and the Stratigraphy Studio
// Intervals view (plan section 4: a component lives in one directory).
// One kind at a time: a table of intervals (top, base, code, label, grain
// size, environment, description, source) with lithology and grain-size
// pickers from the engine vocabulary, a paste-replace door (top, base,
// code columns), engine validation (validateIntervals) that refuses the
// whole save on a problem, and a thickness summary by code.

import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Save, Loader2, ClipboardPaste } from 'lucide-react';
import {
  INTERVAL_KINDS, INTERVAL_SOURCES, LITHOLOGIES, GRAIN_SIZES, ENVIRONMENTS, resolveLithology, intervalColour,
} from '@/lib/stratigraphy/lithology';
import { validateIntervals, sortIntervals, thicknessByCode } from '@/lib/stratigraphy/intervals';
import { MOTIFS, SYSTEMS_TRACTS, STACKING_PATTERNS } from '@/lib/stratigraphy/vocabulary';
import { buildIntervals } from '@/lib/wellImport';
import PasteReplacePanel from './PasteReplacePanel';

const cellCls = 'bg-slate-950 border border-slate-700 rounded px-1 py-0.5 text-xs text-slate-100';
const btnCls = 'flex items-center gap-1 px-2 py-1 text-xs rounded border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40';

/** Kinds this editor offers (systems tracts and biozones arrive with ST2 and ST3). */
export const EDITABLE_KINDS = INTERVAL_KINDS.filter((k) => ['lithology', 'core_description', 'facies', 'electrofacies', 'environment', 'motif', 'systems_tract'].includes(k.code));

const toRow = (r) => ({
  id: r.id, top: r.top_md_m == null ? '' : String(r.top_md_m), base: r.base_md_m == null ? '' : String(r.base_md_m),
  code: r.code || '', label: r.label || '', source: r.source || 'interpretation',
  grain_size: r.properties?.grain_size || '', environment: r.properties?.environment || '',
  description: r.properties?.description || '', colour: r.properties?.colour || '', stacking: r.properties?.stacking || '',
  properties: r.properties || {}, is_new: false,
});

let tmp = 0;

// hoisted: PasteReplacePanel memoizes on `fields`, so a fresh literal per render would re-parse and re-emit forever
const PASTE_FIELDS = ['top', 'base', 'code', 'label', 'description'];

const toInterval = (r, kind) => {
  const properties = { ...(r.properties || {}) };
  for (const k of ['grain_size', 'environment', 'description', 'colour', 'stacking']) {
    if (r[k]) properties[k] = r[k]; else delete properties[k];
  }
  return {
    id: r.id, kind, top_md_m: r.top === '' ? NaN : Number(r.top), base_md_m: r.base === '' ? NaN : Number(r.base),
    code: String(r.code || '').trim(), label: String(r.label || '').trim() || null, source: r.source || 'interpretation', properties,
  };
};

/**
 * @param {Object} p
 * @param {Object} p.well
 * @param {Array} p.intervals every interval row of the well (all kinds)
 * @param {boolean} p.canEdit
 * @param {(kind: string, rows: Array) => Promise<void>} p.onReplace replace every interval of `kind` on the well
 * @param {(msg: string) => void} p.onStatus
 * @param {string} [p.testIdPrefix]
 * @param {string} [p.initialKind]
 */
export default function IntervalsEditor({ well, intervals, canEdit = true, onReplace, onStatus, testIdPrefix = 'wdm-intervals', initialKind = 'lithology' }) {
  const [kind, setKind] = useState(initialKind);
  const [rows, setRows] = useState([]);
  const [problems, setProblems] = useState([]);
  const [mode, setMode] = useState('grid');
  const [pasted, setPasted] = useState(null);
  const [mdUnit, setMdUnit] = useState('m');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const ofKind = useMemo(() => sortIntervals((intervals || []).filter((r) => r.kind === kind)), [intervals, kind]);
  useEffect(() => { setRows(ofKind.map(toRow)); setProblems([]); setDirty(false); setMode('grid'); setPasted(null); }, [ofKind]);

  const codeOptions = useMemo(() => {
    if (kind === 'lithology' || kind === 'core_description') return LITHOLOGIES.map((l) => ({ value: l.code, label: l.name }));
    if (kind === 'environment') return ENVIRONMENTS.map((e) => ({ value: e.code, label: e.name }));
    if (kind === 'motif') return MOTIFS.map((m) => ({ value: m.code, label: m.name }));
    if (kind === 'systems_tract') return SYSTEMS_TRACTS.map((t) => ({ value: t.code, label: t.name }));
    return null;   // facies and electrofacies are free names
  }, [kind]);

  const setCell = (i, key, value) => { setRows((rs) => rs.map((r, ri) => (ri === i ? { ...r, [key]: value } : r))); setDirty(true); };
  const addRow = () => {
    tmp += 1;
    const last = rows[rows.length - 1];
    setRows((rs) => [...rs, { id: `new-${tmp}`, top: last?.base || '', base: '', code: codeOptions ? codeOptions[0].value : '', label: '', source: 'interpretation', grain_size: '', environment: '', description: '', colour: '', stacking: '', properties: {}, is_new: true }]);
    setDirty(true);
  };
  const delRow = (i) => { setRows((rs) => rs.filter((_, ri) => ri !== i)); setDirty(true); };

  const save = async () => {
    let list;
    if (mode === 'paste') {
      if (!pasted) { onStatus?.('Paste intervals first.'); return; }
      try {
        list = buildIntervals(pasted.parsed.rows, pasted.map, { mdUnit }).map((r) => {
          const lith = (kind === 'lithology' || kind === 'core_description') ? resolveLithology(r.code) : null;
          return { kind, top_md_m: r.top_md_m, base_md_m: r.base_md_m, code: lith ? lith.code : r.code, label: r.label || (lith ? lith.name : null), properties: { ...r.properties, ...(lith ? {} : (kind === 'lithology' || kind === 'core_description') && r.code ? { lithology_text: r.code } : {}) }, source: 'import' };
        });
      } catch (e) { onStatus?.(e.message); return; }
    } else {
      list = rows.map((r) => toInterval(r, kind));
    }
    const found = validateIntervals(list);
    setProblems(found);
    if (found.length) { onStatus?.(`${found.length} problem${found.length === 1 ? '' : 's'}; nothing was saved.`); return; }
    setBusy(true);
    try {
      await onReplace(kind, list);
      onStatus?.(`${list.length} ${kind.replace(/_/g, ' ')} interval${list.length === 1 ? '' : 's'} saved on ${well.name}.`);
      setDirty(false);
      setMode('grid');
      setPasted(null);
    } catch (e) {
      onStatus?.(e.message);
    } finally {
      setBusy(false);
    }
  };

  const thickness = useMemo(() => thicknessByCode(rows.map((r) => toInterval(r, kind)).filter((r) => Number.isFinite(r.top_md_m) && Number.isFinite(r.base_md_m)), kind), [rows, kind]);
  const isLith = kind === 'lithology' || kind === 'core_description';

  return (
    <div className="space-y-2 text-xs" data-testid={`${testIdPrefix}-editor`}>
      <div className="flex items-center gap-2 flex-wrap">
        <label className="flex items-center gap-1 text-slate-400">
          Kind
          <select className={cellCls} value={kind} onChange={(e) => setKind(e.target.value)} data-testid={`${testIdPrefix}-kind`}>
            {EDITABLE_KINDS.map((k) => <option key={k.code} value={k.code}>{k.name}</option>)}
          </select>
        </label>
        <span className="text-slate-500">{ofKind.length} on {well?.name}{canEdit ? '' : ' (read-only)'}</span>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" className={`${btnCls} ${mode === 'paste' ? 'border-cyan-500/60 text-cyan-300' : ''}`} disabled={!canEdit} data-testid={`${testIdPrefix}-paste-toggle`}
            onClick={() => { setMode((m) => (m === 'paste' ? 'grid' : 'paste')); setProblems([]); }}>
            <ClipboardPaste className="w-3.5 h-3.5" /> {mode === 'paste' ? 'Back to table' : 'Replace from paste'}
          </button>
          {mode === 'grid' && <button type="button" className={btnCls} disabled={!canEdit} onClick={addRow} data-testid={`${testIdPrefix}-add`}><Plus className="w-3.5 h-3.5" /> Add</button>}
          <button type="button" className={`${btnCls} ${dirty || (mode === 'paste' && pasted) ? 'border-cyan-500/60 text-cyan-300' : ''}`} disabled={!canEdit || busy || (mode === 'grid' && !dirty) || (mode === 'paste' && !pasted)} onClick={save} data-testid={`${testIdPrefix}-save`}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save {kind.replace(/_/g, ' ')}
          </button>
        </div>
      </div>
      {problems.length > 0 && (
        <ul className="text-red-300 space-y-0.5" data-testid={`${testIdPrefix}-problems`}>
          {problems.map((p, i) => <li key={`${p.code}-${i}`}>{p.message}</li>)}
        </ul>
      )}
      {mode === 'paste' ? (
        <div className="space-y-1">
          <PasteReplacePanel kind="intervals" fields={PASTE_FIELDS}
            labels={{ top: `Top (${mdUnit})`, base: `Base (${mdUnit})`, code: isLith ? 'Lithology' : 'Code', label: 'Label (optional)', description: 'Description (optional)' }}
            convention={{ mdUnit }} onConvention={(c) => setMdUnit(c.mdUnit || 'm')}
            onParsed={setPasted} testIdPrefix={`${testIdPrefix}-paste`} />
          <p className="text-slate-500">Replaces every {kind.replace(/_/g, ' ')} interval on this well. Lithology abbreviations (SST, SH, LS, DOL ...) resolve to the vocabulary; unknown ones are kept as typed.</p>
        </div>
      ) : !rows.length ? (
        <div className="text-slate-500" data-testid={`${testIdPrefix}-empty`}>No {kind.replace(/_/g, ' ')} intervals on this well yet. Add rows, paste a table, or import a LAS 3.0 file with a core or lithology block in Well Data Manager.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="text-xs min-w-[860px]">
            <thead>
              <tr>
                {['', 'Top (m)', 'Base (m)', isLith ? 'Lithology' : kind === 'environment' ? 'Environment' : kind === 'motif' ? 'Motif' : kind === 'systems_tract' ? 'Tract' : 'Code', 'Label', ...(isLith ? ['Grain size'] : []), ...(kind === 'core_description' ? ['Environment'] : []), ...(kind === 'systems_tract' ? ['Stacking'] : []), 'Description', 'Source', ''].map((h, i) => (
                  <th key={`${h}-${i}`} className="text-left font-medium text-slate-500 pr-3 pb-1">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} data-testid={`${testIdPrefix}-row-${i}`}>
                  <td className="pr-2 py-0.5"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: r.colour || intervalColour({ kind, code: r.code, properties: r.properties }) }} /></td>
                  <td className="pr-3 py-0.5"><input className={cellCls} style={{ width: 72 }} value={r.top} disabled={!canEdit} inputMode="decimal" onChange={(e) => setCell(i, 'top', e.target.value)} data-testid={`${testIdPrefix}-top-${i}`} /></td>
                  <td className="pr-3 py-0.5"><input className={cellCls} style={{ width: 72 }} value={r.base} disabled={!canEdit} inputMode="decimal" onChange={(e) => setCell(i, 'base', e.target.value)} data-testid={`${testIdPrefix}-base-${i}`} /></td>
                  <td className="pr-3 py-0.5">
                    {codeOptions ? (
                      <select className={cellCls} style={{ width: 150 }} value={r.code} disabled={!canEdit} onChange={(e) => setCell(i, 'code', e.target.value)} data-testid={`${testIdPrefix}-code-${i}`}>
                        {codeOptions.some((o) => o.value === r.code) ? null : <option value={r.code}>{r.code || '(pick one)'}</option>}
                        {codeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    ) : (
                      <input className={cellCls} style={{ width: 150 }} value={r.code} disabled={!canEdit} placeholder="Facies name" onChange={(e) => setCell(i, 'code', e.target.value)} data-testid={`${testIdPrefix}-code-${i}`} />
                    )}
                  </td>
                  <td className="pr-3 py-0.5"><input className={cellCls} style={{ width: 120 }} value={r.label} disabled={!canEdit} onChange={(e) => setCell(i, 'label', e.target.value)} data-testid={`${testIdPrefix}-label-${i}`} /></td>
                  {isLith && (
                    <td className="pr-3 py-0.5">
                      <select className={cellCls} value={r.grain_size} disabled={!canEdit} onChange={(e) => setCell(i, 'grain_size', e.target.value)} data-testid={`${testIdPrefix}-grain-${i}`}>
                        <option value="">none</option>
                        {GRAIN_SIZES.map((g) => <option key={g.code} value={g.code}>{g.name}</option>)}
                      </select>
                    </td>
                  )}
                  {kind === 'core_description' && (
                    <td className="pr-3 py-0.5">
                      <select className={cellCls} value={r.environment} disabled={!canEdit} onChange={(e) => setCell(i, 'environment', e.target.value)} data-testid={`${testIdPrefix}-env-${i}`}>
                        <option value="">none</option>
                        {ENVIRONMENTS.map((g) => <option key={g.code} value={g.code}>{g.name}</option>)}
                      </select>
                    </td>
                  )}
                  {kind === 'systems_tract' && (
                    <td className="pr-3 py-0.5">
                      <select className={cellCls} value={r.stacking} disabled={!canEdit} onChange={(e) => setCell(i, 'stacking', e.target.value)} data-testid={`${testIdPrefix}-stacking-${i}`}>
                        <option value="">not read</option>
                        {STACKING_PATTERNS.map((g) => <option key={g.code} value={g.code}>{g.name}</option>)}
                      </select>
                    </td>
                  )}
                  <td className="pr-3 py-0.5"><input className={cellCls} style={{ width: 220 }} value={r.description} disabled={!canEdit} onChange={(e) => setCell(i, 'description', e.target.value)} data-testid={`${testIdPrefix}-desc-${i}`} /></td>
                  <td className="pr-3 py-0.5">
                    <select className={cellCls} value={r.source} disabled={!canEdit} onChange={(e) => setCell(i, 'source', e.target.value)} data-testid={`${testIdPrefix}-source-${i}`}>
                      {INTERVAL_SOURCES.map((sname) => <option key={sname} value={sname}>{sname}</option>)}
                    </select>
                  </td>
                  <td className="py-0.5"><button type="button" className="text-slate-500 hover:text-red-400" disabled={!canEdit} title="Remove" onClick={() => delRow(i)} data-testid={`${testIdPrefix}-del-${i}`}><Trash2 className="w-3 h-3" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {thickness.length > 0 && mode === 'grid' && (
        <div className="text-slate-500" data-testid={`${testIdPrefix}-thickness`}>
          Thickness: {thickness.map((t) => `${t.label} ${t.thickness_m.toFixed(1)} m`).join(' · ')}
        </div>
      )}
    </div>
  );
}
