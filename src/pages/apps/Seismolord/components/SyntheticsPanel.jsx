// Synthetics window (G5: LAS-driven synthetic seismograms — the true
// seismic-to-well tie). Presentation-only, the WellTiePanel pattern: the
// parent supplies data loaders (listLogs/downloadCurve), the pipeline
// runner (synthesize — worker-backed in the app, direct engine in the
// dev harness), the corridor trace loader and horizon grids, so the
// whole flow is drivable in a harness without auth.
//
// Domain rules honoured here:
// - T(z) provenance comes back from makeTvdssToTwt via the synthesize
//   result (timeSource) and is shown as a badge — sources never mixed.
// - SEG normal polarity by default (impedance increase = positive =
//   filled lobe); the toggle flips the WAVELET, not the data.
// - Bulk shift is DISPLAY-ONLY: nothing is written to the velocity
//   model (W3 wellTie.js owns calibration).
// - Tracks are a seismic display on canvas (chartTheme mandate exempt).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Waves, Loader2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { guessCurveKind } from '@/pages/apps/WellDataManager/engine/lasImport';
import {
  isGap, rickerWavelet, extractStatisticalWavelet, suggestBulkShift,
} from '../engine/synthetics';
import { normalizeStations } from '../engine/wellSection';
import { computeWellPath, positionAtMd } from '../engine/wellPath';
import { worldToIlxl } from '../engine/surveyGeometry';
import { sampleGridAt, fitWellTie, calibrationProvenance } from '../engine/wellTie';
import {
  makeTieWarp, warpTrace, warpToCheckshots, warpToTiePoints,
  rotateConstantPhase, estimatePhaseRotation, windowedTieQc,
} from '../engine/tieWarp';
import { effectiveCheckshots } from '../services/wellsService';

const inputCls = 'rounded-md bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-1 text-xs';

const CORRIDOR_HALF = 2;            // ±2 traces around the well
const MAX_SHIFT_SEARCH_MS = 100;

/** Linear interpolation of a top's TWT from the per-MD twt series. */
function twtAtMd(mdArray, twtMs, md) {
  if (!mdArray || mdArray.length < 2 || !Number.isFinite(md)) return null;
  if (md < mdArray[0] || md > mdArray[mdArray.length - 1]) return null;
  let i = 1;
  while (i < mdArray.length - 1 && mdArray[i] < md) i++;
  const t0 = twtMs[i - 1];
  const t1 = twtMs[i];
  if (isGap(t0) || isGap(t1)) return null;
  const f = (md - mdArray[i - 1]) / (mdArray[i] - mdArray[i - 1]);
  return t0 + f * (t1 - t0);
}

// ---- track canvas ---------------------------------------------------------

const TRACK_W = 112;
const GAP_X = 10;
const AXIS_W = 48;
const PAD_Y = 22;

/** min/max over valid samples of (x, t) pairs inside [t0, t1]. */
function valueRange(values, times, t0, t1) {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const t = times(i);
    if (isGap(values[i]) || isGap(t) || t < t0 || t > t1) continue;
    lo = Math.min(lo, values[i]);
    hi = Math.max(hi, values[i]);
  }
  if (!(hi > lo)) {
    lo -= 1;
    hi = lo + 2;
  }
  return [lo, hi];
}

