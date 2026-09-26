// Area-depth and GRV-versus-contact curve of one closure (Mapping T1
// enhancement E1, 2026-09-26): from the crest down to the spill, how the
// closed area and the gross rock volume grow as the contact deepens, with
// the typed contact and the spill marked. The white Petrolord chart
// template (chartTheme + ChartLogo), as every Suite chart.

import React from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Legend,
} from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, PINNED_TOOLTIP_PROPS, LEGEND_PROPS,
} from '@/utils/chartTheme';

const AXIS = { fontSize: CHART_TYPOGRAPHY.axisFontSize, fill: CHART_COLORS.axisText };

/**
 * @param {{curve:Array<{contact:number, areaM2:number, grvM3:number}>, contactM:number,
 *   spillZ:number, toDisplay:(m:number)=>number, unit:string}} p
 */
export default function ClosureCurveChart({ curve, contactM, spillZ, toDisplay, unit }) {
  if (!curve?.length) return null;
  const data = curve.map((p) => ({
    contact: Number(toDisplay(p.contact).toFixed(1)),
    grv: p.grvM3 / 1e6,
    area: p.areaM2 / 1e6,
  }));
  return (
    <div className="relative h-64 bg-white rounded border border-slate-200" data-testid="map-grv-curve">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 22, right: 4, left: 2, bottom: 4 }}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis dataKey="contact" type="number" domain={['dataMin', 'dataMax']} reversed tick={AXIS} tickCount={4}
            tickFormatter={(v) => Math.round(v)}
            label={{ value: `Contact (${unit})`, position: 'insideBottom', offset: -2, style: AXIS }} height={34} />
          <YAxis yAxisId="grv" tick={AXIS} width={36} tickCount={5} tickFormatter={(v) => v.toFixed(v < 10 ? 1 : 0)}
            label={{ value: 'GRV, million m³', position: 'top', offset: 10, dx: 30, style: { ...AXIS, fill: '#2563eb' } }} />
          <YAxis yAxisId="area" orientation="right" tick={AXIS} width={30} tickCount={5} tickFormatter={(v) => v.toFixed(1)}
            label={{ value: 'km²', position: 'top', offset: 10, style: { ...AXIS, fill: '#059669' } }} />
          <Tooltip {...PINNED_TOOLTIP_PROPS}
            labelFormatter={(v) => `Contact ${v} ${unit}`}
            formatter={(v, name) => (name === 'GRV' ? [`${v.toFixed(2)} million m³`, name] : [`${v.toFixed(2)} km²`, name])} />
          <Legend {...LEGEND_PROPS} height={22} />
          <Line yAxisId="grv" dataKey="grv" name="GRV" stroke="#2563eb" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line yAxisId="area" dataKey="area" name="Area" stroke="#059669" strokeWidth={2} strokeDasharray="5 3" dot={false} isAnimationActive={false} />
          {Number.isFinite(contactM) && (
            <ReferenceLine yAxisId="grv" x={Number(toDisplay(contactM).toFixed(1))} stroke="#d97706" strokeDasharray="4 3"
              label={{ value: 'contact', position: 'insideTopLeft', style: { ...AXIS, fill: '#b45309' } }} />
          )}
          <ReferenceLine yAxisId="grv" x={Number(toDisplay(spillZ).toFixed(1))} stroke="#dc2626"
            label={{ value: 'spill', position: 'insideBottomLeft', style: { ...AXIS, fill: '#b91c1c' } }} />
        </ComposedChart>
      </ResponsiveContainer>
      <ChartLogo style={{ height: '20px', top: 4, bottom: 'auto', right: 44 }} />
    </div>
  );
}
