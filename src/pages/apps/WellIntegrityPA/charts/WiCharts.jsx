// Well Integrity chart pack: allowable annulus surface pressure per
// limiting element. White chartTheme + ChartLogo standard.

import React from 'react';
import {
  ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';
import { CHART_COLORS, CHART_MARGINS, TOOLTIP_STYLE, GRID_STYLE } from '@/utils/chartTheme';
import ChartLogo from '@/components/charts/ChartLogo';
import { annulusChartRows } from '../services/wiRun';

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

export function AnnulusLimitsChart({ annulus }) {
  if (!annulus?.result) return null;
  const data = annulusChartRows(annulus);
  return (
    <Frame title={`Annulus ${annulus.name}: allowable surface pressure per limiting element`} testId="wi-annulus-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ ...CHART_MARGINS.compact, left: 40 }}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis type="number" domain={[0, 'auto']} {...axisProps}
            label={{ value: 'allowable surface pressure (MPa)', position: 'insideBottom', offset: -2, fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
          <YAxis type="category" dataKey="name" width={150} {...axisProps} />
          <Tooltip contentStyle={TOOLTIP_STYLE}
            formatter={(v) => (Number.isFinite(v) ? `${v.toFixed(2)} MPa` : '--')} />
          <ReferenceLine x={annulus.result.mawopPa / 1e6} stroke="#b45309" strokeDasharray="4 3"
            label={{ value: 'MAWOP', fontSize: 9, fill: '#b45309' }} />
          <Bar dataKey="allowMPa" name="Allowable" isAnimationActive={false}>
            {data.map((row) => (
              <Cell key={row.name} fill={row.governing ? '#b45309' : '#0369a1'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Frame>
  );
}
