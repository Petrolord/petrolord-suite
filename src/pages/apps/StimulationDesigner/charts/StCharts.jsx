// Stimulation chart pack: frac width profile along the wing and the
// Nolte pump-schedule ramp. White chartTheme + ChartLogo standard.

import React from 'react';
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import { CHART_COLORS, CHART_MARGINS, TOOLTIP_STYLE, GRID_STYLE } from '@/utils/chartTheme';
import ChartLogo from '@/components/charts/ChartLogo';
import { widthProfileRows, scheduleChartRows } from '../services/stRun';

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

export function WidthProfileChart({ geometry, xfM }) {
  if (!geometry) return null;
  const data = widthProfileRows({ geometry, xfM });
  return (
    <Frame title={`Fracture width along the wing (${geometry.model.toUpperCase()})`} testId="st-width-chart">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={CHART_MARGINS.compact}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis dataKey="xM" type="number" domain={[0, 'dataMax']} {...axisProps}
            label={{ value: 'distance from wellbore (m)', position: 'insideBottom', offset: -2, fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
          <YAxis type="number" domain={[0, 'auto']} {...axisProps}
            label={{ value: 'width (mm)', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
          <Tooltip contentStyle={TOOLTIP_STYLE}
            formatter={(v) => (Number.isFinite(v) ? v.toFixed(2) : '--')}
            labelFormatter={(v) => `${Number(v).toFixed(0)} m`} />
          <Line dataKey="wMm" name="Hydraulic width" stroke="#0369a1" strokeWidth={2}
            dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </Frame>
  );
}

export function ScheduleChart({ schedule, cEojKgM3 }) {
  if (!schedule) return null;
  const data = scheduleChartRows(schedule);
  return (
    <Frame title="Pump schedule (proppant concentration vs time)" testId="st-schedule-chart">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={CHART_MARGINS.compact}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis dataKey="tMin" type="number" domain={[0, 'dataMax']} {...axisProps}
            label={{ value: 'time (min)', position: 'insideBottom', offset: -2, fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
          <YAxis type="number" domain={[0, 'auto']} {...axisProps}
            label={{ value: 'kg/m3 slurry', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
          <Tooltip contentStyle={TOOLTIP_STYLE}
            formatter={(v) => (Number.isFinite(v) ? v.toFixed(0) : '--')}
            labelFormatter={(v) => `${Number(v).toFixed(1)} min`} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <ReferenceLine x={schedule.tPadS / 60} stroke="#b45309" strokeDasharray="4 3"
            label={{ value: 'pad', fontSize: 9, fill: '#b45309' }} />
          {cEojKgM3 != null && (
            <ReferenceLine y={cEojKgM3} stroke="#0f766e" strokeDasharray="4 3"
              label={{ value: 'EOJ', fontSize: 9, fill: '#0f766e' }} />
          )}
          <Line dataKey="cKgM3" name="Stage concentration" stroke="#7c3aed" strokeWidth={2}
            dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </Frame>
  );
}
