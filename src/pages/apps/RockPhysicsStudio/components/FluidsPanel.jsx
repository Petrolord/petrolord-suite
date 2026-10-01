// Fluids & Gassmann panel (G6.4): Batzle-Wang fluid properties for
// the two scenario fluids, then per-sample Gassmann substitution over
// the selected zone with before/after curves and interval means.
// Charts follow the suite chart standard: white Recharts card +
// ChartLogo watermark; the workstation shell stays dark.
//
// RP0: every number and axis shows in the workstation's display units
// (velocity or slowness, density, depth); the result stays SI. RP1:
// Publish writes the substituted case to the well as logs.

import React, { useMemo, useState } from 'react';
import { Upload, Loader2, Download, FileText } from 'lucide-react';
import { downloadText } from '@/lib/fullPrecision';
import { substitutionCsv, substitutionCsvName } from '../services/substitutionCsv';
import { substitutionPdf, substitutionPdfName } from '../services/report';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Label,
} from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, CHART_MARGINS, GRID_STYLE, TOOLTIP_STYLE, LEGEND_PROPS,
} from '@/utils/chartTheme';
import { sideFluid } from '../services/scenario';
import { computeZoneResult } from '../services/zoneResult';
import { shearSourceText } from '../services/iterativeVs';
import { minMaxDecimate } from '../services/decimate';
import { impedanceDisplay } from '../services/elastic';
import { meanAt } from '../services/prep';
import {
  DEFAULT_UNITS, velocityToDisplay, velocityDigits, velocityLabel, densityLabel, depthLabel, depthToDisplay,
  fmtVelocity, fmtDensity, tidyDepth,
} from '../services/units';
import { EMPTY_VALUE } from '@/lib/emptyValue';

const CHART_MAX_POINTS = 2000;
const gpa = (pa) => (Number.isFinite(pa) ? (pa / 1e9).toFixed(3) : EMPTY_VALUE);

const AXIS_TICK = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };
const AXIS_LINE = { stroke: CHART_COLORS.axisLine, strokeWidth: 1 };

function FluidRow({ id, label, fluid, error, units }) {
  return (
    <tr className="border-t border-pl-border">
      <td className="py-1 pr-2 text-pl-text">{label}</td>
      {error ? (
        <td colSpan={4} className="py-1 text-pl-warning-text" data-testid={`rp-fluid-${id}-error`}>{error}</td>
      ) : (
        <>
          <td className="py-1 pr-2 text-pl-muted">{fluid.label}</td>
          <td className="py-1 pr-2 text-right" data-testid={`rp-fluid-${id}-rho`}>{fmtDensity(fluid.rho, units.density, 2)}</td>
          <td className="py-1 pr-2 text-right" data-testid={`rp-fluid-${id}-k`}>{gpa(fluid.k)}</td>
          <td className="py-1 text-right">{fmtVelocity(fluid.vp || (fluid.k > 0 && fluid.rho > 0 ? Math.sqrt(fluid.k / fluid.rho) : NaN), units.velocity, 2)}</td>
        </>
      )}
    </tr>
  );
}

