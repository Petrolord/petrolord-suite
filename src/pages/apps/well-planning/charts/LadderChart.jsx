// Anti-collision ladder plot (WD4): per-offset centre-to-centre
// distance vs reference MD, with the Minimum Allowable Separation
// Distance rendered as the rule boundary — or the separation-factor
// ladder with the no-go/review thresholds. Suite chart standard (white
// chartTheme + ChartLogo).

import React from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import { CHART_COLORS, CHART_MARGINS, TOOLTIP_STYLE, GRID_STYLE } from '@/utils/chartTheme';
import ChartLogo from '@/components/charts/ChartLogo';

const SERIES_COLORS = ['#1d4ed8', '#b45309', '#0f766e', '#7c3aed', '#be185d', '#4d7c0f', '#b91c1c', '#0369a1'];

const axisProps = {
  stroke: CHART_COLORS.axisLine,
  tick: { fill: CHART_COLORS.axisText, fontSize: 10 },
};

/**
 * results: [{id, label, clearance}] from the scan. mode 'distance'
 * plots C-C distance (solid) + MASD (dashed, same hue); mode 'sf'
 * plots SF with the threshold lines.
 */
const LadderChart = ({
  results = [], mode = 'sf', unit = 'm', thresholds = { noGo: 1.0, review: 1.5 },
  metersToUser = (v) => v,
}) => {
  const title = mode === 'sf'
    ? 'Separation-factor ladder (SF vs reference MD)'
    : `Separation ladder (centre-to-centre and MASD vs reference MD, ${unit})`;
  return (
    <div className="bg-white relative flex flex-col min-h-0 min-w-0 h-full w-full">
      <div className="text-[11px] font-semibold text-slate-700 px-3 pt-2">{title}</div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart margin={CHART_MARGINS.compact}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis dataKey="md" type="number" domain={['dataMin', 'dataMax']} {...axisProps}
              tickFormatter={(v) => v.toFixed(0)} allowDuplicatedCategory={false}
              label={{ value: `Reference MD (${unit})`, position: 'insideBottom', offset: -2, fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
            <YAxis type="number" {...axisProps}
              domain={mode === 'sf' ? [0, (max) => Math.min(Math.max(max, 2), 10)] : ['auto', 'auto']}
              allowDataOverflow={mode === 'sf'}
              tickFormatter={(v) => v.toFixed(mode === 'sf' ? 1 : 0)}
              label={{ value: mode === 'sf' ? 'SF (clipped at 10)' : `Distance (${unit})`, angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
            <Tooltip contentStyle={TOOLTIP_STYLE}
              formatter={(v) => (Number.isFinite(v) ? v.toFixed(2) : v)}
              labelFormatter={(v) => `MD ${Number(v).toFixed(0)} ${unit}`} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {mode === 'sf' && (
              <>
                <ReferenceLine y={thresholds.noGo} stroke="#b91c1c" strokeDasharray="4 3"
                  label={{ value: `no-go ${thresholds.noGo}`, fontSize: 9, fill: '#b91c1c', position: 'insideBottomRight' }} />
                <ReferenceLine y={thresholds.review} stroke="#d97706" strokeDasharray="4 3"
                  label={{ value: `review ${thresholds.review}`, fontSize: 9, fill: '#d97706', position: 'insideTopRight' }} />
              </>
            )}
            {results.map((r, i) => {
              const color = SERIES_COLORS[i % SERIES_COLORS.length];
              const rows = r.clearance.md.map((md, j) => ({
                md,
                sf: r.clearance.sf[j],
                distance: metersToUser(r.clearance.distanceCC[j]),
                masd: metersToUser(r.clearance.masd[j]),
              }));
              if (mode === 'sf') {
                return (
                  <Line key={r.id} data={rows} dataKey="sf" name={r.label}
                    stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
                );
              }
              return (
                <React.Fragment key={r.id}>
                  <Line data={rows} dataKey="distance" name={r.label}
                    stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line data={rows} dataKey="masd" name={`${r.label} MASD`}
                    stroke={color} strokeWidth={1.2} strokeDasharray="5 3" dot={false}
                    isAnimationActive={false} legendType="none" />
                </React.Fragment>
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ChartLogo style={{ height: 40 }} />
    </div>
  );
};

export default LadderChart;
