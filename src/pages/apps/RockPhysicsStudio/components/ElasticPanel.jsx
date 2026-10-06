// Elastic logs (QI programme Q1 / A2, 2026-10-06): the full elastic set for
// a zone (AI, SI, Vp/Vs, Poisson's ratio, K, mu, lambda rho, mu rho, EEI at
// a chosen chi) as zone means and a depth track, and a locally calibrated
// shear trend: on a well with a measured shear log, Vs regressed on Vp over
// the zone's water-bearing samples, with its 90 percent prediction interval.
// The trend can be saved into the project and then replaces
// Greenberg-Castagna on wells with no shear log. White Recharts cards and
// ChartLogo (suite chart standard). The maths is the engines'.

import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Label,
} from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, CHART_MARGINS, GRID_STYLE, TOOLTIP_STYLE,
} from '@/utils/chartTheme';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { zoneIndices } from '../services/prep';
import { zoneElastic, ELASTIC_CURVES, elasticDisplay } from '../services/elasticLogs';
import { fitLocalShear, trendLine, isTrend, WET_SW_FIT } from '../services/localShear';
import { impedanceAxis } from '../services/elastic';
import { niceTicks } from '../services/reportPlot';
import { DEFAULT_UNITS, tidyDepth, depthToDisplay } from '../services/units';

const AXIS_TICK = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };
const AXIS_LINE = { stroke: CHART_COLORS.axisLine, strokeWidth: 1 };
const LABEL_STYLE = { fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize };
const noDot = () => null;
const MAX_TRACK_POINTS = 3000;
const FT_PER_M = 1 / 0.3048;

const pad = ([lo, hi], f = 0.05) => { const s = hi - lo || Math.abs(hi) * 0.1 || 1; return [lo - f * s, hi + f * s]; };
const extent = (vals) => { let lo = Infinity; let hi = -Infinity; for (const v of vals) if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } return lo <= hi ? [lo, hi] : null; };

