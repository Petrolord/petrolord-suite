// Property QC for one zone (Earth Modeling, Ekene walk 2026-10-14): the
// logs as upscaled at each well and layer, the model against those control
// values at the wells, and a histogram of each property in the model with
// the wells' values marked, so a modeller sees at a glance whether the
// model honours the data and spans its range. White chart cards with the
// Petrolord mark (the Suite chart template).

import React from 'react';
import ChartLogo from '@/components/charts/ChartLogo';
import { CHART_COLORS } from '@/utils/chartTheme';
import { fmtDepth } from '../services/units';
import { isNull } from '@/lib/gridding/gridmath';
import { EMPTY_VALUE } from '@/lib/emptyValue';

const th = 'px-2 py-1 text-left text-[10px] uppercase tracking-wider text-pl-muted font-medium';
const td = 'px-2 py-1 text-xs text-pl-text whitespace-nowrap';
const card = 'rounded border border-pl-border bg-pl-surface';
const PROP_LABEL = { phi: 'Porosity', sw: 'Sw', ntg: 'NTG', perm: 'Permeability (md)' };
const f3 = (v) => (Number.isFinite(v) ? v.toFixed(3) : EMPTY_VALUE);
const fk = (v) => (Number.isFinite(v) ? (v >= 100 ? v.toFixed(0) : v.toFixed(1)) : EMPTY_VALUE);
const slug = (s) => s.replace(/\s+/g, '-').toLowerCase();

/** Model node values of a property over the zone's live nodes (every layer). */
export function modelValues(zone, prop) {
  const frames = zone.layers?.length ? zone.layers : [{ props: zone.props, thickness: zone.thickness }];
  const out = [];
  for (const L of frames) {
    const g = L.props?.[prop];
    if (!g) continue;
    for (let j = 0; j < g.length; j++) {
      const t = L.thickness?.[j];
      if (t !== undefined && (isNull(t) || !(t > 0))) continue;
      const v = g[j];
      if (isNull(v) || !Number.isFinite(v)) continue;
      out.push(v);
    }
  }
  return out;
}

/** Min and max of a long list (a 3D grid's cells overflow Math.min(...values)). */
export function minMax(values) {
  let lo = Infinity; let hi = -Infinity;
  for (const v of values) { if (v < lo) lo = v; if (v > hi) hi = v; }
  return [lo, hi];
}

/** Equal-width bins over [lo, hi]; counts as fractions of the total. */
export function histogram(values, bins = 20, lo = null, hi = null) {
  if (!values.length) return { lo: 0, hi: 1, counts: [] };
  const [mn, mx] = lo === null || hi === null ? minMax(values) : [lo, hi];
  let a = lo ?? mn; let b = hi ?? mx;
  if (!(b > a)) { a -= 0.005; b += 0.005; }
  const counts = new Array(bins).fill(0);
  for (const v of values) counts[Math.min(bins - 1, Math.max(0, Math.floor(((v - a) / (b - a)) * bins)))] += 1;
  return { lo: a, hi: b, counts: counts.map((c) => c / values.length) };
}

function Histogram({ zone, prop, wellValues }) {
  const vals = modelValues(zone, prop);
  if (!vals.length) return null;
  const [vLo, vHi] = minMax(vals); const [wLo, wHi] = minMax(wellValues);
  const h = histogram(vals, 20, Math.min(vLo, wLo), Math.max(vHi, wHi));
  const W = 260; const H = 120; const P = { l: 30, r: 8, t: 8, b: 26 };
  const pw = W - P.l - P.r; const ph = H - P.t - P.b;
  const top = Math.max(...h.counts, 1e-9);
  const x = (v) => P.l + ((v - h.lo) / (h.hi - h.lo)) * pw;
  const bw = pw / h.counts.length;
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  const fmt = prop === 'perm' ? fk : f3;
  return (
    <div className="relative bg-white rounded border border-pl-border" data-testid={`em-hist-${slug(zone.name)}-${prop}`}>
      <svg width={W} height={H} role="img" aria-label={`${PROP_LABEL[prop]} histogram`}>
        <line x1={P.l} x2={W - P.r} y1={H - P.b} y2={H - P.b} stroke={CHART_COLORS.axisLine} />
        {h.counts.map((c, i) => (
          <rect key={i} x={P.l + i * bw + 0.5} y={H - P.b - (c / top) * ph} width={Math.max(0.5, bw - 1)} height={(c / top) * ph} fill="#2563eb" opacity="0.75" />
        ))}
        {wellValues.map((v, i) => (
          <line key={`w${i}`} x1={x(v)} x2={x(v)} y1={P.t} y2={H - P.b} stroke="#dc2626" strokeWidth="1.5" />
        ))}
        <text x={P.l} y={H - 8} fontSize="9" fill={CHART_COLORS.axisText}>{fmt(h.lo)}</text>
        <text x={W - P.r} y={H - 8} fontSize="9" textAnchor="end" fill={CHART_COLORS.axisText}>{fmt(h.hi)}</text>
        <text x={P.l + pw / 2} y={H - 8} fontSize="9" textAnchor="middle" fill={CHART_COLORS.axisLabel}>{PROP_LABEL[prop]}, model mean {fmt(mean)}</text>
      </svg>
      <ChartLogo style={{ height: '18px', right: '4px', bottom: '22px' }} />
    </div>
  );
}

