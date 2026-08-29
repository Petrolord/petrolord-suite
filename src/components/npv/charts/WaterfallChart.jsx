// NPV waterfall (Economics E2: moved onto the Suite chart standard).
//
// Gross revenue on the left, each deduction stepping down, net cash on the
// right. Floating bars are drawn the usual Recharts way, with a transparent
// spacer bar carrying each step up to where its visible bar starts.
import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Cell, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';

const mm = (v) => (Number.isFinite(v) ? (v / 1e6).toFixed(1) : '-');

const WaterfallChart = ({ metrics, height = 340 }) => {
  const tick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };

  const steps = [
    { name: 'Gross revenue', value: metrics.totalRevenue, step: 'start' },
    { name: 'Royalty', value: -metrics.totalRoyalty, step: 'sub' },
    { name: 'OPEX', value: -metrics.totalOpex, step: 'sub' },
    { name: 'CAPEX', value: -metrics.totalCapex, step: 'sub' },
    { name: 'Tax', value: -metrics.totalTax, step: 'sub' },
    {
      name: 'Net cash',
      value: metrics.totalRevenue - metrics.totalRoyalty - metrics.totalOpex
        - metrics.totalCapex - metrics.totalTax,
      step: 'end',
    },
  ];

  const chartData = steps.map((item, i) => {
    if (i === 0 || i === steps.length - 1) {
      return { name: item.name, spacer: 0, bar: item.value, val: item.value, type: item.step };
    }
    const runningTotal = steps.slice(0, i).reduce((acc, s) => acc + s.value, 0) + item.value;
    return {
      name: item.name,
      spacer: runningTotal,
      bar: Math.abs(item.value),
      val: item.value,
      type: item.step,
    };
  });

  return (
    <ChartFrame height={height} exportFilename="npv-waterfall">
      <BarChart data={chartData} margin={{ top: 12, right: 24, left: 8, bottom: 24 }}>
        <CartesianGrid {...GRID_STYLE} vertical={false} />
        <XAxis dataKey="name" stroke={CHART_COLORS.axisLine} tick={{ ...tick, fontSize: 11 }} />
        <YAxis stroke={CHART_COLORS.axisLine} tick={tick} tickFormatter={(v) => `$${mm(v)}MM`} />
        <Tooltip
          cursor={{ fill: 'rgba(0,0,0,0.04)' }}
          {...TOOLTIP_STYLE}
          formatter={(v, name, props) => [
            `$${mm(props.payload.val)}MM`,
            props.payload.type === 'sub' ? 'Deduction' : 'Total',
          ]}
        />
        <ReferenceLine y={0} stroke={CHART_COLORS.axisLine} />
        <Bar dataKey="spacer" stackId="a" fill="transparent" isAnimationActive={false} />
        <Bar dataKey="bar" stackId="a" name="Undiscounted cash">
          {chartData.map((entry) => (
            <Cell
              key={entry.name}
              fill={entry.type === 'end' ? '#2563eb' : entry.type === 'sub' ? '#dc2626' : '#059669'}
            />
          ))}
        </Bar>
      </BarChart>
    </ChartFrame>
  );
};

export default WaterfallChart;
