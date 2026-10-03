import React, { useState, useMemo } from 'react';
import { useDeclineCurve } from '@/contexts/DeclineCurveContext';
import { Button } from '@/components/ui/button';
import { exportChartAsImage } from '@/utils/declineCurve/dcaExport';
import { Camera } from 'lucide-react';
import {
  ResponsiveContainer, ComposedChart, Scatter, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Label,
  ReferenceArea, ReferenceLine,
} from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
import { buildDcaSeries } from '@/utils/declineCurve/dcaSeries';
import { formatDecline, declineBasisLabel } from '@/utils/declineCurve/declineDisplay';
import { useDcaUnits } from '@/components/declineCurve/DcaUnits';
import {
  CHART_COLORS,
  CHART_TYPOGRAPHY,
  CHART_MARGINS,
  GRID_STYLE,
  TOOLTIP_STYLE,
  ANNOTATION_BOX_CLASSNAME,
  getStreamPalette
} from '@/utils/chartTheme';

// The three plots a decline analyst reads (DCA-U1-002, RL6): rate against
// time on a log rate axis with the fit window shaded and the economic limit
// drawn, rate against cumulative, and cumulative against time. They draw
// from buildDcaSeries, the builder the PDF report uses.
const VIEWS = [
  { value: 'rate', label: 'Rate vs time' },
  { value: 'ratecum', label: 'Rate vs cum' },
  { value: 'cum', label: 'Cum vs time' },
];

const dateText = (v) => new Date(v).toISOString().slice(0, 7);

