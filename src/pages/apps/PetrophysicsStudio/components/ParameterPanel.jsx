// Interpretation parameters (Petrophysics Studio G2.3, per-zone PS3).
// Everything the pipeline applies is visible here — no silent
// constants (the plan's formula-parameter footgun defense).
// Draft-and-apply: edits stage locally and hit the pipeline on Apply,
// so half-typed numbers never compute.
//
// PS3 scope selector: Global edits the base set; a zone scope edits
// that zone's override PATCH — the panel shows merged values, marks
// fields that differ from global with a dot, and Apply stores only the
// differing fields (setting a field back to the global value removes
// its override).

import React, { useEffect, useMemo, useState } from 'react';
import { FIELDS } from '../services/paramFields';

const num = (v) => (v === '' || v === '-' ? NaN : Number(v));
const inputCls = 'w-full rounded bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-0.5 text-xs';
const selCls = inputCls;


export default function ParameterPanel({
  params, onApply, zones = [], zoneParams = {}, onApplyZone, onOpenZoneTable = null,
}) {
  const [scope, setScope] = useState('global'); // 'global' | zone id
  const zone = zones.find((z) => z.id === scope) || null;
  useEffect(() => { if (scope !== 'global' && !zone) setScope('global'); }, [scope, zone]);

  const effective = useMemo(() => (zone
    ? { ...params, ...(zoneParams[zone.id] || {}) }
    : params), [params, zone, zoneParams]);

  const [draft, setDraft] = useState(effective);
  useEffect(() => setDraft(effective), [effective]);

  const visible = (f) => !f.show || f.show(draft);
  const dirty = JSON.stringify(draft) !== JSON.stringify(effective);
  const invalid = FIELDS.some((f) => f.key && !f.options && visible(f)
    && !Number.isFinite(num(String(draft[f.key]))));

  const apply = () => {
    if (invalid) return;
    // hidden fields keep their committed values, so stale text in a
    // field the current model does not use can never poison params
    const next = { ...effective };
    for (const f of FIELDS) {
      if (!f.key || !visible(f)) continue;
      next[f.key] = f.options ? draft[f.key] : num(String(draft[f.key]));
    }
    if (!zone) {
      onApply(next);
      return;
    }
    const patch = {};
    for (const f of FIELDS) {
      if (f.key && next[f.key] !== params[f.key]) patch[f.key] = next[f.key];
    }
    onApplyZone(zone.id, patch);
  };

  const overridden = (key) => zone
    && String(draft[key]) !== String(params[key]);
  const hasOverrides = zone && Object.keys(zoneParams[zone.id] || {}).length > 0;

  return (
    <div className="p-2 space-y-1 text-xs" data-testid="petro-params">
      <label className="flex items-center gap-2">
        <span className="w-28 shrink-0 text-slate-400">Scope</span>
        <select
          className={selCls}
          data-testid="petro-param-scope"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
        >
          <option value="global">Global</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>
              Zone: {z.name}{Object.keys(zoneParams[z.id] || {}).length ? ' •' : ''}
            </option>
          ))}
        </select>
      </label>
      {onOpenZoneTable && zones.length > 0 && (
        <button
          type="button"
          data-testid="petro-zone-table-open"
          className="w-full px-2 py-0.5 rounded border text-[11px] border-slate-700 text-slate-300 hover:bg-slate-800"
          title="Every parameter by every zone on one screen"
          onClick={onOpenZoneTable}
        >
          Zone parameter table…
        </button>
      )}
      {zone && (
        <p className="text-[10px] text-slate-500 leading-snug">
          Editing overrides for {zone.name}. Fields marked
          <span className="text-cyan-400"> •</span> differ from global; setting a field
          back to the global value removes its override.
        </p>
      )}
      {FIELDS.map((f, i) => (f.section ? (
        <div key={f.section} className={`text-[10px] uppercase tracking-wider text-slate-500 ${i ? 'pt-2' : ''}`}>
          {f.section}
        </div>
      ) : f.hint ? (
        visible(f) && f.hint(draft) ? (
          <p key={`hint-${i}`} className="text-[10px] text-slate-500 leading-snug" data-testid="petro-param-hint">
            {f.hint(draft)}
          </p>
        ) : null
      ) : !visible(f) ? null : (
        <label key={f.key} className="flex items-center gap-2">
          <span className={`w-28 shrink-0 ${overridden(f.key) ? 'text-cyan-300' : 'text-slate-400'}`}>
            {typeof f.label === 'function' ? f.label(draft) : f.label}
            {overridden(f.key) && <span className="text-cyan-400"> •</span>}
          </span>
          {f.options ? (
            <select
              className={selCls}
              value={draft[f.key]}
              data-testid={`petro-param-${f.key}`}
              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
            >
              {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input
              className={inputCls}
              value={String(draft[f.key])}
              data-testid={`petro-param-${f.key}`}
              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') apply(); }}
            />
          )}
        </label>
      )))}
      <button
        type="button"
        data-testid="petro-params-apply"
        disabled={!dirty || invalid}
        className="mt-2 w-full px-2 py-1 rounded border text-xs
          border-cyan-700/60 text-cyan-300 hover:bg-cyan-500/10
          disabled:opacity-40 disabled:cursor-not-allowed"
        onClick={apply}
      >
        {zone ? `Apply ${zone.name} overrides` : 'Apply parameters'}
      </button>
      {hasOverrides && (
        <button
          type="button"
          data-testid="petro-params-clear-zone"
          className="w-full px-2 py-1 rounded border text-xs
            border-slate-700 text-slate-400 hover:bg-slate-800"
          onClick={() => onApplyZone(zone.id, {})}
        >
          Clear {zone.name} overrides
        </button>
      )}
    </div>
  );
}
