// Recoverable-reserves range chart (Recovery Factor Estimator main
// area): white ChartFrame (suite standard) with the bars at the analog range
// edges and the estimate. RF-U1: bars named for what they are (range edges,
// never P90 and P10), values and axis in the display unit.
import React, { useMemo } from 'react';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, LabelList,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ChartFrame from '@/components/charts/ChartFrame';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE, niceTicks,
} from '@/utils/chartTheme';
import { useRfEstimator } from '@/contexts/RfEstimatorContext';
import { reservesBars } from '@/utils/rfestimator/series';

const BAR = { low: '#64748b', est: '#059669', high: '#2563eb' };

const ReservesChartPanel = () => {
  const { inputs, result, u } = useRfEstimator();
  const { phase } = inputs;
  const bars = useMemo(() => reservesBars(result, phase, u.system), [result, phase, u.system]);
  const chartData = useMemo(() => bars.rows.map((r) => ({ name: r.name, value: r.value, fill: BAR[r.key] })), [bars]);
  // Senior test T1: ticks fell at 0, 9, 17, 26, 34. Round steps in the
  // display multiple (MMSTB, Bscf, 10^6 sm3 or 10^9 sm3).
  const yAxis = useMemo(() => {
    const t = niceTicks(0, Math.max(1e-9, ...chartData.map((d) => d.value)), 5);
    return { domain: t.domain, ticks: t.ticks };
  }, [chartData]);
  const unit = bars.unit;

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Recoverable reserves range</CardTitle></CardHeader>
      <CardContent className="p-0">
        {chartData.length ? (
          <ChartFrame height={260}>
            <BarChart data={chartData} margin={{ top: 16, right: 16, bottom: 4, left: 8 }}>
              <CartesianGrid {...GRID_STYLE} vertical={false} />
              <XAxis dataKey="name" stroke={CHART_COLORS.axisLine} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
              <YAxis stroke={CHART_COLORS.axisLine} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                domain={yAxis.domain} ticks={yAxis.ticks}
                tickFormatter={(v) => `${+v.toFixed(2)}`}
                label={{ value: unit, angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: CHART_COLORS.tooltipText }}
                formatter={(v) => [`${v.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unit}`, 'Reserves']} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {chartData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                <LabelList dataKey="value" position="top" formatter={(v) => `${v.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unit}`}
                  style={{ fill: CHART_COLORS.axisText, fontSize: 11 }} />
              </Bar>
            </BarChart>
          </ChartFrame>
        ) : (
          <div className="h-64 flex items-center justify-center text-pl-muted text-sm px-6 text-center">
            Enter an in-place volume and pick a method to see the reserves range.
          </div>
        )}
        <p className="text-xs text-pl-muted px-6 pb-4">
          Y axis in {unit}. The outer bars are the edges of the analog range of the drive mechanism named (not P90 and P10); the estimate uses the selected method. {bars.note}
        </p>
      </CardContent>
    </Card>
  );
};

export default ReservesChartPanel;
