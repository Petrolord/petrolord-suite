// Liquid Loading tab: the critical rate down the whole string, where it
// bites first, and what tubing would fix it.
//
// The profile matters and is commonly got wrong. Critical rate goes as
// roughly the square root of pressure, so it is highest at the shoe: a
// well can sit comfortably above it at the wellhead, where the operator
// is looking, while loading at the bottom, where the liquid actually
// collects. The controlling station is found rather than assumed.
import React, { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import { Droplets, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE, LEGEND_PROPS, XAXIS_LABEL_HEIGHT } from '@/utils/chartTheme';
import { useGasWell } from '@/contexts/GasWellPerformanceContext';
import { fmt, Stat } from './fields';

const COLOR = { critical: '#dc2626', actual: '#059669' };

const LoadingPanel = () => {
  const { result, tubing } = useGasWell();

  const data = useMemo(() => (result?.loading?.points || []).map((p) => ({
    depthFt: p.depthFt,
    criticalMscfd: p.criticalRateMscfd,
    actualMscfd: result.qMscfd,
    pPsia: p.pPsia,
  })), [result]);

  if (!result) return null;
  const c = result.loading.controlling;
  const loaded = result.loading.loaded;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            <span className="flex items-center gap-2">
              <Droplets className="w-4 h-4 text-pl-muted" /> Liquid loading
            </span>
            <span className="block text-xs font-normal text-pl-muted mt-0.5">
              {result.correlation === 'turner' ? 'Turner' : 'Coleman'}, from the droplet balance:
              drag against weight, with the largest stable droplet set by the critical Weber number.
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className={`rounded-md border p-3 ${loaded
            ? 'border-pl-danger/40 bg-pl-danger-bg'
            : (result.loading.marginPct < 20 ? 'border-pl-warning/40 bg-pl-warning-bg' : 'border-pl-success/40 bg-pl-success-bg')}`}
          >
            <p className={`text-sm font-semibold flex items-center gap-2 ${loaded ? 'text-pl-danger-text' : (result.loading.marginPct < 20 ? 'text-pl-warning-text' : 'text-pl-success-text')}`}>
              {loaded ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
              {loaded
                ? `Loading at ${fmt(c.depthFt)} ft, ${fmt(Math.abs(result.loading.marginPct))} percent below the rate needed to carry its liquid there.`
                : `Unloaded, with ${fmt(result.loading.marginPct)} percent of margin at the controlling depth.`}
            </p>
            <p className="text-[11px] text-pl-muted mt-1">
              The controlling station is {fmt(c.depthFt)} ft, not the wellhead. Critical rate rises
              with pressure, so the deepest point decides, and it is where liquid collects.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Producing" value={fmt(result.qMscfd)} unit="Mscf/d" />
            <Stat
              label="Critical rate there"
              value={fmt(c.criticalRateMscfd)}
              unit="Mscf/d"
              accent={loaded ? 'text-pl-danger-text' : 'text-pl-success-text'}
              hint={`at ${fmt(c.pPsia)} psia, ${fmt(c.tempR - 460)} F`}
            />
            <Stat
              label="Critical velocity"
              value={fmt(c.criticalVelocityFtS, 1)}
              unit="ft/s"
              hint={`gas moving at ${fmt(c.actualVelocityFtS, 1)} ft/s`}
            />
            <Stat
              label="Margin"
              value={fmt(result.loading.marginPct)}
              unit="%"
              accent={loaded ? 'text-pl-danger-text' : 'text-pl-success-text'}
            />
          </div>

          <ChartFrame height={360} exportFilename="gas-well-loading-profile">
            <LineChart layout="vertical" data={data} margin={{ top: 8, right: 28, bottom: 12, left: 8 }}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis
                    height={XAXIS_LABEL_HEIGHT}
                type="number"
                stroke={CHART_COLORS.axisLine}
                tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                label={{
                  value: 'Gas rate (Mscf/d)', position: 'insideBottom', offset: 0,
                  fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                }}
              />
              <YAxis
                type="number"
                dataKey="depthFt"
                domain={[0, 'dataMax']}
                stroke={CHART_COLORS.axisLine}
                tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                label={{
                  value: 'Depth (ft)', angle: -90, position: 'insideLeft',
                  fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                }}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={{ color: CHART_COLORS.tooltipText }}
                itemStyle={{ color: CHART_COLORS.tooltipText }}
                formatter={(v, name) => [`${Math.round(Number(v)).toLocaleString()} Mscf/d`, name]}
                labelFormatter={(v) => `${Math.round(Number(v)).toLocaleString()} ft`}
              />
              <Legend {...LEGEND_PROPS} />
              <ReferenceLine y={c.depthFt} stroke={CHART_COLORS.axisLine} strokeDasharray="4 4" label={{ value: 'Controlling depth', position: 'insideTopLeft', fill: CHART_COLORS.axisText, fontSize: 10 }} />
              <Line dataKey="criticalMscfd" name="Critical rate" stroke={COLOR.critical} strokeWidth={2} dot isAnimationActive={false} />
              <Line dataKey="actualMscfd" name="Producing" stroke={COLOR.actual} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
            </LineChart>
          </ChartFrame>
        </CardContent>
      </Card>

      {tubing && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              What tubing would carry this rate
              <span className="block text-xs font-normal text-pl-muted mt-0.5">
                Velocity goes as one over area, so a smaller string lifts liquid at a lower rate.
                This is the commonest and cheapest fix for a loading well. Screened at the
                controlling station; a real re-completion changes the pressure profile too, so
                treat the list as a shortlist rather than a promise.
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-pl-muted border-b border-pl-border bg-pl-sunken">
                    <th className="text-left font-semibold px-4 py-2">Tubing ID (in)</th>
                    <th className="text-right font-semibold px-4 py-2">Critical rate (Mscf/d)</th>
                    <th className="text-right font-semibold px-4 py-2">Gas velocity (ft/s)</th>
                    <th className="text-right font-semibold px-4 py-2">Margin</th>
                    <th className="text-left font-semibold px-4 py-2">Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {tubing.rows.map((r) => {
                    const ok = r.ok && r.ratio >= 1;
                    const chosen = tubing.largestUnloaded && r.idIn === tubing.largestUnloaded.idIn;
                    return (
                      <tr key={r.idIn} className={`border-b border-pl-border last:border-0 ${chosen ? 'bg-pl-success-bg' : ''}`}>
                        <td className="px-4 py-2 text-pl-text">
                          {r.idIn}
                          {chosen && <span className="ml-2 text-[10px] uppercase tracking-wider text-pl-success-text">largest that works</span>}
                        </td>
                        <td className="px-4 py-2 text-right font-pl-mono tabular-nums text-pl-text">{fmt(r.criticalRateMscfd)}</td>
                        <td className="px-4 py-2 text-right font-pl-mono tabular-nums text-pl-text">{fmt(r.actualVelocityFtS, 1)}</td>
                        <td className={`px-4 py-2 text-right font-pl-mono tabular-nums ${ok ? 'text-pl-success-text' : 'text-pl-danger-text'}`}>
                          {fmt((r.ratio - 1) * 100)} %
                        </td>
                        <td className={`px-4 py-2 text-[11px] ${ok ? 'text-pl-success-text' : 'text-pl-danger-text'}`}>
                          {ok ? 'Carries it' : 'Would load'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!tubing.largestUnloaded && (
              <p className="text-[11px] text-pl-warning-text px-4 py-3">
                No tubing on this list carries the current rate. At this point the choices are
                compression to drop the wellhead pressure, or a form of artificial lift.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default LoadingPanel;
