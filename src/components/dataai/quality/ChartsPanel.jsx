// Data Quality Studio: charts (Data & AI D1).
//
// White chartTheme with the ChartLogo watermark, one y axis per chart. Every
// plotted number is an engine output from the last run: the channel values
// with the flags the engine raised, the individuals, moving range, EWMA and
// CUSUM charts with their limits, and the Mahalanobis distances with the
// chi-square cutoff.
import React, { useMemo, useState } from 'react';
import {
  CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis,
} from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
import {
  CHART_COLORS, CHART_MARGINS, CHART_TYPOGRAPHY, GRID_STYLE, LEGEND_PROPS, PINNED_TOOLTIP_PROPS, XAXIS_LABEL_HEIGHT,
} from '@/utils/chartTheme';
import { useDataQualityStudio } from '@/contexts/DataQualityStudioContext';
import { indexLabel } from '@/utils/dataAi/qcProfile';
import { EngineError, Note, Section, SelectField, fmt } from './shared';

// Blue for the data, red for flags and limits, amber for a second statistic:
// the hues chartTheme's stream palettes already validate on the white surface.
const SERIES = { data: '#1d4ed8', flag: '#b91c1c', limit: '#b91c1c', second: '#b45309', centre: '#475569' };
const tick = { fontSize: CHART_TYPOGRAPHY.axisFontSize, fill: CHART_COLORS.axisText };
const axisLabel = (value, extra = {}) => ({ value, fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize, ...extra });

const Frame = ({ children, testId, height = 'h-72' }) => (
  <div className={`relative ${height} rounded-lg bg-white p-2`} data-testid={testId}>
    <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
    <ChartLogo />
  </div>
);

const XAx = ({ title }) => (
  <XAxis dataKey="x" tick={tick} stroke={CHART_COLORS.axisLine} height={XAXIS_LABEL_HEIGHT} minTickGap={40}
    label={axisLabel(title, { position: 'insideBottom', offset: 0 })} />
);
const YAx = ({ title }) => (
  <YAxis tick={tick} stroke={CHART_COLORS.axisLine} width={70} tickFormatter={fmt} domain={['auto', 'auto']}
    label={axisLabel(title, { angle: -90, position: 'insideLeft' })} />
);

const SeriesChart = ({ dataset, run }) => {
  const channels = dataset.channels.filter((c) => run.dataset.channels.includes(c.name));
  const [key, setKey] = useState(channels[0]?.key || '');
  const [method, setMethod] = useState('');
  const ch = channels.find((c) => c.key === key) || channels[0];
  const methods = useMemo(() => [...new Set(run.flags.filter((f) => f.channel === ch?.name).map((f) => f.method))], [run, ch]);
  const data = useMemo(() => {
    if (!ch) return [];
    const flagged = new Set(run.flags.filter((f) => f.channel === ch.name && f.index !== null && f.index !== undefined && (!method || f.method === method)).map((f) => f.index));
    return ch.values.map((v, i) => ({ x: indexLabel(dataset, i), v, flag: flagged.has(i) ? v : null }));
  }, [ch, run, method, dataset]);
  if (!ch) return <Note>No channel was checked in the last run.</Note>;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <SelectField label="Channel" value={ch.key} onChange={setKey} options={channels.map((c) => ({ value: c.key, label: c.name }))} className="w-40" />
        <SelectField label="Flags shown" value={method} onChange={setMethod} emptyLabel="Every method" options={methods.map((m) => ({ value: m, label: m }))} className="w-40" />
      </div>
      <Frame testId="series-chart">
        <ComposedChart data={data} margin={CHART_MARGINS.legend}>
          <CartesianGrid {...GRID_STYLE} />
          <XAx title={dataset.index ? `${dataset.index.name}${dataset.index.unit ? ` (${dataset.index.unit})` : ''}` : 'Entry'} />
          <YAx title={`${ch.name}${ch.unit ? ` (${ch.unit})` : ''}`} />
          <Tooltip {...PINNED_TOOLTIP_PROPS} formatter={(v) => fmt(v)} />
          <Legend {...LEGEND_PROPS} />
          <Line type="linear" dataKey="v" name={ch.name} stroke={SERIES.data} strokeWidth={1.5} dot={false} connectNulls={false} isAnimationActive={false} />
          <Scatter dataKey="flag" name="Flagged" fill={SERIES.flag} isAnimationActive={false} />
        </ComposedChart>
      </Frame>
      <Note>Gaps in the line are missing samples. Red points carry at least one flag from the selected method; the flag table gives each reason.</Note>
    </div>
  );
};

