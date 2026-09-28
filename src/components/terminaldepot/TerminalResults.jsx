// Reconciliation, gain-loss trend, rack queue, cover and economics (DS5).
import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE, LEGEND_PROPS } from '@/utils/chartTheme';
import { useTerminalDepot } from '@/contexts/TerminalDepotContext';

// Senior test T1: a loss read "$-21,360" in green.
const money = (v, dp = 0) => (Number.isFinite(v) ? `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })}` : 'n/a');
const fmt = (v, dp = 1) => (Number.isFinite(v) ? v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp }) : 'n/a');

const TerminalResults = () => {
  const {
    inputs, reconciliation, trend, queue, farm, economics,
    addHistoryDay, setHistoryDay, removeHistoryDay,
  } = useTerminalDepot();
  const tick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };

  const chartRows = trend.rows.map((r, i) => ({
    label: r.date || `Day ${i + 1}`,
    daily: r.unaccountedM3,
    cumulative: r.cumulativeM3,
  }));

  return (
    <div className="space-y-5">
      <div className={`rounded-lg border p-4 flex items-start gap-3 ${
        reconciliation.unaccountedM3 === null
          ? 'border-pl-warning/40 bg-pl-warning-bg'
          : reconciliation.withinTolerance === false
            ? 'border-pl-danger/40 bg-pl-danger-bg'
            : 'border-pl-success/40 bg-pl-success-bg'}`}
      >
        {reconciliation.unaccountedM3 === null || reconciliation.withinTolerance === false
          ? <AlertTriangle className={`w-5 h-5 mt-0.5 shrink-0 ${reconciliation.unaccountedM3 === null ? 'text-pl-warning-text' : 'text-pl-danger-text'}`} />
          : <CheckCircle2 className="w-5 h-5 text-pl-success-text mt-0.5 shrink-0" />}
        <div>
          <p className="font-semibold text-pl-text">
            {reconciliation.unaccountedM3 === null
              ? 'The day cannot be closed'
              : `Unaccounted: ${fmt(reconciliation.unaccountedM3)} m3 (${reconciliation.direction})`}
          </p>
          <p className="text-sm text-pl-text mt-1">
            {reconciliation.unaccountedM3 === null
              ? (reconciliation.error || reconciliation.note)
              : `${fmt(reconciliation.unaccountedPercentOfThroughput, 2)}% of throughput, against a tolerance of ${fmt(reconciliation.toleranceM3)} m3. Tolerance is measured on what moved, because measurement error scales with throughput.`}
          </p>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-pl-text mb-1">Gain and loss trend</h3>
        <p className="text-[11px] text-pl-muted mb-2">
          One day&apos;s gain is noise. A run in one direction is a finding, and separating the two
          is the reason to trend rather than to look at today&apos;s number.
        </p>
        <ChartFrame height={260} exportFilename="terminal-gain-loss">
          <LineChart data={chartRows} margin={{ top: 12, right: 24, left: 16, bottom: 28 }}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis dataKey="label" stroke={CHART_COLORS.axisLine} tick={tick} />
            <YAxis stroke={CHART_COLORS.axisLine} tick={tick}
              label={{ value: 'm3', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, n) => [`${fmt(v)} m3`, n]} />
            <Legend {...LEGEND_PROPS} />
            <ReferenceLine y={0} stroke={CHART_COLORS.axisLine} />
            <Line type="linear" dataKey="daily" name="Daily" stroke="#0891b2" strokeWidth={1.5} dot={{ r: 3 }} />
            <Line type="linear" dataKey="cumulative" name="Cumulative" stroke="#dc2626" strokeWidth={2} dot={false} />
          </LineChart>
        </ChartFrame>
        {trend.prompt && (
          <div className="mt-2 flex items-start gap-2 rounded border border-pl-warning/40 bg-pl-warning-bg p-3">
            <AlertTriangle className="w-4 h-4 text-pl-warning-text mt-0.5 shrink-0" />
            <p className="text-xs text-pl-warning-text">{trend.prompt}</p>
          </div>
        )}
        <div className="mt-3 space-y-1">
          {inputs.history.length > 0 && (
            <div className="flex items-center gap-2 text-[10px] text-pl-muted">
              <span className="w-14" />
              <span className="w-28">Unaccounted (m3)</span>
              <span className="w-28">Throughput (m3)</span>
            </div>
          )}
          {inputs.history.map((d, i) => (
            <div key={d.id} className="flex items-center gap-2">
              <span className="text-[11px] text-pl-muted w-14">Day {i + 1}</span>
              <Input type="number" step="any" value={d.unaccountedM3} aria-label={`Day ${i + 1} unaccounted (m3)`}
                onChange={(e) => setHistoryDay(d.id, { unaccountedM3: e.target.value })}
                className="h-7 text-xs w-28" placeholder="unaccounted" />
              <Input type="number" step="any" value={d.throughputM3} aria-label={`Day ${i + 1} throughput (m3)`}
                onChange={(e) => setHistoryDay(d.id, { throughputM3: e.target.value })}
                className="h-7 text-xs w-28" placeholder="throughput" />
              <Button variant="ghost" size="sm" onClick={() => removeHistoryDay(d.id)}
                className="h-7 text-pl-muted hover:text-pl-danger-text text-xs">Remove</Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addHistoryDay}
            className="h-7 text-xs mt-1">Add a day</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-pl-border bg-pl-surface p-4">
          <h3 className="text-sm font-semibold text-pl-text mb-1">Loading rack</h3>
          {queue.stable === false ? (
            <div className="flex items-start gap-2 mt-2">
              <AlertTriangle className="w-4 h-4 text-pl-danger-text mt-0.5 shrink-0" />
              <p className="text-sm text-pl-danger-text">{queue.error}</p>
            </div>
          ) : queue.error ? (
            <p className="text-sm text-pl-muted mt-2">{queue.error}</p>
          ) : (
            <>
              <table className="w-full text-sm mt-2">
                <tbody>
                  <tr className="border-b border-pl-border"><td className="py-1.5 text-pl-muted">Utilisation</td><td className="py-1.5 text-right font-mono text-pl-text">{(queue.utilisation * 100).toFixed(0)}%</td></tr>
                  <tr className="border-b border-pl-border"><td className="py-1.5 text-pl-muted">Chance of waiting</td><td className="py-1.5 text-right font-mono text-pl-text">{(queue.probabilityOfWaiting * 100).toFixed(0)}%</td></tr>
                  <tr className="border-b border-pl-border"><td className="py-1.5 text-pl-muted">Average wait</td><td className="py-1.5 text-right font-mono text-pl-text">{fmt(queue.averageWaitMinutes)} min</td></tr>
                  <tr><td className="py-1.5 text-pl-muted">Time on site</td><td className="py-1.5 text-right font-mono text-pl-text">{fmt(queue.averageTimeOnSiteMinutes)} min</td></tr>
                </tbody>
              </table>
              <p className="text-[11px] text-pl-muted mt-2 flex items-start gap-1">
                <Info className="w-3 h-3 mt-0.5 shrink-0" />
                A rack at 85 percent utilisation does not have 15 percent spare, it has a queue.
                That is what simple capacity arithmetic gets wrong and why this is a queue model.
              </p>
            </>
          )}
        </div>

        <div className="rounded-lg border border-pl-border bg-pl-surface p-4">
          <h3 className="text-sm font-semibold text-pl-text mb-1">Tank farm</h3>
          <table className="w-full text-sm mt-2">
            <tbody>
              <tr className="border-b border-pl-border"><td className="py-1.5 text-pl-muted">Working capacity</td><td className="py-1.5 text-right font-mono text-pl-text">{fmt(farm.workingCapacityM3, 0)} m3</td></tr>
              <tr className="border-b border-pl-border"><td className="py-1.5 text-pl-muted">Stock</td><td className="py-1.5 text-right font-mono text-pl-text">{fmt(farm.stockM3, 0)} m3</td></tr>
              <tr className="border-b border-pl-border"><td className="py-1.5 text-pl-muted">Ullage</td><td className="py-1.5 text-right font-mono text-pl-text">{fmt(farm.ullageM3, 0)} m3</td></tr>
              <tr className="border-b border-pl-border"><td className="py-1.5 text-pl-muted">Days of cover</td><td className="py-1.5 text-right font-mono text-pl-text">{fmt(farm.daysOfCover)}</td></tr>
              <tr><td className="py-1.5 text-pl-muted">Turns per year</td><td className="py-1.5 text-right font-mono text-pl-text">{fmt(farm.turnsPerYear)}</td></tr>
            </tbody>
          </table>
          <p className="text-[11px] text-pl-muted mt-2">
            Working capacity is net of the heel, and cover is on pumpable stock. A plan that counts
            the heel is planning on volume that cannot come out.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-pl-border bg-pl-surface p-4">
        <h3 className="text-sm font-semibold text-pl-text mb-2">Throughput, in money and in carbon</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><p className="text-[11px] uppercase text-pl-muted">Margin</p><p className={`text-lg font-bold mt-1 ${economics.margin < 0 ? 'text-pl-danger-text' : 'text-pl-text'}`}>{money(economics.margin, 0)}</p></div>
          <div><p className="text-[11px] uppercase text-pl-muted">Per m3</p><p className="text-lg font-bold text-pl-text mt-1">{money(economics.marginPerM3, 2)}</p></div>
          <div><p className="text-[11px] uppercase text-pl-muted">Loss</p><p className="text-lg font-bold text-pl-text mt-1">{fmt(economics.lossTonnes, 2)} t</p></div>
          <div>
            <p className="text-[11px] uppercase text-pl-muted">kgCO2e per tonne</p>
            <p className="text-lg font-bold text-pl-text mt-1">
              {economics.kgCo2ePerTonneThroughput === null ? 'n/a' : fmt(economics.kgCo2ePerTonneThroughput, 3)}
            </p>
          </div>
        </div>
        {economics.carbonNote && (
          <p className="text-[11px] text-pl-warning-text mt-3">{economics.carbonNote}</p>
        )}
      </div>
    </div>
  );
};

export default TerminalResults;
