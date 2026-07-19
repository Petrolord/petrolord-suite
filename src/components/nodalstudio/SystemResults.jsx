// System tab: IPR x VLP nodal plot with the operating point, status and
// crossing diagnostics.
import React, { useMemo } from 'react';
import { ComposedChart, Line, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { CHART_COLORS, CHART_TYPOGRAPHY, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useNodalStudio } from '@/contexts/NodalAnalysisStudioContext';
import { ChartCard, Kpi, WarningBanner, LINE, fmtU, valueWithUnit, fmt, SectionLabel } from './primitives';
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

const STATUS_COPY = {
  flowing: { text: 'The well flows at a stable operating point.', cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' },
  dead: { text: 'The outflow curve sits above the inflow everywhere. The well cannot flow naturally at this wellhead pressure. Consider artificial lift or a lower wellhead pressure.', cls: 'border-rose-500/40 bg-rose-500/10 text-rose-300' },
  'no-stable-solution': { text: 'The curves cross only on the unstable heading branch. Sustained flow is unlikely without changing the completion or wellhead pressure.', cls: 'border-amber-500/40 bg-amber-500/10 text-amber-300' },
  invalid: { text: 'Inputs are incomplete.', cls: 'border-slate-600 bg-slate-800/40 text-slate-300' },
};

const SystemResults = () => {
  const { system, isGasWell, unitSystem, inflowSpec, vlpSpec, wellSpec, fluidSpec } = useNodalStudio();

  const rateKind = isGasWell ? 'gasRate' : 'oilRate';
  const chartData = useMemo(() => {
    if (!system?.curve) return [];
    return system.curve.map((p) => ({
      q: fromOilfield(rateKind, p.q, unitSystem),
      ipr: fromOilfield('pressure', p.ipr, unitSystem),
      vlp: fromOilfield('pressure', p.vlp, unitSystem),
    }));
  }, [system, unitSystem, rateKind]);

  const opData = useMemo(() => {
    if (!system?.op) return [];
    return [
      {
        q: fromOilfield(rateKind, system.op.q, unitSystem),
        p: fromOilfield('pressure', system.op.pwf, unitSystem),
      },
    ];
  }, [system, unitSystem, rateKind]);

  const status = STATUS_COPY[system?.status] || STATUS_COPY.invalid;
  const inputErrors = [fluidSpec?.error, wellSpec?.error, inflowSpec?.error, vlpSpec?.error, system?.error].filter(Boolean);
  const iprWarnings = (isGasWell ? inflowSpec?.gasIpr?.warnings : inflowSpec?.ipr?.warnings) || [];

  return (
    <div className="space-y-4">
      <WarningBanner warnings={[...inputErrors, ...iprWarnings]} />
      <div data-testid="nodal-system-status" data-status={system?.status} className={`rounded-lg border px-4 py-3 text-sm ${status.cls}`}>{status.text}</div>

      {system?.op && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div data-testid="nodal-op-rate" data-q={Math.round(system.op.q)}>
            <Kpi title="Operating rate" value={fmtU(rateKind, system.op.q, unitSystem, fmt.int)} unit={unitLabel(rateKind, unitSystem)} accent />
          </div>
          <Kpi title="Flowing BHP" value={fmtU('pressure', system.op.pwf, unitSystem, fmt.int)} unit={unitLabel('pressure', unitSystem)} />
          <Kpi title="AOF / max rate" value={fmtU(rateKind, system.qMax, unitSystem, fmt.int)} unit={unitLabel(rateKind, unitSystem)} />
          <Kpi title="Drawdown use" value={fmt.pct(system.op.q / system.qMax)} />
        </div>
      )}

      <ChartCard title="Nodal system plot" height={360}>
        <ComposedChart data={chartData} margin={{ top: 10, right: 20, bottom: 24, left: 12 }}>
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
            domain={[0, 'auto']}
            {...axisProps}
            label={{ value: `Node pressure (${unitLabel('pressure', unitSystem)})`, angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
          />
          <Tooltip {...tooltipProps} formatter={(v) => fmt.f1(v)} labelFormatter={(v) => `q = ${fmt.f1(v)}`} />
          <Legend {...legendProps} />
          <Line dataKey="ipr" name="Inflow (IPR)" stroke={LINE.ipr} dot={false} strokeWidth={2} isAnimationActive={false} />
          <Line dataKey="vlp" name="Outflow (VLP)" stroke={LINE.vlp} dot={false} strokeWidth={2} isAnimationActive={false} />
          <Scatter data={opData} dataKey="p" name="Operating point" fill={LINE.operating} shape="circle" isAnimationActive={false} />
        </ComposedChart>
      </ChartCard>

      {system?.intersections?.length > 1 && (
        <div className="space-y-2">
          <SectionLabel>Curve crossings</SectionLabel>
          <div className="text-xs text-slate-400 space-y-1">
            {system.intersections.map((x, i) => (
              <div key={i}>
                {valueWithUnit(rateKind, x.q, unitSystem, fmt.int)} at {valueWithUnit('pressure', x.pwf, unitSystem, fmt.int)}
                {' '}({x.stable ? 'stable' : 'unstable heading branch'})
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemResults;
