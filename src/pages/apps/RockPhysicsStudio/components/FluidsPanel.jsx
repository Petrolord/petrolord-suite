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
import { Upload, Loader2 } from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Label,
} from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, CHART_MARGINS, GRID_STYLE, TOOLTIP_STYLE, LEGEND_PROPS,
} from '@/utils/chartTheme';
import { sideFluid, kminFromRock, substituteInterval } from '../services/scenario';
import { zoneIndices, meanAt } from '../services/prep';
import {
  DEFAULT_UNITS, velocityToDisplay, velocityDigits, velocityLabel, densityLabel, depthLabel, depthToDisplay,
  fmtVelocity, fmtDensity, tidyDepth,
} from '../services/units';

const gpa = (pa) => (Number.isFinite(pa) ? (pa / 1e9).toFixed(3) : '—');

const AXIS_TICK = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };
const AXIS_LINE = { stroke: CHART_COLORS.axisLine, strokeWidth: 1 };

function FluidRow({ id, label, fluid, error, units }) {
  return (
    <tr className="border-t border-slate-800">
      <td className="py-1 pr-2 text-slate-300">{label}</td>
      {error ? (
        <td colSpan={4} className="py-1 text-amber-400" data-testid={`rp-fluid-${id}-error`}>{error}</td>
      ) : (
        <>
          <td className="py-1 pr-2 text-slate-400">{fluid.label}</td>
          <td className="py-1 pr-2 text-right" data-testid={`rp-fluid-${id}-rho`}>{fmtDensity(fluid.rho, units.density, 2)}</td>
          <td className="py-1 pr-2 text-right" data-testid={`rp-fluid-${id}-k`}>{gpa(fluid.k)}</td>
          <td className="py-1 text-right">{fluid.vp ? fmtVelocity(fluid.vp, units.velocity, 2) : '—'}</td>
        </>
      )}
    </tr>
  );
}

