// Gather viewer (QI upgrade P1.7, 2026-10-15; closes QI-UPGRADE U2-004): the
// prestack gathers of a worker gather store at one CDP, along a stretch of an
// inline or crossline, or at the study wells, with a conditioned copy beside the
// source when one exists. The seismic worker reads the store (gather_panel);
// the overlays come from the engines (services/gatherViewer.js): Walden angle
// contours, the stretch mute and the angle mute from the velocity table, NMO
// for a store recorded as not NMO-corrected, residual moveout picks and the
// fitted parabola at the event times, and the stored prestack QC reading
// where the QC sampled the CDP. Its own tab, appended after the Data matrix,
// so the tabs the recorded videos open are unchanged.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as qiService from '@/lib/qiService';
import ChartLogo from '@/components/charts/ChartLogo';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { useQIStudio } from '../QIStudioContext';
import { parseVelocityTable } from './PrestackPanel';
import {
  decodePanel, gatherOverlays, nmoForDisplay, gatherRmo, storedQcAt, wellPoint, clipOf, DEFAULT_ANGLES, VIEWER_DEFAULTS,
} from '../services/gatherViewer';

const card = 'rounded-lg border border-pl-border bg-pl-surface p-4 space-y-3';
const h2 = 'text-sm font-semibold text-pl-text';
const muted = 'text-xs text-pl-muted';
const btn = 'px-2 py-0.5 rounded border text-xs border-pl-border text-pl-text hover:bg-pl-sunken disabled:opacity-50';
const input = 'rounded border border-pl-border bg-pl-surface px-2 py-0.5 text-xs text-pl-text';
const th = 'text-left font-medium text-pl-muted pr-3 pb-1';
const td = 'pr-3 py-0.5 text-pl-text align-top';
const ANGLE_COLOURS = ['#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#64748b'];
const PANEL_H = 420; const AXIS_L = 44; const AXIS_T = 22; const AXIS_B = 26;

const num = (v) => (String(v ?? '').trim() === '' ? null : Number(v));

/** Why the request cannot be sent, or null. Typed values arrive as text. */
export function viewerRequestProblem(req, geometry) {
  const bad = (v) => v != null && !Number.isFinite(v);
  if (req.mode === 'cdp' && (bad(num(req.il)) || bad(num(req.xl)))) return 'Give the inline and crossline as numbers.';
  if (req.mode === 'inline' || req.mode === 'crossline') {
    if (num(req.line) == null || bad(num(req.line))) return `Give the ${req.mode} number.`;
    if (bad(num(req.from)) || bad(num(req.to)) || bad(num(req.step))) return 'The range needs numbers.';
    if (num(req.step) != null && !(num(req.step) >= 1)) return 'The step must be 1 or more.';
    if (num(req.from) != null && num(req.to) != null && num(req.to) < num(req.from)) return 'The range must run from a lower number to a higher one.';
    if (!geometry) return 'Show one CDP first, so the store\'s line numbers are known.';
  }
  const t0 = num(req.tFrom); const t1 = num(req.tTo);
  if ((t0 == null) !== (t1 == null)) return 'Give both ends of the time window, or neither.';
  if (t0 != null && (bad(t0) || bad(t1) || !(t1 > t0) || t0 < 0)) return 'The time window needs a start and a later end, in ms.';
  return null;
}

/** Line numbers to lattice indices on the store's geometry (rounded to the nearest line). */
const toIndex = (axis, n) => (n == null ? undefined : Math.max(0, Math.round((n - axis.min) / axis.step)));

/** The gather_panel params for a request. */
export function viewerParams(req, { storeId, compareId, geometry, points }) {
  const p = { dataset_id: storeId, ...(compareId ? { compare_dataset_id: compareId } : {}), mode: req.mode };
  const g = geometry;
  if (req.mode === 'cdp' && g) {
    const il = toIndex(g.il, num(req.il)); const xl = toIndex(g.xl, num(req.xl));
    if (il != null) p.il = il;
    if (xl != null) p.xl = xl;
  }
  if (req.mode === 'inline' || req.mode === 'crossline') {
    const along = req.mode === 'inline' ? g.xl : g.il;
    if (req.mode === 'inline') p.il = toIndex(g.il, num(req.line)); else p.xl = toIndex(g.xl, num(req.line));
    if (num(req.from) != null) p.from = toIndex(along, num(req.from));
    if (num(req.to) != null) p.to = toIndex(along, num(req.to));
    if (num(req.step) != null) p.step = Math.max(1, Math.round(num(req.step) / along.step));
  }
  if (req.mode === 'points') p.points = points;
  if (num(req.tFrom) != null) p.t_ms = [num(req.tFrom), num(req.tTo)];
  return p;
}

