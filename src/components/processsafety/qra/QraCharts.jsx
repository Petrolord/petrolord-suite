// The QRA Studio charts (PS3), on the Suite chart standard (white chartTheme,
// ChartLogo). Every plotted value is an engine result; the staircase and the
// grid the criterion line is sampled on are the studio's drawing points.
// Each wrapper forwards width and height to its ResponsiveContainer.
import React from 'react';
import {
  CartesianGrid, ComposedChart, Legend, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer,
  Scatter, Tooltip, XAxis, YAxis,
} from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
import {
  CHART_COLORS, CHART_MARGINS, CHART_TYPOGRAPHY, GRID_STYLE, LEGEND_PROPS, PINNED_TOOLTIP_PROPS,
  XAXIS_LABEL_HEIGHT,
} from '@/utils/chartTheme';
import { formatSci } from '@/utils/processSafety/qraStudy';

export const QRA_COLORS = Object.freeze({
  series: '#2563eb',
  criterion: '#dc2626',
  point: '#0f172a',
  unacceptable: '#fecaca',
  tolerable: '#fde68a',
  broadly: '#bbf7d0',
  contour: '#64748b',
});

const tickStyle = { fontSize: CHART_TYPOGRAPHY.axisFontSize, fill: CHART_COLORS.axisText };
const axisLabel = (value, extra = {}) => ({
  value, fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize, ...extra,
});

const decadeDomain = (values) => {
  const v = values.filter((x) => Number.isFinite(x) && x > 0);
  if (v.length === 0) return [1e-8, 1e-2];
  return [10 ** Math.floor(Math.log10(Math.min(...v))), 10 ** Math.ceil(Math.log10(Math.max(...v)))];
};

const Frame = ({ testId, children }) => (
  <div className="relative h-80 rounded-lg bg-white p-2" data-testid={testId}>
    {children}
    <ChartLogo />
  </div>
);

/**
 * Individual risk of each place against the ALARP bands of one criterion.
 * @param {Array<{label: string, ir: number}>} points
 * @param {{unacceptableAbovePerYr: number, broadlyAcceptableAtOrBelowPerYr: number}} limits
 */
export const IrBandChart = ({
  points, limits, testId = 'ir-band-chart', width = '100%', height = '100%',
}) => {
  const up = limits.unacceptableAbovePerYr;
  const low = limits.broadlyAcceptableAtOrBelowPerYr;
  const [d0, d1] = decadeDomain([...points.map((p) => p.ir), up * 10, low / 100]);
  const data = points.map((p) => ({ label: p.label, ir: p.ir > 0 ? p.ir : null }));
  return (
    <Frame testId={testId}>
      <ResponsiveContainer width={width} height={height}>
        <ComposedChart data={data} margin={CHART_MARGINS.legend}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis dataKey="label" type="category" tick={tickStyle} stroke={CHART_COLORS.axisLine} height={XAXIS_LABEL_HEIGHT} />
          <YAxis
            type="number" scale="log" domain={[d0, d1]} allowDataOverflow tick={tickStyle} stroke={CHART_COLORS.axisLine}
            tickFormatter={(v) => formatSci(v, 2)} width={72}
            label={axisLabel('Individual risk (per year)', { angle: -90, position: 'insideLeft' })}
          />
          <ReferenceArea y1={up} y2={d1} fill={QRA_COLORS.unacceptable} fillOpacity={0.6} ifOverflow="hidden" label={{ value: 'UNACCEPTABLE', position: 'insideTopRight', fontSize: CHART_TYPOGRAPHY.annotationFontSize }} />
          <ReferenceArea y1={low} y2={up} fill={QRA_COLORS.tolerable} fillOpacity={0.6} ifOverflow="hidden" label={{ value: 'TOLERABLE (ALARP)', position: 'insideTopRight', fontSize: CHART_TYPOGRAPHY.annotationFontSize }} />
          <ReferenceArea y1={d0} y2={low} fill={QRA_COLORS.broadly} fillOpacity={0.6} ifOverflow="hidden" label={{ value: 'BROADLY_ACCEPTABLE', position: 'insideBottomRight', fontSize: CHART_TYPOGRAPHY.annotationFontSize }} />
          <Tooltip {...PINNED_TOOLTIP_PROPS} formatter={(v) => [`${formatSci(v)} per year`, 'Individual risk']} />
          <Legend {...LEGEND_PROPS} />
          <Scatter name="Individual risk" dataKey="ir" fill={QRA_COLORS.point} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </Frame>
  );
};

