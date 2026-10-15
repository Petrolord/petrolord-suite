// Crop before upload (owner-approved 2026-10-14): the import dialog's crop
// step, shown once the header scan has measured the geometry. The user keeps
// an inline and crossline area (typed, drawn as a rectangle or a polygon on
// the survey outline) and a time window, sees the kept trace count, the
// cropped size against the original and the upload time, and can save the
// crop by name so every volume of a study is cut to exactly the same area.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Crop, Save, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { normalizeCrop } from '../engine/segyCrop';
import { cropEstimate, uploadSeconds, formatDuration } from '../services/cropImport';
import { cropDefinitions, velocityPreset } from '../services/cropDefinitions';

const fmtGb = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : `${(b / 1e6).toFixed(1)} MB`);
const fmtInt = (v) => Number(v).toLocaleString('en-US');
const box = 'rounded-lg border border-pl-border bg-pl-sunken/60 p-4 space-y-3';
const num = 'w-24 rounded border border-pl-border-strong bg-pl-surface px-2 py-1 text-sm text-pl-text';
const toNum = (v) => (v === '' || v == null ? null : Number(v));

/** The user's crop as typed, turned into a definition for normalizeCrop. */
export function defFromForm(form) {
  const r = (a, b) => (toNum(a) == null && toNum(b) == null ? null : { from: toNum(a), to: toNum(b) });
  return {
    name: form.name || '',
    il: r(form.ilFrom, form.ilTo),
    xl: r(form.xlFrom, form.xlTo),
    polygon: form.polygon?.length >= 3 ? form.polygon : null,
    window: r(form.tFrom, form.tTo),
    startAtZero: Boolean(form.startAtZero),
    decimate: { il: Number(form.decIl) || 1, xl: Number(form.decXl) || 1 },
  };
}

/** A saved definition back into the form. */
export function formFromDefinition(name, d, { velocity = false } = {}) {
  const v = velocity ? velocityPreset(d) : d;
  return {
    name,
    ilFrom: v.il?.from ?? '', ilTo: v.il?.to ?? '',
    xlFrom: v.xl?.from ?? '', xlTo: v.xl?.to ?? '',
    polygon: v.polygon || [],
    tFrom: v.window?.from ?? '', tTo: v.window?.to ?? '',
    startAtZero: Boolean(v.startAtZero),
    decIl: v.decimate?.il || 1, decXl: v.decimate?.xl || 1,
  };
}

export const EMPTY_FORM = Object.freeze({
  name: '', ilFrom: '', ilTo: '', xlFrom: '', xlTo: '', polygon: [], tFrom: '', tTo: '', startAtZero: false, decIl: 1, decXl: 1,
});

