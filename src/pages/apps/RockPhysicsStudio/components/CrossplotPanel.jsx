// Crossplot panel (U2-001, 2026-10-01): acoustic impedance against Vp/Vs
// for the zone, the samples in situ coloured by a third curve and the
// fluid-substituted samples beside them, over the template lines (the
// critical-porosity sand line for brine and for fluid B, the mudrock line).
// White Recharts card and ChartLogo (suite chart standard). Impedance shows
// in the workstation's display units; the points stay SI.

import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Label, Cell, LabelList,
} from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, CHART_MARGINS, GRID_STYLE, TOOLTIP_STYLE,
} from '@/utils/chartTheme';
import { computeZoneResult } from '../services/zoneResult';
import {
  crossplotPoints, templateLines, crossplotDomain, clipLine, scaleColor, availableColorKeys,
} from '../services/crossplot';
import { impedanceAxis } from '../services/elastic';
import { niceTicks } from '../services/reportPlot';
import { DEFAULT_UNITS, tidyDepth, depthToDisplay } from '../services/units';
import { EMPTY_VALUE } from '@/lib/emptyValue';

const AXIS_TICK = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };
const AXIS_LINE = { stroke: CHART_COLORS.axisLine, strokeWidth: 1 };
const noDot = () => null;
const Diamond = ({ cx, cy }) => (Number.isFinite(cx) && Number.isFinite(cy)
  ? <path d={`M${cx},${cy - 4}L${cx + 4},${cy}L${cx},${cy + 4}L${cx - 4},${cy}Z`} fill="#ffffff" stroke="#d97706" strokeWidth={1.4} />
  : null);