/** Paint one gather's traces and overlays with its first trace at x0 (shared by the one-gather and line panels). */
function paintGather(ctx, x0, { gather, offsets, window: w, clip, display, overlays, rmo, stored, traceW: TRACE_W = 14, plotH }) {
  const nb = offsets.length; const ns = w.ns;
  const yOf = (tMs) => AXIS_T + ((tMs - w.t0_ms) / ((ns - 1) * w.dt_ms || 1)) * plotH;
  const xOf = (b) => x0 + (b + 0.5) * TRACE_W;
  if (display === 'density') {
    const img = ctx.createImageData(nb * TRACE_W, plotH);
    for (let y = 0; y < plotH; y++) {
      const s = Math.min(ns - 1, Math.round((y / Math.max(1, plotH - 1)) * (ns - 1)));
      for (let b = 0; b < nb; b++) {
        const v = gather.traces[b][s];
        let r = 255; let g = 255; let bl = 255;
        if (Number.isFinite(v)) {
          const a = Math.max(-1, Math.min(1, v / clip));
          if (a > 0) { g = Math.round(255 * (1 - a)); bl = g; } else { r = Math.round(255 * (1 + a)); g = r; }
        } else { r = 236; g = 236; bl = 236; }
        for (let x = 0; x < TRACE_W; x++) {
          const k = (y * nb * TRACE_W + b * TRACE_W + x) * 4;
          img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = bl; img.data[k + 3] = 255;
        }
      }
    }
    ctx.putImageData(img, x0, AXIS_T);
  } else {
    ctx.strokeStyle = '#0f172a'; ctx.fillStyle = '#0f172a'; ctx.lineWidth = 0.8;
    for (let b = 0; b < nb; b++) {
      const xc = xOf(b); const tr = gather.traces[b];
      ctx.beginPath();
      let pen = false;
      for (let s = 0; s < ns; s++) {
        const v = tr[s]; const y = yOf(w.t0_ms + s * w.dt_ms);
        if (!Number.isFinite(v)) { pen = false; continue; }
        const x = xc + Math.max(-1.5, Math.min(1.5, v / clip)) * (TRACE_W / 2);
        if (pen) ctx.lineTo(x, y); else { ctx.moveTo(x, y); pen = true; }
      }
      ctx.stroke();
    }
  }
  const line = (times, colour, dash = []) => {
    if (!times) return;
    ctx.strokeStyle = colour; ctx.setLineDash(dash); ctx.lineWidth = 1.4; ctx.beginPath();
    let pen = false;
    times.forEach((t, b) => {
      if (!Number.isFinite(t)) { pen = false; return; }
      const y = yOf(t); const x = xOf(b);
      if (pen) ctx.lineTo(x, y); else { ctx.moveTo(x, y); pen = true; }
    });
    ctx.stroke(); ctx.setLineDash([]);
  };
  for (const [k, c] of (overlays?.contours || []).entries()) line(c.times, ANGLE_COLOURS[k % ANGLE_COLOURS.length], [4, 3]);
  line(overlays?.stretchMute, '#7c3aed', [1, 2]);
  line(overlays?.angleMute, '#dc2626');
  for (const e of rmo || []) {
    ctx.fillStyle = e.coherent ? '#16a34a' : '#94a3b8';
    for (const pk of e.picks) {
      const b = offsets.indexOf(pk.offset);
      if (b < 0 || !Number.isFinite(pk.lagMs)) continue;
      ctx.fillRect(xOf(b) - 2, yOf(e.t_ms + pk.lagMs) - 2, 4, 4);
    }
    if (Number.isFinite(e.curvature)) line(offsets.map((x) => e.t_ms + e.curvature * x * x), '#16a34a');
  }
  for (const t of stored?.times || []) {
    if (!Number.isFinite(t.rmoFarMs)) continue;
    const far = offsets[offsets.length - 1];
    line(offsets.map((x) => t.t_ms + t.rmoFarMs * (x / far) ** 2), '#f97316', [2, 2]);
  }
  return { yOf, xOf };
}

