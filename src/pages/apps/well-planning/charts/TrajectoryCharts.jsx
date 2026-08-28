// Interim WD0 chart pack for Well Design Studio: plan view, section
// view, and inclination/DLS strips on the Suite chart standard (white
// chartTheme + ChartLogo watermark). The WD2 wave replaces the plan
// view with the equal-aspect SVG editor; these panels make the app
// honest today (they replace the "Chart removed" placeholders).
//
// Rows come from the drilling engine survey table:
// {md, inc, azi, tvd, n, e, dls30m, dls100ft, vs, ...} in the user's
// depth unit.

import React from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceDot, Legend,
} from 'recharts';
import { CHART_COLORS, CHART_MARGINS, TOOLTIP_STYLE, GRID_STYLE } from '@/utils/chartTheme';
import ChartLogo from '@/components/charts/ChartLogo';
import { extentOf } from '../services/extent';

const PANEL_TITLE = 'text-[11px] font-semibold text-slate-700 px-3 pt-2';
const axisProps = {
  stroke: CHART_COLORS.axisLine,
  tick: { fill: CHART_COLORS.axisText, fontSize: 10 },
};

// h-full matters: in the single-view Section mode the panel's parent is
// a flex item with a resolved height, not a stretching grid cell, and
// without it the ResponsiveContainer collapses to 0 and no plot renders.
const Panel = ({ title, children }) => (
  <div className="bg-white relative flex flex-col h-full min-h-0 min-w-0">
    <div className={PANEL_TITLE}>{title}</div>
    <div className="flex-1 min-h-0">{children}</div>
    <ChartLogo style={{ height: 40 }} />
  </div>
);

