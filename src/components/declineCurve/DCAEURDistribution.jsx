import React from 'react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { createEURHistogram } from '@/utils/dcaMonteCarlo';
import ChartLogo from '@/components/charts/ChartLogo';
import { CHART_COLORS, TOOLTIP_STYLE, getStreamPalette } from '@/utils/chartTheme';

// R1: converted from the ad-hoc dark styling to the Suite chart
// standard (white surface, chartTheme tokens, watermark). Kept as a
// compact inline histogram; the watermark is scaled to the sparkline.
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

  return (
    <div className="relative h-24 bg-white rounded-md p-1">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={histogramData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
          <XAxis dataKey="bin" hide />
          <YAxis hide />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={{ color: CHART_COLORS.tooltipText }}
            itemStyle={{ color: CHART_COLORS.tooltipText }}
            labelFormatter={(value) => `EUR: ${Number(value).toLocaleString()} ${getUnits()}`}
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
      <ChartLogo style={{ height: '14px', bottom: '2px', right: '4px', opacity: 0.4 }} />
    </div>
  );
};

export default DCAEURDistribution;
