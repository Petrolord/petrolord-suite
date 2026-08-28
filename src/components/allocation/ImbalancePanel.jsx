// Meter against ledger (Reconciliation tab): the unaccounted volume an
// allocation engineer chases. Positive means the facility meter saw
// more than the wells booked between them.
import React, { useMemo } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import { Scale } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { decimate } from '@/utils/production/surveillance';
import { PHASES } from '@/utils/production/allocation';
import { useAllocation } from '@/contexts/ProductionAllocationContext';

const fmt = (v, digits = 0) => (Number.isFinite(v)
  ? v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  : '--');

const ImbalancePanel = () => {
  const { imbalance, inputs, setViewField, currentField } = useAllocation();
  const phase = inputs.view.phase || 'oil';
  const phaseDef = PHASES.find((p) => p.key === phase) || PHASES[0];

  const { data, summary } = useMemo(() => {
    const rows = imbalance.map((r) => ({
      date: r.date,
      measured: r[phase].measured,
      booked: r[phase].booked,
      imbalance: r[phase].imbalance,
    }));
    const totals = rows.reduce((t, r) => ({
      measured: t.measured + r.measured,
      booked: t.booked + r.booked,
    }), { measured: 0, booked: 0 });
    return {
      data: decimate(rows),
      summary: {
        ...totals,
        imbalance: totals.measured - totals.booked,
        pct: totals.booked > 0 ? ((totals.measured - totals.booked) / totals.booked) * 100 : null,
      },
    };
  }, [imbalance, phase]);

  if (!currentField) {
    return (
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="py-10 text-center text-slate-500 text-sm">
          Select a field in the left rail to reconcile its meter against its ledger.
        </CardContent>
      </Card>
    );
  }

  if (!imbalance.length) {
    return (
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="py-10 text-center text-slate-500 text-sm px-8">
          Reconciliation needs both a metered total and a per-well ledger for the same dates.
          Import the meter on the Data tab; the ledger comes from the Surveillance Studio.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-2 flex-row items-start justify-between flex-wrap gap-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Scale className="w-4 h-4 text-sky-400" /> Meter against ledger
          <span className="block text-xs font-normal text-slate-500 mt-0.5">
            {fmt(summary.measured)} {phaseDef.unit} metered against {fmt(summary.booked)} booked:
            {' '}{summary.imbalance >= 0 ? 'a shortfall of ' : 'an excess of '}
            {fmt(Math.abs(summary.imbalance))} {phaseDef.unit}
            {summary.pct == null ? '' : ` (${fmt(Math.abs(summary.pct), 1)}%)`}.
          </span>
        </CardTitle>
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Phase</Label>
          <Select value={phase} onValueChange={(v) => setViewField('phase', v)}>
            <SelectTrigger className="h-8 w-32 bg-slate-800 border-slate-700 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
              {PHASES.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ChartFrame height={340} exportFilename={`allocation-imbalance-${phase}`}>
          <ComposedChart data={data} margin={{ top: 8, right: 24, bottom: 4, left: 8 }}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis
              dataKey="date" stroke={CHART_COLORS.axisLine} minTickGap={40}
              tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
            />
            <YAxis
              yAxisId="left" stroke={CHART_COLORS.axisLine}
              tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
              label={{
                value: `${phaseDef.label} (${phaseDef.unit})`, angle: -90, position: 'insideLeft',
                fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
              }}
            />
            <YAxis
              yAxisId="right" orientation="right" stroke={CHART_COLORS.axisLine}
              tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
              label={{
                value: `Imbalance (${phaseDef.unit})`, angle: 90, position: 'insideRight',
                fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
              }}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelStyle={{ color: CHART_COLORS.tooltipText }}
              itemStyle={{ color: CHART_COLORS.tooltipText }}
              formatter={(value, name) => [`${fmt(Number(value))} ${phaseDef.unit}`, name]}
            />
            <Legend wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText }} />
            <ReferenceLine yAxisId="right" y={0} stroke="#94a3b8" />
            <Bar yAxisId="right" dataKey="imbalance" name="Imbalance" fill="#f59e0b" fillOpacity={0.5} isAnimationActive={false} />
            <Line yAxisId="left" type="monotone" dataKey="measured" name="Metered" stroke="#0f172a" strokeWidth={1.8} dot={false} isAnimationActive={false} />
            <Line yAxisId="left" type="monotone" dataKey="booked" name="Booked by wells" stroke="#059669" strokeWidth={1.8} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ChartFrame>
      </CardContent>
    </Card>
  );
};

export default ImbalancePanel;
