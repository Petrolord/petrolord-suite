// Cut yields and the netback valuation (DS1).
import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle } from 'lucide-react';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE, niceTicks } from '@/utils/chartTheme';
import { useCrudeAssay } from '@/contexts/CrudeAssayContext';

const fmt = (v, dp = 2) => (Number.isFinite(v) ? v.toFixed(dp) : 'n/a');
const CUT_COLORS = ['#7c3aed', '#2563eb', '#0891b2', '#059669', '#d97706', '#78716c'];

const YieldsPanel = () => {
  const {
    inputs, yields, perCrudeYields, valuation, setCut, setPrice, setValuation,
  } = useCrudeAssay();

  const chartRows = yields.cuts.map((c) => ({
    name: c.name,
    // An unknown cut draws no bar; a bar at zero would read as a measured
    // empty cut.
    yieldPct: c.yieldVolPercent,
  }));
  const yAxis = niceTicks(0, Math.max(1, ...chartRows.map((r) => r.yieldPct).filter(Number.isFinite)), 5);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-pl-text mb-2">Cut yields of the blend</h3>
        <ChartFrame height={280} exportFilename="crude-blend-yields">
          <BarChart data={chartRows} margin={{ top: 12, right: 24, left: 8, bottom: 40 }}>
            <CartesianGrid {...GRID_STYLE} vertical={false} />
            <XAxis
              dataKey="name" stroke={CHART_COLORS.axisLine}
              tick={{ fill: CHART_COLORS.axisText, fontSize: 11 }}
              interval={0} angle={-20} textAnchor="end" height={60}
            />
            <YAxis
              domain={yAxis.domain} ticks={yAxis.ticks}
              stroke={CHART_COLORS.axisLine}
              tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
              label={{
                value: 'Yield (vol %)', angle: -90, position: 'insideLeft',
                fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
              }}
            />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${fmt(v, 1)} vol%`, 'Yield']} />
            <Bar dataKey="yieldPct" name="Yield">
              {chartRows.map((r, i) => <Cell key={r.name} fill={CUT_COLORS[i % CUT_COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ChartFrame>
        {yields.unknownCuts?.length > 0 && (
          <div className="mt-2 flex items-start gap-2 rounded border border-pl-warning/40 bg-pl-warning-bg p-3">
            <AlertTriangle className="w-4 h-4 text-pl-warning-text mt-0.5 shrink-0" />
            <p className="text-xs text-pl-warning-text">
              No yield for {yields.unknownCuts.join(', ')}. A cut point lies outside what the
              distillation curve measured (or the cut runs backwards), and the curve says nothing
              there. Extend the curve, starting it at 0 percent and ending it at 100, or move the
              cut point inside it. Nothing is extrapolated.
            </p>
          </div>
        )}
        {!yields.closes && !(yields.unknownCuts?.length > 0) && (
          <div className="mt-2 flex items-start gap-2 rounded border border-pl-warning/40 bg-pl-warning-bg p-3">
            <AlertTriangle className="w-4 h-4 text-pl-warning-text mt-0.5 shrink-0" />
            <p className="text-xs text-pl-warning-text">
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
            <tr className="border-b border-pl-border text-left">
              <th className="p-2 text-pl-muted font-medium">Cut</th>
              <th className="p-2 text-pl-muted font-medium">From (F)</th>
              <th className="p-2 text-pl-muted font-medium">To (F)</th>
              <th className="p-2 text-pl-muted font-medium text-right">Blend yield</th>
              {perCrudeYields.map((c) => (
                <th key={c.id} className="p-2 text-pl-muted font-medium text-right">{c.name}</th>
              ))}
              <th className="p-2 text-pl-muted font-medium text-right">Price ($/bbl)</th>
              <th className="p-2 text-pl-muted font-medium text-right">Value ($/bbl crude)</th>
            </tr>
          </thead>
          <tbody>
            {yields.cuts.map((cut, i) => {
              const row = valuation.rows.find((r) => r.id === cut.id);
              return (
                <tr key={cut.id} className="border-b border-pl-border">
                  <td className="p-2 text-pl-text">{cut.name}</td>
                  <td className="p-2">
                    <Input
                      type="number" value={cut.fromF ?? ''} placeholder="IBP"
                      onChange={(e) => setCut(cut.id, { fromF: e.target.value === '' ? null : Number(e.target.value) })}
                      className="h-7 w-20 text-xs"
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="number" value={cut.toF ?? ''} placeholder="FBP"
                      onChange={(e) => setCut(cut.id, { toF: e.target.value === '' ? null : Number(e.target.value) })}
                      className="h-7 w-20 text-xs"
                    />
                  </td>
                  <td className="p-2 text-right font-mono text-pl-text">{Number.isFinite(cut.yieldVolPercent) ? `${fmt(cut.yieldVolPercent, 1)}%` : 'n/a'}</td>
                  {perCrudeYields.map((c) => (
                    <td key={c.id} className="p-2 text-right font-mono text-pl-muted">
                      {Number.isFinite(c.cuts[i]?.yieldVolPercent) ? `${fmt(c.cuts[i].yieldVolPercent, 1)}%` : 'n/a'}
                    </td>
                  ))}
                  <td className="p-2">
                    <Input
                      type="number" value={inputs.valuation.prices[cut.id] ?? ''}
                      onChange={(e) => setPrice(cut.id, e.target.value)}
                      className="h-7 w-20 text-xs text-right"
                    />
                  </td>
                  <td className="p-2 text-right font-mono text-pl-text">
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
        <div className="rounded-lg border border-pl-border bg-pl-surface p-4 space-y-3">
          <h3 className="text-sm font-semibold text-pl-text">Costs against the barrel</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px] text-pl-muted">Processing ($/bbl)</Label>
              <Input type="number" value={inputs.valuation.processingCostPerBbl}
                onChange={(e) => setValuation({ processingCostPerBbl: e.target.value })}
                className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-[11px] text-pl-muted">Freight ($/bbl)</Label>
              <Input type="number" value={inputs.valuation.freightPerBbl}
                onChange={(e) => setValuation({ freightPerBbl: e.target.value })}
                className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-[11px] text-pl-muted">Losses (%)</Label>
              <Input type="number" value={inputs.valuation.lossPercent}
                onChange={(e) => setValuation({ lossPercent: e.target.value })}
                className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-[11px] text-pl-muted">Marker netback ($/bbl)</Label>
              <Input type="number" value={inputs.valuation.markerNetback} placeholder="optional"
                onChange={(e) => setValuation({ markerNetback: e.target.value })}
                className="h-8 text-sm" />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-pl-border bg-pl-surface p-4">
          <h3 className="text-sm font-semibold text-pl-text mb-3">Netback</h3>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-pl-muted">Gross product value</dt><dd className="font-mono text-pl-text">${fmt(valuation.grossValue)}</dd></div>
            <div className="flex justify-between"><dt className="text-pl-muted">Less losses</dt><dd className="font-mono text-pl-text">-${fmt(valuation.lossValue)}</dd></div>
            <div className="flex justify-between"><dt className="text-pl-muted">Less processing</dt><dd className="font-mono text-pl-text">-${fmt(valuation.processingCostPerBbl)}</dd></div>
            <div className="flex justify-between"><dt className="text-pl-muted">Less freight</dt><dd className="font-mono text-pl-text">-${fmt(valuation.freightPerBbl)}</dd></div>
            <div className="flex justify-between border-t border-pl-border pt-1 mt-1">
              <dt className="text-pl-text font-semibold">Netback</dt>
              <dd className="font-mono text-pl-text font-bold">${fmt(valuation.netback)}</dd>
            </div>
            {valuation.marker && (
              <div className="flex justify-between">
                <dt className="text-pl-muted">Against the marker</dt>
                <dd className={`font-mono font-semibold ${valuation.marker.differential >= 0 ? 'text-pl-success-text' : 'text-pl-danger-text'}`}>
                  {valuation.marker.differential >= 0 ? '+' : ''}${fmt(valuation.marker.differential)}
                </dd>
              </div>
            )}
          </dl>
          {valuation.error && (
            <p className="text-[11px] text-pl-warning-text mt-3">{valuation.error}</p>
          )}
          {valuation.assumedZero?.length > 0 && (
            <p className="text-[11px] text-pl-muted mt-3">
              Taken as zero because the box is blank: {valuation.assumedZero.join(', ')}.
            </p>
          )}
          {valuation.unyieldedCuts?.length > 0 && (
            <p className="text-[11px] text-pl-warning-text mt-3">
              No yield for {valuation.unyieldedCuts.join(', ')}, so those cuts are left out of the
              value above and the netback is not complete.
            </p>
          )}
          {!valuation.complete && !valuation.error && valuation.unpricedCuts?.length > 0 && (
            <p className="text-[11px] text-pl-warning-text mt-3">
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