function drawTracks(canvas, view) {
  const {
    result, corridor, dtMs, shiftMs, tops, horizonMarks, t0, t1,
    // W3.3: a pre-warped/rotated synthetic replaces the raw one for
    // display (shift already baked in), anchors draw as tie lines and
    // qc as a correlation strip beside the seismic track
    displaySynthetic = null, displayValidity, anchors = null, qc = null,
  } = view;
  const dpr = window.devicePixelRatio || 1;
  const tracks = ['DT', 'RHOB', 'Z', 'RC', 'Synthetic', 'Seismic'];
  const W = AXIS_W + tracks.length * (TRACK_W + GAP_X);
  const H = 560;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;                     // jsdom (tests) has no 2D context
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#0b1220';
  ctx.fillRect(0, 0, W, H);
  const y = (t) => PAD_Y + ((t - t0) / (t1 - t0)) * (H - 2 * PAD_Y);
  const x0 = (k) => AXIS_W + k * (TRACK_W + GAP_X);

  // time axis
  ctx.strokeStyle = '#1e293b';
  ctx.fillStyle = '#64748b';
  ctx.font = '10px monospace';
  ctx.textAlign = 'right';
  const span = t1 - t0;
  const tick = span > 1500 ? 500 : span > 600 ? 200 : span > 250 ? 100 : 50;
  for (let t = Math.ceil(t0 / tick) * tick; t <= t1; t += tick) {
    ctx.fillText(String(Math.round(t)), AXIS_W - 6, y(t) + 3);
    ctx.beginPath();
    ctx.moveTo(AXIS_W, y(t));
    ctx.lineTo(W, y(t));
    ctx.stroke();
  }
  ctx.save();
  ctx.translate(10, H / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillText('TWT (ms)', 0, 0);
  ctx.restore();

  // track frames + titles
  ctx.textAlign = 'center';
  tracks.forEach((name, k) => {
    ctx.strokeStyle = '#334155';
    ctx.strokeRect(x0(k), PAD_Y, TRACK_W, H - 2 * PAD_Y);
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(name, x0(k) + TRACK_W / 2, 14);
  });

  /** polyline of (value, twt) with pen-breaks on gaps / out-of-window. */
  const drawLog = (k, values, times, color) => {
    if (!values) return;
    const [lo, hi] = valueRange(values, times, t0, t1);
    const xv = (v) => x0(k) + 6 + ((v - lo) / (hi - lo)) * (TRACK_W - 12);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i < values.length; i++) {
      const t = times(i);
      if (isGap(values[i]) || isGap(t) || t < t0 || t > t1) {
        pen = false;
        continue;
      }
      if (pen) ctx.lineTo(xv(values[i]), y(t));
      else ctx.moveTo(xv(values[i]), y(t));
      pen = true;
    }
    ctx.stroke();
  };

  /** wiggle + variable area, symmetric around the track centre. */
  const drawWiggle = (k, samples, {
    scale, offsetX = 0, shift = 0, valid = null, color = '#e2e8f0', fill = true,
  }) => {
    const cx = x0(k) + TRACK_W / 2 + offsetX;
    const pts = [];
    for (let i = 0; i < samples.length; i++) {
      const t = i * dtMs + shift;
      const bad = isGap(samples[i]) || (valid && !valid[i]) || t < t0 || t > t1;
      pts.push(bad ? null : { x: cx + samples[i] * scale, y: y(t) });
    }
    if (fill) {
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      let open = false;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const pos = p && p.x > cx;
        if (pos && !open) {
          ctx.moveTo(cx, p.y);
          open = true;
        }
        if (open) {
          if (pos) ctx.lineTo(p.x, p.y);
          else {
            ctx.lineTo(cx, pts[i - 1] ? pts[i - 1].y : p ? p.y : 0);
            ctx.closePath();
            open = false;
          }
        }
      }
      if (open) ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    let pen = false;
    for (const p of pts) {
      if (!p) {
        pen = false;
        continue;
      }
      if (pen) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
      pen = true;
    }
    ctx.stroke();
  };

  if (result) {
    const times = (i) => result.twtMs[i];
    drawLog(0, result.dtCurve, times, '#38bdf8');
    if (result.rhobCurve) drawLog(1, result.rhobCurve, times, '#f472b6');
    else {
      ctx.fillStyle = '#64748b';
      ctx.fillText('constant', x0(1) + TRACK_W / 2, PAD_Y + 16);
    }
    drawLog(2, result.impedanceTime, (i) => i * dtMs, '#a3e635');

    // RC spikes from the track centre
    const rcMax = Math.max(1e-12, ...[...result.rc].filter((v) => !isGap(v)).map(Math.abs));
    const cx = x0(3) + TRACK_W / 2;
    ctx.strokeStyle = '#fbbf24';
    for (let i = 0; i < result.rc.length; i++) {
      const t = i * dtMs;
      if (isGap(result.rc[i]) || t < t0 || t > t1) continue;
      ctx.beginPath();
      ctx.moveTo(cx, y(t));
      ctx.lineTo(cx + (result.rc[i] / rcMax) * (TRACK_W / 2 - 6), y(t));
      ctx.stroke();
    }

    const synDisplay = displaySynthetic || result.synthetic;
    const synShift = displaySynthetic ? 0 : shiftMs;
    const synValid = displaySynthetic ? displayValidity ?? null : result.validity;
    const synMax = Math.max(1e-12, ...[...synDisplay].filter((v) => !isGap(v)).map(Math.abs));
    drawWiggle(4, synDisplay, {
      scale: (TRACK_W / 2 - 6) / synMax,
      shift: synShift,
      valid: synValid,
      color: '#f87171',
    });
    // ghost of the synthetic over the seismic corridor for the visual tie
    if (corridor && corridor.length) {
      let cMax = 1e-12;
      for (const tr of corridor) {
        for (let i = 0; i < tr.length; i++) {
          if (!isGap(tr[i])) cMax = Math.max(cMax, Math.abs(tr[i]));
        }
      }
      const step = (TRACK_W - 16) / corridor.length;
      corridor.forEach((tr, kk) => {
        const centre = kk === (corridor.length - 1) / 2;
        drawWiggle(5, tr, {
          scale: (step * 0.9) / cMax,
          offsetX: (kk - (corridor.length - 1) / 2) * step,
          color: centre ? '#e2e8f0' : '#475569',
          fill: centre,
        });
      });
      drawWiggle(5, synDisplay, {
        scale: (step * 0.9) / synMax,
        shift: synShift,
        valid: synValid,
        color: 'rgba(248,113,113,0.8)',
        fill: false,
      });
    } else {
      ctx.fillStyle = '#64748b';
      ctx.fillText('no volume trace', x0(5) + TRACK_W / 2, PAD_Y + 16);
    }
  }

  // tops (across all tracks) and horizon markers (seismic track)
  ctx.textAlign = 'left';
  ctx.setLineDash([4, 3]);
  for (const m of tops || []) {
    if (m.twtMs == null || m.twtMs < t0 || m.twtMs > t1) continue;
    ctx.strokeStyle = '#f97316';
    ctx.beginPath();
    ctx.moveTo(AXIS_W, y(m.twtMs));
    ctx.lineTo(W, y(m.twtMs));
    ctx.stroke();
    ctx.fillStyle = '#f97316';
    ctx.fillText(m.name, AXIS_W + 2, y(m.twtMs) - 3);
  }
  for (const m of horizonMarks || []) {
    if (m.twtMs == null || m.twtMs < t0 || m.twtMs > t1) continue;
    ctx.strokeStyle = '#22d3ee';
    ctx.beginPath();
    ctx.moveTo(x0(5), y(m.twtMs));
    ctx.lineTo(x0(5) + TRACK_W, y(m.twtMs));
    ctx.stroke();
    ctx.fillStyle = '#22d3ee';
    ctx.fillText(m.name, x0(5) + 2, y(m.twtMs) - 3);
  }
  ctx.setLineDash([]);

  // W3.3 tie anchors: a line across the synthetic + seismic tracks at
  // the SEISMIC time, with a diamond handle (drag target) and the
  // stretch it applies
  if (anchors && anchors.length) {
    ctx.textAlign = 'left';
    for (const a of anchors) {
      if (a.seisTwtMs < t0 || a.seisTwtMs > t1) continue;
      const ya = y(a.seisTwtMs);
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x0(4), ya);
      ctx.lineTo(x0(5) + TRACK_W, ya);
      ctx.stroke();
      const hx = x0(4) - 5;
      ctx.fillStyle = '#34d399';
      ctx.beginPath();
      ctx.moveTo(hx, ya - 5);
      ctx.lineTo(hx + 5, ya);
      ctx.lineTo(hx, ya + 5);
      ctx.lineTo(hx - 5, ya);
      ctx.closePath();
      ctx.fill();
      const d = a.seisTwtMs - a.synTwtMs;
      ctx.fillText(`${d >= 0 ? '+' : ''}${d.toFixed(0)} ms`, x0(5) + TRACK_W - 44, ya - 3);
    }
  }

  // W3.3 tie QC strip: windowed correlation beside the seismic track
  // (green +1 / yellow 0 / red -1; gaps stay dark)
  if (qc && qc.length) {
    const sx = x0(5) + TRACK_W + 2;
    for (let i = 0; i < qc.length; i++) {
      const row = qc[i];
      if (row.twtMs < t0 || row.twtMs > t1) continue;
      const yA = y(row.twtMs - (i > 0 ? (qc[1].twtMs - qc[0].twtMs) / 2 : 0));
      const yB = y(row.twtMs + (i > 0 ? (qc[1].twtMs - qc[0].twtMs) / 2 : 0));
      if (row.corr == null) ctx.fillStyle = '#1e293b';
      else if (row.corr >= 0) {
        const g = Math.round(80 + 120 * row.corr);
        ctx.fillStyle = `rgb(${Math.round(200 - 150 * row.corr)}, ${g + 55}, 80)`;
      } else {
        ctx.fillStyle = `rgb(${Math.round(150 - 100 * row.corr)}, 60, 60)`;
      }
      ctx.fillRect(sx, Math.min(yA, yB), 6, Math.abs(yB - yA) + 1);
    }
  }
}

