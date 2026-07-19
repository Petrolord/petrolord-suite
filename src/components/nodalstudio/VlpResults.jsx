// Outflow tab: tubing performance curve and, for oil wells, the pressure
// traverse at a chosen rate with holdup/regime diagnostics.
import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { CHART_COLORS, CHART_TYPOGRAPHY, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useNodalStudio } from '@/contexts/NodalAnalysisStudioContext';
import { CORRELATIONS } from '@/utils/nodal/correlations/index';
import { ChartCard, Kpi, WarningBanner, LINE, fmtU, fmt } from './primitives';
import { unitLabel, fromOilfield } from '@/utils/nodal/units';

const axisProps = {
  stroke: CHART_COLORS.axisLine,
  tick: { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize },
};
const tooltipProps = {
  contentStyle: TOOLTIP_STYLE,
  labelStyle: { color: CHART_COLORS.tooltipText },
  itemStyle: { color: CHART_COLORS.tooltipText },
};
const legendProps = { wrapperStyle: { fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText } };

const VlpResults = () => {
  const { system, traverseProfile, isGasWell, unitSystem, completion, vlpSpec } = useNodalStudio();
  const rateKind = isGasWell ? 'gasRate' : 'oilRate';

  const vlpData = useMemo(() => {
    if (!system?.curve) return [];
    return system.curve.map((p) => ({
      q: fromOilfield(rateKind, p.q, unitSystem),
      vlp: fromOilfield('pressure', p.vlp, unitSystem),
    }));
  }, [system, unitSystem, rateKind]);

  const profileData = useMemo(() => {
    if (!traverseProfile?.points) return [];
    return traverseProfile.points.map((p) => ({
      p: fromOilfield('pressure', p.p, unitSystem),
      tvd: fromOilfield('length', p.tvd, unitSystem),
      holdup: p.holdup,
    }));
  }, [traverseProfile, unitSystem]);

  const bottom = traverseProfile?.points?.[traverseProfile.points.length - 1];
  const correlationLabel = isGasWell
    ? completion.outflow === 'gray'
      ? 'Gray (wet gas)'
      : 'Cullender-Smith (dry gas)'
    : CORRELATIONS[vlpSpec?.vlp?.correlation]?.label || '—';

  return (
    <div className="space-y-4">
      <WarningBanner warnings={(traverseProfile?.warnings || []).filter(Boolean)} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi title="Outflow model" value={correlationLabel} />
        {bottom && (
          <Kpi title="BHP at viewed rate" value={fmtU('pressure', bottom.p, unitSystem, fmt.int)} unit={unitLabel('pressure', unitSystem)} accent />
        )}
        {bottom && (
          <Kpi title="Bottom gradient" value={fmtU('gradient', traverseProfile.points[traverseProfile.points.length - 1].dpdz, unitSystem, fmt.f3)} unit={unitLabel('gradient', unitSystem)} />
        )}
        {bottom && <Kpi title="Bottom holdup" value={fmt.f2(bottom.holdup)} />}
      </div>

      <ChartCard title="Tubing performance (outflow) curve" height={300}>
        <LineChart data={vlpData} margin={{ top: 10, right: 20, bottom: 24, left: 12 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
          <XAxis
            dataKey="q"
            type="number"
            domain={[0, 'auto']}
            {...axisProps}
            label={{ value: `Rate (${unitLabel(rateKind, unitSystem)})`, position: 'insideBottom', offset: -12, fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
          />
          <YAxis
            type="number"
            domain={['auto', 'auto']}
            {...axisProps}
            label={{ value: `Required BHP (${unitLabel('pressure', unitSystem)})`, angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
          />
          <Tooltip {...tooltipProps} formatter={(v) => fmt.f1(v)} labelFormatter={(v) => `q = ${fmt.f1(v)}`} />
          <Legend {...legendProps} />
          <Line dataKey="vlp" name="Outflow (VLP)" stroke={LINE.vlp} dot={false} strokeWidth={2} isAnimationActive={false} />
        </LineChart>
      </ChartCard>

      {!isGasWell && profileData.length > 0 && (
        <ChartCard title="Pressure traverse at the viewed rate" height={330}>
          <LineChart data={profileData} margin={{ top: 10, right: 20, bottom: 24, left: 12 }}>
            <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
            <XAxis
              dataKey="p"
              type="number"
              domain={['auto', 'auto']}
              {...axisProps}
              label={{ value: `Pressure (${unitLabel('pressure', unitSystem)})`, position: 'insideBottom', offset: -12, fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
            />
            <YAxis
              dataKey="tvd"
              type="number"
              reversed
              domain={[0, 'auto']}
              {...axisProps}
              label={{ value: `TVD (${unitLabel('length', unitSystem)})`, angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
            />
            <Tooltip {...tooltipProps} formatter={(v) => fmt.f1(v)} labelFormatter={(v) => `p = ${fmt.f1(v)}`} />
            <Legend {...legendProps} />
            <Line dataKey="tvd" name="Traverse" stroke={LINE.traverse} dot={false} strokeWidth={2} isAnimationActive={false} />
          </LineChart>
        </ChartCard>
      )}
    </div>
  );
};

export default VlpResults;
