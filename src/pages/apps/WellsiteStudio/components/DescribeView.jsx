// The cuttings description screen (WS1, spec sections 17 to 19). Quick
// and full modes over the same components, keyboard first: Tab and Enter
// move through the vocabulary fields, Ctrl+Enter adds a component,
// Ctrl+D copies the previous description (describe by exception, changed
// fields highlighted), Alt+n jumps to component n, F2 toggles the mode,
// Ctrl+S saves, Escape discards. The abbreviation string and the
// narrative update live and are read-only: the structured record is
// what is stored.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import DepthEntry from './DepthEntry';
import ComponentRow from './ComponentRow';
import { emptyComponent, validateDescription, copyPrevious, diffDescriptions, abbreviate, narrative, mergeProfile, DESCRIPTION_SUBTYPE, descriptionPayload, descriptionOf, percentSum } from '../services/describe';
import { validateProfile } from '@/lib/wellsite/abbreviations';
import { fmtDepth, depthToDisplay } from '../services/units';
import { toRigLocal } from '@/lib/wellsite/time';

const MODE_KEY = 'ws.describe.mode';
const readMode = () => { try { return localStorage.getItem(MODE_KEY) === 'full' ? 'full' : 'quick'; } catch { return 'quick'; } };

export default function DescribeView({ backend, well, ctx, descriptions, defaults, unit, offsetMin, onChanged, onStatus }) {
  const profile = useMemo(() => {
    const op = well.settings && well.settings.abbreviation_profile;
    return op && validateProfile(op).length === 0 ? mergeProfile(op) : mergeProfile(null);
  }, [well]);
  const previous = descriptions.length ? descriptions[descriptions.length - 1] : null;
  const prevDesc = previous ? descriptionOf(previous) : null;
  const intervalM = (well.settings && well.settings.sample_interval_m) || (defaults.unit === 'ft' ? 10 * 0.3048 : 3);

  const nextTop = () => (prevDesc ? depthToDisplay(prevDesc.mdBaseM, defaults.unit) : NaN);
  const [mode, setMode] = useState(readMode);
  const [top, setTop] = useState(() => ({ value: nextTop(), unit: defaults.unit, reference: 'MD', datum: 'KB' }));
  const [base, setBase] = useState(() => ({ value: Number.isFinite(nextTop()) ? nextTop() + depthToDisplay(intervalM, defaults.unit) : NaN, unit: defaults.unit, reference: 'MD', datum: 'KB' }));
  const [components, setComponents] = useState(() => [emptyComponent()]);
  const [comment, setComment] = useState('');
  const [copiedFrom, setCopiedFrom] = useState(null);
  const [focus, setFocus] = useState({ index: 0, key: 'lithology', n: 0 });
  const [saveError, setSaveError] = useState(null);

  // the previous description's stored depths are metres below KB: entries default to KB in the well's unit
  useEffect(() => {
    if (!Number.isFinite(top.value) && prevDesc) {
      const t = depthToDisplay(prevDesc.mdBaseM, defaults.unit);
      setTop((v) => ({ ...v, value: t }));
      setBase((v) => ({ ...v, value: t + depthToDisplay(intervalM, defaults.unit) }));
    }
  }, [prevDesc, defaults.unit, intervalM]); // eslint-disable-line react-hooks/exhaustive-deps

  const draft = useMemo(() => ({ components, comment }), [components, comment]);
  const validation = validateDescription(draft);
  const abbrev = useMemo(() => abbreviate(draft, profile), [draft, profile]);
  const narr = useMemo(() => narrative(draft), [draft]);
  const changed = useMemo(() => {
    if (!copiedFrom || !prevDesc) return [];
    return diffDescriptions(prevDesc, draft);
  }, [copiedFrom, prevDesc, draft]);
  const changedByComponent = useMemo(() => {
    const m = new Map();
    for (const d of changed) { if (!m.has(d.componentIndex)) m.set(d.componentIndex, new Set()); m.get(d.componentIndex).add(d.field); }
    return m;
  }, [changed]);
  const sum = percentSum(components);

  const setMode2 = (m) => { setMode(m); try { localStorage.setItem(MODE_KEY, m); } catch { /* no storage */ } };
  const updateComponent = (i, patch) => setComponents((cs) => cs.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  const addComponent = useCallback(() => {
    setComponents((cs) => [...cs, emptyComponent()]);
    setFocus((f) => ({ index: components.length, key: 'lithology', n: f.n + 1 }));
  }, [components.length]);
  const removeComponent = (i) => setComponents((cs) => (cs.length > 1 ? cs.filter((_, k) => k !== i) : cs));

  const doCopyPrevious = useCallback(() => {
    if (!prevDesc) { onStatus?.('There is no previous description on this well to copy.'); return; }
    const next = copyPrevious(prevDesc);
    setComponents(next.components);
    setComment('');
    setCopiedFrom(prevDesc.id);
    setMode2(prevDesc.mode === 'full' ? 'full' : mode);
    setFocus((f) => ({ index: 0, key: 'percent', n: f.n + 1 }));
    onStatus?.('Previous description copied; change only what differs.');
  }, [prevDesc, mode, onStatus]);

  const reset = useCallback(() => {
    const t = prevDesc ? depthToDisplay(prevDesc.mdBaseM, defaults.unit) : NaN;
    setTop({ value: t, unit: defaults.unit, reference: 'MD', datum: 'KB' });
    setBase({ value: Number.isFinite(t) ? t + depthToDisplay(intervalM, defaults.unit) : NaN, unit: defaults.unit, reference: 'MD', datum: 'KB' });
    setComponents([emptyComponent()]);
    setComment('');
    setCopiedFrom(null);
    setSaveError(null);
    setFocus((f) => ({ index: 0, key: 'lithology', n: f.n + 1 }));
  }, [prevDesc, defaults.unit, intervalM]);

  const save = useCallback(async () => {
    const v = validateDescription(draft);
    if (!v.ok) { setSaveError(v.errors[0]); onStatus?.(v.errors[0]); return; }
    try {
      const { row, warnings } = await backend.addRecord(well.id, {
        kind: 'observation', subtype: DESCRIPTION_SUBTYPE,
        depth: { ...top, kind: 'lagged_sample' }, depth2: { ...base, kind: 'lagged_sample' },
        payload: descriptionPayload({ components, comment, mode, copiedFrom, changedFields: changed, profileId: profile.id }),
      });
      setSaveError(null);
      onStatus?.(warnings.length ? warnings[0] : `Description saved for ${fmtDepth(row.md_calc_m, unit)} to ${fmtDepth(row.md2_calc_m, unit)}.`);
      onChanged?.();
      // next interval starts where this one ended
      const t = depthToDisplay(row.md2_calc_m, defaults.unit);
      setTop({ value: t, unit: defaults.unit, reference: 'MD', datum: 'KB' });
      setBase({ value: t + depthToDisplay(intervalM, defaults.unit), unit: defaults.unit, reference: 'MD', datum: 'KB' });
      setComponents([emptyComponent()]);
      setComment('');
      setCopiedFrom(null);
      setFocus((f) => ({ index: 0, key: 'lithology', n: f.n + 1 }));
    } catch (e) { setSaveError(e.message); onStatus?.(e.message); }
  }, [draft, backend, well.id, top, base, components, comment, mode, copiedFrom, changed, profile.id, onStatus, onChanged, unit, defaults.unit, intervalM]);

  // screen-level keys (only while the pointer is inside this view)
  const onKey = useCallback((ev, where) => {
    if (ev.ctrlKey && ev.key === 'Enter') { addComponent(); return true; }
    if (ev.ctrlKey && (ev.key === 'd' || ev.key === 'D')) { doCopyPrevious(); return true; }
    if (ev.ctrlKey && (ev.key === 's' || ev.key === 'S')) { save(); return true; }
    if (ev.key === 'F2') { setMode2(mode === 'quick' ? 'full' : 'quick'); return true; }
    if (ev.key === 'Escape') { reset(); return true; }
    if (ev.altKey && /^[1-9]$/.test(ev.key)) { const i = Number(ev.key) - 1; if (i < components.length) setFocus((f) => ({ index: i, key: 'lithology', n: f.n + 1 })); return true; }
    if (ev.altKey && (ev.key === 'p' || ev.key === 'P')) { setFocus((f) => ({ index: where ? where.index : 0, key: 'percent', n: f.n + 1 })); return true; }
    if (ev.ctrlKey && ev.key === 'Backspace' && where && where.key === 'lithology' && !components[where.index].lithology && components.length > 1) { removeComponent(where.index); return true; }
    return false;
  }, [addComponent, doCopyPrevious, save, mode, reset, components]);

  const local = (iso) => toRigLocal(Date.parse(iso), offsetMin).hhmm;

  return (
    <div className="p-4 space-y-4" data-testid="ws-describe" onKeyDown={(e) => { if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA' && onKey(e, null)) e.preventDefault(); }}>
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-slate-100">Describe cuttings</h2>
        <div className="flex items-center gap-1 text-[11px]">
          {['quick', 'full'].map((m) => (
            <button key={m} type="button" data-testid={`ws-desc-mode-${m}`} onClick={() => setMode2(m)} className={`px-2 py-0.5 rounded border ${mode === m ? 'border-cyan-500/60 text-cyan-300' : 'border-slate-700 text-slate-400'}`}>{m}</button>
          ))}
          <span className="text-slate-500 ml-2">F2 mode, Tab or Enter next field, Ctrl+Enter add component, Ctrl+D copy previous, Alt+n component n, Ctrl+S save, Esc discard</span>
        </div>
      </div>
      <div className="flex items-start gap-6 flex-wrap">
        <div><div className="text-[10px] text-slate-500">Top</div><DepthEntry value={top} onChange={setTop} kind="lagged_sample" ctx={ctx} compact testIdPrefix="ws-desc-top" /></div>
        <div><div className="text-[10px] text-slate-500">Base</div><DepthEntry value={base} onChange={setBase} kind="lagged_sample" ctx={ctx} compact testIdPrefix="ws-desc-base" /></div>
        <div className="pt-3">
          <Button size="sm" variant="outline" onClick={doCopyPrevious} disabled={!prevDesc} data-testid="ws-desc-copy-prev" title="Ctrl+D">Copy previous</Button>
        </div>
      </div>
      <div className="space-y-1.5">
        {components.map((c, i) => (
          <ComponentRow key={i} index={i} component={c} mode={mode} profile={profile} changed={changedByComponent.get(i)}
            onChange={(patch) => updateComponent(i, patch)} onKey={onKey} onRemove={components.length > 1 ? () => removeComponent(i) : null}
            focusKey={focus.index === i ? `${focus.key}#${focus.n}`.split('#')[0] : null} />
        ))}
        <div className="flex items-center gap-3">
          <Button size="sm" variant="outline" onClick={addComponent} data-testid="ws-desc-add" title="Ctrl+Enter">Add component</Button>
          <span className={`text-[11px] ${Math.abs(sum - 100) <= 5 ? 'text-slate-400' : 'text-amber-400'}`} data-testid="ws-desc-sum">{sum}% of 100</span>
        </div>
      </div>
      <label className="block text-[11px] text-slate-400">Comment
        <input value={comment} onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => { if (onKey(e, null)) e.preventDefault(); }} data-testid="ws-desc-comment" className="block w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100" />
      </label>
      <div className="rounded border border-slate-800 bg-slate-900/60 p-2 space-y-1">
        <div className="text-[10px] uppercase tracking-wide text-slate-500">{profile.name} abbreviation</div>
        <div className="text-xs text-cyan-200 font-mono" data-testid="ws-desc-abbrev">{abbrev.text || ''}</div>
        {abbrev.fallbacks.length > 0 && <div className="text-[10px] text-amber-400" data-testid="ws-desc-fallbacks">{abbrev.fallbacks.length} term(s) shown from the Petrolord default because the operator profile has no entry.</div>}
        <div className="text-[10px] uppercase tracking-wide text-slate-500 pt-1">Narrative</div>
        <div className="text-xs text-slate-300" data-testid="ws-desc-narrative">{narr.text}</div>
      </div>
      {(saveError || (!validation.ok && components.some((c) => c.lithology))) && <div className="text-[11px] text-amber-400" data-testid="ws-desc-error">{saveError || validation.errors[0]}</div>}
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={save} data-testid="ws-desc-save" title="Ctrl+S">Save description</Button>
        <Button size="sm" variant="ghost" onClick={reset} data-testid="ws-desc-discard" title="Esc">Discard</Button>
        {copiedFrom && <span className="text-[11px] text-slate-500" data-testid="ws-desc-copied">copied from the previous description, {changed.length} field(s) changed</span>}
      </div>
      <section>
        <h3 className="text-xs font-semibold text-slate-200 mb-1">Recent descriptions</h3>
        <table className="text-xs text-slate-300 w-full">
          <tbody>
            {[...descriptions].reverse().slice(0, 12).map((d) => (
              <tr key={d.id} data-testid={`ws-desc-row-${d.id}`} className="align-top">
                <td className="pr-3 whitespace-nowrap text-slate-500">{local(d.occurred_at)}</td>
                <td className="pr-3 whitespace-nowrap">{fmtDepth(d.md_calc_m, unit)} to {fmtDepth(d.md2_calc_m, unit)}</td>
                <td className="font-mono text-cyan-200/80">{abbreviate(descriptionOf(d), profile).text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
