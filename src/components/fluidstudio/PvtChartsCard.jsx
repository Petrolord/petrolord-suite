import React, { useMemo } from 'react';
import {
  ComposedChart, Line, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ChartFrame from '@/components/charts/ChartFrame';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE,
} from '@/utils/chartTheme';
import { useFluidUnits } from '@/components/fluidstudio/FluidUnitsContext';
import { buildPvtSeries, PB_HEX, LAB_HEX } from '@/utils/fluidstudio/pvtSeries';

// round pressure ticks from zero (Wave 2 T1: the axis read 15, 1,515, 3,015, 4,998)
const pressureTicks = (data) => {
  const hi = Math.max(...data.map((d) => d.x));
  const raw = hi / 5;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((st) => st >= raw) || 10 * mag;
  const ticks = [];
  for (let t = 0; t <= hi + step * 0.999; t += step) ticks.push(t);
  return ticks;
};

const tick = (digits) => (v) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-US') : Number(v).toFixed(Math.min(digits, 2)));

const PvtChart = ({ plot, series, labPoints, labLine }) => {
  const data = plot.points;
  if (!data.length) return null;
  const ticks = pressureTicks(data);
  // laboratory tables (FLUID-U2-001) and the single values of the Lab tuning card, as one set of points
  const labAll = [...(plot.lab || []), ...(labPoints || [])];
  return (
    <Card data-testid={`pvt-chart-${plot.id}`} data-points={data.length} data-lab-points={labAll.length}>
      <CardHeader className="pb-2"><CardTitle className="text-base text-pl-text">{plot.title}</CardTitle></CardHeader>
      <CardContent className="p-0">
        <ChartFrame height={264}>
          <ComposedChart data={data} margin={{ top: 12, right: 20, bottom: 4, left: 4 }}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis
              dataKey="x"
              type="number"
              domain={[0, ticks.slice(-1)[0]]}
              ticks={ticks}
              allowDataOverflow={false}
              stroke={CHART_COLORS.axisLine}
              tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
              tickFormatter={(v) => Math.round(v).toLocaleString('en-US')}
              label={{ value: series.xTitle, fill: CHART_COLORS.axisLabel, fontSize: 11, position: 'insideBottom', dy: 12 }}
            />
            <YAxis
              stroke={CHART_COLORS.axisLine}
              tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
              scale={plot.yLog ? 'log' : 'auto'}
              domain={plot.yLog ? ['auto', 'auto'] : [plot.id === 'bo' ? (lo) => Math.floor(lo * 10) / 10 : 0, 'auto']}
              allowDataOverflow={false}
              tickFormatter={tick(plot.digits)}
              width={60}
              label={{ value: plot.yTitle, angle: -90, fill: CHART_COLORS.axisLabel, fontSize: 11, position: 'insideLeft', dy: 40 }}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelStyle={{ color: CHART_COLORS.tooltipText }}
              itemStyle={{ color: CHART_COLORS.tooltipText }}
              labelFormatter={(v) => `${Math.round(v).toLocaleString('en-US')} ${series.xTitle.replace(/^.*\(|\)$/g, '')}`}
              formatter={(v, name) => [Number(v).toPrecision(4), name]}
            />
            <Legend wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText }} />
            {series.pb != null && (
              <ReferenceLine x={series.pb} stroke={PB_HEX} strokeDasharray="4 4" label={{ value: series.pbLabel, fill: PB_HEX, fontSize: 11, position: 'insideTopRight' }} />
            )}
            {labLine && (
              <ReferenceLine x={labLine.x} stroke={LAB_HEX} strokeDasharray="2 3" label={{ value: labLine.label, fill: LAB_HEX, fontSize: 11, position: 'insideBottomRight' }} />
            )}
            <Line type="monotone" dataKey="y" name={plot.yTitle} stroke={plot.hex} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
            {labAll.length > 0 && (
              <Scatter name="Laboratory" data={labAll} dataKey="y" fill={LAB_HEX} shape="circle" isAnimationActive={false} />
            )}
          </ComposedChart>
        </ChartFrame>
      </CardContent>
    </Card>
  );
};

/**
 * The PVT property plots (Bo, Rs, oil viscosity, Z and Bg against pressure)
 * on the shared white ChartFrame, each with the saturation pressure marked.
 * The points are the report's points: both come from buildPvtSeries.
 * `only` limits the plots shown; `lab` adds the single laboratory values of
 * the Lab tuning card (buildLabOverlay); `labData` the laboratory tables,
 * drawn as points on every plot they have a value for.
 */
const PvtChartsCard = ({ table, pb, satKind, only, lab, labData = null }) => {
  const u = useFluidUnits();
  const series = useMemo(() => buildPvtSeries({ rows: table, pb, system: u.system, satKind, labData }), [table, pb, u.system, satKind, labData]);
  const plots = only ? series.plots.filter((p) => only.includes(p.id)) : series.plots;
  if (!plots.some((p) => p.points.length)) return null;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4" data-testid="pvt-charts">
      {plots.map((p) => (
        <PvtChart key={p.id} plot={p} series={series} labPoints={lab?.points?.[p.id]} labLine={lab ? lab.psat : null} />
      ))}
      {series.lab && (
        <div className="xl:col-span-2 text-xs text-pl-muted space-y-1" data-testid="pvt-lab-basis">
          {series.lab.notes.map((n) => <p key={n}>{n}</p>)}
        </div>
      )}
    </div>
  );
};

export default PvtChartsCard;
