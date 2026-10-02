// Expectation curves (Risked Reserves Valuation T1; unrisked curve and one
// series builder with the report, upgrade U1): the chance of finding at
// least a given volume on a log volume axis. Unrisked is the success case,
// P(V >= x given a discovery); risked is Pg times that. The MEFS and the
// success-case P90 / P50 / P10 are marked. The points are the ones the PDF
// report plots (services/rrvMath volumeCurves). The white Petrolord chart
// template.

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
const RISKED = '#2563eb';
const UNRISKED = '#475569';

/**
 * @param {{success: Array<[number, number]>, risked: Array<[number, number]>, mefs: number,
 *   marks: {p90?: number, p50?: number, p10?: number}, volumeLabel: string, pg: number}} props
 *   every volume already in the display unit; chances in percent
 */
export default function ExpectationChart({ success, risked, mefs, marks, volumeLabel = 'MMboe', pg }) {
  if (!risked?.length) return null;
  const data = risked.map(([x, y], i) => ({ volume: x, risked: y, unrisked: success?.[i]?.[1] }));
  const ticks = logTicks(data[0].volume, data[data.length - 1].volume);
  return (
    <div className="relative h-80 bg-white rounded border border-slate-200 flex flex-col" data-canvas="chart" data-testid="rrv-expectation-chart"
      data-points={data.length} data-series="unrisked,risked">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 pt-2 pr-24 text-[11px] text-slate-600" data-testid="rrv-chart-legend">
        <span className="inline-flex items-center gap-1.5"><svg width="22" height="6" aria-hidden><line x1="0" y1="3" x2="22" y2="3" stroke={UNRISKED} strokeWidth="2" strokeDasharray="5 3" /></svg>Unrisked (success case)</span>
        <span className="inline-flex items-center gap-1.5"><svg width="22" height="6" aria-hidden><line x1="0" y1="3" x2="22" y2="3" stroke={RISKED} strokeWidth="2.5" /></svg>Risked (x Pg {(pg * 100).toFixed(1)}%)</span>
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 14, right: 20, left: 14, bottom: 8 }}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis dataKey="volume" type="number" scale="log" domain={['dataMin', 'dataMax']} ticks={ticks} tick={AXIS}
              tickFormatter={(v) => (v >= 1 ? Math.round(v).toLocaleString('en-US') : String(Number(v.toPrecision(1))))}
              label={{ value: `Volume, ${volumeLabel} (log)`, position: 'insideBottom', offset: -4, style: AXIS }} height={36} />
            <YAxis tick={AXIS} domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} width={40}
              label={{ value: 'Chance of at least this volume, %', angle: -90, position: 'insideLeft', offset: -4, style: { ...AXIS, textAnchor: 'middle' } }} />
            <Tooltip {...PINNED_TOOLTIP_PROPS} labelFormatter={(v) => `${Number(v).toFixed(1)} ${volumeLabel}`}
              formatter={(v, name) => [`${Number(v).toFixed(1)} %`, name === 'risked' ? 'risked' : 'unrisked']} />
            <Line dataKey="unrisked" stroke={UNRISKED} strokeWidth={1.5} strokeDasharray="5 3" dot={false} isAnimationActive={false} />
            <Line dataKey="risked" stroke={RISKED} strokeWidth={2.5} dot={false} isAnimationActive={false} />
            {mefs > 0 && <ReferenceLine x={mefs} stroke="#dc2626" label={{ value: 'MEFS', position: 'insideTopRight', style: { ...AXIS, fill: '#b91c1c' } }} />}
            {marks && ['p90', 'p50', 'p10'].map((k) => (Number.isFinite(marks[k]) ? (
              <ReferenceLine key={k} x={marks[k]} stroke="#94a3b8" strokeDasharray="4 3"
                label={{ value: k.toUpperCase(), position: 'insideBottomRight', style: { ...AXIS, fill: '#475569' } }} />
            ) : null))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ChartLogo style={{ height: '22px', top: 6, bottom: 'auto', right: 16 }} />
    </div>
  );
}