/** Plan view: North vs East relative to the wellhead, targets marked. */
export const PlanViewPanel = ({ rows, targets = [], unit }) => (
  <Panel title={`Plan view (N vs E, ${unit})`}>
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={rows} margin={CHART_MARGINS.compact}>
        <CartesianGrid {...GRID_STYLE} />
        <XAxis dataKey="e" type="number" name="East" {...axisProps}
          tickFormatter={(v) => v.toFixed(0)}
          label={{ value: `East (${unit})`, position: 'insideBottom', offset: -2, fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
        <YAxis dataKey="n" type="number" name="North" {...axisProps}
          tickFormatter={(v) => v.toFixed(0)}
          label={{ value: `North (${unit})`, angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
        <Tooltip contentStyle={TOOLTIP_STYLE}
          formatter={(v) => v.toFixed(1)}
          labelFormatter={() => ''} />
        <Line dataKey="n" stroke="#166534" strokeWidth={2} dot={false} isAnimationActive={false} />
        {targets.map((t) => (
          Number.isFinite(t.e) && Number.isFinite(t.n)
            ? <ReferenceDot key={t.id} x={t.e} y={t.n} r={4} fill="#d97706" stroke="#92400e" />
            : null
        ))}
      </LineChart>
    </ResponsiveContainer>
  </Panel>
);

/** Compass-style VS axis: pad both sides of the data so the axis
 *  carries negative and positive section, and a vertical hold from
 *  surface (VS ~ 0) sits mid-plot instead of hugging the TVD axis.
 *  The pad floor scales with the TVD span so vertical wells get a
 *  sensible width in either depth unit. */
const vsDomain = (rows, overlays, targets) => {
  const vs = [
    ...rows.map((r) => r.vs),
    ...overlays.flatMap((o) => (o.rows || []).map((r) => r.vs)),
    ...targets.map((t) => t.vs),
  ].filter(Number.isFinite);
  if (!vs.length) return ['auto', 'auto'];
  const { min, max } = extentOf(vs);
  const tvdExtent = extentOf(rows, (r) => r.tvd);
  const tvdSpan = tvdExtent.max === null ? 0 : tvdExtent.max - tvdExtent.min;
  const pad = Math.max((max - min) * 0.1, tvdSpan * 0.05, 1);
  return [Math.floor(min - pad), Math.ceil(max + pad)];
};

/** Section view: TVD (down) vs vertical section. Overlays (WD3
 *  plan-vs-actual) are extra series with their own rows in the same
 *  VS/TVD frame: [{name, rows, color, dash}]. Targets are
 *  [{id, name, vs, tvd}] already projected onto the VS azimuth. */
export const SectionViewPanel = ({ rows, unit, vsAzimuthDeg, overlays = [], targets = [], name = 'Plan' }) => (
  <Panel title={`Section view (TVD vs VS at ${Number.isFinite(vsAzimuthDeg) ? vsAzimuthDeg.toFixed(1) : '--'}°, ${unit})`}>
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={rows} margin={CHART_MARGINS.compact}>
        <CartesianGrid {...GRID_STYLE} />
        <XAxis dataKey="vs" type="number" {...axisProps}
          domain={vsDomain(rows, overlays, targets)}
          allowDataOverflow={false}
          tickFormatter={(v) => v.toFixed(0)}
          label={{ value: `Vertical section (${unit})`, position: 'insideBottom', offset: -2, fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
        <YAxis dataKey="tvd" type="number" reversed {...axisProps}
          tickFormatter={(v) => v.toFixed(0)}
          label={{ value: `TVD (${unit})`, angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
        <Tooltip contentStyle={TOOLTIP_STYLE}
          formatter={(v) => v.toFixed(1)}
          labelFormatter={() => ''} />
        {overlays.length > 0 && <Legend wrapperStyle={{ fontSize: 10 }} />}
        <Line dataKey="tvd" name={name} stroke="#166534" strokeWidth={2} dot={false} isAnimationActive={false} />
        {overlays.map((o) => (
          <Line key={o.name} data={o.rows} dataKey="tvd" name={o.name}
            stroke={o.color || '#b91c1c'} strokeWidth={2}
            strokeDasharray={o.dash || '5 3'} dot={false} isAnimationActive={false} />
        ))}
        {targets.map((t) => (
          Number.isFinite(t.vs) && Number.isFinite(t.tvd)
            ? <ReferenceDot key={t.id} x={t.vs} y={t.tvd} r={4}
                fill="#d97706" stroke="#92400e" ifOverflow="extendDomain"
                label={{ value: t.name, position: 'right', fill: '#92400e', fontSize: 9 }} />
            : null
        ))}
      </LineChart>
    </ResponsiveContainer>
  </Panel>
);

const StripPanel = ({ rows, dataKey, title, color, unit, overlays = [], name = 'Plan' }) => (
  <Panel title={title}>
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={rows} margin={CHART_MARGINS.compact}>
        <CartesianGrid {...GRID_STYLE} />
        <XAxis dataKey="md" type="number" {...axisProps}
          tickFormatter={(v) => v.toFixed(0)}
          label={{ value: `MD (${unit})`, position: 'insideBottom', offset: -2, fill: CHART_COLORS.axisLabel, fontSize: 10 }} />
        <YAxis type="number" {...axisProps} tickFormatter={(v) => v.toFixed(1)} />
        <Tooltip contentStyle={TOOLTIP_STYLE}
          formatter={(v) => v.toFixed(2)}
          labelFormatter={(v) => `MD ${Number(v).toFixed(0)} ${unit}`} />
        {overlays.length > 0 && <Legend wrapperStyle={{ fontSize: 10 }} />}
        <Line dataKey={dataKey} name={name} stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
        {overlays.map((o) => (
          <Line key={o.name} data={o.rows} dataKey={dataKey} name={o.name}
            stroke={o.color || '#b91c1c'} strokeWidth={2}
            strokeDasharray={o.dash || '5 3'} dot={false} isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  </Panel>
);

export const InclinationPanel = ({ rows, unit, overlays }) => (
  <StripPanel rows={rows} dataKey="inc" color="#1d4ed8" unit={unit} title="Inclination (deg) vs MD" overlays={overlays} />
);

export const DlsPanel = ({ rows, unit }) => (
  <StripPanel
    rows={rows}
    dataKey={unit === 'ft' ? 'dls100ft' : 'dls30m'}
    color="#b45309"
    unit={unit}
    title={`Dogleg severity (deg/${unit === 'ft' ? '100ft' : '30m'}) vs MD`}
  />
);
