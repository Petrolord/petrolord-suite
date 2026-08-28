// The trace: one continuous path from the perforations to the arrival,
// drawn twice.
//
// The PHASE PLOT is the plot a flow assurance engineer actually reads.
// Pressure against temperature, with the hydrate boundary on the same
// axes: anything left of the boundary is inside the hydrate region, and
// the shape of the path says immediately whether the system is close to
// it or comfortably clear. It is the only view in which the boundary
// and the fluid can be compared directly, because the boundary is a
// curve in (P, T) and not a function of distance.
//
// The PROFILE is the same trace against distance, which is what says
// WHERE. The phase plot tells you that you have a problem; the profile
// tells you which spool it is in.
import React, { useMemo, useState } from 'react';
import {
  ComposedChart, Line, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ReferenceArea,
} from 'recharts';
import { Route, Thermometer, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useFlowAssurance } from '@/contexts/FlowAssuranceContext';
import { fmt } from './fields';

const COLOR = {
  wellbore: '#b45309',
  choke: '#7c3aed',
  flowline: '#0891b2',
  riser: '#0d9488',
  hydrate: '#dc2626',
  wat: '#ca8a04',
  ambient: '#64748b',
};

const LEG_LABEL = {
  wellbore: 'Wellbore', choke: 'Choke', flowline: 'Flowline', riser: 'Riser',
};

