// VRR trend and voidage by term (VRR Monitor main area, Dashboard tab).
// Suite chart standard: white ChartFrame + chartTheme tokens + watermark +
// PNG export. The series come from src/utils/vrr/series.js, the same
// builders the report figures draw (VRR-U1, RL6).
import React, { useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceArea, Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useVrrMonitor } from '@/contexts/VrrMonitorContext';
import { trendRows, termRows } from '@/utils/vrr/series';

// Line colors tuned for the white Petrolord chart background.
const LINE = { inst: '#2563eb', cum: '#059669', roll: '#d97706', ref: '#dc2626', band: '#10b981' };
const TERM = { oil: '#166534', water: '#2563eb', freeGas: '#dc2626', injWater: '#0e7490', injGas: '#be185d' };
const axisProps = { stroke: CHART_COLORS.axisLine, tick: { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize } };
const round = (v) => (Number.isFinite(v) ? Math.round(v) : null);

const VrrChartsPanel = () => {
  const derived = useVrrMonitor();
  const { targetBand, u, withheld } = derived;
  const chartData = useMemo(() => trendRows(derived), [derived]);
  const terms = useMemo(() => termRows(derived, u.system).map((t) => ({
    label: t.label, oil: round(t.oil), water: round(t.water), freeGas: round(t.freeGas), injWater: round(t.injWater), injGas: round(t.injGas),
  })), [derived, u.system]);
  const anyTerms = terms.some((t) => t.oil || t.water || t.freeGas || t.injWater || t.injGas);

  return (
    <>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">VRR trend</CardTitle></CardHeader>
        <CardContent className="p-0">
          {chartData.length ? (
            <ChartFrame height={300} exportFilename="vrr-trend">
              <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
                <CartesianGrid {...GRID_STYLE} />
                <XAxis dataKey="label" padding={{ left: 12, right: 24 }} {...axisProps} />
                <YAxis {...axisProps} domain={[0, 'auto']} />
                <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: CHART_COLORS.tooltipText }} itemStyle={{ color: CHART_COLORS.tooltipText }} />
                <Legend wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText }} />
                <ReferenceArea
                  y1={targetBand.min}
                  y2={targetBand.max}
                  fill={LINE.band}
                  fillOpacity={0.08}
                  stroke={LINE.band}
                  strokeOpacity={0.35}
                  strokeDasharray="3 3"
                  ifOverflow="extendDomain"
                />
                <ReferenceLine y={1} stroke={LINE.ref} strokeDasharray="5 5" label={{ value: 'VRR = 1', fill: LINE.ref, fontSize: 11, position: 'insideBottomLeft' }} />
                <Line type="monotone" dataKey="instantaneous" name="Instantaneous" stroke={LINE.inst} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
                <Line type="monotone" dataKey="rolling" name="Rolling" stroke={LINE.roll} strokeWidth={1.5} strokeDasharray="6 3" dot={false} connectNulls isAnimationActive={false} />
                <Line type="monotone" dataKey="cumulative" name="Cumulative" stroke={LINE.cum} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
              </LineChart>
            </ChartFrame>
          ) : (
            <div className="h-72 flex items-center justify-center px-6 text-center text-pl-muted text-sm">
              {withheld || 'Enter production & injection volumes on the Data tab to see the VRR trend.'}
            </div>
          )}
        </CardContent>
      </Card>
      {anyTerms && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Reservoir voidage by term <span className="text-xs font-normal text-pl-muted ml-1">{u.label('reservoir')} per period: produced (left stack) and injected (right stack)</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ChartFrame height={280} exportFilename="vrr-voidage-terms">
              <BarChart data={terms} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
                <CartesianGrid {...GRID_STYLE} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} />
                <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: CHART_COLORS.tooltipText }} itemStyle={{ color: CHART_COLORS.tooltipText }} />
                <Legend wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText }} />
                <Bar dataKey="oil" name="Oil" stackId="p" fill={TERM.oil} isAnimationActive={false} />
                <Bar dataKey="water" name="Water" stackId="p" fill={TERM.water} isAnimationActive={false} />
                <Bar dataKey="freeGas" name="Free gas" stackId="p" fill={TERM.freeGas} isAnimationActive={false} />
                <Bar dataKey="injWater" name="Water injected" stackId="i" fill={TERM.injWater} isAnimationActive={false} />
                <Bar dataKey="injGas" name="Gas injected" stackId="i" fill={TERM.injGas} isAnimationActive={false} />
              </BarChart>
            </ChartFrame>
          </CardContent>
        </Card>
      )}
    </>
  );
};

export default VrrChartsPanel;
