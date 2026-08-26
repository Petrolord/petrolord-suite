// Casing & Tubing chart pack: engine load-case pressure profiles and the
// Lubinski force breakdown. White chartTheme + ChartLogo standard.

import React from 'react';
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine, Cell,
} from 'recharts';
import { CHART_COLORS, CHART_MARGINS, TOOLTIP_STYLE, GRID_STYLE } from '@/utils/chartTheme';
import ChartLogo from '@/components/charts/ChartLogo';
import { depthDisp, depthLabel, nToKN } from '../../services/ctRun';

const axisProps = {
  stroke: CHART_COLORS.axisLine,
  tick: { fill: CHART_COLORS.axisText, fontSize: 10 },
};

function Frame({ title, testId, children }) {
  return (
    <div className="bg-white relative flex h-full w-full min-h-0 min-w-0 flex-col rounded-md overflow-hidden" data-testid={testId}>
      <div className="px-3 pt-2 text-[11px] font-semibold text-slate-700">{title}</div>
      <div className="min-h-0 flex-1">{children}</div>
      <ChartLogo style={{ height: 36 }} />
    </div>
  );
}

// Internal/external pressure vs TVD for one casing load case (the actual
// engine profile that the SFs were scanned over).
export function LoadProfileChart({ caseResult, depthUnit = 'm' }) {
  if (!caseResult?.profile) return null;
  const { tvdM, piPa, poPa } = caseResult.profile;
  const data = tvdM.map((z, i) => ({
    tvd: depthDisp(z, depthUnit),
    pi: piPa[i] / 1e6,
    po: poPa[i] / 1e6,
    dp: (piPa[i] - poPa[i]) / 1e6,
  }));
  return (
    <Frame title={`Load profile — ${caseResult.name} (MPa vs TVD)`} testId="ct-load-profile-chart">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={CHART_MARGINS.compact} layout="vertical">
          <CartesianGrid {...GRID_STYLE} />
          <XAxis type="number" {...axisProps}
            label={{ value: 'MPa', position: 'insideBottom', offset: -2, fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
          <YAxis dataKey="tvd" type="number" reversed domain={['dataMin', 'dataMax']} {...axisProps}
            tickFormatter={(v) => v.toFixed(0)}
            label={{ value: `TVD (${depthLabel(depthUnit)})`, angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
          <Tooltip contentStyle={TOOLTIP_STYLE}
            formatter={(v) => (Number.isFinite(v) ? v.toFixed(2) : '--')}
            labelFormatter={(v) => `TVD ${Number(v).toFixed(0)} ${depthLabel(depthUnit)}`} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <ReferenceLine x={0} stroke={CHART_COLORS.axisLine} />
          <Line dataKey="pi" name="Internal" stroke="#b91c1c" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line dataKey="po" name="External" stroke="#1d4ed8" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line dataKey="dp" name="Differential" stroke="#7c3aed" strokeWidth={1.5} strokeDasharray="5 3" dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </Frame>
  );
}

// Force breakdown per tubing operating case (piston/ballooning/thermal +
// total), kN, positive = added tension at the packer.
export function TubingForcesChart({ cases }) {
  if (!cases || !cases.length) return null;
  const data = cases.map((c) => ({
    name: c.name,
    piston: nToKN(c.loads.forces.pistonN),
    ballooning: nToKN(c.loads.forces.ballooningN),
    thermal: nToKN(c.loads.forces.thermalN),
    total: nToKN(c.loads.forces.totalN),
  }));
  return (
    <Frame title="Tubing-to-packer forces (kN)" testId="ct-forces-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={CHART_MARGINS.compact}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis dataKey="name" {...axisProps} interval={0} tick={{ fill: CHART_COLORS.axisText, fontSize: 9 }} />
          <YAxis {...axisProps}
            label={{ value: 'kN', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => `${Number(v).toFixed(1)} kN`} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <ReferenceLine y={0} stroke={CHART_COLORS.axisLine} />
          <Bar dataKey="piston" name="Piston" fill="#1d4ed8" isAnimationActive={false} />
          <Bar dataKey="ballooning" name="Ballooning" fill="#0f766e" isAnimationActive={false} />
          <Bar dataKey="thermal" name="Thermal" fill="#b45309" isAnimationActive={false} />
          <Bar dataKey="total" name="Total" isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.total < 0 ? '#b91c1c' : '#334155'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Frame>
  );
}