/** LSIR along a transect, with the contour levels it is read against. */
export const TransectChart = ({
  distancesM, lsirPerYr, levels, testId = 'transect-chart', width = '100%', height = '100%',
}) => {
  const data = distancesM.map((x, j) => ({ x, ir: lsirPerYr[j] > 0 ? lsirPerYr[j] : null }));
  const [d0, d1] = decadeDomain([...lsirPerYr, ...levels]);
  return (
    <Frame testId={testId}>
      <ResponsiveContainer width={width} height={height}>
        <LineChart data={data} margin={CHART_MARGINS.legend}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis
            dataKey="x" type="number" domain={['dataMin', 'dataMax']} tick={tickStyle} stroke={CHART_COLORS.axisLine}
            height={XAXIS_LABEL_HEIGHT} tickFormatter={(v) => formatSci(v, 3)}
            label={axisLabel('Distance along the transect (m)', { position: 'insideBottom', offset: 0 })}
          />
          <YAxis
            type="number" scale="log" domain={[d0, d1]} allowDataOverflow tick={tickStyle} stroke={CHART_COLORS.axisLine}
            tickFormatter={(v) => formatSci(v, 2)} width={72}
            label={axisLabel('LSIR (per year)', { angle: -90, position: 'insideLeft' })}
          />
          <Tooltip
            {...PINNED_TOOLTIP_PROPS}
            labelFormatter={(v) => `${formatSci(Number(v))} m`}
            formatter={(v) => [`${formatSci(v)} per year`, 'LSIR']}
          />
          <Legend {...LEGEND_PROPS} />
          {levels.map((lv) => (
            <ReferenceLine
              key={lv} y={lv} stroke={QRA_COLORS.contour} strokeDasharray="4 4" ifOverflow="hidden"
              label={{ value: formatSci(lv, 1), position: 'insideRight', fill: QRA_COLORS.contour, fontSize: CHART_TYPOGRAPHY.annotationFontSize }}
            />
          ))}
          <Line
            type="linear" dataKey="ir" name="LSIR" stroke={QRA_COLORS.series} strokeWidth={2}
            dot={{ r: 2 }} isAnimationActive={false} connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </Frame>
  );
};

/**
 * The F-N curve (a staircase of engine points) against a criterion line
 * (engine values on a grid) or criterion points.
 */
export const FnChart = ({
  staircase, line, points, testId = 'fn-chart', width = '100%', height = '100%',
}) => {
  const ns = [...staircase.map((p) => p.n), ...(line || []).map((p) => p.n), ...(points || []).map((p) => p.fatalities)];
  const fs = [...staircase.map((p) => p.f), ...(line || []).map((p) => p.f), ...(points || []).map((p) => p.frequencyPerYr)];
  const xDomain = decadeDomain(ns);
  const yDomain = decadeDomain(fs);
  const pointData = (points || []).map((p) => ({ n: p.fatalities, f: p.frequencyPerYr }));
  return (
    <Frame testId={testId}>
      <ResponsiveContainer width={width} height={height}>
        <ComposedChart margin={CHART_MARGINS.legend}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis
            dataKey="n" type="number" scale="log" domain={xDomain} allowDataOverflow tick={tickStyle}
            stroke={CHART_COLORS.axisLine} height={XAXIS_LABEL_HEIGHT} tickFormatter={(v) => formatSci(v, 2)}
            label={axisLabel('Number of fatalities N', { position: 'insideBottom', offset: 0 })}
          />
          <YAxis
            dataKey="f" type="number" scale="log" domain={yDomain} allowDataOverflow tick={tickStyle}
            stroke={CHART_COLORS.axisLine} tickFormatter={(v) => formatSci(v, 2)} width={72}
            label={axisLabel('F, N or more (per year)', { angle: -90, position: 'insideLeft' })}
          />
          <Tooltip
            {...PINNED_TOOLTIP_PROPS}
            labelFormatter={(v) => `N ${formatSci(Number(v))}`}
            formatter={(v, name) => [`${formatSci(v)} per year`, name]}
          />
          <Legend {...LEGEND_PROPS} />
          <Line
            data={staircase} type="linear" dataKey="f" name="F-N curve" stroke={QRA_COLORS.series}
            strokeWidth={2} dot={false} isAnimationActive={false}
          />
          {line && line.length > 0 ? (
            <Line
              data={line} type="linear" dataKey="f" name="Criterion" stroke={QRA_COLORS.criterion}
              strokeWidth={2} strokeDasharray="6 3" dot={false} isAnimationActive={false}
            />
          ) : null}
          {pointData.length > 0 ? (
            <Scatter data={pointData} dataKey="f" name="Criterion point" fill={QRA_COLORS.criterion} isAnimationActive={false} />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </Frame>
  );
};
