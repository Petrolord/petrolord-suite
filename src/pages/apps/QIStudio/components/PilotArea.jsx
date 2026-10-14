// Pilot sub-volume (crop before upload programme, 2026-10-14): limit an
// inversion, simultaneous inversion or AVO run to an inline and crossline
// range and a time window, to try the settings on a small area before the
// whole survey. The worker processes and writes only that sub-volume; the
// output is a derived volume labelled pilot. Inside the area it equals the
// full run, because each trace is still processed over its whole length.
// A saved Seismolord crop can fill the area.
import React, { useEffect, useState } from 'react';
import { cropDefinitions } from '@/pages/apps/Seismolord/services/cropDefinitions';

const input = 'w-20 rounded border border-pl-border bg-pl-surface px-2 py-0.5 text-xs text-pl-text';
const toNum = (v) => (String(v ?? '').trim() === '' ? null : Number(v));

export const EMPTY_PILOT = Object.freeze({ on: false, ilFrom: '', ilTo: '', xlFrom: '', xlTo: '', tFrom: '', tTo: '', cropName: '', definitionId: null });

/** Why the pilot settings cannot run, or null. */
export function pilotFormProblem(v) {
  if (!v?.on) return null;
  const pairs = [['inline', v.ilFrom, v.ilTo], ['crossline', v.xlFrom, v.xlTo], ['time', v.tFrom, v.tTo]];
  for (const [what, a, b] of pairs) {
    const x = toNum(a); const y = toNum(b);
    if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) return `Give the pilot ${what} range, from and to.`;
    if (x > y) return `The pilot ${what} range runs backwards.`;
  }
  return null;
}

/** The job's pilot block, or null when the run covers the whole volume. */
export function pilotParam(v) {
  if (!v?.on || pilotFormProblem(v)) return null;
  return {
    il: { from: toNum(v.ilFrom), to: toNum(v.ilTo) },
    xl: { from: toNum(v.xlFrom), to: toNum(v.xlTo) },
    t_ms: { from: toNum(v.tFrom), to: toNum(v.tTo) },
    ...(v.cropName ? { crop_name: v.cropName } : {}),
    ...(v.definitionId ? { definition_id: v.definitionId } : {}),
  };
}

/** "Name (pilot)" for a pilot run's output. */
export const pilotName = (name, v) => (pilotParam(v) ? `${name} (pilot)` : name);

/** One line for the run record and the report. */
export function pilotText(p) {
  if (!p) return '';
  return `Pilot${p.crop_name ? ` "${p.crop_name}"` : ''}: inlines ${p.il.from} to ${p.il.to}, crosslines ${p.xl.from} to ${p.xl.to}, ${p.t_ms.from} to ${p.t_ms.to} ms`;
}

/**
 * @param {Object} p
 * @param {Object} p.value pilot form state; @param {(v: Object) => void} p.onChange
 * @param {?Object} [p.volume] the volume (survey_meta gives the ranges as hints)
 * @param {boolean} [p.disabled]
 * @param {string} [p.testId]
 */
export default function PilotArea({ value, onChange, volume = null, disabled = false, testId = 'qi-pilot' }) {
  const v = value || EMPTY_PILOT;
  const [crops, setCrops] = useState([]);
  useEffect(() => {
    if (!v.on) return undefined;
    let live = true;
    cropDefinitions().list().then((r) => { if (live) setCrops(r.rows || []); }).catch(() => { if (live) setCrops([]); });
    return () => { live = false; };
  }, [v.on]);
  const m = volume?.survey_meta;
  const set = (k) => (e) => onChange({ ...v, [k]: e.target.value });
  const applyCrop = (id) => {
    const c = crops.find((r) => r.id === id);
    if (!c) { onChange({ ...v, cropName: '', definitionId: null }); return; }
    const d = c.definition || {};
    onChange({
      ...v,
      ilFrom: d.il?.from ?? '', ilTo: d.il?.to ?? '', xlFrom: d.xl?.from ?? '', xlTo: d.xl?.to ?? '',
      tFrom: d.window?.from ?? v.tFrom, tTo: d.window?.to ?? v.tTo, cropName: c.name, definitionId: c.id,
    });
  };
  const problem = pilotFormProblem(v);
  return (
    <div className="w-full basis-full space-y-1 text-xs text-pl-text" data-testid={testId}>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={Boolean(v.on)} onChange={(e) => onChange({ ...v, on: e.target.checked })} disabled={disabled} data-testid={`${testId}-on`} />
        Pilot run: only an area and a time window
      </label>
      {v.on && (
        <div className="space-y-1 pl-5">
          {crops.length > 0 && (
            <label className="flex items-center gap-2">
              Saved crop
              <select className="rounded border border-pl-border bg-pl-surface px-1 py-0.5 text-xs" value={v.definitionId || ''} onChange={(e) => applyCrop(e.target.value)} disabled={disabled} aria-label="Pilot from a saved crop">
                <option value="">None</option>
                {crops.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}
          <div className="flex flex-wrap items-center gap-2">
            Inlines
            <input className={input} aria-label="Pilot first inline" placeholder={m?.il ? String(m.il.min) : ''} value={v.ilFrom} onChange={set('ilFrom')} disabled={disabled} />
            to
            <input className={input} aria-label="Pilot last inline" placeholder={m?.il ? String(m.il.max) : ''} value={v.ilTo} onChange={set('ilTo')} disabled={disabled} />
            Crosslines
            <input className={input} aria-label="Pilot first crossline" placeholder={m?.xl ? String(m.xl.min) : ''} value={v.xlFrom} onChange={set('xlFrom')} disabled={disabled} />
            to
            <input className={input} aria-label="Pilot last crossline" placeholder={m?.xl ? String(m.xl.max) : ''} value={v.xlTo} onChange={set('xlTo')} disabled={disabled} />
            Time (ms)
            <input className={input} aria-label="Pilot window start" value={v.tFrom} onChange={set('tFrom')} disabled={disabled} />
            to
            <input className={input} aria-label="Pilot window end" value={v.tTo} onChange={set('tTo')} disabled={disabled} />
          </div>
          <p className="text-pl-muted">The worker processes and writes only this area; the output is named and labelled as a pilot. Inside the area it matches a full run, because every trace is still processed over its whole length.</p>
          {problem && <p className="text-pl-danger-text" data-testid={`${testId}-problem`}>{problem}</p>}
        </div>
      )}
    </div>
  );
}
