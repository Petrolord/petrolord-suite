// AI Evaluation Studio: charts (Data & AI D5).
//
// White chartTheme with the ChartLogo watermark, one value axis per chart.
// Every plotted number is an engine output from the last run. The
// reliability chart plots each non-empty bin's mean predicted probability
// against its observed frequency, with the diagonal of perfect calibration
// dashed; the count chart beside it shows how many rows each bin holds, so a
// large gap on three rows is read as three rows.
import React from 'react';
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis,
} from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
import {
  CHART_COLORS, CHART_MARGINS, CHART_TYPOGRAPHY, GRID_STYLE, LEGEND_PROPS, PINNED_TOOLTIP_PROPS, XAXIS_LABEL_HEIGHT,
} from '@/utils/chartTheme';
import { fmt } from '@/components/dataai/quality/shared';

const OBSERVED = '#1d4ed8';
const IDEAL = '#64748b';
const COUNT = '#0f766e';
const tick = { fontSize: CHART_TYPOGRAPHY.axisFontSize, fill: CHART_COLORS.axisText };
const axisLabel = (value, extra = {}) => ({
  value, fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize, ...extra,
});

export const Frame = ({ children, testId, height = 'h-80' }) => (
  <div className={`relative ${height} rounded-lg bg-white p-2`} data-testid={testId}>
    <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
    <ChartLogo />
  </div>
);

/** Observed frequency against mean predicted probability per non-empty bin, and the diagonal. */
export const ReliabilityChart = ({ calibration, testId = 'reliability-chart' }) => {
  const points = calibration.table.filter((b) => b.n > 0).map((b) => ({
    p: b.meanPredicted, observed: b.observedFrequency, n: b.n, bin: b.bin,
  }));
  const ideal = [{ p: 0, ideal: 0 }, { p: 1, ideal: 1 }];
  return (
    <Frame testId={testId}>
      <ComposedChart margin={CHART_MARGINS.legend}>
        <CartesianGrid {...GRID_STYLE} />
        <XAxis type="number" dataKey="p" domain={[0, 1]} ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]} tick={tick} stroke={CHART_COLORS.axisLine} height={XAXIS_LABEL_HEIGHT} label={axisLabel('Mean predicted probability in the bin', { position: 'insideBottom', offset: 0 })} />
        <YAxis type="number" domain={[0, 1]} ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]} tick={tick} stroke={CHART_COLORS.axisLine} width={60} label={axisLabel('Observed frequency', { angle: -90, position: 'insideLeft' })} />
        <Tooltip {...PINNED_TOOLTIP_PROPS} formatter={(v, name) => [fmt(v), name]} labelFormatter={(p) => `mean predicted ${fmt(p)}`} />
        <Legend {...LEGEND_PROPS} />
        <Line data={ideal} dataKey="ideal" name="Perfect calibration" stroke={IDEAL} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
        <Line data={points} dataKey="observed" name="Observed frequency per bin" stroke={OBSERVED} strokeWidth={2} dot={{ r: 4, fill: OBSERVED }} isAnimationActive={false} />
        <Scatter data={points} dataKey="observed" name="Bins" fill={OBSERVED} legendType="none" isAnimationActive={false} />
      </ComposedChart>
    </Frame>
  );
};

/** Rows per bin, every bin shown with its edges. */
export const BinCountChart = ({ calibration, testId = 'bin-count-chart' }) => (
  <Frame testId={testId} height="h-56">
    <BarChart data={calibration.table.map((b) => ({ name: `${fmt(b.lower)} to ${fmt(b.upper)}`, n: b.n }))} margin={CHART_MARGINS.legend}>
      <CartesianGrid {...GRID_STYLE} />
      <XAxis dataKey="name" tick={tick} stroke={CHART_COLORS.axisLine} height={XAXIS_LABEL_HEIGHT} label={axisLabel('Bin (probability range)', { position: 'insideBottom', offset: 0 })} />
      <YAxis allowDecimals={false} tick={tick} stroke={CHART_COLORS.axisLine} width={50} label={axisLabel('Rows', { angle: -90, position: 'insideLeft' })} />
      <Tooltip {...PINNED_TOOLTIP_PROPS} formatter={(v) => fmt(v)} />
      <Bar dataKey="n" name="Rows in the bin" fill={COUNT} radius={[4, 4, 0, 0]} isAnimationActive={false} />
    </BarChart>
  </Frame>
);
