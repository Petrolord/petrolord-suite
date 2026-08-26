// Well control chart pack: standpipe pressure vs strokes (kill schedule)
// and kick tolerance vs mud weight. White chartTheme + ChartLogo standard.

import React from 'react';
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine, ReferenceDot,
} from 'recharts';
import { CHART_COLORS, CHART_MARGINS, TOOLTIP_STYLE, GRID_STYLE } from '@/utils/chartTheme';
import ChartLogo from '@/components/charts/ChartLogo';
import {
  pressureOut, pressureLabel, volumeOut, volumeLabel, emwOut, emwLabel,
} from '../services/wcRun';

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

// Standpipe pressure vs cumulative strokes for the chosen method.
export function KillScheduleChart({ killSheet, method, depthUnit }) {
  if (!killSheet) return null;
  const stb = killSheet.strokesToBit;
  const bus = killSheet.bottomsUpStrokes;
  const icp = killSheet.icpPa;
  const fcp = killSheet.fcpPa;
  let data;
  if (method === 'drillers') {
    data = [
      { strokes: 0, p: icp },
      { strokes: stb + bus, p: icp },
      ...killSheet.schedule.map((r) => ({ strokes: stb + bus + r.strokes, p: r.pressurePa })),
      { strokes: 2 * (stb + bus), p: fcp },
    ];
  } else {
    data = [
      ...killSheet.schedule.map((r) => ({ strokes: r.strokes, p: r.pressurePa })),
      { strokes: stb + bus, p: fcp },
    ];
  }
  const rows = data.map((r) => ({ strokes: r.strokes, p: pressureOut(r.p, depthUnit) }));
  return (
    <Frame title={`Standpipe pressure vs strokes (${pressureLabel(depthUnit)}) — ${method === 'drillers' ? "driller's method" : 'wait and weight'}`} testId="wc-schedule-chart">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={CHART_MARGINS.compact}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis dataKey="strokes" type="number" domain={[0, 'dataMax']} {...axisProps}
            tickFormatter={(v) => v.toFixed(0)}
            label={{ value: 'pump strokes', position: 'insideBottom', offset: -2, fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
          <YAxis type="number" domain={['auto', 'auto']} {...axisProps}
            tickFormatter={(v) => v.toFixed(0)}
            label={{ value: pressureLabel(depthUnit), angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
          <Tooltip contentStyle={TOOLTIP_STYLE}
            formatter={(v) => (Number.isFinite(v) ? v.toFixed(0) : '--')}
            labelFormatter={(v) => `${Number(v).toFixed(0)} strokes`} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <ReferenceLine y={pressureOut(icp, depthUnit)} stroke="#b91c1c" strokeDasharray="4 3"
            label={{ value: 'ICP', fontSize: 9, fill: '#b91c1c' }} />
          <ReferenceLine y={pressureOut(fcp, depthUnit)} stroke="#1d4ed8" strokeDasharray="4 3"
            label={{ value: 'FCP', fontSize: 9, fill: '#1d4ed8' }} />
          <Line dataKey="p" name="Standpipe pressure" stroke="#7c3aed" strokeWidth={2.5}
            dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </Frame>
  );
}

export function KickToleranceChart({ sweep, currentDensityKgM3, depthUnit }) {
  if (!sweep?.length) return null;
  const rows = sweep.filter((r) => r.kickToleranceM3 != null).map((r) => ({
    mw: emwOut(r.mudDensityKgM3, depthUnit),
    kt: volumeOut(r.kickToleranceM3, depthUnit),
  }));
  const current = rows.length && currentDensityKgM3
    ? rows.reduce((best, r) => (Math.abs(r.mw - emwOut(currentDensityKgM3, depthUnit)) < Math.abs(best.mw - emwOut(currentDensityKgM3, depthUnit)) ? r : best), rows[0])
    : null;
  return (
    <Frame title={`Kick tolerance (${volumeLabel(depthUnit)}) vs mud weight (${emwLabel(depthUnit)})`} testId="wc-kt-chart">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={CHART_MARGINS.compact}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis dataKey="mw" type="number" domain={['dataMin', 'dataMax']} {...axisProps}
            tickFormatter={(v) => v.toFixed(2)}
            label={{ value: emwLabel(depthUnit), position: 'insideBottom', offset: -2, fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
          <YAxis type="number" domain={[0, 'auto']} {...axisProps}
            tickFormatter={(v) => v.toFixed(1)}
            label={{ value: volumeLabel(depthUnit), angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
          <Tooltip contentStyle={TOOLTIP_STYLE}
            formatter={(v) => (Number.isFinite(v) ? v.toFixed(2) : '--')}
            labelFormatter={(v) => `${Number(v).toFixed(2)} ${emwLabel(depthUnit)}`} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Line dataKey="kt" name="Kick tolerance" stroke="#0f766e" strokeWidth={2.5}
            dot isAnimationActive={false} />
          {current && (
            <ReferenceDot x={current.mw} y={current.kt} r={5} fill="#b91c1c" stroke="none"
              label={{ value: 'current mud', fontSize: 9, fill: '#b91c1c', position: 'top' }} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </Frame>
  );
}
