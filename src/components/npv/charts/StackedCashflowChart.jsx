// NPV cash flow chart (Economics E2: moved onto the Suite chart standard).
//
// Revenue draws up, every deduction draws down, and the cumulative cash flow
// rides on its own axis, so the year the project turns cash positive is
// readable off the chart rather than inferred from the table.
import React from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';

const mm = (v) => (Number.isFinite(v) ? (v / 1e6).toFixed(1) : '-');

const StackedCashflowChart = ({ data, height = 300 }) => {
  const tick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };
  return (
    <ChartFrame height={height} exportFilename="npv-cashflow">
      <ComposedChart data={data} margin={{ top: 12, right: 24, left: 8, bottom: 24 }}>
        <CartesianGrid {...GRID_STYLE} vertical={false} />
        <XAxis dataKey="year" stroke={CHART_COLORS.axisLine} tick={tick} />
        <YAxis
          yAxisId="left" stroke={CHART_COLORS.axisLine} tick={tick}
          tickFormatter={(v) => `$${mm(v)}MM`}
        />
        <YAxis
          yAxisId="right" orientation="right" stroke={CHART_COLORS.axisLine} tick={tick}
          tickFormatter={(v) => `$${mm(v)}MM`}
        />
        <Tooltip {...TOOLTIP_STYLE} formatter={(v, name) => [`$${mm(v)}MM`, name]} />
        <Legend verticalAlign="top" wrapperStyle={{ fontSize: '12px' }} />
        <ReferenceLine yAxisId="left" y={0} stroke={CHART_COLORS.axisLine} />

        <Bar yAxisId="left" dataKey="grossRevenue" stackId="in" fill="#059669" name="Revenue" />
        <Bar yAxisId="left" dataKey={(d) => -d.royalty} stackId="out" fill="#7c3aed" name="Royalty" />
        <Bar yAxisId="left" dataKey={(d) => -d.tax} stackId="out" fill="#dc2626" name="Tax" />
        <Bar yAxisId="left" dataKey={(d) => -d.opex} stackId="out" fill="#d97706" name="OPEX" />
        <Bar yAxisId="left" dataKey={(d) => -d.capex} stackId="out" fill="#2563eb" name="CAPEX" />

        <Line
          yAxisId="right" type="monotone" dataKey="cumulativeNCF" stroke="#0f172a"
          strokeWidth={2} dot={false} name="Cumulative cash flow"
        />
      </ComposedChart>
    </ChartFrame>
  );
};

export default StackedCashflowChart;
