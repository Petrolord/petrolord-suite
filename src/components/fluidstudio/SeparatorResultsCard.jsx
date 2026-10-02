import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import ChartFrame from '@/components/charts/ChartFrame';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE,
} from '@/utils/chartTheme';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { useFluidUnits } from '@/components/fluidstudio/FluidUnitsContext';

const BAR = '#d97706'; // amber-600, legible on white
const STOCK_TANK = '#0891b2'; // cyan-700 to set the stock-tank stage apart

const fmt = (v, d = 1) => (v == null || !Number.isFinite(v) ? EMPTY_VALUE : Number(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }));

/**
 * Separator-train results: a white ChartFrame bar chart of gas liberated per
 * stage, the per-stage table, and the reconciled totals. Clearly labeled as a
 * black-oil staged-liberation approximation (GOR partition), not an EOS flash.
 */
const SeparatorResultsCard = ({ separator }) => {
  const u = useFluidUnits();
  if (!separator?.stages?.length) return null;
  const { stages: rawStages, totals } = separator;
  const gd = u.system === 'si' ? 2 : 1;
  // the chart and the table read one list, in the display units
  const stages = rawStages.map((st) => ({ ...st, gas_shown: u.show('gor', st.gas_liberated) }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-pl-text">Separator train</CardTitle>
        <p className="text-xs text-pl-muted">
          Black-oil staged-liberation approximation: gas is partitioned across stages by the
          correlation GOR at each stage&apos;s pressure and temperature. A compositional flash is on the Compositional tab when that model is selected.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <ChartFrame height={240}>
          <BarChart data={stages} margin={{ top: 8, right: 20, bottom: 4, left: -4 }}>
            <CartesianGrid {...GRID_STYLE} vertical={false} />
            <XAxis dataKey="name" stroke={CHART_COLORS.axisLine} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
            <YAxis stroke={CHART_COLORS.axisLine} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} width={56} label={{ value: u.head('Gas liberated', 'gor'), angle: -90, fill: CHART_COLORS.axisLabel, fontSize: 11, position: 'insideLeft', dy: 60 }} />
            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: CHART_COLORS.tooltipText }} itemStyle={{ color: CHART_COLORS.tooltipText }} formatter={(v) => [`${fmt(v, gd)} ${u.label('gor')}`, 'Gas liberated']} />
            <Bar dataKey="gas_shown" isAnimationActive={false} radius={[3, 3, 0, 0]}>
              {stages.map((s) => (
                <Cell key={s.index} fill={s.name === 'Stock Tank' ? STOCK_TANK : BAR} />
              ))}
            </Bar>
          </BarChart>
        </ChartFrame>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-pl-border hover:bg-transparent">
                <TableHead>Stage</TableHead>
                <TableHead className="text-right">{u.head('P', 'pressure')}</TableHead>
                <TableHead className="text-right">{u.head('T', 'temperature')}</TableHead>
                <TableHead className="text-right">{u.head('Rs out', 'gor')}</TableHead>
                <TableHead className="text-right">{u.head('Gas liberated', 'gor')}</TableHead>
                <TableHead className="text-right">{u.head('Gas rate', 'gasRate')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stages.map((s) => (
                <TableRow key={s.index} className="border-pl-border">
                  <TableCell className="text-pl-text">{s.name}</TableCell>
                  <TableCell className="text-right font-pl-mono tabular-nums text-pl-text">{fmt(u.show('pressure', s.pressure), 0)}</TableCell>
                  <TableCell className="text-right font-pl-mono tabular-nums text-pl-text">{fmt(u.show('temperature', s.temperature), 0)}</TableCell>
                  <TableCell className="text-right font-pl-mono tabular-nums text-pl-text">{fmt(u.show('gor', s.rs_out), gd)}</TableCell>
                  <TableCell className="text-right font-pl-mono tabular-nums text-pl-text">{fmt(u.show('gor', s.gas_liberated), gd)}</TableCell>
                  <TableCell className="text-right font-pl-mono tabular-nums text-pl-text">{fmt(u.show('gasRate', s.gas_rate))}</TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2 border-t-pl-border-strong font-semibold hover:bg-transparent">
                <TableCell className="text-pl-text" colSpan={4}>Total surface GOR</TableCell>
                <TableCell className="text-right font-pl-mono tabular-nums text-pl-text">{fmt(u.show('gor', totals.total_gor), gd)}</TableCell>
                <TableCell className="text-right font-pl-mono tabular-nums text-pl-text">{fmt(u.show('gasRate', totals.total_gas_rate))}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <TotIt label="Separator GOR" value={`${fmt(u.show('gor', totals.separator_gor), gd)} ${u.label('gor')}`} />
          <TotIt label="Stock-tank GOR" value={`${fmt(u.show('gor', totals.stock_tank_gor), gd)} ${u.label('gor')}`} />
          <TotIt label="Bo (single stage)" value={`${fmt(u.show('fvfOil', totals.bo_single_stage), 3)} ${u.label('fvfOil')}`} />
          <TotIt label="Bo (multistage, approx)" value={`${fmt(u.show('fvfOil', totals.bo_multistage_approx), 3)} ${u.label('fvfOil')}`} />
        </div>
        <p className="text-xs text-pl-muted">
          Stock-tank oil basis {fmt(u.show('liquidRate', totals.stock_tank_oil_rate), 0)} {u.label('liquidRate')} (a reporting basis for the gas rates, with no bearing on deliverability).
          Multistage Bo is an approximation illustrating the staging benefit; per-stage oil volumes are not reported from black-oil correlations.
        </p>
      </CardContent>
    </Card>
  );
};

const TotIt = ({ label, value }) => (
  <div className="rounded-lg border border-pl-border bg-pl-sunken px-3 py-2">
    <div className="text-[11px] uppercase tracking-wide text-pl-muted">{label}</div>
    <div className="text-base font-bold text-pl-text mt-0.5">{value}</div>
  </div>
);

export default SeparatorResultsCard;
