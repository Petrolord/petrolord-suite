// The PTA log-log diagnostic plot: pressure change and Bourdet derivative as
// scatter, optional analytical-model overlay as lines. Both axes log scale
// (the DCATypeCurvePlot Recharts idiom), white ChartFrame standard via the
// caller's ChartCard.
import React, { useMemo } from 'react';
import { ComposedChart, Scatter, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { CHART_COLORS, CHART_TYPOGRAPHY, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { LINE, logTicks, logTickFormatter } from './primitives';

const axisProps = { stroke: CHART_COLORS.axisLine, tick: { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize } };
const tooltipProps = { contentStyle: TOOLTIP_STYLE, labelStyle: { color: CHART_COLORS.tooltipText }, itemStyle: { color: CHART_COLORS.tooltipText } };
const legendProps = { wrapperStyle: { fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText } };

/**
 * @param {Array} loglog observed [{x, dp, derivative}]
 * @param {Array} [modelSeries] model overlay [{x, modelDp, modelDerivative}]
 * @param {string} [xLabel]
 */
const LogLogChart = ({ loglog, modelSeries, xLabel = 'Equivalent time (hr)', yLabel = 'Δp and derivative (psi)' }) => {
  const data = useMemo(() => {
    const byX = new Map();
    for (const p of loglog || []) {
      if (p.x > 0) {
        byX.set(p.x, {
          x: p.x,
          dp: p.dp > 0 ? p.dp : null,
          derivative: p.derivative > 0 ? p.derivative : null,
        });
      }
    }
    for (const m of modelSeries || []) {
      if (!(m.x > 0)) continue;
      const row = byX.get(m.x) || { x: m.x };
      row.modelDp = m.modelDp > 0 ? m.modelDp : null;
      row.modelDerivative = m.modelDerivative > 0 ? m.modelDerivative : null;
      byX.set(m.x, row);
    }
    return [...byX.values()].sort((a, b) => a.x - b.x);
  }, [loglog, modelSeries]);

  const yValues = data.flatMap((d) => [d.dp, d.derivative, d.modelDp, d.modelDerivative]).filter((v) => v > 0);

  return (
    <ComposedChart data={data} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
      <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
      <XAxis
        dataKey="x" type="number" scale="log" domain={['auto', 'auto']}
        ticks={logTicks(data.map((d) => d.x))} tickFormatter={logTickFormatter} {...axisProps}
        label={{ value: xLabel, position: 'insideBottom', offset: -10, fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
      />
      <YAxis
        type="number" scale="log" domain={['auto', 'auto']}
        ticks={logTicks(yValues)} tickFormatter={logTickFormatter} {...axisProps}
        label={{ value: yLabel, angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
      />
      <Tooltip {...tooltipProps} formatter={(v) => (Number.isFinite(v) ? v.toPrecision(4) : v)} labelFormatter={(v) => `t = ${Number(v).toPrecision(3)} hr`} />
      <Legend {...legendProps} />
      <Scatter dataKey="dp" name="Δp" fill={LINE.dp} isAnimationActive={false} />
      <Scatter dataKey="derivative" name="Bourdet derivative" fill={LINE.derivative} isAnimationActive={false} />
      {modelSeries && <Line type="monotone" dataKey="modelDp" name="Model Δp" stroke={LINE.model} dot={false} strokeWidth={2} isAnimationActive={false} connectNulls />}
      {modelSeries && <Line type="monotone" dataKey="modelDerivative" name="Model derivative" stroke={LINE.modelDeriv} dot={false} strokeWidth={2} isAnimationActive={false} connectNulls />}
    </ComposedChart>
  );
};

export default LogLogChart;
