// Risked expectation curve (Risked Reserves Valuation T1): the chance of
// finding at least a given volume, P(V >= x) = Pg x P(success volume >= x),
// on a log volume axis, with the MEFS and the success-case P90 / P50 / P10
// marked. The white Petrolord chart template.

import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, PINNED_TOOLTIP_PROPS } from '@/utils/chartTheme';

// 1-2-5 ticks per decade inside [lo, hi]
export function logTicks(lo, hi) {
  const out = [];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
    for (const m of [1, 2, 5]) { const t = m * 10 ** e; if (t >= lo && t <= hi) out.push(t); }
  }
  return out;
}

const AXIS = { fontSize: CHART_TYPOGRAPHY.axisFontSize, fill: CHART_COLORS.axisText };

export default function ExpectationChart({ curve, mefs, pg, successCase }) {
  if (!curve?.length) return null;
  const data = curve.map((p) => ({ volume: p.volume, chance: p.exceedance * 100 }));
  const ticks = logTicks(data[0].volume, data[data.length - 1].volume);
  return (
    <div className="relative h-72 bg-white rounded border border-slate-200" data-testid="rrv-expectation-chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 16, right: 20, left: 4, bottom: 8 }}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis dataKey="volume" type="number" scale="log" domain={['dataMin', 'dataMax']} ticks={ticks} tick={AXIS}
            tickFormatter={(v) => (v >= 1 ? Math.round(v).toLocaleString() : String(Number(v.toPrecision(1))))}
            label={{ value: 'Volume, MMbbl (log)', position: 'insideBottom', offset: -4, style: AXIS }} height={36} />
          <YAxis tick={AXIS} domain={[0, Math.ceil(pg * 100 / 10) * 10 || 10]} width={42}
            label={{ value: 'Chance of at least this volume, %', angle: -90, position: 'insideLeft', style: AXIS, dx: 12, dy: 90 }} />
          <Tooltip {...PINNED_TOOLTIP_PROPS} labelFormatter={(v) => `${Number(v).toFixed(1)} MMbbl`} formatter={(v) => [`${Number(v).toFixed(1)} %`, 'chance']} />
          <Line dataKey="chance" stroke="#2563eb" strokeWidth={2} dot={false} isAnimationActive={false} />
          {mefs > 0 && <ReferenceLine x={mefs} stroke="#dc2626" label={{ value: 'MEFS', position: 'insideTopRight', style: { ...AXIS, fill: '#b91c1c' } }} />}
          {successCase && ['p90', 'p50', 'p10'].map((k) => (Number.isFinite(successCase[k]) ? (
            <ReferenceLine key={k} x={successCase[k]} stroke="#94a3b8" strokeDasharray="4 3"
              label={{ value: k.toUpperCase(), position: 'insideBottomRight', style: { ...AXIS, fill: '#475569' } }} />
          ) : null))}
        </LineChart>
      </ResponsiveContainer>
      <ChartLogo style={{ height: '22px', top: 6, bottom: 'auto', right: 24 }} />
    </div>
  );
}
