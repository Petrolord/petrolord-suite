// The Chan reading: the water-oil ratio and its derivative on log-log,
// which is the plot the whole plan turns on.
//
// The two curves are drawn together on purpose. The ratio alone cannot
// separate coning from channelling -- both climb -- and it is the
// DERIVATIVE that carries the distinction: climbing steeply for
// channelling, falling for coning. Showing only the ratio would be
// showing the half of the picture that does not decide anything.
import React, { useMemo } from 'react';
import {
  ComposedChart, Line, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import { Activity, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useIntervention } from '@/contexts/InterventionPlannerContext';
import { Field, Stat, fmt } from './fields';

const MECH_STYLE = {
  channelling: 'text-amber-400',
  coning: 'text-rose-400',
  displacement: 'text-sky-400',
  indeterminate: 'text-slate-400',
};

const DiagnosticPanel = () => {
  const {
    inputs, setSection, diagnosis, history, historyLoading,
  } = useIntervention();

  const data = useMemo(() => (diagnosis?.derivative || []).map((p) => ({
    t: p.t, ratio: p.ratio, derivative: p.derivative > 0 ? p.derivative : null,
  })), [diagnosis]);

  const isGor = inputs.diagnostic.ratio === 'gor';
  const ratioLabel = isGor ? 'Gas-oil ratio' : 'Water-oil ratio';

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" /> The diagnostic
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 items-end">
          <Field label="Ratio to read">
            <Select
              value={inputs.diagnostic.ratio}
              onValueChange={(v) => setSection('diagnostic', 'ratio', v)}
            >
              <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
                <SelectItem value="wor">Water-oil ratio</SelectItem>
                <SelectItem value="gor">Gas-oil ratio</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="Late fraction"
            hint="How much of the history counts as late. The mechanisms separate at the end; early data is cleanup."
          >
            <Select
              value={String(inputs.diagnostic.lateFraction)}
              onValueChange={(v) => setSection('diagnostic', 'lateFraction', v)}
            >
              <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
                <SelectItem value="0.3">Last 30 percent</SelectItem>
                <SelectItem value="0.5">Last half</SelectItem>
                <SelectItem value="0.7">Last 70 percent</SelectItem>
                <SelectItem value="1">All of it</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        {historyLoading && <p className="text-sm text-slate-500">Loading the production history...</p>}

        {!historyLoading && !history.length && (
          <p className="text-sm text-slate-500 py-4">
            No production history is linked. Pick a field and a well on the spine. Without a history
            there is no diagnosis, and without a diagnosis the water treatments are refused rather
            than guessed at, which is the point of this studio.
          </p>
        )}

        {diagnosis && !diagnosis.ok && diagnosis.error && (
          <p className="text-[12px] text-amber-300 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{diagnosis.error}</span>
          </p>
        )}

        {diagnosis?.mechanism && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat
                label="Mechanism"
                value={diagnosis.mechanism.label}
                accent={MECH_STYLE[diagnosis.mechanism.id] || 'text-slate-100'}
                hint={diagnosis.mechanism.treatable ? 'A squeeze has something to seal' : 'Not fixable by a squeeze'}
              />
              <Stat
                label="Derivative slope"
                value={diagnosis.derivativeSlope != null ? fmt(diagnosis.derivativeSlope, 2) : '--'}
                hint="On log-log, over the late history"
              />
              <Stat
                label="Fit quality"
                value={diagnosis.derivativeR2 != null ? `${fmt(diagnosis.derivativeR2 * 100, 0)}%` : '--'}
                hint={diagnosis.spanDecades != null ? `over ${fmt(diagnosis.spanDecades, 2)} log cycles` : undefined}
              />
              <Stat
                label="Confidence"
                value={diagnosis.confidence || '--'}
                accent={diagnosis.confidence === 'high' ? 'text-emerald-400'
                  : diagnosis.confidence === 'low' ? 'text-amber-400' : 'text-slate-100'}
              />
            </div>

            <div className="rounded border border-slate-800 bg-slate-950/50 p-3 space-y-2">
              <p className="text-[12px] text-slate-300">{diagnosis.mechanism.note}</p>
              {(diagnosis.notes || []).map((n) => (
                <p key={n} className="text-[11px] text-slate-500">{n}</p>
              ))}
              {diagnosis.droppedShutInDays > 0 && (
                <p className="text-[11px] text-slate-600">
                  {diagnosis.droppedShutInDays} shut-in day
                  {diagnosis.droppedShutInDays === 1 ? '' : 's'} dropped: a day with no oil has
                  nothing to say about the mechanism, and an infinite ratio would poison the
                  derivative either side of it.
                </p>
              )}
              {diagnosis.edgesDropped > 0 && (
                <p className="text-[11px] text-slate-600">
                  The first and last {diagnosis.edgesDropped} derivative points are set aside. The
                  Bourdet formula needs a neighbour on both sides; at the ends it has one, and those
                  one-sided estimates are badly biased on a curving response.
                </p>
              )}
              {diagnosis.spikesRemoved > 0 && (
                <p className="text-[11px] text-slate-600">
                  {diagnosis.spikesRemoved} outlier
                  {diagnosis.spikesRemoved === 1 ? '' : 's'} trimmed from the history.
                </p>
              )}
            </div>

            {data.length > 3 && (
              <ChartFrame height={380} exportFilename="intervention-chan-diagnostic">
                <ComposedChart data={data} margin={{ top: 8, right: 34, bottom: 14, left: 8 }}>
                  <CartesianGrid {...GRID_STYLE} />
                  <XAxis
                    type="number" dataKey="t" scale="log" domain={['dataMin', 'dataMax']}
                    stroke={CHART_COLORS.axisLine}
                    tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                    tickFormatter={(v) => fmt(v, 0)}
                    label={{
                      value: 'Producing time (days)', position: 'insideBottom', offset: -10,
                      fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                    }}
                  />
                  <YAxis
                    scale="log" domain={['auto', 'auto']}
                    stroke={CHART_COLORS.axisLine}
                    tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                    label={{
                      value: `${ratioLabel} and its derivative`, angle: -90, position: 'insideLeft',
                      fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                    }}
                  />
                  <Tooltip
                    {...TOOLTIP_STYLE}
                    formatter={(v, n) => [fmt(v, 3), n]}
                    labelFormatter={(v) => `${fmt(v, 0)} days`}
                  />
                  <Legend wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize }} />
                  {diagnosis.lateFromT && (
                    <ReferenceLine
                      x={diagnosis.lateFromT} stroke="#64748b" strokeDasharray="4 3"
                      label={{ value: 'read from here', fill: '#64748b', fontSize: 10, position: 'top' }}
                    />
                  )}
                  <Line
                    type="monotone" dataKey="ratio" name={ratioLabel}
                    stroke="#0891b2" strokeWidth={2} dot={false} isAnimationActive={false}
                  />
                  <Line
                    type="monotone" dataKey="derivative" name="Derivative"
                    stroke="#d97706" strokeWidth={2} strokeDasharray="5 3"
                    dot={{ r: 2 }} connectNulls isAnimationActive={false}
                  />
                </ComposedChart>
              </ChartFrame>
            )}
            <p className="text-[11px] text-slate-600">
              Both curves are shown because the ratio alone cannot separate coning from channelling:
              both climb. It is the derivative that carries the distinction, climbing steeply for
              channelling and falling for coning. This is a reading of the same two things Chan
              reads, not a reproduction of the published type curves; take a decision that turns on
              it to the plots.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default DiagnosticPanel;
