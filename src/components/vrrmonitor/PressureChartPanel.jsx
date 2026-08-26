// VRR vs reservoir pressure (V3, main area, Pressure tab): the
// pressure-maintenance proof chart. Dual axis (VRR left, psia right),
// fill-up marker where cumulative VRR first reaches 1, dp/dt in the
// tooltip. Gated with a reason when no pressure attaches.
import React, { useMemo } from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ChartFrame from '@/components/charts/ChartFrame';
import GatedNotice from '@/components/vrrmonitor/GatedNotice';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useVrrMonitor } from '@/contexts/VrrMonitorContext';

const LINE = { inst: '#2563eb', cum: '#059669', pressure: '#7c3aed', ref: '#dc2626', fill: '#0891b2' };

const PressureChartPanel = () => {
  const { series, hasPressure, fillUp, trackActive } = useVrrMonitor();

  const chartData = useMemo(
    () =>
      series
        .filter((r) => r.producedVoidage > 0 || r.pressure != null)
        .map((r) => ({
          label: r.label || `P${r.index + 1}`,
          instantaneous: r.instantaneousVRR != null ? Number(r.instantaneousVRR.toFixed(3)) : null,
          cumulative: r.cumulativeVRR != null ? Number(r.cumulativeVRR.toFixed(3)) : null,
          pressure: r.pressure != null ? Number(r.pressure.toFixed(1)) : null,
          dpdt: r.dpdt != null ? Number(r.dpdt.toFixed(1)) : null,
        })),
    [series],
  );

  if (!hasPressure) {
    return (
      <GatedNotice
        title="VRR vs reservoir pressure"
        reason="No pressure attaches to the current periods, so this chart would be a guess and is withheld."
        hint="Add pressure surveys in the left rail (periods also need YYYY-MM month labels; imported ledgers have them automatically)."
      />
    );
  }

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          VRR vs reservoir pressure
          {trackActive && <span className="text-xs font-normal text-sky-400 ml-2">pressure-dependent FVFs active</span>}
          {fillUp && (
            <span className="text-xs font-normal text-slate-500 ml-2">
              {fillUp.startedAbove ? 'record starts at or above fill-up' : `fill-up reached ${fillUp.label}`}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ChartFrame height={320} exportFilename="vrr-vs-pressure">
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 4, left: -8 }}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis dataKey="label" stroke={CHART_COLORS.axisLine} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
            <YAxis
              yAxisId="vrr"
              stroke={CHART_COLORS.axisLine}
              tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
              domain={[0, 'auto']}
              label={{ value: 'VRR', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }}
            />
            <YAxis
              yAxisId="p"
              orientation="right"
              stroke={LINE.pressure}
              tick={{ fill: LINE.pressure, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
              domain={['auto', 'auto']}
              label={{ value: 'Pressure (psia)', angle: 90, position: 'insideRight', fill: LINE.pressure, fontSize: CHART_TYPOGRAPHY.labelFontSize }}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelStyle={{ color: CHART_COLORS.tooltipText }}
              itemStyle={{ color: CHART_COLORS.tooltipText }}
              formatter={(value, name, item) => {
                if (item?.dataKey === 'pressure') {
                  const d = item?.payload?.dpdt;
                  return [`${value} psia${d != null ? ` (dp/dt ${d} psi/mo)` : ''}`, name];
                }
                return [value, name];
              }}
            />
            <Legend wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText }} />
            <ReferenceLine yAxisId="vrr" y={1} stroke={LINE.ref} strokeDasharray="5 5" />
            {fillUp && !fillUp.startedAbove && (
              <ReferenceLine
                yAxisId="vrr"
                x={fillUp.label}
                stroke={LINE.fill}
                strokeDasharray="4 4"
                label={{ value: 'Fill-up', fill: LINE.fill, fontSize: 11, position: 'top' }}
              />
            )}
            <Line yAxisId="vrr" type="monotone" dataKey="instantaneous" name="Instantaneous VRR" stroke={LINE.inst} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
            <Line yAxisId="vrr" type="monotone" dataKey="cumulative" name="Cumulative VRR" stroke={LINE.cum} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
            <Line yAxisId="p" type="monotone" dataKey="pressure" name="Reservoir pressure" stroke={LINE.pressure} strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3 }} connectNulls isAnimationActive={false} />
          </ComposedChart>
        </ChartFrame>
      </CardContent>
    </Card>
  );
};

export default PressureChartPanel;
