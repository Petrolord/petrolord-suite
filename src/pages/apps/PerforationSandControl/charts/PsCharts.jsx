// Perforation & sand control chart pack: PSD semilog curve and the
// sanding critical-drawdown track. White chartTheme + ChartLogo standard.

import React from 'react';
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceArea,
} from 'recharts';
import { CHART_COLORS, CHART_MARGINS, TOOLTIP_STYLE, GRID_STYLE } from '@/utils/chartTheme';
import ChartLogo from '@/components/charts/ChartLogo';
import { psdChartRows, cdpChartRows, depthDisp, depthLabel } from '../services/psRun';

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

// PSD: cumulative retained vs grain size, log X descending (the sand
// control convention). Optional Saucier band overlay in gravel space.
export function PsdChart({ points, gravel }) {
  const data = psdChartRows(points);
  if (!data.length) return null;
  return (
    <Frame title="Particle size distribution (cumulative % retained)" testId="ps-psd-chart">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={CHART_MARGINS.compact}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis dataKey="sizeUm" type="number" scale="log" reversed
            domain={['dataMax', 'dataMin']} {...axisProps}
            tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}mm` : v.toFixed(0))}
            label={{ value: 'grain size (um)', position: 'insideBottom', offset: -2, fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
          <YAxis type="number" domain={[0, 100]} {...axisProps}
            label={{ value: '% retained', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
          <Tooltip contentStyle={TOOLTIP_STYLE}
            formatter={(v) => (Number.isFinite(v) ? v.toFixed(1) : '--')}
            labelFormatter={(v) => `${Number(v).toFixed(0)} um`} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          {gravel && !gravel.noMatch && (
            <ReferenceArea x1={gravel.bandMaxM * 1e6} x2={gravel.bandMinM * 1e6}
              fill="#65a30d" fillOpacity={0.12}
              label={{ value: 'Saucier gravel band', fontSize: 9, fill: '#4d7c0f' }} />
          )}
          <Line dataKey="cumRetainedPct" name="Formation sand" stroke="#0369a1"
            strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </Frame>
  );
}

// Sanding track: pore pressure vs critical flowing pressure along MD, with
// the drawdown margin (CDP) as its own line.
export function CdpChart({ sanding, depthUnit }) {
  const rows = cdpChartRows(sanding);
  if (!rows.length) return null;
  const data = rows.map((r) => ({ ...r, md: depthDisp(r.mdM, depthUnit) }));
  return (
    <Frame title="Sanding onset along the interval (MPa vs MD)" testId="ps-cdp-chart">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={CHART_MARGINS.compact} layout="vertical">
          <CartesianGrid {...GRID_STYLE} />
          <XAxis type="number" domain={['auto', 'auto']} {...axisProps}
            label={{ value: 'MPa', position: 'insideBottom', offset: -2, fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
          <YAxis dataKey="md" type="number" reversed domain={['dataMin', 'dataMax']} {...axisProps}
            tickFormatter={(v) => v.toFixed(0)}
            label={{ value: `MD (${depthLabel(depthUnit)})`, angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
          <Tooltip contentStyle={TOOLTIP_STYLE}
            formatter={(v) => (Number.isFinite(v) ? v.toFixed(2) : '--')}
            labelFormatter={(v) => `MD ${Number(v).toFixed(0)} ${depthLabel(depthUnit)}`} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Line dataKey="ppMPa" name="Reservoir pressure" stroke="#b91c1c" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line dataKey="pwfCritMPa" name="Critical pwf (onset)" stroke="#7c3aed" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line dataKey="cdpMPa" name="Drawdown margin" stroke="#0f766e" strokeWidth={2}
            strokeDasharray="5 3" dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </Frame>
  );
}