const ControlCharts = ({ run }) => {
  const c = run.charts;
  if (!c) return <Note testId="charts-empty">No control chart channel was chosen in the profile.</Note>;
  const x = (j) => c.labels[j];
  const unit = c.unit ? ` (${c.unit})` : '';
  const ind = c.individuals;
  const ew = c.ewma;
  const cu = c.cusum;
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-300" data-testid="chart-window">{c.channel}, entries {c.start} to {c.start + c.values.length - 1} (counted from 0).</p>
      {ind ? (ind.error ? <EngineError result={ind} prefix="Individuals chart" /> : (
        <>
          <p className="text-xs text-slate-400">
            Individuals: centre {fmt(ind.centre)}, sigma {fmt(ind.sigma)} (MRbar {fmt(ind.mrBar)} / 1.128), limits {fmt(ind.lcl)} to {fmt(ind.ucl)}; {ind.outOfControl.length} samples out of control.
          </p>
          <Frame testId="individuals-chart">
            <ComposedChart data={c.values.map((v, j) => ({ x: x(j), v, out: v > ind.ucl || v < ind.lcl ? v : null }))} margin={CHART_MARGINS.legend}>
              <CartesianGrid {...GRID_STYLE} />
              <XAx title={c.axis || 'Entry'} />
              <YAx title={`${c.channel}${unit}`} />
              <Tooltip {...PINNED_TOOLTIP_PROPS} formatter={(v) => fmt(v)} />
              <Legend {...LEGEND_PROPS} />
              <ReferenceLine y={ind.ucl} stroke={SERIES.limit} strokeDasharray="6 3" label={{ value: 'UCL', position: 'insideTopRight', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.annotationFontSize }} />
              <ReferenceLine y={ind.centre} stroke={SERIES.centre} label={{ value: 'CL', position: 'insideTopRight', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.annotationFontSize }} />
              <ReferenceLine y={ind.lcl} stroke={SERIES.limit} strokeDasharray="6 3" label={{ value: 'LCL', position: 'insideBottomRight', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.annotationFontSize }} />
              <Line dataKey="v" name={c.channel} stroke={SERIES.data} strokeWidth={1.5} dot={false} isAnimationActive={false} />
              <Scatter dataKey="out" name="Outside the limits" fill={SERIES.flag} isAnimationActive={false} />
            </ComposedChart>
          </Frame>
          <Frame testId="mr-chart" height="h-56">
            <ComposedChart data={ind.movingRanges.map((v, j) => ({ x: x(j), mr: v }))} margin={CHART_MARGINS.legend}>
              <CartesianGrid {...GRID_STYLE} />
              <XAx title={c.axis || 'Entry'} />
              <YAx title={`Moving range${unit}`} />
              <Tooltip {...PINNED_TOOLTIP_PROPS} formatter={(v) => fmt(v)} />
              <Legend {...LEGEND_PROPS} />
              <ReferenceLine y={ind.mrUcl} stroke={SERIES.limit} strokeDasharray="6 3" label={{ value: `UCL ${fmt(ind.mrUcl)}`, position: 'insideTopRight', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.annotationFontSize }} />
              <Line dataKey="mr" name="Moving range" stroke={SERIES.data} strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </Frame>
        </>
      )) : null}
      {ew ? (ew.error ? <EngineError result={ew} prefix="EWMA chart" /> : (
        <>
          <p className="text-xs text-slate-400">EWMA from EWMA_0 = {fmt(ew.start)}, {ew.basis.limits} limits, {ew.flags.length} signals.</p>
          <Frame testId="ewma-chart">
            <ComposedChart data={ew.points.map((p, j) => ({ x: x(j), e: p.ewma, u: p.ucl, l: p.lcl }))} margin={CHART_MARGINS.legend}>
              <CartesianGrid {...GRID_STYLE} />
              <XAx title={c.axis || 'Entry'} />
              <YAx title={`EWMA${unit}`} />
              <Tooltip {...PINNED_TOOLTIP_PROPS} formatter={(v) => fmt(v)} />
              <Legend {...LEGEND_PROPS} />
              <Line dataKey="e" name="EWMA" stroke={SERIES.data} strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line dataKey="u" name="Upper limit" stroke={SERIES.limit} strokeDasharray="6 3" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              <Line dataKey="l" name="Lower limit" stroke={SERIES.limit} strokeDasharray="2 3" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </Frame>
        </>
      )) : null}
      {cu ? (cu.error ? <EngineError result={cu} prefix="CUSUM chart" /> : (
        <>
          <p className="text-xs text-slate-400">
            Tabular CUSUM, k = {fmt(cu.kData)} and h = {fmt(cu.hData)} in data units. First upward signal {cu.firstSignalHigh === null ? 'none' : `at entry ${c.start + cu.firstSignalHigh}`}; first downward signal {cu.firstSignalLow === null ? 'none' : `at entry ${c.start + cu.firstSignalLow}`}.
          </p>
          <Frame testId="cusum-chart">
            <ComposedChart data={cu.points.map((p, j) => ({ x: x(j), hi: p.sHigh, lo: p.sLow }))} margin={CHART_MARGINS.legend}>
              <CartesianGrid {...GRID_STYLE} />
              <XAx title={c.axis || 'Entry'} />
              <YAx title={`CUSUM${unit}`} />
              <Tooltip {...PINNED_TOOLTIP_PROPS} formatter={(v) => fmt(v)} />
              <Legend {...LEGEND_PROPS} />
              <ReferenceLine y={cu.hData} stroke={SERIES.limit} strokeDasharray="6 3" label={{ value: `h ${fmt(cu.hData)}`, position: 'insideTopRight', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.annotationFontSize }} />
              <Line dataKey="hi" name="S_hi (upward)" stroke={SERIES.data} strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line dataKey="lo" name="S_lo (downward)" stroke={SERIES.second} strokeWidth={2} strokeDasharray="4 2" dot={false} isAnimationActive={false} />
            </ComposedChart>
          </Frame>
        </>
      )) : null}
    </div>
  );
};

