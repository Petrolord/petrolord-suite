// One synthetic angle gather as variable-area wiggles on a white canvas
// (Rock Physics Studio U2-003; the suite chart standard: white ground, the
// Petrolord mark). Time runs downward; one trace per angle; positive lobes
// filled. Shared: Rock Physics draws its gather with it, and Seismolord's
// synthetics window draws the gather Rock Physics publishes (U2-012,
// src/lib/rockPhysicsGather.js), so the two apps show one picture.

import React, { useEffect, useRef } from 'react';
import ChartLogo from '@/components/charts/ChartLogo';

const AXIS_W = 46;
const AXIS_H = 34;
const PAD_B = 10;

/**
 * Pixel geometry of a gather (exported for tests: jsdom has no canvas).
 * @returns {{W: number, H: number, spacing: number, pxPerMs: number}}
 */
export function gatherGeometry(nTraces, nSamples, dtMs, { maxHeight = 380, minSpacing = 26 } = {}) {
  const spanMs = Math.max(dtMs, (nSamples - 1) * dtMs);
  // short gathers are stretched (up to 8 px per ms) so the picture and its axis title have room
  const pxPerMs = Math.min(8, (maxHeight - AXIS_H - PAD_B) / spanMs);
  const spacing = Math.max(minSpacing, 30);
  return { W: AXIS_W + nTraces * spacing + 10, H: Math.round(AXIS_H + spanMs * pxPerMs + PAD_B), spacing, pxPerMs };
}

export function drawGather(canvas, { traces, angles, dtMs, gain, events = [], title = '' }) {
  const ctx = canvas.getContext && canvas.getContext('2d');
  if (!ctx || !traces?.length) return;
  const nS = traces[0].length;
  const { W, H, spacing, pxPerMs } = gatherGeometry(traces.length, nS, dtMs);
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  const y = (i) => AXIS_H + i * dtMs * pxPerMs;
  const scale = gain > 0 ? (spacing * 0.9) / gain : 0;

  // time axis (ms, downward) and grid
  ctx.font = '10px ui-sans-serif, system-ui';
  ctx.fillStyle = '#334155';
  ctx.textAlign = 'right';
  const spanMs = (nS - 1) * dtMs;
  const tick = spanMs > 400 ? 100 : spanMs > 160 ? 50 : 20;
  for (let t = 0; t <= spanMs + 1e-9; t += tick) {
    const yy = y(t / dtMs);
    ctx.fillText(`${t}`, AXIS_W - 6, yy + 3);
    ctx.strokeStyle = '#e2e8f0';
    ctx.beginPath(); ctx.moveTo(AXIS_W, yy); ctx.lineTo(W - 4, yy); ctx.stroke();
  }
  ctx.save();
  ctx.translate(10, AXIS_H + (spanMs * pxPerMs) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#0f172a';
  ctx.fillText('TWT from the window top (ms)', 0, 0);
  ctx.restore();

  // angle axis
  ctx.textAlign = 'center';
  ctx.fillStyle = '#0f172a';
  if (title) ctx.fillText(title, AXIS_W + (traces.length * spacing) / 2, 11);
  ctx.fillStyle = '#334155';
  for (let k = 0; k < traces.length; k++) ctx.fillText(`${Number(angles[k].toFixed(1))}°`, AXIS_W + k * spacing + spacing / 2, AXIS_H - 8);

  // events (zone top and base)
  for (const ev of events) {
    const yy = y(ev.sample);
    ctx.strokeStyle = ev.color || '#d97706';
    ctx.setLineDash([5, 3]);
    ctx.beginPath(); ctx.moveTo(AXIS_W, yy); ctx.lineTo(W - 4, yy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = ev.color || '#d97706';
    ctx.textAlign = 'left';
    ctx.fillText(ev.label, AXIS_W + 3, yy - 3);
  }

  // traces: variable area, positive lobes filled
  for (let k = 0; k < traces.length; k++) {
    const tr = traces[k];
    const cx = AXIS_W + k * spacing + spacing / 2;
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.moveTo(cx, y(0));
    for (let i = 0; i < nS; i++) ctx.lineTo(cx + Math.max(0, tr[i]) * scale, y(i));
    ctx.lineTo(cx, y(nS - 1));
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < nS; i++) {
      const xx = cx + tr[i] * scale;
      if (i === 0) ctx.moveTo(xx, y(i)); else ctx.lineTo(xx, y(i));
    }
    ctx.stroke();
  }
}

/**
 * @param {{traces: ArrayLike<number>[], angles: number[], dtMs: number, gain: number,
 *   events?: Array<{sample: number, label: string, color?: string}>, title?: string, testid?: string}} p
 */
export default function GatherCanvas({ traces, angles, dtMs, gain, events = [], title = '', testid = 'rp-gather-canvas' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) drawGather(ref.current, { traces, angles, dtMs, gain, events, title });
  }, [traces, angles, dtMs, gain, events, title]);
  return (
    <div className="bg-white rounded-lg p-2 relative overflow-auto" data-canvas="chart" data-testid={testid} data-traces={traces?.length || 0} data-samples={traces?.[0]?.length || 0}>
      <canvas ref={ref} />
      <ChartLogo />
    </div>
  );
}
