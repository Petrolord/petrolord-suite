// Dynamometer cards (Dyno Cards tab).
//
// Both cards are load against position, plotted as the closed loops
// they are. The surface card is what a dynamometer on the polished rod
// would draw; the downhole card is what the pump is doing, and its
// shape is the whole diagnosis. A full pump gives the classic
// parallelogram: the two vertical sides are the load transfers, during
// which the plunger stands still while the rod string stretches or
// relaxes.
import React, { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useRodPump } from '@/contexts/RodPumpDesignContext';
import { fmt } from './fields';

const COLOR = { surface: '#2563eb', pump: '#059669', weight: '#94a3b8' };

const CardPlot = ({ data, dataKey, name, color, exportFilename, reference, referenceLabel }) => (
  <ChartFrame height={330} exportFilename={exportFilename}>
    <LineChart data={data} margin={{ top: 8, right: 28, bottom: 12, left: 8 }}>
      <CartesianGrid {...GRID_STYLE} />
      <XAxis
        type="number"
        dataKey="positionIn"
        domain={['dataMin', 'dataMax']}
        stroke={CHART_COLORS.axisLine}
        tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
        label={{
          value: 'Position (in)', position: 'insideBottom', offset: -8,
          fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
        }}
      />
      <YAxis
        stroke={CHART_COLORS.axisLine}
        tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
        label={{
          value: 'Load (lb)', angle: -90, position: 'insideLeft',
          fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
        }}
      />
      <Tooltip
        contentStyle={TOOLTIP_STYLE}
        labelStyle={{ color: CHART_COLORS.tooltipText }}
        itemStyle={{ color: CHART_COLORS.tooltipText }}
        formatter={(value) => [`${Math.round(Number(value))} lb`, name]}
        labelFormatter={(v) => `${Number(v).toFixed(1)} in`}
      />
      <Legend wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText }} />
      {Number.isFinite(reference) && (
        <ReferenceLine
          y={reference}
          stroke={COLOR.weight}
          strokeDasharray="4 4"
          label={{
            value: referenceLabel, position: 'insideTopRight',
            fill: COLOR.weight, fontSize: 10,
          }}
        />
      )}
      <Line
        dataKey={dataKey} name={name} stroke={color} strokeWidth={2}
        dot={false} isAnimationActive={false}
      />
    </LineChart>
  </ChartFrame>
);

const DynoCardChart = () => {
  const { design, string } = useRodPump();

  // Close the loop so the card draws as a loop rather than a curve that
  // stops short of where it started.
  const surface = useMemo(() => {
    if (!design) return [];
    const c = design.dynamics.surfaceCard;
    return [...c, c[0]];
  }, [design]);
  const pump = useMemo(() => {
    if (!design) return [];
    const c = design.dynamics.pumpCard;
    return [...c, c[0]];
  }, [design]);

  if (!design) return null;

  return (
    <div className="space-y-4">
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Surface card
            <span className="block text-xs font-normal text-slate-500 mt-0.5">
              What a dynamometer on the polished rod would draw at {fmt(design.spm, 1)} strokes a
              minute. The area it encloses is the work done per stroke:{' '}
              {fmt(design.cardAreaInLb)} in-lb, which is {fmt(design.prhp, 2)} hp at this speed.
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <CardPlot
            data={surface}
            dataKey="loadLb"
            name="Polished rod load"
            color={COLOR.surface}
            exportFilename="rod-pump-surface-card"
            reference={string.weightFluidLb}
            referenceLabel="Buoyed rod weight"
          />
        </CardContent>
      </Card>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Downhole card
            <span className="block text-xs font-normal text-slate-500 mt-0.5">
              What the pump is doing. The two vertical sides are the load transfers: the plunger
              stands still while the rod string stretches at the bottom of the stroke and relaxes at
              the top, which is exactly why the plunger travels{' '}
              {fmt(design.plungerStrokeIn, 1)} in of a {fmt(design.strokeIn)} in stroke.
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <CardPlot
            data={pump}
            dataKey="loadLb"
            name="Load on the plunger"
            color={COLOR.pump}
            exportFilename="rod-pump-downhole-card"
            reference={design.fluidLoadLb}
            referenceLabel="Fluid load"
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default DynoCardChart;
