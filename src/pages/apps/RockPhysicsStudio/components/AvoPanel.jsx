// AVO panel (G6.4): interface from a registry top (mean halfspaces
// over an averaging window) or manual halfspaces; exact Zoeppritz vs
// Shuey/Aki-Richards angle curves and the intercept-gradient
// crossplot with Rutherford-Williams class bands. White Recharts
// cards + ChartLogo (suite chart standard).

import React, { useMemo } from 'react';
import {
  ResponsiveContainer, LineChart, Line, ScatterChart, Scatter, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, Label, ReferenceArea, ReferenceLine,
} from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, CHART_MARGINS, GRID_STYLE, TOOLTIP_STYLE, LEGEND_PROPS,
} from '@/utils/chartTheme';
import { zoeppritzRpp, akiRichards, shuey, avoClass } from '../engine/avo';
import { meanAt } from '../services/prep';

const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '—');
const f4 = (v) => (Number.isFinite(v) ? v.toFixed(4) : '—');

const AXIS_TICK = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };
const AXIS_LINE = { stroke: CHART_COLORS.axisLine, strokeWidth: 1 };

// |A| band treated as class II (engine avoClass default)
const CLASS2_BAND = 0.02;

function windowIndices(depth, from, to) {
  const idx = [];
  for (let i = 0; i < depth.length; i++) {
    if (depth[i] > from && depth[i] < to) idx.push(i);
  }
  return idx;
}

function halfspaceFromWindow(model, from, to) {
  const idx = windowIndices(model.depth, from, to);
  return {
    vp: meanAt(model.vp, idx),
    vs: meanAt(model.vs, idx),
    rho: meanAt(model.rho, idx),
  };
}

function HalfspaceInputs({ side, hs, onChange }) {
  return (
    <div className="flex items-center gap-2 text-[12px] text-slate-300">
      <span className="w-12">{side}</span>
      {['vp', 'vs', 'rho'].map((k) => (
        <input
          key={k}
          data-testid={`rp-avo-${side.toLowerCase()}-${k}`}
          type="number"
          step="any"
          value={hs[k]}
          onChange={(e) => onChange({ ...hs, [k]: parseFloat(e.target.value) })}
          className="w-20 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-right
            text-slate-100 focus:outline-none focus:border-cyan-600"
          title={`${side} ${k} (SI)`}
        />
      ))}
    </div>
  );
}

