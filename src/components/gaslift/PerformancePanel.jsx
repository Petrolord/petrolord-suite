// Gas-lift performance (Performance tab): the response curve at the
// operating valve depth, and the rate against injection depth sweep.
// Both solve a nodal operating point per sample, so both are explicit
// runs; when an input changes afterwards the result is marked stale
// rather than left sitting next to numbers it no longer belongs to.
import React, { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceDot,
} from 'recharts';
import { Play, TrendingUp, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useGasLift } from '@/contexts/GasLiftDesignContext';

const fmt = (v, digits = 0) => (Number.isFinite(v)
  ? v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  : '--');

const StaleNote = ({ onRerun }) => (
  <div className="flex items-center gap-2 text-[11px] text-amber-400 mb-2">
    <RefreshCw className="w-3 h-3" />
    Inputs changed since this ran.
    <button type="button" className="underline hover:text-amber-300" onClick={onRerun}>
      Run again
    </button>
  </div>
);

const PerformancePanel = () => {
  const {
    inputs, setSection, performance, performanceStale, runPerformance,
    depthSweep, depthSweepStale, runDepthSweep, isRunning, operatingValveMd,
  } = useGasLift();

  const curve = useMemo(() => (performance?.response || []).map((p) => ({
    qgi: p.qgi,
    q: p.q,
  })), [performance]);

  const sweep = useMemo(() => (depthSweep?.points || []).map((p) => ({
    depth: p.injectionMd,
    q: p.q,
  })), [depthSweep]);

  return (
    <div className="space-y-4">
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" /> Response to injection gas
            <span className="text-xs font-normal text-slate-500">
              solved at {fmt(operatingValveMd)} ft measured depth
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs text-slate-400">Max injection (Mscf/d)</Label>
              <Input
                type="number" value={inputs.injection.maxQgiMscfd}
                onChange={(e) => setSection('injection', 'maxQgiMscfd', e.target.value)}
                className="h-9 bg-slate-800 border-slate-700"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-400">Points</Label>
              <Input
                type="number" value={inputs.injection.nPoints}
                onChange={(e) => setSection('injection', 'nPoints', e.target.value)}
                className="h-9 bg-slate-800 border-slate-700"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-400">Economic slope (stb per Mscf)</Label>
              <Input
                type="number" step="0.01" value={inputs.injection.econSlope}
                onChange={(e) => setSection('injection', 'econSlope', e.target.value)}
                className="h-9 bg-slate-800 border-slate-700"
              />
            </div>
            <Button onClick={runPerformance} disabled={isRunning} className="h-9">
              <Play className="w-3.5 h-3.5 mr-1" /> Run curve
            </Button>
          </div>

          {!performance ? (
            <p className="text-sm text-slate-500 py-6 text-center">
              Each point on this curve is a full nodal solve, so it runs when you ask for it.
            </p>
          ) : (
            <>
              {performanceStale && <StaleNote onRerun={runPerformance} />}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pb-2">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-slate-500">Without gas</p>
                  <p className="text-lg font-semibold text-slate-100 tabular-nums">
                    {fmt(performance.baseline.q)} <span className="text-xs font-normal text-slate-500">stb/d</span>
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-slate-500">Maximum rate</p>
                  <p className="text-lg font-semibold text-emerald-400 tabular-nums">
                    {fmt(performance.best.q)} <span className="text-xs font-normal text-slate-500">stb/d at {fmt(performance.best.qgi)} Mscf/d</span>
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-slate-500">Economic point</p>
                  <p className="text-lg font-semibold text-sky-400 tabular-nums">
                    {performance.econ
                      ? <>{fmt(performance.econ.q)} <span className="text-xs font-normal text-slate-500">stb/d at {fmt(performance.econ.qgi)} Mscf/d</span></>
                      : <span className="text-sm font-normal text-slate-500">below the slope from the first step</span>}
                  </p>
                </div>
              </div>
              <ChartFrame height={320} exportFilename="gas-lift-performance-curve">
                <LineChart data={curve} margin={{ top: 8, right: 24, bottom: 12, left: 8 }}>
                  <CartesianGrid {...GRID_STYLE} />
                  <XAxis
                    type="number" dataKey="qgi" stroke={CHART_COLORS.axisLine}
                    tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                    label={{
                      value: 'Injection gas (Mscf/d)', position: 'insideBottom', offset: -8,
                      fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                    }}
                  />
                  <YAxis
                    stroke={CHART_COLORS.axisLine}
                    tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                    label={{
                      value: 'Oil rate (stb/d)', angle: -90, position: 'insideLeft',
                      fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                    }}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={{ color: CHART_COLORS.tooltipText }}
                    itemStyle={{ color: CHART_COLORS.tooltipText }}
                    formatter={(v) => [`${Math.round(Number(v))} stb/d`, 'Oil rate']}
                    labelFormatter={(v) => `${Math.round(Number(v))} Mscf/d injected`}
                  />
                  <Legend wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText }} />
                  <Line dataKey="q" name="Oil rate" stroke="#059669" strokeWidth={2} dot isAnimationActive={false} />
                  {performance.econ && (
                    <ReferenceDot
                      x={performance.econ.qgi} y={performance.econ.q} r={5}
                      fill="#0284c7" stroke="#ffffff" strokeWidth={1} isFront
                      label={{ value: 'Economic', position: 'top', fill: '#0284c7', fontSize: 10 }}
                    />
                  )}
                  <ReferenceDot
                    x={performance.best.qgi} y={performance.best.q} r={5}
                    fill="#dc2626" stroke="#ffffff" strokeWidth={1} isFront
                    label={{ value: 'Maximum', position: 'top', fill: '#dc2626', fontSize: 10 }}
                  />
                </LineChart>
              </ChartFrame>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">
            Rate against injection depth
            <span className="block text-xs font-normal text-slate-500 mt-0.5">
              What deeper injection is worth at {fmt(inputs.injection.targetQgiMscfd)} Mscf/d, before
              asking whether the casing pressure can reach it.
            </span>
          </CardTitle>
          <Button onClick={runDepthSweep} disabled={isRunning} variant="outline" className="h-9">
            <Play className="w-3.5 h-3.5 mr-1" /> Run sweep
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {!depthSweep ? (
            <p className="text-sm text-slate-500 py-8 text-center">Not run yet.</p>
          ) : (
            <div className="px-4 pb-2">
              {depthSweepStale && <StaleNote onRerun={runDepthSweep} />}
              <ChartFrame height={300} exportFilename="gas-lift-depth-sweep">
                <LineChart data={sweep} margin={{ top: 8, right: 24, bottom: 12, left: 8 }}>
                  <CartesianGrid {...GRID_STYLE} />
                  <XAxis
                    type="number" dataKey="depth" stroke={CHART_COLORS.axisLine}
                    tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                    label={{
                      value: 'Injection depth (ft measured)', position: 'insideBottom', offset: -8,
                      fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                    }}
                  />
                  <YAxis
                    stroke={CHART_COLORS.axisLine}
                    tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                    label={{
                      value: 'Oil rate (stb/d)', angle: -90, position: 'insideLeft',
                      fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                    }}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={{ color: CHART_COLORS.tooltipText }}
                    itemStyle={{ color: CHART_COLORS.tooltipText }}
                    formatter={(v) => [`${Math.round(Number(v))} stb/d`, 'Oil rate']}
                    labelFormatter={(v) => `${Math.round(Number(v))} ft`}
                  />
                  <Line dataKey="q" name="Oil rate" stroke="#2563eb" strokeWidth={2} dot isAnimationActive={false} />
                </LineChart>
              </ChartFrame>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PerformancePanel;
