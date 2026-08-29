// The abatement curve and the decarbonisation path (DS9).
import React from 'react';
import { AlertTriangle, TrendingDown } from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, Cell as BarCell,
} from 'recharts';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useCarbonAbatement } from '@/contexts/CarbonAbatementContext';

const fmt = (v, dp = 1) => (Number.isFinite(v)
  ? v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })
  : 'n/a');

const Stat = ({ label, value, hint }) => (
  <div className="rounded border border-slate-800 bg-slate-900/60 p-3">
    <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
    <p className="text-lg font-semibold text-white">{value}</p>
    {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
  </div>
);

const AbatementResults = () => {
  const { curve, path, costedMeasures, targetTonnes } = useCarbonAbatement();
  const tick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };
  const broken = costedMeasures.filter((m) => m.error);

  return (
    <div className="space-y-5">
      {broken.length > 0 && (
        <div className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
          <div>
            {broken.map((m) => <p key={m.error} className="text-sm text-amber-100">{m.error}</p>)}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total abatement" value={`${fmt(curve.totalAbatementTonnes, 0)} t/yr`} />
        <Stat label="Pays for itself" value={`${fmt(curve.paysForItselfTonnes, 0)} t/yr`}
          hint={curve.paysForItselfMeasures.length ? curve.paysForItselfMeasures.join(', ') : 'none'} />
        <Stat label="Net annual cost" value={fmt(curve.netAnnualCostOfAll, 0)}
          hint={`${fmt(curve.weightedAverageCostPerTonne, 1)} per tonne on average`} />
        <Stat label="Against the target"
          value={targetTonnes === null ? 'no target' : curve.meetsTarget ? 'met' : `${fmt(curve.residualToTargetTonnes, 0)} t short`}
          hint={targetTonnes === null ? null : `target ${fmt(targetTonnes, 0)} t/yr`} />
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white mb-1">The marginal abatement cost curve</h3>
        <p className="text-[11px] text-slate-500 mb-2">
          Cheapest first. Bars below the line pay for themselves and abate carbon as a side effect,
          and they are usually the ones nobody has done. Capital is annualised over each measure&apos;s
          life, because comparing a one-off capital cost against a recurring saving makes every
          measure look expensive.
        </p>
        <ChartFrame height={300} exportFilename="abatement-cost-curve">
          <BarChart data={curve.steps} margin={{ top: 12, right: 24, left: 24, bottom: 40 }}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis dataKey="label" stroke={CHART_COLORS.axisLine} tick={tick} interval={0} angle={-15} textAnchor="end" height={70} />
            <YAxis stroke={CHART_COLORS.axisLine} tick={tick}
              label={{ value: 'cost per tonne', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
            <Tooltip {...TOOLTIP_STYLE} formatter={(v) => fmt(v, 1)} />
            <ReferenceLine y={0} stroke={CHART_COLORS.axisLine} />
            <Bar dataKey="costPerTonne" name="Cost per tonne">
              {curve.steps.map((s) => (
                <BarCell key={s.label} fill={s.paysForItself ? '#059669' : '#dc2626'} />
              ))}
            </Bar>
          </BarChart>
        </ChartFrame>
        <div className="overflow-x-auto rounded border border-slate-800 mt-3">
          <table className="w-full text-xs">
            <thead className="bg-slate-900/80 text-slate-400">
              <tr>
                <th className="text-left px-2 py-1.5">Measure</th>
                <th className="text-right px-2 py-1.5">tCO2e/yr</th>
                <th className="text-right px-2 py-1.5">Cumulative</th>
                <th className="text-right px-2 py-1.5">Cost/tonne</th>
                <th className="text-left px-2 py-1.5">Acts on</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {curve.steps.map((s) => (
                <tr key={s.label}>
                  <td className="px-2 py-1 text-slate-200">{s.label}</td>
                  <td className="px-2 py-1 text-right text-slate-300">{fmt(s.tonnesAbatedPerYear, 0)}</td>
                  <td className="px-2 py-1 text-right text-slate-400">{fmt(s.cumulativeEndTonnes, 0)}</td>
                  <td className={`px-2 py-1 text-right ${s.paysForItself ? 'text-emerald-300' : 'text-white'}`}>
                    {fmt(s.costPerTonne, 1)}
                  </td>
                  <td className="px-2 py-1 text-slate-500">{(s.actsOn || []).join(', ') || 'unnamed'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {curve.interactions.length > 0 && (
        <div className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-white">These measures are not additive</p>
            <ul className="text-sm text-amber-100 mt-1 list-disc pl-4">
              {curve.interactions.map((i) => (
                <li key={i.sourceId}>{`${i.measures.join(' and ')} both act on ${i.sourceId}.`}</li>
              ))}
            </ul>
            <p className="text-[11px] text-amber-200/90 mt-1">{curve.interactionNote}</p>
          </div>
        </div>
      )}

      {curve.overClaims.length > 0 && (
        <div className="rounded-lg border border-red-800/60 bg-red-950/30 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-white">More abatement is claimed than the source emits</p>
            {curve.overClaims.map((o) => (
              <p key={o.sourceId} className="text-sm text-red-100 mt-1">
                {`${o.measures.join(' and ')} claim ${fmt(o.claimedTonnes, 0)} t against ${o.sourceId}, which emits ${fmt(o.emittedTonnes, 0)} t.`}
              </p>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
          <TrendingDown className="w-4 h-4 text-emerald-400" /> The path
        </h3>
        {path.error ? <p className="text-sm text-amber-300">{path.error}</p> : (
          <>
            <p className="text-[11px] text-slate-500 mb-2">
              Each measure counts only from the year it starts.
              {path.gapNote ? ` ${path.gapNote}` : ' The identified measures reach the target every year.'}
            </p>
            <ChartFrame height={280} exportFilename="decarbonisation-path">
              <LineChart data={path.rows} margin={{ top: 12, right: 24, left: 24, bottom: 28 }}>
                <CartesianGrid {...GRID_STYLE} />
                <XAxis dataKey="year" stroke={CHART_COLORS.axisLine} tick={tick} />
                <YAxis stroke={CHART_COLORS.axisLine} tick={tick}
                  label={{ value: 'tCO2e/yr', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v) => `${fmt(v, 0)} t`} />
                <Legend verticalAlign="top" wrapperStyle={{ fontSize: '12px' }} />
                <Line type="monotone" dataKey="emissionsTonnes" name="With identified measures" stroke="#0891b2" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="targetTonnes" name="Target" stroke="#dc2626" strokeWidth={2} strokeDasharray="5 5" dot={false} />
              </LineChart>
            </ChartFrame>
            {path.firstShortfallYear !== null && (
              <p className="text-[11px] text-amber-300 mt-1">
                {`The plan first falls short of the target in ${path.firstShortfallYear}, and the final gap is ${fmt(path.finalGapTonnes, 0)} tCO2e a year with no measure identified for it.`}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AbatementResults;
