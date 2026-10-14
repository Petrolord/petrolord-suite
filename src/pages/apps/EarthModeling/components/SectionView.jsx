// Section window (Earth Modeling EM3, 2026-09-06): the layer cake
// sliced along a section line, a polyline drawn on the map or the
// straight line between two wells. Zone fills and surface lines are
// sampled by arc length; wells within the projection distance are
// drawn at their nearest point on the line as a GR column through the
// shared track painter (tops ticked, tie residuals shown), the depth
// axis follows the display unit and the vertical exaggeration sets the
// plot height. Dark workstation surface (a section, not an analytic
// chart, so the white chart standard does not apply).

import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { toDisplay } from '@/components/wells/depthModes';
import { sampleAtXY, isNull } from '@/lib/gridding/gridmath';
import { paintTrackBody, PALETTES } from '@/components/wells/trackPainter';
import { pathSamples, sectionScale } from '../services/sectionPath';

const N_SAMPLES = 240;
// the right pad leaves room for the last well's log column (T1 EM-T1-006)
const PAD = { l: 56, r: 60, t: 26, b: 26 };
const ZONE_FILLS = ['rgba(34,197,94,0.22)', 'rgba(59,130,246,0.22)', 'rgba(234,179,8,0.22)', 'rgba(244,114,182,0.22)', 'rgba(168,85,247,0.22)'];
const SURF_STROKES = ['#4ade80', '#60a5fa', '#facc15', '#f472b6', '#c084fc', '#f87171'];
const TRACK_W = 44;
export const SECTION_PROP_LABEL = { phi: 'Porosity', sw: 'Sw', ntg: 'NTG', perm: 'Permeability (md)' };