export default function PropertyQc({ zone, depthUnit = 'm' }) {
  const rows = zone.logRows || [];
  const match = zone.wellMatch || [];
  const nLayers = zone.layers?.length || 1;
  const props = ['phi', 'sw', 'ntg', ...(zone.props?.perm ? ['perm'] : [])];
  const wellValues = (prop) => match.filter((r) => r.prop === prop).map((r) => r.control).filter(Number.isFinite);
  const worst = (prop) => match.filter((r) => r.prop === prop && Number.isFinite(r.diff)).reduce((a, r) => Math.max(a, Math.abs(r.diff)), 0);
  return (
    <div className="px-2 py-2 space-y-2 border-t border-pl-border" data-testid={`em-propqc-${slug(zone.name)}`}>
      {rows.length > 0 && (
        <div className={card}>
          <div className="px-2 py-1 text-[11px] font-semibold text-pl-text border-b border-pl-border">
            Well logs upscaled{nLayers > 1 ? ` to ${nLayers} layers` : ' to the zone'}: gross and net are true vertical thickness, Sw is over the net rock above the OWC
          </div>
          <table className="w-full">
            <thead><tr><th className={th}>Well</th>{nLayers > 1 && <th className={th}>Layer</th>}<th className={th}>Gross ({depthUnit})</th><th className={th}>Net ({depthUnit})</th><th className={th}>NTG</th><th className={th}>Porosity</th><th className={th}>Sw</th><th className={th}>k (md)</th></tr></thead>
            <tbody data-testid={`em-logrows-${slug(zone.name)}`}>
              {rows.map((r) => (
                <tr key={`${r.well}-${r.layer}`} className="border-t border-pl-border" data-testid={`em-logrow-${slug(zone.name)}-${r.well}-${r.layer + 1}`}>
                  <td className={td}>{r.well}</td>{nLayers > 1 && <td className={td}>{r.layer + 1}</td>}
                  <td className={td}>{fmtDepth(r.grossM, depthUnit, 1)}</td><td className={td}>{fmtDepth(r.netM, depthUnit, 1)}</td>
                  <td className={td}>{f3(r.ntg)}</td><td className={td}>{f3(r.phi)}</td><td className={td}>{Number.isFinite(r.sw) ? f3(r.sw) : 'below OWC'}</td><td className={td}>{fk(r.perm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {match.length > 0 && (
        <div className={card}>
          <div className="px-2 py-1 text-[11px] font-semibold text-pl-text border-b border-pl-border" data-testid={`em-match-head-${slug(zone.name)}`}>
            Model against the wells: largest difference {props.filter((p) => p !== 'perm').map((p) => `${PROP_LABEL[p]} ${f3(worst(p))}`).join(', ')}. Kriging and inverse distance honour the wells; a constant or a trend leaves a misfit.
          </div>
          <div className="max-h-48 overflow-auto">
            <table className="w-full">
              <thead><tr><th className={th}>Well</th>{nLayers > 1 && <th className={th}>Layer</th>}<th className={th}>Property</th><th className={th}>At the well</th><th className={th}>Model</th><th className={th}>Difference</th></tr></thead>
              <tbody data-testid={`em-match-${slug(zone.name)}`}>
                {match.map((r, i) => {
                  const fmt = r.prop === 'perm' ? fk : f3;
                  return (
                    <tr key={i} className="border-t border-pl-border">
                      <td className={td}>{r.well}</td>{nLayers > 1 && <td className={td}>{r.layer}</td>}<td className={td}>{PROP_LABEL[r.prop]}</td>
                      <td className={td}>{fmt(r.control)}</td><td className={td}>{fmt(r.model)}</td>
                      <td className={`${td} ${r.prop !== 'perm' && Number.isFinite(r.diff) && Math.abs(r.diff) > 0.02 ? 'text-pl-warning-text' : ''}`}>{r.diff === null ? 'off the map' : fmt(r.diff)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2" data-testid={`em-hists-${slug(zone.name)}`}>
        {props.map((p) => <Histogram key={p} zone={zone} prop={p} wellValues={wellValues(p)} />)}
      </div>
      <p className="text-[10px] text-pl-muted">Blue bars: the model&apos;s nodes{nLayers > 1 ? ' in every layer' : ''}. Red lines: the values at the wells.</p>
    </div>
  );
}
