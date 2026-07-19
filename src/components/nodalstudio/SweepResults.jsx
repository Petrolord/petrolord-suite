// Results views for the sensitivity and gas-lift tabs.
import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceDot } from 'recharts';
import { CHART_COLORS, CHART_TYPOGRAPHY, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useNodalStudio } from '@/contexts/NodalAnalysisStudioContext';
import { ChartCard, Kpi, LINE, fmtU, fmt, SectionLabel } from './primitives';
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

const PARAM_LABELS = {
  whp: 'Wellhead pressure (psia)',
  idIn: 'Tubing ID (in)',
  wctPct: 'Water cut (%)',
  prodGor: 'Producing GOR (scf/STB)',
  pr: 'Reservoir pressure (psia)',
};

export const SensitivityResults = () => {
  const { sensitivity, unitSystem } = useNodalStudio();

  const data = useMemo(() => {
    if (!sensitivity) return [];
    return sensitivity.results.map((r) => ({
      value: r.value,
      q: fromOilfield('oilRate', r.q, unitSystem),
      status: r.status,
    }));
  }, [sensitivity, unitSystem]);

  if (!sensitivity) {
    return (
      <div className="text-sm text-slate-400 rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-6">
        Configure a parameter and values on the left, then run the sweep. Each value solves the full
        nodal system, so the sweep shows how the operating rate responds.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ChartCard title={`Operating rate vs ${PARAM_LABELS[sensitivity.parameter] || sensitivity.parameter}`} height={340}>
        <LineChart data={data} margin={{ top: 10, right: 20, bottom: 24, left: 12 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
          <XAxis
            dataKey="value"
            type="number"
            domain={['auto', 'auto']}
            {...axisProps}
            label={{ value: PARAM_LABELS[sensitivity.parameter] || sensitivity.parameter, position: 'insideBottom', offset: -12, fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
          />
          <YAxis
            type="number"
            domain={[0, 'auto']}
            {...axisProps}
            label={{ value: `Operating rate (${unitLabel('oilRate', unitSystem)})`, angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
          />
          <Tooltip {...tooltipProps} formatter={(v) => fmt.f1(v)} />
          <Legend {...legendProps} />
          <Line dataKey="q" name="Operating rate" stroke={LINE.ipr} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
        </LineChart>
      </ChartCard>

      <SectionLabel>Sweep table</SectionLabel>
      <div className="text-xs text-slate-300 space-y-1">
        {sensitivity.results.map((r) => (
          <div key={r.label} className="flex justify-between border-b border-slate-800 py-1">
            <span className="text-slate-400">{r.label}</span>
            <span>
              {r.status === 'flowing'
                ? `${fmtU('oilRate', r.q, unitSystem, fmt.int)} ${unitLabel('oilRate', unitSystem)} at ${fmtU('pressure', r.pwf, unitSystem, fmt.int)} ${unitLabel('pressure', unitSystem)}`
                : r.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const GasLiftResults = () => {
  const { gasLift, unitSystem } = useNodalStudio();

  const data = useMemo(() => {
    if (!gasLift) return [];
    return gasLift.response.map((p) => ({
      qgi: p.qgi,
      q: fromOilfield('oilRate', p.q, unitSystem),
    }));
  }, [gasLift, unitSystem]);

  if (!gasLift) {
    return (
      <div className="text-sm text-slate-400 rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-6">
        Run the screening to build the gas lift performance curve: each injection rate solves the
        nodal system with the lifted gas-liquid ratio. The curve shows the classic shape of rising
        rate followed by diminishing returns as friction from the injected gas takes over.
      </div>
    );
  }

  const best = gasLift.best;
  const econ = gasLift.econ;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi title="Natural rate" value={fmtU('oilRate', gasLift.baseline.q, unitSystem, fmt.int)} unit={unitLabel('oilRate', unitSystem)} />
        <Kpi title="Best lifted rate" value={fmtU('oilRate', best.q, unitSystem, fmt.int)} unit={unitLabel('oilRate', unitSystem)} accent />
        <Kpi title="Injection at best" value={fmt.int(best.qgi)} unit="Mscf/d" />
        {econ && <Kpi title="Economic point" value={`${fmt.int(econ.qgi)} Mscf/d`} unit={`${fmtU('oilRate', econ.q, unitSystem, fmt.int)} ${unitLabel('oilRate', unitSystem)}`} />}
      </div>

      {gasLift.baseline.status === 'dead' && (
        <div className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 px-4 py-3 text-sm">
          This well is dead without injection: a classic gas lift candidate.
        </div>
      )}

      <ChartCard title="Gas lift performance curve" height={340}>
        <LineChart data={data} margin={{ top: 10, right: 20, bottom: 24, left: 12 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
          <XAxis
            dataKey="qgi"
            type="number"
            domain={[0, 'auto']}
            {...axisProps}
            label={{ value: 'Injection rate (Mscf/d)', position: 'insideBottom', offset: -12, fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
          />
          <YAxis
            type="number"
            domain={[0, 'auto']}
            {...axisProps}
            label={{ value: `Operating rate (${unitLabel('oilRate', unitSystem)})`, angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
          />
          <Tooltip {...tooltipProps} formatter={(v) => fmt.f1(v)} labelFormatter={(v) => `${fmt.int(v)} Mscf/d`} />
          <Legend {...legendProps} />
          <Line dataKey="q" name="Lifted operating rate" stroke={LINE.gasLift} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
          <ReferenceDot
            x={best.qgi}
            y={fromOilfield('oilRate', best.q, unitSystem)}
            r={6}
            fill={LINE.operating}
            stroke="none"
            label={{ value: 'Best', position: 'top', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
          />
        </LineChart>
      </ChartCard>
    </div>
  );
};