export default function FluidsPanel({
  model, zones, scenario, rock, units = DEFAULT_UNITS, onPublish = null, publishing = false,
  zoneId: zoneIdProp, onZoneChange = null, well = null,
}) {
  // RP-U1-010: the reviewer's field and name, remembered per browser
  const [reviewer, setReviewer] = useState(() => {
    try { return JSON.parse(window.localStorage.getItem('rp.reviewer') || '{}') || {}; } catch { return {}; }
  });
  const patchReviewer = (p) => setReviewer((r) => {
    const next = { ...r, ...p };
    try { window.localStorage.setItem('rp.reviewer', JSON.stringify(next)); } catch { /* storage blocked */ }
    return next;
  });
  const [exported, setExported] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);
  // RP-U1-013: the workstation owns the zone when it passes one (Save keeps it)
  const [zoneIdLocal, setZoneIdLocal] = useState('');
  const zoneId = zoneIdProp !== undefined ? zoneIdProp : zoneIdLocal;
  const setZoneId = onZoneChange || setZoneIdLocal;
  const zone = zones.find((z) => z.id === zoneId) || zones[0] || null;
  const vU = units.velocity;
  const dU = units.density;
  const zU = units.depth;

  const fluids = useMemo(() => {
    const out = { a: null, b: null, aError: null, bError: null };
    try { out.a = sideFluid(scenario.conditions, scenario.fluidA); } catch (e) { out.aError = e.message; }
    try { out.b = sideFluid(scenario.conditions, scenario.fluidB); } catch (e) { out.bError = e.message; }
    return out;
  }, [scenario]);

  const result = useMemo(() => {
    if (!model || !zone || !fluids.a || !fluids.b) return null;
    return computeZoneResult(model, zone, scenario, rock);
  }, [model, zone, fluids, rock, scenario]);

  // chart samples in the display units (slowness inverts the axis sense)
  const chartData = useMemo(() => {
    if (!result?.indices) return [];
    const v = (x) => { const d = velocityToDisplay(x, vU); return Number.isFinite(d) ? d : null; };
    // U2-014 (PL10): a long zone draws at most CHART_MAX_POINTS rows: the
    // minimum and maximum in-situ Vp of each bucket, so no streak or spike
    // is stepped over (U1 drew every k-th sample); tables, exports and
    // publish use every sample
    const dec = minMaxDecimate(result.indices, model.vp, CHART_MAX_POINTS);
    return dec.indices.map((i) => ({
      depth: depthToDisplay(model.depth[i], zU),
      vpA: v(model.vp[i]),
      vpB: v(result.sub.vp[i]),
      vsA: v(model.vs[i]),
      vsB: v(result.sub.vs[i]),
    }));
  }, [result, model, vU, zU]);
  const chartDigits = velocityDigits(vU, 2);

  if (!model) return null;

  return (
    <div className="h-full min-h-0 overflow-y-auto p-3 space-y-3" data-testid="rp-fluids-panel">
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-pl-muted">Zone</span>
        <select
          data-testid="rp-zone-select"
          value={zone?.id || ''}
          onChange={(e) => setZoneId(e.target.value)}
          className="bg-pl-surface border border-pl-border-strong rounded px-1.5 py-0.5 text-[12px] text-pl-text"
        >
          {zones.map((z) => (
            <option key={z.id} value={z.id}>{`${z.name} (${tidyDepth(z.top_md_m, zU)}–${tidyDepth(z.base_md_m, zU)} ${zU})`}</option>
          ))}
        </select>
        {!zones.length && (
          <span className="text-[12px] text-pl-muted">no zones on this well. Add them in Petrophysics Studio.</span>
        )}
      </div>

      <div className="rounded border border-pl-border p-2">
        <div className="text-[11px] uppercase tracking-wider text-pl-muted mb-1">
          Pore fluids (Batzle-Wang 1992 at {scenario.conditions.tC} °C / {scenario.conditions.pMPa} MPa)
        </div>
        <table className="w-full text-[12px] text-pl-text">
          <thead>
            <tr className="text-pl-muted text-left">
              <th className="font-normal">Fluid</th>
              <th className="font-normal">Mix</th>
              <th className="font-normal text-right">{densityLabel(dU)}</th>
              <th className="font-normal text-right">K (GPa)</th>
              <th className="font-normal text-right">{velocityLabel(vU).replace('Velocity', 'Vp').replace('Slowness', 'DTp')}</th>
            </tr>
          </thead>
          <tbody>
            <FluidRow id="a" label="A (in situ)" fluid={fluids.a} error={fluids.aError} units={units} />
            <FluidRow id="b" label="B (substitute)" fluid={fluids.b} error={fluids.bError} units={units} />
          </tbody>
        </table>
      </div>

      {result?.error && (
        <p className="text-[12px] text-pl-warning-text" data-testid="rp-sub-error">{result.error}</p>
      )}

      {result && !result.error && (
        <>
          <div className="rounded border border-pl-border p-2">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <div className="text-[11px] uppercase tracking-wider text-pl-muted" data-testid="rp-sub-header">
                Gassmann substitution A → B · {zone.name} · K_min {result.sub.kminSource === 'vsh' && result.sub.done
                  ? `${gpa(result.sub.kminMin)} to ${gpa(result.sub.kminMax)} GPa (clay at VSH)`
                  : `${gpa(result.kmin)} GPa${result.sub.kminSource === 'override' ? ' (override)' : ''}`} ·{' '}
                {result.sub.done} samples{result.sub.skipped ? ` (${result.sub.skipped} skipped)` : ''}
                {result.sub.outside ? ` · ${result.sub.outside} left in situ (outside the Gassmann limits)` : ''}
              </div>
              <input
                data-testid="rp-reviewer-field"
                value={reviewer.field || ''}
                placeholder="Field"
                onChange={(e) => patchReviewer({ field: e.target.value })}
                className="ml-auto w-24 bg-pl-surface border border-pl-border-strong rounded px-1.5 py-0.5 text-[11px] text-pl-text"
              />
              <input
                data-testid="rp-reviewer-analyst"
                value={reviewer.analyst || ''}
                placeholder="Analyst"
                onChange={(e) => patchReviewer({ analyst: e.target.value })}
                className="w-24 bg-pl-surface border border-pl-border-strong rounded px-1.5 py-0.5 text-[11px] text-pl-text"
              />
              <button
                type="button"
                data-testid="rp-export-csv"
                title="Download the substitution as CSV: a header with the well, zone, field, analyst, date, build, units, conditions, both fluids, K_min, porosity basis and limits, then every zone sample in the display units"
                className="flex items-center gap-1 px-2 py-0.5 text-xs rounded border border-pl-border-strong text-pl-text hover:bg-pl-sunken"
                onClick={() => {
                  const text = substitutionCsv({
                    well, zone, model, sub: result.sub, indices: result.indices, scenario, rock, units, reviewer,
                  });
                  const name = substitutionCsvName(well, zone);
                  setExported(downloadText(name, text) ? `Saved ${name}.` : '');
                }}
              >
                <Download className="w-3.5 h-3.5" /> CSV
              </button>
              <button
                type="button"
                data-testid="rp-export-pdf"
                disabled={pdfBusy}
                title="Download the report as a PDF: the reviewer header, the interval means before and after, the AVO of the zone top in situ and substituted, and plots of velocity against depth, impedance against Vp/Vs and reflectivity against angle"
                className="flex items-center gap-1 px-2 py-0.5 text-xs rounded border border-pl-border-strong text-pl-text hover:bg-pl-sunken disabled:opacity-40"
                onClick={async () => {
                  setPdfBusy(true);
                  try {
                    const { jsPDF } = await import('jspdf');
                    const { loadPetrolordLogo } = await import('@/lib/pdfBrand');
                    const logo = await loadPetrolordLogo().catch(() => null);
                    const doc = substitutionPdf(jsPDF, { well, zone, model, result, scenario, rock, units, reviewer }, { logo });
                    const name = substitutionPdfName(well, zone);
                    doc.save(name);
                    setExported(`Saved ${name}.`);
                  } catch (e) {
                    setExported(`The PDF could not be made: ${e.message}`);
                  } finally {
                    setPdfBusy(false);
                  }
                }}
              >
                {pdfBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />} PDF
              </button>
              {onPublish && (
                <button
                  type="button"
                  data-testid="rp-publish"
                  disabled={publishing || !result.sub.done}
                  title="Write VP_SUB, VS_SUB and RHOB_SUB to this well in the registry: the in-situ log outside the zone, the substituted case inside. Overwrites only this project's previous publish."
                  className="flex items-center gap-1 px-2 py-0.5 text-xs rounded border
                    border-pl-primary text-pl-primary-text hover:bg-pl-primary/10 disabled:opacity-40"
                  onClick={() => onPublish(result, zone)}
                >
                  {publishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  Publish substituted logs
                </button>
              )}
            </div>
            <p className="text-[12px] text-pl-muted mb-1" data-testid="rp-sub-basis">
              Porosity: {model.phiCurve ? `${model.phiCurve} (${model.phiBasis === 'total' ? 'total' : 'effective'} porosity)` : `constant ${rock.phiConst} (no PHIE or PHIT curve)`}
              {' · '}fluid A Sw: {result.sub.swFromLog ? `from the SW log${result.sub.swFallback ? ` (${result.sub.swFallback} null samples used ${scenario.fluidA.sw})` : ''}` : `${scenario.fluidA.sw} as typed${scenario.fluidA.swFromLog && !model.sw ? ' (no SW curve on this well)' : ''}`}
              {' · '}limits: VSH up to {rock.vshMax ?? 1}, porosity from {rock.phiMin ?? 0}
              {model.vsSource === 'estimated' ? ` · ${shearSourceText(model)}` : ''}
              {model.vpSource === 'estimated' ? ` · Vp ESTIMATED, no sonic log (${model.vpNote})` : ''}
            </p>
            {model.phiBasis === 'effective' && result.sub.kminSource === 'table' && !(rock.minerals?.clay > 0)
              && Number.isFinite(meanAt(model.vsh || [], result.indices)) && meanAt(model.vsh, result.indices) > 0.1 && (
              <p className="text-[12px] text-pl-warning-text mb-1" data-testid="rp-sub-clay-note">
                Effective porosity with a clay-free mineral: the clay (mean VSH {meanAt(model.vsh, result.indices).toFixed(2)}) sits in neither the pores nor the solid.
                Tick "clay from VSH" in Scenario &amp; rock, or use total porosity.
              </p>
            )}
            {exported && <p className="text-[11px] text-pl-success-text mb-1" data-testid="rp-export-note">{exported}</p>}
            {result.sub.firstError && (
              <p className="text-[12px] text-pl-warning-text mb-1" data-testid="rp-sub-sample-error">
                skipped samples: {result.sub.firstError}
              </p>
            )}
            <table className="w-full text-[12px] text-pl-text">
              <thead>
                <tr className="text-pl-muted text-left">
                  <th className="font-normal">Interval mean</th>
                  <th className="font-normal text-right">{velocityLabel(vU).replace('Velocity', 'Vp').replace('Slowness', 'DTp')}</th>
                  <th className="font-normal text-right">{velocityLabel(vU).replace('Velocity', 'Vs').replace('Slowness', 'DTs')}</th>
                  <th className="font-normal text-right">{densityLabel(dU)}</th>
                  <th className="font-normal text-right" title="Acoustic impedance AI = Vp x density">AI ({impedanceDisplay(1, vU, dU).unit})</th>
                  <th className="font-normal text-right" title="Velocity ratio">Vp/Vs</th>
                  <th className="font-normal text-right" title="Poisson's ratio (Vp² - 2Vs²) / (2(Vp² - Vs²))">Poisson</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-pl-border">
                  <td className="py-1 text-pl-text">before (A)</td>
                  <td className="py-1 text-right" data-testid="rp-sub-before-vp">{fmtVelocity(result.before.vp, vU, 2)}</td>
                  <td className="py-1 text-right" data-testid="rp-sub-before-vs">{fmtVelocity(result.before.vs, vU, 2)}</td>
                  <td className="py-1 text-right" data-testid="rp-sub-before-rho">{fmtDensity(result.before.rho, dU, 2)}</td>
                  <td className="py-1 text-right" data-testid="rp-sub-before-ai">{impedanceDisplay(result.before.ai, vU, dU).text}</td>
                  <td className="py-1 text-right" data-testid="rp-sub-before-vpvs">{Number.isFinite(result.before.vpvs) ? result.before.vpvs.toFixed(3) : EMPTY_VALUE}</td>
                  <td className="py-1 text-right" data-testid="rp-sub-before-pr">{Number.isFinite(result.before.pr) ? result.before.pr.toFixed(3) : EMPTY_VALUE}</td>
                </tr>
                <tr className="border-t border-pl-border">
                  <td className="py-1 text-pl-text">after (B)</td>
                  <td className="py-1 text-right" data-testid="rp-sub-after-vp">{fmtVelocity(result.after.vp, vU, 2)}</td>
                  <td className="py-1 text-right" data-testid="rp-sub-after-vs">{fmtVelocity(result.after.vs, vU, 2)}</td>
                  <td className="py-1 text-right" data-testid="rp-sub-after-rho">{fmtDensity(result.after.rho, dU, 2)}</td>
                  <td className="py-1 text-right" data-testid="rp-sub-after-ai">{impedanceDisplay(result.after.ai, vU, dU).text}</td>
                  <td className="py-1 text-right" data-testid="rp-sub-after-vpvs">{Number.isFinite(result.after.vpvs) ? result.after.vpvs.toFixed(3) : EMPTY_VALUE}</td>
                  <td className="py-1 text-right" data-testid="rp-sub-after-pr">{Number.isFinite(result.after.pr) ? result.after.pr.toFixed(3) : EMPTY_VALUE}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="bg-white rounded-lg p-3 relative" data-canvas="chart" style={{ height: 420 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} layout="vertical" margin={CHART_MARGINS.legend}>
                <CartesianGrid {...GRID_STYLE} />
                <XAxis
                  type="number"
                  domain={['auto', 'auto']}
                  tick={AXIS_TICK}
                  axisLine={AXIS_LINE}
                  tickLine={AXIS_LINE}
                >
                  <Label
                    value={velocityLabel(vU)}
                    position="insideBottom"
                    offset={-5}
                    style={{ fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }}
                  />
                </XAxis>
                {/* a vertical-layout numeric Y axis already runs top-down; the old
                    `reversed` drew depth increasing upward (T1-001) */}
                <YAxis
                  dataKey="depth"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tick={AXIS_TICK}
                  axisLine={AXIS_LINE}
                  tickLine={AXIS_LINE}
                >
                  <Label
                    value={depthLabel(zU)}
                    angle={-90}
                    position="insideLeft"
                    style={{ fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }}
                  />
                </YAxis>
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => (Number.isFinite(v) ? v.toFixed(chartDigits) : EMPTY_VALUE)} labelFormatter={(v) => `${Number.isFinite(v) ? v.toFixed(1) : v} ${zU}`} />
                <Legend
                  {...LEGEND_PROPS}
                  verticalAlign="top"
                  wrapperStyle={{ fontSize: `${CHART_TYPOGRAPHY.legendFontSize}px`, color: CHART_COLORS.legendText, paddingBottom: 4 }}
                />
                <Line type="monotone" isAnimationActive={false} dataKey="vpA" stroke="#0284c7" strokeWidth={1.5} dot={false} name="Vp in situ" />
                <Line type="monotone" isAnimationActive={false} dataKey="vpB" stroke="#dc2626" strokeWidth={1.5} dot={false} name="Vp substituted" />
                <Line type="monotone" isAnimationActive={false} dataKey="vsA" stroke="#0284c7" strokeWidth={1.5} strokeDasharray="4 3" dot={false} name="Vs in situ" />
                <Line type="monotone" isAnimationActive={false} dataKey="vsB" stroke="#dc2626" strokeWidth={1.5} strokeDasharray="4 3" dot={false} name="Vs substituted" />
              </LineChart>
            </ResponsiveContainer>
            <ChartLogo />
            {result.indices.length > CHART_MAX_POINTS && (
              <div className="absolute bottom-1 right-3 text-[10px] text-slate-500" data-testid="rp-chart-decimated">
                {chartData.length} of {result.indices.length} samples drawn: the minimum and maximum Vp of each of {Math.floor(CHART_MAX_POINTS / 2)} depth buckets
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
