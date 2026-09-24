// Electrofacies Studio: charts (Data & AI D3).
//
// White chartTheme with the ChartLogo watermark. Every plotted number is an
// engine output from the last run, or a log value as loaded. A chart with
// more points than a browser can draw shows every nth row from row 0 and
// says so; the CSV export has every row.
import React from 'react';
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis,
} from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
import {
  CHART_COLORS, CHART_MARGINS, CHART_TYPOGRAPHY, GRID_STYLE, LEGEND_PROPS, PINNED_TOOLTIP_PROPS, XAXIS_LABEL_HEIGHT,
} from '@/utils/chartTheme';
import { fmt, Note } from '@/components/dataai/quality/shared';

/**
 * Class colours: twelve hues that stay apart on the white chart surface
 * (the blue, amber, emerald, red and fuchsia of chartTheme's stream
 * palettes first). A class beyond twelve reuses a colour; the legend says
 * which is which.
 */
export const CLASS_COLOURS = ['#1d4ed8', '#d97706', '#059669', '#b91c1c', '#a21caf', '#0891b2', '#4d7c0f', '#be185d', '#475569', '#c2410c', '#6d28d9', '#0f766e'];
export const colourOf = (i) => CLASS_COLOURS[((i % CLASS_COLOURS.length) + CLASS_COLOURS.length) % CLASS_COLOURS.length];
const SERIES = { main: '#1d4ed8', second: '#b45309', reference: '#475569' };
const tick = { fontSize: CHART_TYPOGRAPHY.axisFontSize, fill: CHART_COLORS.axisText };
const axisLabel = (value, extra = {}) => ({
  value, fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize, ...extra,
});

export const MAX_PLOT_POINTS = 4000;

export const Frame = ({ children, testId, height = 'h-72' }) => (
  <div className={`relative ${height} rounded-lg bg-white p-2`} data-testid={testId}>
    <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
    <ChartLogo />
  </div>
);

export const strideNote = (n, stride) => (stride > 1
  ? `Showing every ${stride}th of ${n.toLocaleString('en-US')} rows, from row 0; the CSV export has them all.`
  : null);

/** The sorted distinct labels of a labelling (nulls left out). */
export const classesOf = (labels) => [...new Set((labels || []).filter((v) => v !== null && v !== undefined))]
  .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

/** Eigenvalues as bars with the cumulative explained ratio as a line. */
export const ScreeChart = ({ pca, testId = 'scree-chart' }) => {
  const data = pca.eigenvalues.map((v, k) => ({ pc: `PC${k + 1}`, eigen: v, cum: pca.cumulativeRatio[k] ?? null }));
  return (
    <Frame testId={testId}>
      <ComposedChart data={data} margin={CHART_MARGINS.legend}>
        <CartesianGrid {...GRID_STYLE} />
        <XAxis dataKey="pc" tick={tick} stroke={CHART_COLORS.axisLine} height={XAXIS_LABEL_HEIGHT} label={axisLabel('Component', { position: 'insideBottom', offset: 0 })} />
        <YAxis yAxisId="e" tick={tick} stroke={CHART_COLORS.axisLine} width={60} tickFormatter={fmt} label={axisLabel('Eigenvalue', { angle: -90, position: 'insideLeft' })} />
        <YAxis yAxisId="c" orientation="right" domain={[0, 1]} tick={tick} stroke={CHART_COLORS.axisLine} width={60} tickFormatter={fmt} label={axisLabel('Cumulative ratio', { angle: 90, position: 'insideRight' })} />
        <Tooltip {...PINNED_TOOLTIP_PROPS} formatter={(v) => fmt(v)} />
        <Legend {...LEGEND_PROPS} />
        <Bar yAxisId="e" dataKey="eigen" name="Eigenvalue" fill={SERIES.main} isAnimationActive={false} />
        <Line yAxisId="c" dataKey="cum" name="Cumulative explained ratio" stroke={SERIES.second} strokeWidth={2} isAnimationActive={false} />
      </ComposedChart>
    </Frame>
  );
};

