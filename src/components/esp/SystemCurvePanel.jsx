// Pump against system (Performance tab).
//
// The system curve is the head the WELL demands at each rate: an IPR
// lookup for the intake pressure and a full traverse for the discharge
// pressure, per point. The stack curve is the head the pump MAKES. A
// fixed stack runs where they cross, and that rate is generally not the
// rate it was sized at, because the sizing rounded the stage count up.
//
// Every point here costs a traverse, so this is an explicit run and it
// is marked stale the moment an input changes.
import React, { useMemo } from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceDot,
} from 'recharts';
import { Play, RefreshCw, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useEsp } from '@/contexts/EspDesignContext';

const COLOR = { system: '#d97706', pump: '#2563eb', operating: '#dc2626' };

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

const SystemCurvePanel = () => {
  const {
    inputs, setSection, systemRun, systemStale, runSystemCurve, isRunning, design,
  } = useEsp();

  const data = useMemo(() => (systemRun?.points || []).map((p) => ({
    qoStbd: p.qoStbd,
    tdhFt: p.tdhFt,
    pumpHeadFt: p.pumpHeadFt,
  })), [systemRun]);

  const operating = systemRun?.operating;

  return (
    <div className="space-y-4">
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" /> Pump against system
            <span className="text-xs font-normal text-slate-500">
              where a {fmt(design?.sized?.stages)} stage stack settles
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs text-slate-400">Points on the curve</Label>
              <Input
                type="number" value={inputs.system.nPoints}
                onChange={(e) => setSection('system', 'nPoints', e.target.value)}
                className="h-9 bg-slate-800 border-slate-700"
              />
            </div>
            <Button onClick={runSystemCurve} disabled={isRunning} className="h-9">
              <Play className="w-3.5 h-3.5 mr-1" /> Run system curve
            </Button>
          </div>

          {!systemRun ? (
            <p className="text-sm text-slate-500 py-6 text-center">
              Each point on the system curve is an inflow lookup and a full tubing traverse, and the
              operating point is a solve on top of them, so this runs when you ask for it.
            </p>
          ) : (
            <>
              {systemStale && <StaleNote onRerun={runSystemCurve} />}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pb-2">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-slate-500">Designed at</p>
                  <p className="text-lg font-semibold text-slate-100 tabular-nums">
                    {fmt(design?.qoStbd)} <span className="text-xs font-normal text-slate-500">stb/d</span>
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-slate-500">Settles at</p>
                  <p className="text-lg font-semibold text-emerald-400 tabular-nums">
                    {operating
                      ? <>{fmt(operating.qoStbd)} <span className="text-xs font-normal text-slate-500">stb/d</span></>
                      : <span className="text-sm font-normal text-slate-500">no crossing</span>}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-slate-500">Intake there</p>
                  <p className="text-lg font-semibold text-slate-100 tabular-nums">
                    {operating
                      ? <>{fmt(operating.pipPsia)} <span className="text-xs font-normal text-slate-500">psia</span></>
                      : '--'}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-slate-500">Efficiency there</p>
                  <p className="text-lg font-semibold text-slate-100 tabular-nums">
                    {operating && Number.isFinite(operating.efficiency)
                      ? <>{fmt(operating.efficiency * 100, 1)} <span className="text-xs font-normal text-slate-500">%</span></>
                      : '--'}
                  </p>
                </div>
              </div>

              {!operating && (
                <p className="text-[11px] text-amber-300 pb-2">
                  The two curves do not cross inside the rate range. That is a real answer, not a
                  failure to converge: this stack is either too small to lift the well at any rate
                  it can pass, or big enough that the inflow runs out first. Change the stage count
                  by moving the design rate, or change the drive frequency.
                </p>
              )}

              <ChartFrame height={340} exportFilename="esp-pump-vs-system">
                <ComposedChart data={data} margin={{ top: 8, right: 28, bottom: 12, left: 8 }}>
                  <CartesianGrid {...GRID_STYLE} />
                  <XAxis
                    type="number"
                    dataKey="qoStbd"
                    domain={['dataMin', 'dataMax']}
                    stroke={CHART_COLORS.axisLine}
                    tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                    label={{
                      value: 'Oil rate (stb/d)', position: 'insideBottom', offset: -8,
                      fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                    }}
                  />
                  <YAxis
                    stroke={CHART_COLORS.axisLine}
                    tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                    label={{
                      value: 'Head (ft)', angle: -90, position: 'insideLeft',
                      fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                    }}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={{ color: CHART_COLORS.tooltipText }}
                    itemStyle={{ color: CHART_COLORS.tooltipText }}
                    formatter={(value, name) => [`${Math.round(Number(value))} ft`, name]}
                    labelFormatter={(v) => `${Math.round(Number(v))} stb/d`}
                  />
                  <Legend wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText }} />
                  <Line
                    dataKey="tdhFt" name="Head the well demands" stroke={COLOR.system}
                    strokeWidth={2} dot={false} isAnimationActive={false}
                  />
                  <Line
                    dataKey="pumpHeadFt" name="Head the stack makes" stroke={COLOR.pump}
                    strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false}
                  />
                  {operating && (
                    <ReferenceDot
                      x={operating.qoStbd}
                      y={operating.headFt}
                      r={6}
                      fill={COLOR.operating}
                      stroke="#ffffff"
                      strokeWidth={1}
                      isFront
                      label={{
                        value: 'Operating point', position: 'top', fill: COLOR.operating, fontSize: 11,
                      }}
                    />
                  )}
                </ComposedChart>
              </ChartFrame>

              <p className="text-[11px] text-slate-600">
                The system curve rises with rate because the well gives up intake pressure as it
                produces harder and the tubing costs more friction. The pump curve falls. They cross
                once, and that crossing is where the installation actually runs.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SystemCurvePanel;
