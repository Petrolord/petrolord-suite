// Crossplot panel (U2-001, 2026-10-01): acoustic impedance against Vp/Vs
// for the zone, the samples in situ coloured by a third curve and the
// fluid-substituted samples beside them, over the template lines (the
// critical-porosity sand line for brine and for fluid B, the mudrock line).
// White Recharts card and ChartLogo (suite chart standard). Impedance shows
// in the workstation's display units; the points stay SI.
// QI Q2 (2026-10-06): the sand lines follow a chosen rock model (critical
// porosity, soft sand, stiff sand, constant cement, Xu-White) with its
// parameters, and soft or stiff sand can be fitted to the zone's
// water-bearing samples.

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
  ROCK_MODELS, ROCK_MODEL_DEFAULTS, CALIBRATABLE_MODELS, calibrateZoneModel, WET_SW,
} from '../services/crossplot';
import { impedanceAxis } from '../services/elastic';
import { niceTicks } from '../services/reportPlot';
import { DEFAULT_UNITS, tidyDepth, depthToDisplay } from '../services/units';
import { EMPTY_VALUE } from '@/lib/emptyValue';

const AXIS_TICK = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };
const AXIS_LINE = { stroke: CHART_COLORS.axisLine, strokeWidth: 1 };
const noDot = () => null;

// the parameters each rock model takes, in the order they are shown
const MODEL_FIELDS = {
  soft: ['n', 'pMPa', 'phiC'],
  stiff: ['n', 'pMPa', 'phiC'],
  constantCement: ['n', 'phiC', 'phiB'],
  xuWhite: ['clayShare', 'alphaSand', 'alphaClay'],
};
const FIELD_LABELS = {
  n: { label: 'Coordination n', title: 'Average number of grain contacts (about 6 to 12 for sands)' },
  pMPa: { label: 'Eff. pressure (MPa)', title: 'Effective (overburden minus pore) pressure on the grain pack' },
  phiC: { label: 'Critical φ', title: 'Porosity of the unconsolidated grain pack (about 0.36 to 0.40)' },
  phiB: { label: 'Cemented φ', title: 'Porosity of the well-sorted end member once cemented; constant cement keeps this cement amount' },
  clayShare: { label: 'Clay pore share', title: 'Share of the pore volume tied to clay (compliant pores)' },
  alphaSand: { label: 'Sand pore aspect', title: 'Aspect ratio of the stiff sand pores (about 0.1 to 0.15)' },
  alphaClay: { label: 'Clay pore aspect', title: 'Aspect ratio of the compliant clay pores (about 0.02 to 0.05)' },
};
const LINE_NOUNS = {
  critical: 'sand line', soft: 'soft-sand line', stiff: 'stiff-sand line', constantCement: 'constant-cement line', xuWhite: 'Xu-White line',
};
const parsedParams = (raw) => Object.fromEntries(
  Object.entries(raw).map(([k, v]) => [k, parseFloat(v)]).filter(([, v]) => Number.isFinite(v)),
);
const Diamond = ({ cx, cy }) => (Number.isFinite(cx) && Number.isFinite(cy)
  ? <path d={`M${cx},${cy - 4}L${cx + 4},${cy}L${cx},${cy + 4}L${cx - 4},${cy}Z`} fill="#ffffff" stroke="#d97706" strokeWidth={1.4} />
  : null);

/** One line naming the model and its parameters, for the note under the plot. */
export function modelNote(t) {
  const p = t.modelParams || {};
  switch (t.rockModel) {
    case 'soft': return `soft sand (Hertz-Mindlin pack, modified lower Hashin-Shtrikman; n ${p.n}, ${p.pMPa} MPa effective, critical porosity ${p.phiC})`;
    case 'stiff': return `stiff sand (Hertz-Mindlin pack, modified upper Hashin-Shtrikman; n ${p.n}, ${p.pMPa} MPa effective, critical porosity ${p.phiC})`;
    case 'constantCement': return `constant cement (Avseth; Dvorkin-Nur contact cement at porosity ${p.phiB} from a ${p.phiC} pack, n ${p.n}, cement of the mineral)`;
    case 'xuWhite': return `Xu-White (differential effective medium, sand pores aspect ${p.alphaSand}, clay pores aspect ${p.alphaClay}, clay share ${p.clayShare} of the pore space)`;
    default: return `critical-porosity sand (Nur, critical porosity ${t.phic})`;
  }
}