export default function AvoPanel({ model, tops, avo, onAvoChange }) {
  const patch = (p) => onAvoChange({ ...avo, ...p });

  const top = tops.find((t) => t.id === avo.topId) || tops[0] || null;

  const halfspaces = useMemo(() => {
    if (avo.mode === 'manual') return { upper: avo.upper, lower: avo.lower };
    if (!model || !top) return null;
    const w = avo.windowM;
    return {
      upper: halfspaceFromWindow(model, top.md_m - w, top.md_m),
      lower: halfspaceFromWindow(model, top.md_m, top.md_m + w),
    };
  }, [avo, model, top]);

  const result = useMemo(() => {
    if (!halfspaces) return null;
    const { upper: u, lower: l } = halfspaces;
    const vals = [u.vp, u.vs, u.rho, l.vp, l.vs, l.rho];
    if (!vals.every(Number.isFinite)) return { error: 'Both halfspaces need finite Vp, Vs and ρ.' };
    try {
      const { a, b, c } = shuey(u.vp, u.vs, u.rho, l.vp, l.vs, l.rho, 0);
      const cls = avoClass(a, b);
      const curve = [];
      for (let th = 0; th <= avo.maxTheta; th += 1) {
        const z = zoeppritzRpp(u.vp, u.vs, u.rho, l.vp, l.vs, l.rho, th);
        const sh = shuey(u.vp, u.vs, u.rho, l.vp, l.vs, l.rho, th, { threeTerm: false }).r;
        let ar = null;
        try { ar = akiRichards(u.vp, u.vs, u.rho, l.vp, l.vs, l.rho, th); } catch { /* past critical */ }
        curve.push({ theta: th, zoeppritz: z.re, shuey2: sh, akiRichards: ar });
      }
      return { a, b, c, cls, curve };
    } catch (e) {
      return { error: e.message };
    }
  }, [halfspaces, avo.maxTheta]);

  return (
    <div className="h-full min-h-0 overflow-y-auto p-3 space-y-3" data-testid="rp-avo-panel">
      <div className="flex flex-wrap items-center gap-3 text-[12px] text-slate-300">
        <div className="flex items-center gap-1">
          {['top', 'manual'].map((m) => (
            <button
              key={m}
              type="button"
              data-testid={`rp-avo-mode-${m}`}
              className={`px-2 py-0.5 rounded border text-xs
                ${avo.mode === m ? 'border-cyan-500/60 text-cyan-300' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}
              onClick={() => patch({ mode: m })}
            >
              {m === 'top' ? 'From top' : 'Manual halfspaces'}
            </button>
          ))}
        </div>
        {avo.mode === 'top' && (
          <>
            <select
              data-testid="rp-avo-top-select"
              value={top?.id || ''}
              onChange={(e) => patch({ topId: e.target.value })}
              className="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-slate-100"
            >
              {tops.map((t) => (
                <option key={t.id} value={t.id}>{`${t.name} (${t.md_m} m)`}</option>
              ))}
            </select>
            <label className="flex items-center gap-1">
              window ±
              <input
                data-testid="rp-avo-window"
                type="number"
                step="any"
                value={avo.windowM}
                onChange={(e) => patch({ windowM: parseFloat(e.target.value) || 0 })}
                className="w-14 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-right text-slate-100"
              />
              m
            </label>
            {!tops.length && <span className="text-slate-500">no tops on this well</span>}
          </>
        )}
        <label className="flex items-center gap-1 ml-auto">
          θ max
          <input
            type="number"
            value={avo.maxTheta}
            onChange={(e) => patch({ maxTheta: Math.max(5, Math.min(89, parseFloat(e.target.value) || 40)) })}
            className="w-14 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-right text-slate-100"
          />
          °
        </label>
      </div>

      {avo.mode === 'manual' && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <span className="w-12" />
            <span className="w-20 text-right">Vp (m/s)</span>
            <span className="w-20 text-right">Vs (m/s)</span>
            <span className="w-20 text-right">ρ (kg/m³)</span>
          </div>
          <HalfspaceInputs side="Upper" hs={avo.upper} onChange={(hs) => patch({ upper: hs })} />
          <HalfspaceInputs side="Lower" hs={avo.lower} onChange={(hs) => patch({ lower: hs })} />
        </div>
      )}

      {avo.mode === 'top' && halfspaces && (
        <table className="text-[12px] text-slate-200">
          <thead>
            <tr className="text-slate-500 text-left">
              <th className="font-normal pr-3">Halfspace</th>
              <th className="font-normal pr-3 text-right">Vp (m/s)</th>
              <th className="font-normal pr-3 text-right">Vs (m/s)</th>
              <th className="font-normal text-right">ρ (kg/m³)</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-slate-800">
              <td className="py-0.5 pr-3 text-slate-300">upper mean</td>
              <td className="py-0.5 pr-3 text-right" data-testid="rp-avo-upper-mean-vp">{f1(halfspaces.upper.vp)}</td>
              <td className="py-0.5 pr-3 text-right">{f1(halfspaces.upper.vs)}</td>
              <td className="py-0.5 text-right">{f1(halfspaces.upper.rho)}</td>
            </tr>
            <tr className="border-t border-slate-800">
              <td className="py-0.5 pr-3 text-slate-300">lower mean</td>
              <td className="py-0.5 pr-3 text-right" data-testid="rp-avo-lower-mean-vp">{f1(halfspaces.lower.vp)}</td>
              <td className="py-0.5 pr-3 text-right">{f1(halfspaces.lower.vs)}</td>
              <td className="py-0.5 text-right">{f1(halfspaces.lower.rho)}</td>
            </tr>
          </tbody>
        </table>
      )}

      {result?.error && <p className="text-[12px] text-amber-400" data-testid="rp-avo-error">{result.error}</p>}

      {result && !result.error && (
        <>
          <div className="flex items-center gap-4 text-[13px] text-slate-200">
            <span>A (intercept) <b data-testid="rp-avo-a">{f4(result.a)}</b></span>
            <span>B (gradient) <b data-testid="rp-avo-b">{f4(result.b)}</b></span>
            <span
              data-testid="rp-avo-class"
              className="rounded px-1.5 py-0.5 border border-cyan-700 text-cyan-300 text-[12px]"
              title="Rutherford-Williams class from (A, B)"
            >
              Class {result.cls}
            </span>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <div className="bg-white rounded-lg p-3 relative" style={{ height: 360 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={result.curve} margin={CHART_MARGINS.legend}>
                  <CartesianGrid {...GRID_STYLE} />
                  <XAxis dataKey="theta" type="number" domain={[0, avo.maxTheta]} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={AXIS_LINE}>
                    <Label value="Incidence angle θ (°)" position="insideBottom" offset={-5} style={{ fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }} />
                  </XAxis>
                  <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={AXIS_LINE} tickFormatter={(v) => v.toFixed(2)}>
                    <Label value="Rpp(θ)" angle={-90} position="insideLeft" style={{ fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }} />
                  </YAxis>
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => f4(v)} labelFormatter={(v) => `θ = ${v}°`} />
                  <Legend {...LEGEND_PROPS} wrapperStyle={{ fontSize: `${CHART_TYPOGRAPHY.legendFontSize}px`, color: CHART_COLORS.legendText }} />
                  <ReferenceLine y={0} stroke={CHART_COLORS.axisLine} />
                  <Line type="monotone" dataKey="zoeppritz" stroke="#0f172a" strokeWidth={2} dot={false} name="Zoeppritz (exact)" />
                  <Line type="monotone" dataKey="shuey2" stroke="#dc2626" strokeWidth={1.5} strokeDasharray="5 3" dot={false} name="Shuey 2-term" />
                  <Line type="monotone" dataKey="akiRichards" stroke="#0284c7" strokeWidth={1.5} strokeDasharray="2 3" dot={false} name="Aki-Richards" />
                </LineChart>
              </ResponsiveContainer>
              <ChartLogo />
            </div>

            <div className="bg-white rounded-lg p-3 relative" style={{ height: 360 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={CHART_MARGINS.standard}>
                  <CartesianGrid {...GRID_STYLE} />
                  <XAxis dataKey="a" type="number" domain={[-0.5, 0.5]} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={AXIS_LINE}>
                    <Label value="Intercept A" position="insideBottom" offset={-5} style={{ fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }} />
                  </XAxis>
                  <YAxis dataKey="b" type="number" domain={[-0.6, 0.6]} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={AXIS_LINE} tickFormatter={(v) => v.toFixed(1)}>
                    <Label value="Gradient B" angle={-90} position="insideLeft" style={{ fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }} />
                  </YAxis>
                  {/* Rutherford-Williams class bands (B < 0 for I-III; IV = soft sand, B > 0) */}
                  <ReferenceArea x1={CLASS2_BAND} x2={0.5} y1={-0.6} y2={0} fill="#0284c7" fillOpacity={0.07} label={{ value: 'I', position: 'insideBottomRight', fill: CHART_COLORS.axisText, fontSize: 11 }} />
                  <ReferenceArea x1={-CLASS2_BAND} x2={CLASS2_BAND} y1={-0.6} y2={0.6} fill="#64748b" fillOpacity={0.10} label={{ value: 'II', position: 'insideTop', fill: CHART_COLORS.axisText, fontSize: 11 }} />
                  <ReferenceArea x1={-0.5} x2={-CLASS2_BAND} y1={-0.6} y2={0} fill="#dc2626" fillOpacity={0.07} label={{ value: 'III', position: 'insideBottomLeft', fill: CHART_COLORS.axisText, fontSize: 11 }} />
                  <ReferenceArea x1={-0.5} x2={-CLASS2_BAND} y1={0} y2={0.6} fill="#d97706" fillOpacity={0.07} label={{ value: 'IV', position: 'insideTopLeft', fill: CHART_COLORS.axisText, fontSize: 11 }} />
                  <ReferenceLine x={0} stroke={CHART_COLORS.axisLine} />
                  <ReferenceLine y={0} stroke={CHART_COLORS.axisLine} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => f4(v)} />
                  <Scatter data={[{ a: result.a, b: result.b }]} fill="#0f172a" name="interface" />
                </ScatterChart>
              </ResponsiveContainer>
              <ChartLogo />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
