// NPV tornado chart (Economics E2: moved onto the Suite chart standard).
import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';

const mm = (v) => (Number.isFinite(v) ? (v / 1e6).toFixed(1) : '-');

const TornadoChart = ({ data, height = 340 }) => {
  const tick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };
  // Both ends are drawn from the base case outward, so a symmetric input
  // reads as symmetric and the longer arm is the side that hurts.
  const chartData = data.map((d) => ({
    name: d.name,
    down: Math.min(d.low, d.high) - d.base,
    up: Math.max(d.low, d.high) - d.base,
    base: d.base,
  }));

  return (
    <ChartFrame height={height} exportFilename="npv-tornado">
      <BarChart layout="vertical" data={chartData} stackOffset="sign" margin={{ top: 8, right: 30, bottom: 28, left: 50 }}>
        <CartesianGrid {...GRID_STYLE} horizontal={false} />
        <XAxis
          type="number" stroke={CHART_COLORS.axisLine} tick={tick}
          tickFormatter={(v) => `${v > 0 ? '+' : ''}$${mm(v)}MM`}
          label={{
            value: 'Change in NPV vs the base case', position: 'insideBottom', offset: -10,
            fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
          }}
        />
        <YAxis dataKey="name" type="category" stroke={CHART_COLORS.axisLine} width={100} tick={{ ...tick, fontSize: 11 }} />
        <Tooltip
          cursor={{ fill: 'rgba(0,0,0,0.04)' }}
          {...TOOLTIP_STYLE}
          formatter={(v, name) => [`${v > 0 ? '+' : ''}$${mm(v)}MM`, name]}
        />
        <ReferenceLine x={0} stroke={CHART_COLORS.axisLine} />
        <Bar dataKey="down" name="Downside" stackId="swing" fill="#dc2626" barSize={18} />
        <Bar dataKey="up" name="Upside" stackId="swing" fill="#059669" barSize={18} />
      </BarChart>
    </ChartFrame>
  );
};

export default TornadoChart;
