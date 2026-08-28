// Rod String tab: the taper, what each section carries, and how close
// it runs to what the steel allows.
//
// The stresses come off the tension envelope the wave equation left
// behind, so they are dynamic stresses and not the static hanging
// weight. A taper is designed so every section is loaded to the same
// fraction of its allowable; how close this one gets is visible here.
import React, { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useRodPump } from '@/contexts/RodPumpDesignContext';
import { fmt } from './fields';

const COLOR = { max: '#dc2626', min: '#2563eb' };

const loadingAccent = (pct) => {
  if (!Number.isFinite(pct)) return 'text-slate-400';
  if (pct > 100) return 'text-red-400';
  if (pct > 90) return 'text-amber-300';
  return 'text-emerald-400';
};

const RodStressPanel = () => {
  const { design, string } = useRodPump();

  const envelope = useMemo(
    () => (design?.dynamics?.tensionEnvelope || []).map((e) => ({
      depthFt: e.depthFt, maxLb: e.maxLb, minLb: e.minLb,
    })),
    [design],
  );

  if (!design) return null;

  return (
    <div className="space-y-4">
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            The taper, section by section
            <span className="block text-xs font-normal text-slate-500 mt-0.5">
              {string.grade.label}, minimum tensile{' '}
              {string.grade.minTensilePsi.toLocaleString()} psi, at a service factor of{' '}
              {design.stresses[0] ? fmt(design.stresses[0].allowablePsi / (string.grade.minTensilePsi / 4 + 0.5625 * design.stresses[0].minStressPsi), 2) : '--'}.
              The allowable is the modified Goodman line, which rises with the minimum stress the
              section sees: a rod that never unloads can carry more than one that cycles to zero.
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                  <th className="text-left font-semibold px-4 py-2">Section</th>
                  <th className="text-right font-semibold px-4 py-2">Top depth (ft)</th>
                  <th className="text-right font-semibold px-4 py-2">Area (in2)</th>
                  <th className="text-right font-semibold px-4 py-2">Max load (lb)</th>
                  <th className="text-right font-semibold px-4 py-2">Max stress (psi)</th>
                  <th className="text-right font-semibold px-4 py-2">Min stress (psi)</th>
                  <th className="text-right font-semibold px-4 py-2">Allowable (psi)</th>
                  <th className="text-right font-semibold px-4 py-2">Loading</th>
                </tr>
              </thead>
              <tbody>
                {design.stresses.map((s) => (
                  <tr key={s.label} className="border-b border-slate-800/60 last:border-0">
                    <td className="px-4 py-2 text-slate-200">{s.label} in</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-300">{fmt(s.topDepthFt)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-300">{fmt(s.areaIn2, 3)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-300">{fmt(s.maxLoadLb)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-300">{fmt(s.maxStressPsi)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-300">{fmt(s.minStressPsi)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-300">{fmt(s.allowablePsi)}</td>
                    <td className={`px-4 py-2 text-right tabular-nums font-semibold ${loadingAccent(s.loadingPct)}`}>
                      {fmt(s.loadingPct, 1)} %
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Tension down the string
            <span className="block text-xs font-normal text-slate-500 mt-0.5">
              The most and least the rods carry at each depth over a full stroke. The load sheds
              going down because each section carries less rod weight below it; the steps are the
              taper changes.
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ChartFrame height={360} exportFilename="rod-pump-tension-envelope">
            <LineChart layout="vertical" data={envelope} margin={{ top: 8, right: 28, bottom: 12, left: 8 }}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis
                type="number"
                stroke={CHART_COLORS.axisLine}
                tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                label={{
                  value: 'Tension (lb)', position: 'insideBottom', offset: -8,
                  fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                }}
              />
              <YAxis
                type="number"
                dataKey="depthFt"
                reversed
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
                formatter={(value, name) => [`${Math.round(Number(value)).toLocaleString()} lb`, name]}
                labelFormatter={(v) => `${Math.round(Number(v))} ft`}
              />
              <Legend wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText }} />
              <Line dataKey="maxLb" name="Peak tension" stroke={COLOR.max} strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line dataKey="minLb" name="Minimum tension" stroke={COLOR.min} strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ChartFrame>
        </CardContent>
      </Card>
    </div>
  );
};

export default RodStressPanel;
