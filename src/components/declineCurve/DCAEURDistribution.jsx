import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Label } from 'recharts';
import { createEURHistogram } from '@/utils/dcaMonteCarlo';
import ChartLogo from '@/components/charts/ChartLogo';
import {
  CHART_COLORS,
  CHART_TYPOGRAPHY,
  GRID_STYLE,
  TOOLTIP_STYLE,
  getStreamPalette
} from '@/utils/chartTheme';

// Full-size histogram on the Suite chart standard (white surface,
// chartTheme tokens, watermark). It began life as a compact h-24 sparkline
// when Forecast Results lived in the cramped bottom slot; the panel now has
// a full-height tab, so the chart carries real axes.
const DCAEURDistribution = ({ distribution, selectedStream }) => {
  if (!distribution || distribution.length === 0) {
    return (
      <div className="h-24 flex items-center justify-center text-slate-500 text-xs">
        No distribution data
      </div>
    );
  }

  const histogramData = createEURHistogram(distribution, 15);
  const palette = getStreamPalette(selectedStream);

  const getUnits = () => {
    switch (selectedStream) {
      case 'gas': return 'Mcf';
      case 'water': return 'bbl';
      default: return 'bbl';
    }
  };

  const formatEUR = (value) => {
    const v = Number(value);
    if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3) return `${(v / 1e3).toFixed(0)}k`;
    return v.toFixed(0);
  };

  return (
    <div className="relative h-64 bg-white rounded-md p-1">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={histogramData} margin={{ top: 8, right: 12, left: 4, bottom: 16 }}>
          <CartesianGrid {...GRID_STYLE} vertical={false} />
          <XAxis
            dataKey="bin"
            tickFormatter={formatEUR}
            tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
            axisLine={{ stroke: CHART_COLORS.axisLine, strokeWidth: 1 }}
            tickLine={{ stroke: CHART_COLORS.axisLine, strokeWidth: 1 }}
            interval="preserveStartEnd"
            minTickGap={40}
          >
            <Label
              value={`EUR (${getUnits()})`}
              position="insideBottom"
              offset={-10}
              style={{ fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }}
            />
          </XAxis>
          <YAxis
            allowDecimals={false}
            tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
            axisLine={{ stroke: CHART_COLORS.axisLine, strokeWidth: 1 }}
            tickLine={{ stroke: CHART_COLORS.axisLine, strokeWidth: 1 }}
          >
            <Label
              value="Runs"
              angle={-90}
              position="insideLeft"
              style={{ fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }}
            />
          </YAxis>
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={{ color: CHART_COLORS.tooltipText }}
            itemStyle={{ color: CHART_COLORS.tooltipText }}
            labelFormatter={(value) => `EUR: ${Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })} ${getUnits()}`}
            formatter={(value) => [`${value} runs`, 'Frequency']}
          />
          <Bar
            dataKey="count"
            fill={palette.forecast}
            fillOpacity={0.75}
            stroke={palette.forecast}
            strokeWidth={0.5}
            radius={[1, 1, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
      <ChartLogo style={{ height: '40px', bottom: '6px', right: '8px', opacity: 0.5 }} />
    </div>
  );
};

export default DCAEURDistribution;
