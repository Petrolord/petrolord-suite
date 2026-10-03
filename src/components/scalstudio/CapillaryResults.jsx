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
  CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE, LEGEND_PROPS, XAXIS_LABEL_HEIGHT,
} from '@/utils/chartTheme';

// Senior test T1: one-decimal labels on auto ticks printed 0.25 as 0.3.
const UNIT_TICKS = [0, 0.2, 0.4, 0.6, 0.8, 1];
import { useScalStudio } from '@/contexts/ScalStudioContext';
import { Kpi, LINE } from '@/components/waterflooddesign/primitives';
import { jSeries, pcSeries } from '@/utils/scalstudio/series';
import { sfmt } from '@/utils/scalstudio/format';

const axisProps = {
  stroke: CHART_COLORS.axisLine,
  tick: { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize },
};

const CapillaryResults = () => {
  const { capillary, jResolved, reservoir, reservoirPc, samplesDerived, unitSystem } = useScalStudio();

  const includedSamples = useMemo(
    () => samplesDerived.filter(
      (s) => capillary.includedSampleIds.includes(s.id) && (s.jRows?.length ?? 0) >= 3,
    ),
    [samplesDerived, capillary.includedSampleIds],
  );

  // One series builder for the screen and the report (SCAL-U1, RL12).
  const js = useMemo(
    () => jSeries({ jSpec: jResolved.jSpec, samples: samplesDerived, includedIds: capillary.includedSampleIds }),
    [jResolved, samplesDerived, capillary.includedSampleIds],
  );
  const jCurveRows = useMemo(() => js.curve.map((p) => ({ Sw: p.x, J: p.y })), [js]);
  const pcs = useMemo(
    () => pcSeries({ reservoirPc, reservoir, samples: samplesDerived, includedIds: capillary.includedSampleIds, system: unitSystem }),
    [reservoirPc, reservoir, samplesDerived, capillary.includedSampleIds, unitSystem],
  );

  if (!jResolved.jSpec) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-pl-muted">
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
        <Kpi title="a (J at Sw* = 1)" value={sfmt.f3(spec.a)} />
        <Kpi title="b exponent" value={sfmt.f2(spec.b)} />
        <Kpi title="Swirr" value={sfmt.f3(spec.Swirr)} unit={jResolved.meta?.swirr ? (jResolved.meta.swirr.from === 'override' ? 'entered' : 'lowest Sw less 0.02') : undefined} />
      </div>
      {avgMeta?.fit && (
        <p className="text-xs text-pl-muted">
          Averaged refit quality r² (log space) {sfmt.f3(avgMeta.fit.r2Log)}. A low value usually means the shared
          Swirr needs the override in the left rail.
        </p>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Leverett J-function</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ChartFrame height={300} exportFilename="scal-j-function">
            <ComposedChart data={jCurveRows} margin={{ top: 16, right: 16, bottom: 8, left: 8 }}>
              <CartesianGrid {...GRID_STYLE} vertical={false} />
              <XAxis height={XAXIS_LABEL_HEIGHT}
                dataKey="Sw" type="number" domain={[0, 1]}
                ticks={UNIT_TICKS} tickFormatter={(v) => v.toFixed(1)} {...axisProps}
                label={{ value: 'Water saturation Sw', position: 'insideBottom', offset: 0, fill: CHART_COLORS.axisText, fontSize: 11 }}
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
              <Legend {...LEGEND_PROPS} />
              <Line dataKey="J" name="Working J curve" stroke={LINE.fw} strokeWidth={2} dot={false} />
              {js.samples.map((s) => (
                <Scatter
                  key={s.id}
                  data={s.points.map((p) => ({ Sw: p.x, J: p.y }))}
                  dataKey="J"
                  name={s.name}
                  fill={s.color.hex}
                />
              ))}
            </ComposedChart>
          </ChartFrame>
          {includedSamples.length > 1 && (
            <p className="text-[11px] text-pl-muted px-4 pb-3">
              Points from different samples should collapse onto one curve (the Leverett principle). A sample
              riding systematically above or below usually means its k or φ entry is wrong by a constant factor.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Reservoir capillary pressure</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {reservoir.props && pcs.curve.length ? (
            <ChartFrame height={280} exportFilename="scal-reservoir-pc">
              <ComposedChart data={pcs.curve.map((p) => ({ Sw: p.x, Pc: p.y }))} margin={{ top: 16, right: 16, bottom: 8, left: 8 }}>
                <CartesianGrid {...GRID_STYLE} vertical={false} />
                <XAxis height={XAXIS_LABEL_HEIGHT}
                  dataKey="Sw" type="number" domain={[0, 1]}
                  ticks={UNIT_TICKS} tickFormatter={(v) => v.toFixed(1)} {...axisProps}
                  label={{ value: 'Water saturation Sw', position: 'insideBottom', offset: 0, fill: CHART_COLORS.axisText, fontSize: 11 }}
                />
                <YAxis
                  domain={[0, 'auto']}
                  tickFormatter={(v) => Number(v).toPrecision(2)} {...axisProps}
                  label={{ value: pcs.yTitle, angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={{ color: CHART_COLORS.tooltipText }}
                  formatter={(v, name) => [Number(v).toFixed(2), name]}
                  labelFormatter={(v) => `Sw = ${Number(v).toFixed(3)}`}
                />
                <Legend {...LEGEND_PROPS} />
                <Line dataKey="Pc" name="Reservoir Pc (working J)" stroke={LINE.alt} strokeWidth={2} dot={false} />
                {pcs.overlay.map((o) => (
                  <Scatter key={o.id} data={o.points.map((p) => ({ Sw: p.x, Pc: p.y }))} dataKey="Pc" name={o.name} fill={o.color.hex} />
                ))}
              </ComposedChart>
            </ChartFrame>
          ) : (
            <p className="py-8 text-center text-sm text-pl-muted">
              {reservoir.error ?? 'Set the reservoir rock properties to scale the J curve to Pc.'}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CapillaryResults;