/** Scores on two components, one colour per class of the labelling given. */
export const ScoreCrossplot = ({
  scores, cx, cy, labels, labelName, testId = 'score-crossplot',
}) => {
  const n = scores.length;
  const stride = Math.max(1, Math.ceil(n / MAX_PLOT_POINTS));
  const classes = labels ? classesOf(labels) : [];
  const groups = labels ? classes.map((c) => ({ c, pts: [] })) : [{ c: 'rows', pts: [] }];
  const unlabelled = [];
  const pos = new Map(classes.map((c, i) => [c, i]));
  for (let j = 0; j < n; j += stride) {
    const p = { x: scores[j][cx], y: scores[j][cy] };
    if (!labels) groups[0].pts.push(p);
    else if (labels[j] === null || labels[j] === undefined) unlabelled.push(p);
    else groups[pos.get(labels[j])].pts.push(p);
  }
  return (
    <div className="space-y-1">
      <Frame testId={testId} height="h-80">
        <ScatterChart margin={CHART_MARGINS.legend}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis type="number" dataKey="x" name={`PC${cx + 1}`} tick={tick} stroke={CHART_COLORS.axisLine} height={XAXIS_LABEL_HEIGHT} domain={['auto', 'auto']} tickFormatter={fmt} label={axisLabel(`PC${cx + 1} score`, { position: 'insideBottom', offset: 0 })} />
          <YAxis type="number" dataKey="y" name={`PC${cy + 1}`} tick={tick} stroke={CHART_COLORS.axisLine} width={60} domain={['auto', 'auto']} tickFormatter={fmt} label={axisLabel(`PC${cy + 1} score`, { angle: -90, position: 'insideLeft' })} />
          <Tooltip {...PINNED_TOOLTIP_PROPS} formatter={(v) => fmt(v)} />
          <Legend {...LEGEND_PROPS} />
          {groups.map((g, i) => (
            <Scatter key={String(g.c)} name={labels ? `${labelName} ${g.c}` : 'Rows'} data={g.pts} fill={colourOf(i)} isAnimationActive={false} shape="circle" />
          ))}
          {unlabelled.length ? <Scatter name="No label" data={unlabelled} fill="#cbd5e1" isAnimationActive={false} shape="circle" /> : null}
        </ScatterChart>
      </Frame>
      {stride > 1 ? <Note>{strideNote(n, stride)}</Note> : null}
    </div>
  );
};

/** Inertia against k, with the mean silhouette on the right axis. */
export const ElbowChart = ({ table, testId = 'elbow-chart' }) => (
  <Frame testId={testId}>
    <LineChart data={table.map((r) => ({ k: r.k, inertia: r.inertia, silhouette: r.silhouette }))} margin={CHART_MARGINS.legend}>
      <CartesianGrid {...GRID_STYLE} />
      <XAxis type="number" dataKey="k" allowDecimals={false} domain={['dataMin', 'dataMax']} tick={tick} stroke={CHART_COLORS.axisLine} height={XAXIS_LABEL_HEIGHT} label={axisLabel('k (clusters)', { position: 'insideBottom', offset: 0 })} />
      <YAxis yAxisId="i" tick={tick} stroke={CHART_COLORS.axisLine} width={70} tickFormatter={fmt} label={axisLabel('Inertia', { angle: -90, position: 'insideLeft' })} />
      <YAxis yAxisId="s" orientation="right" tick={tick} stroke={CHART_COLORS.axisLine} width={60} tickFormatter={fmt} label={axisLabel('Mean silhouette', { angle: 90, position: 'insideRight' })} />
      <Tooltip {...PINNED_TOOLTIP_PROPS} formatter={(v) => fmt(v)} />
      <Legend {...LEGEND_PROPS} />
      <Line yAxisId="i" dataKey="inertia" name="Inertia" stroke={SERIES.main} strokeWidth={2} isAnimationActive={false} />
      <Line yAxisId="s" dataKey="silhouette" name="Mean silhouette" stroke={SERIES.second} strokeWidth={2} strokeDasharray="4 2" connectNulls={false} isAnimationActive={false} />
    </LineChart>
  </Frame>
);

/** Merge heights of the last merges, by the number of clusters each merge leaves. */
export const MergeHeightsChart = ({ heights, n, testId = 'merge-heights' }) => {
  const last = Math.min(30, heights.length);
  const data = [];
  for (let s = heights.length - last; s < heights.length; s += 1) data.push({ clusters: n - s - 1, height: heights[s] });
  return (
    <Frame testId={testId} height="h-64">
      <ComposedChart data={data} margin={CHART_MARGINS.legend}>
        <CartesianGrid {...GRID_STYLE} />
        <XAxis type="number" dataKey="clusters" allowDecimals={false} domain={['dataMin', 'dataMax']} reversed tick={tick} stroke={CHART_COLORS.axisLine} height={XAXIS_LABEL_HEIGHT} label={axisLabel('Clusters left after the merge', { position: 'insideBottom', offset: 0 })} />
        <YAxis tick={tick} stroke={CHART_COLORS.axisLine} width={70} tickFormatter={fmt} label={axisLabel('Merge height', { angle: -90, position: 'insideLeft' })} />
        <Tooltip {...PINNED_TOOLTIP_PROPS} formatter={(v) => fmt(v)} />
        <Bar dataKey="height" name="Merge height" fill={SERIES.main} isAnimationActive={false} />
      </ComposedChart>
    </Frame>
  );
};