export default function CrossplotPanel({
  model, zones, scenario, rock, units = DEFAULT_UNITS, zoneId, onZoneChange,
}) {
  const zone = zones.find((z) => z.id === zoneId) || zones[0] || null;
  const keys = useMemo(() => availableColorKeys(model), [model]);
  const [colorChoice, setColorChoice] = useState('');
  const colorBy = keys.some((k) => k.key === colorChoice) ? colorChoice : keys[0].key;
  const [showTemplates, setShowTemplates] = useState(true);
  const zU = units.depth;
  const axis = impedanceAxis(units.velocity, units.density);

  const result = useMemo(() => computeZoneResult(model, zone, scenario, rock), [model, zone, scenario, rock]);
  const plot = useMemo(() => {
    if (!result || result.error) return null;
    const pts = crossplotPoints(model, result.indices, result.sub, colorBy);
    const domain = crossplotDomain(pts);
    if (!domain) return { pts, domain: null };
    const t = templateLines(scenario, rock);
    const f = axis.factor;
    const conv = (arr) => arr.map((p) => ({ ...p, x: p.ai * f }));
    return {
      pts,
      domain: { x: [domain.ai[0] * f, domain.ai[1] * f], y: domain.vpvs },
      inSitu: conv(pts.inSitu),
      substituted: conv(pts.substituted),
      template: t,
      brine: conv(clipLine(t.brine, domain)),
      fluidB: conv(clipLine(t.fluidB, domain)),
      mudrock: conv(clipLine(t.mudrock, domain)),
      marks: conv(clipLine(t.marks, domain)),
    };
  }, [result, model, colorBy, scenario, rock, axis.factor]);

  const colorLabel = keys.find((k) => k.key === colorBy)?.label || 'Depth';
  const fmtColor = (v) => (Number.isFinite(v) ? (colorBy === 'depth' ? `${tidyDepth(v, zU)} ${zU}` : v.toFixed(2)) : EMPTY_VALUE);
  const drawnTemplates = !!plot?.domain && showTemplates && !plot.template.error;
  const anyLine = drawnTemplates && (plot.brine.length > 1 || plot.fluidB.length > 1 || plot.mudrock.length > 1);

  return (
    <div className="h-full min-h-0 overflow-y-auto p-3 space-y-3" data-testid="rp-crossplot-panel">
      <div className="flex flex-wrap items-center gap-3 text-[12px] text-pl-text">
        <label className="flex items-center gap-1">
          <span className="text-pl-muted">Zone</span>
          <select
            data-testid="rp-xplot-zone"
            value={zone?.id || ''}
            onChange={(e) => onZoneChange?.(e.target.value)}
            className="bg-pl-surface border border-pl-border-strong rounded px-1.5 py-0.5 text-pl-text"
          >
            {zones.map((z) => (
              <option key={z.id} value={z.id}>{`${z.name} (${tidyDepth(z.top_md_m, zU)}–${tidyDepth(z.base_md_m, zU)} ${zU})`}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          <span className="text-pl-muted">Colour by</span>
          <select
            data-testid="rp-xplot-color"
            value={colorBy}
            onChange={(e) => setColorChoice(e.target.value)}
            className="bg-pl-surface border border-pl-border-strong rounded px-1.5 py-0.5 text-pl-text"
          >
            {keys.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1" title="Critical-porosity sand lines (Nur) for brine and for fluid B with Gassmann, at the conditions and mineral in Scenario & rock; mudrock line (Castagna 1985) with Gardner density">
          <input type="checkbox" data-testid="rp-xplot-templates" checked={showTemplates} onChange={(e) => setShowTemplates(e.target.checked)} className="accent-pl-primary" />
          Template lines
        </label>
        {!zones.length && <span className="text-pl-muted">no zones on this well. Add them in Petrophysics Studio.</span>}
      </div>

      {result?.error && <p className="text-[12px] text-pl-warning-text" data-testid="rp-xplot-error">{result.error}</p>}
      {plot && !plot.domain && <p className="text-[12px] text-pl-warning-text" data-testid="rp-xplot-error">No sample in this zone has Vp, Vs and density together.</p>}

      {plot?.domain && (
        <>
          <p className="text-[12px] text-pl-muted" data-testid="rp-xplot-summary">
            {zone.name}: {plot.pts.inSitu.length} in situ and {plot.pts.substituted.length} substituted points
            {plot.pts.step > 1 ? ` (every ${plot.pts.step}th of ${plot.pts.total} zone samples drawn)` : ''}
            {model.vsSource === 'estimated' ? ' · Vs is estimated, so Vp/Vs follows the Greenberg-Castagna line' : ''}
            {model.vpSource === 'estimated' ? ' · Vp is estimated (no sonic log)' : ''}
          </p>
          <div className="bg-white rounded-lg p-3 relative" data-canvas="chart" style={{ height: 460 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={CHART_MARGINS.standard}>
                <CartesianGrid {...GRID_STYLE} />
                <XAxis dataKey="x" type="number" domain={plot.domain.x} ticks={niceTicks(plot.domain.x[0], plot.domain.x[1], 6).filter((t) => t >= plot.domain.x[0] && t <= plot.domain.x[1])} allowDataOverflow tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={AXIS_LINE} tickFormatter={(v) => v.toFixed(axis.digits)}>
                  <Label value={`Acoustic impedance (${axis.unit})`} position="insideBottom" offset={-5} style={{ fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }} />
                </XAxis>
                <YAxis dataKey="vpvs" type="number" domain={plot.domain.y} ticks={niceTicks(plot.domain.y[0], plot.domain.y[1], 6).filter((t) => t >= plot.domain.y[0] && t <= plot.domain.y[1])} allowDataOverflow tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={AXIS_LINE} tickFormatter={(v) => v.toFixed(2)}>
                  <Label value="Vp/Vs" angle={-90} position="insideLeft" style={{ fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }} />
                </YAxis>
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(v, name) => [name === 'x' ? v.toFixed(axis.digits) : Number(v).toFixed(3), name === 'x' ? `AI (${axis.unit})` : 'Vp/Vs']}
                />
                {drawnTemplates && <Scatter isAnimationActive={false} data={plot.mudrock} line={{ stroke: '#64748b', strokeWidth: 1.5, strokeDasharray: '2 3' }} shape={noDot} legendType="none" name="mudrock" />}
                {drawnTemplates && <Scatter isAnimationActive={false} data={plot.brine} line={{ stroke: '#0284c7', strokeWidth: 1.5 }} shape={noDot} legendType="none" name="brine sand" />}
                {drawnTemplates && plot.fluidB.length > 0 && <Scatter isAnimationActive={false} data={plot.fluidB} line={{ stroke: '#d97706', strokeWidth: 1.5 }} shape={noDot} legendType="none" name="fluid B sand" />}
                {drawnTemplates && plot.marks.length > 0 && (
                  <Scatter isAnimationActive={false} data={plot.marks} fill="#334155" shape="cross" legendType="none" name="porosity">
                    <LabelList dataKey="label" position="right" style={{ fill: '#334155', fontSize: 10 }} />
                  </Scatter>
                )}
                <Scatter isAnimationActive={false} data={plot.inSitu} name="in situ">
                  {plot.inSitu.map((p) => <Cell key={p.md} fill={scaleColor(p.c, plot.pts.colorRange)} />)}
                </Scatter>
                <Scatter isAnimationActive={false} data={plot.substituted} shape={<Diamond />} name="substituted" />
              </ScatterChart>
            </ResponsiveContainer>
            <ChartLogo />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-pl-text" data-testid="rp-xplot-legend">
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: '#1d4ed8' }} />
              in situ, coloured by {colorLabel}
              {plot.pts.colorRange && (
                <>
                  <span className="ml-1">{fmtColor(plot.pts.colorRange[0])}</span>
                  <span className="inline-block w-16 h-2 rounded" style={{ background: 'linear-gradient(to right, rgb(29, 78, 216), rgb(220, 38, 38))' }} />
                  <span>{fmtColor(plot.pts.colorRange[1])}</span>
                </>
              )}
            </span>
            <span className="flex items-center gap-1">
              <svg width="12" height="12"><path d="M6,1L11,6L6,11L1,6Z" fill="#ffffff" stroke="#d97706" strokeWidth="1.4" /></svg>
              substituted (fluid B)
            </span>
            {anyLine ? (
              <>
                {plot.brine.length > 1 && <span className="flex items-center gap-1"><span className="inline-block w-5 border-t-2" style={{ borderColor: '#0284c7' }} /> brine sand line</span>}
                {plot.fluidB.length > 1 && <span className="flex items-center gap-1"><span className="inline-block w-5 border-t-2" style={{ borderColor: '#d97706' }} /> {plot.template.fluidBLabel} sand line</span>}
                {plot.mudrock.length > 1 && <span className="flex items-center gap-1"><span className="inline-block w-5 border-t-2 border-dashed" style={{ borderColor: '#64748b' }} /> mudrock line</span>}
              </>
            ) : null}
          </div>
          {showTemplates && (
            <p className="text-[11px] text-pl-muted" data-testid="rp-xplot-template-note">
              {plot.template.error
                ? `Template lines not drawn: ${plot.template.error}`
                : `Template lines: critical-porosity sand (Nur, critical porosity ${plot.template.phic}) with Gassmann, mineral K ${(plot.template.mineral.k / 1e9).toFixed(1)} GPa and shear ${(plot.template.mineral.mu / 1e9).toFixed(1)} GPa, brine and fluid B at the conditions in Scenario & rock; mudrock line (Castagna 1985) with Gardner density. ${anyLine ? 'Porosity is marked at 0.10, 0.20 and 0.30.' : 'None of them crosses this plot range.'} Soft-sand, stiff-sand and Xu-White models are not in this release.`}
            </p>
          )}
          <p className="sr-only" data-testid="rp-xplot-first">
            {`${(plot.pts.inSitu[0].ai / 1e6).toFixed(4)} ${plot.pts.inSitu[0].vpvs.toFixed(4)} ${plot.pts.substituted[0] ? `${(plot.pts.substituted[0].ai / 1e6).toFixed(4)} ${plot.pts.substituted[0].vpvs.toFixed(4)}` : ''} ${depthToDisplay(plot.pts.inSitu[0].md, zU).toFixed(1)}`}
          </p>
        </>
      )}
    </div>
  );
}
