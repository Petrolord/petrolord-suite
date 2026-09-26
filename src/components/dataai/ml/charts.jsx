// ML Workbench: charts (Data & AI D2).
//
// White chartTheme with the ChartLogo watermark. Every plotted number is an
// engine output from the last run. A chart with more points than a browser
// can draw shows every nth row from row 0 and says so; the CSV export has
// every row.
import React from 'react';
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter,
  ScatterChart, Tooltip, XAxis, YAxis,
} from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
import {
  CHART_COLORS, CHART_MARGINS, CHART_TYPOGRAPHY, GRID_STYLE, LEGEND_PROPS, PINNED_TOOLTIP_PROPS, XAXIS_LABEL_HEIGHT,
} from '@/utils/chartTheme';
import { fmt, Note } from '@/components/dataai/quality/shared';

// Blue for measured, amber for predicted, slate for reference lines: the
// hues chartTheme's stream palettes already validate on the white surface.
export const SERIES = {
  actual: '#1d4ed8', predicted: '#b45309', reference: '#475569', train: '#1d4ed8', test: '#b91c1c', bar: '#1d4ed8',
};
const tick = { fontSize: CHART_TYPOGRAPHY.axisFontSize, fill: CHART_COLORS.axisText };
const axisLabel = (value, extra = {}) => ({ value, fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize, ...extra });

export const MAX_PLOT_POINTS = 4000;

export const Frame = ({ children, testId, height = 'h-72' }) => (
  <div className={`relative ${height} rounded-lg bg-white p-2`} data-testid={testId}>
    <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
    <ChartLogo />
  </div>
);

export const strideNote = (n, stride) => (stride > 1
  ? `Showing every ${stride}th of ${n.toLocaleString('en-US')} rows, from row 0; the CSV export has them all.`
  : null);

/** Predicted against measured, with the 1:1 line. */
export const CrossPlot = ({
  points, xLabel, yLabel, testId = 'crossplot',
}) => {
  const stride = Math.max(1, Math.ceil(points.length / MAX_PLOT_POINTS));
  const shown = stride > 1 ? points.filter((_, i) => i % stride === 0) : points;
  let lo = Infinity;
  let hi = -Infinity;
  points.forEach((p) => { lo = Math.min(lo, p.x, p.y); hi = Math.max(hi, p.x, p.y); });
  return (
    <div className="space-y-1">
      <Frame testId={testId}>
        <ScatterChart margin={CHART_MARGINS.legend}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis type="number" dataKey="x" name={xLabel} tick={tick} stroke={CHART_COLORS.axisLine} height={XAXIS_LABEL_HEIGHT} domain={['auto', 'auto']} tickFormatter={fmt} label={axisLabel(xLabel, { position: 'insideBottom', offset: 0 })} />
          <YAxis type="number" dataKey="y" name={yLabel} tick={tick} stroke={CHART_COLORS.axisLine} width={70} domain={['auto', 'auto']} tickFormatter={fmt} label={axisLabel(yLabel, { angle: -90, position: 'insideLeft' })} />
          <Tooltip {...PINNED_TOOLTIP_PROPS} formatter={(v) => fmt(v)} />
          <Legend {...LEGEND_PROPS} />
          {Number.isFinite(lo) ? <ReferenceLine segment={[{ x: lo, y: lo }, { x: hi, y: hi }]} stroke={SERIES.reference} strokeDasharray="6 3" ifOverflow="extendDomain" /> : null}
          <Scatter name="Held-out rows" data={shown} fill={SERIES.actual} isAnimationActive={false} shape="circle" />
        </ScatterChart>
      </Frame>
      {stride > 1 ? <Note>{strideNote(points.length, stride)}</Note> : null}
      <Note>The dashed line is predicted = measured. Each point was predicted by a model that never saw its well.</Note>
    </div>
  );
};

/** Measured and predicted against depth for one well (depth down). */
export const DepthTrack = ({
  rows, valueLabel, depthLabel, actualName = 'Measured', predictedName = 'Predicted', testId = 'depth-track',
}) => (
  <Frame testId={testId} height="h-[28rem]">
    <ComposedChart layout="vertical" data={rows} margin={{ top: 8, right: 28, bottom: 12, left: 8 }}>
      <CartesianGrid {...GRID_STYLE} />
      <XAxis type="number" tick={tick} stroke={CHART_COLORS.axisLine} domain={['auto', 'auto']} tickFormatter={fmt} height={XAXIS_LABEL_HEIGHT} label={axisLabel(valueLabel, { position: 'insideBottom', offset: 0 })} />
      <YAxis type="number" dataKey="depth" tick={tick} stroke={CHART_COLORS.axisLine} width={70} domain={['dataMin', 'dataMax']} tickFormatter={fmt} label={axisLabel(depthLabel, { angle: -90, position: 'insideLeft' })} />
      <Tooltip {...PINNED_TOOLTIP_PROPS} formatter={(v) => fmt(v)} labelFormatter={(v) => `${fmt(v)} ${depthLabel}`} />
      <Legend {...LEGEND_PROPS} />
      <Line dataKey="actual" name={actualName} stroke={SERIES.actual} strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls={false} />
      <Line dataKey="predicted" name={predictedName} stroke={SERIES.predicted} strokeWidth={1.5} strokeDasharray="4 2" dot={false} isAnimationActive={false} connectNulls={false} />
    </ComposedChart>
  </Frame>
);

