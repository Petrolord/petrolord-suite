// Interpretation parameters (Petrophysics Studio G2.3). Everything the
// pipeline applies is visible here — no silent constants (the plan's
// formula-parameter footgun defense). Draft-and-apply: edits stage
// locally and hit the pipeline on Apply, so half-typed numbers never
// compute.

import React, { useEffect, useState } from 'react';

const num = (v) => (v === '' || v === '-' ? NaN : Number(v));
const inputCls = 'w-full rounded bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-0.5 text-xs';
const selCls = inputCls;

const FIELDS = [
  { section: 'Vsh (GR)' },
  { key: 'grClean', label: 'GR clean (API)' },
  { key: 'grClay', label: 'GR clay (API)' },
  { key: 'vshMethod', label: 'Model', options: ['linear', 'larionov-tertiary', 'larionov-older', 'clavier', 'steiber'] },
  { section: 'Porosity' },
  { key: 'phiSource', label: 'φe source', options: ['density', 'sonic', 'nd'] },
  { key: 'rhoMa', label: 'ρ matrix (g/cc)' },
  { key: 'rhoFl', label: 'ρ fluid (g/cc)' },
  { key: 'dtMa', label: 'Δt matrix (µs/m)' },
  { key: 'dtFl', label: 'Δt fluid (µs/m)' },
  { key: 'sonicMethod', label: 'Sonic model', options: ['wyllie', 'rhg'] },
  { key: 'ndMethod', label: 'N-D combine', options: ['avg', 'rms'] },
  { section: 'Sw' },
  { key: 'swMethod', label: 'Model', options: ['archie', 'simandoux', 'indonesia'] },
  { key: 'a', label: 'a' },
  { key: 'm', label: 'm' },
  { key: 'n', label: 'n' },
  { key: 'rw', label: 'Rw @ FT (ohm·m)' },
  { key: 'rsh', label: 'Rsh (ohm·m)' },
  { section: 'Cutoffs' },
  { key: 'cutPhi', label: 'φ ≥' },
  { key: 'cutVsh', label: 'Vsh ≤' },
  { key: 'cutSw', label: 'Sw ≤' },
];

export default function ParameterPanel({ params, onApply }) {
  const [draft, setDraft] = useState(params);
  useEffect(() => setDraft(params), [params]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(params);

  const apply = () => {
    for (const f of FIELDS) {
      if (f.key && !f.options && !Number.isFinite(num(String(draft[f.key])))) {
        return; // incomplete number — Apply stays disabled anyway
      }
    }
    const next = { ...draft };
    for (const f of FIELDS) if (f.key && !f.options) next[f.key] = num(String(next[f.key]));
    onApply(next);
  };

  const invalid = FIELDS.some((f) => f.key && !f.options && !Number.isFinite(num(String(draft[f.key]))));

  return (
    <div className="p-2 space-y-1 text-xs" data-testid="petro-params">
      {FIELDS.map((f, i) => (f.section ? (
        <div key={f.section} className={`text-[10px] uppercase tracking-wider text-slate-500 ${i ? 'pt-2' : ''}`}>
          {f.section}
        </div>
      ) : (
        <label key={f.key} className="flex items-center gap-2">
          <span className="w-28 shrink-0 text-slate-400">{f.label}</span>
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
        Apply parameters
      </button>
    </div>
  );
}