/** The survey outline in inline and crossline numbers; drag a rectangle or click polygon corners. */
function Outline({ scan, crop, mode, onRect, onPoint, polygon, disabled }) {
  const W = 260; const H = 190; const pad = 18;
  const { il, xl } = scan;
  const ilMax = il.max ?? il.min + (il.count - 1) * il.step;
  const xlMax = xl.max ?? xl.min + (xl.count - 1) * xl.step;
  const sx = (v) => pad + ((v - xl.min) / Math.max(1, xlMax - xl.min)) * (W - 2 * pad);
  const sy = (v) => H - pad - ((v - il.min) / Math.max(1, ilMax - il.min)) * (H - 2 * pad);
  const inv = (px, py) => ({
    xl: Math.round(xl.min + ((px - pad) / (W - 2 * pad)) * (xlMax - xl.min)),
    il: Math.round(il.min + ((H - pad - py) / (H - 2 * pad)) * (ilMax - il.min)),
  });
  const drag = useRef(null);
  const [live, setLive] = useState(null);
  const pt = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  };
  const clampIl = (v) => Math.min(ilMax, Math.max(il.min, v));
  const clampXl = (v) => Math.min(xlMax, Math.max(xl.min, v));
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[320px] bg-pl-surface rounded border border-pl-border touch-none select-none"
      role="img" aria-label="Survey outline: drag to draw the crop" data-testid="sl-crop-outline"
      onPointerDown={(e) => {
        if (disabled) return;
        const [x, y] = pt(e);
        if (mode === 'polygon') { const p = inv(x, y); onPoint([clampIl(p.il), clampXl(p.xl)]); return; }
        drag.current = [x, y]; setLive([x, y, x, y]);
      }}
      onPointerMove={(e) => { if (drag.current) { const [x, y] = pt(e); setLive([drag.current[0], drag.current[1], x, y]); } }}
      onPointerUp={(e) => {
        if (!drag.current) return;
        const [x, y] = pt(e);
        const a = inv(drag.current[0], drag.current[1]); const b = inv(x, y);
        drag.current = null; setLive(null);
        if (Math.abs(a.il - b.il) < 1 && Math.abs(a.xl - b.xl) < 1) return;
        onRect({
          ilFrom: clampIl(Math.min(a.il, b.il)), ilTo: clampIl(Math.max(a.il, b.il)),
          xlFrom: clampXl(Math.min(a.xl, b.xl)), xlTo: clampXl(Math.max(a.xl, b.xl)),
        });
      }}
    >
      <rect x={pad} y={pad} width={W - 2 * pad} height={H - 2 * pad} fill="none" stroke="currentColor" className="text-pl-muted" strokeDasharray="3 2" />
      <text x={pad} y={H - 4} fontSize="8" className="fill-pl-muted">XL {xl.min}</text>
      <text x={W - pad} y={H - 4} fontSize="8" textAnchor="end" className="fill-pl-muted">{xlMax}</text>
      <text x={2} y={H - pad} fontSize="8" className="fill-pl-muted">IL {il.min}</text>
      <text x={2} y={pad + 6} fontSize="8" className="fill-pl-muted">{ilMax}</text>
      {crop && !crop.polygon && (
        <rect
          x={sx(crop.xl.from)} y={sy(crop.il.to)} width={Math.max(1, sx(crop.xl.to) - sx(crop.xl.from))} height={Math.max(1, sy(crop.il.from) - sy(crop.il.to))}
          className="fill-pl-primary/20 stroke-pl-primary" strokeWidth="1.5"
        />
      )}
      {polygon?.length > 0 && (
        <polygon points={polygon.map(([a, b]) => `${sx(b)},${sy(a)}`).join(' ')} className="fill-pl-primary/20 stroke-pl-primary" strokeWidth="1.5" />
      )}
      {live && <rect x={Math.min(live[0], live[2])} y={Math.min(live[1], live[3])} width={Math.abs(live[2] - live[0])} height={Math.abs(live[3] - live[1])} fill="none" className="stroke-pl-primary" strokeDasharray="2 2" />}
    </svg>
  );
}

/**
 * @param {Object} p
 * @param {Object} p.scan the import scan
 * @param {?Object} p.door {ns, dtUs, sampleBytes, dataStart} when the file is local
 * @param {number} p.fileSize
 * @param {'time'|'depth'} p.domain
 * @param {boolean} p.enabled crop on or off
 * @param {(on: boolean) => void} p.onEnabled
 * @param {Object} p.form the form state; @param {(f: Object|Function) => void} p.onForm a state setter (takes an updater too)
 * @param {(id: ?string) => void} [p.onDefinitionId]
 * @param {boolean} [p.showUpload] the file is uploaded as SEG-Y (server import)
 * @param {?number} p.speed MB/s for the estimate; @param {(v: number) => void} p.onSpeed
 * @param {?Object} [p.gathers] detectGatherLayout result
 * @param {boolean} [p.disabled]
 * @param {?string} [p.status] a line under the summary (finding the kept traces...)
 * @param {number} [p.t0Ms] the time of the file's first sample when the import honours its trace delay (F-5)
 */
