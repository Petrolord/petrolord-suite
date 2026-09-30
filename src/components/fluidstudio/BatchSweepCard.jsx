import React, { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import ChartFrame from '@/components/charts/ChartFrame';
import { SlidersHorizontal } from 'lucide-react';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE,
} from '@/utils/chartTheme';
import { EMPTY_VALUE } from '@/lib/emptyValue';

const C = { pb: '#dc2626', bo: '#059669' };
const fmt = (v, d = 1) => (v == null || !Number.isFinite(v) ? EMPTY_VALUE : Number(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }));

/**
 * Batch sensitivity sweep: the swept variable on X against Pb (left axis) and
 * Bo@Pb (right axis), plus a full results table.
 */
const BatchSweepCard = ({ rows, variable, unit, label, blendingActive }) => {
  const data = useMemo(() => [...(rows || [])].sort((a, b) => a.input - b.input), [rows]);
  const hasWat = data.some((r) => r.wat != null);
  if (!data.length) return null;

  const xLabel = `${label || variable}${unit ? ` (${unit})` : ''}`;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-pl-text flex items-center"><SlidersHorizontal className="mr-2 text-pl-muted w-5 h-5" /> Batch sensitivity: {label || variable}</CardTitle>
        <p className="text-xs text-pl-muted">Other inputs held at Stream A. Each point is a full re-run of the engine.</p>
        {blendingActive && (
          <p className="text-xs text-pl-warning-text">Blending applies to the main result; this sweep characterizes the un-blended Stream A fluid.</p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <ChartFrame height={288}>
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 16, left: -4 }}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis dataKey="input" type="number" domain={['dataMin', 'dataMax']} stroke={CHART_COLORS.axisLine} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} label={{ value: xLabel, fill: CHART_COLORS.axisLabel, fontSize: 11, position: 'insideBottom', dy: 12 }} />
            <YAxis yAxisId="pb" stroke={C.pb} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} width={56} label={{ value: 'Pb (psia)', angle: -90, fill: C.pb, fontSize: 11, position: 'insideLeft', dy: 24 }} />
            <YAxis yAxisId="bo" orientation="right" stroke={C.bo} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} width={56} domain={['auto', 'auto']} label={{ value: 'Bo @ Pb (rb/STB)', angle: 90, fill: C.bo, fontSize: 11, position: 'insideRight', dy: -30 }} />
            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: CHART_COLORS.tooltipText }} itemStyle={{ color: CHART_COLORS.tooltipText }} labelFormatter={(v) => `${fmt(v, 2)} ${unit || ''}`} />
            <Legend wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText }} />
            <Line yAxisId="pb" type="monotone" dataKey="pb" name="Pb (psia)" stroke={C.pb} strokeWidth={2} dot={{ r: 2 }} connectNulls />
            <Line yAxisId="bo" type="monotone" dataKey="bo_at_pb" name="Bo @ Pb" stroke={C.bo} strokeWidth={2} dot={{ r: 2 }} connectNulls />
          </LineChart>
        </ChartFrame>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-pl-border hover:bg-transparent">
                <TableHead className="text-right">{label || variable}{unit ? ` (${unit})` : ''}</TableHead>
                <TableHead className="text-right">Pb (psia)</TableHead>
                <TableHead className="text-right">Bo @ Pb</TableHead>
                <TableHead className="text-right">μo @ Pb (cP)</TableHead>
                <TableHead className="text-right">WAT (°F)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((r, i) => (
                <TableRow key={i} className="border-pl-border">
                  <TableCell className="text-right font-pl-mono tabular-nums text-pl-text">{fmt(r.input, 2)}</TableCell>
                  <TableCell className="text-right font-pl-mono tabular-nums text-pl-text">{fmt(r.pb, 0)}</TableCell>
                  <TableCell className="text-right font-pl-mono tabular-nums text-pl-text">{fmt(r.bo_at_pb, 3)}</TableCell>
                  <TableCell className="text-right font-pl-mono tabular-nums text-pl-text">{fmt(r.mu_o_at_pb, 3)}</TableCell>
                  <TableCell className="text-right font-pl-mono tabular-nums text-pl-text">{fmt(r.wat, 1)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {!hasWat && (
          <p className="text-xs text-pl-muted">WAT is blank because it requires Flow Assurance (a measured WAT or wax content); no value is fabricated from black-oil inputs.</p>
        )}
      </CardContent>
    </Card>
  );
};

export default BatchSweepCard;
