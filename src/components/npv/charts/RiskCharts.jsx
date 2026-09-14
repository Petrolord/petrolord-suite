// NPV Monte Carlo charts (Economics E2: moved onto the Suite chart standard).
import React from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { OUTCOME_LABELS } from '@/lib/percentileConventions';

const mm = (v) => (Number.isFinite(v) ? (v / 1e6).toFixed(0) : '-');
const tick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };

// Suite percentile convention (src/lib/percentileConventions.js): P90 is the
// low case and P10 the high one. The engine's keys are plain percentiles, so
// the LOW case is the 10th percentile (risk.p10). This chart takes the three
// cases by meaning, never by key, so it cannot draw a label at the wrong end
// again (EC3-0: it used to draw "P90 low" at the 90th percentile).
export const HistogramChart = ({ data, lowCase, bestCase, highCase, height = 300 }) => (
  <ChartFrame height={height} exportFilename="npv-histogram">
    <BarChart data={data} margin={{ top: 12, right: 24, left: 8, bottom: 28 }}>
      <CartesianGrid {...GRID_STYLE} vertical={false} />
      <XAxis
        dataKey="binStart" stroke={CHART_COLORS.axisLine} tick={tick}
        tickFormatter={(v) => `$${mm(v)}MM`}
        label={{
          value: 'NPV', position: 'insideBottom', offset: -10,
          fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
        }}
      />
      <YAxis stroke={CHART_COLORS.axisLine} tick={tick} />
      <Tooltip
        {...TOOLTIP_STYLE}
        formatter={(v) => [v, 'iterations']}
        labelFormatter={(v) => `around $${mm(v)}MM`}
      />
      <Bar dataKey="count" fill="#2563eb" radius={[3, 3, 0, 0]} name="Iterations" />
      <ReferenceLine x={lowCase} stroke="#dc2626" strokeDasharray="4 3" label={{ value: `${OUTCOME_LABELS.p90} low`, fill: '#b91c1c', fontSize: 10, position: 'top' }} />
      <ReferenceLine x={bestCase} stroke="#d97706" strokeDasharray="4 3" label={{ value: OUTCOME_LABELS.p50, fill: '#b45309', fontSize: 10, position: 'top' }} />
      <ReferenceLine x={highCase} stroke="#059669" strokeDasharray="4 3" label={{ value: `${OUTCOME_LABELS.p10} high`, fill: '#047857', fontSize: 10, position: 'top' }} />
    </BarChart>
  </ChartFrame>
);

export const SCurveChart = ({ data, height = 300 }) => (
  <ChartFrame height={height} exportFilename="npv-s-curve">
    <AreaChart data={data} margin={{ top: 12, right: 24, left: 8, bottom: 28 }}>
      <CartesianGrid {...GRID_STYLE} />
      <XAxis
        dataKey="value" type="number" domain={['auto', 'auto']}
        stroke={CHART_COLORS.axisLine} tick={tick} tickFormatter={(v) => `$${mm(v)}MM`}
        label={{
          value: 'NPV', position: 'insideBottom', offset: -10,
          fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
        }}
      />
      <YAxis stroke={CHART_COLORS.axisLine} tick={tick} unit="%" />
      <Tooltip
        {...TOOLTIP_STYLE}
        formatter={(v) => [`${Number(v).toFixed(1)} %`, 'chance of coming in below']}
        labelFormatter={(v) => `$${mm(v)}MM`}
      />
      <ReferenceLine x={0} stroke={CHART_COLORS.axisLine} strokeDasharray="4 3" label={{ value: 'break even', fill: CHART_COLORS.axisText, fontSize: 10, position: 'insideTopRight' }} />
      <Area type="monotone" dataKey="probability" stroke="#7c3aed" fill="#7c3aed" fillOpacity={0.15} name="Cumulative probability" />
    </AreaChart>
  </ChartFrame>
);
