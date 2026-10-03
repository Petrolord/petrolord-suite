// Value of a discovery against its size (Risked Reserves Valuation U2-002):
// the engine NPV by size under the economic model (when there is one) and
// the straight value line the valuation reads, with the MEFS marked. The
// points are the ones the PDF report plots (rrvReportModel economicsModel).
// The white Petrolord chart template.

import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, PINNED_TOOLTIP_PROPS } from '@/utils/chartTheme';

const AXIS = { fontSize: CHART_TYPOGRAPHY.axisFontSize, fill: CHART_COLORS.axisText };
const LINE = '#2563eb';
const ENGINE = '#475569';

/**
 * @param {{curve: ?Array<[number, number]>, line: Array<[number, number]>, mefs: number,
 *   marks?: {p90?: number, p50?: number, p10?: number}, volumeLabel: string}} props
 *   sizes already in the display unit; values in $MM
 */
export default function ValueSizeChart({ curve, line, mefs, marks, volumeLabel = 'MMboe' }) {
  if (!line?.length) return null;
  const data = line.map(([x, y], i) => ({ size: x, line: y, engine: curve?.[i]?.[1] }));
  const xMax = data[data.length - 1].size;
  return (
    <div className="relative h-72 bg-white rounded border border-slate-200 flex flex-col" data-canvas="chart" data-testid="rrv-value-size-chart"
      data-points={data.length} data-series={curve ? 'engine,line' : 'line'}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 pt-2 pr-24 text-[11px] text-slate-600" data-testid="rrv-value-size-legend">
        {curve && <span className="inline-flex items-center gap-1.5"><svg width="22" height="6" aria-hidden><line x1="0" y1="3" x2="22" y2="3" stroke={ENGINE} strokeWidth="2" strokeDasharray="5 3" /></svg>Engine NPV by size (economic model)</span>}
        <span className="inline-flex items-center gap-1.5"><svg width="22" height="6" aria-hidden><line x1="0" y1="3" x2="22" y2="3" stroke={LINE} strokeWidth="2.5" /></svg>Value line read by the valuation</span>
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 14, right: 20, left: 14, bottom: 8 }}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis dataKey="size" type="number" domain={[0, xMax]} tick={AXIS} tickCount={7}
              tickFormatter={(v) => (v >= 10 ? Math.round(v).toLocaleString('en-US') : String(Number(v.toPrecision(2))))}
              label={{ value: `Size of the discovery, ${volumeLabel}`, position: 'insideBottom', offset: -4, style: AXIS }} height={36} />
            <YAxis tick={AXIS} width={52} tickFormatter={(v) => Math.round(v).toLocaleString('en-US')}
              label={{ value: 'Value of the discovery, $MM', angle: -90, position: 'insideLeft', offset: -4, style: { ...AXIS, textAnchor: 'middle' } }} />
            <Tooltip {...PINNED_TOOLTIP_PROPS} labelFormatter={(v) => `${Number(v).toFixed(1)} ${volumeLabel}`}
              formatter={(v, name) => [`${Number(v).toFixed(1)} $MM`, name === 'line' ? 'value line' : 'engine NPV']} />
            <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 3" />
            {curve && <Line dataKey="engine" stroke={ENGINE} strokeWidth={1.5} strokeDasharray="5 3" dot={false} isAnimationActive={false} />}
            <Line dataKey="line" stroke={LINE} strokeWidth={2.5} dot={false} isAnimationActive={false} />
            {Number.isFinite(mefs) && mefs > 0 && mefs <= xMax && <ReferenceLine x={mefs} stroke="#dc2626" label={{ value: 'MEFS', position: 'insideTopRight', style: { ...AXIS, fill: '#b91c1c' } }} />}
            {marks && ['p90', 'p50', 'p10'].map((k) => (Number.isFinite(marks[k]) && marks[k] <= xMax ? (
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