export default function CrossplotPanel({
  model, zones, scenario, rock, units = DEFAULT_UNITS, zoneId, onZoneChange,
}) {
  const zone = zones.find((z) => z.id === zoneId) || zones[0] || null;
  const keys = useMemo(() => availableColorKeys(model), [model]);
  const [colorChoice, setColorChoice] = useState('');
  const colorBy = keys.some((k) => k.key === colorChoice) ? colorChoice : keys[0].key;
  const [showTemplates, setShowTemplates] = useState(true);
  const [rockModel, setRockModel] = useState('critical');
  const [rawParams, setRawParams] = useState({});
  const [fit, setFit] = useState(null);
  const modelParams = useMemo(() => parsedParams(rawParams), [rawParams]);
  const lineNoun = LINE_NOUNS[rockModel] || 'sand line';
  const zU = units.depth;
  const axis = impedanceAxis(units.velocity, units.density);

  const result = useMemo(() => computeZoneResult(model, zone, scenario, rock), [model, zone, scenario, rock]);
  const plot = useMemo(() => {
    if (!result || result.error) return null;
    const pts = crossplotPoints(model, result.indices, result.sub, colorBy);
    const domain = crossplotDomain(pts);
    if (!domain) return { pts, domain: null };
    const t = templateLines(scenario, rock, { rockModel, modelParams });
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
  }, [result, model, colorBy, scenario, rock, axis.factor, rockModel, modelParams]);

  const setParam = (key, value) => { setRawParams((p) => ({ ...p, [key]: value })); setFit(null); };
  const fitModel = () => {
    if (!result || result.error) return;
    const r = calibrateZoneModel(model, result.indices, scenario, rock, { rockModel, modelParams });
    setFit(r);
    if (!r.error) setRawParams((p) => ({ ...p, n: String(r.n) }));
  };

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
        {showTemplates && (
          <label className="flex items-center gap-1" title="The rock model behind the brine and fluid B lines. Each is the model's dry frame with Gassmann at the conditions in Scenario & rock.">
            <span className="text-pl-muted">Rock model</span>
            <select
              data-testid="rp-xplot-model"
              value={rockModel}
              onChange={(e) => { setRockModel(e.target.value); setFit(null); }}
              className="bg-pl-surface border border-pl-border-strong rounded px-1.5 py-0.5 text-pl-text"
            >
              {ROCK_MODELS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </label>
        )}
        {!zones.length && <span className="text-pl-muted">no zones on this well. Add them in Petrophysics Studio.</span>}
      </div>

      {showTemplates && MODEL_FIELDS[rockModel] && (
        <div className="flex flex-wrap items-end gap-3 text-[12px] text-pl-text" data-testid="rp-xplot-model-params">
          {MODEL_FIELDS[rockModel].map((key) => (
            <label key={key} className="flex flex-col gap-0.5" title={FIELD_LABELS[key].title}>
              <span className="text-pl-muted">{FIELD_LABELS[key].label}</span>
              <input
                data-testid={`rp-xplot-param-${key}`}
                inputMode="decimal"
                value={rawParams[key] ?? String(ROCK_MODEL_DEFAULTS[key])}
                onChange={(e) => setParam(key, e.target.value)}
                className="w-24 bg-pl-surface border border-pl-border-strong rounded px-1.5 py-0.5 text-pl-text"
              />
            </label>
          ))}
          {CALIBRATABLE_MODELS.includes(rockModel) && (
            <button
              type="button"
              data-testid="rp-xplot-fit"
              onClick={fitModel}
              disabled={!result || !!result.error}
              title={`Grid-search the coordination number against Vp and Vs of the zone's water-bearing samples (Sw ${WET_SW} or more), with brine at the scenario conditions`}
              className="px-2 py-1 rounded border border-pl-border-strong bg-pl-surface hover:bg-pl-sunken disabled:opacity-50"
            >
              Fit n to wet samples
            </button>
          )}
          {fit && (
            <span data-testid="rp-xplot-fit-result" className={fit.error ? 'text-pl-warning-text' : 'text-pl-muted'}>
              {fit.error
                ? fit.error
                : `Best n ${fit.n}: RMS misfit ${fit.rmsMs.toFixed(0)} m/s over ${fit.samples} water-bearing samples.${fit.atEdge ? ' The best fit sits at the end of the searched range, so the model may not suit this zone.' : ''}`}
            </span>
          )}
        </div>
      )}

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
                {plot.brine.length > 1 && <span className="flex items-center gap-1"><span className="inline-block w-5 border-t-2" style={{ borderColor: '#0284c7' }} /> brine {lineNoun}</span>}
                {plot.fluidB.length > 1 && <span className="flex items-center gap-1"><span className="inline-block w-5 border-t-2" style={{ borderColor: '#d97706' }} /> {plot.template.fluidBLabel} {lineNoun}</span>}
                {plot.mudrock.length > 1 && <span className="flex items-center gap-1"><span className="inline-block w-5 border-t-2 border-dashed" style={{ borderColor: '#64748b' }} /> mudrock line</span>}
              </>
            ) : null}
          </div>
          {showTemplates && (
            <p className="text-[11px] text-pl-muted" data-testid="rp-xplot-template-note">
              {plot.template.error
                ? `Template lines not drawn: ${plot.template.error}`
                : `Template lines: ${modelNote(plot.template)} with Gassmann, mineral K ${(plot.template.mineral.k / 1e9).toFixed(1)} GPa and shear ${(plot.template.mineral.mu / 1e9).toFixed(1)} GPa, brine and fluid B at the conditions in Scenario & rock; mudrock line (Castagna 1985) with Gardner density. ${anyLine ? 'Porosity is marked at 0.10, 0.20 and 0.30.' : 'None of them crosses this plot range.'}`}
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
