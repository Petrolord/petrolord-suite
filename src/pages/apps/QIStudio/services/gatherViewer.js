// The gather viewer's pure side (QI upgrade P1.7, 2026-10-15; closes
// QI-UPGRADE U2-004). The seismic worker reads gathers from its store
// (gather_panel) and returns one float32 panel; this module splits the panel
// into gathers, works out the overlays from the engines (Walden angle
// contours, the stretch-mute line, the angle mute, NMO for a store that is
// not NMO-corrected, residual moveout at the event times with the prestack
// QC's coherence rule), and places the study wells. Drawing is in
// components/GathersPanel.jsx.

import { velocityOnGrid } from '../engine/prestack';
import { residualMoveout } from '../engine/prestackQc';
import { nmoCorrect, angleField, angleContour, stretchMuteTimes } from '../engine/gatherDisplay';
import { coherentEvent } from '../../../../../worker/seismic-worker/src/handlers/prestackQc.js';
import { computeWellPath, positionAtMd } from '../../../../../packages/engines/engines/seismolord/wellPath';
import { normalizeStations } from '../../../../../packages/engines/engines/seismolord/wellSection';
import { refElevOrNull } from '@/lib/wellDatum';

export const DEFAULT_ANGLES = Object.freeze([10, 20, 30, 40]);
export const VIEWER_DEFAULTS = Object.freeze({ maxStretch: 0.3, muteAngle: 40 });
const fin = Number.isFinite;

/**
 * Split a panel into stores of gathers of bins.
 * @param {ArrayBuffer|Float32Array} data the panel bytes (float32 little-endian)
 * @param {Object} r the job's result
 * @returns {Array<Array<{il, xl, i, j, label?, fold: number[], traces: Float32Array[]}>>} per store
 */
export function decodePanel(data, r) {
  const f = data instanceof Float32Array ? data : new Float32Array(data);
  const nb = r.bins.centres.length; const nw = r.window.ns; const ng = r.gathers.length;
  if (f.length !== r.stores * ng * nb * nw) throw new Error(`The panel holds ${f.length} samples; ${r.stores * ng * nb * nw} were expected.`);
  let at = 0;
  return Array.from({ length: r.stores }, (_, st) => r.gathers.map((g) => {
    const traces = Array.from({ length: nb }, (__, b) => f.subarray(at + b * nw, at + (b + 1) * nw));
    at += nb * nw;
    return { il: g.il, xl: g.xl, i: g.i, j: g.j, label: g.label, fold: (st === 0 ? g.fold : g.compareFold) || [], traces };
  }));
}

/**
 * The overlays for one panel window: angle contours, the stretch-mute line
 * and the angle mute, each as a time per bin (ms; NaN where the line does not
 * cross the trace).
 * @param {{offsets: number[], velocity: {t_ms, vrms}, window: {ns, t0_ms, dt_ms}, angles?: number[], maxStretch?: number, muteAngle?: ?number}} p
 */
export function gatherOverlays({ offsets, velocity, window: w, angles = DEFAULT_ANGLES, maxStretch = VIEWER_DEFAULTS.maxStretch, muteAngle = VIEWER_DEFAULTS.muteAngle }) {
  const vel = velocityOnGrid(velocity.t_ms, velocity.vrms, w.ns, w.dt_ms, w.t0_ms);
  const field = angleField({ offsets, vrms: vel.vrms, vint: vel.vint, dtMs: w.dt_ms, t0Ms: w.t0_ms });
  const at = (deg) => angleContour(field, { angleDeg: deg, dtMs: w.dt_ms, t0Ms: w.t0_ms });
  return {
    contours: angles.map((a) => ({ angle: a, times: at(a) })),
    stretchMute: maxStretch > 0 ? stretchMuteTimes({ offsets, vrms: vel.vrms, dtMs: w.dt_ms, maxStretch, t0Ms: w.t0_ms }) : null,
    angleMute: fin(muteAngle) && muteAngle > 0 ? at(muteAngle) : null,
    vel,
  };
}

