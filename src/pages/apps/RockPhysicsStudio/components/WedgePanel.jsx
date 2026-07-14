// Wedge panel (G6.4): two-interface wedge synthetics on the shared
// waveform primitives — variable-area trace panel on a raw canvas
// (the SyntheticsPanel seismic-workstation idiom, dark) plus the
// tuning curve as a white Recharts card (suite chart standard) and
// the measured tuning thickness.

import React, { useEffect, useMemo, useRef } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Label, ReferenceLine,
} from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, CHART_MARGINS, GRID_STYLE, TOOLTIP_STYLE,
} from '@/utils/chartTheme';
import { wedgePanel, tuningCurve, tuningThicknessMs } from '../engine/wedge';

const AXIS_TICK = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };
const AXIS_LINE = { stroke: CHART_COLORS.axisLine, strokeWidth: 1 };

const AXIS_W = 44;
const AXIS_H = 20;
const SPACING = 9;      // px per trace column
const PX_PER_MS = 2;

function drawWedge(canvas, panel) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return; // jsdom
  const { traces, thicknessesMs, t0, dtMs } = panel;
  const nS = traces[0].length;
  const W = AXIS_W + traces.length * SPACING + 12;
  const H = AXIS_H + nS * dtMs * PX_PER_MS + 12;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.fillStyle = '#0b1220';
  ctx.fillRect(0, 0, W, H);

  let maxAbs = 1e-12;
  for (const tr of traces) for (const v of tr) maxAbs = Math.max(maxAbs, Math.abs(v));
  const scale = (SPACING * 1.6) / maxAbs;
  const y = (i) => AXIS_H + i * dtMs * PX_PER_MS;

  // time axis
  ctx.fillStyle = '#64748b';
  ctx.font = '10px ui-sans-serif, system-ui';
  ctx.textAlign = 'right';
  const spanMs = nS * dtMs;
  for (let t = 0; t <= spanMs; t += 20) {
    const yy = y(t / dtMs);
    ctx.fillText(`${t}`, AXIS_W - 6, yy + 3);
    ctx.strokeStyle = 'rgba(100,116,139,0.15)';
    ctx.beginPath();
    ctx.moveTo(AXIS_W, yy);
    ctx.lineTo(W, yy);
    ctx.stroke();
  }

  // thickness axis
  ctx.textAlign = 'center';
  for (let k = 0; k < thicknessesMs.length; k++) {
    if (thicknessesMs[k] % 10 === 0) {
      ctx.fillText(`${thicknessesMs[k]}`, AXIS_W + k * SPACING + SPACING / 2, AXIS_H - 8);
    }
  }

  // traces: variable-area wiggles (positive lobes filled)
  for (let k = 0; k < traces.length; k++) {
    const tr = traces[k];
    const cx = AXIS_W + k * SPACING + SPACING / 2;

    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#38bdf8';
    let open = false;
    ctx.beginPath();
    for (let i = 0; i < tr.length; i++) {
      const x = cx + tr[i] * scale;
      if (x > cx) {
        if (!open) { ctx.moveTo(cx, y(i)); open = true; }
        ctx.lineTo(x, y(i));
      } else if (open) {
        ctx.lineTo(cx, y(i));
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        open = false;
      }
    }
    if (open) { ctx.lineTo(cx, y(tr.length - 1)); ctx.closePath(); ctx.fill(); }
    ctx.globalAlpha = 1;

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    for (let i = 0; i < tr.length; i++) {
      const x = cx + tr[i] * scale;
      if (i === 0) ctx.moveTo(x, y(i)); else ctx.lineTo(x, y(i));
    }
    ctx.stroke();
  }

  // wedge geometry: top interface (flat) and base (dipping)
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(AXIS_W, y(t0));
  ctx.lineTo(W - 12, y(t0));
  ctx.stroke();
  ctx.beginPath();
  for (let k = 0; k < thicknessesMs.length; k++) {
    const xx = AXIS_W + k * SPACING + SPACING / 2;
    const yy = y(t0 + thicknessesMs[k] / dtMs);
    if (k === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
  }
  ctx.stroke();
}