/** A blue to yellow to red ramp for property fills (t in 0..1). */
export function sectionColour(t) {
  const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  const stops = [[0, [49, 54, 149]], [0.25, [69, 117, 180]], [0.5, [254, 224, 144]], [0.75, [244, 109, 67]], [1, [165, 0, 38]]];
  let k = 0; while (k < stops.length - 2 && x > stops[k + 1][0]) k += 1;
  const [x0, c0] = stops[k]; const [x1, c1] = stops[k + 1];
  const f = (x - x0) / (x1 - x0);
  const c = c0.map((v, i) => Math.round(v + f * (c1[i] - v)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** A GR track object for the shared painter (0 to 150 API, sand below the cut-off filled). */
export function grTrack(values, cutoff = 75) {
  return {
    key: 'gr', title: 'GR', type: 'curve', width: 1, scale: 'linear', min: 0, max: 150,
    curves: [{ name: 'GR', data: values, color: '#4ade80', min: 0, max: 150, scale: 'linear', lineWidth: 1 }],
    fills: [{ mode: 'threshold', a: 0, value: cutoff, side: 'below', color: '#facc15', opacity: 0.35 }],
  };
}

const SectionView = forwardRef(function SectionView({
  spec, clamped = [], surfaceNames = [], zoneNames = [], vertices = null, ties = [],
  projected = [], depthUnit = 'm', ve = 1, width = null, xyToM = 1,
  zones = [], colour = 'zones',
}, ref) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);

  useImperativeHandle(ref, () => ({
    toBlob: () => new Promise((resolve) => (canvasRef.current ? canvasRef.current.toBlob(resolve, 'image/png') : resolve(null))),
  }), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const cssW = width || wrap.clientWidth || 640;
    const dpr = window.devicePixelRatio || 1;
    const paintEmpty = (msg, h = 240) => {
      canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(h * dpr);
      canvas.style.width = `${cssW}px`; canvas.style.height = `${h}px`;
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, cssW, h);
      ctx.fillStyle = '#64748b'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(msg, cssW / 2, h / 2);
      canvas.dataset.plotH = '0';
    };
    if (!spec || !clamped.length) return paintEmpty('Build the model, then draw a section line on the map or pick two wells.');
    let path;
    try { path = pathSamples(vertices || [], N_SAMPLES); } catch (e) { return paintEmpty(e.message); }

    const profiles = clamped.map((z) => {
      const prof = new Array(N_SAMPLES);
      for (let i = 0; i < N_SAMPLES; i++) prof[i] = sampleAtXY(z, spec, path.x[i], path.y[i]);
      return prof;
    });
    let zMin = Infinity; let zMax = -Infinity;
    for (const prof of profiles) for (const v of prof) { if (isNull(v)) continue; if (v < zMin) zMin = v; if (v > zMax) zMax = v; }
    if (!Number.isFinite(zMin)) return paintEmpty('No live framework nodes along this line.');
    // tops within a fifth of the framework range join the window; the GR
    // log is clipped to the window rather than stretching it to TD
    const margin = 0.2 * (zMax - zMin || 10);
    for (const p of projected) {
      for (const t of p.tops || []) {
        if (t.tvdss >= zMin - margin && t.tvdss < zMin) zMin = t.tvdss;
        if (t.tvdss <= zMax + margin && t.tvdss > zMax) zMax = t.tvdss;
      }
    }
    const zPad = 0.06 * (zMax - zMin || 10);
    zMin -= zPad; zMax += zPad;

    const plotW = cssW - PAD.l - PAD.r;
    // EM-U1-001: horizontal metres on any frame, so VE compares metres with metres
    const totalM = path.total * xyToM;
    const fitH = (wrap.clientHeight || 0) - PAD.t - PAD.b - 8;
    const sc = sectionScale({ total: totalM, zMin, zMax, plotW, ve, fitH });
    const cssH = sc.plotH + PAD.t + PAD.b;
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
    canvas.style.width = `${cssW}px`; canvas.style.height = `${cssH}px`;
    canvas.dataset.plotH = String(Math.round(sc.plotH));
    canvas.dataset.exaggeration = sc.exaggeration.toFixed(2);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, cssW, cssH);

    const xPx = (s) => PAD.l + (s / path.total) * plotW;
    const yPx = (z) => PAD.t + (z - zMin) * sc.vScale;

    // Ekene walk: a property painted in the zones (each proportional layer
    // its own band), sampled at the section's points
    const propKey = colour !== 'zones' ? colour : null;
    let propRange = null;
    if (propKey) {
      let lo = Infinity; let hi = -Infinity;
      const bands = [];
      zones.forEach((z) => {
        const frames = z.layers?.length ? z.layers : null;
        const zi = zones.indexOf(z);
        const list = frames ? frames.map((L) => ({ top: L.top, base: L.base, g: L.props?.[propKey] })) : [{ top: clamped[zi], base: clamped[zi + 1], g: z.props?.[propKey] }];
        for (const b of list) {
          if (!b.g) continue;
          const vals = new Array(N_SAMPLES); const tz = new Array(N_SAMPLES); const bz = new Array(N_SAMPLES);
          for (let i = 0; i < N_SAMPLES; i++) {
            const v = sampleAtXY(b.g, spec, path.x[i], path.y[i]);
            vals[i] = isNull(v) || !Number.isFinite(v) ? null : v;
            tz[i] = sampleAtXY(b.top, spec, path.x[i], path.y[i]); bz[i] = sampleAtXY(b.base, spec, path.x[i], path.y[i]);
            if (vals[i] !== null) { lo = Math.min(lo, vals[i]); hi = Math.max(hi, vals[i]); }
          }
          bands.push({ vals, tz, bz });
        }
      });
      if (Number.isFinite(lo)) {
        if (!(hi > lo)) { lo -= 0.005; hi += 0.005; }
        propRange = { lo, hi };
        for (const b of bands) {
          for (let i = 0; i + 1 < N_SAMPLES; i++) {
            const v = b.vals[i];
            if (v === null || isNull(b.tz[i]) || isNull(b.bz[i])) continue;
            ctx.fillStyle = sectionColour((v - lo) / (hi - lo));
            const x0 = xPx(path.s[i]); const x1 = xPx(path.s[i + 1]) + 0.6;
            ctx.fillRect(x0, yPx(b.tz[i]), x1 - x0, Math.max(0.6, yPx(b.bz[i]) - yPx(b.tz[i])));
          }
        }
      }
    }
    for (let s = 0; s + 1 < profiles.length && !propRange; s++) {
      ctx.fillStyle = ZONE_FILLS[s % ZONE_FILLS.length];
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < N_SAMPLES; i++) {
        const v = profiles[s][i];
        if (isNull(v)) continue;
        if (!started) { ctx.moveTo(xPx(path.s[i]), yPx(v)); started = true; } else ctx.lineTo(xPx(path.s[i]), yPx(v));
      }
      for (let i = N_SAMPLES - 1; i >= 0; i--) {
        const v = profiles[s + 1][i];
        if (isNull(v)) continue;
        ctx.lineTo(xPx(path.s[i]), yPx(v));
      }
      if (started) { ctx.closePath(); ctx.fill(); }
    }
    profiles.forEach((prof, s) => {
      ctx.strokeStyle = SURF_STROKES[s % SURF_STROKES.length];
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let pen = false;
      for (let i = 0; i < N_SAMPLES; i++) {
        const v = prof[i];
        if (isNull(v)) { pen = false; continue; }
        if (pen) ctx.lineTo(xPx(path.s[i]), yPx(v)); else { ctx.moveTo(xPx(path.s[i]), yPx(v)); pen = true; }
      }
      ctx.stroke();
      const name = surfaceNames[s];
      // named a third of the way along, clear of the well tie labels at the ends
      const live = prof.map((v, k) => (isNull(v) ? -1 : k)).filter((k) => k >= 0);
      const at = live.length ? live[Math.floor(live.length / 3)] : -1;
      if (name && at >= 0) {
        ctx.fillStyle = SURF_STROKES[s % SURF_STROKES.length];
        ctx.font = '10px sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(name, xPx(path.s[at]) + 4, yPx(prof[at]) - 3);
      }
    });
    for (let s = 0; s + 1 < profiles.length; s++) {
      const mid = Math.floor(N_SAMPLES / 2);
      const a = profiles[s][mid]; const b = profiles[s + 1][mid];
      if (isNull(a) || isNull(b) || !zoneNames[s]) continue;
      ctx.fillStyle = '#e2e8f0'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(zoneNames[s], xPx(path.s[mid]), (yPx(a) + yPx(b)) / 2 + 4);
    }

    // Ekene walk: each zone's oil-water and gas-oil contacts, dashed, where the zone is above them
    zones.forEach((z, zi) => {
      const f = z.fluids || {};
      for (const [kind, colourC, label] of [['owc', '#38bdf8', 'OWC'], ['goc', '#f87171', 'GOC']]) {
        const c = f[kind];
        if (!Number.isFinite(c)) continue;
        const top = profiles[zi]; const bot = profiles[zi + 1];
        if (!top || !bot) continue;
        ctx.strokeStyle = colourC; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
        ctx.beginPath();
        let pen = false; let lastX = null;
        for (let i = 0; i < N_SAMPLES; i++) {
          const inside = !isNull(top[i]) && !isNull(bot[i]) && top[i] < c && bot[i] > c;
          if (!inside) { pen = false; continue; }
          const x = xPx(path.s[i]);
          if (pen) ctx.lineTo(x, yPx(c)); else { ctx.moveTo(x, yPx(c)); pen = true; }
          lastX = x;
        }
        ctx.stroke(); ctx.setLineDash([]);
        if (lastX !== null) {
          ctx.fillStyle = colourC; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
          ctx.fillText(`${label} ${Math.round(toDisplay(c, depthUnit)).toLocaleString('en-GB')} ${depthUnit}`, lastX - 4, yPx(c) - 4);
        }
      }
    });
    if (propRange) {
      // colour bar, top right inside the plot
      const bw = 120; const bx = cssW - PAD.r - bw - 8; const by = PAD.t + 6;
      for (let k = 0; k < bw; k++) { ctx.fillStyle = sectionColour(k / (bw - 1)); ctx.fillRect(bx + k, by, 1, 8); }
      ctx.fillStyle = '#e2e8f0'; ctx.font = '9px sans-serif';
      const fmtP = (v) => (propKey === 'perm' ? v.toFixed(0) : v.toFixed(3));
      ctx.textAlign = 'left'; ctx.fillText(fmtP(propRange.lo), bx, by + 18);
      ctx.textAlign = 'right'; ctx.fillText(fmtP(propRange.hi), bx + bw, by + 18);
      ctx.textAlign = 'center'; ctx.fillText(SECTION_PROP_LABEL[propKey] || propKey, bx + bw / 2, by + 18);
    }

    // projected wells: stick, GR column through the shared painter, tops.
    // Wells on the same spot (a pad, or a copy of a well) share one label.
    const labelOf = new Map();
    const labelled = [];
    for (const p of projected) {
      const px = xPx(p.s);
      const near = labelled.find((q) => Math.abs(q.px - px) < 24);
      if (near) { near.names.push(p.well.name); labelOf.set(p, null); } else { const e = { px, names: [p.well.name], p }; labelled.push(e); labelOf.set(p, e); }
    }
    for (const p of projected) {
      const px = xPx(p.s);
      ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(px, PAD.t); ctx.lineTo(px, cssH - PAD.b); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#e2e8f0'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      const lab = labelOf.get(p);
      if (lab) {
        // kept inside the canvas: a well at the end of the line was cut at the edge
        const text = `${lab.names.join(', ')}${p.offset * xyToM > 1 ? ` (${(p.offset * xyToM).toFixed(0)} m off)` : ''}`;
        const half = ctx.measureText(text).width / 2;
        ctx.fillText(text, Math.min(cssW - half - 4, Math.max(half + 4, px)), 12);
      }
      if (p.gr && p.gr.tvdss.length > 1) {
        const depth = p.gr.tvdss;
        let i0 = 0; while (i0 < depth.length - 1 && depth[i0] < zMin) i0 += 1;
        let i1 = depth.length - 1; while (i1 > 0 && depth[i1] > zMax) i1 -= 1;
        if (i1 > i0) {
          ctx.save();
          ctx.globalAlpha = 0.9;
          paintTrackBody(ctx, {
            track: grTrack(p.gr.values), depth, yOf: yPx, i0, i1,
            x0: px + 3, w: TRACK_W, plotTop: PAD.t, plotH: sc.plotH, headerH: null, palette: PALETTES.light,
          });
          ctx.restore();
          ctx.fillStyle = '#94a3b8'; ctx.font = '9px sans-serif'; ctx.textAlign = 'left';
          ctx.fillText('GR', px + 5, PAD.t + 10);
        }
      }
      for (const t of p.tops || []) {
        const py = yPx(t.tvdss);
        if (py < PAD.t || py > cssH - PAD.b) continue;
        ctx.strokeStyle = '#f8fafc'; ctx.beginPath(); ctx.moveTo(px - 6, py); ctx.lineTo(px + 2, py); ctx.stroke();
        ctx.fillStyle = '#cbd5e1'; ctx.font = '9px sans-serif'; ctx.textAlign = 'right';
        ctx.fillText(`${t.name}${Number.isFinite(t.residualM) ? ` ${t.residualM >= 0 ? '+' : ''}${toDisplay(t.residualM, depthUnit).toFixed(1)}` : ''}`, px - 8, py + 3);
      }
    }

    // axes
    ctx.fillStyle = '#94a3b8'; ctx.font = '9px sans-serif'; ctx.textAlign = 'right';
    // round ticks in the display unit (T1 EM-T1-006)
    const nTicks = Math.max(4, Math.min(12, Math.round(sc.plotH / 60)));
    const dMin = toDisplay(zMin, depthUnit); const dMax = toDisplay(zMax, depthUnit);
    const raw = (dMax - dMin) / nTicks;
    const mag = 10 ** Math.floor(Math.log10(raw > 0 ? raw : 1));
    const stepD = [1, 2, 5, 10].map((m) => m * mag).find((v) => v >= raw) || 10 * mag;
    const perUnit = (zMax - zMin) / ((dMax - dMin) || 1);
    for (let d = Math.ceil(dMin / stepD) * stepD; d <= dMax + 1e-9; d += stepD) {
      const z = zMin + (d - dMin) * perUnit;
      ctx.fillText(String(Math.round(d)), PAD.l - 6, yPx(z) + 3);
      ctx.strokeStyle = 'rgba(148,163,184,0.15)'; ctx.beginPath(); ctx.moveTo(PAD.l, yPx(z)); ctx.lineTo(cssW - PAD.r, yPx(z)); ctx.stroke();
    }
    ctx.textAlign = 'center';
    const along = depthUnit === 'ft' ? `${Math.round(totalM / 0.3048).toLocaleString('en-GB')} ft` : `${totalM.toFixed(0)} m`;
    ctx.fillText(`${along} along the line, vertical exaggeration ${sc.exaggeration.toFixed(1)}x`, (PAD.l + cssW - PAD.r) / 2, cssH - 8);
    ctx.save(); ctx.translate(12, cssH / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(`TVDSS (${depthUnit})`, 0, 0); ctx.restore();
  }, [spec, clamped, surfaceNames, zoneNames, vertices, ties, projected, depthUnit, ve, width, xyToM, zones, colour]);

  return (
    <div ref={wrapRef} className="w-full h-full min-h-0 overflow-auto" data-testid="em-section-wrap">
      {/* design system (W4B): the section is painted for a dark ground and stays dark in both themes */}
      <canvas ref={canvasRef} data-testid="em-section-canvas" data-canvas="dark" className="rounded border border-slate-800" />
    </div>
  );
});

export default SectionView;
