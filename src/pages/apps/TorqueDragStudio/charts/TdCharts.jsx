// T&D chart pack: broomstick (loads vs MD, MD inverted on Y — industry
// convention), surface torque, side force + buckling bands, casing wear.
// Suite chart standard: white surface, chartTheme tokens, ChartLogo.

import React from 'react';
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import { CHART_COLORS, CHART_MARGINS, TOOLTIP_STYLE, GRID_STYLE } from '@/utils/chartTheme';
import ChartLogo from '@/components/charts/ChartLogo';
import { forceOut, torqueOut, depthOut, forceLabel, torqueLabel, depthLabel } from '../services/tdRun';

const axisProps = {
  stroke: CHART_COLORS.axisLine,
  tick: { fill: CHART_COLORS.axisText, fontSize: 10 },
};

const OP_LABELS = {
  trip_out: 'Pick up (trip out)',
  trip_in: 'Slack off (trip in)',
  rotate_off_bottom: 'Rotate off bottom',
  rotate_on_bottom: 'Rotate on bottom',
  slide_drill: 'Slide drill',
  backream: 'Backream',
};
const OP_COLORS = {
  trip_out: '#b91c1c',
  trip_in: '#1d4ed8',
  rotate_off_bottom: '#0f766e',
  rotate_on_bottom: '#7c3aed',
  slide_drill: '#d97706',
  backream: '#334155',
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

// Merge per-op profiles into one MD-keyed table in display units.
function mergeProfiles(results, depthUnit, pick) {
  const byMd = new Map();
  for (const [op, res] of Object.entries(results || {})) {
    for (const row of res.profile) {
      const md = depthOut(row.md, depthUnit);
      const key = Math.round(md * 100) / 100;
      if (!byMd.has(key)) byMd.set(key, { md: key });
      byMd.get(key)[op] = pick(row, depthUnit);
    }
  }
  return Array.from(byMd.values()).sort((a, b) => a.md - b.md);
}

export function BroomstickChart({ results, depthUnit }) {
  const data = mergeProfiles(results, depthUnit, (row, du) => forceOut(row.tensionN, du));
  const ops = Object.keys(results || {});
  return (
    <Frame title={`Axial load vs MD (${forceLabel(depthUnit)})`} testId="td-broomstick">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={CHART_MARGINS.compact} layout="vertical">
          <CartesianGrid {...GRID_STYLE} />
          <XAxis type="number" domain={['auto', 'auto']} {...axisProps}
            label={{ value: forceLabel(depthUnit), position: 'insideBottom', offset: -2, fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
          <YAxis dataKey="md" type="number" reversed domain={['dataMin', 'dataMax']} {...axisProps}
            tickFormatter={(v) => v.toFixed(0)}
            label={{ value: `MD (${depthLabel(depthUnit)})`, angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
          <Tooltip contentStyle={TOOLTIP_STYLE}
            formatter={(v, name) => [Number.isFinite(v) ? v.toFixed(1) : '--', OP_LABELS[name] || name]}
            labelFormatter={(v) => `MD ${Number(v).toFixed(0)} ${depthLabel(depthUnit)}`} />
          <Legend wrapperStyle={{ fontSize: 10 }} formatter={(v) => OP_LABELS[v] || v} />
          <ReferenceLine x={0} stroke="#94a3b8" strokeDasharray="4 3" />
          {ops.map((op) => (
            <Line key={op} dataKey={op} name={op} stroke={OP_COLORS[op] || '#64748b'}
              strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </Frame>
  );
}

export function TorqueChart({ results, depthUnit }) {
  const rotating = Object.fromEntries(Object.entries(results || {})
    .filter(([, r]) => r.summary.surfaceTorqueNm !== 0 || r.operation.includes('rotate') || r.operation === 'backream'));
  const data = mergeProfiles(rotating, depthUnit, (row, du) => torqueOut(row.torqueNm, du));
  const ops = Object.keys(rotating);
  return (
    <Frame title={`Torque vs MD (${torqueLabel(depthUnit)})`} testId="td-torquechart">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={CHART_MARGINS.compact} layout="vertical">
          <CartesianGrid {...GRID_STYLE} />
          <XAxis type="number" domain={['auto', 'auto']} {...axisProps}
            label={{ value: torqueLabel(depthUnit), position: 'insideBottom', offset: -2, fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
          <YAxis dataKey="md" type="number" reversed domain={['dataMin', 'dataMax']} {...axisProps}
            tickFormatter={(v) => v.toFixed(0)}
            label={{ value: `MD (${depthLabel(depthUnit)})`, angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
          <Tooltip contentStyle={TOOLTIP_STYLE}
            formatter={(v, name) => [Number.isFinite(v) ? v.toFixed(2) : '--', OP_LABELS[name] || name]}
            labelFormatter={(v) => `MD ${Number(v).toFixed(0)} ${depthLabel(depthUnit)}`} />
          <Legend wrapperStyle={{ fontSize: 10 }} formatter={(v) => OP_LABELS[v] || v} />
          {ops.map((op) => (
            <Line key={op} dataKey={op} name={op} stroke={OP_COLORS[op] || '#64748b'}
              strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </Frame>
  );
}

export function SideForceChart({ results, depthUnit }) {
  // One representative rotating/slide profile for side force + buckling flags.
  const source = results?.rotate_on_bottom || results?.slide_drill
    || results?.trip_out || Object.values(results || {})[0];
  if (!source) return null;
  const data = source.profile.map((row) => ({
    md: depthOut(row.md, depthUnit),
    side: row.sideForceNPerM / 1e3,
    buckled: row.buckling !== 'none' ? row.sideForceNPerM / 1e3 : null,
  }));
  return (
    <Frame title={`Side force vs MD (kN/m) — ${OP_LABELS[source.operation]}`} testId="td-sideforce">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={CHART_MARGINS.compact} layout="vertical">
          <CartesianGrid {...GRID_STYLE} />
          <XAxis type="number" domain={[0, 'auto']} {...axisProps}
            label={{ value: 'kN/m', position: 'insideBottom', offset: -2, fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
          <YAxis dataKey="md" type="number" reversed domain={['dataMin', 'dataMax']} {...axisProps}
            tickFormatter={(v) => v.toFixed(0)}
            label={{ value: `MD (${depthLabel(depthUnit)})`, angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
          <Tooltip contentStyle={TOOLTIP_STYLE}
            formatter={(v, name) => [Number.isFinite(v) ? v.toFixed(3) : '--', name === 'buckled' ? 'Buckled interval' : 'Side force']}
            labelFormatter={(v) => `MD ${Number(v).toFixed(0)} ${depthLabel(depthUnit)}`} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Line dataKey="side" name="Side force" stroke="#0f766e" strokeWidth={2}
            dot={false} isAnimationActive={false} connectNulls />
          <Line dataKey="buckled" name="Buckled interval" stroke="#dc2626" strokeWidth={4}
            dot={false} isAnimationActive={false} connectNulls={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </Frame>
  );
}

export function WearChart({ wear, depthUnit }) {
  if (!wear) return null;
  const data = wear.rows.map((r) => ({
    md: depthOut((r.fromMd + r.toMd) / 2, depthUnit),
    lossPct: r.wallLossPct,
    depthMm: r.wearDepthM * 1000,
  }));
  return (
    <Frame title="Casing wall loss vs MD (%)" testId="td-wearchart">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={CHART_MARGINS.compact} layout="vertical">
          <CartesianGrid {...GRID_STYLE} />
          <XAxis type="number" domain={[0, 'auto']} {...axisProps}
            label={{ value: 'wall loss %', position: 'insideBottom', offset: -2, fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
          <YAxis dataKey="md" type="number" reversed domain={['dataMin', 'dataMax']} {...axisProps}
            tickFormatter={(v) => v.toFixed(0)}
            label={{ value: `MD (${depthLabel(depthUnit)})`, angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
          <Tooltip contentStyle={TOOLTIP_STYLE}
            formatter={(v, name) => [Number.isFinite(v) ? v.toFixed(2) : '--', name === 'lossPct' ? 'Wall loss %' : 'Wear depth mm']}
            labelFormatter={(v) => `MD ${Number(v).toFixed(0)} ${depthLabel(depthUnit)}`} />
          <Line dataKey="lossPct" name="Wall loss %" stroke="#b91c1c" strokeWidth={2}
            dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </Frame>
  );
}
