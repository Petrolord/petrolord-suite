// Performance tab: what the well makes across a range of pumping
// speeds, and what the rods and the gearbox pay for it.
//
// Every point is a full wave-equation solve marched to a repeating
// stroke, so this is an explicit run, marked stale the moment an input
// changes. It is the curve a designer actually uses: the fastest speed
// is rarely the right one, because rod loading and torque climb faster
// than production does.
import React, { useMemo } from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import { Play, RefreshCw, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useRodPump } from '@/contexts/RodPumpDesignContext';
import { Field, NumberInput, fmt } from './fields';

const COLOR = { rate: '#059669', loading: '#dc2626', torque: '#d97706' };

const StaleNote = ({ onRerun }) => (
  <div className="flex items-center gap-2 text-[11px] text-amber-400 mb-2">
    <RefreshCw className="w-3 h-3" />
    Inputs changed since this ran.
    <button type="button" className="underline hover:text-amber-300" onClick={onRerun}>
      Run again
    </button>
  </div>
);

const SpeedSweepPanel = () => {
  const { sweep, sweepStale, runSweep, isRunning, design } = useRodPump();

  const data = useMemo(() => (sweep?.points || [])
    .filter((p) => p.ok)
    .map((p) => ({
      spm: p.spm,
      producedBpd: p.producedBpd,
      loadingPct: p.loadingPct,
      peakTorqueInLb: p.peakTorqueInLb,
    })), [sweep]);

  const refused = (sweep?.points || []).filter((p) => !p.ok);

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-400" /> Production against pumping speed
          {design && (
            <span className="text-xs font-normal text-slate-500">
              designed at {fmt(design.spm, 1)} spm
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <Field label="Slowest (spm)"><NumberInput section="sweep" name="minSpm" step="0.5" /></Field>
          <Field label="Fastest (spm)"><NumberInput section="sweep" name="maxSpm" step="0.5" /></Field>
          <Field label="Points"><NumberInput section="sweep" name="nPoints" /></Field>
          <Button onClick={runSweep} disabled={isRunning} className="h-9">
            <Play className="w-3.5 h-3.5 mr-1" /> Run sweep
          </Button>
        </div>

        {!sweep ? (
          <p className="text-sm text-slate-500 py-6 text-center">
            Each point here is a full wave-equation solve marched to a repeating stroke, so it runs
            when you ask for it.
          </p>
        ) : (
          <>
            {sweepStale && <StaleNote onRerun={runSweep} />}
            {data.length > 0 && (
              <ChartFrame height={340} exportFilename="rod-pump-speed-sweep">
                <ComposedChart data={data} margin={{ top: 8, right: 34, bottom: 12, left: 8 }}>
                  <CartesianGrid {...GRID_STYLE} />
                  <XAxis
                    type="number"
                    dataKey="spm"
                    domain={['dataMin', 'dataMax']}
                    stroke={CHART_COLORS.axisLine}
                    tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                    label={{
                      value: 'Pumping speed (spm)', position: 'insideBottom', offset: -8,
                      fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                    }}
                  />
                  <YAxis
                    yAxisId="rate"
                    stroke={CHART_COLORS.axisLine}
                    tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                    label={{
                      value: 'Production (bbl/d)', angle: -90, position: 'insideLeft',
                      fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                    }}
                  />
                  <YAxis
                    yAxisId="pct"
                    orientation="right"
                    stroke={CHART_COLORS.axisLine}
                    tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                    label={{
                      value: 'Rod loading (%)', angle: 90, position: 'insideRight',
                      fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                    }}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={{ color: CHART_COLORS.tooltipText }}
                    itemStyle={{ color: CHART_COLORS.tooltipText }}
                    formatter={(value, name) => [
                      name === 'Rod loading' ? `${Number(value).toFixed(1)} %` : `${Math.round(Number(value)).toLocaleString()}`,
                      name,
                    ]}
                    labelFormatter={(v) => `${Number(v).toFixed(1)} spm`}
                  />
                  <Legend wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText }} />
                  <ReferenceLine yAxisId="pct" y={100} stroke={COLOR.loading} strokeDasharray="4 4" label={{ value: 'Goodman limit', position: 'insideTopRight', fill: COLOR.loading, fontSize: 10 }} />
                  <Line yAxisId="rate" dataKey="producedBpd" name="Production" stroke={COLOR.rate} strokeWidth={2.2} dot isAnimationActive={false} />
                  <Line yAxisId="pct" dataKey="loadingPct" name="Rod loading" stroke={COLOR.loading} strokeWidth={1.8} strokeDasharray="5 4" dot isAnimationActive={false} />
                </ComposedChart>
              </ChartFrame>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                    <th className="text-left font-semibold px-3 py-2">Speed (spm)</th>
                    <th className="text-right font-semibold px-3 py-2">Production (bbl/d)</th>
                    <th className="text-right font-semibold px-3 py-2">Plunger stroke (in)</th>
                    <th className="text-right font-semibold px-3 py-2">Peak load (lb)</th>
                    <th className="text-right font-semibold px-3 py-2">Peak torque (in-lb)</th>
                    <th className="text-right font-semibold px-3 py-2">Rod loading</th>
                  </tr>
                </thead>
                <tbody>
                  {sweep.points.map((p) => (
                    <tr key={p.spm} className="border-b border-slate-800/60 last:border-0">
                      <td className="px-3 py-2 text-slate-200">{fmt(p.spm, 1)}</td>
                      {p.ok ? (
                        <>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-300">{fmt(p.producedBpd, 1)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-300">{fmt(p.plungerStrokeIn, 1)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-300">{fmt(p.pprlLb)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-300">{fmt(p.peakTorqueInLb)}</td>
                          <td className={`px-3 py-2 text-right tabular-nums ${p.loadingPct > 100 ? 'text-red-400' : 'text-slate-300'}`}>
                            {fmt(p.loadingPct, 1)} %
                          </td>
                        </>
                      ) : (
                        <td colSpan={5} className="px-3 py-2 text-[11px] text-amber-300">{p.reason}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {refused.length > 0 && (
              <p className="text-[11px] text-slate-600">
                {refused.length} speed{refused.length === 1 ? '' : 's'} could not be designed and
                are listed with the reason rather than dropped from the curve.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default SpeedSweepPanel;
