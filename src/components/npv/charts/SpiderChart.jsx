// NPV spider chart (Economics E2: moved onto the Suite chart standard).
//
// Honesty note. The sensitivity run gives three points per parameter: the
// value at minus 30 percent, the base case, and the value at plus 30 percent.
// The lines between them are drawn by LINEAR INTERPOLATION from those real
// endpoints, so intermediate points are not separate engine runs. That is a
// reasonable reading for a smooth response and a poor one where the response
// bends, which is why the endpoints are marked with dots and the note below
// the chart says so. The previous version described this as "mocking plotting
// data", which it is not: the endpoints are real. The interpolation between
// them is the approximation.
import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';

const SWING_PCT = 30;
const POINTS = [-30, -15, 0, 15, 30];
const COLORS = ['#dc2626', '#2563eb', '#059669', '#d97706', '#7c3aed'];
const mm = (v) => (Number.isFinite(v) ? (v / 1e6).toFixed(1) : '-');

const SpiderChart = ({ sensitivityData, height = 320 }) => {
  const tick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };

  const data = POINTS.map((pct) => {
    const point = { pct };
    sensitivityData.forEach((item) => {
      const slope = pct < 0
        ? (item.baseNPV - item.lowParamNPV) / SWING_PCT
        : (item.highParamNPV - item.baseNPV) / SWING_PCT;
      point[item.name] = item.baseNPV + slope * pct;
    });
    return point;
  });

  return (
    <>
      <ChartFrame height={height} exportFilename="npv-spider">
        <LineChart data={data} margin={{ top: 12, right: 24, left: 8, bottom: 28 }}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis
            dataKey="pct" stroke={CHART_COLORS.axisLine} tick={tick}
            tickFormatter={(v) => `${v > 0 ? '+' : ''}${v}%`}
            label={{
              value: 'Change in parameter', position: 'insideBottom', offset: -10,
              fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
            }}
          />
          <YAxis stroke={CHART_COLORS.axisLine} tick={tick} tickFormatter={(v) => `$${mm(v)}MM`} />
          <Tooltip
            {...TOOLTIP_STYLE}
            formatter={(v, name) => [`$${mm(v)}MM`, name]}
            labelFormatter={(v) => `${v > 0 ? '+' : ''}${v}% change`}
          />
          <Legend verticalAlign="top" wrapperStyle={{ fontSize: '12px' }} />
          <ReferenceLine x={0} stroke={CHART_COLORS.axisLine} strokeDasharray="3 3" />
          {sensitivityData.map((item, i) => (
            <Line
              key={item.name} type="linear" dataKey={item.name}
              stroke={COLORS[i % COLORS.length]} strokeWidth={2}
              dot={{ r: 2 }} activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ChartFrame>
      <p className="text-[12px] text-slate-500 mt-2">
        The steeper a line, the more the NPV moves with that parameter. Each line is drawn
        through three computed points, at minus 30 percent, base and plus 30 percent, and
        interpolated in between, so read the slope rather than any single intermediate value.
      </p>
    </>
  );
};

export default SpiderChart;
