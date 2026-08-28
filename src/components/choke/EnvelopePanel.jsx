// Performance tab: the operating envelope across bean sizes.
//
// The curve the studio exists to draw. Each point is a full nodal solve
// with the bean as the surface constraint, so it is an explicit run.
// Where the flow stops being critical is marked, because past there the
// correlation does not apply and the bean has stopped controlling the
// well: opening further buys much less than the curve alone suggests.
import React, { useMemo } from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import { Play, RefreshCw, TrendingUp, Crosshair } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useChoke } from '@/contexts/ChokePerformanceContext';
import { Field, NumberInput, fmt } from './fields';

const COLOR = { rate: '#059669', pwh: '#2563eb', limit: '#d97706' };

const StaleNote = ({ onRerun }) => (
  <div className="flex items-center gap-2 text-[11px] text-amber-400 mb-2">
    <RefreshCw className="w-3 h-3" />
    Inputs changed since this ran.
    <button type="button" className="underline hover:text-amber-300" onClick={onRerun}>
      Run again
    </button>
  </div>
);

const EnvelopePanel = () => {
  const {
    envelope, envelopeStale, runEnvelope, isRunning, sizeForTarget, model, result,
  } = useChoke();
  const isGas = model?.phase === 'gas';
  const rateUnit = isGas ? 'Mscf/d' : 'stb/d';

  const data = useMemo(() => (envelope?.points || [])
    .filter((p) => p.ok)
    .map((p) => ({ s64: p.s64, q: p.q, pwh: p.pwh, critical: p.critical })), [envelope]);

  return (
    <div className="space-y-4">
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" /> What every bean size makes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
            <Field label="Smallest (64ths)"><NumberInput section="envelope" name="minS64" /></Field>
            <Field label="Largest (64ths)"><NumberInput section="envelope" name="maxS64" /></Field>
            <Field label="Points"><NumberInput section="envelope" name="nPoints" /></Field>
            <Button onClick={runEnvelope} disabled={isRunning} className="h-9">
              <Play className="w-3.5 h-3.5 mr-1" /> Run envelope
            </Button>
          </div>

          {!isGas && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end border-t border-slate-800 pt-3">
              <Field
                label={`Target rate (${rateUnit})`}
                hint="Solved against the nodal point, not by inverting the correlation at a guessed wellhead pressure."
              >
                <NumberInput section="envelope" name="targetQ" />
              </Field>
              <Button variant="outline" onClick={sizeForTarget} className="h-9">
                <Crosshair className="w-3.5 h-3.5 mr-1" /> Size the bean
              </Button>
            </div>
          )}

          {!envelope ? (
            <p className="text-sm text-slate-500 py-6 text-center">
              Each bean size is a full nodal solve with the choke as the surface constraint, so this
              runs when you ask for it.
            </p>
          ) : (
            <>
              {envelopeStale && <StaleNote onRerun={runEnvelope} />}
              {envelope.limit ? (
                <p className="text-[11px] text-amber-300">
                  Flow stops being critical between {envelope.limit.lastCriticalS64}/64 and{' '}
                  {envelope.limit.firstSubcriticalS64}/64, at about{' '}
                  {fmt(envelope.limit.rateAtLimit)} {rateUnit}. Past there the bean has stopped
                  setting the rate and the correlation no longer applies, so opening further buys
                  much less than the curve on its own suggests.
                </p>
              ) : (
                <p className="text-[11px] text-emerald-400">
                  Every bean in this range stays in critical flow.
                </p>
              )}

              {data.length > 1 && (
                <ChartFrame height={360} exportFilename="choke-operating-envelope">
                  <ComposedChart data={data} margin={{ top: 8, right: 34, bottom: 12, left: 8 }}>
                    <CartesianGrid {...GRID_STYLE} />
                    <XAxis
                      type="number"
                      dataKey="s64"
                      domain={['dataMin', 'dataMax']}
                      stroke={CHART_COLORS.axisLine}
                      tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                      label={{
                        value: 'Bean size (64ths of an inch)', position: 'insideBottom', offset: -8,
                        fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                      }}
                    />
                    <YAxis
                      yAxisId="rate"
                      stroke={CHART_COLORS.axisLine}
                      tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                      label={{
                        value: `Rate (${rateUnit})`, angle: -90, position: 'insideLeft',
                        fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                      }}
                    />
                    <YAxis
                      yAxisId="pwh"
                      orientation="right"
                      stroke={CHART_COLORS.axisLine}
                      tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                      label={{
                        value: 'Wellhead pressure (psia)', angle: 90, position: 'insideRight',
                        fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                      }}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      labelStyle={{ color: CHART_COLORS.tooltipText }}
                      itemStyle={{ color: CHART_COLORS.tooltipText }}
                      formatter={(v, name) => [
                        `${Math.round(Number(v)).toLocaleString()} ${name === 'Wellhead pressure' ? 'psia' : rateUnit}`,
                        name,
                      ]}
                      labelFormatter={(v) => `${v}/64 bean`}
                    />
                    <Legend wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText }} />
                    {envelope.limit && (
                      <ReferenceLine
                        yAxisId="rate"
                        x={envelope.limit.firstSubcriticalS64}
                        stroke={COLOR.limit}
                        strokeDasharray="4 4"
                        label={{ value: 'critical limit', position: 'top', fill: COLOR.limit, fontSize: 10 }}
                      />
                    )}
                    {result && (
                      <ReferenceLine
                        yAxisId="rate"
                        x={result.s64}
                        stroke={CHART_COLORS.axisLine}
                        label={{ value: 'now', position: 'insideTopLeft', fill: CHART_COLORS.axisText, fontSize: 10 }}
                      />
                    )}
                    <Line yAxisId="rate" dataKey="q" name="Rate" stroke={COLOR.rate} strokeWidth={2.2} dot isAnimationActive={false} />
                    <Line yAxisId="pwh" dataKey="pwh" name="Wellhead pressure" stroke={COLOR.pwh} strokeWidth={1.8} strokeDasharray="5 4" dot isAnimationActive={false} />
                  </ComposedChart>
                </ChartFrame>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                      <th className="text-left font-semibold px-3 py-2">Bean</th>
                      <th className="text-right font-semibold px-3 py-2">Rate ({rateUnit})</th>
                      <th className="text-right font-semibold px-3 py-2">Wellhead (psia)</th>
                      <th className="text-right font-semibold px-3 py-2">Downstream ratio</th>
                      <th className="text-left font-semibold px-3 py-2">Regime</th>
                    </tr>
                  </thead>
                  <tbody>
                    {envelope.points.map((p) => (
                      <tr key={p.s64} className="border-b border-slate-800/60 last:border-0">
                        <td className="px-3 py-2 text-slate-200">{p.s64}/64</td>
                        {p.ok ? (
                          <>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-300">{fmt(p.q)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-300">{fmt(p.pwh)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-300">{fmt(p.ratio, 2)}</td>
                            <td className={`px-3 py-2 text-[11px] ${p.critical ? 'text-emerald-400' : 'text-amber-300'}`}>
                              {p.critical ? (isGas ? 'sonic' : 'critical') : (isGas ? 'subsonic' : 'subcritical, correlation void')}
                            </td>
                          </>
                        ) : (
                          <td colSpan={4} className="px-3 py-2 text-[11px] text-amber-300">{p.reason}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default EnvelopePanel;