/** NMO-correct a gather that is not yet corrected (display only), muting past the stretch limit. */
export function nmoForDisplay({ traces, offsets, vel, window: w, maxStretch = VIEWER_DEFAULTS.maxStretch }) {
  return nmoCorrect({ traces, offsets, vrms: vel.vrms, dtMs: w.dt_ms, t0Ms: w.t0_ms, maxStretch }).map((t) => Float32Array.from(t));
}

/**
 * Residual moveout of the shown gather at each event time, by the engine the
 * prestack QC uses, with the same coherence rule: a reading counts only
 * where the event stays similar across the nearer offsets.
 * @returns {Array<{t_ms, coherent: boolean, rmoFarMs: number, curvature: number, picks: Array<{offset, lagMs, corr}>, method?: string}>}
 */
export function gatherRmo({ traces, fold, offsets, window: w, times }) {
  const live = traces.map((t, b) => (fold?.[b] ? Float64Array.from(t, (v) => (fin(v) ? v : NaN)) : new Float64Array(t.length).fill(NaN)));
  return times.filter((t) => t > w.t0_ms && t < w.t0_ms + (w.ns - 1) * w.dt_ms).map((t) => {
    const m = residualMoveout({ traces: live, offsets, dtMs: w.dt_ms, centreMs: t - w.t0_ms });
    const order = offsets.map((x, k) => [x, k]).filter(([, k]) => live[k].some(fin)).sort((a, b) => a[0] - b[0]);
    const coherent = coherentEvent(m);
    return {
      t_ms: t, coherent, rmoFarMs: coherent ? m.rmoFarMs : NaN, curvature: coherent ? m.curvature : NaN, method: m.method,
      picks: (m.lagsMs || []).map((lag, q) => ({ offset: order[q]?.[0], lagMs: lag, corr: m.corr[q] })),
    };
  });
}

/** The stored prestack QC reading at a CDP, when the QC sampled that CDP. */
export function storedQcAt(qcRecord, i, j) {
  const r = qcRecord?.result;
  const k = (r?.maps?.sampled || []).findIndex(([a, b]) => a === i && b === j);
  if (k < 0) return null;
  return { times: r.times.map((t, n) => ({ t_ms: t.t_ms, rmoFarMs: r.maps.rmo[n]?.[k] ?? null, noEvent: !!t.noEvent })), fold: r.maps.fold?.[k] ?? null };
}

/**
 * A well's world position for the viewer: at the middle of the first study
 * target the well has a zone for (deviated wells move away from the
 * surface location), otherwise the surface location.
 * @returns {{x, y, label, at: string}|null}
 */
export function wellPoint(loaded, targets = []) {
  const w = loaded?.well;
  if (!w) return null;
  const surface = fin(Number(w.surface_x)) && fin(Number(w.surface_y)) ? { x: Number(w.surface_x), y: Number(w.surface_y) } : null;
  const zone = (loaded.zones || []).find((z) => targets.includes(z.name));
  if (zone && surface) {
    try {
      const kb = refElevOrNull(w);
      const stations = normalizeStations({ deviation: w.deviation, tdMdM: w.td_md_m ?? Number(zone.base_md_m) });
      if (stations && kb != null) {
        const path = computeWellPath(stations, { surfaceX: surface.x, surfaceY: surface.y, kb });
        const pos = positionAtMd(stations, path, (Number(zone.top_md_m) + Number(zone.base_md_m)) / 2);
        if (pos && fin(pos.x) && fin(pos.y)) return { x: pos.x, y: pos.y, label: w.name, at: zone.name };
      }
    } catch { /* fall back to the surface location */ }
  }
  return surface ? { ...surface, label: w.name, at: 'surface location' } : null;
}

/** Signed amplitude clip for display: the 98th percentile of |value| over the live samples. */
export function clipOf(gathers) {
  const v = [];
  for (const g of gathers) for (const t of g.traces) for (let s = 0; s < t.length; s += 3) if (fin(t[s])) v.push(Math.abs(t[s]));
  if (!v.length) return 1;
  v.sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.floor(0.98 * v.length))] || 1;
}
