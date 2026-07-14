// Fluids & Gassmann panel (G6.4): Batzle-Wang fluid properties for
// the two scenario fluids, then per-sample Gassmann substitution over
// the selected zone with before/after curves and interval means.
// Charts follow the suite chart standard: white Recharts card +
// ChartLogo watermark; the workstation shell stays dark.

import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Label,
} from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, CHART_MARGINS, GRID_STYLE, TOOLTIP_STYLE, LEGEND_PROPS,
} from '@/utils/chartTheme';
import { sideFluid, kminFromRock, substituteInterval } from '../services/scenario';
import { zoneIndices, meanAt } from '../services/prep';

const gpa = (pa) => (Number.isFinite(pa) ? (pa / 1e9).toFixed(3) : '—');
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : '—');

const AXIS_TICK = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };
const AXIS_LINE = { stroke: CHART_COLORS.axisLine, strokeWidth: 1 };

function FluidRow({ id, label, fluid, error }) {
  return (
    <tr className="border-t border-slate-800">
      <td className="py-1 pr-2 text-slate-300">{label}</td>
      {error ? (
        <td colSpan={4} className="py-1 text-amber-400" data-testid={`rp-fluid-${id}-error`}>{error}</td>
      ) : (
        <>
          <td className="py-1 pr-2 text-slate-400">{fluid.label}</td>
          <td className="py-1 pr-2 text-right" data-testid={`rp-fluid-${id}-rho`}>{f2(fluid.rho)}</td>
          <td className="py-1 pr-2 text-right" data-testid={`rp-fluid-${id}-k`}>{gpa(fluid.k)}</td>
          <td className="py-1 text-right">{fluid.vp ? f2(fluid.vp) : '—'}</td>
        </>
      )}
    </tr>
  );
}

export default function FluidsPanel({ model, zones, scenario, rock }) {
  const [zoneId, setZoneId] = useState('');
  const zone = zones.find((z) => z.id === zoneId) || zones[0] || null;

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

  const chartData = useMemo(() => {
    if (!result?.indices) return [];
    return result.indices.map((i) => ({
      depth: model.depth[i],
      vpA: Number.isFinite(model.vp[i]) ? model.vp[i] : null,
      vpB: Number.isFinite(result.sub.vp[i]) ? result.sub.vp[i] : null,
      vsA: Number.isFinite(model.vs[i]) ? model.vs[i] : null,
      vsB: Number.isFinite(result.sub.vs[i]) ? result.sub.vs[i] : null,
    }));
  }, [result, model]);

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
            <option key={z.id} value={z.id}>{`${z.name} (${z.top_md_m}–${z.base_md_m} m)`}</option>
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
              <th className="font-normal text-right">ρ (kg/m³)</th>
              <th className="font-normal text-right">K (GPa)</th>
              <th className="font-normal text-right">Vp (m/s)</th>
            </tr>
          </thead>
          <tbody>
            <FluidRow id="a" label="A (in situ)" fluid={fluids.a} error={fluids.aError} />
            <FluidRow id="b" label="B (substitute)" fluid={fluids.b} error={fluids.bError} />
          </tbody>
        </table>
      </div>

      {result?.error && (
        <p className="text-[12px] text-amber-400" data-testid="rp-sub-error">{result.error}</p>
      )}

      {result && !result.error && (
        <>
          <div className="rounded border border-slate-800 p-2">
            <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">
              Gassmann substitution A → B · {zone.name} · K_min {gpa(result.kmin)} GPa ·{' '}
              {result.sub.done} samples{result.sub.skipped ? ` (${result.sub.skipped} skipped)` : ''}
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
                  <th className="font-normal text-right">Vp (m/s)</th>
                  <th className="font-normal text-right">Vs (m/s)</th>
                  <th className="font-normal text-right">ρ (kg/m³)</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-slate-800">
                  <td className="py-1 text-slate-300">before (A)</td>
                  <td className="py-1 text-right" data-testid="rp-sub-before-vp">{f2(result.before.vp)}</td>
                  <td className="py-1 text-right" data-testid="rp-sub-before-vs">{f2(result.before.vs)}</td>
                  <td className="py-1 text-right" data-testid="rp-sub-before-rho">{f2(result.before.rho)}</td>
                </tr>
                <tr className="border-t border-slate-800">
                  <td className="py-1 text-slate-300">after (B)</td>
                  <td className="py-1 text-right" data-testid="rp-sub-after-vp">{f2(result.after.vp)}</td>
                  <td className="py-1 text-right" data-testid="rp-sub-after-vs">{f2(result.after.vs)}</td>
                  <td className="py-1 text-right" data-testid="rp-sub-after-rho">{f2(result.after.rho)}</td>
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
                    value="Velocity (m/s)"
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
                    value="MD (m)"
                    angle={-90}
                    position="insideLeft"
                    style={{ fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }}
                  />
                </YAxis>
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => f2(v)} />
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