export default function CropPanel({
  scan, door, fileSize, domain, enabled, onEnabled, form, onForm, onDefinitionId = () => {},
  showUpload, speed, onSpeed, gathers = null, disabled, status = null, t0Ms = 0,
}) {
  const [saved, setSaved] = useState({ rows: [], saved: true });
  const [chosen, setChosen] = useState('');
  const [velocity, setVelocity] = useState(false);
  const [shareOrg, setShareOrg] = useState(false);
  const [mode, setMode] = useState('rect');
  const [msg, setMsg] = useState(null);
  const [busySave, setBusySave] = useState(false);
  const unit = domain === 'depth' ? (scan.measurementSystem === 2 ? 'ft' : 'm') : 'ms';
  const dtUs = door?.dtUs || scan.dtUs;
  const ns = door?.ns || scan.ns;

  const refresh = () => cropDefinitions().list().then(setSaved).catch((e) => setMsg(e.message));
  useEffect(() => { if (enabled) refresh(); }, [enabled]);

  const def = defFromForm(form);
  const { crop, error } = useMemo(() => {
    try { return { crop: normalizeCrop(def, { il: scan.il, xl: scan.xl, ns, dtUs, t0Ms }), error: null }; } catch (e) { return { crop: null, error: e.message }; }
  }, [JSON.stringify(def), scan, ns, dtUs, t0Ms]); // eslint-disable-line react-hooks/exhaustive-deps
  const est = useMemo(() => (crop ? cropEstimate({ crop, scan, door, fileSize, gathers }) : null), [crop, scan, door, fileSize, gathers]);

  const pick = (id) => {
    setChosen(id);
    onDefinitionId(id || null);
    const row = saved.rows.find((r) => r.id === id);
    if (row) onForm(formFromDefinition(row.name, row.definition, { velocity }));
  };
  const toggleVelocity = (on) => {
    setVelocity(on);
    const row = saved.rows.find((r) => r.id === chosen);
    if (row) onForm(formFromDefinition(row.name, row.definition, { velocity: on }));
    else onForm({ ...form, startAtZero: on, tFrom: on ? 0 : form.tFrom });
  };
  const save = async () => {
    setBusySave(true); setMsg(null);
    try {
      const own = saved.rows.find((r) => r.id === chosen && r.is_own && r.name === form.name.trim());
      const row = await cropDefinitions().save({ id: own?.id || null, name: form.name, definition: { ...def, startAtZero: false, domain }, shared: shareOrg });
      await refresh();
      setChosen(row.id); onDefinitionId(row.id);
      setMsg(row.local ? `Saved "${row.name}" in this browser. Saving crops to your account is not switched on yet.` : `Saved "${row.name}".`);
    } catch (e) { setMsg(e.message); } finally { setBusySave(false); }
  };
  const remove = async () => {
    const row = saved.rows.find((r) => r.id === chosen);
    if (!row || !window.confirm(`Delete the saved crop "${row.name}"? Volumes already cropped with it keep their record.`)) return;
    try { await cropDefinitions().remove(row.id); setChosen(''); onDefinitionId(null); await refresh(); } catch (e) { setMsg(e.message); }
  };
  const set = (k) => (e) => onForm({ ...form, [k]: e.target.value });
  const chosenRow = saved.rows.find((r) => r.id === chosen);

  return (
    <div className={box} data-testid="sl-crop">
      <label className="flex items-center gap-2 text-sm text-pl-text">
        <input type="checkbox" checked={enabled} onChange={(e) => onEnabled(e.target.checked)} disabled={disabled} data-testid="sl-crop-on" />
        <Crop className="w-4 h-4 text-pl-primary-text" />
        Crop before importing: keep only an area and a time window
      </label>
      {!enabled && (
        <p className="text-xs text-pl-muted">
          The crop is made while this computer reads the file, so only the kept traces and samples are uploaded and stored.
          Use it for large files and slow connections.
        </p>
      )}
      {enabled && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2 text-sm">
            <div>
              <Label className="text-pl-text text-xs">Saved crop</Label>
              <select
                className="block mt-1 rounded border border-pl-border-strong bg-pl-surface p-1.5 text-sm text-pl-text min-w-[12rem]"
                value={chosen} onChange={(e) => pick(e.target.value)} disabled={disabled} aria-label="Saved crop" data-testid="sl-crop-saved"
              >
                <option value="">None (typed below)</option>
                {saved.rows.map((r) => <option key={r.id} value={r.id}>{r.name}{r.is_own ? '' : ' (shared)'}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-xs text-pl-text pb-1.5" title="Velocity volumes keep the same area from 0 ms, because depth conversion and the low-frequency model need the overburden">
              <input type="checkbox" checked={velocity} onChange={(e) => toggleVelocity(e.target.checked)} disabled={disabled} data-testid="sl-crop-velocity" />
              Velocity volume: same area, from 0 {unit}
            </label>
            {chosenRow?.is_own && (
              <Button size="sm" variant="outline" onClick={remove} disabled={disabled}><Trash2 className="w-3.5 h-3.5 mr-1" />Delete</Button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
            <div className="space-y-2 text-sm text-pl-text">
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-20">Inlines</span>
                <input className={num} inputMode="numeric" aria-label="First inline" placeholder={String(scan.il.min)} value={form.ilFrom} onChange={set('ilFrom')} disabled={disabled} />
                <span>to</span>
                <input className={num} inputMode="numeric" aria-label="Last inline" placeholder={String(scan.il.max)} value={form.ilTo} onChange={set('ilTo')} disabled={disabled} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-20">Crosslines</span>
                <input className={num} inputMode="numeric" aria-label="First crossline" placeholder={String(scan.xl.min)} value={form.xlFrom} onChange={set('xlFrom')} disabled={disabled} />
                <span>to</span>
                <input className={num} inputMode="numeric" aria-label="Last crossline" placeholder={String(scan.xl.max)} value={form.xlTo} onChange={set('xlTo')} disabled={disabled} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-20">{domain === 'depth' ? `Depth (${unit})` : 'Time (ms)'}</span>
                <input className={num} inputMode="decimal" aria-label="Window start" placeholder={String(t0Ms)} value={form.tFrom} onChange={set('tFrom')} disabled={disabled || form.startAtZero} />
                <span>to</span>
                <input className={num} inputMode="decimal" aria-label="Window end" placeholder={String(t0Ms + ((ns - 1) * dtUs) / 1000)} value={form.tTo} onChange={set('tTo')} disabled={disabled} />
              </div>
              <details className="text-xs text-pl-muted">
                <summary className="cursor-pointer">Thin out traces (off; for quick looks only)</summary>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-pl-text">
                  Keep every
                  <select aria-label="Inline decimation" className="rounded border border-pl-border bg-pl-surface p-1" value={form.decIl} onChange={set('decIl')} disabled={disabled}>
                    {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n === 1 ? 'inline' : `${n}th inline`}</option>)}
                  </select>
                  and every
                  <select aria-label="Crossline decimation" className="rounded border border-pl-border bg-pl-surface p-1" value={form.decXl} onChange={set('decXl')} disabled={disabled}>
                    {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n === 1 ? 'crossline' : `${n}th crossline`}</option>)}
                  </select>
                  <span className="block w-full text-pl-muted">QI work keeps every trace, so leave this at every inline and crossline for inversion, AVO and well ties.</span>
                </div>
              </details>
            </div>
            <div className="space-y-1">
              <div className="flex gap-1 text-xs" role="tablist" aria-label="Draw the crop as">
                {[['rect', 'Rectangle'], ['polygon', 'Polygon']].map(([k, l]) => (
                  <button key={k} type="button" role="tab" aria-selected={mode === k} disabled={disabled}
                    className={`px-2 py-0.5 rounded border ${mode === k ? 'border-pl-primary text-pl-primary-text' : 'border-pl-border text-pl-muted'}`}
                    onClick={() => setMode(k)}>{l}</button>
                ))}
                {form.polygon?.length > 0 && (
                  <button type="button" className="px-2 py-0.5 rounded border border-pl-border text-pl-muted" onClick={() => onForm({ ...form, polygon: [] })} disabled={disabled}>Clear polygon</button>
                )}
              </div>
              <Outline
                scan={scan} crop={crop} mode={mode} polygon={form.polygon} disabled={disabled}
                onRect={(r) => onForm({ ...form, ...r, polygon: [] })}
                onPoint={(pt) => onForm((f) => ({ ...f, polygon: [...(f.polygon || []), pt], ilFrom: '', ilTo: '', xlFrom: '', xlTo: '' }))}
              />
              <p className="text-xs text-pl-muted">{mode === 'polygon' ? 'Click the corners; three or more make the area.' : 'Drag across the outline to draw the area.'}</p>
            </div>
          </div>

          {error && <p className="text-sm text-pl-danger-text" data-testid="sl-crop-error">{error}</p>}
          {crop && est && (
            <div className="text-sm text-pl-text space-y-1" data-testid="sl-crop-summary">
              <div>
                Keeps {est.approximate ? 'about ' : ''}<b>{fmtInt(est.keptTraces)}</b> of {fmtInt(est.totalTraces)} traces
                {gathers?.gathers ? ' (prestack gathers: every trace of each kept location)' : ''},
                {' '}inlines {crop.il.from} to {crop.il.to}, crosslines {crop.xl.from} to {crop.xl.to}
                {crop.polygon ? ' inside the polygon' : ''}, {crop.window.from} to {crop.window.to} {unit} ({fmtInt(crop.samples.count)} of {fmtInt(ns)} samples).
              </div>
              <div>
                Size: <b>{fmtGb(est.croppedBytes)}</b> of {fmtGb(est.originalBytes)} ({(100 * est.share).toFixed(1)} percent).
              </div>
              {showUpload && (
                <div className="flex flex-wrap items-center gap-2">
                  Upload at
                  <input
                    className={`${num} w-20`} inputMode="decimal" aria-label="Upload speed in MB per second"
                    value={speed ?? ''} placeholder="1.0" onChange={(e) => onSpeed(Number(e.target.value) || null)} disabled={disabled}
                  />
                  MB/s: about <b data-testid="sl-crop-eta">{formatDuration(uploadSeconds(est.croppedBytes, speed || 1))}</b>
                  <span className="text-pl-muted">(the whole file: {formatDuration(uploadSeconds(est.originalBytes, speed || 1))})</span>
                </div>
              )}
              {crop.notes.map((n) => <div key={n} className="text-xs text-pl-muted">{n}</div>)}
              {crop.window.from > 0 && domain !== 'depth' && (
                <div className="text-xs text-pl-muted">The volume keeps its 0 ms origin: the samples above {crop.window.from} ms show as empty, so horizons, wells and ties line up with uncropped volumes.</div>
              )}
              {status && <div className="flex items-center text-xs text-pl-muted"><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />{status}</div>}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <input
              className="rounded border border-pl-border-strong bg-pl-surface px-2 py-1 text-sm text-pl-text" aria-label="Crop name"
              placeholder="Name this crop to reuse it" value={form.name} onChange={set('name')} disabled={disabled} maxLength={120}
            />
            <label className="flex items-center gap-1 text-xs text-pl-text">
              <input type="checkbox" checked={shareOrg} onChange={(e) => setShareOrg(e.target.checked)} disabled={disabled} />
              Share with my organisation
            </label>
            <Button size="sm" variant="outline" onClick={save} disabled={disabled || busySave || !crop || !form.name.trim()} data-testid="sl-crop-save">
              <Save className="w-3.5 h-3.5 mr-1" />Save crop
            </Button>
          </div>
          {msg && <p className="text-xs text-pl-muted" data-testid="sl-crop-msg">{msg}</p>}
          {!saved.saved && <p className="text-xs text-pl-muted">Saving crops to your account is not switched on yet; saved crops stay in this browser.</p>}
        </div>
      )}
    </div>
  );
}
