// VRR trend chart (VRR Monitor main area, Dashboard tab). Suite chart
// standard: white ChartFrame + chartTheme tokens + watermark + PNG export.
// V2 adds the rolling-VRR line and the shaded operator target band.
import React, { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceArea, Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useVrrMonitor } from '@/contexts/VrrMonitorContext';

// Line colors tuned for the white Petrolord chart background.
const LINE = { inst: '#2563eb', cum: '#059669', roll: '#d97706', ref: '#dc2626', band: '#10b981' };

const VrrChartsPanel = () => {
  const { series, rolling, targetBand } = useVrrMonitor();

  const chartData = useMemo(
    () =>
      series
        .map((r, i) => ({ r, i }))
        .filter(({ r }) => r.producedVoidage > 0)
        .map(({ r, i }) => ({
          label: r.label || `P${r.index + 1}`,
          instantaneous: r.instantaneousVRR != null ? Number(r.instantaneousVRR.toFixed(3)) : null,
          rolling: rolling[i] != null ? Number(rolling[i].toFixed(3)) : null,
          cumulative: r.cumulativeVRR != null ? Number(r.cumulativeVRR.toFixed(3)) : null,
        })),
    [series, rolling],
  );

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-2"><CardTitle className="text-base">VRR trend</CardTitle></CardHeader>
      <CardContent className="p-0">
        {chartData.length ? (
          <ChartFrame height={300} exportFilename="vrr-trend">
            <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis dataKey="label" stroke={CHART_COLORS.axisLine} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
              <YAxis stroke={CHART_COLORS.axisLine} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} domain={[0, 'auto']} />
              <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: CHART_COLORS.tooltipText }} itemStyle={{ color: CHART_COLORS.tooltipText }} />
              <Legend wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText }} />
              <ReferenceArea
                y1={targetBand.min}
                y2={targetBand.max}
                fill={LINE.band}
                fillOpacity={0.08}
                stroke={LINE.band}
                strokeOpacity={0.35}
                strokeDasharray="3 3"
                ifOverflow="extendDomain"
              />
              <ReferenceLine y={1} stroke={LINE.ref} strokeDasharray="5 5" label={{ value: 'VRR = 1', fill: LINE.ref, fontSize: 11, position: 'right' }} />
              <Line type="monotone" dataKey="instantaneous" name="Instantaneous" stroke={LINE.inst} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
              <Line type="monotone" dataKey="rolling" name={`Rolling`} stroke={LINE.roll} strokeWidth={1.5} strokeDasharray="6 3" dot={false} connectNulls isAnimationActive={false} />
              <Line type="monotone" dataKey="cumulative" name="Cumulative" stroke={LINE.cum} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
            </LineChart>
          </ChartFrame>
        ) : (
          <div className="h-72 flex items-center justify-center text-slate-500 text-sm">
            Enter production &amp; injection volumes on the Data tab to see the VRR trend.
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default VrrChartsPanel;
