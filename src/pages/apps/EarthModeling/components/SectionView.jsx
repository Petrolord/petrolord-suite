// Cross-section viewport (Earth Modeling G8.2): the layer-cake sliced
// along a straight line between two picked wells — clamped surfaces
// sampled with the shared bilinear math, zones filled between
// consecutive surfaces, well sticks with their picked tops (TVDSS)
// posted at the ends. Dark workstation surface (a section, not an
// analytic chart). Canvas.

import React, { useEffect, useRef } from 'react';
import { sampleAtXY, isNull } from '@/lib/gridding/gridmath';

const ZONE_FILLS = ['rgba(56,189,248,0.35)', 'rgba(52,211,153,0.35)', 'rgba(251,191,36,0.35)', 'rgba(232,121,249,0.35)'];
const SURF_STROKES = ['#38bdf8', '#34d399', '#fbbf24', '#e879f9', '#f87171'];
const PAD = { l: 56, r: 24, t: 20, b: 28 };
const N_SAMPLES = 200;

export default function SectionView({
  spec, clamped = [], surfaceNames = [], zoneNames = [], wellA, wellB, ties = [], height = 480,
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const cssW = wrap.clientWidth || 640;
    const cssH = height;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, cssW, cssH);
    if (!spec || !clamped.length || !wellA || !wellB) {
      ctx.fillStyle = '#64748b';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Pick two wells to cut a section.', cssW / 2, cssH / 2);
      return;
    }

    const ax = wellA.surface_x;
    const ay = wellA.surface_y;
    const bx = wellB.surface_x;
    const by = wellB.surface_y;
    const totalDist = Math.hypot(bx - ax, by - ay) || 1;

    // sample every surface along the line
    const profiles = clamped.map((z) => {
      const prof = new Array(N_SAMPLES);
      for (let i = 0; i < N_SAMPLES; i++) {
        const f = i / (N_SAMPLES - 1);
        prof[i] = sampleAtXY(z, spec, ax + f * (bx - ax), ay + f * (by - ay));
      }
      return prof;
    });

    let zMin = Infinity;
    let zMax = -Infinity;
    for (const prof of profiles) {
      for (const v of prof) {
        if (isNull(v)) continue;
        if (v < zMin) zMin = v;
        if (v > zMax) zMax = v;
      }
    }
    const tieRows = ties.filter((t) => (t.well === wellA.name || t.well === wellB.name) && t.residualM !== null);
    for (const t of tieRows) {
      if (t.tvdss < zMin) zMin = t.tvdss;
      if (t.tvdss > zMax) zMax = t.tvdss;
    }
    if (!Number.isFinite(zMin)) {
      ctx.fillStyle = '#64748b';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No live framework nodes along this line.', cssW / 2, cssH / 2);
      return;
    }
    const zPad = 0.08 * (zMax - zMin || 10);
    zMin -= zPad; zMax += zPad;

    const xPx = (f) => PAD.l + f * (cssW - PAD.l - PAD.r);
    const yPx = (z) => PAD.t + ((z - zMin) / (zMax - zMin)) * (cssH - PAD.t - PAD.b); // depth increases DOWN

    // zone fills between consecutive surfaces
    for (let s = 0; s + 1 < profiles.length; s++) {
      ctx.fillStyle = ZONE_FILLS[s % ZONE_FILLS.length];
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < N_SAMPLES; i++) {
        const v = profiles[s][i];
        if (isNull(v)) continue;
        const px = xPx(i / (N_SAMPLES - 1));
        if (!started) { ctx.moveTo(px, yPx(v)); started = true; } else ctx.lineTo(px, yPx(v));
      }
      for (let i = N_SAMPLES - 1; i >= 0; i--) {
        const v = profiles[s + 1][i];
        if (isNull(v)) continue;
        ctx.lineTo(xPx(i / (N_SAMPLES - 1)), yPx(v));
      }
      if (started) { ctx.closePath(); ctx.fill(); }
    }

    // surface lines
    profiles.forEach((prof, s) => {
      ctx.strokeStyle = SURF_STROKES[s % SURF_STROKES.length];
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let pen = false;
      for (let i = 0; i < N_SAMPLES; i++) {
        const v = prof[i];
        if (isNull(v)) { pen = false; continue; }
        const px = xPx(i / (N_SAMPLES - 1));
        if (pen) ctx.lineTo(px, yPx(v)); else { ctx.moveTo(px, yPx(v)); pen = true; }
      }
      ctx.stroke();
      const name = surfaceNames[s];
      if (name && !isNull(prof[0])) {
        ctx.fillStyle = SURF_STROKES[s % SURF_STROKES.length];
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(name, PAD.l + 4, yPx(prof[0]) - 3);
      }
    });

    // zone labels mid-section
    for (let s = 0; s + 1 < profiles.length; s++) {
      const mid = Math.floor(N_SAMPLES / 2);
      const a = profiles[s][mid];
      const b = profiles[s + 1][mid];
      if (isNull(a) || isNull(b) || !zoneNames[s]) continue;
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(zoneNames[s], xPx(0.5), (yPx(a) + yPx(b)) / 2 + 4);
    }

    // well sticks + tie ticks
    for (const [w, f] of [[wellA, 0], [wellB, 1]]) {
      const px = xPx(f);
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(px, PAD.t);
      ctx.lineTo(px, cssH - PAD.b);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(w.name, px, 12);
      for (const t of tieRows.filter((r) => r.well === w.name)) {
        const py = yPx(t.tvdss);
        ctx.strokeStyle = '#f8fafc';
        ctx.beginPath();
        ctx.moveTo(px - 5, py);
        ctx.lineTo(px + 5, py);
        ctx.stroke();
        ctx.fillStyle = '#94a3b8';
        ctx.font = '9px sans-serif';
        ctx.textAlign = f === 0 ? 'left' : 'right';
        ctx.fillText(t.top, px + (f === 0 ? 7 : -7), py + 3);
      }
    }

    // depth axis
    ctx.fillStyle = '#94a3b8';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'right';
    const nTicks = 6;
    for (let i = 0; i <= nTicks; i++) {
      const z = zMin + (i / nTicks) * (zMax - zMin);
      ctx.fillText(z.toFixed(0), PAD.l - 6, yPx(z) + 3);
      ctx.strokeStyle = 'rgba(148,163,184,0.15)';
      ctx.beginPath();
      ctx.moveTo(PAD.l, yPx(z));
      ctx.lineTo(cssW - PAD.r, yPx(z));
      ctx.stroke();
    }
    ctx.textAlign = 'center';
    ctx.fillText(`${totalDist.toFixed(0)} m`, (PAD.l + cssW - PAD.r) / 2, cssH - 8);
    ctx.save();
    ctx.translate(12, cssH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('TVDSS (m)', 0, 0);
    ctx.restore();
  }, [spec, clamped, surfaceNames, zoneNames, wellA, wellB, ties, height]);

  return (
    <div ref={wrapRef} className="w-full" data-testid="em-section-wrap">
      <canvas ref={canvasRef} data-testid="em-section-canvas" className="rounded border border-slate-800" />
    </div>
  );
}