/** The time axis on the left of a panel. */
function timeAxis(ctx, w, yOf, plotH) {
  const ns = w.ns;
  ctx.fillStyle = '#334155'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
  const tickMs = Math.max(w.dt_ms, Math.ceil(((ns - 1) * w.dt_ms) / 8 / 50) * 50);
  for (let t = Math.ceil(w.t0_ms / tickMs) * tickMs; t <= w.t0_ms + (ns - 1) * w.dt_ms; t += tickMs) ctx.fillText(String(t), AXIS_L - 4, yOf(t) + 3);
  ctx.save(); ctx.translate(10, AXIS_T + plotH / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText('time (ms)', 0, 0); ctx.restore();
}

function drawGather(canvas, props) {
  const ctx = canvas?.getContext?.('2d');
  if (!ctx) return;
  const { offsets, window: w, traceW: TRACE_W = 14 } = props;
  const nb = offsets.length; const W = AXIS_L + nb * TRACE_W + 8; const H = PANEL_H;
  canvas.width = W; canvas.height = H;
  const plotH = H - AXIS_T - AXIS_B;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  const { yOf, xOf } = paintGather(ctx, AXIS_L, { ...props, plotH });
  timeAxis(ctx, w, yOf, plotH);
  ctx.fillStyle = '#334155'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
  // offset ticks spaced by width so the labels never run together
  const every = Math.max(1, Math.ceil(34 / TRACE_W));
  for (let b = 0; b < nb; b += every) ctx.fillText(String(Math.round(offsets[b])), xOf(b), H - 10);
  ctx.fillText('offset (m)', AXIS_L + (nb * TRACE_W) / 2, H - 1);
}

/** Gather spacing in a line panel (px between gathers). */
export const LINE_GAP = 3;

/**
 * A line of gathers in ONE panel: side by side on a shared time axis, each
 * labelled by its crossline (along an inline) or inline (along a crossline),
 * so the input and a conditioned copy drawn the same way line up trace for
 * trace. Returns the panel width.
 */
export function drawGatherLine(canvas, { gathers, offsets, window: w, clip, display, overlays, traceW = 4, labelOf }) {
  const ctx = canvas?.getContext?.('2d');
  if (!ctx) return 0;
  const nb = offsets.length; const gw = nb * traceW;
  const W = AXIS_L + gathers.length * (gw + LINE_GAP) + 8; const H = PANEL_H;
  canvas.width = W; canvas.height = H;
  const plotH = H - AXIS_T - AXIS_B;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  let yOf = null;
  gathers.forEach((g, q) => {
    const x0 = AXIS_L + q * (gw + LINE_GAP);
    ({ yOf } = paintGather(ctx, x0, { gather: g, offsets, window: w, clip, display, overlays: overlays ? { angleMute: overlays.angleMute } : null, traceW, plotH }));
  });
  if (yOf) timeAxis(ctx, w, yOf, plotH);
  ctx.fillStyle = '#334155'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
  const every = Math.max(1, Math.ceil(46 / (gw + LINE_GAP)));
  gathers.forEach((g, q) => {
    if (q % every) return;
    ctx.fillText(labelOf(g), AXIS_L + q * (gw + LINE_GAP) + gw / 2, H - 10);
  });
  return W;
}

function GatherLineCanvas(props) {
  const ref = useRef(null);
  useEffect(() => { drawGatherLine(ref.current, props); });
  return <canvas ref={ref} data-testid={props.testid} aria-label={props.title} />;
}

function GatherCanvas(props) {
  const ref = useRef(null);
  useEffect(() => { drawGather(ref.current, props); });
  return <canvas ref={ref} data-testid={props.testid} aria-label={props.title} />;
}

export default function GathersPanel() {
  const { backend, jobs, project, ready, addNotification } = useQIStudio();
  const client = jobs || qiService;
  const [datasets, setDatasets] = useState(null);
  const [storeId, setStoreId] = useState('');
  const [compareId, setCompareId] = useState('');
  const [req, setReq] = useState({ mode: 'cdp', il: '', xl: '', line: '', from: '', to: '', step: '', tFrom: '', tTo: '' });
  const [velText, setVelText] = useState('');
  const [opts, setOpts] = useState({ display: 'density', angles: true, stretch: true, maxStretch: VIEWER_DEFAULTS.maxStretch, muteAngle: VIEWER_DEFAULTS.muteAngle, rmo: true, eventText: '', nmo: true });
  const [job, setJob] = useState(null);
  const [panel, setPanel] = useState(null); // { result, stores }
  const [error, setError] = useState(null);
  const stop = useRef(null);
  useEffect(() => () => stop.current?.(), []);
  const list = backend?.listDatasets || qiService.listDatasets;
  useEffect(() => {
    (async () => { try { setDatasets(await list()); } catch (e) { setDatasets([]); addNotification(qiService.friendlyError(e), 'error'); } })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const stores = (datasets || []).filter((d) => d.kind === 'gathers_offset' && d.status === 'uploaded');
  useEffect(() => { if (!storeId && stores.length) setStoreId(stores[0].id); }, [stores.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // a store's conditioned copies (trimmed, demultipled, denoised, what was
  // removed), its source, and its source's other copies: all on one lattice
  const current = stores.find((d) => d.id === storeId);
  const src = current?.meta?.source_gathers || null;
  const trimmed = stores.filter((d) => d.id !== storeId && (d.meta?.source_gathers === storeId || d.id === src || (src && d.meta?.source_gathers === src)));
  const prestackRec = project.prestack?.[storeId];
  const qcRec = project.prestackQc?.[storeId];
  useEffect(() => {
    const v = prestackRec?.velocity;
    setVelText(v?.t_ms?.length ? v.t_ms.map((t, k) => `${t} ${v.vrms[k]}`).join('\n') : '0 1800\n2000 2600');
    setCompareId('');
    setPanel(null);
  }, [storeId]); // eslint-disable-line react-hooks/exhaustive-deps
  const vel = parseVelocityTable(velText);
  const points = useMemo(() => ready.map((r) => wellPoint(r, project.targets)).filter(Boolean), [ready, project.targets]);
  const geometry = panel?.result?.geometry || null;
  const problem = !storeId ? 'Build a gather store on the Prestack tab first.' : (req.mode === 'points' && !points.length ? 'Choose study wells with a surface location on Setup.' : viewerRequestProblem(req, geometry));

  const show = async () => {
    setError(null);
    const params = viewerParams(req, { storeId, compareId, geometry, points: points.map(({ x, y, label }) => ({ x, y, label })) });
    setJob({ status: 'queued' });
    try {
      const id = await client.enqueueJob('gather_panel', params);
      stop.current?.();
      stop.current = client.watchJob(id, async (row, err) => {
        if (err) { setError(qiService.friendlyError(err)); setJob(null); return; }
        setJob(row);
        if (row?.status === 'succeeded') {
          try {
            const r = row.result_refs;
            const bytes = backend?.fetchGatherPanel ? await backend.fetchGatherPanel(r) : await (await fetch(r.url)).arrayBuffer();
            setPanel({ result: r, stores: decodePanel(bytes, r) });
          } catch (e) { setError(`The panel could not be read: ${e.message}`); }
        }
      });
    } catch (e) { setError(qiService.friendlyError(e)); setJob(null); }
  };

  const view = useMemo(() => {
    if (!panel) return null;
    const r = panel.result; const offsets = r.bins.centres;
    let overlays = null; let overlayError = null;
    if (!vel.error) {
      try {
        overlays = gatherOverlays({
          offsets, velocity: vel, window: r.window,
          angles: opts.angles ? DEFAULT_ANGLES : [],
          maxStretch: opts.stretch ? Number(opts.maxStretch) : 0,
          muteAngle: num(opts.muteAngle),
        });
      } catch (e) { overlayError = e.message; }
    }
    const nmoNeeded = !r.nmo_corrected;
    const stores = panel.stores.map((gs) => gs.map((g) => (nmoNeeded && opts.nmo && overlays ? { ...g, traces: nmoForDisplay({ traces: g.traces, offsets, vel: overlays.vel, window: r.window, maxStretch: opts.stretch ? Number(opts.maxStretch) : null }) } : g)));
    const typed = String(opts.eventText || '').split(/[\s,;]+/).map(Number).filter((t) => t > 0);
    const times = typed.length ? typed : (qcRec?.result?.times || []).map((t) => t.t_ms);
    const clip = clipOf(stores[0]);
    return { r, offsets, overlays, overlayError, stores, times, clip, nmoNeeded };
  }, [panel, velText, opts]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => setReq((m) => ({ ...m, [k]: e.target.value }));
  const setO = (k, isCheck = false) => (e) => setOpts((m) => ({ ...m, [k]: isCheck ? e.target.checked : e.target.value }));
  const active = job && qiService.isActive(job);
  const g0 = geometry;

  return (
    <section className={card} data-testid="qi-gathers">
      <h2 className={h2}>Gather viewer</h2>
      <p className={muted}>Look at the prestack gathers in a worker gather store: at one CDP, along part of an inline or crossline, or at the study wells. Overlays show the incidence angle (Walden straight ray from the velocity table), the stretch mute and the angle mute, and the residual moveout at the event times with the fitted parabola. A conditioned copy of the store (trimmed, demultipled or denoised, or what conditioning removed) can sit beside it, or the store it came from.</p>
      {datasets === null ? <p className={muted}>Loading the worker stores</p> : !stores.length ? <p className={muted} data-testid="qi-gathers-none">No gather store yet. Build one from an uploaded prestack SEG-Y on the Prestack tab.</p> : (
        <>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="flex items-center gap-1">Store
              <select className={input} value={storeId} onChange={(e) => setStoreId(e.target.value)} data-testid="qi-gathers-store">
                {stores.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1">Beside it
              <select className={input} value={compareId} onChange={(e) => setCompareId(e.target.value)} data-testid="qi-gathers-compare">
                <option value="">nothing</option>
                {trimmed.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1">Show
              <select className={input} value={req.mode} onChange={set('mode')} data-testid="qi-gathers-mode">
                <option value="cdp">one CDP</option>
                <option value="inline">along an inline</option>
                <option value="crossline">along a crossline</option>
                <option value="points">at the study wells</option>
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {req.mode === 'cdp' && (
              <>
                <label className="flex items-center gap-1">Inline<input className={`${input} w-20`} value={req.il} onChange={set('il')} placeholder={g0 ? `${g0.il.min} to ${g0.il.max}` : 'centre'} data-testid="qi-gathers-il" /></label>
                <label className="flex items-center gap-1">Crossline<input className={`${input} w-20`} value={req.xl} onChange={set('xl')} placeholder={g0 ? `${g0.xl.min} to ${g0.xl.max}` : 'centre'} data-testid="qi-gathers-xl" /></label>
              </>
            )}
            {(req.mode === 'inline' || req.mode === 'crossline') && (
              <>
                <label className="flex items-center gap-1">{req.mode === 'inline' ? 'Inline' : 'Crossline'}<input className={`${input} w-20`} value={req.line} onChange={set('line')} data-testid="qi-gathers-line" /></label>
                <label className="flex items-center gap-1">{req.mode === 'inline' ? 'Crosslines' : 'Inlines'} from<input className={`${input} w-20`} value={req.from} onChange={set('from')} /></label>
                <label className="flex items-center gap-1">to<input className={`${input} w-20`} value={req.to} onChange={set('to')} /></label>
                <label className="flex items-center gap-1">step<input className={`${input} w-16`} value={req.step} onChange={set('step')} /></label>
              </>
            )}
            {req.mode === 'points' && <span className="text-pl-muted">{points.length ? points.map((q) => `${q.label} (${q.at})`).join(', ') : 'No study well has a surface location.'}</span>}
            <label className="flex items-center gap-1">Time from<input className={`${input} w-20`} value={req.tFrom} onChange={set('tFrom')} placeholder="ms" /></label>
            <label className="flex items-center gap-1">to<input className={`${input} w-20`} value={req.tTo} onChange={set('tTo')} placeholder="ms" /></label>
            <button type="button" className={btn} onClick={show} disabled={!!problem || active} data-testid="qi-gathers-show">Show the gathers</button>
            {active && <span className="text-pl-muted">{`${job.status}${job.progress ? `, ${Math.round(job.progress * 100)} percent` : ''}`}</span>}
            {job?.status === 'failed' && <span className="text-pl-danger-text">{job.error_message || 'The job failed.'}</span>}
          </div>
          {problem && <p className="text-xs text-pl-warning-text" data-testid="qi-gathers-problem">{problem}</p>}
          {error && <p className="text-xs text-pl-danger-text">{error}</p>}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 text-xs">
            <label className="block">
              <span className="text-pl-muted">RMS velocity (time in ms, velocity in m/s){prestackRec?.velocity ? ', from this store\'s angle stacks' : ''}</span>
              <textarea className={`${input} w-full h-16 mt-0.5 font-mono`} value={velText} onChange={(e) => setVelText(e.target.value)} data-testid="qi-gathers-velocity" />
              {vel.error && <span className="text-pl-warning-text">{vel.error} The angle and mute lines need it.</span>}
            </label>
            <div className="space-y-1">
              <label className="flex items-center gap-2"><input type="checkbox" checked={opts.angles} onChange={setO('angles', true)} />Angle contours ({DEFAULT_ANGLES.join(', ')} degrees)</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={opts.stretch} onChange={setO('stretch', true)} />Stretch mute at<input className={`${input} w-14`} value={opts.maxStretch} onChange={setO('maxStretch')} />(fraction)</label>
              <label className="flex items-center gap-2">Angle mute at<input className={`${input} w-14`} value={opts.muteAngle} onChange={setO('muteAngle')} />degrees (blank for none)</label>
            </div>
            <div className="space-y-1">
              <label className="flex items-center gap-2"><input type="checkbox" checked={opts.rmo} onChange={setO('rmo', true)} />Residual moveout at the event times</label>
              <label className="flex items-center gap-2">Event times<input className={`${input} w-32`} value={opts.eventText} onChange={setO('eventText')} placeholder={(qcRec?.result?.times || []).map((t) => t.t_ms).join(' ') || 'ms, ms'} data-testid="qi-gathers-events" /></label>
              <label className="flex items-center gap-2">Display
                <select className={input} value={opts.display} onChange={setO('display')} data-testid="qi-gathers-display"><option value="density">variable density</option><option value="wiggle">wiggle</option></select>
              </label>
            </div>
          </div>
        </>
      )}
      {view && (
        <div className="space-y-2" data-testid="qi-gathers-result">
          <p className={muted} data-testid="qi-gathers-caption">
            {`${view.r.name}${view.r.compare_name ? ` beside ${view.r.compare_name}` : ''}: ${view.r.gathers.length} gather${view.r.gathers.length === 1 ? '' : 's'}, ${view.offsets.length} offset bins of ${view.r.bins.width} m, ${view.r.window.t0_ms} to ${view.r.window.t0_ms + (view.r.window.ns - 1) * view.r.window.dt_ms} ms. `}
            {view.nmoNeeded ? (opts.nmo ? 'The store is recorded as not NMO-corrected; shown NMO-corrected with the velocity table.' : 'The store is recorded as not NMO-corrected; shown as stored.') : 'The store is recorded as NMO-corrected (flat events expected).'}
            {(view.r.skipped || []).length ? ` Left out: ${view.r.skipped.map((s) => `${s.label} (${s.reason})`).join(', ')}.` : ''}
          </p>
          {view.nmoNeeded && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={opts.nmo} onChange={setO('nmo', true)} />Apply NMO for the display</label>}
          {view.overlayError && <p className="text-xs text-pl-warning-text">{view.overlayError}</p>}
          <div className="flex flex-wrap gap-1 text-[11px] text-pl-muted">
            {opts.angles && DEFAULT_ANGLES.map((a, k) => <span key={a} style={{ color: ANGLE_COLOURS[k] }}>{`- - ${a} degrees`}</span>)}
            {opts.stretch && <span style={{ color: '#7c3aed' }}>.... stretch mute</span>}
            {num(opts.muteAngle) > 0 && <span style={{ color: '#dc2626' }}>{`---- angle mute ${opts.muteAngle} degrees`}</span>}
            {opts.rmo && <span style={{ color: '#16a34a' }}>picks and fitted parabola (grey: no coherent event)</span>}
            {qcRec && <span style={{ color: '#f97316' }}>- - stored prestack QC reading</span>}
          </div>
          <div className="relative overflow-x-auto rounded border border-pl-border bg-white p-2">
            {view.stores.length && view.stores[0].length > 2 ? view.stores.map((gs, st) => {
              // a line of gathers: one panel per store, the rows aligned trace for trace
              const alongInline = gs.length > 1 && gs[0].il === gs[1].il;
              const storeName = st ? view.r.compare_name : view.r.name;
              const traceW = Math.max(2, Math.min(8, Math.floor(1400 / (gs.length * view.offsets.length))));
              const title = `${storeName}: ${alongInline ? `inline ${gs[0].il}, crosslines ${gs[0].xl} to ${gs[gs.length - 1].xl}` : `crossline ${gs[0].xl}, inlines ${gs[0].il} to ${gs[gs.length - 1].il}`}`;
              return (
                <figure key={st} className="mb-2" data-testid={`qi-gathers-line-${st}`}>
                  <figcaption className="text-[11px] text-slate-700">{title}</figcaption>
                  <GatherLineCanvas testid={`qi-gathers-canvas-${st}-line`} title={title} gathers={gs} offsets={view.offsets} window={view.r.window} clip={view.clip} display={opts.display} overlays={view.overlays} traceW={traceW} labelOf={(g) => (alongInline ? `XL ${g.xl}` : `IL ${g.il}`)} />
                  <p className="text-[11px] text-slate-600" data-testid={`qi-gathers-fold-${st}-line`}>{`${gs.length} gathers of ${view.offsets.length} offsets, ${view.offsets[0]} to ${view.offsets[view.offsets.length - 1]} m, left to right in each`}</p>
                </figure>
              );
            }) : view.stores.map((gs, st) => (
              <div key={st} className="flex gap-2 mb-2">
                {gs.map((g, q) => {
                  const rmo = opts.rmo && view.times.length ? gatherRmo({ traces: g.traces, fold: g.fold, offsets: view.offsets, window: view.r.window, times: view.times }) : null;
                  const stored = st === 0 ? storedQcAt(qcRec, g.i, g.j) : null;
                  const title = `${st ? `${view.r.compare_name}: ` : ''}${g.label ? `${g.label}, ` : ''}inline ${g.il}, crossline ${g.xl}`;
                  // one or two gathers get wide traces; a line of gathers fits about 1,200 px
                  const traceW = Math.max(4, Math.min(40, Math.floor((gs.length <= 2 ? 520 : 1200 / gs.length) / view.offsets.length)));
                  return (
                    <figure key={`${st}-${q}`} className="shrink-0" data-testid={`qi-gathers-gather-${st}-${q}`}>
                      <figcaption className="text-[11px] text-slate-700">{title}</figcaption>
                      <GatherCanvas testid={`qi-gathers-canvas-${st}-${q}`} title={title} gather={g} offsets={view.offsets} window={view.r.window} clip={view.clip} display={opts.display} overlays={view.overlays} rmo={rmo} stored={stored} traceW={traceW} />
                      {rmo && rmo.length > 0 && (
                        <table className="text-[11px] mt-1" data-testid={`qi-gathers-rmo-${st}-${q}`}>
                          <thead><tr><th className={th}>Event (ms)</th><th className={th}>Far-offset residual (ms)</th><th className={th}>Stored QC</th></tr></thead>
                          <tbody>
                            {rmo.map((e) => {
                              const sq = stored?.times.find((t) => t.t_ms === e.t_ms);
                              return (
                                <tr key={e.t_ms}>
                                  <td className={td}>{e.t_ms}</td>
                                  <td className={td}>{e.coherent ? (Math.abs(e.rmoFarMs) < 0.05 ? 0 : e.rmoFarMs).toFixed(1) : 'no coherent event'}</td>
                                  <td className={td}>{sq && Number.isFinite(sq.rmoFarMs) ? (Math.abs(sq.rmoFarMs) < 0.05 ? 0 : sq.rmoFarMs).toFixed(1) : EMPTY_VALUE}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                      <p className="text-[11px] text-slate-600" data-testid={`qi-gathers-fold-${st}-${q}`}>{`Fold ${g.fold.reduce((a, v) => a + v, 0)} over ${g.fold.filter((v) => v > 0).length} of ${g.fold.length} bins${stored?.fold != null ? `; QC sampled this CDP` : ''}`}</p>
                    </figure>
                  );
                })}
              </div>
            ))}
            <ChartLogo />
          </div>
        </div>
      )}
    </section>
  );
}