const TracePanel = () => {
  const { analysis } = useFlowAssurance();
  const [view, setView] = useState('phase');

  const trace = analysis?.trace || [];
  const hydrate = analysis?.hydrate;

  // The phase plot: the path in (T, P), split by leg so each is its own
  // line and the choke shows as the vertical drop it physically is.
  const phaseData = useMemo(() => trace.map((pt) => ({
    tempF: pt.tempF,
    pPsia: pt.pPsia,
    leg: pt.leg,
    [`p_${pt.leg}`]: pt.pPsia,
    sFt: pt.sFt,
    subcoolingF: pt.subcoolingF,
  })), [trace]);

  const curveData = useMemo(() => (hydrate?.curve || [])
    .map((c) => ({ tempF: c.temp, boundary: c.pressure })), [hydrate]);

  // One series for the chart: the trace points and the boundary points
  // share a temperature axis, so they are merged and sorted on it.
  const phaseMerged = useMemo(() => [...phaseData, ...curveData]
    .sort((a, b) => a.tempF - b.tempF), [phaseData, curveData]);

  const profileData = useMemo(() => trace.map((pt) => ({
    sFt: pt.sFt,
    tempF: pt.tempF,
    tHydF: pt.tHydF,
    pPsia: pt.pPsia,
    leg: pt.leg,
  })), [trace]);

  if (!analysis?.ok && !trace.length) {
    return (
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="py-10 text-center space-y-2">
          <p className="text-sm text-slate-400">The trace has not run.</p>
          {(analysis?.errors || []).map((e) => (
            <p key={e} className="text-[11px] text-rose-400">{e}</p>
          ))}
        </CardContent>
      </Card>
    );
  }

  const entry = hydrate?.entry;
  const worst = hydrate?.worst;

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Route className="w-4 h-4 text-cyan-400" /> Perforations to arrival
          </CardTitle>
          <div className="flex gap-1">
            <Button
              size="sm" variant={view === 'phase' ? 'default' : 'outline'}
              className="h-7 text-xs" onClick={() => setView('phase')}
            >
              Phase plot
            </Button>
            <Button
              size="sm" variant={view === 'profile' ? 'default' : 'outline'}
              className="h-7 text-xs" onClick={() => setView('profile')}
            >
              Profile
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {hydrate?.inHydrate ? (
          <p className="text-[11px] text-rose-300 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              The trace crosses into the hydrate region {fmt(entry?.sFt)} ft from the perforations,
              in the {LEG_LABEL[entry?.leg] || entry?.leg?.toLowerCase()}, and stays there for{' '}
              {fmt(hydrate.exposedLengthFt)} ft. The worst point is{' '}
              {fmt(hydrate.maxSubcoolingF, 1)} F inside, at {fmt(worst?.pPsia)} psia and{' '}
              {fmt(worst?.tempF, 1)} F.
            </span>
          </p>
        ) : (
          <p className="text-[11px] text-emerald-400">
            The whole trace stays outside the hydrate region. The closest approach is{' '}
            {fmt(Math.abs(hydrate?.maxSubcoolingF ?? 0), 1)} F clear, at {fmt(worst?.pPsia)} psia.
          </p>
        )}

        {view === 'phase' ? (
          <ChartFrame height={420} exportFilename="flow-assurance-phase-plot">
            <ComposedChart data={phaseMerged} margin={{ top: 8, right: 30, bottom: 14, left: 8 }}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis
                type="number" dataKey="tempF" domain={['dataMin - 5', 'dataMax + 5']}
                stroke={CHART_COLORS.axisLine}
                tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                label={{
                  value: 'Temperature (F)', position: 'insideBottom', offset: -10,
                  fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                }}
              />
              <YAxis
                stroke={CHART_COLORS.axisLine}
                tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                label={{
                  value: 'Pressure (psia)', angle: -90, position: 'insideLeft',
                  fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                }}
              />
              <Tooltip
                {...TOOLTIP_STYLE}
                formatter={(v, n) => [fmt(v, 0), n]}
                labelFormatter={(v) => `${fmt(v, 1)} F`}
              />
              <Legend wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize }} />
              <Line
                type="monotone" dataKey="boundary" name="Hydrate boundary"
                stroke={COLOR.hydrate} strokeWidth={2} strokeDasharray="6 3"
                dot={false} connectNulls isAnimationActive={false}
              />
              {['wellbore', 'flowline', 'riser'].map((leg) => (
                <Line
                  key={leg} type="linear" dataKey={`p_${leg}`} name={LEG_LABEL[leg]}
                  stroke={COLOR[leg]} strokeWidth={2} dot={false} connectNulls
                  isAnimationActive={false}
                />
              ))}
              <Scatter dataKey="p_choke" name="Choke" fill={COLOR.choke} isAnimationActive={false} />
            </ComposedChart>
          </ChartFrame>
        ) : (
          <ChartFrame height={420} exportFilename="flow-assurance-profile">
            <ComposedChart data={profileData} margin={{ top: 8, right: 34, bottom: 14, left: 8 }}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis
                type="number" dataKey="sFt" domain={['dataMin', 'dataMax']}
                stroke={CHART_COLORS.axisLine}
                tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                label={{
                  value: 'Distance along the flow path (ft)', position: 'insideBottom', offset: -10,
                  fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                }}
              />
              <YAxis
                yAxisId="t" stroke={CHART_COLORS.axisLine}
                tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                label={{
                  value: 'Temperature (F)', angle: -90, position: 'insideLeft',
                  fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                }}
              />
              <YAxis
                yAxisId="p" orientation="right" stroke={CHART_COLORS.axisLine}
                tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                label={{
                  value: 'Pressure (psia)', angle: 90, position: 'insideRight',
                  fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                }}
              />
              <Tooltip
                {...TOOLTIP_STYLE}
                formatter={(v, n) => [fmt(v, 1), n]}
                labelFormatter={(v) => `${fmt(v)} ft`}
              />
              <Legend wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize }} />
              {hydrate?.inHydrate && entry && (
                <ReferenceArea
                  yAxisId="t" x1={entry.sFt} x2={hydrate.exit?.sFt ?? entry.sFt}
                  fill={COLOR.hydrate} fillOpacity={0.08}
                />
              )}
              <Line
                yAxisId="t" type="monotone" dataKey="tempF" name="Fluid"
                stroke={COLOR.flowline} strokeWidth={2} dot={false} isAnimationActive={false}
              />
              <Line
                yAxisId="t" type="monotone" dataKey="tHydF" name="Hydrate temperature"
                stroke={COLOR.hydrate} strokeWidth={2} strokeDasharray="6 3"
                dot={false} isAnimationActive={false}
              />
              <Line
                yAxisId="p" type="monotone" dataKey="pPsia" name="Pressure"
                stroke={COLOR.ambient} strokeWidth={1.5} dot={false} isAnimationActive={false}
              />
            </ComposedChart>
          </ChartFrame>
        )}

        <p className="text-[11px] text-slate-600">
          {hydrate?.basis}
        </p>
        <p className="text-[11px] text-slate-600">
          {hydrate?.salinity}
        </p>
      </CardContent>
    </Card>
  );
};

export default TracePanel;
