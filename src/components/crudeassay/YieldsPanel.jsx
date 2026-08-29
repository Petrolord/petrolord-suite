// Cut yields and the netback valuation (DS1).
import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
} from 'recharts';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle } from 'lucide-react';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useCrudeAssay } from '@/contexts/CrudeAssayContext';

const fmt = (v, dp = 2) => (Number.isFinite(v) ? v.toFixed(dp) : 'n/a');
const CUT_COLORS = ['#7c3aed', '#2563eb', '#0891b2', '#059669', '#d97706', '#78716c'];

const YieldsPanel = () => {
  const {
    inputs, yields, perCrudeYields, valuation, setCut, setPrice, setValuation,
  } = useCrudeAssay();

  const chartRows = yields.cuts.map((c) => ({
    name: c.name,
    yieldPct: c.yieldVolPercent ?? 0,
  }));

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-white mb-2">Cut yields of the blend</h3>
        <ChartFrame height={280} exportFilename="crude-blend-yields">
          <BarChart data={chartRows} margin={{ top: 12, right: 24, left: 8, bottom: 40 }}>
            <CartesianGrid {...GRID_STYLE} vertical={false} />
            <XAxis
              dataKey="name" stroke={CHART_COLORS.axisLine}
              tick={{ fill: CHART_COLORS.axisText, fontSize: 11 }}
              interval={0} angle={-20} textAnchor="end" height={60}
            />
            <YAxis
              stroke={CHART_COLORS.axisLine}
              tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
              label={{
                value: 'Yield (vol %)', angle: -90, position: 'insideLeft',
                fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
              }}
            />
            <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [`${fmt(v, 1)} vol%`, 'Yield']} />
            <Legend verticalAlign="top" wrapperStyle={{ fontSize: '12px' }} />
            <Bar dataKey="yieldPct" name="Yield">
              {chartRows.map((r, i) => <Cell key={r.name} fill={CUT_COLORS[i % CUT_COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ChartFrame>
        {!yields.closes && (
          <div className="mt-2 flex items-start gap-2 rounded border border-amber-800/60 bg-amber-950/30 p-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-200">
              The cuts total {fmt(yields.totalVolPercent, 1)} percent, not 100. The cut set does not
              cover the whole curve. The yields are reported as they compute rather than scaled up to
              close, because scaling would hide the gap.
            </p>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left">
              <th className="p-2 text-slate-400 font-medium">Cut</th>
              <th className="p-2 text-slate-400 font-medium">From (F)</th>
              <th className="p-2 text-slate-400 font-medium">To (F)</th>
              <th className="p-2 text-slate-400 font-medium text-right">Blend yield</th>
              {perCrudeYields.map((c) => (
                <th key={c.id} className="p-2 text-slate-400 font-medium text-right">{c.name}</th>
              ))}
              <th className="p-2 text-slate-400 font-medium text-right">Price ($/bbl)</th>
              <th className="p-2 text-slate-400 font-medium text-right">Value ($/bbl crude)</th>
            </tr>
          </thead>
          <tbody>
            {yields.cuts.map((cut, i) => {
              const row = valuation.rows.find((r) => r.id === cut.id);
              return (
                <tr key={cut.id} className="border-b border-slate-800/60">
                  <td className="p-2 text-white">{cut.name}</td>
                  <td className="p-2">
                    <Input
                      type="number" value={cut.fromF ?? ''} placeholder="IBP"
                      onChange={(e) => setCut(cut.id, { fromF: e.target.value === '' ? null : Number(e.target.value) })}
                      className="h-7 w-20 bg-slate-950 border-slate-700 text-xs"
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="number" value={cut.toF ?? ''} placeholder="FBP"
                      onChange={(e) => setCut(cut.id, { toF: e.target.value === '' ? null : Number(e.target.value) })}
                      className="h-7 w-20 bg-slate-950 border-slate-700 text-xs"
                    />
                  </td>
                  <td className="p-2 text-right font-mono text-white">{fmt(cut.yieldVolPercent, 1)}%</td>
                  {perCrudeYields.map((c) => (
                    <td key={c.id} className="p-2 text-right font-mono text-slate-400">
                      {fmt(c.cuts[i]?.yieldVolPercent, 1)}%
                    </td>
                  ))}
                  <td className="p-2">
                    <Input
                      type="number" value={inputs.valuation.prices[cut.id] ?? ''}
                      onChange={(e) => setPrice(cut.id, e.target.value)}
                      className="h-7 w-20 bg-slate-950 border-slate-700 text-xs text-right"
                    />
                  </td>
                  <td className="p-2 text-right font-mono text-lime-300">
                    {row?.valuePerBblCrude === null || row?.valuePerBblCrude === undefined
                      ? 'not priced'
                      : `$${fmt(row.valuePerBblCrude, 2)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-white">Costs against the barrel</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px] text-slate-400">Processing ($/bbl)</Label>
              <Input type="number" value={inputs.valuation.processingCostPerBbl}
                onChange={(e) => setValuation({ processingCostPerBbl: e.target.value })}
                className="h-8 bg-slate-950 border-slate-700 text-sm" />
            </div>
            <div>
              <Label className="text-[11px] text-slate-400">Freight ($/bbl)</Label>
              <Input type="number" value={inputs.valuation.freightPerBbl}
                onChange={(e) => setValuation({ freightPerBbl: e.target.value })}
                className="h-8 bg-slate-950 border-slate-700 text-sm" />
            </div>
            <div>
              <Label className="text-[11px] text-slate-400">Losses (%)</Label>
              <Input type="number" value={inputs.valuation.lossPercent}
                onChange={(e) => setValuation({ lossPercent: e.target.value })}
                className="h-8 bg-slate-950 border-slate-700 text-sm" />
            </div>
            <div>
              <Label className="text-[11px] text-slate-400">Marker netback ($/bbl)</Label>
              <Input type="number" value={inputs.valuation.markerNetback} placeholder="optional"
                onChange={(e) => setValuation({ markerNetback: e.target.value })}
                className="h-8 bg-slate-950 border-slate-700 text-sm" />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Netback</h3>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-slate-400">Gross product value</dt><dd className="font-mono text-white">${fmt(valuation.grossValue)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Less losses</dt><dd className="font-mono text-slate-300">-${fmt(valuation.lossValue)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Less processing</dt><dd className="font-mono text-slate-300">-${fmt(valuation.processingCostPerBbl)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Less freight</dt><dd className="font-mono text-slate-300">-${fmt(valuation.freightPerBbl)}</dd></div>
            <div className="flex justify-between border-t border-slate-700 pt-1 mt-1">
              <dt className="text-white font-semibold">Netback</dt>
              <dd className="font-mono text-lime-300 font-bold">${fmt(valuation.netback)}</dd>
            </div>
            {valuation.marker && (
              <div className="flex justify-between">
                <dt className="text-slate-400">Against the marker</dt>
                <dd className={`font-mono font-semibold ${valuation.marker.differential >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                  {valuation.marker.differential >= 0 ? '+' : ''}${fmt(valuation.marker.differential)}
                </dd>
              </div>
            )}
          </dl>
          {!valuation.complete && (
            <p className="text-[11px] text-amber-300 mt-3">
              No price for {valuation.unpricedCuts.join(', ')}. Those cuts contribute nothing to the
              value above, so the netback is understated until they are priced.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default YieldsPanel;