const MahalanobisChart = ({ dataset, run }) => {
  const m = run.mahalanobis;
  if (!m) return <Note>Mahalanobis distance was not run. Turn it on in the profile and pick two or more channels.</Note>;
  const r = m.result;
  if (r.error) return <EngineError result={r} prefix="Mahalanobis" />;
  const data = r.d2.map((d, i) => ({ x: indexLabel(dataset, i), d, out: d !== null && d > r.cutoff ? d : null }));
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-400">
        {m.channels.join(' + ')}: {r.n} complete rows, {r.skippedRows.length} skipped for a missing value, cutoff {fmt(r.cutoff)} (chi-square {fmt(r.level)} quantile on {r.p} degrees of freedom), {r.flags.length} rows beyond it.
      </p>
      <Frame testId="mahalanobis-chart">
        <ComposedChart data={data} margin={CHART_MARGINS.legend}>
          <CartesianGrid {...GRID_STYLE} />
          <XAx title={dataset.index ? dataset.index.name : 'Entry'} />
          <YAx title="Squared distance d²" />
          <Tooltip {...PINNED_TOOLTIP_PROPS} formatter={(v) => fmt(v)} />
          <Legend {...LEGEND_PROPS} />
          <ReferenceLine y={r.cutoff} stroke={SERIES.limit} strokeDasharray="6 3" label={{ value: 'cutoff', position: 'insideTopRight', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.annotationFontSize }} />
          <Line dataKey="d" name="d²" stroke={SERIES.data} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <Scatter dataKey="out" name="Beyond the cutoff" fill={SERIES.flag} isAnimationActive={false} />
        </ComposedChart>
      </Frame>
      <Note>The mean and covariance are classical, so a cluster of outliers pulls them and can hide itself (masking).</Note>
    </div>
  );
};

const ChartsPanel = () => {
  const { dataset, run } = useDataQualityStudio();
  if (!dataset || !run) return <Note testId="charts-not-run">Run the QC profile to see the charts.</Note>;
  return (
    <div className="space-y-3" data-testid="charts-panel">
      <Section title="Channel with its flags"><SeriesChart dataset={dataset} run={run} /></Section>
      <Section title="Control charts"><ControlCharts run={run} /></Section>
      <Section title="Mahalanobis distance"><MahalanobisChart dataset={dataset} run={run} /></Section>
    </div>
  );
};

export default ChartsPanel;
