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

const BAR = '#d97706'; // amber-600, legible on white
const STOCK_TANK = '#0891b2'; // cyan-700 to set the stock-tank stage apart

const fmt = (v, d = 1) => (v == null || !Number.isFinite(v) ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }));

/**
 * Separator-train results: a white ChartFrame bar chart of gas liberated per
 * stage, the per-stage table, and the reconciled totals. Clearly labeled as a
 * black-oil staged-liberation approximation (GOR partition), not an EOS flash.
 */
const SeparatorResultsCard = ({ separator }) => {
  if (!separator?.stages?.length) return null;
  const { stages, totals } = separator;

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-white">Separator train</CardTitle>
        <p className="text-xs text-slate-400">
          Black-oil staged-liberation approximation — gas is partitioned across stages by the
          correlation GOR at each stage&apos;s P&nbsp;&amp;&nbsp;T. Not a compositional (EOS) flash.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <ChartFrame height={240}>
          <BarChart data={stages} margin={{ top: 8, right: 20, bottom: 4, left: -4 }}>
            <CartesianGrid {...GRID_STYLE} vertical={false} />
            <XAxis dataKey="name" stroke={CHART_COLORS.axisLine} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
            <YAxis stroke={CHART_COLORS.axisLine} tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} width={56} label={{ value: 'Gas liberated (scf/STB)', angle: -90, fill: CHART_COLORS.axisLabel, fontSize: 11, position: 'insideLeft', dy: 60 }} />
            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: CHART_COLORS.tooltipText }} itemStyle={{ color: CHART_COLORS.tooltipText }} formatter={(v) => [`${fmt(v)} scf/STB`, 'Gas liberated']} />
            <Bar dataKey="gas_liberated" radius={[3, 3, 0, 0]}>
              {stages.map((s) => (
                <Cell key={s.index} fill={s.name === 'Stock Tank' ? STOCK_TANK : BAR} />
              ))}
            </Bar>
          </BarChart>
        </ChartFrame>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-800 hover:bg-transparent">
                <TableHead className="text-lime-300">Stage</TableHead>
                <TableHead className="text-lime-300 text-right">P (psia)</TableHead>
                <TableHead className="text-lime-300 text-right">T (°F)</TableHead>
                <TableHead className="text-lime-300 text-right">Rs out (scf/STB)</TableHead>
                <TableHead className="text-lime-300 text-right">Gas liberated (scf/STB)</TableHead>
                <TableHead className="text-lime-300 text-right">Gas rate (Mscf/d)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stages.map((s) => (
                <TableRow key={s.index} className="border-slate-800">
                  <TableCell className="text-white">{s.name}</TableCell>
                  <TableCell className="text-right font-mono text-slate-300">{fmt(s.pressure, 0)}</TableCell>
                  <TableCell className="text-right font-mono text-slate-300">{fmt(s.temperature, 0)}</TableCell>
                  <TableCell className="text-right font-mono text-slate-300">{fmt(s.rs_out)}</TableCell>
                  <TableCell className="text-right font-mono text-amber-300">{fmt(s.gas_liberated)}</TableCell>
                  <TableCell className="text-right font-mono text-slate-300">{fmt(s.gas_rate)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2 border-lime-400 font-semibold hover:bg-transparent">
                <TableCell className="text-white" colSpan={4}>Total surface GOR</TableCell>
                <TableCell className="text-right font-mono text-lime-300">{fmt(totals.total_gor)}</TableCell>
                <TableCell className="text-right font-mono text-lime-300">{fmt(totals.total_gas_rate)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <TotIt label="Separator GOR" value={`${fmt(totals.separator_gor)} scf/STB`} />
          <TotIt label="Stock-tank GOR" value={`${fmt(totals.stock_tank_gor)} scf/STB`} />
          <TotIt label="Bo (single stage)" value={`${fmt(totals.bo_single_stage, 3)} rb/STB`} />
          <TotIt label="Bo (multistage, approx)" value={`${fmt(totals.bo_multistage_approx, 3)} rb/STB`} />
        </div>
        <p className="text-xs text-slate-500">
          Stock-tank oil basis {fmt(totals.stock_tank_oil_rate, 0)} STB/d (reporting basis for gas rates, not a deliverability estimate).
          Multistage Bo is an approximation illustrating the staging benefit; per-stage oil volumes are not reported from black-oil correlations.
        </p>
      </CardContent>
    </Card>
  );
};

const TotIt = ({ label, value }) => (
  <div className="rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-2">
    <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
    <div className="text-base font-bold text-white mt-0.5">{value}</div>
  </div>
);

export default SeparatorResultsCard;
