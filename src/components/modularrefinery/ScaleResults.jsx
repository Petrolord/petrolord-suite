// The scale comparison, the slate, the economics and the licensing tracker (DS4).
import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import { CheckCircle2, Circle, AlertTriangle } from 'lucide-react';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useModularRefinery } from '@/contexts/ModularRefineryContext';

const fmt = (v, dp = 0) => (Number.isFinite(v) ? v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp }) : 'n/a');
const mm = (v) => (Number.isFinite(v) ? `$${(v / 1e6).toFixed(1)}MM` : 'n/a');

const ScaleResults = () => {
  const {
    inputs, capex, comparison, slate, streams, economics,
    scenarioComparison, licensing, toggleLicence,
  } = useModularRefinery();
  const tick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded border border-slate-800 bg-slate-900/60 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Capital</p>
          <p className="text-xl font-bold text-white mt-1">{mm(capex.cost)}</p>
          <p className="text-[10px] text-slate-500 mt-1">${fmt(capex.perBpd)} per bpd</p>
        </div>
        <div className="rounded border border-slate-800 bg-slate-900/60 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Gross margin</p>
          <p className="text-xl font-bold text-lime-300 mt-1">${fmt(streams.grossMarginPerBbl, 2)}/bbl</p>
        </div>
        <div className="rounded border border-slate-800 bg-slate-900/60 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">NPV</p>
          <p className={`text-xl font-bold mt-1 ${(economics?.metrics?.npv ?? 0) >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
            {economics ? `$${fmt(economics.metrics.npv, 1)}MM` : 'n/a'}
          </p>
        </div>
        <div className="rounded border border-slate-800 bg-slate-900/60 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">IRR</p>
          <p className="text-xl font-bold text-white mt-1">
            {economics && Number.isFinite(economics.metrics.irr) ? `${economics.metrics.irr.toFixed(1)}%` : 'n/a'}
          </p>
        </div>
      </div>

      <p className="text-[11px] text-slate-500">
        Valued through the Suite&apos;s screening economics engine, the same one behind the NPV
        Scenario Builder, so an NPV here means what an NPV means anywhere else in the Suite. Full
        Nigerian fiscal detail under the PIA and the Nigeria Tax Act belongs to Petroleum Economics
        Studio, and a project heading for sanction should be valued there.
      </p>

      <div>
        <h3 className="text-sm font-semibold text-white mb-1">Capital per barrel of capacity, both scaling laws</h3>
        <p className="text-[11px] text-slate-500 mb-2">
          The six-tenths rule is why the industry believes small refineries cannot work: it says a
          bigger vessel is much cheaper per barrel. A modular plant does not scale that way, because
          capacity is added by replicating trains rather than by building bigger. The gap between
          these two curves is the entire argument, and it cuts both ways: the small plant loses far
          less to scale than the rule implies, and the big one gains far less.
        </p>
        <ChartFrame height={300} exportFilename="modular-scale-comparison">
          <LineChart data={comparison} margin={{ top: 12, right: 24, left: 16, bottom: 28 }}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis
              dataKey="capacity" type="number" scale="log" domain={['dataMin', 'dataMax']}
              stroke={CHART_COLORS.axisLine} tick={tick}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              label={{
                value: 'Capacity (bpd, log scale)', position: 'insideBottom', offset: -10,
                fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
              }}
            />
            <YAxis
              stroke={CHART_COLORS.axisLine} tick={tick}
              tickFormatter={(v) => `$${fmt(v)}`}
              label={{
                value: 'Capital per bpd ($)', angle: -90, position: 'insideLeft',
                fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
              }}
            />
            <Tooltip {...TOOLTIP_STYLE} formatter={(v, n) => [`$${fmt(v)}/bpd`, n]} labelFormatter={(v) => `${fmt(v)} bpd`} />
            <Legend verticalAlign="top" wrapperStyle={{ fontSize: '12px' }} />
            <ReferenceLine x={Number(inputs.baseCapacity)} stroke={CHART_COLORS.axisLine} strokeDasharray="4 3"
              label={{ value: 'reference', fill: CHART_COLORS.axisText, fontSize: 10, position: 'top' }} />
            <Line type="monotone" dataKey="modularPerBpd" name="Modular" stroke="#059669" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="stickBuiltPerBpd" name="Stick-built (six-tenths)" stroke="#dc2626" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3 }} />
          </LineChart>
        </ChartFrame>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="text-sm font-semibold text-white mb-2">Product slate</h3>
          <table className="w-full text-sm">
            <tbody>
              {slate.rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-800/60 last:border-0">
                  <td className="py-1.5 text-slate-300">{r.id}</td>
                  <td className="py-1.5 text-right font-mono text-slate-400">{(r.yieldFraction * 100).toFixed(1)}%</td>
                  <td className="py-1.5 text-right font-mono text-white">
                    {r.valuePerBblCrude === null ? 'not priced' : `$${r.valuePerBblCrude.toFixed(2)}`}
                  </td>
                </tr>
              ))}
              <tr>
                <td className="py-1.5 text-white font-semibold">Gross value</td>
                <td />
                <td className="py-1.5 text-right font-mono text-lime-300 font-bold">
                  ${slate.grossValuePerBbl.toFixed(2)}/bbl
                </td>
              </tr>
            </tbody>
          </table>
          {!slate.yieldsClose && (
            <p className="text-[11px] text-amber-300 mt-2">
              The yields total {(slate.yieldTotal * 100).toFixed(1)} percent, not 100. They do not
              account for the whole barrel, and the app reports that rather than normalising it away.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="text-sm font-semibold text-white mb-1">Against the supply scenarios</h3>
          <p className="text-[11px] text-slate-500 mb-2">
            The constraint that decides most of these projects, priced.
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left">
                <th className="py-1 text-slate-400 font-medium text-xs">Scenario</th>
                <th className="py-1 text-slate-400 font-medium text-xs text-right">Margin/bbl</th>
                <th className="py-1 text-slate-400 font-medium text-xs text-right">Payback</th>
              </tr>
            </thead>
            <tbody>
              {scenarioComparison.map((s) => (
                <tr key={s.id} className={`border-b border-slate-800/60 last:border-0 ${s.id === inputs.scenarioId ? 'bg-slate-800/40' : ''}`}>
                  <td className="py-1.5 text-slate-300">{s.name}</td>
                  <td className="py-1.5 text-right font-mono text-white">${s.grossMarginPerBbl.toFixed(2)}</td>
                  <td className="py-1.5 text-right font-mono text-slate-300">
                    {s.simplePaybackYears === null ? 'never' : `${s.simplePaybackYears.toFixed(1)} yr`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-slate-500 mt-2">
            Simple payback on the capital, undiscounted, which is the number a sponsor asks first.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="text-sm font-semibold text-white mb-1">Licensing</h3>
        <p className="text-[11px] text-amber-300/80 mb-3">
          A tracking aid and not legal advice. The sequence is the shape of the process; what each
          stage requires is set by the regulator and changes, so the regulator&apos;s current
          requirements govern.
        </p>
        <div className="space-y-2">
          {licensing.stages.map((s) => (
            <button
              key={s.id} type="button" onClick={() => toggleLicence(s.id)}
              className="w-full text-left flex items-start gap-3 rounded border border-slate-800 p-3 hover:bg-slate-800/40"
            >
              {s.complete
                ? <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                : <Circle className="w-4 h-4 text-slate-600 mt-0.5 shrink-0" />}
              <div>
                <p className="text-sm text-white">{s.stage}. {s.name}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{s.summary}</p>
                <p className="text-[11px] text-slate-500 mt-1">Typically needs: {s.typicalEvidence.join('; ')}.</p>
              </div>
            </button>
          ))}
        </div>
        {licensing.outOfOrder && (
          <p className="text-[11px] text-amber-300 mt-2 flex items-start gap-1">
            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
            A later stage is ticked while an earlier one is not. You cannot hold a construction
            licence without an establishment one, so this is probably a data-entry slip.
          </p>
        )}
        {licensing.nextStage && (
          <p className="text-[11px] text-slate-400 mt-2">Next: {licensing.nextStage.name}.</p>
        )}
      </div>
    </div>
  );
};

export default ScaleResults;
