// One chart for the Consequence Modelling Studio (PS2): a quantity against
// distance, on the Suite chart standard (white chartTheme, ChartLogo). Every
// plotted value is an engine result at that distance; the grid of distances
// is the studio's.
import React from 'react';
import {
  CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
import {
  CHART_COLORS, CHART_MARGINS, CHART_TYPOGRAPHY, GRID_STYLE, LEGEND_PROPS, PINNED_TOOLTIP_PROPS,
  XAXIS_LABEL_HEIGHT,
} from '@/utils/chartTheme';
import { formatSci } from '@/utils/processSafety/consequenceStudy';

export const SERIES_COLORS = ['#2563eb', '#d97706', '#059669'];
const MARK = { target: '#dc2626', point: '#475569' };

const decadeDomain = (values) => {
  const v = values.filter((x) => Number.isFinite(x) && x > 0);
  if (v.length === 0) return [1, 10];
  return [10 ** Math.floor(Math.log10(Math.min(...v))), 10 ** Math.ceil(Math.log10(Math.max(...v)))];
};

/**
 * @param {object} p
 * @param {Array<object>} p.data rows keyed by xKey and each series key
 * @param {string} p.xKey
 * @param {Array<{key: string, name: string}>} p.series
 * @param {string} p.xLabel axis label with its unit
 * @param {string} p.yLabel axis label with its unit
 * @param {boolean} [p.logX]
 * @param {boolean} [p.logY]
 * @param {number} [p.targetY] a horizontal target line
 * @param {string} [p.targetLabel]
 * @param {number} [p.markX] a vertical line at the chosen distance
 * @param {string} [p.markLabel]
 */
const ConsequenceChart = ({
  data, xKey, series, xLabel, yLabel, logX = false, logY = false, targetY, targetLabel,
  markX, markLabel, testId,
}) => {
  const tickStyle = { fontSize: CHART_TYPOGRAPHY.axisFontSize, fill: CHART_COLORS.axisText };
  const ys = data.flatMap((d) => series.map((s) => d[s.key]));
  if (Number.isFinite(targetY)) ys.push(targetY);
  const yDomain = logY ? decadeDomain(ys) : [0, 'auto'];
  const xDomain = logX ? decadeDomain(data.map((d) => d[xKey])) : ['dataMin', 'dataMax'];
  return (
    <div className="relative h-80 rounded-lg bg-white p-2" data-testid={testId}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={CHART_MARGINS.legend}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis
            dataKey={xKey} type="number" scale={logX ? 'log' : 'auto'} domain={xDomain} allowDataOverflow
            tick={tickStyle} stroke={CHART_COLORS.axisLine} height={XAXIS_LABEL_HEIGHT}
            tickFormatter={(v) => formatSci(v, 2)}
            label={{ value: xLabel, position: 'insideBottom', offset: 0, fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }}
          />
          <YAxis
            type="number" scale={logY ? 'log' : 'auto'} domain={yDomain} allowDataOverflow tick={tickStyle}
            stroke={CHART_COLORS.axisLine} tickFormatter={(v) => formatSci(v, 2)} width={72}
            label={{ value: yLabel, angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }}
          />
          <Tooltip
            {...PINNED_TOOLTIP_PROPS}
            labelFormatter={(v) => `${xLabel.replace(/ \(.*\)$/, '')} ${formatSci(Number(v))}`}
            formatter={(v, name) => [formatSci(v), name]}
          />
          <Legend {...LEGEND_PROPS} />
          {Number.isFinite(targetY) && targetY > 0 ? (
            <ReferenceLine
              y={targetY} stroke={MARK.target} strokeDasharray="6 3" ifOverflow="hidden"
              label={{ value: targetLabel, position: 'insideTopRight', fill: MARK.target, fontSize: CHART_TYPOGRAPHY.annotationFontSize }}
            />
          ) : null}
          {Number.isFinite(markX) && markX > 0 ? (
            <ReferenceLine
              x={markX} stroke={MARK.point} strokeDasharray="2 4" ifOverflow="hidden"
              label={{ value: markLabel, position: 'insideTopLeft', fill: MARK.point, fontSize: CHART_TYPOGRAPHY.annotationFontSize }}
            />
          ) : null}
          {series.map((s, i) => (
            <Line
              key={s.key} type="linear" dataKey={s.key} name={s.name} stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
              strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <ChartLogo />
    </div>
  );
};

export default ConsequenceChart;
