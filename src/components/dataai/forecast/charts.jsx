// Production Forecasting ML Workbench: charts (Data & AI D4).
//
// White chartTheme with the ChartLogo watermark, one value axis per chart.
// Every plotted number is an engine output from the last run, or a series
// value as loaded. Method colours are fixed per method (never by rank) and
// were checked for colour-vision separation on the white surface; forecasts
// are dashed and fitted values solid, so a line is never told apart by
// colour alone. The x axis is the step index from 0, the engine's own index;
// the tooltip names each step's period as the source labels it.
import React from 'react';
import {
  Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis,
} from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
import {
  CHART_COLORS, CHART_MARGINS, CHART_TYPOGRAPHY, GRID_STYLE, LEGEND_PROPS, PINNED_TOOLTIP_PROPS, XAXIS_LABEL_HEIGHT,
} from '@/utils/chartTheme';
import { fmt } from '@/components/dataai/quality/shared';
import { METHOD_NAMES } from '@/utils/dataAi/forecastWorkflows';

export const METHOD_COLOURS = {
  ses: '#1d4ed8', holt: '#d97706', damped: '#a21caf', arps: '#059669',
};
const HISTORY = '#1e293b';
const tick = { fontSize: CHART_TYPOGRAPHY.axisFontSize, fill: CHART_COLORS.axisText };
const axisLabel = (value, extra = {}) => ({
  value, fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize, ...extra,
});
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export const Frame = ({ children, testId, height = 'h-80' }) => (
  <div className={`relative ${height} rounded-lg bg-white p-2`} data-testid={testId}>
    <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
    <ChartLogo />
  </div>
);

const periodOf = (series, t) => (t < series.values.length ? series.labels[t] : `forecast step ${t - series.values.length + 1}`);

const Axes = ({ unit, xLabel = 'Step (index from 0)' }) => (
  <>
    <CartesianGrid {...GRID_STYLE} />
    <XAxis type="number" dataKey="t" domain={['dataMin', 'dataMax']} allowDecimals={false} tick={tick} stroke={CHART_COLORS.axisLine} height={XAXIS_LABEL_HEIGHT} label={axisLabel(xLabel, { position: 'insideBottom', offset: 0 })} />
    <YAxis tick={tick} stroke={CHART_COLORS.axisLine} width={70} tickFormatter={fmt} label={axisLabel(unit ? `Rate (${unit})` : 'Value', { angle: -90, position: 'insideLeft' })} />
  </>
);

/**
 * History, one-step fitted values and h-step forecasts of each method, the
 * Arps fit and forecast, and when given the bootstrap P90 to P10 band with
 * the P50.
 */
export const ForecastChart = ({
  series, fit, intervals, unit, testId = 'forecast-chart',
}) => {
  const n = series.values.length;
  const h = fit ? fit.h || 0 : intervals ? intervals.result.forecast.length : 0;
  const data = [];
  for (let t = 0; t < n + h; t += 1) data.push({ t, actual: t < n ? series.values[t] : null });
  const lines = [];
  if (fit) {
    Object.entries(fit.fits).forEach(([m, r]) => {
      if (r.error) return;
      r.fitted.forEach((v, t) => { data[t][`${m}Fit`] = v; });
      r.forecast.forEach((v, j) => { data[n + j][`${m}Fc`] = v; });
      lines.push({ key: `${m}Fit`, name: `${cap(METHOD_NAMES[m])}, fitted`, colour: METHOD_COLOURS[m], dash: undefined });
      lines.push({ key: `${m}Fc`, name: `${cap(METHOD_NAMES[m])}, forecast`, colour: METHOD_COLOURS[m], dash: '6 3' });
    });
    if (!fit.arps.error) {
      fit.arps.fitted.forEach((v, t) => { data[t].arpsFit = v; });
      fit.arps.forecast.forEach((v, j) => { data[n + j].arpsFc = v; });
      lines.push({ key: 'arpsFit', name: 'Arps decline, fitted', colour: METHOD_COLOURS.arps, dash: undefined });
      lines.push({ key: 'arpsFc', name: 'Arps decline, forecast', colour: METHOD_COLOURS.arps, dash: '6 3' });
    }
  }
  const pi = intervals && !intervals.result.error ? intervals.result : null;
  if (pi) {
    pi.forecast.forEach((_, j) => {
      if (!data[n + j]) data[n + j] = { t: n + j, actual: null };
      data[n + j].band = [pi.P90[j], pi.P10[j]];
      data[n + j].p50 = pi.P50[j];
    });
  }
  const bandColour = pi ? METHOD_COLOURS[intervals.method] : null;
  return (
    <Frame testId={testId}>
      <ComposedChart data={data} margin={CHART_MARGINS.legend}>
        <Axes unit={unit} />
        <Tooltip {...PINNED_TOOLTIP_PROPS} labelFormatter={(t) => `Step ${t}: ${periodOf(series, t)}`} formatter={(v) => (Array.isArray(v) ? `${fmt(v[0])} to ${fmt(v[1])}` : fmt(v))} />
        <Legend {...LEGEND_PROPS} />
        {pi ? <Area dataKey="band" name={`P90 to P10 band (${METHOD_NAMES[intervals.method]})`} stroke="none" fill={bandColour} fillOpacity={0.15} isAnimationActive={false} connectNulls={false} /> : null}
        {pi ? <Line dataKey="p50" name="P50" stroke={bandColour} strokeWidth={2} strokeDasharray="2 2" dot={false} isAnimationActive={false} connectNulls={false} /> : null}
        <Scatter dataKey="actual" name="History" fill={HISTORY} isAnimationActive={false} shape="circle" />
        {lines.map((l) => (
          <Line key={l.key} dataKey={l.key} name={l.name} stroke={l.colour} strokeWidth={2} strokeDasharray={l.dash} dot={false} isAnimationActive={false} connectNulls={false} />
        ))}
        <ReferenceLine x={n - 0.5} stroke={CHART_COLORS.axisLine} strokeDasharray="3 3" />
      </ComposedChart>
    </Frame>
  );
};

