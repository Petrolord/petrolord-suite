// Spider plot (ReservoirCalc Pro upgrade U2-017): the in-place volume as
// each uncertain input moves through its own 10th to 90th percentile with
// the others at their medians, from the run's own engine (stats.spider).
// White chart template with the logo (ChartFrame).
import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine } from 'recharts';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';

const AXIS_TICK = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };
// a validated categorical set on white (the tornado's blue and emerald first)
const LINE_COLORS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#dc2626', '#0891b2', '#4b5563', '#be185d', '#65a30d', '#9333ea'];
const LABEL = { porosity: 'Porosity', sw: 'Sw', ntg: 'NTG', area: 'Area', thickness: 'Thickness', fvf: 'Bo', bg: 'Bg', owc: 'OWC', goc: 'GOC', grvFactor: 'GRV factor', gasCapFraction: 'Gas-cap fraction', recovery: 'Oil RF', recoveryGas: 'Gas RF' };

export default function SpiderChart({ spider, denom = 1e6, unit = '' }) {
  if (!spider?.lines?.length || !Number.isFinite(spider.base)) return null;
  const data = [0.1, 0.25, 0.5, 0.75, 0.9].map((p, i) => {
    const row = { pct: Math.round(p * 100) };
    for (const l of spider.lines) row[l.key] = +(l.points[i].volume / denom).toFixed(4);
    return row;
  });
  return (
    <div data-testid="rcp-spider">
      <ChartFrame height={260} exportFilename="rcp-spider">
        <LineChart data={data} margin={{ top: 10, right: 20, bottom: 22, left: 8 }}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis dataKey="pct" type="number" domain={[10, 90]} ticks={[10, 25, 50, 75, 90]} tick={AXIS_TICK} stroke={CHART_COLORS.axisLine}
            label={{ value: "Input at its own percentile (10th = low input), others at their medians", position: 'insideBottom', offset: -12, style: AXIS_TICK }} />
          <YAxis tick={AXIS_TICK} stroke={CHART_COLORS.axisLine} width={56}
            label={{ value: unit, angle: -90, position: 'insideLeft', style: AXIS_TICK }} />
          <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(p) => `${p}th percentile of the input`}
            formatter={(v, k) => [`${Number(v).toFixed(2)} ${unit}`, LABEL[k] || k]} />
          <Legend formatter={(k) => LABEL[k] || k} wrapperStyle={{ fontSize: 10 }} />
          <ReferenceLine y={+(spider.base / denom).toFixed(4)} stroke="#94a3b8" strokeDasharray="3 3" />
          {spider.lines.map((l, i) => (
            <Line key={l.key} dataKey={l.key} stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
          ))}
        </LineChart>
      </ChartFrame>
    </div>
  );
}
