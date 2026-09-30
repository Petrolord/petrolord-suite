// IPR tab: inflow performance curve and calibration summary.
import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { CHART_COLORS, CHART_TYPOGRAPHY, TOOLTIP_STYLE, LEGEND_PROPS, XAXIS_LABEL_HEIGHT } from '@/utils/chartTheme';
import { useNodalStudio } from '@/contexts/NodalAnalysisStudioContext';
import { ChartCard, Kpi, WarningBanner, LINE, fmtU, fmt } from './primitives';
import { unitLabel, fromOilfield } from '@/utils/nodal/units';
import { EMPTY_VALUE } from '@/lib/emptyValue';

const axisProps = {
  stroke: CHART_COLORS.axisLine,
  tick: { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize },
};
const tooltipProps = {
  contentStyle: TOOLTIP_STYLE,
  labelStyle: { color: CHART_COLORS.tooltipText },
  itemStyle: { color: CHART_COLORS.tooltipText },
};
// Nodal T1: the shared legend band, so the legend never sits on the axis title
const legendProps = LEGEND_PROPS;

const MODEL_LABELS = {
  pi: 'Straight-line PI',
  vogel: 'Vogel',
  composite: 'Composite (Standing)',
  fetkovich: 'Fetkovich',
  jones: 'Jones',
};

const IprResults = () => {
  const { inflowSpec, isGasWell, unitSystem } = useNodalStudio();
  const rateKind = isGasWell ? 'gasRate' : 'oilRate';
  const result = isGasWell ? inflowSpec.gasIpr : inflowSpec.ipr;

  const chartData = useMemo(() => {
    if (!result?.curve?.length) return [];
    return [...result.curve]
      .sort((a, b) => a.q - b.q)
      .map((p) => ({
        q: fromOilfield(rateKind, p.q, unitSystem),
        pwf: fromOilfield('pressure', p.pwf, unitSystem),
      }));
  }, [result, unitSystem, rateKind]);

  return (
    <div className="space-y-4">
      <WarningBanner warnings={[inflowSpec.error, ...(result?.warnings || [])].filter(Boolean)} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi
          title={isGasWell ? 'AOF' : 'Max rate (qmax)'}
          value={fmtU(rateKind, isGasWell ? result?.aof : result?.qmax, unitSystem, fmt.int)}
          unit={unitLabel(rateKind, unitSystem)}
          accent
        />
        {!isGasWell && Number.isFinite(result?.pi) && (
          <Kpi title="Productivity index J" value={fmtU('productivityIndex', result.pi, unitSystem, fmt.f3)} unit={unitLabel('productivityIndex', unitSystem)} />
        )}
        {!isGasWell && (
          <Kpi title="Model" value={MODEL_LABELS[result?.model] || EMPTY_VALUE} />
        )}
        {!isGasWell && Number.isFinite(result?.pb) && result?.pb > 0 && (
          <Kpi title="Bubble point" value={fmtU('pressure', result.pb, unitSystem, fmt.int)} unit={unitLabel('pressure', unitSystem)} />
        )}
      </div>

      <ChartCard title="Inflow performance" height={360}>
        <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 8, left: 12 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
          <XAxis height={XAXIS_LABEL_HEIGHT}
            dataKey="q"
            type="number"
            domain={[0, 'auto']}
            {...axisProps}
            label={{ value: `Rate (${unitLabel(rateKind, unitSystem)})`, position: 'insideBottom', offset: 0, fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
          />
          <YAxis
            type="number"
            domain={[0, 'auto']}
            {...axisProps}
            label={{ value: `Flowing pressure (${unitLabel('pressure', unitSystem)})`, angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
          />
          <Tooltip {...tooltipProps} formatter={(v) => fmt.f1(v)} labelFormatter={(v) => `q = ${fmt.f1(v)}`} />
          <Legend {...legendProps} />
          <Line dataKey="pwf" name="IPR" stroke={LINE.ipr} dot={false} strokeWidth={2} isAnimationActive={false} />
        </LineChart>
      </ChartCard>
    </div>
  );
};

export default IprResults;
