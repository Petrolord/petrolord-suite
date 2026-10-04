// Main area for the Match tab: log-log match plot with the model overlay,
// pressure-history overlay and the regression result with confidence
// intervals.
import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { CHART_COLORS, CHART_TYPOGRAPHY, PINNED_TOOLTIP_PROPS, LEGEND_PROPS, XAXIS_LABEL_HEIGHT } from '@/utils/chartTheme';
import { useWellTestStudio } from '@/contexts/WellTestStudioContext';
import { buildLoglogData } from '@/utils/welltest/plotData';
import { unitLabel, fromOilfield, kindForCatalogUnit } from '@/utils/welltest/units';
import { ChartCard, Kpi, LINE, WarningBanner, fmt, fmtU } from './primitives';
import LogLogChart from './LogLogChart';
import { EMPTY_VALUE } from '@/lib/emptyValue';

const axisProps = { stroke: CHART_COLORS.axisLine, tick: { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize } };
// Pinned to the top-right corner of the plot (owner directive 2026-09-08).
const tooltipProps = PINNED_TOOLTIP_PROPS;
const legendProps = LEGEND_PROPS;

const ci = (pair, digits = 3) =>
  Array.isArray(pair) && pair.every(Number.isFinite)
    ? `${Number(pair[0]).toPrecision(digits)} to ${Number(pair[1]).toPrecision(digits)}`
    : EMPTY_VALUE;

const MatchResults = () => {
  const {
    loglog, modelSeries, prepared, matchParams, model,
    reservoirSpec, configSpec, fitResult, fitStale, matchKpis, matchMethod,
    unitSystem, pseudoTime, historyMatch,
  } = useWellTestStudio();
  const dpKind = reservoirSpec.reservoir?.fluid === 'gas' ? 'pseudoPressure' : 'pressure';

  // Pressure-history overlay: the context's historyMatch (plotData
  // buildHistoryMatch), the same series the PDF report draws. The period
  // before a shut-in is left to the report; this card shows the analysed one.
  const historyOverlay = useMemo(
    () => historyMatch.points.filter((p) => !p.prior),
    [historyMatch],
  );

  if (!loglog.length) {
    return (
      <div className="rounded-lg border border-pl-border bg-pl-surface px-6 py-10 text-center">
        <p className="text-pl-text font-medium">Nothing to match yet.</p>
        <p className="text-sm text-pl-muted mt-1">Load gauge data on the Data tab first.</p>
      </div>
    );
  }

  const timeName = pseudoTime.active ? 'pseudo-time' : 'time';
  const xLabel = configSpec.config?.family === 'buildup'
    ? `Agarwal equivalent ${timeName} (hr)`
    : `Elapsed ${timeName} (hr)`;
  const isGas = reservoirSpec.reservoir?.fluid === 'gas';
  // display-unit series from the shared builder (the PDF log-log uses it too)
  const ll = buildLoglogData({ loglog, modelSeries, dpKind, unitSystem });
  const displayLoglog = ll.points;
  const displayModel = ll.model || undefined;

  return (
    <div className="space-y-4 overflow-y-auto">
      {!matchParams && <WarningBanner warnings={['Enter valid match parameters in the left rail to overlay the model.']} />}
      {fitResult && fitStale && (
        <WarningBanner warnings={['Inputs changed since the last auto-fit; its confidence intervals refer to the previous data. Re-run the fit.']} />
      )}

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        <Kpi title="Permeability k" value={fmt.sig3(matchParams?.k)} unit="md" accent />
        <Kpi title="Skin" value={prepared.skinWithheld ? 'withheld' : fmt.f2(matchParams?.skin)} />
        <Kpi title="Storage C" value={fmtU('storage', matchParams?.C, unitSystem, fmt.sig3)} unit={unitLabel('storage', unitSystem)} />
        <Kpi title="kh" value={fmtU('kh', matchKpis?.kh, unitSystem, fmt.sig3)} unit={unitLabel('kh', unitSystem)} />
        <Kpi title="CD" value={fmt.sig3(matchKpis?.cd)} />
      </div>

      <ChartCard title="Log-log match" height={360}>
        <LogLogChart loglog={displayLoglog} modelSeries={displayModel} xLabel={xLabel} yLabel={`${isGas ? 'Δm(p)' : 'Δp'} and derivative (${unitLabel(dpKind, unitSystem)})`} />
      </ChartCard>

      <ChartCard title="Pressure history overlay" height={240}>
        <LineChart data={historyOverlay} margin={{ top: 10, right: 20, bottom: 8, left: 10 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
          <XAxis height={XAXIS_LABEL_HEIGHT} dataKey="time" type="number" domain={['auto', 'auto']} {...axisProps}
            label={{ value: xLabel.replace('Agarwal equivalent', 'Shut-in'), position: 'insideBottom', offset: 0, fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
          <YAxis domain={['auto', 'auto']} {...axisProps}
            label={{ value: `Pressure (${unitLabel('pressure', unitSystem)})`, angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
          <Tooltip {...tooltipProps} />
          <Legend {...legendProps} />
          <Line type="monotone" dataKey="observed" name="Gauge" stroke={LINE.pressure} dot={{ r: 2 }} strokeWidth={1} isAnimationActive={false} />
          <Line type="monotone" dataKey="model" name="Model" stroke={LINE.model} dot={false} strokeWidth={2} isAnimationActive={false} connectNulls />
        </LineChart>
      </ChartCard>

      {fitResult && (
        <div className="rounded-lg border border-pl-border bg-pl-surface p-4">
          <p className="text-xs font-semibold text-pl-muted uppercase tracking-wider mb-2">
            {matchMethod?.kind === 'regression'
              ? `Regression result ${fitResult.converged ? '(converged)' : '(stopped early)'}`
              : 'Last auto-fit (not the working match)'}
          </p>
          {matchMethod?.kind !== 'regression' && matchMethod?.note && (
            <p className="text-[11px] text-pl-muted mb-2" data-testid="wts-fit-superseded">
              {matchMethod.note} The working match is reported as a manual match, without regression status or confidence intervals.
            </p>
          )}
          <table className="w-full text-xs">
            <thead>
              <tr className="text-pl-muted text-left">
                <th className="py-1 font-medium">Parameter</th>
                <th className="py-1 font-medium">Value</th>
                <th className="py-1 font-medium">95% confidence</th>
              </tr>
            </thead>
            <tbody className="text-pl-text">
              {model.parameters.map((meta) => {
                const kind = kindForCatalogUnit(meta.unit);
                const uv = (v) => fromOilfield(kind, v, unitSystem);
                const label = unitLabel(kind, unitSystem) || meta.unit;
                const pair = fitResult.confidence95[meta.key];
                return (
                  <tr key={meta.key} className="border-t border-pl-border">
                    <td className="py-1">{meta.label} ({label})</td>
                    <td className="py-1">{meta.logScale ? fmt.sig3(uv(fitResult.params[meta.key])) : fmt.f2(uv(fitResult.params[meta.key]))}</td>
                    <td className="py-1">{ci(Array.isArray(pair) ? pair.map(uv) : pair)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-[11px] text-pl-muted mt-2">
            {fitResult.iterations} iterations, residual sum of squares {fmt.sci(fitResult.ssr)} (log-space pressure + derivative).
          </p>
        </div>
      )}
    </div>
  );
};

export default MatchResults;
