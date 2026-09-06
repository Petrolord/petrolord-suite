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
const PAD = { l: 56, r: 16, t: 26, b: 26 };
const ZONE_FILLS = ['rgba(34,197,94,0.22)', 'rgba(59,130,246,0.22)', 'rgba(234,179,8,0.22)', 'rgba(244,114,182,0.22)', 'rgba(168,85,247,0.22)'];
const SURF_STROKES = ['#4ade80', '#60a5fa', '#facc15', '#f472b6', '#c084fc', '#f87171'];
const TRACK_W = 44;

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
  projected = [], depthUnit = 'm', ve = 1, width = null,
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
    const sc = sectionScale({ total: path.total, zMin, zMax, plotW, ve });
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

    for (let s = 0; s + 1 < profiles.length; s++) {
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
      const first = prof.findIndex((v) => !isNull(v));
      if (name && first >= 0) {
        ctx.fillStyle = SURF_STROKES[s % SURF_STROKES.length];
        ctx.font = '10px sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(name, xPx(path.s[first]) + 4, yPx(prof[first]) - 3);
      }
    });
    for (let s = 0; s + 1 < profiles.length; s++) {
      const mid = Math.floor(N_SAMPLES / 2);
      const a = profiles[s][mid]; const b = profiles[s + 1][mid];
      if (isNull(a) || isNull(b) || !zoneNames[s]) continue;
      ctx.fillStyle = '#e2e8f0'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(zoneNames[s], xPx(path.s[mid]), (yPx(a) + yPx(b)) / 2 + 4);
    }

    // projected wells: stick, GR column through the shared painter, tops
    for (const p of projected) {
      const px = xPx(p.s);
      ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(px, PAD.t); ctx.lineTo(px, cssH - PAD.b); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#e2e8f0'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`${p.well.name}${p.offset > 1 ? ` (${p.offset.toFixed(0)} m off)` : ''}`, px, 12);
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
    const nTicks = Math.max(4, Math.min(12, Math.round(sc.plotH / 60)));
    for (let i = 0; i <= nTicks; i++) {
      const z = zMin + (i / nTicks) * (zMax - zMin);
      ctx.fillText(toDisplay(z, depthUnit).toFixed(0), PAD.l - 6, yPx(z) + 3);
      ctx.strokeStyle = 'rgba(148,163,184,0.15)'; ctx.beginPath(); ctx.moveTo(PAD.l, yPx(z)); ctx.lineTo(cssW - PAD.r, yPx(z)); ctx.stroke();
    }
    ctx.textAlign = 'center';
    ctx.fillText(`${path.total.toFixed(0)} m along the line, vertical exaggeration ${sc.exaggeration.toFixed(1)}x`, (PAD.l + cssW - PAD.r) / 2, cssH - 8);
    ctx.save(); ctx.translate(12, cssH / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(`TVDSS (${depthUnit})`, 0, 0); ctx.restore();
  }, [spec, clamped, surfaceNames, zoneNames, vertices, ties, projected, depthUnit, ve, width]);

  return (
    <div ref={wrapRef} className="w-full overflow-auto" data-testid="em-section-wrap">
      <canvas ref={canvasRef} data-testid="em-section-canvas" className="rounded border border-slate-800" />
    </div>
  );
});

export default SectionView;
