// Cementing chart pack: placement (pump pressure + ECD vs pumped volume)
// and standoff vs MD. White chartTheme + ChartLogo standard.

import React from 'react';
import {
  ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import { CHART_COLORS, CHART_MARGINS, TOOLTIP_STYLE, GRID_STYLE } from '@/utils/chartTheme';
import ChartLogo from '@/components/charts/ChartLogo';
import {
  pressureOut, pressureLabel, volumeOut, volumeLabel, emwOut, emwLabel,
  depthOut, depthLabel,
} from '../services/cmtRun';

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

export function PlacementChart({ placement, depthUnit }) {
  if (!placement) return null;
  const data = placement.series.map((r) => ({
    v: volumeOut(r.pumpedM3, depthUnit),
    p: pressureOut(r.pumpPressurePa, depthUnit),
    freeFall: r.freeFall ? pressureOut(Math.abs(r.uTubePa), depthUnit) : null,
  }));
  return (
    <Frame title={`Surface pump pressure vs pumped volume (${pressureLabel(depthUnit)} vs ${volumeLabel(depthUnit)})`} testId="cmt-placement-chart">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={CHART_MARGINS.compact}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis dataKey="v" type="number" domain={[0, 'dataMax']} {...axisProps}
            tickFormatter={(x) => x.toFixed(0)}
            label={{ value: `pumped (${volumeLabel(depthUnit)})`, position: 'insideBottom', offset: -2, fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
          <YAxis type="number" domain={[0, 'auto']} {...axisProps}
            tickFormatter={(x) => x.toFixed(0)}
            label={{ value: pressureLabel(depthUnit), angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
          <Tooltip contentStyle={TOOLTIP_STYLE}
            formatter={(x, name) => [Number.isFinite(x) ? x.toFixed(0) : '--', name === 'freeFall' ? 'Free-fall deficit' : 'Pump pressure']}
            labelFormatter={(x) => `${Number(x).toFixed(1)} ${volumeLabel(depthUnit)}`} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Area dataKey="freeFall" name="Free-fall deficit" fill="#fca5a5" fillOpacity={0.5}
            stroke="none" isAnimationActive={false} connectNulls={false} />
          <Line dataKey="p" name="Pump pressure" stroke="#7c3aed" strokeWidth={2.5}
            dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </Frame>
  );
}

export function EcdChart({ placement, fracEmwKgM3, depthUnit }) {
  if (!placement) return null;
  const data = placement.series
    .filter((r) => r.ecdPrevShoeKgM3 != null)
    .map((r) => ({
      v: volumeOut(r.pumpedM3, depthUnit),
      ecd: emwOut(r.ecdPrevShoeKgM3, depthUnit),
    }));
  if (!data.length) return null;
  return (
    <Frame title={`ECD at the previous shoe vs pumped volume (${emwLabel(depthUnit)})`} testId="cmt-ecd-chart">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={CHART_MARGINS.compact}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis dataKey="v" type="number" domain={[0, 'dataMax']} {...axisProps}
            tickFormatter={(x) => x.toFixed(0)}
            label={{ value: `pumped (${volumeLabel(depthUnit)})`, position: 'insideBottom', offset: -2, fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
          <YAxis type="number" domain={['auto', 'auto']} {...axisProps}
            tickFormatter={(x) => x.toFixed(2)}
            label={{ value: emwLabel(depthUnit), angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
          <Tooltip contentStyle={TOOLTIP_STYLE}
            formatter={(x) => (Number.isFinite(x) ? x.toFixed(3) : '--')}
            labelFormatter={(x) => `${Number(x).toFixed(1)} ${volumeLabel(depthUnit)}`} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          {fracEmwKgM3 != null && (
            <ReferenceLine y={emwOut(fracEmwKgM3, depthUnit)} stroke="#1d4ed8" strokeDasharray="4 3"
              label={{ value: 'frac EMW', fontSize: 9, fill: '#1d4ed8' }} />
          )}
          <Line dataKey="ecd" name="ECD at previous shoe" stroke="#0f766e" strokeWidth={2.5}
            dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </Frame>
  );
}

export function StandoffChart({ profile, depthUnit }) {
  if (!profile) return null;
  const data = profile.rows.map((r) => ({
    md: depthOut((r.fromMd + r.toMd) / 2, depthUnit),
    so: 100 * r.standoff,
  }));
  return (
    <Frame title={`Standoff vs MD (%) at ${profile.spacingM?.toFixed(1)} m spacing`} testId="cmt-standoff-chart">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={CHART_MARGINS.compact} layout="vertical">
          <CartesianGrid {...GRID_STYLE} />
          <XAxis type="number" domain={[0, 100]} {...axisProps}
            label={{ value: 'standoff %', position: 'insideBottom', offset: -2, fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
          <YAxis dataKey="md" type="number" reversed domain={['dataMin', 'dataMax']} {...axisProps}
            tickFormatter={(v) => v.toFixed(0)}
            label={{ value: `MD (${depthLabel(depthUnit)})`, angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
          <Tooltip contentStyle={TOOLTIP_STYLE}
            formatter={(v) => (Number.isFinite(v) ? `${v.toFixed(0)} %` : '--')}
            labelFormatter={(v) => `MD ${Number(v).toFixed(0)} ${depthLabel(depthUnit)}`} />
          <ReferenceLine x={67} stroke="#b91c1c" strokeDasharray="4 3"
            label={{ value: 'API 67%', fontSize: 9, fill: '#b91c1c' }} />
          <Line dataKey="so" name="Standoff" stroke="#0f766e" strokeWidth={2}
            dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </Frame>
  );
}
