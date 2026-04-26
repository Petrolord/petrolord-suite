import React, { useMemo, useState } from 'react';
import { ResponsiveContainer, ComposedChart, Scatter, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Label } from 'recharts';
import { Button } from '@/components/ui/button';
import { calculateArpsHyperbolic } from '@/utils/declineCurve/dcaEngine';
import {
  CHART_COLORS,
  CHART_TYPOGRAPHY,
  CHART_MARGINS,
  GRID_STYLE,
  TOOLTIP_STYLE,
  ANNOTATION_BOX_CLASSNAME
} from '@/utils/chartTheme';

const DCATypeCurvePlot = ({ typeCurve }) => {
  const [logScale, setLogScale] = useState(true);

  // Build chart data: normalized cloud points + smooth fitted curve
  const chartData = useMemo(() => {
    if (!typeCurve || !typeCurve.cloud || !typeCurve.fit) return [];

    const cloud = typeCurve.cloud;
    const fit = typeCurve.fit;
    const t0 = new Date(cloud[0].date).getTime();

    // Compute t_norm (days since synthetic start) for each cloud point and add fitted value
    const points = cloud.map(p => {
      const tDays = (new Date(p.date).getTime() - t0) / 86400000;
      const fitted = calculateArpsHyperbolic(fit.qi, fit.Di, fit.b, tDays);
      return {
        t: tDays,
        observed: p.rate,
        fitted: fitted
      };
    });

    return points;
  }, [typeCurve]);

  if (!typeCurve || !typeCurve.fit) {
    return (
      <div className="w-full h-full min-h-[300px] flex items-center justify-center text-slate-400">
        No type curve selected
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-[400px] flex flex-col bg-white">
      {/* Toolbar */}
      <div className="p-2 border-b border-slate-200 flex justify-between items-center bg-slate-50">
        <Button
          variant="ghost"
          size="sm"
          className={`text-xs h-7 ${
            logScale
              ? 'bg-blue-50 text-blue-700 border border-blue-200'
              : 'text-slate-600'
          }`}
          onClick={() => setLogScale(!logScale)}
        >
          {logScale ? 'Log Scale' : 'Linear Scale'}
        </Button>
        <div className="text-[10px] text-slate-500 font-mono">
          {typeCurve.fit.n} points / {typeCurve.fit.wellCount} wells
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 relative min-h-[350px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={CHART_MARGINS.standard}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis
              dataKey="t"
              type="number"
              domain={['dataMin', 'dataMax']}
              tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
              axisLine={{ stroke: CHART_COLORS.axisLine, strokeWidth: 1 }}
              tickLine={{ stroke: CHART_COLORS.axisLine, strokeWidth: 1 }}
            >
              <Label
                value="Normalized Time (days)"
                position="insideBottom"
                offset={-5}
                style={{ fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }}
              />
            </XAxis>
            <YAxis
              scale={logScale ? 'log' : 'auto'}
              domain={logScale ? ['auto', 'auto'] : [0, 'auto']}
              tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
              axisLine={{ stroke: CHART_COLORS.axisLine, strokeWidth: 1 }}
              tickLine={{ stroke: CHART_COLORS.axisLine, strokeWidth: 1 }}
            >
              <Label
                value="Normalized Rate"
                angle={-90}
                position="insideLeft"
                style={{ fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }}
              />
            </YAxis>
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelFormatter={(value) => `t = ${value.toFixed(0)} days`}
              formatter={(value, name) => [
                typeof value === 'number' ? value.toFixed(3) : 'N/A',
                name
              ]}
            />
            <Legend
              verticalAlign="bottom"
              height={36}
              wrapperStyle={{
                fontSize: `${CHART_TYPOGRAPHY.legendFontSize}px`,
                paddingTop: '10px',
                color: CHART_COLORS.legendText
              }}
            />

            {/* Aggregated cloud — all normalized well data */}
            <Scatter
              dataKey="observed"
              fill="#059669"
              name="Aggregated Well Data"
              shape="circle"
              fillOpacity={0.4}
            />

            {/* Fitted Arps curve through the cloud */}
            <Line
              type="monotone"
              dataKey="fitted"
              stroke="#d97706"
              strokeWidth={2}
              dot={false}
              name="Type Curve (Arps Fit)"
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>

        {/* Parameter annotation box */}
        <div className={ANNOTATION_BOX_CLASSNAME}>
          <div className="flex flex-col gap-0.5">
            <div>Type: {typeCurve.fit.modelType || typeCurve.modelType}</div>
            <div>qi: {typeCurve.fit.qi.toFixed(3)}</div>
            <div>Di: {typeCurve.fit.Di.toFixed(4)}/d</div>
            <div>b: {typeCurve.fit.b.toFixed(2)}</div>
            <div>R²: {typeCurve.fit.R2.toFixed(3)}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DCATypeCurvePlot;
