// Forecast tab: WHEN this well will load.
//
// This is the point of the studio. A loading number for today is
// surveillance. The reservoir pressure at which a well STARTS to load
// is a plan, and it is what a tubing change, a plunger or a compressor
// gets justified against. As the reservoir depletes the deliverability
// falls faster than the critical rate does, and the two curves cross.
//
// Each point is a nodal solve and a marched column, so this is an
// explicit run, marked stale when an input changes.
import React, { useMemo } from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import { Play, RefreshCw, CalendarClock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useGasWell } from '@/contexts/GasWellPerformanceContext';
import { Field, NumberInput, fmt, Stat } from './fields';

const COLOR = { rate: '#059669', critical: '#dc2626', crossing: '#d97706' };

const StaleNote = ({ onRerun }) => (
  <div className="flex items-center gap-2 text-[11px] text-amber-400 mb-2">
    <RefreshCw className="w-3 h-3" />
    Inputs changed since this ran.
    <button type="button" className="underline hover:text-amber-300" onClick={onRerun}>
      Run again
    </button>
  </div>
);

const ForecastPanel = () => {
  const { forecast, forecastStale, runForecast, isRunning, result } = useGasWell();

  const data = useMemo(() => (forecast?.points || [])
    .filter((p) => Number.isFinite(p.qMscfd) && Number.isFinite(p.criticalMscfd))
    .map((p) => ({
      prPsia: p.prPsia,
      qMscfd: p.qMscfd,
      criticalMscfd: p.criticalMscfd,
    })), [forecast]);

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-emerald-400" /> When this well will load
          {result && (
            <span className="text-xs font-normal text-slate-500">
              from {fmt(result.whp)} psia at the wellhead
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <Field label="From reservoir pressure (psia)"><NumberInput section="forecast" name="prFrom" /></Field>
          <Field label="Down to (psia)"><NumberInput section="forecast" name="prTo" /></Field>
          <Field label="Points"><NumberInput section="forecast" name="nPoints" /></Field>
          <Button onClick={runForecast} disabled={isRunning} className="h-9">
            <Play className="w-3.5 h-3.5 mr-1" /> Run forecast
          </Button>
        </div>

        {!forecast ? (
          <p className="text-sm text-slate-500 py-6 text-center">
            Each point is a full nodal solve and a marched gas column at that reservoir pressure, so
            it runs when you ask for it. The deliverability coefficients are held: this is the same
            well, depleted, not a different one.
          </p>
        ) : (
          <>
            {forecastStale && <StaleNote onRerun={runForecast} />}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-1">
              <Stat
                label="Starts loading at"
                value={forecast.crossingPrPsia ? fmt(forecast.crossingPrPsia) : 'not in range'}
                unit={forecast.crossingPrPsia ? 'psia' : ''}
                accent={forecast.crossingPrPsia ? 'text-amber-300' : 'text-emerald-400'}
                hint={forecast.crossingPrPsia
                  ? 'reservoir pressure where the rate falls to the critical rate'
                  : 'the well stays above its critical rate across this whole range'}
              />
              <Stat
                label="Rate there"
                value={forecast.crossingPrPsia && data.length
                  ? fmt(data.reduce((a, p) => (Math.abs(p.prPsia - forecast.crossingPrPsia)
                    < Math.abs(a.prPsia - forecast.crossingPrPsia) ? p : a), data[0]).qMscfd)
                  : '--'}
                unit="Mscf/d"
              />
              <Stat
                label="Today"
                value={result ? fmt(result.qMscfd) : '--'}
                unit="Mscf/d"
                hint={result ? `${fmt(result.loading.marginPct)} percent of margin` : null}
              />
            </div>

            {data.length > 1 && (
              <ChartFrame height={340} exportFilename="gas-well-loading-forecast">
                <ComposedChart data={data} margin={{ top: 8, right: 28, bottom: 12, left: 8 }}>
                  <CartesianGrid {...GRID_STYLE} />
                  <XAxis
                    type="number"
                    dataKey="prPsia"
                    reversed
                    domain={['dataMin', 'dataMax']}
                    stroke={CHART_COLORS.axisLine}
                    tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                    label={{
                      value: 'Reservoir pressure (psia), depleting to the right',
                      position: 'insideBottom', offset: -8,
                      fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                    }}
                  />
                  <YAxis
                    stroke={CHART_COLORS.axisLine}
                    tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                    label={{
                      value: 'Gas rate (Mscf/d)', angle: -90, position: 'insideLeft',
                      fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                    }}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={{ color: CHART_COLORS.tooltipText }}
                    itemStyle={{ color: CHART_COLORS.tooltipText }}
                    formatter={(v, name) => [`${Math.round(Number(v)).toLocaleString()} Mscf/d`, name]}
                    labelFormatter={(v) => `${Math.round(Number(v)).toLocaleString()} psia reservoir`}
                  />
                  <Legend wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText }} />
                  {forecast.crossingPrPsia && (
                    <ReferenceLine
                      x={forecast.crossingPrPsia}
                      stroke={COLOR.crossing}
                      strokeDasharray="4 4"
                      label={{ value: 'Loads here', position: 'top', fill: COLOR.crossing, fontSize: 10 }}
                    />
                  )}
                  <Line dataKey="qMscfd" name="Deliverability" stroke={COLOR.rate} strokeWidth={2.2} dot isAnimationActive={false} />
                  <Line dataKey="criticalMscfd" name="Critical rate" stroke={COLOR.critical} strokeWidth={2} strokeDasharray="5 4" dot isAnimationActive={false} />
                </ComposedChart>
              </ChartFrame>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                    <th className="text-left font-semibold px-3 py-2">Reservoir (psia)</th>
                    <th className="text-right font-semibold px-3 py-2">Deliverability (Mscf/d)</th>
                    <th className="text-right font-semibold px-3 py-2">Critical (Mscf/d)</th>
                    <th className="text-right font-semibold px-3 py-2">Margin</th>
                    <th className="text-left font-semibold px-3 py-2">State</th>
                  </tr>
                </thead>
                <tbody>
                  {forecast.points.map((p) => (
                    <tr key={p.prPsia} className="border-b border-slate-800/60 last:border-0">
                      <td className="px-3 py-2 text-slate-200">{fmt(p.prPsia)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                        {p.qMscfd == null ? '--' : fmt(p.qMscfd)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                        {p.criticalMscfd == null ? '--' : fmt(p.criticalMscfd)}
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums ${p.loaded ? 'text-red-400' : 'text-emerald-400'}`}>
                        {p.marginPct == null ? '--' : `${fmt(p.marginPct)} %`}
                      </td>
                      <td className={`px-3 py-2 text-[11px] ${p.loaded ? 'text-red-400' : 'text-emerald-400'}`}>
                        {p.reason || (p.loaded ? 'Loading' : 'Unloaded')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default ForecastPanel;