// ---- panel ---------------------------------------------------------------

/**
 * @param {Object} p
 * @param {Array} p.wells registry well rows (snake_case: surface_x,
 *   kb_m, td_md_m, deviation, checkshots, tops [{name, md}])
 * @param {(wellId: string) => Promise<Array>} p.listLogs
 * @param {(log: Object) => Promise<Float32Array>} p.downloadCurve
 * @param {(params: Object) => Promise<Object>} p.synthesize pipeline
 *   runner (worker-backed in the app); resolves the engine result +
 *   timeSource provenance
 * @param {?(ilIdx: number, xlIdx: number, half: number) =>
 *   Promise<Float32Array[]>} p.getTraces corridor loader (null = no volume)
 * @param {Array<{id, name}>} p.horizons
 * @param {(horizonId: string) => Promise<Float32Array>} p.loadGrid
 * @param {?Object} p.affine resolved survey affine
 * @param {?{nIl, nXl, ns}} p.geom
 * @param {?number} p.dtUs
 * @param {?Object} p.velocity velocityForDisplay (T(z) fallback)
 * @param {?Array} p.boundaries layer-cake boundary grids
 */
export default function SyntheticsPanel({
  wells, listLogs, downloadCurve, synthesize, getTraces,
  horizons, loadGrid, affine, geom, dtUs, velocity, boundaries,
  onApplyVelocity = null, onCommitCheckshots = null,
}) {
  const [logsByWell, setLogsByWell] = useState({});
  const [logsLoading, setLogsLoading] = useState(false);
  const [wellId, setWellId] = useState('');
  const [sonicId, setSonicId] = useState('');
  const [densityId, setDensityId] = useState('');
  const [freqHz, setFreqHz] = useState(25);
  const [segNormal, setSegNormal] = useState(true);
  const [waveletMode, setWaveletMode] = useState('ricker');   // 'ricker'|'extracted'
  const [extracted, setExtracted] = useState(null);           // Float32Array
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [view, setView] = useState(null);   // {result, corridor, tops, horizonMarks, note}
  const [shiftMs, setShiftMs] = useState(0);
  const [suggestion, setSuggestion] = useState(null);
  // W3.3 well tie 2.0: anchors build the stretch/squeeze warp (they
  // replace the bulk shift while present), phase is the estimated /
  // applied constant rotation, commitBusy guards the two commit paths
  const [anchors, setAnchors] = useState([]);
  const [phase, setPhase] = useState(null);       // estimatePhaseRotation result
  const [phiApplied, setPhiApplied] = useState(false);
  const [commitBusy, setCommitBusy] = useState(false);
  const canvasRef = useRef(null);
  const layoutRef = useRef(null);                 // {t0, t1} of the last draw
  const dragRef = useRef(null);                   // index of the dragged anchor

  const dtMs = dtUs ? dtUs / 1000 : null;
  const maxTwtMs = geom && dtMs ? (geom.ns - 1) * dtMs : null;

  // log metadata for every well (cheap rows; curves download on Run)
  useEffect(() => {
    let cancelled = false;
    if (!wells || !wells.length) {
      setLogsByWell({});
      return undefined;
    }
    setLogsLoading(true);
    (async () => {
      const map = {};
      for (const w of wells) {
        try {
          map[w.id] = await listLogs(w.id);
        } catch {
          map[w.id] = [];
        }
      }
      if (!cancelled) {
        setLogsByWell(map);
        setLogsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [wells, listLogs]);

  const kindOf = (log) => guessCurveKind(log.mnemonic);
  const sonicWells = useMemo(
    () => (wells || []).filter((w) => (logsByWell[w.id] || []).some((l) => kindOf(l) === 'sonic')),
    [wells, logsByWell],
  );
  const wellLogs = logsByWell[wellId] || [];
  const sonicLogs = wellLogs.filter((l) => kindOf(l) === 'sonic');
  const densityLogs = wellLogs.filter((l) => kindOf(l) === 'density');

  const pickWell = (id) => {
    setWellId(id);
    setView(null);
    setSuggestion(null);
    setShiftMs(0);
    setAnchors([]);
    setPhase(null);
    setPhiApplied(false);
    const logs = logsByWell[id] || [];
    const sonic = logs.find((l) => kindOf(l) === 'sonic');
    const dens = logs.find((l) => kindOf(l) === 'density');
    setSonicId(sonic ? sonic.id : '');
    setDensityId(dens ? dens.id : '');
  };

  /** Well row -> stations + IL/XL of the log-interval midpoint. */
  const locateWell = (well, sonicLog) => {
    const stations = normalizeStations({ deviation: well.deviation, tdMdM: well.td_md_m });
    if (!stations) {
      throw new Error(`Well "${well.name}" has no deviation survey and no TD — `
        + 'a synthetic cannot be placed in depth.');
    }
    const path = computeWellPath(stations, {
      surfaceX: well.surface_x, surfaceY: well.surface_y, kb: well.kb_m || 0,
    });
    let ilxl = null;
    if (affine && geom) {
      const midMd = Math.min(
        stations[stations.length - 1].md,
        Math.max(stations[0].md, ((sonicLog.start_md_m ?? 0) + (sonicLog.stop_md_m ?? 0)) / 2),
      );
      const pos = positionAtMd(stations, path, midMd) || path[path.length - 1];
      const ij = worldToIlxl(affine, pos.x, pos.y);
      if (ij) {
        const il = Math.round(ij.i);
        const xl = Math.round(ij.j);
        if (il >= 0 && il < geom.nIl && xl >= 0 && xl < geom.nXl) ilxl = { il, xl };
      }
    }
    return { stations, ilxl };
  };

  const activeWavelet = () => {
    let w;
    if (waveletMode === 'extracted') {
      if (!extracted) throw new Error('Extract a wavelet from the seismic first (or switch back to Ricker).');
      w = Float32Array.from(extracted);
    } else {
      w = rickerWavelet(freqHz, dtMs, 60);
    }
    if (!segNormal) for (let i = 0; i < w.length; i++) w[i] = -w[i];
    return w;
  };

  const loadDepthVector = async (sonicLog) => {
    if (sonicLog.step_m != null) return null;   // regular grid: start/step suffice
    const depthLog = wellLogs.find((l) => kindOf(l) === 'depth');
    if (!depthLog) {
      throw new Error(`Log ${sonicLog.mnemonic} has an irregular depth grid and the well `
        + 'has no depth curve to resolve it — re-import the LAS file.');
    }
    return downloadCurve(depthLog);
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    setSuggestion(null);
    try {
      if (!dtMs || !geom) throw new Error('Load a seismic volume first — the synthetic samples onto its time grid.');
      const well = wells.find((w) => w.id === wellId);
      const sonicLog = wellLogs.find((l) => l.id === sonicId);
      if (!well || !sonicLog) throw new Error('Pick a well with a sonic (DT) curve first.');
      const densityLog = wellLogs.find((l) => l.id === densityId) || null;

      const [dtCurve, rhobCurve, mdArray] = await Promise.all([
        downloadCurve(sonicLog),
        densityLog ? downloadCurve(densityLog) : Promise.resolve(null),
        loadDepthVector(sonicLog),
      ]);
      const { stations, ilxl } = locateWell(well, sonicLog);

      const result = await synthesize({
        dtCurve,
        rhobCurve,
        constantRhoGcc: 2.3,
        mdArray,
        mdStartM: sonicLog.start_md_m,
        mdStepM: sonicLog.step_m,
        stations,
        kbM: well.kb_m || 0,
        surfaceX: well.surface_x,
        surfaceY: well.surface_y,
        checkshots: effectiveCheckshots(well).rows,
        velocity,
        boundaries,
        dtUs,
        ns: geom.ns,
        maxTwtMs,
        wavelet: activeWavelet(),
      });

      let corridor = null;
      let note = null;
      if (ilxl && getTraces) {
        try {
          corridor = await getTraces(ilxl.il, ilxl.xl, CORRIDOR_HALF);
        } catch (e) {
          note = `Seismic corridor unavailable: ${e.message}`;
        }
      } else if (!ilxl) {
        note = 'The well is outside this survey — synthetic only, no seismic corridor.';
      }

      const tops = (well.tops || []).map((t) => ({
        name: t.name, twtMs: twtAtMd(result.mdArray, result.twtMs, t.md),
      }));
      const horizonMarks = [];
      if (ilxl && loadGrid) {
        for (const h of horizons || []) {
          try {
            const grid = await loadGrid(h.id);
            const s = sampleGridAt(grid, geom.nIl, geom.nXl, ilxl.il, ilxl.xl);
            if (s != null) horizonMarks.push({ name: h.name, twtMs: s * dtMs });
          } catch {
            // unloadable horizon: skip its marker
          }
        }
      }
      setView({
        result: { ...result, dtCurve, rhobCurve },
        corridor,
        tops,
        horizonMarks,
        note,
        wellName: well.name,
        well,
        stations,
        derivedCheckshots: effectiveCheckshots(well).derived,
        constantDensity: !densityLog,
        ilxl,
      });
      setShiftMs(0);
      setAnchors([]);
      setPhase(null);
      setPhiApplied(false);
    } catch (e) {
      setError(e.message);
      setView(null);
    } finally {
      setBusy(false);
    }
  };

  const extractFromSeismic = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!dtMs || !geom) throw new Error('Load a seismic volume first.');
      const well = wells.find((w) => w.id === wellId);
      const sonicLog = wellLogs.find((l) => l.id === sonicId);
      if (!well || !sonicLog) throw new Error('Pick a well with a sonic (DT) curve first.');
      if (!getTraces) throw new Error('No seismic volume is loaded to extract from.');
      const { ilxl } = locateWell(well, sonicLog);
      if (!ilxl) throw new Error('The well is outside this survey — nothing to extract from.');
      const traces = await getTraces(ilxl.il, ilxl.xl, CORRIDOR_HALF);
      setExtracted(extractStatisticalWavelet(traces, dtMs));
      setWaveletMode('extracted');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const suggest = () => {
    if (!view?.result || !view.corridor?.length) return;
    const centre = view.corridor[(view.corridor.length - 1) / 2];
    const s = suggestBulkShift(view.result.synthetic, centre, dtMs, MAX_SHIFT_SEARCH_MS);
    setSuggestion(s || { none: true });
  };

  // W3.3 tie pipeline: warp (anchors replace the bulk shift), optional
  // constant-phase rotation, and windowed QC against the corridor centre
  const tie = useMemo(() => {
    if (!view?.result || !dtMs) return null;
    const warp = anchors.length ? makeTieWarp(anchors) : null;
    let display = null;
    if (warp) display = warpTrace(view.result.synthetic, dtMs, warp);
    if (phiApplied && phase) {
      display = rotateConstantPhase(display || view.result.synthetic, phase.phiRad);
    }
    const centre = view.corridor?.length
      ? view.corridor[(view.corridor.length - 1) / 2] : null;
    let qc = null;
    if (centre && (display || shiftMs === 0)) {
      // QC is meaningful on the seismic axis: the warped/rotated display
      // trace (or the raw synthetic when no shift is applied)
      qc = windowedTieQc(display || view.result.synthetic, centre, dtMs);
    }
    return { warp, display, qc };
  }, [view, anchors, phase, phiApplied, shiftMs, dtMs]);

  const qcSummary = useMemo(() => {
    const rows = (tie?.qc || []).filter((r) => r.corr != null);
    if (!rows.length) return null;
    const mean = rows.reduce((s, r) => s + r.corr, 0) / rows.length;
    const min = Math.min(...rows.map((r) => r.corr));
    return { mean, min };
  }, [tie]);

  // redraw on any display change
  useEffect(() => {
    if (!canvasRef.current || !view?.result || !dtMs) return;
    const r = view.result;
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < r.twtMs.length; i++) {
      if (isGap(r.twtMs[i])) continue;
      lo = Math.min(lo, r.twtMs[i]);
      hi = Math.max(hi, r.twtMs[i]);
    }
    const t0 = Math.max(0, lo - 60);
    const t1 = Math.min(maxTwtMs ?? hi + 60, hi + 60);
    layoutRef.current = { t0, t1 };
    drawTracks(canvasRef.current, {
      result: r,
      corridor: view.corridor,
      tops: view.tops,
      horizonMarks: view.horizonMarks,
      dtMs,
      shiftMs,
      t0,
      t1,
      displaySynthetic: tie?.display || null,
      anchors,
      qc: tie?.qc || null,
    });
  }, [view, shiftMs, dtMs, maxTwtMs, tie, anchors]);

  // ---- W3.3 anchor interactions on the canvas ---------------------------
  const CANVAS_H = 560;
  const yToTwt = (py) => {
    const l = layoutRef.current;
    if (!l) return null;
    return l.t0 + ((py - PAD_Y) / (CANVAS_H - 2 * PAD_Y)) * (l.t1 - l.t0);
  };
  const canvasPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { px: e.clientX - rect.left, py: e.clientY - rect.top };
  };
  const nearestAnchor = (py) => {
    const l = layoutRef.current;
    if (!l || !anchors.length) return -1;
    const yOf = (t) => PAD_Y + ((t - l.t0) / (l.t1 - l.t0)) * (CANVAS_H - 2 * PAD_Y);
    let best = -1;
    let bestD = 7;
    anchors.forEach((a, i) => {
      const d = Math.abs(yOf(a.seisTwtMs) - py);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  };
  const tieTrackX = () => AXIS_W + 4 * (TRACK_W + GAP_X) - 12; // left of synthetic track

  const onCanvasPointerDown = (e) => {
    if (!view?.result || !layoutRef.current) return;
    const { px, py } = canvasPos(e);
    if (px < tieTrackX()) return;                 // log tracks: no tie UI
    const hit = nearestAnchor(py);
    if (hit >= 0) {
      dragRef.current = hit;
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
  };
  const onCanvasPointerMove = (e) => {
    if (dragRef.current == null) return;
    const { py } = canvasPos(e);
    const t = yToTwt(py);
    if (t == null) return;
    setAnchors((list) => {
      const i = dragRef.current;
      const next = [...list];
      // monotonicity: stay strictly between the neighbours' seismic times
      const lo = i > 0 ? next[i - 1].seisTwtMs + dtMs : -Infinity;
      const hi = i < next.length - 1 ? next[i + 1].seisTwtMs - dtMs : Infinity;
      next[i] = { ...next[i], seisTwtMs: Math.min(hi, Math.max(lo, t)) };
      return next;
    });
  };
  const onCanvasPointerUp = () => { dragRef.current = null; };
  const onCanvasDblClick = (e) => {
    if (!view?.result || !layoutRef.current) return;
    const { px, py } = canvasPos(e);
    if (px < tieTrackX()) return;
    const hit = nearestAnchor(py);
    if (hit >= 0) {
      setAnchors((list) => list.filter((_, i) => i !== hit));
      return;
    }
    const t = yToTwt(py);
    if (t == null) return;
    // anchor the event CURRENTLY displayed at t: through the active warp
    // (or the bulk shift) back to synthetic time — adding it does not
    // move anything until the anchor is dragged
    const synT = tie?.warp ? tie.warp.toSyntheticMs(t) : t - shiftMs;
    setAnchors((list) => {
      const next = [...list, { synTwtMs: synT, seisTwtMs: t }]
        .sort((a, b) => a.synTwtMs - b.synTwtMs);
      // reject an add that would fold the warp instead of throwing later
      for (let i = 1; i < next.length; i++) {
        if (next[i].synTwtMs <= next[i - 1].synTwtMs
          || next[i].seisTwtMs <= next[i - 1].seisTwtMs) return list;
      }
      return next;
    });
  };

  // ---- W3.3 phase + commits ---------------------------------------------
  const estimatePhase = () => {
    if (!view?.result || !view.corridor?.length) return;
    const centre = view.corridor[(view.corridor.length - 1) / 2];
    const est = estimatePhaseRotation(tie?.display || view.result.synthetic, centre);
    setPhase(est);
    if (!est) setPhiApplied(false);
  };

  /** Synthetic-time -> TVDss through the run's own MD/TWT series (the
   *  same T(z) the synthetic used — provenance preserved). */
  const buildTwtToTvdss = () => {
    const r = view.result;
    const { stations } = view;
    const path = computeWellPath(stations, {
      surfaceX: view.well.surface_x, surfaceY: view.well.surface_y, kb: view.well.kb_m || 0,
    });
    const mds = [];
    const twts = [];
    for (let i = 0; i < r.mdArray.length; i++) {
      if (isGap(r.twtMs[i])) continue;
      mds.push(r.mdArray[i]);
      twts.push(r.twtMs[i]);
    }
    return (twtMs) => {
      if (twts.length < 2 || twtMs < twts[0] || twtMs > twts[twts.length - 1]) return null;
      let i = 1;
      while (i < twts.length - 1 && twts[i] < twtMs) i++;
      const f = (twtMs - twts[i - 1]) / (twts[i] - twts[i - 1]);
      const md = mds[i - 1] + f * (mds[i] - mds[i - 1]);
      const pos = positionAtMd(stations, path, md);
      return pos ? pos.tvdss : null;
    };
  };

  const commitCheckshots = async () => {
    if (!tie?.warp || !onCommitCheckshots || !view?.well) return;
    setCommitBusy(true);
    setError(null);
    try {
      const rows = warpToCheckshots(tie.warp, buildTwtToTvdss())
        .map((r) => ({ tvdss_m: r.tvdssM, twt_ms: r.twtMs }));
      await onCommitCheckshots(view.well, {
        rows,
        provenance: {
          source: 'well_tie_warp',
          anchors: anchors.length,
          phi_deg: phiApplied && phase ? Math.round(phase.phiDeg * 10) / 10 : null,
          created_at: new Date().toISOString(),
        },
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setCommitBusy(false);
    }
  };

  const commitCalibration = async () => {
    if (!tie?.warp || !onApplyVelocity || !view) return;
    setCommitBusy(true);
    setError(null);
    try {
      if (!velocity) throw new Error('Set a velocity model first — anchors calibrate the existing model.');
      const cell = view.ilxl && geom
        ? view.ilxl.il * geom.nXl + view.ilxl.xl : 0;
      const ties = warpToTiePoints(tie.warp, buildTwtToTvdss(), {
        wellName: view.wellName, cell,
      });
      const fit = fitWellTie(ties, velocity, { boundaries, dtUs });
      await onApplyVelocity(fit.manifestModel, {
        ...calibrationProvenance(fit),
        source: 'well_tie_warp',
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setCommitBusy(false);
    }
  };

  if (!geom || !dtUs) {
    return (
      <p className="text-xs text-slate-500 p-2" data-testid="synth-empty">
        Load a seismic volume first — the synthetic is sampled onto its time grid
        and compared against its traces at the well.
      </p>
    );
  }
  if (!logsLoading && !sonicWells.length) {
    return (
      <p className="text-xs text-slate-500 p-2" data-testid="synth-empty">
        No well has a sonic (DT) curve — import LAS logs in Well Data Manager;
        they appear here through the shared registry.
      </p>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col gap-2 p-1" data-testid="synth">
      <div className="shrink-0 flex flex-wrap items-center gap-3">
        <label className="text-xs text-slate-400 flex items-center gap-1">
          Well
          <select className={inputCls} value={wellId} onChange={(e) => pickWell(e.target.value)}
            data-testid="synth-well">
            <option value="">—</option>
            {sonicWells.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-400 flex items-center gap-1">
          Sonic
          <select className={inputCls} value={sonicId} onChange={(e) => setSonicId(e.target.value)}
            disabled={!wellId} data-testid="synth-sonic">
            {sonicLogs.map((l) => (
              <option key={l.id} value={l.id}>{`${l.mnemonic} (${l.unit || '?'})`}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-400 flex items-center gap-1">
          Density
          <select className={inputCls} value={densityId} onChange={(e) => setDensityId(e.target.value)}
            disabled={!wellId} data-testid="synth-density">
            <option value="">constant 2.3 g/cc</option>
            {densityLogs.map((l) => (
              <option key={l.id} value={l.id}>{`${l.mnemonic} (${l.unit || '?'})`}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="shrink-0 flex flex-wrap items-center gap-3">
        <label className="text-xs text-slate-400 flex items-center gap-1">
          <input type="radio" className="accent-cyan-500" checked={waveletMode === 'ricker'}
            onChange={() => setWaveletMode('ricker')} data-testid="synth-mode-ricker" />
          Ricker
        </label>
        <label className="text-xs text-slate-400 flex items-center gap-2">
          <input
            type="range" min={10} max={60} step={1} value={freqHz}
            onChange={(e) => setFreqHz(Number(e.target.value))}
            disabled={waveletMode !== 'ricker'}
            data-testid="synth-freq"
          />
          <span className="font-mono" data-testid="synth-freq-value">{freqHz} Hz</span>
        </label>
        <label className="text-xs text-slate-400 flex items-center gap-1">
          <input type="radio" className="accent-cyan-500" checked={waveletMode === 'extracted'}
            onChange={() => setWaveletMode('extracted')} disabled={!extracted}
            data-testid="synth-mode-extracted" />
          Extracted
        </label>
        <Button variant="outline" size="sm" onClick={extractFromSeismic}
          disabled={busy || !wellId} data-testid="synth-extract"
        >
          <Waves className="w-4 h-4 mr-1" />
          Extract from seismic at well
        </Button>
        <label className="text-xs text-slate-400 flex items-center gap-1">
          <input type="checkbox" className="accent-cyan-500" checked={segNormal}
            onChange={(e) => setSegNormal(e.target.checked)} data-testid="synth-polarity" />
          SEG normal polarity
        </label>
        <Button size="sm" className="bg-cyan-600 hover:bg-cyan-500 text-white"
          onClick={run} disabled={busy || !wellId || !sonicId} data-testid="synth-run"
        >
          {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Play className="w-4 h-4 mr-1" />}
          Synthesize
        </Button>
      </div>

      {error && <div className="text-xs text-red-400 shrink-0" data-testid="synth-error">{error}</div>}

      {view && (
        <>
          <div className="shrink-0 flex flex-wrap items-center gap-3 text-xs">
            <span
              className={`rounded px-1.5 py-0.5 border ${view.result.timeSource === 'checkshots'
                ? 'border-emerald-700 text-emerald-400' : 'border-sky-700 text-sky-400'}`}
              data-testid="synth-provenance"
              title="Time-depth source resolved by makeTvdssToTwt — never mixed"
            >
              {`T(z): ${view.result.timeSource === 'checkshots'
                ? (view.derivedCheckshots ? 'checkshots (tie-derived)' : 'checkshots')
                : 'velocity model'}`}
            </span>
            {view.constantDensity && (
              <span className="text-amber-400" data-testid="synth-density-note">
                constant density 2.3 g/cc (no RHOB picked) — RCs reflect velocity contrast only
              </span>
            )}
            {view.note && <span className="text-slate-500" data-testid="synth-note">{view.note}</span>}
            <label className="text-slate-400 flex items-center gap-1">
              Bulk shift (ms)
              <input
                type="number" step={dtMs} className={`${inputCls} w-20`} value={shiftMs}
                onChange={(e) => setShiftMs(Number(e.target.value) || 0)}
                disabled={anchors.length > 0}
                title={anchors.length ? 'Anchors replace the bulk shift while present' : undefined}
                data-testid="synth-shift"
              />
            </label>
            <Button variant="outline" size="sm" onClick={suggest}
              disabled={!view.corridor?.length} data-testid="synth-suggest"
            >
              Suggest
            </Button>
            {suggestion && !suggestion.none && (
              <span className="text-slate-300" data-testid="synth-suggest-result">
                {`best ${suggestion.lagMs > 0 ? '+' : ''}${suggestion.lagMs.toFixed(0)} ms `}
                {`(r = ${suggestion.corr.toFixed(2)})`}
                <Button variant="link" size="sm" className="text-cyan-400 h-auto p-0 ml-1"
                  onClick={() => setShiftMs(suggestion.lagMs)} data-testid="synth-apply-shift"
                >
                  apply
                </Button>
              </span>
            )}
            {suggestion?.none && (
              <span className="text-slate-500" data-testid="synth-suggest-result">
                no usable correlation within ±{MAX_SHIFT_SEARCH_MS} ms
              </span>
            )}
            <span className="text-slate-600">
              {anchors.length
                ? 'anchors are display-side until committed below'
                : 'display-only — the velocity model is not changed'}
            </span>
          </div>

          <div className="shrink-0 flex flex-wrap items-center gap-3 text-xs" data-testid="synth-tie-row">
            <span className="text-slate-400" title="Double-click on the synthetic/seismic tracks to add an anchor; drag its diamond to stretch; double-click an anchor to remove it">
              {`Anchors: ${anchors.length}`}
            </span>
            {anchors.length > 0 && (
              <Button variant="link" size="sm" className="text-slate-400 h-auto p-0"
                onClick={() => { setAnchors([]); setPhase(null); setPhiApplied(false); }}
                data-testid="synth-anchors-clear"
              >
                clear
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={estimatePhase}
              disabled={!view.corridor?.length} data-testid="synth-phase-estimate"
            >
              Estimate phase
            </Button>
            {phase && (
              <span className="text-slate-300" data-testid="synth-phase-result">
                {`${phase.phiDeg.toFixed(0)}° (r ${phase.corr0.toFixed(2)} → ${phase.corr.toFixed(2)})`}
                <Button variant="link" size="sm"
                  className={`h-auto p-0 ml-1 ${phiApplied ? 'text-amber-400' : 'text-cyan-400'}`}
                  onClick={() => setPhiApplied((v) => !v)} data-testid="synth-phase-apply"
                >
                  {phiApplied ? 'remove rotation' : 'apply to display'}
                </Button>
              </span>
            )}
            {qcSummary && (
              <span className="text-slate-400" data-testid="synth-qc-summary"
                title="Windowed correlation of the displayed synthetic vs the centre trace (the colored strip beside the seismic track)"
              >
                {`tie QC: mean r ${qcSummary.mean.toFixed(2)}, min ${qcSummary.min.toFixed(2)}`}
              </span>
            )}
            {anchors.length > 0 && (
              <>
                <Button size="sm" variant="outline" className="border-emerald-700 text-emerald-400"
                  onClick={commitCheckshots}
                  disabled={commitBusy || !onCommitCheckshots}
                  data-testid="synth-commit-checkshots"
                  title="Store the warp as a DERIVED checkshot set on the well (imported checkshots are never overwritten); synthetics and well displays use it from then on"
                >
                  {commitBusy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
                  Commit to checkshots
                </Button>
                <Button size="sm" variant="outline" className="border-sky-700 text-sky-400"
                  onClick={commitCalibration}
                  disabled={commitBusy || !onApplyVelocity}
                  data-testid="synth-commit-velocity"
                  title="Fit the volume's velocity model to the anchors (wellTie least squares) and save it with tie provenance"
                >
                  Calibrate velocity
                </Button>
              </>
            )}
          </div>
          <div className="flex-1 min-h-0 overflow-auto" data-testid="synth-result">
            <canvas
              ref={canvasRef}
              data-testid="synth-canvas"
              style={{ touchAction: 'none' }}
              onPointerDown={onCanvasPointerDown}
              onPointerMove={onCanvasPointerMove}
              onPointerUp={onCanvasPointerUp}
              onPointerLeave={onCanvasPointerUp}
              onDoubleClick={onCanvasDblClick}
            />
          </div>
        </>
      )}
    </div>
  );
}
