// Rate, ratio and injection trends (Trends tab main area). Suite chart
// standard: white ChartFrame + chartTheme tokens + watermark + PNG
// export. Series come straight from utils/production/surveillance
// (buildFieldSeries / buildWellSeries, movingAverage, decimate) — no
// chart-local arithmetic beyond unit display.
import React, { useMemo } from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { movingAverage, decimate } from '@/utils/production/surveillance';
import { useSurveillance } from '@/contexts/ProductionSurveillanceContext';

// Line colors tuned for the white Petrolord chart background.
const COLOR = {
  oil: '#059669', water: '#2563eb', gas: '#d97706',
  winj: '#4f46e5', ginj: '#be185d', watercut: '#2563eb', gor: '#d97706',
};

// Which keys each stream draws, and on which axis. Gas and GOR ride the
// right axis so a 900 Mscf/d gas line never flattens a 12 stb/d oil line.
const STREAM_SPECS = {
  rates: [
    { key: 'oil', name: 'Oil', unit: 'stb/d', axis: 'left' },
    { key: 'water', name: 'Water', unit: 'stb/d', axis: 'left' },
    { key: 'gas', name: 'Gas', unit: 'Mscf/d', axis: 'right' },
  ],
  injection: [
    { key: 'winj', name: 'Water injection', unit: 'stb/d', axis: 'left' },
    { key: 'ginj', name: 'Gas injection', unit: 'Mscf/d', axis: 'right' },
  ],
  ratios: [
    { key: 'watercut', name: 'Watercut', unit: '%', axis: 'left', scale: 100 },
    { key: 'gor', name: 'GOR', unit: 'scf/stb', axis: 'right' },
  ],
};

const PRODUCING_KEY = { oil: 'oilPd', water: 'waterPd', gas: 'gasPd' };

const AXIS_LABEL = {
  rates: { left: 'Liquid rate (stb/d)', right: 'Gas rate (Mscf/d)' },
  injection: { left: 'Water injection (stb/d)', right: 'Gas injection (Mscf/d)' },
  ratios: { left: 'Watercut (%)', right: 'GOR (scf/stb)' },
};

const TrendsChartPanel = () => {
  const { inputs, fieldSeries, wellSeries, currentField } = useSurveillance();
  const { trends } = inputs;
  const specs = STREAM_SPECS[trends.stream] || STREAM_SPECS.rates;

  const wellEntry = useMemo(
    () => wellSeries.find((s) => s.well.id === trends.wellId) || null,
    [wellSeries, trends.wellId],
  );

  const { data, title, subtitle } = useMemo(() => {
    const isWell = trends.view === 'well';
    const points = isWell ? (wellEntry?.points || []) : fieldSeries;
    if (!points.length) return { data: [], title: '', subtitle: '' };

    // Producing-day rates only exist per well (the field series is a
    // calendar-day total), so the basis switch applies to well views.
    const producing = isWell && trends.basis === 'producing';
    const resolved = specs.map((s) => ({
      ...s,
      sourceKey: producing && PRODUCING_KEY[s.key] ? PRODUCING_KEY[s.key] : s.key,
    }));

    const smooth = parseInt(trends.smoothDays, 10) || 0;
    const smoothed = {};
    if (smooth > 0) {
      resolved.forEach((s) => { smoothed[s.key] = movingAverage(points, s.sourceKey, smooth); });
    }

    const rows = points.map((p, i) => {
      const row = { date: p.date };
      resolved.forEach((s) => {
        const raw = smooth > 0 ? smoothed[s.key][i] : p[s.sourceKey];
        const value = Number.isFinite(raw) ? raw * (s.scale || 1) : null;
        // A log axis has no place for zero, so shut-in and no-injection
        // days drop out of the line rather than being drawn at the floor.
        row[s.key] = trends.logScale && !(value > 0) ? null : value;
      });
      return row;
    });

    return {
      data: decimate(rows),
      title: isWell ? (wellEntry?.well.name || 'Well') : `${currentField?.name || 'Field'} total`,
      subtitle: [
        `${points.length.toLocaleString()} points, ${points[0].date} to ${points[points.length - 1].date}`,
        producing ? 'producing-day rates' : 'calendar-day rates',
        smooth > 0 ? `${smooth}-day average` : null,
      ].filter(Boolean).join(' - '),
    };
  }, [trends, specs, wellEntry, fieldSeries, currentField]);

  const hasRight = specs.some((s) => s.axis === 'right');

  if (!currentField) {
    return (
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="py-10 text-center text-slate-500 text-sm">
          Select a field in the left rail to plot its trends.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          {title || 'Production trends'}
          {subtitle && <span className="block text-xs font-normal text-slate-500 mt-0.5">{subtitle}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {data.length ? (
          <ChartFrame height={380} exportFilename={`surveillance-${trends.stream}`}>
            <ComposedChart data={data} margin={{ top: 8, right: 24, bottom: 4, left: 4 }}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis
                dataKey="date"
                stroke={CHART_COLORS.axisLine}
                tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                minTickGap={40}
              />
              <YAxis
                yAxisId="left"
                scale={trends.logScale ? 'log' : 'auto'}
                domain={trends.logScale ? ['auto', 'auto'] : [0, 'auto']}
                allowDataOverflow={!!trends.logScale}
                stroke={CHART_COLORS.axisLine}
                tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                label={{
                  value: AXIS_LABEL[trends.stream]?.left, angle: -90, position: 'insideLeft',
                  fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                }}
              />
              {hasRight && (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  scale={trends.logScale ? 'log' : 'auto'}
                  domain={trends.logScale ? ['auto', 'auto'] : [0, 'auto']}
                  allowDataOverflow={!!trends.logScale}
                  stroke={CHART_COLORS.axisLine}
                  tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                  label={{
                    value: AXIS_LABEL[trends.stream]?.right, angle: 90, position: 'insideRight',
                    fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize,
                  }}
                />
              )}
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={{ color: CHART_COLORS.tooltipText }}
                itemStyle={{ color: CHART_COLORS.tooltipText }}
                formatter={(value, name) => {
                  const spec = specs.find((s) => s.name === name);
                  const digits = spec?.unit === '%' ? 1 : 0;
                  return [`${Number(value).toLocaleString(undefined, {
                    minimumFractionDigits: digits, maximumFractionDigits: digits,
                  })} ${spec?.unit || ''}`, name];
                }}
              />
              <Legend wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText }} />
              {specs.map((s) => (
                <Line
                  key={s.key}
                  yAxisId={s.axis}
                  type="monotone"
                  dataKey={s.key}
                  name={s.name}
                  stroke={COLOR[s.key]}
                  strokeWidth={1.8}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
            </ComposedChart>
          </ChartFrame>
        ) : (
          <div className="h-72 flex items-center justify-center text-slate-500 text-sm px-6 text-center">
            {trends.view === 'well' && !trends.wellId
              ? 'Pick a well in the left rail.'
              : 'No ledger rows for this selection. Import production data on the Data tab.'}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default TrendsChartPanel;