function NumField({ id, label, value, onChange }) {
  return (
    <label className="flex items-center gap-1 text-[12px] text-slate-300">
      {label}
      <input
        data-testid={`rp-wedge-${id}`}
        type="number"
        step="any"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-16 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-right
          text-slate-100 focus:outline-none focus:border-cyan-600"
      />
    </label>
  );
}

export default function WedgePanel({ wedge, onWedgeChange }) {
  const canvasRef = useRef(null);
  const patch = (p) => onWedgeChange({ ...wedge, ...p });

  const result = useMemo(() => {
    const { rcTop, rcBase, freqHz, dtMs, maxThicknessMs } = wedge;
    if (![rcTop, rcBase, freqHz, dtMs, maxThicknessMs].every(Number.isFinite)) {
      return { error: 'All wedge parameters must be numbers.' };
    }
    try {
      const panel = wedgePanel(rcTop, rcBase, freqHz, dtMs, maxThicknessMs);
      const { thicknessesMs, amplitudes } = tuningCurve(rcTop, rcBase, freqHz, dtMs, maxThicknessMs);
      return {
        panel,
        tuning: thicknessesMs.map((t, i) => ({ thickness: t, amplitude: amplitudes[i] })),
        tuningMs: tuningThicknessMs(amplitudes, dtMs),
      };
    } catch (e) {
      return { error: e.message };
    }
  }, [wedge]);

  useEffect(() => {
    if (canvasRef.current && result?.panel) drawWedge(canvasRef.current, result.panel);
  }, [result]);

  return (
    <div className="h-full min-h-0 overflow-y-auto p-3 space-y-3" data-testid="rp-wedge-panel">
      <div className="flex flex-wrap items-center gap-3">
        <NumField id="rctop" label="RC top" value={wedge.rcTop} onChange={(v) => patch({ rcTop: v })} />
        <NumField id="rcbase" label="RC base" value={wedge.rcBase} onChange={(v) => patch({ rcBase: v })} />
        <NumField id="freq" label="Ricker f (Hz)" value={wedge.freqHz} onChange={(v) => patch({ freqHz: v })} />
        <NumField id="dt" label="dt (ms)" value={wedge.dtMs} onChange={(v) => patch({ dtMs: v })} />
        <NumField id="max" label="max thickness (ms)" value={wedge.maxThicknessMs} onChange={(v) => patch({ maxThicknessMs: v })} />
        {result && !result.error && (
          <span className="ml-auto text-[13px] text-slate-200">
            tuning thickness{' '}
            <b data-testid="rp-wedge-tuning">{result.tuningMs}</b> ms
          </span>
        )}
      </div>

      {result?.error && <p className="text-[12px] text-amber-400" data-testid="rp-wedge-error">{result.error}</p>}

      {result && !result.error && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
          <div className="rounded border border-slate-800 overflow-auto" data-testid="rp-wedge-canvas">
            <canvas ref={canvasRef} />
            <div className="px-2 py-1 text-[11px] text-slate-500">
              thickness (ms) across · TWT (ms) down · amber = wedge top/base
            </div>
          </div>

          <div className="bg-white rounded-lg p-3 relative" style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={result.tuning} margin={CHART_MARGINS.standard}>
                <CartesianGrid {...GRID_STYLE} />
                <XAxis dataKey="thickness" type="number" domain={[0, wedge.maxThicknessMs]} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={AXIS_LINE}>
                  <Label value="Wedge thickness (ms)" position="insideBottom" offset={-5} style={{ fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }} />
                </XAxis>
                <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={AXIS_LINE} tickFormatter={(v) => v.toFixed(2)}>
                  <Label value="Peak |amplitude| at top" angle={-90} position="insideLeft" style={{ fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }} />
                </YAxis>
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(v) => v.toFixed(4)}
                  labelFormatter={(v) => `${v} ms`}
                />
                <ReferenceLine
                  x={result.tuningMs}
                  stroke="#d97706"
                  strokeDasharray="4 3"
                  label={{ value: `tuning ${result.tuningMs} ms`, position: 'top', fill: CHART_COLORS.axisText, fontSize: 11 }}
                />
                <Line type="monotone" dataKey="amplitude" stroke="#0284c7" strokeWidth={2} dot={false} name="tuning curve" />
              </LineChart>
            </ResponsiveContainer>
            <ChartLogo />
          </div>
        </div>
      )}
    </div>
  );
}
