// Main area for the Match tab: log-log match plot with the model overlay,
// pressure-history overlay and the regression result with confidence
// intervals.
import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { CHART_COLORS, CHART_TYPOGRAPHY, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useWellTestStudio } from '@/contexts/WellTestStudioContext';
import { evaluateModelTest } from '@/utils/welltest/models/modelCatalog';
import { ChartCard, Kpi, LINE, WarningBanner, fmt } from './primitives';
import LogLogChart from './LogLogChart';

const axisProps = { stroke: CHART_COLORS.axisLine, tick: { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize } };
const tooltipProps = { contentStyle: TOOLTIP_STYLE, labelStyle: { color: CHART_COLORS.tooltipText }, itemStyle: { color: CHART_COLORS.tooltipText } };
const legendProps = { wrapperStyle: { fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText } };

const ci = (pair, digits = 3) =>
  Array.isArray(pair) && pair.every(Number.isFinite)
    ? `${Number(pair[0]).toPrecision(digits)} to ${Number(pair[1]).toPrecision(digits)}`
    : '—';

const MatchResults = () => {
  const {
    loglog, modelSeries, prepared, matchParams, model,
    reservoirSpec, configSpec, fitResult, fitStale, derivedKpis,
  } = useWellTestStudio();

  // Pressure-history overlay: observed gauge pressure and the model pressure
  // at the same times.
  const historyOverlay = useMemo(() => {
    if (!prepared.points.length) return [];
    let modelP = null;
    if (matchParams && reservoirSpec.reservoir && configSpec.config) {
      try {
        const cfg = configSpec.config;
        const times = prepared.points.map((p) => p.time);
        const series = evaluateModelTest({
          testType: cfg.testType, model, params: matchParams,
          reservoir: reservoirSpec.reservoir, tp: cfg.tp, times, dts: times,
        });
        modelP = series.map((s) => (cfg.testType === 'buildup' ? s.pws : s.pw));
      } catch (e) {
        console.error(e);
      }
    }
    return prepared.points.map((p, i) => ({
      time: Number(p.time.toPrecision(4)),
      observed: Number(p.p.toFixed(2)),
      model: modelP && Number.isFinite(modelP[i]) ? Number(modelP[i].toFixed(2)) : null,
    }));
  }, [prepared, matchParams, model, reservoirSpec, configSpec]);

  if (!loglog.length) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-900 px-6 py-10 text-center">
        <p className="text-slate-300 font-medium">Nothing to match yet.</p>
        <p className="text-sm text-slate-500 mt-1">Load gauge data on the Data tab first.</p>
      </div>
    );
  }

  const xLabel = configSpec.config?.testType === 'buildup' ? 'Agarwal equivalent time (hr)' : 'Elapsed time (hr)';

  return (
    <div className="space-y-4 overflow-y-auto">
      {!matchParams && <WarningBanner warnings={['Enter valid match parameters in the left rail to overlay the model.']} />}
      {fitResult && fitStale && (
        <WarningBanner warnings={['Inputs changed since the last auto-fit; its confidence intervals refer to the previous data. Re-run the fit.']} />
      )}

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        <Kpi title="Permeability k" value={fmt.sig3(matchParams?.k)} unit="md" accent />
        <Kpi title="Skin" value={fmt.f2(matchParams?.skin)} />
        <Kpi title="Storage C" value={fmt.sig3(matchParams?.C)} unit="bbl/psi" />
        <Kpi title="kh" value={fmt.sig3(derivedKpis?.kh)} unit="md·ft" />
        <Kpi title="CD" value={fmt.sig3(derivedKpis?.cd)} />
      </div>

      <ChartCard title="Log-log match" height={360}>
        <LogLogChart loglog={loglog} modelSeries={modelSeries || undefined} xLabel={xLabel} />
      </ChartCard>

      <ChartCard title="Pressure history overlay" height={240}>
        <LineChart data={historyOverlay} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
          <XAxis dataKey="time" type="number" domain={['auto', 'auto']} {...axisProps}
            label={{ value: xLabel.replace('Agarwal equivalent', 'Shut-in'), position: 'insideBottom', offset: -10, fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
          <YAxis domain={['auto', 'auto']} {...axisProps}
            label={{ value: 'Pressure (psi)', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
          <Tooltip {...tooltipProps} />
          <Legend {...legendProps} />
          <Line type="monotone" dataKey="observed" name="Gauge" stroke={LINE.pressure} dot={{ r: 2 }} strokeWidth={1} isAnimationActive={false} />
          <Line type="monotone" dataKey="model" name="Model" stroke={LINE.model} dot={false} strokeWidth={2} isAnimationActive={false} connectNulls />
        </LineChart>
      </ChartCard>

      {fitResult && (
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Regression result {fitResult.converged ? '(converged)' : '(stopped early)'}
          </p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 text-left">
                <th className="py-1 font-medium">Parameter</th>
                <th className="py-1 font-medium">Value</th>
                <th className="py-1 font-medium">95% confidence</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              {model.parameters.map((meta) => (
                <tr key={meta.key} className="border-t border-slate-800">
                  <td className="py-1">{meta.label} ({meta.unit})</td>
                  <td className="py-1">{meta.logScale ? fmt.sig3(fitResult.params[meta.key]) : fmt.f2(fitResult.params[meta.key])}</td>
                  <td className="py-1">{ci(fitResult.confidence95[meta.key])}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-slate-500 mt-2">
            {fitResult.iterations} iterations, residual sum of squares {fmt.sci(fitResult.ssr)} (log-space pressure + derivative).
          </p>
        </div>
      )}
    </div>
  );
};

export default MatchResults;
