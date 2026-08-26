// Recoverable-reserves range chart (Recovery Factor Estimator main
// area). Chart markup moved verbatim from the pre-Studio page: white
// ChartFrame (suite standard) with the low/estimate/high bars.
import React, { useMemo } from 'react';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, LabelList,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ChartFrame from '@/components/charts/ChartFrame';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE,
} from '@/utils/chartTheme';
import { useRfEstimator } from '@/contexts/RfEstimatorContext';
import { fmtRes } from '@/components/rfestimator/rfFields';

const BAR = { low: '#94a3b8', est: '#059669', high: '#2563eb' };

const ReservesChartPanel = () => {
  const { inputs, result } = useRfEstimator();
  const { phase } = inputs;

  const chartData = useMemo(() => {
    const rows = [];
    if (Number.isFinite(result.reservesLow)) rows.push({ name: 'Low', value: result.reservesLow, fill: BAR.low });
    if (Number.isFinite(result.reserves)) rows.push({ name: 'Estimate', value: result.reserves, fill: BAR.est });
    if (Number.isFinite(result.reservesHigh)) rows.push({ name: 'High', value: result.reservesHigh, fill: BAR.high });
    return rows;
  }, [result]);

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-2"><CardTitle className="text-base">Recoverable reserves range</CardTitle></CardHeader>
      <CardContent className="p-0">
        {chartData.length ? (
          <ChartFrame height={260}>
            <BarChart data={chartData} margin={{ top: 16, right: 16, bottom: 4, left: 8 }}>
              <CartesianGrid {...GRID_STYLE} vertical={false} />
              <XAxis dataKey="name" stroke={CHART_COLORS.axisLine} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
              <YAxis stroke={CHART_COLORS.axisLine} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                tickFormatter={(v) => (phase === 'gas' ? (v / 1e9).toFixed(1) : (v / 1e6).toFixed(0))} />
              <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: CHART_COLORS.tooltipText }}
                formatter={(v) => [fmtRes(v, phase), 'Reserves']} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {chartData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                <LabelList dataKey="value" position="top" formatter={(v) => fmtRes(v, phase)}
                  style={{ fill: CHART_COLORS.axisText, fontSize: 11 }} />
              </Bar>
            </BarChart>
          </ChartFrame>
        ) : (
          <div className="h-64 flex items-center justify-center text-slate-500 text-sm px-6 text-center">
            Enter an in-place volume and pick a method to see the reserves range.
          </div>
        )}
        <p className="text-xs text-slate-500 px-6 pb-4">
          Y-axis in {phase === 'gas' ? 'Bscf' : 'MMSTB'}. Low/High use the analog band for the selected drive mechanism; Estimate uses the selected method.
        </p>
      </CardContent>
    </Card>
  );
};

export default ReservesChartPanel;
