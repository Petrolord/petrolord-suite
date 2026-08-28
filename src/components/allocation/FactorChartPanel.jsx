// Daily allocation factor trend (Allocation tab). Suite chart standard:
// white ChartFrame + chartTheme tokens + watermark + PNG export. The
// reference line at 1.0 is where the wells' tests exactly account for
// the meter; the shaded band is the warning band from the left rail.
import React, { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ReferenceArea,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { decimate } from '@/utils/production/surveillance';
import { useAllocation } from '@/contexts/ProductionAllocationContext';

const COLOR = { oil: '#059669', water: '#2563eb', gas: '#d97706' };

const FactorChartPanel = () => {
  const { allocation, activeSettings } = useAllocation();

  const data = useMemo(() => decimate(allocation.days.map((d) => ({
    date: d.date,
    oil: d.factors.oil,
    water: d.factors.water,
    gas: d.factors.gas,
  }))), [allocation]);

  if (!allocation.days.length) return null;

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          Allocation factor by date
          <span className="block text-xs font-normal text-slate-500 mt-0.5">
            Metered volume over the wells' theoretical volume. A factor drifting away from 1.0 means
            the tests, the meter or the uptime record disagree.
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ChartFrame height={300} exportFilename="allocation-factors">
          <LineChart data={data} margin={{ top: 8, right: 24, bottom: 4, left: 4 }}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis
              dataKey="date" stroke={CHART_COLORS.axisLine} minTickGap={40}
              tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
            />
            <YAxis
              stroke={CHART_COLORS.axisLine} domain={[0, 'auto']}
              tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
              label={{
                value: 'Allocation factor', angle: -90, position: 'insideLeft',
                fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
              }}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelStyle={{ color: CHART_COLORS.tooltipText }}
              itemStyle={{ color: CHART_COLORS.tooltipText }}
              formatter={(value, name) => [Number(value).toFixed(3), name]}
            />
            <Legend wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText }} />
            <ReferenceArea
              y1={activeSettings.factorWarnLow} y2={activeSettings.factorWarnHigh}
              fill="#10b981" fillOpacity={0.07} stroke="#10b981" strokeOpacity={0.3}
              strokeDasharray="3 3" ifOverflow="extendDomain"
            />
            <ReferenceLine
              y={1} stroke="#dc2626" strokeDasharray="5 5"
              label={{ value: 'Factor = 1', fill: '#dc2626', fontSize: 11, position: 'right' }}
            />
            <Line type="monotone" dataKey="oil" name="Oil" stroke={COLOR.oil} strokeWidth={1.8} dot={false} connectNulls={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="water" name="Water" stroke={COLOR.water} strokeWidth={1.5} dot={false} connectNulls={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="gas" name="Gas" stroke={COLOR.gas} strokeWidth={1.5} dot={false} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ChartFrame>
      </CardContent>
    </Card>
  );
};

export default FactorChartPanel;
