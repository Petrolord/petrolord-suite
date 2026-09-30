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
import { FIELDS, fieldLabel } from '../services/paramFields';
import { toDisplayDraft, engineValue, UNIT_LABELS } from '../services/paramUnits';

const num = (v) => (v === '' || v === '-' ? NaN : Number(v));
const inputCls = 'w-full rounded bg-pl-surface border border-pl-border-strong text-pl-text px-1.5 py-0.5 text-xs';
const selCls = inputCls;


export default function ParameterPanel({
  params, onApply, zones = [], zoneParams = {}, onApplyZone, onOpenZoneTable = null,
  unitSystem = 'si', onUnitSystem = null, qcHints = [],
}) {
  const [scope, setScope] = useState('global'); // 'global' | zone id
  const zone = zones.find((z) => z.id === scope) || null;
  useEffect(() => { if (scope !== 'global' && !zone) setScope('global'); }, [scope, zone]);

  const effective = useMemo(() => (zone
    ? { ...params, ...(zoneParams[zone.id] || {}) }
    : params), [params, zone, zoneParams]);

  // PETRO-U2-002: the draft holds what the fields show (slowness,
  // temperatures and the BHT depth in the chosen unit system); state stays
  // in engine units and an untouched field keeps its stored value exactly
  const shown = useMemo(() => toDisplayDraft(effective, unitSystem), [effective, unitSystem]);
  const [draft, setDraft] = useState(shown);
  useEffect(() => setDraft(shown), [shown]);

  const visible = (f) => !f.show || f.show(draft);
  const dirty = JSON.stringify(draft) !== JSON.stringify(shown);
  const invalid = FIELDS.some((f) => f.key && !f.options && visible(f)
    && !Number.isFinite(num(String(draft[f.key]))));

  const apply = () => {
    if (invalid) return;
    // hidden fields keep their committed values, so stale text in a
    // field the current model does not use can never poison params
    const next = { ...effective };
    for (const f of FIELDS) {
      if (!f.key || !visible(f)) continue;
      next[f.key] = f.options ? draft[f.key] : engineValue(f.key, num(String(draft[f.key])), [effective[f.key], params[f.key]], unitSystem);
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

  const shownGlobal = useMemo(() => toDisplayDraft(params, unitSystem), [params, unitSystem]);
  const overridden = (key) => zone
    && String(draft[key]) !== String(shownGlobal[key]);
  const hasOverrides = zone && Object.keys(zoneParams[zone.id] || {}).length > 0;

  return (
    <div className="p-2 space-y-1 text-xs" data-testid="petro-params">
      <label className="flex items-center gap-2">
        <span className="w-28 shrink-0 text-pl-muted">Scope</span>
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
      {onUnitSystem && (
        <div className="flex items-center gap-2">
          <span className="w-28 shrink-0 text-pl-muted">Units</span>
          <div className="flex rounded border border-pl-border overflow-hidden" data-testid="petro-param-units">
            {[['si', 'SI'], ['field', 'Field']].map(([k, label]) => (
              <button
                key={k}
                type="button"
                data-testid={`petro-param-units-${k}`}
                aria-pressed={unitSystem === k}
                title={`Sonic slowness in ${UNIT_LABELS[k].slowness}, temperatures in ${UNIT_LABELS[k].temperature}, BHT depth in ${UNIT_LABELS[k].depth}. Stored in SI either way.`}
                className={`px-2 py-0.5 text-[11px] ${unitSystem === k ? 'bg-pl-primary/10 text-pl-primary-text' : 'text-pl-muted hover:text-pl-text'}`}
                onClick={() => onUnitSystem(k)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      {onOpenZoneTable && zones.length > 0 && (
        <button
          type="button"
          data-testid="petro-zone-table-open"
          className="w-full px-2 py-0.5 rounded border text-[11px] border-pl-border text-pl-text hover:bg-pl-sunken"
          title="Every parameter by every zone on one screen"
          onClick={onOpenZoneTable}
        >
          Zone parameter table…
        </button>
      )}
      {zone && (
        <p className="text-[10px] text-pl-muted leading-snug">
          Editing overrides for {zone.name}. Fields marked
          <span className="text-pl-primary-text"> •</span> differ from global; setting a field
          back to the global value removes its override.
        </p>
      )}
      {FIELDS.map((f, i) => (f.section ? (
        <div key={f.section} className={`text-[10px] uppercase tracking-wider text-pl-muted ${i ? 'pt-2' : ''}`}>
          {f.section}
        </div>
      ) : f.hint ? (
        visible(f) && f.hint(draft) ? (
          <p key={`hint-${i}`} className={`text-[10px] leading-snug ${f.testId ? 'text-pl-warning-text' : 'text-pl-muted'}`} data-testid={f.testId || 'petro-param-hint'}>
            {f.hint(draft)}
          </p>
        ) : null
      ) : !visible(f) ? null : (
        <label key={f.key} className="flex items-center gap-2">
          <span className={`w-28 shrink-0 ${overridden(f.key) ? 'text-pl-primary-text' : 'text-pl-muted'}`}>
            {fieldLabel(f, draft, unitSystem)}
            {overridden(f.key) && <span className="text-pl-primary-text"> •</span>}
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
      {/* PETRO-U2-015: parameters far from the well's own logs, said before a publish */}
      {qcHints.length > 0 && (
        <div className="mt-2 rounded border border-pl-warning/60 bg-pl-warning-bg/40 p-1.5 space-y-1" data-testid="petro-param-qc">
          <div className="text-[10px] uppercase tracking-wider text-pl-warning-text">Check against this well</div>
          {qcHints.map((h) => (
            <p key={`${h.key}-${h.text.slice(0, 12)}`} className={`text-[10px] leading-snug ${h.level === 'error' ? 'text-pl-danger-text' : 'text-pl-warning-text'}`} data-testid={`petro-param-qc-${h.key}`}>{h.text}</p>
          ))}
        </div>
      )}
      <button
        type="button"
        data-testid="petro-params-apply"
        disabled={!dirty || invalid}
        className="mt-2 w-full px-2 py-1 rounded border text-xs
          border-pl-primary/60 text-pl-primary-text hover:bg-pl-primary/10
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
            border-pl-border text-pl-muted hover:bg-pl-sunken"
          onClick={() => onApplyZone(zone.id, {})}
        >
          Clear {zone.name} overrides
        </button>
      )}
    </div>
  );
}
