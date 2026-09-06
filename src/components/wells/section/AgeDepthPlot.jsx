// Age-depth plot of one well (Stratigraphy ST3). SVG: depth down, age to
// the right, the dated surfaces as points joined by the engine's segments
// (constant accumulation rate each), a hiatus as a horizontal bar at the
// unconformity from the surface age to the older bound, the rate written
// on each segment, and the ICS stage of each dated surface. The model is
// stratigraphy/ageDepth.js; this file only draws it.

import React, { useMemo } from 'react';
import { ageDepthModel, validateAgeDepth, sortDated } from '@/lib/stratigraphy/ageDepth';
import { unitAt } from '@/lib/stratigraphy/timescale';

const L = 52; const T = 18; const R = 16; const B = 30;

/**
 * @param {Object} p
 * @param {Array<{name, md_m, age_ma, hiatus_to_ma?, surface_type?}>} p.surfaces
 * @param {number} [p.width]
 * @param {number} [p.height]
 * @param {'m'|'ft'} [p.depthUnit] display only
 * @param {string} [p.testIdPrefix]
 */
export default function AgeDepthPlot({ surfaces, width = 520, height = 360, depthUnit = 'm', testIdPrefix = 'agedepth' }) {
  const dated = useMemo(() => sortDated(surfaces), [surfaces]);
  const problems = useMemo(() => validateAgeDepth(dated), [dated]);
  const model = useMemo(() => ageDepthModel(dated), [dated]);
  if (dated.length < 2 || !model) {
    return (
      <div className="text-xs text-slate-500 p-3" data-testid={`${testIdPrefix}-empty`}>
        {dated.length < 2 ? 'Two dated surfaces are needed for an age-depth plot. Give the tops ages in the Tops view.' : problems[0]?.message}
      </div>
    );
  }
  const f = depthUnit === 'ft' ? 1 / 0.3048 : 1;
  const dMin = dated[0].md_m; const dMax = dated[dated.length - 1].md_m;
  const aMin = 0; const aMax = Math.max(...dated.map((p) => (Number.isFinite(p.hiatus_to_ma) ? p.hiatus_to_ma : p.age_ma)));
  const plotW = width - L - R; const plotH = height - T - B;
  const x = (ma) => L + ((ma - aMin) / Math.max(1e-9, aMax - aMin)) * plotW;
  const y = (md) => T + ((md - dMin) / Math.max(1e-9, dMax - dMin)) * plotH;
  const ticksA = 5; const ticksD = 5;
  return (
    <div data-testid={`${testIdPrefix}-plot`} data-segments={model.segments.length} data-hiatuses={model.hiatuses.length}>
      <svg width={width} height={height} className="block">
        {/* frame + grid */}
        <rect x={L} y={T} width={plotW} height={plotH} fill="#0f172a" stroke="#334155" />
        {Array.from({ length: ticksA + 1 }, (_, i) => aMin + (i * (aMax - aMin)) / ticksA).map((ma) => (
          <g key={`a${ma}`}>
            <line x1={x(ma)} y1={T} x2={x(ma)} y2={T + plotH} stroke="#1e293b" />
            <text x={x(ma)} y={T + plotH + 12} fontSize="9" fill="#94a3b8" textAnchor="middle">{Number(ma.toFixed(2))}</text>
          </g>
        ))}
        {Array.from({ length: ticksD + 1 }, (_, i) => dMin + (i * (dMax - dMin)) / ticksD).map((md) => (
          <g key={`d${md}`}>
            <line x1={L} y1={y(md)} x2={L + plotW} y2={y(md)} stroke="#1e293b" />
            <text x={L - 4} y={y(md) + 3} fontSize="9" fill="#94a3b8" textAnchor="end">{Math.round(md * f)}</text>
          </g>
        ))}
        <text x={L + plotW / 2} y={height - 4} fontSize="9" fill="#cbd5e1" textAnchor="middle">Age (Ma)</text>
        <text x={12} y={T + plotH / 2} fontSize="9" fill="#cbd5e1" textAnchor="middle" transform={`rotate(-90 12 ${T + plotH / 2})`}>MD ({depthUnit})</text>
        {/* segments with rates */}
        {model.segments.map((s, i) => (
          <g key={`s${i}`} data-testid={`${testIdPrefix}-segment-${i}`} data-rate={s.rate_m_per_ma == null ? '' : s.rate_m_per_ma.toFixed(3)}>
            <line x1={x(s.age_top_ma)} y1={y(s.top_md_m)} x2={x(s.age_base_ma)} y2={y(s.base_md_m)} stroke="#22d3ee" strokeWidth="2" />
            <text x={(x(s.age_top_ma) + x(s.age_base_ma)) / 2 + 4} y={(y(s.top_md_m) + y(s.base_md_m)) / 2 - 4} fontSize="9" fill="#67e8f9">
              {s.rate_m_per_ma == null ? 'event' : `${(s.rate_m_per_ma * f).toFixed(1)} ${depthUnit}/Ma`}
            </text>
          </g>
        ))}
        {/* hiatuses */}
        {model.hiatuses.map((h, i) => (
          <g key={`h${i}`} data-testid={`${testIdPrefix}-hiatus-${i}`}>
            <line x1={x(h.from_ma)} y1={y(h.md_m)} x2={x(h.to_ma)} y2={y(h.md_m)} stroke="#f59e0b" strokeWidth="3" strokeDasharray="4 2" />
            <text x={(x(h.from_ma) + x(h.to_ma)) / 2} y={y(h.md_m) - 5} fontSize="9" fill="#fbbf24" textAnchor="middle">hiatus {h.from_ma} to {h.to_ma} Ma</text>
          </g>
        ))}
        {/* points */}
        {dated.map((p) => {
          const stage = unitAt(p.age_ma);
          return (
            <g key={p.name || p.md_m} data-testid={`${testIdPrefix}-point-${p.name}`}>
              <circle cx={x(p.age_ma)} cy={y(p.md_m)} r="3.5" fill="#e2e8f0" stroke="#0f172a" />
              <text x={x(p.age_ma) + 6} y={y(p.md_m) + 3} fontSize="9" fill="#e2e8f0">{p.name}{stage ? ` (${stage.name})` : ''}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