/** The engine's ROC points, with the chance diagonal. */
export const RocChart = ({ roc, testId = 'roc-chart' }) => {
  const n = roc.fpr.length;
  const stride = Math.max(1, Math.ceil(n / MAX_PLOT_POINTS));
  const data = roc.fpr.map((x, i) => ({ x, tpr: roc.tpr[i] })).filter((_, i) => i % stride === 0 || i === n - 1);
  return (
    <div className="space-y-1">
      <Frame testId={testId}>
        <LineChart data={data} margin={CHART_MARGINS.legend}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis type="number" dataKey="x" domain={[0, 1]} tick={tick} stroke={CHART_COLORS.axisLine} height={XAXIS_LABEL_HEIGHT} tickFormatter={fmt} label={axisLabel('False positive rate', { position: 'insideBottom', offset: 0 })} />
          <YAxis type="number" domain={[0, 1]} tick={tick} stroke={CHART_COLORS.axisLine} width={60} tickFormatter={fmt} label={axisLabel('True positive rate', { angle: -90, position: 'insideLeft' })} />
          <Tooltip {...PINNED_TOOLTIP_PROPS} formatter={(v) => fmt(v)} />
          <Legend {...LEGEND_PROPS} />
          <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke={SERIES.reference} strokeDasharray="6 3" />
          <Line type="linear" dataKey="tpr" name="ROC" stroke={SERIES.actual} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </Frame>
      {stride > 1 ? <Note>Showing every {stride}th of {n.toLocaleString('en-US')} ROC points; the CSV export has them all.</Note> : null}
    </div>
  );
};

/** Train and test score against the number of training wells. */
export const LearningChart = ({ points, metric, testId = 'learning-chart' }) => (
  <Frame testId={testId}>
    <LineChart data={points.map((p) => ({ x: p.nGroups, train: p.trainScore, test: p.testScore }))} margin={CHART_MARGINS.legend}>
      <CartesianGrid {...GRID_STYLE} />
      <XAxis type="number" dataKey="x" allowDecimals={false} domain={['dataMin', 'dataMax']} tick={tick} stroke={CHART_COLORS.axisLine} height={XAXIS_LABEL_HEIGHT} label={axisLabel('Training wells', { position: 'insideBottom', offset: 0 })} />
      <YAxis tick={tick} stroke={CHART_COLORS.axisLine} width={70} domain={['auto', 'auto']} tickFormatter={fmt} label={axisLabel(metric, { angle: -90, position: 'insideLeft' })} />
      <Tooltip {...PINNED_TOOLTIP_PROPS} formatter={(v) => fmt(v)} />
      <Legend {...LEGEND_PROPS} />
      <Line dataKey="train" name={`Training ${metric}`} stroke={SERIES.train} strokeWidth={2} isAnimationActive={false} />
      <Line dataKey="test" name={`Held-out ${metric}`} stroke={SERIES.test} strokeWidth={2} strokeDasharray="4 2" isAnimationActive={false} />
    </LineChart>
  </Frame>
);

/** Mean drop in score per feature (permutation importance). */
export const ImportanceChart = ({ importances, metric, testId = 'importance-chart' }) => (
  <Frame testId={testId} height="h-64">
    <BarChart layout="vertical" data={importances.map((r) => ({ name: r.feature, mean: r.mean }))} margin={{ top: 8, right: 28, bottom: 12, left: 8 }}>
      <CartesianGrid {...GRID_STYLE} />
      <XAxis type="number" tick={tick} stroke={CHART_COLORS.axisLine} tickFormatter={fmt} height={XAXIS_LABEL_HEIGHT} label={axisLabel(`Mean drop in ${metric}`, { position: 'insideBottom', offset: 0 })} />
      <YAxis type="category" dataKey="name" tick={tick} stroke={CHART_COLORS.axisLine} width={90} />
      <Tooltip {...PINNED_TOOLTIP_PROPS} formatter={(v) => fmt(v)} />
      <ReferenceLine x={0} stroke={SERIES.reference} />
      <Bar dataKey="mean" name="Mean drop" fill={SERIES.bar} isAnimationActive={false} />
    </BarChart>
  </Frame>
);
