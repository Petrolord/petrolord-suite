// Gearbox torque through one revolution (Dyno Cards tab).
//
// Three lines: what the rods ask of the crankshaft, what the
// counterweights give back, and the net the gearbox actually sees. A
// balanced unit shows the same peak on both sides of zero, which is
// what "balanced" means and is what the solver targets.
import React, { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useRodPump } from '@/contexts/RodPumpDesignContext';
import { fmt } from './fields';

const COLOR = { rod: '#d97706', cb: '#2563eb', net: '#dc2626', rating: '#94a3b8' };

const TorqueChart = () => {
  const { design } = useRodPump();

  const data = useMemo(() => {
    if (!design?.balance?.torque) return [];
    return design.balance.torque.map((r) => ({
      deg: (r.thetaRad * 180) / Math.PI,
      rod: r.rodTorqueInLb,
      cb: r.counterbalanceTorqueInLb,
      net: r.netTorqueInLb,
    }));
  }, [design]);

  if (!design?.balance || !data.length) return null;
  const rating = design.rating && Number.isFinite(design.rating.torquePct) && design.rating.torquePct > 0
    ? (design.balance.peakTorqueInLb / design.rating.torquePct) * 100
    : null;

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          Gearbox torque through a revolution
          <span className="block text-xs font-normal text-slate-500 mt-0.5">
            Peak {fmt(design.balance.peakTorqueInLb)} in-lb, on a counterbalance moment of{' '}
            {fmt(design.balance.momentInLb)} in-lb. The counterweights are at the top of their
            travel when the rods are at the bottom of theirs, so they fall through the upstroke,
            which is when the gearbox needs the help.
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ChartFrame height={340} exportFilename="rod-pump-torque">
          <LineChart data={data} margin={{ top: 8, right: 28, bottom: 12, left: 8 }}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis
              type="number"
              dataKey="deg"
              domain={[0, 360]}
              ticks={[0, 90, 180, 270, 360]}
              stroke={CHART_COLORS.axisLine}
              tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
              label={{
                value: 'Crank angle (deg)', position: 'insideBottom', offset: -8,
                fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
              }}
            />
            <YAxis
              stroke={CHART_COLORS.axisLine}
              tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
              label={{
                value: 'Torque (in-lb)', angle: -90, position: 'insideLeft',
                fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
              }}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelStyle={{ color: CHART_COLORS.tooltipText }}
              itemStyle={{ color: CHART_COLORS.tooltipText }}
              formatter={(value, name) => [`${Math.round(Number(value)).toLocaleString()} in-lb`, name]}
              labelFormatter={(v) => `${Math.round(Number(v))} deg`}
            />
            <Legend wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText }} />
            <ReferenceLine y={0} stroke={CHART_COLORS.axisLine} />
            {rating && (
              <>
                <ReferenceLine y={rating} stroke={COLOR.rating} strokeDasharray="4 4" label={{ value: 'Rating', position: 'insideTopRight', fill: COLOR.rating, fontSize: 10 }} />
                <ReferenceLine y={-rating} stroke={COLOR.rating} strokeDasharray="4 4" />
              </>
            )}
            <Line dataKey="rod" name="From the rods" stroke={COLOR.rod} strokeWidth={1.6} dot={false} isAnimationActive={false} />
            <Line dataKey="cb" name="From the counterweights" stroke={COLOR.cb} strokeWidth={1.6} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
            <Line dataKey="net" name="Net at the gearbox" stroke={COLOR.net} strokeWidth={2.2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ChartFrame>
      </CardContent>
    </Card>
  );
};

export default TorqueChart;
