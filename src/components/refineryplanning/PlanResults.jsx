// The plan: runs, product slate, margin and the marginal value of each stream (DS3).
import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
} from 'recharts';
import { AlertTriangle } from 'lucide-react';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useRefineryPlanning } from '@/contexts/RefineryPlanningContext';

const fmt = (v, dp = 0) => (Number.isFinite(v) ? v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp }) : 'n/a');
const COLORS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#dc2626', '#0891b2'];

const PlanResults = () => {
  const { plan } = useRefineryPlanning();

  if (plan.status !== 'optimal') {
    return (
      <div className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-6 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
        <div>
          <h3 className="font-semibold text-amber-200">No plan solves this configuration</h3>
          <p className="text-sm text-amber-100/90 mt-2">{plan.error}</p>
        </div>
      </div>
    );
  }

  const slate = plan.productMakes.filter((p) => p.volume > 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded border border-slate-800 bg-slate-900/60 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Gross margin</p>
          <p className="text-xl font-bold text-lime-300 mt-1">${fmt(plan.grossMarginPerBbl, 2)}/bbl</p>
        </div>
        <div className="rounded border border-slate-800 bg-slate-900/60 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Period margin</p>
          <p className="text-xl font-bold text-white mt-1">${fmt(plan.margin)}</p>
        </div>
        <div className="rounded border border-slate-800 bg-slate-900/60 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Crude run</p>
          <p className="text-xl font-bold text-white mt-1">{fmt(plan.totalCrude)} bbl</p>
        </div>
        <div className="rounded border border-slate-800 bg-slate-900/60 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Revenue</p>
          <p className="text-xl font-bold text-white mt-1">${fmt(plan.revenue)}</p>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white mb-2">Product slate</h3>
        <ChartFrame height={260} exportFilename="refinery-plan-slate">
          <BarChart data={slate} margin={{ top: 12, right: 24, left: 16, bottom: 40 }}>
            <CartesianGrid {...GRID_STYLE} vertical={false} />
            <XAxis
              dataKey="name" stroke={CHART_COLORS.axisLine}
              tick={{ fill: CHART_COLORS.axisText, fontSize: 11 }}
              interval={0} angle={-15} textAnchor="end" height={55}
            />
            <YAxis
              stroke={CHART_COLORS.axisLine}
              tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              label={{
                value: 'Volume (bbl)', angle: -90, position: 'insideLeft',
                fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
              }}
            />
            <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [`${fmt(v)} bbl`, 'Volume']} />
            <Legend verticalAlign="top" wrapperStyle={{ fontSize: '12px' }} />
            <Bar dataKey="volume" name="Volume">
              {slate.map((p, i) => <Cell key={p.id} fill={COLORS[i % COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ChartFrame>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="text-sm font-semibold text-white mb-2">Crude and unit runs</h3>
          <table className="w-full text-sm">
            <tbody>
              {plan.crudeRuns.map((c) => (
                <tr key={c.id} className="border-b border-slate-800/60">
                  <td className="py-1.5 text-slate-300">{c.name}</td>
                  <td className="py-1.5 text-right font-mono text-white">{fmt(c.volume)} bbl</td>
                </tr>
              ))}
              {plan.unitRuns.map((u) => (
                <tr key={u.id} className="border-b border-slate-800/60 last:border-0">
                  <td className="py-1.5 text-slate-400">{u.name}</td>
                  <td className="py-1.5 text-right font-mono text-slate-300">
                    {fmt(u.throughput)} bbl
                    {u.utilisation !== null && <span className="text-slate-500"> ({(u.utilisation * 100).toFixed(0)}%)</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="text-sm font-semibold text-white mb-1">What another barrel of each stream is worth</h3>
          <p className="text-[11px] text-slate-500 mb-2">
            The marginal value from the plan. It is the reason to solve this rather than fill in a
            spreadsheet: it prices a debottleneck before anyone spends on one. A stream worth nothing
            at the margin is one nobody has a home for.
          </p>
          <table className="w-full text-sm">
            <tbody>
              {plan.streamBalance.map((s) => (
                <tr key={s.id} className="border-b border-slate-800/60 last:border-0">
                  <td className="py-1.5 text-slate-300">{s.id}</td>
                  <td className="py-1.5 text-right font-mono text-white">
                    {Number.isFinite(s.marginalValue) ? `$${s.marginalValue.toFixed(2)}` : 'n/a'}
                  </td>
                  <td className="py-1.5 text-right font-mono text-slate-500 text-xs">
                    {s.surplus > 1e-6 ? `${fmt(s.surplus)} surplus` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PlanResults;
