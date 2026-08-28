// The gas-lift design plot (Design tab): pressure across, depth down.
// Three lines and the valve markers, which together are the whole
// design argument: the injection line the casing delivers at depth, the
// kill-fluid line the well starts under, the flowing gradient it ends
// on, and the valves placed where those lines allow.
//
// Recharts draws this with layout="vertical": the value axis is X
// (pressure) and the category axis is Y (depth, reversed so deeper is
// lower), which is the orientation every gas-lift text uses.
import React, { useMemo } from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceDot,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useGasLift } from '@/contexts/GasLiftDesignContext';
import { psiaToPsig } from '@/utils/production/gasLift';

const COLOR = {
  injection: '#d97706',
  kill: '#2563eb',
  flowing: '#059669',
  valve: '#dc2626',
};

const PressureDepthChart = () => {
  const { installation, constructionTraverse, inputs } = useGasLift();
  const design = installation.design;

  const data = useMemo(() => {
    if (!design) return [];
    const curve = design.injectionCurve;
    const killGrad = parseFloat(inputs.design.killGradPsiPerFt);
    const whUnload = parseFloat(inputs.design.whUnloadPsig);
    const stations = (constructionTraverse?.points || [])
      .map((p) => ({ tvd: p.tvd, psig: psiaToPsig(p.p) }))
      .sort((a, b) => a.tvd - b.tvd);

    const flowingAt = (tvd) => {
      if (stations.length < 2) return null;
      if (tvd <= stations[0].tvd) return stations[0].psig;
      if (tvd >= stations[stations.length - 1].tvd) return stations[stations.length - 1].psig;
      let i = 1;
      while (i < stations.length && stations[i].tvd < tvd) i += 1;
      const span = stations[i].tvd - stations[i - 1].tvd;
      if (!(span > 0)) return stations[i].psig;
      const f = (tvd - stations[i - 1].tvd) / span;
      return stations[i - 1].psig + f * (stations[i].psig - stations[i - 1].psig);
    };

    return curve.depths.map((tvd, i) => ({
      tvd,
      injection: psiaToPsig(curve.pressures[i]),
      kill: Number.isFinite(killGrad) && Number.isFinite(whUnload)
        ? whUnload + killGrad * tvd
        : null,
      flowing: flowingAt(tvd),
    }));
  }, [design, constructionTraverse, inputs.design.killGradPsiPerFt, inputs.design.whUnloadPsig]);

  if (!design || !data.length) return null;

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          Pressure against depth
          <span className="block text-xs font-normal text-slate-500 mt-0.5">
            The injection line is the real-gas casing column at the operating pressure. Valves sit
            where that line still beats the fluid the well is unloading through.
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ChartFrame height={440} exportFilename="gas-lift-design-plot">
          <ComposedChart layout="vertical" data={data} margin={{ top: 8, right: 28, bottom: 12, left: 8 }}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis
              type="number"
              stroke={CHART_COLORS.axisLine}
              domain={[0, 'dataMax + 100']}
              tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
              label={{
                value: 'Pressure (psig)', position: 'insideBottom', offset: -8,
                fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
              }}
            />
            <YAxis
              type="number"
              dataKey="tvd"
              reversed
              stroke={CHART_COLORS.axisLine}
              domain={[0, 'dataMax']}
              tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
              label={{
                value: 'True vertical depth (ft)', angle: -90, position: 'insideLeft',
                fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
              }}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelStyle={{ color: CHART_COLORS.tooltipText }}
              itemStyle={{ color: CHART_COLORS.tooltipText }}
              formatter={(value, name) => [`${Math.round(Number(value))} psig`, name]}
              labelFormatter={(v) => `${Math.round(Number(v))} ft TVD`}
            />
            <Legend wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText }} />
            <Line
              dataKey="injection" name="Injection gas" stroke={COLOR.injection}
              strokeWidth={2} dot={false} isAnimationActive={false}
            />
            <Line
              dataKey="kill" name="Kill fluid" stroke={COLOR.kill} strokeWidth={1.5}
              strokeDasharray="5 4" dot={false} isAnimationActive={false} connectNulls={false}
            />
            <Line
              dataKey="flowing" name="Flowing gradient" stroke={COLOR.flowing}
              strokeWidth={1.8} dot={false} isAnimationActive={false} connectNulls={false}
            />
            {design.valves.map((v, i) => (
              <ReferenceDot
                key={`${v.depthFt}-${i}`}
                x={v.pInjAtDepthPsig}
                y={v.depthFt}
                r={5}
                fill={COLOR.valve}
                stroke="#ffffff"
                strokeWidth={1}
                isFront
                label={{
                  value: v.valveType === 'orifice' ? 'Orifice' : `V${i + 1}`,
                  position: 'right',
                  fill: COLOR.valve,
                  fontSize: 10,
                }}
              />
            ))}
          </ComposedChart>
        </ChartFrame>
      </CardContent>
    </Card>
  );
};

export default PressureDepthChart;
