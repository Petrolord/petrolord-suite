// The one way a depth enters Wellsite Studio (spec section 10): value,
// unit, reference and datum are all chosen, the kind is fixed by the
// caller, and the calculated MD, TVD and subsea depth with the survey
// version show beside the entry so the geologist sees what will be
// stored. An incomplete entry reports its defect and cannot be saved.

import React, { useMemo } from 'react';
import { DEPTH_UNITS, DEPTH_REFERENCES, DEPTH_DATUMS, validateDepth, toCanonicalMd, fmtDepth, fromMetres } from '@/lib/wellsite/depth';

/**
 * @param {Object} p
 * @param {Object} p.value {value, unit, reference, datum}
 * @param {(entry:Object, calc:Object|null)=>void} p.onChange
 * @param {string} p.kind depth kind stored with the record
 * @param {Object} p.ctx well depth context
 * @param {string} [p.testIdPrefix]
 * @param {boolean} [p.compact]
 */
export default function DepthEntry({ value, onChange, kind, ctx, testIdPrefix = 'ws-depth', compact = false, disabled = false }) {
  const entry = { ...value, kind };
  const calc = useMemo(() => {
    if (!Number.isFinite(entry.value)) return null;
    return toCanonicalMd(entry, ctx);
  }, [entry.value, entry.unit, entry.reference, entry.datum, kind, ctx]); // eslint-disable-line react-hooks/exhaustive-deps
  const validation = validateDepth(entry);
  const errors = [...validation.errors, ...(calc && !calc.ok ? calc.errors : [])];
  const set = (patch) => {
    const next = { ...value, ...patch };
    const c = Number.isFinite(next.value) ? toCanonicalMd({ ...next, kind }, ctx) : null;
    onChange(next, c && c.ok ? c : null);
  };
  const sel = 'bg-slate-950 border border-slate-700 rounded px-1 py-0.5 text-xs text-slate-100';
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1 flex-wrap">
        <input type="number" step="any" inputMode="decimal" disabled={disabled} data-testid={`${testIdPrefix}-value`}
          value={Number.isFinite(value.value) ? value.value : ''} placeholder="depth"
          onChange={(e) => set({ value: e.target.value === '' ? NaN : Number(e.target.value) })}
          className={`${sel} w-24`} />
        <select value={value.unit || ''} disabled={disabled} data-testid={`${testIdPrefix}-unit`} onChange={(e) => set({ unit: e.target.value })} className={sel}>
          <option value="">unit</option>
          {DEPTH_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        <select value={value.reference || ''} disabled={disabled} data-testid={`${testIdPrefix}-ref`} onChange={(e) => set({ reference: e.target.value, ...(e.target.value === 'TVDSS' ? { datum: 'MSL' } : {}) })} className={sel}>
          <option value="">reference</option>
          {DEPTH_REFERENCES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={value.datum || ''} disabled={disabled || value.reference === 'TVDSS'} data-testid={`${testIdPrefix}-datum`} onChange={(e) => set({ datum: e.target.value })} className={sel}>
          <option value="">datum</option>
          {DEPTH_DATUMS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
      {errors.length > 0 && Number.isFinite(value.value) && (
        <div className="text-[11px] text-amber-400" data-testid={`${testIdPrefix}-error`}>{errors[0]}</div>
      )}
      {calc && calc.ok && !compact && (
        <div className="text-[11px] text-slate-400" data-testid={`${testIdPrefix}-calc`}>
          Stored as {fmtDepth(calc.mdM, 'm')} MD below KB
          {' '}({fmtDepth(fromMetres(calc.mdM, 'ft'), 'ft')}); TVD {fmtDepth(calc.calculated.tvdM, 'm')}, subsea {fmtDepth(calc.calculated.tvdssM, 'm')}
          {' '}by {calc.calculated.method.replace(/_/g, ' ')}{calc.calculated.surveyVersion ? ` on survey ${calc.calculated.surveyVersion}` : ''}
          {calc.warnings.length ? `. ${calc.warnings[0]}` : ''}
        </div>
      )}
    </div>
  );
}
