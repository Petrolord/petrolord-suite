// Deliverability tab: the gas inflow meeting the gas column, and what
// the well makes at the node.
import React, { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceDot,
} from 'recharts';
import { Gauge } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useGasWell } from '@/contexts/GasWellPerformanceContext';
import { fmt, Stat } from './fields';

const COLOR = { ipr: '#2563eb', vlp: '#d97706', op: '#dc2626' };

const DeliverabilityPanel = () => {
  const { result, model } = useGasWell();

  const data = useMemo(() => {
    if (!result?.solved?.curve) return [];
    return result.solved.curve.map((p) => ({
      q: p.q, ipr: p.ipr, vlp: p.vlp,
    }));
  }, [result]);

  if (!result) return null;

  return (
    <div className="space-y-4">
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            <span className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-sky-400" /> What this well delivers
            </span>
            <span className="block text-xs font-normal text-slate-500 mt-0.5">
              The gas inflow meets the gas column at the node. Both halves are the validated nodal
              layer; the analysis puts this well's own numbers into them.
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat
              label="Deliverability"
              value={fmt(result.qMscfd)}
              unit="Mscf/d"
              accent="text-emerald-400"
              hint={`against ${fmt(result.whp)} psia at the wellhead`}
            />
            <Stat
              label="Flowing bottomhole"
              value={fmt(result.pwfPsia)}
              unit="psia"
              hint={`reservoir ${fmt(model.prPsia)} psia`}
            />
            <Stat
              label="Absolute open flow"
              value={fmt(result.aofMscfd)}
              unit="Mscf/d"
              hint="the inflow's own limit, at zero bottomhole pressure"
            />
            <Stat
              label="Drawdown"
              value={fmt(model.prPsia - result.pwfPsia)}
              unit="psi"
              hint={`${fmt(((model.prPsia - result.pwfPsia) / model.prPsia) * 100)} percent of reservoir pressure`}
            />
          </div>

          <ChartFrame height={360} exportFilename="gas-well-nodal">
            <LineChart data={data} margin={{ top: 8, right: 28, bottom: 12, left: 8 }}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis
                type="number"
                dataKey="q"
                domain={['dataMin', 'dataMax']}
                stroke={CHART_COLORS.axisLine}
                tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                label={{
                  value: 'Gas rate (Mscf/d)', position: 'insideBottom', offset: -8,
                  fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                }}
              />
              <YAxis
                stroke={CHART_COLORS.axisLine}
                tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                label={{
                  value: 'Bottomhole pressure (psia)', angle: -90, position: 'insideLeft',
                  fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                }}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={{ color: CHART_COLORS.tooltipText }}
                itemStyle={{ color: CHART_COLORS.tooltipText }}
                formatter={(v, name) => [`${Math.round(Number(v)).toLocaleString()} psia`, name]}
                labelFormatter={(v) => `${Math.round(Number(v)).toLocaleString()} Mscf/d`}
              />
              <Legend wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText }} />
              <Line dataKey="ipr" name="Inflow" stroke={COLOR.ipr} strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line dataKey="vlp" name="Gas column" stroke={COLOR.vlp} strokeWidth={2} dot={false} isAnimationActive={false} />
              <ReferenceDot
                x={result.qMscfd}
                y={result.pwfPsia}
                r={6}
                fill={COLOR.op}
                stroke="#ffffff"
                strokeWidth={1}
                isFront
                label={{ value: 'Operating point', position: 'top', fill: COLOR.op, fontSize: 11 }}
              />
            </LineChart>
          </ChartFrame>
        </CardContent>
      </Card>
    </div>
  );
};

export default DeliverabilityPanel;
