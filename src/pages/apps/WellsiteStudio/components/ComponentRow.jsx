// One component of a cuttings description (WS1): a row of typeahead
// fields in the engine ATTRIBUTES order. Typing resolves against the
// vocabulary when the field is left (Tab, Enter) and the field then shows
// the profile term; an unresolved entry keeps its text, turns amber and
// reports why. Codes are what is stored; the text is a rendering.

import React, { useEffect, useRef, useState } from 'react';
import { ATTRIBUTES } from '@/lib/wellsite/descriptionVocabulary';
import { parseField, fieldText } from '../services/describe';

/**
 * @param {Object} p
 * @param {number} p.index
 * @param {Object} p.component engine component
 * @param {(patch:Object)=>void} p.onChange
 * @param {'quick'|'full'} p.mode
 * @param {Object} p.profile merged profile
 * @param {Set<string>} [p.changed] fields changed since copy (highlight)
 * @param {(ev:KeyboardEvent, ctx:{index:number, key:string})=>boolean} [p.onKey] returns true when handled
 * @param {string} [p.focusKey] field to focus on mount / when it changes
 */
export default function ComponentRow({ index, component, onChange, mode, profile, changed, onKey, focusKey, onRemove, testIdPrefix = 'ws-desc' }) {
  const fields = ATTRIBUTES.filter((a) => (mode === 'full' ? true : a.quick));
  const [texts, setTextsState] = useState(() => Object.fromEntries(ATTRIBUTES.map((a) => [a.key, fieldText(a.key, component[a.key], profile)])));
  const [errors, setErrors] = useState({});
  const refs = useRef({});
  // the latest texts, readable synchronously: a blur fired by a programmatic focus change must
  // not commit stale text over codes that arrived from outside (Copy previous)
  const textsRef = useRef(texts);
  const setTexts = (updater) => { const next = typeof updater === 'function' ? updater(textsRef.current) : updater; textsRef.current = next; setTextsState(next); };

  // stored codes changed from outside (copy previous, mode switch): re-render the texts
  useEffect(() => {
    setTexts(Object.fromEntries(ATTRIBUTES.map((a) => [a.key, fieldText(a.key, component[a.key], profile)])));
    setErrors({});
  }, [component, profile]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (focusKey && refs.current[focusKey]) refs.current[focusKey].focus(); }, [focusKey]);

  const commit = (key) => {
    const r = parseField(key, textsRef.current[key]);
    if (r.ok) {
      setErrors((e) => ({ ...e, [key]: null }));
      if (JSON.stringify(r.value) !== JSON.stringify(component[key] ?? (ATTRIBUTES.find((a) => a.key === key).multi ? [] : null))) onChange({ [key]: r.value });
      setTexts((t) => ({ ...t, [key]: fieldText(key, r.value, profile) }));
    } else {
      setErrors((e) => ({ ...e, [key]: r.error }));
    }
  };

  const keyDown = (ev, key) => {
    if (onKey && onKey(ev, { index, key })) { ev.preventDefault(); return; }
    if (ev.key === 'Enter') { ev.preventDefault(); commit(key); const i = fields.findIndex((f) => f.key === key); const next = fields[i + 1]; if (next && refs.current[next.key]) refs.current[next.key].focus(); }
  };

  const firstError = Object.values(errors).find(Boolean);
  return (
    <div className={`rounded border px-2 py-1.5 ${changed && changed.size ? 'border-cyan-700/60' : 'border-slate-800'} bg-slate-900/40`} data-testid={`${testIdPrefix}-comp-${index}`}>
      <div className="flex items-end gap-2 flex-wrap">
        <span className="text-[10px] text-slate-500 w-4">{index + 1}</span>
        {fields.map((a) => (
          <label key={a.key} className="text-[10px] text-slate-400">
            {a.label}
            <input
              ref={(el) => { refs.current[a.key] = el; }}
              value={texts[a.key] ?? ''}
              placeholder={a.key === 'percent' ? '%' : a.multi ? 'a, b' : ''}
              onChange={(e) => setTexts((t) => ({ ...t, [a.key]: e.target.value }))}
              onBlur={() => commit(a.key)}
              onKeyDown={(e) => keyDown(e, a.key)}
              data-testid={`${testIdPrefix}-comp-${index}-${a.key}`}
              data-changed={changed && changed.has(a.key) ? '1' : undefined}
              className={`block bg-slate-950 border rounded px-1.5 py-0.5 text-xs text-slate-100 ${errors[a.key] ? 'border-amber-500' : changed && changed.has(a.key) ? 'border-cyan-500/70' : 'border-slate-700'} ${a.key === 'percent' ? 'w-14' : a.multi ? 'w-40' : 'w-24'}`}
            />
          </label>
        ))}
        {onRemove && (
          <button type="button" className="text-[11px] text-slate-500 hover:text-red-400 pb-1" onClick={onRemove} data-testid={`${testIdPrefix}-comp-${index}-remove`} title="Remove this component (Ctrl+Backspace on an empty lithology)">remove</button>
        )}
      </div>
      {firstError && <div className="text-[11px] text-amber-400 mt-1" data-testid={`${testIdPrefix}-comp-${index}-error`}>{firstError}</div>}
    </div>
  );
}