const DCABasePlots = () => {
  const [logScale, setLogScale] = useState(true);
  const [view, setView] = useState('rate');
  const { currentData, selectedStream, streamState, fitWindow } = useDeclineCurve();
  const u = useDcaUnits();
  const st = streamState[selectedStream];
  const fit = st?.fitResults;
  const forecastResults = st?.forecastResults;

  const series = useMemo(() => buildDcaSeries({
    data: currentData, stream: selectedStream, fit, forecast: forecastResults, fitWindow,
    excluded: st?.excluded, forecastConfig: st?.forecastConfig, u,
  }), [currentData, selectedStream, fit, forecastResults, fitWindow, st?.excluded, st?.forecastConfig, u]);

  // On a log axis a single 0 or negative value produces an invalid path
  // coordinate, which silently kills the entire line, so non-positive
  // values become gaps whenever a log axis is on.
  const logOn = logScale && view !== 'cum';
  const logSafe = (v) => {
    if (v == null || !Number.isFinite(v)) return null;
    if (logOn && v <= 0) return null;
    return v;
  };

  // one row per X value, each series in its own key
  const chartData = useMemo(() => {
    const rows = new Map();
    const put = (x, key, y) => {
      if (!Number.isFinite(x)) return;
      const r = rows.get(x) || { x };
      r[key] = logSafe(y);
      rows.set(x, r);
    };
    if (view === 'rate') {
      series.used.forEach(([t, q]) => put(t, 'used', q));
      series.left.forEach(([t, q]) => put(t, 'left', q));
      series.fitted.forEach(([t, q]) => put(t, 'fitted', q));
      series.forecast.forEach(([t, q]) => put(t, 'forecast', q));
      series.p10.forEach(([t, q], i) => { put(t, 'p10', q); put(t, 'p90', series.p90[i]?.[1]); });
    } else if (view === 'ratecum') {
      series.rateCumHistory.forEach(([c, q]) => put(c, 'used', q));
      series.rateCumFitted.forEach(([c, q]) => put(c, 'fitted', q));
      series.rateCumForecast.forEach(([c, q]) => put(c, 'forecast', q));
    } else {
      series.cumHistory.forEach(([t, c]) => put(t, 'used', c));
      series.cumForecast.forEach(([t, c]) => put(t, 'forecast', c));
    }
    return [...rows.values()].sort((a, b) => a.x - b.x);
  }, [series, view, logOn]); // eslint-disable-line react-hooks/exhaustive-deps

  const rateUnit = u.rateLabel(selectedStream);
  const volUnit = u.volumeLabel(selectedStream);
  const yLabel = view === 'cum' ? `Cumulative (${volUnit})` : `Rate (${rateUnit})`;
  const xLabel = view === 'ratecum' ? `Cumulative (${volUnit})` : 'Date';
  const timeAxis = view !== 'ratecum';
  const palette = getStreamPalette(selectedStream);
  const hasProbBand = view === 'rate' && chartData.some((d) => d.p10 != null && d.p90 != null);

  return (
    // data-canvas="chart": the chart standard keeps this card white in both
    // themes, so the tokens inside it resolve to the light roles.
    <div id="dca-main-plot" data-canvas="chart" data-view={view} className="h-full flex flex-col bg-pl-chart-surface rounded-lg border border-pl-border overflow-hidden shadow-pl-sm">
        <div className="p-2 border-b border-pl-border flex flex-wrap gap-2 justify-between items-center bg-pl-sunken">
            <div className="flex flex-wrap gap-1" role="group" aria-label="Plot">
              {VIEWS.map((v) => (
                <Button key={v.value} variant="ghost" size="sm" aria-pressed={view === v.value}
                  className={`text-xs h-7 ${view === v.value ? 'bg-pl-surface text-pl-primary-text border border-pl-border-strong' : 'text-pl-muted'}`}
                  onClick={() => setView(v.value)} data-testid={`dca-view-${v.value}`}>
                  {v.label}
                </Button>
              ))}
              {view !== 'cum' && (
                <Button
                    variant="ghost"
                    size="sm"
                    className={`text-xs h-7 ${
                      logScale
                        ? 'bg-pl-surface text-pl-primary-text border border-pl-border-strong'
                        : 'text-pl-muted'
                    }`}
                    aria-pressed={logScale}
                    onClick={() => setLogScale(!logScale)}
                >
                    {logScale ? 'Log rate' : 'Linear rate'}
                </Button>
              )}
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => exportChartAsImage('dca-main-plot', 'dca_plot')} aria-label="Save the plot as an image" title="Save the plot as an image">
                <Camera size={14} className="text-pl-muted" />
            </Button>
        </div>

        <div className="flex-1 relative min-h-[400px] w-full">
          {!currentData || currentData.length === 0 ? (
            <div className="flex items-center justify-center h-full text-pl-muted text-center">
              Upload production data to begin
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={CHART_MARGINS.standard}>
                  <CartesianGrid {...GRID_STYLE} />
                  <XAxis
                    dataKey="x"
                    type="number"
                    scale={timeAxis ? 'time' : 'linear'}
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={(v) => (timeAxis ? dateText(v) : Math.round(v).toLocaleString())}
                    tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                    axisLine={{ stroke: CHART_COLORS.axisLine, strokeWidth: 1 }}
                    tickLine={{ stroke: CHART_COLORS.axisLine, strokeWidth: 1 }}
                    minTickGap={60}
                  >
                    <Label
                      value={xLabel}
                      position="insideBottom"
                      offset={-5}
                      style={{ fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }}
                    />
                  </XAxis>
                  <YAxis
                    scale={logOn ? 'log' : 'auto'}
                    domain={['auto', 'auto']}
                    allowDataOverflow={false}
                    tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                    axisLine={{ stroke: CHART_COLORS.axisLine, strokeWidth: 1 }}
                    tickLine={{ stroke: CHART_COLORS.axisLine, strokeWidth: 1 }}
                  >
                    <Label
                      value={yLabel}
                      angle={-90}
                      position="insideLeft"
                      style={{ fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }}
                    />
                  </YAxis>
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelFormatter={(v) => (timeAxis ? new Date(v).toISOString().slice(0, 10) : `Cumulative ${Math.round(v).toLocaleString()} ${volUnit}`)}
                    labelStyle={{ color: CHART_COLORS.tooltipText }}
                    itemStyle={{ color: CHART_COLORS.tooltipText }}
                    formatter={(value, name) => {
                      if (Array.isArray(value)) return [`${value[0].toFixed(1)} to ${value[1].toFixed(1)}`, name];
                      if (value == null) return ['n/a', name];
                      if (typeof value === 'number') return [value.toLocaleString(undefined, { maximumFractionDigits: 1 }), name];
                      return ['n/a', name];
                    }}
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

                  {/* the fit window, shaded and named (RL6) */}
                  {view === 'rate' && series.window && (
                    <ReferenceArea x1={series.window.t0} x2={series.window.t1} fill={palette.fitted} fillOpacity={0.07} stroke="none" ifOverflow="visible"
                      label={{ value: 'Fit window', position: 'insideTop', fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
                  )}
                  {view === 'rate' && series.forecastStart && (
                    <ReferenceLine x={series.forecastStart} stroke={CHART_COLORS.axisLine} strokeDasharray="2 3"
                      label={{ value: 'Last data', position: 'insideTopRight', fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
                  )}
                  {view !== 'cum' && series.limit != null && (
                    <ReferenceLine y={series.limit} stroke="#dc2626" strokeDasharray="6 3" ifOverflow="extendDomain"
                      label={{ value: `Economic limit ${series.limit.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${rateUnit}`, position: 'insideBottomLeft', fill: '#dc2626', fontSize: 10 }} />
                  )}
                  {view === 'cum' && series.eur != null && (
                    <ReferenceLine y={series.eur} stroke="#dc2626" strokeDasharray="6 3" ifOverflow="extendDomain"
                      label={{ value: `EUR ${Math.round(series.eur).toLocaleString()} ${volUnit}`, position: 'insideTopLeft', fill: '#dc2626', fontSize: 10 }} />
                  )}

                  {/* isAnimationActive must stay false on every series here:
                      Recharts mount animations freeze mid-interpolation when
                      the tab content remounts or the browser tab is hidden. */}
                  <Scatter
                    dataKey="used"
                    fill={palette.primary}
                    name={view === 'cum' ? 'Cumulative to date' : view === 'ratecum' ? 'Data' : 'Data used in the fit'}
                    shape="circle"
                    isAnimationActive={false}
                  />
                  {view === 'rate' && series.left.length > 0 && (
                    <Scatter
                      dataKey="left"
                      fill="#94a3b8"
                      name="Data left out"
                      shape="diamond"
                      isAnimationActive={false}
                    />
                  )}

                  {view !== 'cum' && (
                    <Line
                      type="monotone"
                      dataKey="fitted"
                      stroke={palette.fitted}
                      strokeWidth={1.5}
                      dot={false}
                      name="Fitted model"
                      connectNulls
                      isAnimationActive={false}
                    />
                  )}

                  {hasProbBand && (<>
                  <Area
                    type="monotone"
                    dataKey={(d) => (d.p10 != null && d.p90 != null) ? [d.p90, d.p10] : null}
                    stroke="none"
                    fill={palette.forecast}
                    fillOpacity={0.18}
                    name="P10 to P90 range"
                    connectNulls={false}
                    isAnimationActive={false}
                    activeDot={false}
                  />
                  <Line type="monotone" dataKey="p10" stroke={palette.p10} strokeWidth={1.5} strokeDasharray="2 4" dot={false} activeDot={false} name="P10 (high)" connectNulls={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="p90" stroke={palette.p90} strokeWidth={1.5} strokeDasharray="8 4" dot={false} activeDot={false} name="P90 (low)" connectNulls={false} isAnimationActive={false} />
                  </>)}

                  <Line
                    type="monotone"
                    dataKey="forecast"
                    stroke={palette.forecast}
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    dot={false}
                    name={hasProbBand ? 'Forecast (fit)' : 'Forecast'}
                    connectNulls
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>

              <ChartLogo />
              {fit && (
                <div className={ANNOTATION_BOX_CLASSNAME} data-testid="dca-plot-annotation">
                  <div className="flex flex-col gap-0.5">
                    <div>Model: {fit.modelType}</div>
                    <div>qi: {(u.rateTo(selectedStream, fit.qi) ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 })} {rateUnit} at {String(fit.t0).slice(0, 10)}</div>
                    <div>Di: {formatDecline(fit.Di, u)} {declineBasisLabel(u)}</div>
                    <div>b: {Number.isFinite(fit.b) ? fit.b.toFixed(2) : 'n/a'}</div>
                    <div>R²: {Number.isFinite(fit.R2) ? fit.R2.toFixed(3) : 'n/a'}</div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
    </div>
  );
};

export default DCABasePlots;