/**
 * Depth tracks for one well: a log curve, then one facies column per
 * labelling. Each sample fills from halfway to the sample above to halfway
 * to the sample below; a sample with no label is left blank. Depth down.
 */
export const FaciesTracks = ({
  depth, curve, curveName, tracks, depthLabel, testId = 'facies-tracks',
}) => {
  const n = depth.length;
  if (!n) return null;
  const W = 140 + 90 * tracks.length + 20;
  const H = 520;
  const top = 28;
  const bottom = H - 12;
  let dMin = Infinity;
  let dMax = -Infinity;
  depth.forEach((d) => { if (d < dMin) dMin = d; if (d > dMax) dMax = d; });
  if (dMax === dMin) dMax = dMin + 1;
  const y = (d) => top + ((d - dMin) / (dMax - dMin)) * (bottom - top);
  const edge = (j, dir) => {
    const k = j + dir;
    if (k < 0 || k >= n) return depth[j] + (dir * (dMax - dMin)) / (2 * Math.max(1, n - 1));
    return (depth[j] + depth[k]) / 2;
  };
  let cMin = Infinity;
  let cMax = -Infinity;
  (curve || []).forEach((v) => { if (v !== null && Number.isFinite(v)) { if (v < cMin) cMin = v; if (v > cMax) cMax = v; } });
  if (cMax === cMin) cMax = cMin + 1;
  const cx0 = 60;
  const cw = 70;
  const cxs = (v) => cx0 + ((v - cMin) / (cMax - cMin)) * cw;
  const path = [];
  (curve || []).forEach((v, j) => {
    if (v === null || !Number.isFinite(v)) return;
    path.push(`${path.length ? 'L' : 'M'}${cxs(v).toFixed(2)},${y(depth[j]).toFixed(2)}`);
  });
  const ticks = [];
  for (let t = 0; t <= 5; t += 1) ticks.push(dMin + ((dMax - dMin) * t) / 5);
  return (
    <div className="relative overflow-x-auto rounded-lg bg-white p-2" data-testid={testId}>
      <svg width={W} height={H} role="img" aria-label="Facies depth tracks" style={{ fontFamily: 'inherit' }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={52} x2={W - 10} y1={y(t)} y2={y(t)} stroke={CHART_COLORS.grid} />
            <text x={48} y={y(t) + 3} textAnchor="end" fontSize={CHART_TYPOGRAPHY.axisFontSize} fill={CHART_COLORS.axisText}>{fmt(t)}</text>
          </g>
        ))}
        <text x={4} y={14} fontSize={CHART_TYPOGRAPHY.axisFontSize} fill={CHART_COLORS.axisLabel}>{depthLabel}</text>
        <text x={cx0 + cw / 2} y={14} textAnchor="middle" fontSize={CHART_TYPOGRAPHY.axisFontSize} fill={CHART_COLORS.axisLabel}>{curveName}</text>
        <rect x={cx0} y={top} width={cw} height={bottom - top} fill="none" stroke={CHART_COLORS.axisLine} />
        {path.length ? <path d={path.join('')} fill="none" stroke={SERIES.main} strokeWidth={1} /> : null}
        {tracks.map((tr, t) => {
          const x = 140 + 90 * t;
          const classes = tr.classes || classesOf(tr.labels);
          const pos = new Map(classes.map((c, i) => [c, i]));
          const rects = [];
          let j = 0;
          while (j < n) {
            const v = tr.labels[j];
            let e = j;
            while (e + 1 < n && tr.labels[e + 1] === v) e += 1;
            if (v !== null && v !== undefined) {
              const y0 = y(edge(j, -1));
              const y1 = y(edge(e, 1));
              rects.push(<rect key={j} x={x} y={Math.min(y0, y1)} width={70} height={Math.max(0.5, Math.abs(y1 - y0))} fill={colourOf(pos.get(v))} />);
            }
            j = e + 1;
          }
          return (
            <g key={tr.name} data-testid={`track-${tr.key || t}`}>
              <text x={x + 35} y={14} textAnchor="middle" fontSize={CHART_TYPOGRAPHY.axisFontSize} fill={CHART_COLORS.axisLabel}>{tr.name}</text>
              {rects}
              <rect x={x} y={top} width={70} height={bottom - top} fill="none" stroke={CHART_COLORS.axisLine} />
            </g>
          );
        })}
      </svg>
      <ChartLogo />
    </div>
  );
};

/** Colour chips for the classes of one labelling. */
export const ClassLegend = ({ name, classes, describe = (c) => String(c) }) => (
  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
    <span className="text-slate-400">{name}:</span>
    {classes.map((c, i) => (
      <span key={String(c)} className="inline-flex items-center gap-1">
        <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: colourOf(i) }} />
        {describe(c)}
      </span>
    ))}
  </div>
);