/** One backtest origin: the training history, the actuals after it and each method's forecast from it. */
export const OriginChart = ({
  series, compare, origin, unit, testId = 'origin-chart',
}) => {
  const H = compare.horizon;
  const data = [];
  for (let t = 0; t < origin + H; t += 1) {
    data.push({ t, train: t < origin ? series.values[t] : null, actual: t >= origin ? series.values[t] : null });
  }
  const lines = [];
  compare.rows.forEach((r) => {
    if (r.error) return;
    const o = r.perOrigin.find((x) => x.origin === origin);
    if (!o) return;
    o.forecast.forEach((v, j) => { data[origin + j][r.method] = v; });
    lines.push(r.method);
  });
  return (
    <Frame testId={testId}>
      <ComposedChart data={data} margin={CHART_MARGINS.legend}>
        <Axes unit={unit} />
        <Tooltip {...PINNED_TOOLTIP_PROPS} labelFormatter={(t) => `Step ${t}: ${periodOf(series, t)}`} formatter={(v) => fmt(v)} />
        <Legend {...LEGEND_PROPS} />
        <Scatter dataKey="train" name={`Training values (steps 0 to ${origin - 1})`} fill={HISTORY} isAnimationActive={false} shape="circle" />
        <Scatter dataKey="actual" name="Actuals scored" fill="#64748b" isAnimationActive={false} shape="diamond" />
        {lines.map((m) => (
          <Line key={m} dataKey={m} name={`${cap(METHOD_NAMES[m])}, forecast`} stroke={METHOD_COLOURS[m]} strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3 }} isAnimationActive={false} connectNulls={false} />
        ))}
        <ReferenceLine x={origin - 0.5} stroke={CHART_COLORS.axisLine} strokeDasharray="3 3" label={{ value: `origin ${origin}`, fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize, position: 'top' }} />
      </ComposedChart>
    </Frame>
  );
};

/** Per method, the number of wells where it ranked first. */
export const RankedFirstChart = ({ summary, testId = 'ranked-first-chart' }) => (
  <Frame testId={testId} height="h-64">
    <BarChart data={summary.map((s) => ({ name: cap(METHOD_NAMES[s.method]), method: s.method, first: s.rankedFirst }))} margin={CHART_MARGINS.legend}>
      <CartesianGrid {...GRID_STYLE} />
      <XAxis dataKey="name" tick={tick} stroke={CHART_COLORS.axisLine} height={XAXIS_LABEL_HEIGHT} label={axisLabel('Method', { position: 'insideBottom', offset: 0 })} />
      <YAxis allowDecimals={false} tick={tick} stroke={CHART_COLORS.axisLine} width={60} label={axisLabel('Wells ranked first', { angle: -90, position: 'insideLeft' })} />
      <Tooltip {...PINNED_TOOLTIP_PROPS} formatter={(v) => fmt(v)} />
      <Bar dataKey="first" name="Wells ranked first" radius={[4, 4, 0, 0]} isAnimationActive={false}>
        {summary.map((s) => <Cell key={s.method} fill={METHOD_COLOURS[s.method]} />)}
      </Bar>
    </BarChart>
  </Frame>
);
