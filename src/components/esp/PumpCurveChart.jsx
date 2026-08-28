// The pump curve (Pump Curve tab): what the selected stack makes across
// its published rate range at the drive frequency, with the duty point
// on it. Pure curve arithmetic, no traverses, so this stays live as you
// type. The shaded band is the vendor's recommended range; outside it
// the pump is in thrust and the numbers are an extrapolation.
import React, { useMemo } from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceDot, ReferenceArea,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useEsp } from '@/contexts/EspDesignContext';

const COLOR = { head: '#2563eb', efficiency: '#059669', duty: '#dc2626' };

const fmt = (v, digits = 0) => (Number.isFinite(v)
  ? v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  : '--');

const PumpCurveChart = () => {
  const { design, curve, stackCurvePoints } = useEsp();

  const data = useMemo(() => stackCurvePoints.map((p) => ({
    qBpd: p.qBpd,
    headFt: p.headFt,
    efficiencyPct: Number.isFinite(p.efficiency) ? p.efficiency * 100 : null,
  })), [stackCurvePoints]);

  if (!design || !data.length) return null;

  // The recommended band is published at the curve's reference speed,
  // so it moves with the drive frequency exactly as the curve does.
  const ratio = design.hz / (curve.refHz || 60);
  const bandLo = curve.qMin * ratio;
  const bandHi = curve.qMax * ratio;

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          {fmt(design.sized.stages)} stages at {fmt(design.hz)} Hz
          <span className="block text-xs font-normal text-slate-500 mt-0.5">
            {curve.source === 'vendor'
              ? `Fitted through ${curve.points.length} points off the vendor curve, published at ${fmt(curve.refHz)} Hz.`
              : `${curve.label}. A model shape with named parameters, not a manufacturer's pump.`}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ChartFrame height={380} exportFilename="esp-pump-curve">
          <ComposedChart data={data} margin={{ top: 8, right: 28, bottom: 12, left: 8 }}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis
              type="number"
              dataKey="qBpd"
              domain={['dataMin', 'dataMax']}
              stroke={CHART_COLORS.axisLine}
              tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
              label={{
                value: 'Rate through the pump (bbl/d, in situ)', position: 'insideBottom', offset: -8,
                fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
              }}
            />
            <YAxis
              yAxisId="head"
              stroke={CHART_COLORS.axisLine}
              tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
              label={{
                value: 'Head (ft)', angle: -90, position: 'insideLeft',
                fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
              }}
            />
            <YAxis
              yAxisId="eff"
              orientation="right"
              domain={[0, 100]}
              stroke={CHART_COLORS.axisLine}
              tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
              label={{
                value: 'Efficiency (%)', angle: 90, position: 'insideRight',
                fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
              }}
            />
            <ReferenceArea
              yAxisId="head" x1={bandLo} x2={bandHi}
              fill={COLOR.head} fillOpacity={0.06} stroke="none"
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelStyle={{ color: CHART_COLORS.tooltipText }}
              itemStyle={{ color: CHART_COLORS.tooltipText }}
              formatter={(value, name) => [
                name === 'Efficiency' ? `${Number(value).toFixed(1)} %` : `${Math.round(Number(value))} ft`,
                name,
              ]}
              labelFormatter={(v) => `${Math.round(Number(v))} bbl/d`}
            />
            <Legend wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText }} />
            <Line
              yAxisId="head" dataKey="headFt" name="Head from the stack" stroke={COLOR.head}
              strokeWidth={2} dot={false} isAnimationActive={false}
            />
            <Line
              yAxisId="eff" dataKey="efficiencyPct" name="Efficiency" stroke={COLOR.efficiency}
              strokeWidth={1.6} strokeDasharray="5 4" dot={false} isAnimationActive={false}
              connectNulls={false}
            />
            <ReferenceDot
              yAxisId="head"
              x={design.duty.pumpIntakeBpd}
              y={design.duty.tdhFt}
              r={6}
              fill={COLOR.duty}
              stroke="#ffffff"
              strokeWidth={1}
              isFront
              label={{
                value: 'Duty', position: 'top', fill: COLOR.duty, fontSize: 11,
              }}
            />
          </ComposedChart>
        </ChartFrame>
      </CardContent>
    </Card>
  );
};

export default PumpCurveChart;