export default function FluidsPanel({
  model, zones, scenario, rock, units = DEFAULT_UNITS, onPublish = null, publishing = false,
}) {
  const [zoneId, setZoneId] = useState('');
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
    let kmin;
    try { kmin = kminFromRock(rock); } catch (e) { return { error: e.message }; }
    const indices = zoneIndices(model.depth, zone.top_md_m, zone.base_md_m);
    if (!indices.length) return { error: 'The zone has no samples in this well.' };
    const sub = substituteInterval(model, indices, kmin, fluids.a, fluids.b, rock.phiConst);
    return {
      indices,
      sub,
      kmin,
      before: {
        vp: meanAt(model.vp, indices),
        vs: meanAt(model.vs, indices),
        rho: meanAt(model.rho, indices),
      },
      after: {
        vp: meanAt(sub.vp, indices),
        vs: meanAt(sub.vs, indices),
        rho: meanAt(sub.rho, indices),
      },
    };
  }, [model, zone, fluids, rock]);

  // chart samples in the display units (slowness inverts the axis sense)
  const chartData = useMemo(() => {
    if (!result?.indices) return [];
    const v = (x) => { const d = velocityToDisplay(x, vU); return Number.isFinite(d) ? d : null; };
    return result.indices.map((i) => ({
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
        <span className="text-[12px] text-slate-400">Zone</span>
        <select
          data-testid="rp-zone-select"
          value={zone?.id || ''}
          onChange={(e) => setZoneId(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-[12px] text-slate-100"
        >
          {zones.map((z) => (
            <option key={z.id} value={z.id}>{`${z.name} (${tidyDepth(z.top_md_m, zU)}–${tidyDepth(z.base_md_m, zU)} ${zU})`}</option>
          ))}
        </select>
        {!zones.length && (
          <span className="text-[12px] text-slate-500">no zones on this well — add them in Petrophysics Studio</span>
        )}
      </div>

      <div className="rounded border border-slate-800 p-2">
        <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">
          Pore fluids (Batzle-Wang 1992 at {scenario.conditions.tC} °C / {scenario.conditions.pMPa} MPa)
        </div>
        <table className="w-full text-[12px] text-slate-200">
          <thead>
            <tr className="text-slate-500 text-left">
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
        <p className="text-[12px] text-amber-400" data-testid="rp-sub-error">{result.error}</p>
      )}

      {result && !result.error && (
        <>
          <div className="rounded border border-slate-800 p-2">
            <div className="flex items-center gap-2 mb-1">
              <div className="text-[11px] uppercase tracking-wider text-slate-500">
                Gassmann substitution A → B · {zone.name} · K_min {gpa(result.kmin)} GPa ·{' '}
                {result.sub.done} samples{result.sub.skipped ? ` (${result.sub.skipped} skipped)` : ''}
              </div>
              {onPublish && (
                <button
                  type="button"
                  data-testid="rp-publish"
                  disabled={publishing || !result.sub.done}
                  title="Write VP_SUB, VS_SUB and RHOB_SUB to this well in the registry: the in-situ log outside the zone, the substituted case inside. Overwrites only this project's previous publish."
                  className="ml-auto flex items-center gap-1 px-2 py-0.5 text-xs rounded border
                    border-emerald-700 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40"
                  onClick={() => onPublish(result, zone)}
                >
                  {publishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  Publish substituted logs
                </button>
              )}
            </div>
            {result.sub.firstError && (
              <p className="text-[12px] text-amber-400 mb-1" data-testid="rp-sub-sample-error">
                skipped samples: {result.sub.firstError}
              </p>
            )}
            <table className="w-full text-[12px] text-slate-200">
              <thead>
                <tr className="text-slate-500 text-left">
                  <th className="font-normal">Interval mean</th>
                  <th className="font-normal text-right">{velocityLabel(vU).replace('Velocity', 'Vp').replace('Slowness', 'DTp')}</th>
                  <th className="font-normal text-right">{velocityLabel(vU).replace('Velocity', 'Vs').replace('Slowness', 'DTs')}</th>
                  <th className="font-normal text-right">{densityLabel(dU)}</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-slate-800">
                  <td className="py-1 text-slate-300">before (A)</td>
                  <td className="py-1 text-right" data-testid="rp-sub-before-vp">{fmtVelocity(result.before.vp, vU, 2)}</td>
                  <td className="py-1 text-right" data-testid="rp-sub-before-vs">{fmtVelocity(result.before.vs, vU, 2)}</td>
                  <td className="py-1 text-right" data-testid="rp-sub-before-rho">{fmtDensity(result.before.rho, dU, 2)}</td>
                </tr>
                <tr className="border-t border-slate-800">
                  <td className="py-1 text-slate-300">after (B)</td>
                  <td className="py-1 text-right" data-testid="rp-sub-after-vp">{fmtVelocity(result.after.vp, vU, 2)}</td>
                  <td className="py-1 text-right" data-testid="rp-sub-after-vs">{fmtVelocity(result.after.vs, vU, 2)}</td>
                  <td className="py-1 text-right" data-testid="rp-sub-after-rho">{fmtDensity(result.after.rho, dU, 2)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="bg-white rounded-lg p-3 relative" style={{ height: 420 }}>
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
                <YAxis
                  dataKey="depth"
                  type="number"
                  reversed
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
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => (Number.isFinite(v) ? v.toFixed(chartDigits) : '—')} labelFormatter={(v) => `${Number.isFinite(v) ? v.toFixed(1) : v} ${zU}`} />
                <Legend
                  {...LEGEND_PROPS}
                  wrapperStyle={{ fontSize: `${CHART_TYPOGRAPHY.legendFontSize}px`, color: CHART_COLORS.legendText }}
                />
                <Line type="monotone" dataKey="vpA" stroke="#0284c7" strokeWidth={1.5} dot={false} name="Vp in situ" />
                <Line type="monotone" dataKey="vpB" stroke="#dc2626" strokeWidth={1.5} dot={false} name="Vp substituted" />
                <Line type="monotone" dataKey="vsA" stroke="#0284c7" strokeWidth={1.5} strokeDasharray="4 3" dot={false} name="Vs in situ" />
                <Line type="monotone" dataKey="vsB" stroke="#dc2626" strokeWidth={1.5} strokeDasharray="4 3" dot={false} name="Vs substituted" />
              </LineChart>
            </ResponsiveContainer>
            <ChartLogo />
          </div>
        </>
      )}
    </div>
  );
}
