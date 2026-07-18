// Main area for the Specialized tab: the classic straight-line plots with
// their fitted lines and answers (Horner or MDH semilog, sqrt-t, Cartesian
// PSS for drawdowns).
import React, { useMemo } from 'react';
import { ComposedChart, Scatter, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { CHART_COLORS, CHART_TYPOGRAPHY, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useWellTestStudio } from '@/contexts/WellTestStudioContext';
import { hornerTime } from '@/utils/welltest/superposition';
import { ChartCard, Kpi, LINE, WarningBanner, fmt, logTicks, logTickFormatter } from './primitives';

const axisProps = { stroke: CHART_COLORS.axisLine, tick: { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize } };
const tooltipProps = { contentStyle: TOOLTIP_STYLE, labelStyle: { color: CHART_COLORS.tooltipText }, itemStyle: { color: CHART_COLORS.tooltipText } };
const legendProps = { wrapperStyle: { fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText } };

const SpecializedResults = () => {
  const { prepared, configSpec, semilogResult, sqrtResult, pssResult } = useWellTestStudio();
  const isBuildup = configSpec.config?.testType === 'buildup';
  const tp = configSpec.config?.tp;

  const semilogData = useMemo(() => {
    if (!prepared.points.length) return [];
    return prepared.points
      .map((p) => {
        const x = isBuildup ? hornerTime(tp, p.time) : p.time;
        if (!(x > 0)) return null;
        const fitted = semilogResult
          ? (isBuildup
              ? semilogResult.pStar - semilogResult.m * Math.log10(x)
              : semilogResult.p1hr - semilogResult.m * Math.log10(x))
          : null;
        return { x, pressure: Number(p.p.toFixed(2)), fitted: fitted != null ? Number(fitted.toFixed(2)) : null };
      })
      .filter(Boolean)
      .sort((a, b) => a.x - b.x);
  }, [prepared, isBuildup, tp, semilogResult]);

  const sqrtData = useMemo(
    () => prepared.points.map((p) => ({
      x: Number(Math.sqrt(p.time).toPrecision(4)),
      dp: Number(p.dp.toFixed(2)),
      fitted: sqrtResult ? Number((sqrtResult.intercept + sqrtResult.slope * Math.sqrt(p.time)).toFixed(2)) : null,
    })),
    [prepared, sqrtResult],
  );

  if (!prepared.points.length) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-900 px-6 py-10 text-center">
        <p className="text-slate-300 font-medium">No analysis data yet.</p>
        <p className="text-sm text-slate-500 mt-1">Load gauge data on the Data tab first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 overflow-y-auto">
      {!semilogResult && <WarningBanner warnings={['The semilog line needs valid reservoir inputs and at least 4 points in the window.']} />}

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        <Kpi title="Slope m" value={fmt.f1(semilogResult?.m)} unit="psi/cycle" />
        <Kpi title="Permeability k" value={fmt.sig3(semilogResult?.k)} unit="md" accent />
        <Kpi title="Skin" value={fmt.f2(semilogResult?.skin)} />
        <Kpi title={isBuildup ? 'p*' : 'p at 1 hr'} value={fmt.f1(isBuildup ? semilogResult?.pStar : semilogResult?.p1hr)} unit="psi" />
        <Kpi title="Fit r²" value={fmt.f3(semilogResult?.r2)} />
      </div>

      <ChartCard title={isBuildup ? 'Horner plot' : 'MDH semilog plot'} height={320}>
        <ComposedChart data={semilogData} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
          <XAxis
            dataKey="x" type="number" scale="log" domain={['auto', 'auto']} reversed={isBuildup}
            ticks={logTicks(semilogData.map((d) => d.x))} tickFormatter={logTickFormatter} {...axisProps}
            label={{ value: isBuildup ? 'Horner time ratio (tp + Δt)/Δt' : 'Elapsed time (hr)', position: 'insideBottom', offset: -10, fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
          />
          <YAxis domain={['auto', 'auto']} {...axisProps}
            label={{ value: 'Pressure (psi)', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
          <Tooltip {...tooltipProps} />
          <Legend {...legendProps} />
          <Scatter dataKey="pressure" name={isBuildup ? 'pws' : 'pwf'} fill={LINE.dp} isAnimationActive={false} />
          {semilogResult && <Line type="monotone" dataKey="fitted" name="Straight line" stroke={LINE.fit} dot={false} strokeWidth={2} isAnimationActive={false} />}
        </ComposedChart>
      </ChartCard>

      <ChartCard title="Linear flow: Δp vs sqrt(t)" height={260}>
        <ComposedChart data={sqrtData} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
          <XAxis dataKey="x" type="number" domain={['auto', 'auto']} {...axisProps}
            label={{ value: 'sqrt(t) (hr^0.5)', position: 'insideBottom', offset: -10, fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
          <YAxis domain={['auto', 'auto']} {...axisProps}
            label={{ value: 'Δp (psi)', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
          <Tooltip {...tooltipProps} />
          <Legend {...legendProps} />
          <Scatter dataKey="dp" name="Δp" fill={LINE.dp} isAnimationActive={false} />
          {sqrtResult && <Line type="monotone" dataKey="fitted" name={`Fit (slope ${fmt.f2(sqrtResult.slope)} psi/hr^0.5)`} stroke={LINE.fit} dot={false} strokeWidth={2} isAnimationActive={false} />}
        </ComposedChart>
      </ChartCard>

      {!isBuildup && (
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Pseudo-steady state (Cartesian)</p>
          {pssResult ? (
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
              <Kpi title="Slope m*" value={fmt.f3(pssResult.mStar)} unit="psi/hr" />
              <Kpi title="Connected pore volume" value={fmt.f2(pssResult.poreVolumeMMbbl)} unit="MMbbl" accent />
              <Kpi title="Fit r²" value={fmt.f3(pssResult.r2)} />
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Set a PSS window over the late-time linear decline (only meaningful once the closed system is felt).
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default SpecializedResults;