export default function ElasticPanel({
  model, zones, units = DEFAULT_UNITS, zoneId, onZoneChange, rock, onRockChange, wellName = '',
}) {
  const zone = zones.find((z) => z.id === zoneId) || zones[0] || null;
  const zU = units.depth;
  const imp = impedanceAxis(units.velocity, units.density);
  const speedUnit = units.velocity === 'ft/s' ? 'ft/s' : 'm/s';
  const speed = (ms) => (speedUnit === 'ft/s' ? ms * FT_PER_M : ms);
  const [chiText, setChiText] = useState('20');
  const chi = Math.max(-90, Math.min(90, Number.isFinite(parseFloat(chiText)) ? parseFloat(chiText) : 20));
  const [trackKey, setTrackKey] = useState('eei');
  const [form, setForm] = useState('linear');
  const [fit, setFit] = useState(null);

  const indices = useMemo(() => (zone ? zoneIndices(model.depth, zone.top_md_m, zone.base_md_m) : []), [model, zone]);
  const el = useMemo(() => (indices.length ? zoneElastic(model, indices, chi) : null), [model, indices, chi]);

  const unitOf = (kind) => (kind === 'modulus' ? 'GPa' : kind === 'lmr' ? 'GPa·g/cc' : kind === 'impedance' ? imp.unit : '');
  const fmt = (c, si) => {
    const v = elasticDisplay(c.kind, si, imp.factor);
    if (!Number.isFinite(v)) return EMPTY_VALUE;
    return c.kind === 'impedance' ? v.toFixed(imp.digits || 3) : c.kind === 'ratio' ? v.toFixed(3) : v.toFixed(2);
  };

  const track = useMemo(() => {
    if (!el || el.error) return null;
    const c = ELASTIC_CURVES.find((x) => x.key === trackKey) || ELASTIC_CURVES[0];
    const step = Math.max(1, Math.ceil(indices.length / MAX_TRACK_POINTS));
    const pts = [];
    for (let k = 0; k < indices.length; k += step) {
      const i = indices[k];
      const x = elasticDisplay(c.kind, el.curves[c.key][i], imp.factor);
      if (Number.isFinite(x)) pts.push({ x, z: depthToDisplay(model.depth[i], zU) });
    }
    const xr = extent(pts.map((p) => p.x));
    const zr = extent(pts.map((p) => p.z));
    return xr && zr ? { c, pts, x: pad(xr), z: zr } : null;
  }, [el, trackKey, indices, imp.factor, model, zU]);

  const runFit = () => setFit(fitLocalShear(model, indices, { form, wellName, zoneName: zone?.name || '' }));
  const saved = isTrend(rock?.localVs) ? rock.localVs : null;

  const fitPlot = useMemo(() => {
    if (!fit || fit.error) return null;
    const vr = extent(fit.samples.map((p) => p.vp));
    const line = trendLine(fit.trend, vr).map((p) => ({ vp: speed(p.vp), vs: speed(p.vs), lo: speed(p.lo), hi: speed(p.hi) }));
    const pts = fit.samples.slice(0, MAX_TRACK_POINTS).map((p) => ({ vp: speed(p.vp), vs: speed(p.vs) }));
    const x = pad(extent(pts.map((p) => p.vp)));
    const y = pad(extent([...pts.map((p) => p.vs), ...line.map((p) => p.lo), ...line.map((p) => p.hi)]));
    return {
      pts, x, y,
      fitLine: line.map((p) => ({ vp: p.vp, vs: p.vs })),
      lo: line.map((p) => ({ vp: p.vp, vs: p.lo })),
      hi: line.map((p) => ({ vp: p.vp, vs: p.hi })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit, speedUnit]);

  const coefText = (t) => {
    const [a, b, c] = t.coef;
    const sgn = (v) => (v < 0 ? '−' : '+');
    return t.form === 'quadratic'
      ? `Vs = ${a.toFixed(1)} ${sgn(b)} ${Math.abs(b).toFixed(2)} Vp ${sgn(c)} ${Math.abs(c).toFixed(3)} Vp² (Vp in km/s, Vs in m/s)`
      : `Vs = ${a.toFixed(1)} ${sgn(b)} ${Math.abs(b).toFixed(2)} Vp (Vp in km/s, Vs in m/s)`;
  };

  const select = 'bg-pl-surface border border-pl-border-strong rounded px-1.5 py-0.5 text-pl-text';

  return (
    <div className="h-full min-h-0 overflow-y-auto p-3 space-y-4" data-testid="rp-elastic-panel">
      <div className="flex flex-wrap items-center gap-3 text-[12px] text-pl-text">
        <label className="flex items-center gap-1">
          <span className="text-pl-muted">Zone</span>
          <select data-testid="rp-elastic-zone" value={zone?.id || ''} onChange={(e) => onZoneChange?.(e.target.value)} className={select}>
            {zones.map((z) => <option key={z.id} value={z.id}>{`${z.name} (${tidyDepth(z.top_md_m, zU)}–${tidyDepth(z.base_md_m, zU)} ${zU})`}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1" title="The angle of the extended elastic impedance (Whitcombe et al. 2002): 0 is AI; around 12 to 20 often tracks fluid; around 45 to 90 tracks lithology and shear">
          <span className="text-pl-muted">EEI χ (degrees)</span>
          <input data-testid="rp-elastic-chi" inputMode="decimal" value={chiText} onChange={(e) => setChiText(e.target.value)} className={`${select} w-16`} />
        </label>
        {!zones.length && <span className="text-pl-muted">no zones on this well. Add them in Petrophysics Studio.</span>}
      </div>

      {el?.error && <p className="text-[12px] text-pl-warning-text" data-testid="rp-elastic-error">{el.error}</p>}

      {el && !el.error && (
        <>
          <div className="overflow-x-auto">
            <table className="text-[12px] text-pl-text" data-testid="rp-elastic-means">
              <thead>
                <tr className="text-pl-muted text-left">
                  {ELASTIC_CURVES.map((c) => <th key={c.key} className="px-2 py-1 font-normal whitespace-nowrap">{c.key === 'eei' ? `EEI(${chi}°)` : c.label}{unitOf(c.kind) ? ` (${unitOf(c.kind)})` : ''}</th>)}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {ELASTIC_CURVES.map((c) => <td key={c.key} className="px-2 py-1 font-mono tabular-nums whitespace-nowrap" data-testid={`rp-elastic-mean-${c.key}`}>{fmt(c, el.means[c.key])}</td>)}
                </tr>
              </tbody>
            </table>
            <p className="text-[11px] text-pl-muted mt-1">
              {`Zone means over ${el.n} samples with Vp, Vs and density. EEI uses K = ${el.K.toFixed(3)} (the zone mean of (Vs/Vp)²) and the zone means of Vp, Vs and density as references, so EEI(0) is AI. λρ and μρ after Goodway et al. (1997).`}
              {model.vsSource === 'estimated' ? ' Vs is estimated on this well, so every shear-dependent value is indicative.' : ''}
            </p>
          </div>

          {track && (
            <div className="space-y-1">
              <label className="flex items-center gap-1 text-[12px] text-pl-text">
                <span className="text-pl-muted">Depth track</span>
                <select data-testid="rp-elastic-track" value={trackKey} onChange={(e) => setTrackKey(e.target.value)} className={select}>
                  {ELASTIC_CURVES.map((c) => <option key={c.key} value={c.key}>{c.key === 'eei' ? `EEI(${chi}°)` : c.label}</option>)}
                </select>
              </label>
              <div className="bg-white rounded-lg p-3 relative" data-canvas="chart" style={{ height: 420, maxWidth: 520 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={CHART_MARGINS.standard}>
                    <CartesianGrid {...GRID_STYLE} />
                    <XAxis dataKey="x" type="number" domain={track.x} allowDataOverflow tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={AXIS_LINE} ticks={niceTicks(track.x[0], track.x[1], 5).filter((t) => t >= track.x[0] && t <= track.x[1])} tickFormatter={(v) => Number(v.toPrecision(4)).toString()}>
                      <Label value={`${track.c.key === 'eei' ? `EEI(${chi}°)` : track.c.label}${unitOf(track.c.kind) ? ` (${unitOf(track.c.kind)})` : ''}`} position="insideBottom" offset={-5} style={LABEL_STYLE} />
                    </XAxis>
                    <YAxis dataKey="z" type="number" domain={track.z} reversed allowDataOverflow tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={AXIS_LINE} tickFormatter={(v) => v.toFixed(0)}>
                      <Label value={`MD (${zU})`} angle={-90} position="insideLeft" style={LABEL_STYLE} />
                    </YAxis>
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => Number(v).toPrecision(5)} />
                    <Scatter isAnimationActive={false} data={track.pts} line={{ stroke: '#0284c7', strokeWidth: 1.2 }} shape={noDot} name={track.c.label} />
                  </ScatterChart>
                </ResponsiveContainer>
                <ChartLogo />
              </div>
            </div>
          )}
        </>
      )}

      <section className="border-t border-pl-border pt-3 space-y-2" data-testid="rp-local-shear">
        <h3 className="text-[13px] font-semibold text-pl-text">Local shear trend</h3>
        <p className="text-[11px] text-pl-muted">
          {`Vs regressed on Vp over this zone's water-bearing samples (Sw ${WET_SW_FIT} or more) on a well with a measured shear log, with its 90 percent prediction interval. Saved into the project, it replaces Greenberg-Castagna on wells with no shear log, including the brine trend of the hydrocarbon iteration, and those wells get a Vs uncertainty.`}
        </p>
        <div className="flex flex-wrap items-center gap-3 text-[12px] text-pl-text">
          <label className="flex items-center gap-1">
            <span className="text-pl-muted">Form</span>
            <select data-testid="rp-local-shear-form" value={form} onChange={(e) => { setForm(e.target.value); setFit(null); }} className={select}>
              <option value="linear">Linear</option>
              <option value="quadratic">Quadratic</option>
            </select>
          </label>
          <button
            type="button"
            data-testid="rp-local-shear-fit"
            onClick={runFit}
            disabled={!indices.length}
            className="px-2 py-1 rounded border border-pl-border-strong bg-pl-surface hover:bg-pl-sunken disabled:opacity-50"
          >
            Fit to this zone
          </button>
          {saved && (
            <span className="text-pl-muted" data-testid="rp-local-shear-saved">
              {`In use: ${saved.label || 'a local trend'} (${saved.n} samples, ±${Math.round(saved.s)} m/s). `}
              <button type="button" data-testid="rp-local-shear-clear" className="underline hover:text-pl-text" onClick={() => onRockChange?.({ ...rock, localVs: null })}>Stop using it</button>
            </span>
          )}
        </div>

        {fit?.error && <p className="text-[12px] text-pl-warning-text" data-testid="rp-local-shear-error">{fit.error}</p>}
        {fit && !fit.error && (
          <>
            <p className="text-[12px] text-pl-text" data-testid="rp-local-shear-result">
              {`${coefText(fit.trend)}. ${fit.trend.n} samples, standard error ${fit.trend.s.toFixed(0)} m/s, R² ${fit.trend.r2.toFixed(3)}, calibrated for Vp ${fit.trend.vpRange[0].toFixed(0)} to ${fit.trend.vpRange[1].toFixed(0)} m/s.`}
              {fit.wetOnly ? ` ${fit.hydrocarbon} hydrocarbon-bearing sample${fit.hydrocarbon === 1 ? ' was' : 's were'} left out.` : ' This well has no Sw log, so every sample was used: check the zone is water-bearing.'}
            </p>
            {fitPlot && (
              <div className="bg-white rounded-lg p-3 relative" data-canvas="chart" style={{ height: 360, maxWidth: 620 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={CHART_MARGINS.standard}>
                    <CartesianGrid {...GRID_STYLE} />
                    <XAxis dataKey="vp" type="number" domain={fitPlot.x} allowDataOverflow tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={AXIS_LINE} tickFormatter={(v) => v.toFixed(0)}>
                      <Label value={`Vp (${speedUnit})`} position="insideBottom" offset={-5} style={LABEL_STYLE} />
                    </XAxis>
                    <YAxis dataKey="vs" type="number" domain={fitPlot.y} allowDataOverflow tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={AXIS_LINE} tickFormatter={(v) => v.toFixed(0)}>
                      <Label value={`Vs (${speedUnit})`} angle={-90} position="insideLeft" style={LABEL_STYLE} />
                    </YAxis>
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => Number(v).toFixed(0)} />
                    <Scatter isAnimationActive={false} data={fitPlot.pts} fill="#1d4ed8" name="measured" />
                    <Scatter isAnimationActive={false} data={fitPlot.fitLine} line={{ stroke: '#d97706', strokeWidth: 2 }} shape={noDot} name="trend" />
                    <Scatter isAnimationActive={false} data={fitPlot.lo} line={{ stroke: '#d97706', strokeWidth: 1, strokeDasharray: '4 3' }} shape={noDot} name="90 percent interval" />
                    <Scatter isAnimationActive={false} data={fitPlot.hi} line={{ stroke: '#d97706', strokeWidth: 1, strokeDasharray: '4 3' }} shape={noDot} name="90 percent interval" />
                  </ScatterChart>
                </ResponsiveContainer>
                <ChartLogo />
              </div>
            )}
            <button
              type="button"
              data-testid="rp-local-shear-use"
              onClick={() => onRockChange?.({ ...rock, localVs: fit.trend })}
              className="px-2 py-1 rounded border border-pl-primary bg-pl-primary/10 text-pl-primary-text text-[12px] hover:bg-pl-primary/20"
            >
              Use this trend for wells with no shear log
            </button>
          </>
        )}
      </section>
    </div>
  );
}
