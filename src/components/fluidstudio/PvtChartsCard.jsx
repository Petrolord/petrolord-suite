import React, { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ChartFrame from '@/components/charts/ChartFrame';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE,
} from '@/utils/chartTheme';

// Line colors tuned to read on the white Petrolord chart surface.
const LINE = { bo: '#059669', rs: '#2563eb', muo: '#7c3aed', z: '#0891b2', pb: '#dc2626' };

const PvtChart = ({ title, data, dataKey, color, yLabel, yDomain, pb, tickFmt }) => (
  <Card className="bg-slate-900 border-slate-800">
    <CardHeader className="pb-2"><CardTitle className="text-base text-white">{title}</CardTitle></CardHeader>
    <CardContent className="p-0">
      <ChartFrame height={264}>
        <LineChart data={data} margin={{ top: 8, right: 20, bottom: 4, left: -4 }}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis
            dataKey="pressure"
            type="number"
            domain={['dataMin', 'dataMax']}
            stroke={CHART_COLORS.axisLine}
            tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
            tickFormatter={(v) => Math.round(v).toLocaleString()}
            label={{ value: 'Pressure (psia)', fill: CHART_COLORS.axisLabel, fontSize: 11, position: 'insideBottom', dy: 12 }}
          />
          <YAxis
            stroke={CHART_COLORS.axisLine}
            tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
            domain={yDomain}
            tickFormatter={tickFmt}
            width={56}
            label={{ value: yLabel, angle: -90, fill: CHART_COLORS.axisLabel, fontSize: 11, position: 'insideLeft', dy: 24 }}
          />
          <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: CHART_COLORS.tooltipText }} itemStyle={{ color: CHART_COLORS.tooltipText }} labelFormatter={(v) => `${Math.round(v).toLocaleString()} psia`} />
          <Legend wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText }} />
          {pb != null && (
            <ReferenceLine x={Number(pb.toFixed(0))} stroke={LINE.pb} strokeDasharray="4 4" label={{ value: 'Pb', fill: LINE.pb, fontSize: 11, position: 'top' }} />
          )}
          <Line type="monotone" dataKey={dataKey} name={title} stroke={color} strokeWidth={2} dot={false} connectNulls />
        </LineChart>
      </ChartFrame>
    </CardContent>
  </Card>
);

/**
 * The four black-oil PVT charts (Bo, Rs, μo, Z vs pressure) on the shared white
 * ChartFrame surface, each anchored with a bubble-point reference line.
 */
const PvtChartsCard = ({ table, pb }) => {
  // Charts read cleanly left→right with ascending pressure.
  const data = useMemo(() => [...(table || [])].sort((a, b) => a.pressure - b.pressure), [table]);

  if (!data.length) return null;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <PvtChart title="Oil FVF (Bo)" data={data} dataKey="Bo" color={LINE.bo} yLabel="Bo (rb/STB)" yDomain={[1, 'auto']} pb={pb} tickFmt={(v) => v.toFixed(2)} />
      <PvtChart title="Solution GOR (Rs)" data={data} dataKey="Rs" color={LINE.rs} yLabel="Rs (scf/STB)" yDomain={[0, 'auto']} pb={pb} tickFmt={(v) => Math.round(v)} />
      <PvtChart title="Oil viscosity (μo)" data={data} dataKey="mu_o" color={LINE.muo} yLabel="μo (cp)" yDomain={[0, 'auto']} pb={pb} tickFmt={(v) => v.toFixed(2)} />
      <PvtChart title="Gas Z-factor" data={data} dataKey="Z" color={LINE.z} yLabel="Z (–)" yDomain={[0, 'auto']} pb={pb} tickFmt={(v) => v.toFixed(2)} />
    </div>
  );
};

export default PvtChartsCard;
