// Well Cost & Time chart pack: the drilling time-depth curve, the
// cumulative cost accrual, the Monte Carlo histogram / S-curve and the
// Spearman tornado. White chartTheme + ChartLogo standard.

import React from 'react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';
import { CHART_COLORS, CHART_MARGINS, TOOLTIP_STYLE, GRID_STYLE } from '@/utils/chartTheme';
import ChartLogo from '@/components/charts/ChartLogo';

const axisProps = {
  stroke: CHART_COLORS.axisLine,
  tick: { fill: CHART_COLORS.axisText, fontSize: 10 },
};
const label = (value, position = 'insideBottom') => ({
  value, position, offset: -2, fill: CHART_COLORS.axisLabel, fontSize: 10,
});

function Frame({ title, testId, children }) {
  return (
    <div className="bg-white relative flex h-full w-full min-h-0 min-w-0 flex-col rounded-md overflow-hidden" data-testid={testId}>
      <div className="px-3 pt-2 text-[11px] font-semibold text-slate-700">{title}</div>
      <div className="min-h-0 flex-1">{children}</div>
      <ChartLogo style={{ height: 36 }} />
    </div>
  );
}

export function TimeDepthChart({ curve, depthUnit = 'm' }) {
  if (!curve?.length) return null;
  const toFt = depthUnit === 'ft' ? 3.280839895 : 1;
  const data = curve.map((p) => ({ days: p.tHr / 24, md: p.mdM * toFt }));
  return (
    <Frame title={`Time-depth curve (days vs MD ${depthUnit})`} testId="wct-timedepth-chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ ...CHART_MARGINS.compact, left: 10 }}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis dataKey="days" type="number" domain={[0, 'auto']} {...axisProps}
            tickFormatter={(v) => v.toFixed(0)} label={label('days')} />
          <YAxis dataKey="md" type="number" reversed domain={[0, 'auto']} width={52} {...axisProps}
            tickFormatter={(v) => v.toFixed(0)} label={{ value: `MD (${depthUnit})`, angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
          <Tooltip contentStyle={TOOLTIP_STYLE}
            formatter={(v) => `${v.toFixed(0)} ${depthUnit}`}
            labelFormatter={(v) => `day ${Number(v).toFixed(1)}`} />
          <Line dataKey="md" name="Depth" stroke="#0369a1" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </Frame>
  );
}

export function CostTimeChart({ points }) {
  if (!points?.length) return null;
  const data = points.map((p) => ({ days: p.tHr / 24, musd: p.usd / 1e6 }));
  return (
    <Frame title="Cumulative base cost vs time (contingency excluded)" testId="wct-costtime-chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ ...CHART_MARGINS.compact, left: 10 }}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis dataKey="days" type="number" domain={[0, 'auto']} {...axisProps}
            tickFormatter={(v) => v.toFixed(0)} label={label('days')} />
          <YAxis dataKey="musd" type="number" domain={[0, 'auto']} width={52} {...axisProps}
            tickFormatter={(v) => v.toFixed(1)} label={{ value: 'MM USD', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
          <Tooltip contentStyle={TOOLTIP_STYLE}
            formatter={(v) => `${v.toFixed(2)} MM USD`}
            labelFormatter={(v) => `day ${Number(v).toFixed(1)}`} />
          <Line dataKey="musd" name="Cumulative" stroke="#b45309" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </Frame>
  );
}

export function CostHistogramChart({ mc }) {
  if (!mc?.cost?.histogram?.length) return null;
  const data = mc.cost.histogram.map((b) => ({ mid: (b.x0 + b.x1) / 2e6, count: b.count }));
  return (
    <Frame title="Total base cost distribution (MM USD)" testId="wct-histogram-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ ...CHART_MARGINS.compact, left: 10 }}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis dataKey="mid" type="number" domain={['auto', 'auto']} {...axisProps}
            tickFormatter={(v) => v.toFixed(1)} label={label('MM USD')} />
          <YAxis width={40} {...axisProps} />
          <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(v) => `${Number(v).toFixed(2)} MM USD`} />
          <ReferenceLine x={mc.cost.p50 / 1e6} stroke="#b45309" strokeDasharray="4 3"
            label={{ value: 'P50', fontSize: 9, fill: '#b45309' }} />
          <Bar dataKey="count" name="Realizations" fill="#0369a1" isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </Frame>
  );
}

export function SCurveChart({ mc }) {
  if (!mc?.cost?.cdf?.length) return null;
  const data = mc.cost.cdf.map((p) => ({ musd: p.x / 1e6, pct: p.y }));
  return (
    <Frame title="Cost S-curve (cumulative probability)" testId="wct-scurve-chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ ...CHART_MARGINS.compact, left: 10 }}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis dataKey="musd" type="number" domain={['auto', 'auto']} {...axisProps}
            tickFormatter={(v) => v.toFixed(1)} label={label('MM USD')} />
          <YAxis domain={[0, 100]} width={40} {...axisProps}
            label={{ value: '% <=', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
          <Tooltip contentStyle={TOOLTIP_STYLE}
            formatter={(v) => `${v.toFixed(0)} %`} labelFormatter={(v) => `${Number(v).toFixed(2)} MM USD`} />
          <Line dataKey="pct" name="P(cost <= x)" stroke="#0369a1" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </Frame>
  );
}

export function TornadoChart({ mc, labelOf }) {
  if (!mc?.tornado?.length) return null;
  const data = mc.tornado.map((t) => ({
    name: labelOf ? labelOf(t.parameter) : t.parameter,
    rho: t.rho,
    contribution: t.contribution,
  }));
  return (
    <Frame title="Cost drivers (Spearman rank correlation)" testId="wct-tornado-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ ...CHART_MARGINS.compact, left: 60 }}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis type="number" domain={[-1, 1]} {...axisProps} label={label('rho')} />
          <YAxis type="category" dataKey="name" width={170} {...axisProps} />
          <Tooltip contentStyle={TOOLTIP_STYLE}
            formatter={(v, n, p) => [`rho ${v.toFixed(2)} (${p.payload.contribution.toFixed(0)}% of rank variance)`, p.payload.name]} />
          <ReferenceLine x={0} stroke={CHART_COLORS.axisLine} />
          <Bar dataKey="rho" name="Spearman rho" isAnimationActive={false}>
            {data.map((row) => (
              <Cell key={row.name} fill={row.rho >= 0 ? '#b45309' : '#0369a1'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Frame>
  );
}
