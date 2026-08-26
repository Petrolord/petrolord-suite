// Geomechanics chart pack: stress profile track (Sv/SHmax/Shmin/PP + UCS)
// and the trajectory mud window. White chartTheme + ChartLogo standard.

import React from 'react';
import {
  ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { CHART_COLORS, CHART_MARGINS, TOOLTIP_STYLE, GRID_STYLE } from '@/utils/chartTheme';
import ChartLogo from '@/components/charts/ChartLogo';
import { emwOut, emwLabel, depthOut, depthLabel } from '../services/gmRun';

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

export function StressProfileChart({ profile, depthUnit }) {
  if (!profile) return null;
  const data = profile.tvdM.map((z, i) => ({
    tvd: depthOut(z, depthUnit),
    sv: profile.svPa[i] / 1e6,
    shmax: profile.shmaxPa[i] / 1e6,
    shmin: profile.shminPa[i] / 1e6,
    pp: profile.ppPa[i] / 1e6,
  }));
  return (
    <Frame title="Stress profile (MPa vs TVD)" testId="gm-stress-chart">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={CHART_MARGINS.compact} layout="vertical">
          <CartesianGrid {...GRID_STYLE} />
          <XAxis type="number" domain={[0, 'auto']} {...axisProps}
            label={{ value: 'MPa', position: 'insideBottom', offset: -2, fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
          <YAxis dataKey="tvd" type="number" reversed domain={['dataMin', 'dataMax']} {...axisProps}
            tickFormatter={(v) => v.toFixed(0)}
            label={{ value: `TVD (${depthLabel(depthUnit)})`, angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
          <Tooltip contentStyle={TOOLTIP_STYLE}
            formatter={(v) => (Number.isFinite(v) ? v.toFixed(1) : '--')}
            labelFormatter={(v) => `TVD ${Number(v).toFixed(0)} ${depthLabel(depthUnit)}`} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Line dataKey="pp" name="Pore pressure" stroke="#b91c1c" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line dataKey="shmin" name="Shmin" stroke="#0f766e" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line dataKey="shmax" name="SHmax" stroke="#7c3aed" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line dataKey="sv" name="Sv (overburden)" stroke="#57534e" strokeWidth={2}
            strokeDasharray="5 3" dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </Frame>
  );
}

export function UcsChart({ profile, depthUnit }) {
  if (!profile) return null;
  const data = profile.tvdM.map((z, i) => ({
    tvd: depthOut(z, depthUnit),
    ucs: profile.ucsPa[i] != null ? profile.ucsPa[i] / 1e6 : null,
  }));
  return (
    <Frame title="UCS (MPa vs TVD)" testId="gm-ucs-chart">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={CHART_MARGINS.compact} layout="vertical">
          <CartesianGrid {...GRID_STYLE} />
          <XAxis type="number" domain={[0, 'auto']} {...axisProps}
            label={{ value: 'MPa', position: 'insideBottom', offset: -2, fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
          <YAxis dataKey="tvd" type="number" reversed domain={['dataMin', 'dataMax']} {...axisProps}
            tickFormatter={(v) => v.toFixed(0)} />
          <Tooltip contentStyle={TOOLTIP_STYLE}
            formatter={(v) => (Number.isFinite(v) ? v.toFixed(1) : '--')}
            labelFormatter={(v) => `TVD ${Number(v).toFixed(0)} ${depthLabel(depthUnit)}`} />
          <Line dataKey="ucs" name="UCS" stroke="#d97706" strokeWidth={2} dot={false}
            isAnimationActive={false} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </Frame>
  );
}

export function MudWindowChart({ window: win, depthUnit }) {
  if (!win) return null;
  const data = win.rows.map((r) => ({
    md: depthOut(r.md, depthUnit),
    pp: emwOut(r.ppEmwKgM3 * 1, depthUnit),
    collapse: emwOut(r.collapseEmwKgM3, depthUnit),
    frac: emwOut(r.fracInitEmwKgM3, depthUnit),
    window: [
      emwOut(Math.max(r.ppEmwKgM3, r.collapseEmwKgM3), depthUnit),
      emwOut(r.fracInitEmwKgM3, depthUnit),
    ],
  }));
  return (
    <Frame title={`Mud weight window along the well (${emwLabel(depthUnit)} vs MD)`} testId="gm-window-chart">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={CHART_MARGINS.compact} layout="vertical">
          <CartesianGrid {...GRID_STYLE} />
          <XAxis type="number" domain={['auto', 'auto']} {...axisProps}
            tickFormatter={(v) => v.toFixed(2)}
            label={{ value: emwLabel(depthUnit), position: 'insideBottom', offset: -2, fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
          <YAxis dataKey="md" type="number" reversed domain={['dataMin', 'dataMax']} {...axisProps}
            tickFormatter={(v) => v.toFixed(0)}
            label={{ value: `MD (${depthLabel(depthUnit)})`, angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
          <Tooltip contentStyle={TOOLTIP_STYLE}
            formatter={(v) => (Array.isArray(v)
              ? v.map((x) => x?.toFixed(2)).join(' – ')
              : (Number.isFinite(v) ? v.toFixed(3) : '--'))}
            labelFormatter={(v) => `MD ${Number(v).toFixed(0)} ${depthLabel(depthUnit)}`} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Area dataKey="window" name="Safe window" fill="#86efac" fillOpacity={0.35}
            stroke="none" isAnimationActive={false} connectNulls />
          <Line dataKey="pp" name="Pore pressure" stroke="#b91c1c" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line dataKey="collapse" name="Collapse (breakout)" stroke="#d97706" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line dataKey="frac" name="Fracture initiation" stroke="#1d4ed8" strokeWidth={2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </Frame>
  );
}
