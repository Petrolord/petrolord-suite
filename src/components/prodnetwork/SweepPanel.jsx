// What lowering the separator buys.
//
// Usually the one thing an operator can actually change tomorrow, and
// the answer is not a constant: the curve steepens wherever a well that
// had been held off comes back on, and those steps are the interesting
// part rather than noise to be smoothed away.
import React from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import { Play, RefreshCw, Gauge } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useProductionNetwork } from '@/contexts/ProductionNetworkContext';
import { Field, Num, fmt } from './fields';

const SweepPanel = () => {
  const {
    inputs, setSweepInput, sweep, sweepStale, runSweep, isRunning, canRun, result,
  } = useProductionNetwork();

  const data = (sweep?.points || []).filter((p) => p.ok).map((p) => ({
    deliveryPsia: p.deliveryPsia,
    qoStbd: p.qoStbd,
    shutIn: p.shutIn.length,
  }));

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Gauge className="w-4 h-4 text-cyan-400" /> What the separator pressure is worth
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <Field label="From (psia)">
            <Num value={inputs.sweep.minPsia} onChange={(v) => setSweepInput('minPsia', v)} />
          </Field>
          <Field label="To (psia)">
            <Num value={inputs.sweep.maxPsia} onChange={(v) => setSweepInput('maxPsia', v)} />
          </Field>
          <Field label="Points">
            <Num value={inputs.sweep.points} onChange={(v) => setSweepInput('points', v)} />
          </Field>
          <Button onClick={runSweep} disabled={isRunning || !canRun} className="h-9">
            <Play className="w-3.5 h-3.5 mr-1" /> Sweep
          </Button>
        </div>

        {!sweep ? (
          <p className="text-sm text-slate-500 py-6 text-center">
            Each point is a whole network solve, so this runs when you ask for it.
          </p>
        ) : (
          <>
            {sweepStale && (
              <div className="flex items-center gap-2 text-[11px] text-amber-400">
                <RefreshCw className="w-3 h-3" />
                The network changed since this ran.
                <button type="button" className="underline hover:text-amber-300" onClick={runSweep}>
                  Sweep again
                </button>
              </div>
            )}
            <ChartFrame height={360} exportFilename="network-delivery-pressure-sweep">
              <ComposedChart data={data} margin={{ top: 8, right: 30, bottom: 14, left: 8 }}>
                <CartesianGrid {...GRID_STYLE} />
                <XAxis
                  type="number" dataKey="deliveryPsia" domain={['dataMin', 'dataMax']}
                  stroke={CHART_COLORS.axisLine}
                  tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                  label={{
                    value: 'Delivery pressure (psia)', position: 'insideBottom', offset: -10,
                    fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                  }}
                />
                <YAxis
                  stroke={CHART_COLORS.axisLine}
                  tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                  label={{
                    value: 'Field oil rate (stb/d)', angle: -90, position: 'insideLeft',
                    fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                  }}
                />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(v) => [`${fmt(v)} stb/d`, 'Field']}
                  labelFormatter={(v) => `${fmt(v)} psia`}
                />
                <Legend wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize }} />
                {sweep.basePsia && (
                  <ReferenceLine
                    x={sweep.basePsia} stroke="#0891b2" strokeDasharray="4 3"
                    label={{ value: 'Today', fill: '#0891b2', fontSize: 10, position: 'top' }}
                  />
                )}
                <Line
                  type="monotone" dataKey="qoStbd" name="Field rate"
                  stroke="#059669" strokeWidth={2} dot isAnimationActive={false}
                />
              </ComposedChart>
            </ChartFrame>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                    <th className="text-left py-1.5 pr-3">Delivery</th>
                    <th className="text-right py-1.5 px-3">Field rate</th>
                    <th className="text-right py-1.5 px-3">stb/d per psi</th>
                    <th className="text-right py-1.5 pl-3">Shut in</th>
                  </tr>
                </thead>
                <tbody>
                  {sweep.points.filter((p) => p.ok).map((p) => {
                    const s = sweep.slope.find((x) => x.deliveryPsia === p.deliveryPsia);
                    return (
                      <tr key={p.deliveryPsia} className="border-b border-slate-800/60 last:border-0">
                        <td className="py-1.5 pr-3 text-slate-300 tabular-nums">{fmt(p.deliveryPsia)} psia</td>
                        <td className="py-1.5 px-3 text-right tabular-nums text-emerald-400">{fmt(p.qoStbd)}</td>
                        <td className="py-1.5 px-3 text-right tabular-nums text-slate-400">
                          {s ? fmt(s.stbdPerPsi, 2) : '--'}
                        </td>
                        <td className="py-1.5 pl-3 text-right text-slate-500 text-xs">
                          {p.shutIn.length ? p.shutIn.join(', ') : '--'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-600">
              The rate per psi is read off the curve rather than quoted as a constant, because it is
              not one. It steepens wherever a well that had been held off the header comes back on,
              and those steps are the interesting part.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default SweepPanel;
