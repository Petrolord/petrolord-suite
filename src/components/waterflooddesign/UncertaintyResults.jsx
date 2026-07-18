// Main area for the Uncertainty tab: percentile KPIs, the Np exceedance
// curve, the Spearman tornado, and rejection accounting for the last Monte
// Carlo run. Results are transient (never persisted); a stale banner appears
// when the working case changes after a run.
import React, { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  BarChart, Bar, Cell,
} from 'recharts';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useWaterfloodDesign } from '@/contexts/WaterfloodDesignContext';
import { ChartCard, Kpi, LINE, WarningBanner, fmt } from './primitives';

const axisProps = { stroke: CHART_COLORS.axisLine, tick: { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize } };
const tooltipProps = { contentStyle: TOOLTIP_STYLE, labelStyle: { color: CHART_COLORS.tooltipText }, itemStyle: { color: CHART_COLORS.tooltipText } };

const UncertaintyResults = () => {
  const { uncertaintyResult, uncertaintyStale, isRunningUncertainty } = useWaterfloodDesign();

  // Exceedance curve in the petroleum convention: P90 sits at 90% probability
  // of exceeding. basicStats' cdf is ascending "probability <= x".
  const exceedanceData = useMemo(() => {
    const cdf = uncertaintyResult?.stats?.np?.cdf;
    if (!cdf?.length) return [];
    return cdf.map((p) => ({ np: Number((p.x / 1000).toFixed(1)), exceed: Number((100 - p.y).toFixed(1)) }));
  }, [uncertaintyResult]);

  const tornadoData = useMemo(() => (
    (uncertaintyResult?.sensitivity || []).map((s) => ({
      label: s.label,
      rho: Number(s.rho.toFixed(3)),
      contribution: Number(s.contribution.toFixed(1)),
    }))
  ), [uncertaintyResult]);

  if (!uncertaintyResult) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-400">
        {isRunningUncertainty
          ? 'Monte Carlo run in progress. Results will appear here.'
          : 'Enable one or more uncertain parameters in the left panel and press Run. Each realization reruns the five-spot forecast with sampled inputs; results show the Np distribution and which inputs drive it.'}
      </div>
    );
  }

  const { stats, validCount, iterations, rejectedCount, rejectionReasons, btNeverCount, warnings } = uncertaintyResult;
  const np = stats.np || {};
  const rf = stats.rf || {};
  const bt = stats.btYears || {};
  const rejectionEntries = Object.entries(rejectionReasons || {});

  return (
    <div className="space-y-4 overflow-y-auto">
      {uncertaintyStale && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300 px-4 py-3 text-xs">
          Inputs or the uncertainty config changed after this run. The results below reflect the previous working case; press Run again to refresh.
        </div>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-6 gap-3">
        <Kpi title="Np P90 (low)" value={fmt.f1(np.p90 / 1000)} unit="Mstb" />
        <Kpi title="Np P50" value={fmt.f1(np.p50 / 1000)} unit="Mstb" accent />
        <Kpi title="Np P10 (high)" value={fmt.f1(np.p10 / 1000)} unit="Mstb" />
        <Kpi title="Np mean" value={fmt.f1(np.mean / 1000)} unit="Mstb" />
        <Kpi title="RF P50" value={fmt.pct(rf.p50)} />
        <Kpi title="Breakthrough P50" value={fmt.f1(bt.p50)} unit="yr" />
      </div>

      <WarningBanner warnings={warnings} />

      {validCount > 0 && (
        <div className="grid xl:grid-cols-2 gap-4">
          <ChartCard title="Cumulative oil exceedance curve">
            <LineChart data={exceedanceData} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis dataKey="np" {...axisProps} type="number" domain={['dataMin', 'dataMax']} label={{ value: 'Np (Mstb)', fill: CHART_COLORS.axisLabel, fontSize: 11, position: 'insideBottom', dy: 12 }} />
              <YAxis {...axisProps} domain={[0, 100]} label={{ value: 'P(exceed) %', angle: -90, fill: CHART_COLORS.axisLabel, fontSize: 11, position: 'insideLeft', dy: 30 }} />
              <Tooltip {...tooltipProps} formatter={(v, name) => [name === 'exceed' ? `${v}%` : v, name === 'exceed' ? 'P(exceed)' : name]} labelFormatter={(v) => `Np ${v} Mstb`} />
              {Number.isFinite(np.p90) && <ReferenceLine x={Number((np.p90 / 1000).toFixed(1))} stroke={LINE.tangent} strokeDasharray="4 4" label={{ value: 'P90', fill: LINE.tangent, fontSize: 11, position: 'top' }} />}
              {Number.isFinite(np.p50) && <ReferenceLine x={Number((np.p50 / 1000).toFixed(1))} stroke={LINE.ref} strokeDasharray="4 4" label={{ value: 'P50', fill: LINE.ref, fontSize: 11, position: 'top' }} />}
              {Number.isFinite(np.p10) && <ReferenceLine x={Number((np.p10 / 1000).toFixed(1))} stroke={LINE.oil} strokeDasharray="4 4" label={{ value: 'P10', fill: LINE.oil, fontSize: 11, position: 'top' }} />}
              <Line type="monotone" dataKey="exceed" name="P(exceed)" stroke={LINE.water} strokeWidth={2} dot={false} />
            </LineChart>
          </ChartCard>

          <ChartCard title="Sensitivity to Np (Spearman rank correlation)" height={Math.max(264, 48 + tornadoData.length * 34)}>
            <BarChart data={tornadoData} layout="vertical" margin={{ top: 8, right: 24, bottom: 4, left: 40 }}>
              <CartesianGrid {...GRID_STYLE} horizontal={false} />
              <XAxis type="number" domain={[-1, 1]} {...axisProps} tickFormatter={(v) => v.toFixed(1)} />
              <YAxis type="category" dataKey="label" width={120} {...axisProps} tick={{ fill: CHART_COLORS.axisText, fontSize: 10 }} />
              <Tooltip {...tooltipProps} formatter={(v, name, entry) => [`rho ${v} (${entry?.payload?.contribution}% of rank variance)`, entry?.payload?.label]} />
              <ReferenceLine x={0} stroke={CHART_COLORS.axisLine} />
              <Bar dataKey="rho" name="Spearman rho" isAnimationActive={false} barSize={18}>
                {tornadoData.map((d) => <Cell key={d.label} fill={d.rho >= 0 ? LINE.oil : LINE.ref} />)}
              </Bar>
            </BarChart>
          </ChartCard>
        </div>
      )}

      <div className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-xs text-slate-400 space-y-1">
        <p>
          {validCount.toLocaleString()} valid realizations of {iterations.toLocaleString()} sampled
          ({rejectedCount.toLocaleString()} rejected{btNeverCount > 0 ? `; ${btNeverCount.toLocaleString()} never reached breakthrough` : ''}).
          Percentiles follow the petroleum convention: P90 is the low case.
        </p>
        {rejectionEntries.map(([reason, count]) => (
          <p key={reason} className="text-slate-500">Rejected {count.toLocaleString()}: {reason}.</p>
        ))}
      </div>
    </div>
  );
};

export default UncertaintyResults;
