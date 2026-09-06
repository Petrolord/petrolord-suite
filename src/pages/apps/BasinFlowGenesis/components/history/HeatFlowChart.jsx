// Heat-flow history preview (BF1): basal heat flow against age on the
// suite white chartTheme. A constant model draws a flat line over the
// basin's age span; a variable model draws its piecewise history.
// Shared by the Expert history editor and the wizard's Heat Flow step.

import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
import { CHART_COLORS, CHART_TYPOGRAPHY, CHART_MARGINS } from '@/utils/chartTheme';
import { heatFlowSeries } from '../../services/history';

export default function HeatFlowChart({ heatFlow, maxAge = 200, height = 220 }) {
  const data = useMemo(() => heatFlowSeries(heatFlow, maxAge), [heatFlow, maxAge]);
  return (
    <div className="w-full bg-white rounded-lg border border-slate-300 p-3 relative" style={{ height }} data-testid="bf-heatflow-chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={CHART_MARGINS.standard}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
          <XAxis
            dataKey="age" type="number" reversed domain={[0, 'dataMax']}
            stroke={CHART_COLORS.axisLine}
            tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
            label={{ value: 'Age (Ma)', position: 'bottom', fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }}
          />
          <YAxis
            type="number" domain={['auto', 'auto']}
            stroke={CHART_COLORS.axisLine}
            tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
            label={{ value: 'Heat flow (mW/m²)', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }}
          />
          <Tooltip
            contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, borderColor: CHART_COLORS.tooltipBorder, color: CHART_COLORS.tooltipText }}
            formatter={(v) => [`${Number(v).toFixed(1)} mW/m²`, 'Heat flow']}
            labelFormatter={(v) => `${v} Ma`}
          />
          <Line dataKey="value" stroke="#c1121f" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
      <ChartLogo />
    </div>
  );
}
