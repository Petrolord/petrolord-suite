// Capillary tab, main area (SC3): the working J curve (log axis, with the
// per-sample scatter and min/max band once samples exist) and the
// reservoir-scaled Pc curve.
import React, { useMemo } from 'react';
import {
  ComposedChart, LineChart, Line, Scatter, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ChartFrame from '@/components/charts/ChartFrame';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE,
} from '@/utils/chartTheme';
import { useScalStudio } from '@/contexts/ScalStudioContext';
import { makeJFunction } from '@/utils/scalCalculations';
import { Kpi, LINE, fmt, SCENARIO_COLORS } from '@/components/waterflooddesign/primitives';

const axisProps = {
  stroke: CHART_COLORS.axisLine,
  tick: { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize },
};

const CapillaryResults = () => {
  const { capillary, jResolved, reservoir, reservoirPc, samplesDerived } = useScalStudio();

  const includedSamples = useMemo(
    () => samplesDerived.filter(
      (s) => capillary.includedSampleIds.includes(s.id) && (s.jRows?.length ?? 0) >= 3,
    ),
    [samplesDerived, capillary.includedSampleIds],
  );

  // Working J curve sampled for the chart (true-Sw axis).
  const jCurveRows = useMemo(() => {
    if (!jResolved.jSpec) return [];
    const { j, domain } = makeJFunction(jResolved.jSpec);
    const lo = Math.max(domain.SwMin + 0.005, 0.01);
    const hi = Math.min(domain.SwMax, 0.999);
    const rows = [];
    for (let i = 0; i <= 80; i++) {
      const Sw = lo + ((hi - lo) * i) / 80;
      const J = j(Sw);
      if (Number.isFinite(J) && J > 0) rows.push({ Sw, J });
    }
    return rows;
  }, [jResolved]);

  if (!jResolved.jSpec) {
    return (
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="py-10 text-center text-sm text-slate-400">
          {jResolved.error ?? 'Configure the J-function in the left rail.'}
        </CardContent>
      </Card>
    );
  }

  const spec = jResolved.jSpec;
  const avgMeta = jResolved.meta?.avg ?? null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi title="J source" value={jResolved.meta?.mode === 'samples' ? `${jResolved.meta.sampleCount} samples` : 'Manual'} />
        <Kpi title="a (J at Sw* = 1)" value={fmt.f3(spec.a)} />
        <Kpi title="b exponent" value={fmt.f2(spec.b)} />
        <Kpi title="Swirr" value={fmt.f3(spec.Swirr)} />
      </div>
      {avgMeta?.fit && (
        <p className="text-xs text-slate-500">
          Averaged refit quality r² (log space) {fmt.f3(avgMeta.fit.r2Log)}. A low value usually means the shared
          Swirr needs the override in the left rail.
        </p>
      )}

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Leverett J-function</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ChartFrame height={300} exportFilename="scal-j-function">
            <ComposedChart data={jCurveRows} margin={{ top: 16, right: 16, bottom: 8, left: 8 }}>
              <CartesianGrid {...GRID_STYLE} vertical={false} />
              <XAxis
                dataKey="Sw" type="number" domain={[0, 1]}
                tickFormatter={(v) => v.toFixed(1)} {...axisProps}
                label={{ value: 'Water saturation Sw', position: 'insideBottom', offset: -4, fill: CHART_COLORS.axisText, fontSize: 11 }}
              />
              <YAxis
                scale="log" domain={['auto', 'auto']} allowDataOverflow
                tickFormatter={(v) => Number(v).toPrecision(1)} {...axisProps}
                label={{ value: 'J (log)', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: 11 }}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={{ color: CHART_COLORS.tooltipText }}
                formatter={(v, name) => [Number(v).toPrecision(4), name]}
                labelFormatter={(v) => `Sw = ${Number(v).toFixed(3)}`}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line dataKey="J" name="Working J curve" stroke={LINE.fw} strokeWidth={2} dot={false} />
              {includedSamples.map((s, i) => (
                <Scatter
                  key={s.id}
                  data={s.jRows}
                  dataKey="J"
                  name={s.name}
                  fill={SCENARIO_COLORS[i % SCENARIO_COLORS.length]}
                />
              ))}
            </ComposedChart>
          </ChartFrame>
          {includedSamples.length > 1 && (
            <p className="text-[11px] text-slate-500 px-4 pb-3">
              Points from different samples should collapse onto one curve (the Leverett principle). A sample
              riding systematically above or below usually means its k or φ entry is wrong by a constant factor.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Reservoir capillary pressure</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {reservoir.props && reservoirPc?.length ? (
            <ChartFrame height={280} exportFilename="scal-reservoir-pc">
              <LineChart data={reservoirPc} margin={{ top: 16, right: 16, bottom: 8, left: 8 }}>
                <CartesianGrid {...GRID_STYLE} vertical={false} />
                <XAxis
                  dataKey="Sw" type="number" domain={[0, 1]}
                  tickFormatter={(v) => v.toFixed(1)} {...axisProps}
                  label={{ value: 'Water saturation Sw', position: 'insideBottom', offset: -4, fill: CHART_COLORS.axisText, fontSize: 11 }}
                />
                <YAxis
                  domain={[0, 'auto']}
                  tickFormatter={(v) => Number(v).toPrecision(2)} {...axisProps}
                  label={{ value: 'Pc (psi)', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={{ color: CHART_COLORS.tooltipText }}
                  formatter={(v) => [`${Number(v).toFixed(2)} psi`, 'Pc']}
                  labelFormatter={(v) => `Sw = ${Number(v).toFixed(3)}`}
                />
                <Line dataKey="Pc_psi" name="Pc" stroke={LINE.alt} strokeWidth={2} dot={false} />
              </LineChart>
            </ChartFrame>
          ) : (
            <p className="py-8 text-center text-sm text-slate-400">
              {reservoir.error ?? 'Set the reservoir rock properties to scale the J curve to Pc.'}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CapillaryResults;
