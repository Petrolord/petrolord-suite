// Hydraulics chart pack: rheogram, ECD vs TVD (with optional PP/FP mud
// window overlay), surge/swab sweep. White chartTheme + ChartLogo standard.

import React from 'react';
import {
  ResponsiveContainer, ComposedChart, Line, Area, Scatter, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import { CHART_COLORS, CHART_MARGINS, TOOLTIP_STYLE, GRID_STYLE, LEGEND_PROPS, XAXIS_LABEL_HEIGHT } from '@/utils/chartTheme';
import ChartLogo from '@/components/charts/ChartLogo';
import { stressAtRate, GAMMA_PER_RPM } from '../engine/rheology';
import { emwOut, emwLabel, depthOut, depthLabel } from '../services/hydRun';

const axisProps = {
  stroke: CHART_COLORS.axisLine,
  tick: { fill: CHART_COLORS.axisText, fontSize: 10 },
};

function Frame({ title, testId, children }) {
  return (
    <div className="bg-white relative flex h-full w-full min-h-0 min-w-0 flex-col rounded-md overflow-hidden" data-testid={testId}>
      <div className="px-3 pt-2 text-[11px] font-semibold text-slate-700">{title}</div>
      <div className="min-h-0 flex-1">{children}</div>
      <ChartLogo style={{ height: 36 }} />
    </div>
  );
}

// HYD-T1-003: model names as the Mud tab writes them, not code keys
const MODEL_NAMES = { bingham: 'Bingham', powerLaw: 'Power law', herschelBulkley: 'Herschel-Bulkley' };

export function RheogramChart({ fann, fits, chosen }) {
  const points = [
    { rpm: 600, theta: fann.theta600 }, { rpm: 300, theta: fann.theta300 },
    ...(fann.theta6 != null ? [{ rpm: 6, theta: fann.theta6 }] : []),
    ...(fann.theta3 != null ? [{ rpm: 3, theta: fann.theta3 }] : []),
  ].map((p) => ({ gd: p.rpm * GAMMA_PER_RPM, tauPa: 0.5104 * p.theta }));
  const rates = [];
  for (let gd = 5; gd <= 1100; gd *= 1.25) rates.push(gd);
  const data = rates.map((gd) => ({
    gd,
    bingham: stressAtRate(fits.bingham, gd),
    powerLaw: stressAtRate(fits.powerLaw, gd),
    herschelBulkley: stressAtRate(fits.herschelBulkley, gd),
  }));
  return (
    <Frame title="Rheogram: shear stress (Pa) vs shear rate (1/s)" testId="hyd-rheogram">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={CHART_MARGINS.compact}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis dataKey="gd" type="number" scale="log" domain={[5, 1100]} {...axisProps} height={XAXIS_LABEL_HEIGHT}
            tickFormatter={(v) => v.toFixed(0)}
            label={{ value: 'shear rate (1/s, log)', position: 'insideBottom', offset: 0, fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
          <YAxis type="number" {...axisProps} tickFormatter={(v) => v.toFixed(0)}
            label={{ value: 'Pa', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => (Number.isFinite(v) ? v.toFixed(2) : '--')}
            labelFormatter={(v) => `${Number(v).toFixed(1)} 1/s`} />
          <Legend {...LEGEND_PROPS} />
          {['bingham', 'powerLaw', 'herschelBulkley'].map((m) => (
            <Line key={m} dataKey={m}
              name={m === chosen ? `${MODEL_NAMES[m]} (used)` : MODEL_NAMES[m]}
              stroke={m === chosen ? '#b91c1c' : (m === 'bingham' ? '#94a3b8' : '#60a5fa')}
              strokeWidth={m === chosen ? 2.5 : 1.5}
              strokeDasharray={m === chosen ? undefined : '5 3'}
              dot={false} isAnimationActive={false} />
          ))}
          <Scatter data={points} dataKey="tauPa" name="Fann readings" fill="#0f766e" isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </Frame>
  );
}

export function EcdChart({ hyd, mudWindow, depthUnit, staticDensityKgM3 }) {
  if (!hyd) return null;
  const data = hyd.ecdProfile.map((r) => ({
    tvd: depthOut(r.tvd, depthUnit),
    ecd: emwOut(r.ecdKgM3, depthUnit),
    stat: emwOut(staticDensityKgM3, depthUnit),
  }));
  const windowRows = (mudWindow || []).map((r) => ({
    tvd: depthOut(r.tvd, depthUnit),
    pp: r.ppEmw != null ? emwOut(r.ppEmw * 1000, depthUnit) : null,
    fp: r.fpEmw != null ? emwOut(r.fpEmw * 1000, depthUnit) : null,
    window: r.ppEmw != null && r.fpEmw != null
      ? [emwOut(r.ppEmw * 1000, depthUnit), emwOut(r.fpEmw * 1000, depthUnit)]
      : null,
  }));
  // HYD-T1-002: both lines began at the first element boundary (about 1,270 m
  // TVD). At surface the annular friction is zero, so ECD equals the static
  // mud weight there; the static line spans every depth.
  const stat = emwOut(staticDensityKgM3, depthUnit);
  const surface = data.length && data[0].tvd > 0 ? [{ tvd: 0, ecd: stat, stat }] : [];
  const merged = [...surface, ...windowRows, ...data].sort((a, b) => a.tvd - b.tvd);
  merged.forEach((r) => { r.stat = stat; });
  // a range Area does not bridge rows without a window (the ECD rows): it
  // dropped to the axis there. Interpolate the window onto every row inside
  // its depth range.
  const win = windowRows.filter((r) => r.window);
  if (win.length > 1) {
    for (const r of merged) {
      if (r.window || r.tvd < win[0].tvd || r.tvd > win[win.length - 1].tvd) continue;
      const k = win.findIndex((w) => w.tvd >= r.tvd);
      const hi = win[k]; const lo = win[Math.max(0, k - 1)];
      const t = hi.tvd === lo.tvd ? 0 : (r.tvd - lo.tvd) / (hi.tvd - lo.tvd);
      r.window = [lo.window[0] + t * (hi.window[0] - lo.window[0]), lo.window[1] + t * (hi.window[1] - lo.window[1])];
    }
  }
  return (
    <Frame title={`ECD vs TVD (${emwLabel(depthUnit)})`} testId="hyd-ecd-chart">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={merged} margin={CHART_MARGINS.compact} layout="vertical">
          <CartesianGrid {...GRID_STYLE} />
          <XAxis type="number" domain={['auto', 'auto']} {...axisProps}
            tickFormatter={(v) => v.toFixed(2)}
            height={XAXIS_LABEL_HEIGHT}
            label={{ value: emwLabel(depthUnit), position: 'insideBottom', offset: 0, fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
          {/* HYD-T1-002: TVD from surface (the axis started at the first window row, 400 m) */}
          <YAxis dataKey="tvd" type="number" domain={[0, 'dataMax']} {...axisProps}
            tickFormatter={(v) => v.toFixed(0)}
            label={{ value: `TVD (${depthLabel(depthUnit)})`, angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
          <Tooltip contentStyle={TOOLTIP_STYLE}
            formatter={(v) => (Array.isArray(v) ? v.map((x) => x?.toFixed(2)).join(' – ') : (Number.isFinite(v) ? v.toFixed(3) : '--'))}
            labelFormatter={(v) => `TVD ${Number(v).toFixed(0)} ${depthLabel(depthUnit)}`} />
          <Legend {...LEGEND_PROPS} />
          {windowRows.length > 0 && (
            <Area dataKey="window" name="PP-FP window" fill="#86efac" fillOpacity={0.3}
              stroke="none" isAnimationActive={false} connectNulls />
          )}
          {windowRows.length > 0 && (
            <Line dataKey="pp" name="Pore pressure" stroke="#b91c1c" strokeWidth={1.5}
              strokeDasharray="5 3" dot={false} isAnimationActive={false} connectNulls />
          )}
          {windowRows.length > 0 && (
            <Line dataKey="fp" name="Fracture pressure" stroke="#1d4ed8" strokeWidth={1.5}
              strokeDasharray="5 3" dot={false} isAnimationActive={false} connectNulls />
          )}
          <Line dataKey="stat" name="Static mud" stroke="#57534e" strokeWidth={1.5}
            dot={false} isAnimationActive={false} connectNulls />
          <Line dataKey="ecd" name="ECD circulating" stroke="#7c3aed" strokeWidth={2.5}
            dot={false} isAnimationActive={false} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </Frame>
  );
}

export function SurgeSwabChart({ sweep, depthUnit, staticDensityKgM3, poreEmw, fracEmw }) {
  if (!sweep?.length) return null;
  const data = sweep.map((r) => ({
    v: r.tripSpeedMs,
    surge: emwOut(r.surgeEmwKgM3, depthUnit),
    swab: emwOut(r.swabEmwKgM3, depthUnit),
  }));
  return (
    <Frame title={`Surge / swab EMW at bit vs trip speed (${emwLabel(depthUnit)})`} testId="hyd-surge-chart">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={CHART_MARGINS.compact}>
          <CartesianGrid {...GRID_STYLE} />
          {/* HYD-T1-001: PP and FP extend the axis so the margins show (they
              sat off the chart); legend in the shared band */}
          <XAxis dataKey="v" type="number" {...axisProps} height={XAXIS_LABEL_HEIGHT}
            label={{ value: 'trip speed (m/s)', position: 'insideBottom', offset: 0, fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
          <YAxis type="number" domain={['auto', 'auto']} {...axisProps} tickFormatter={(v) => v.toFixed(2)}
            label={{ value: emwLabel(depthUnit), angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => (Number.isFinite(v) ? v.toFixed(3) : '--')}
            labelFormatter={(v) => `${v} m/s`} />
          <Legend {...LEGEND_PROPS} />
          <ReferenceLine y={emwOut(staticDensityKgM3, depthUnit)} stroke="#57534e" strokeDasharray="4 3"
            label={{ value: 'static', fontSize: 9, fill: '#57534e' }} />
          {poreEmw != null && (
            <ReferenceLine y={emwOut(poreEmw, depthUnit)} stroke="#b91c1c" strokeDasharray="4 3"
              ifOverflow="extendDomain" label={{ value: 'PP', fontSize: 9, fill: '#b91c1c', position: 'insideBottomRight' }} />
          )}
          {fracEmw != null && (
            <ReferenceLine y={emwOut(fracEmw, depthUnit)} stroke="#1d4ed8" strokeDasharray="4 3"
              ifOverflow="extendDomain" label={{ value: 'FP', fontSize: 9, fill: '#1d4ed8', position: 'insideTopRight' }} />
          )}
          <Line dataKey="surge" name="Surge (run in)" stroke="#1d4ed8" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line dataKey="swab" name="Swab (pull out)" stroke="#b91c1c" strokeWidth={2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </Frame>
  );
}
