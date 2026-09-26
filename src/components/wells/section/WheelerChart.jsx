// Wheeler (chronostratigraphic) chart (Stratigraphy ST2). SVG: one column
// per section well, geologic time down the vertical axis, deposition cells
// coloured by the systems tract the bounding surfaces imply (or the
// interval's own colour when the caller supplies one), hiatus cells
// hatched. Labels follow the terminology display scheme. The cells come
// from the engine (stratigraphy/wheeler.js); this file only draws them.

import React, { useMemo } from 'react';
import { wheelerChart } from '@/lib/stratigraphy/wheeler';
import { SYSTEMS_TRACTS, displayLabel } from '@/lib/stratigraphy/vocabulary';
import { unitsBetween } from '@/lib/stratigraphy/timescale';

const TRACT_COLOUR = Object.fromEntries(SYSTEMS_TRACTS.map((t) => [t.code, t.colour]));
const AXIS_W = 56;
const HEAD_H = 28;

/**
 * @param {Object} p
 * @param {Array<{id, name, position?, surfaces: Array<{name, md_m, age_ma, hiatus_to_ma?, surface_type?}>}>} p.wells
 * @param {'catuneanu'|'exxon'} p.scheme
 * @param {number} [p.width]
 * @param {number} [p.height]
 * @param {boolean} [p.showStages] draw ICS stage bands behind the columns
 * @param {string} [p.testIdPrefix]
 */
export default function WheelerChart({ wells, scheme = 'catuneanu', width = 720, height = 420, showStages = true, testIdPrefix = 'wheeler' }) {
  const chart = useMemo(() => wheelerChart(wells || []), [wells]);
  const n = chart.wells.length;
  const plotW = Math.max(60, width - AXIS_W - 8);
  const plotH = Math.max(60, height - HEAD_H - 24);
  const colW = n ? plotW / n : plotW;
  const span = Math.max(1e-6, chart.age_max_ma - chart.age_min_ma);
  const yOf = (ma) => HEAD_H + ((ma - chart.age_min_ma) / span) * plotH;
  const stages = useMemo(() => (showStages && n ? unitsBetween(chart.age_min_ma, chart.age_max_ma, 'age') : []), [showStages, n, chart.age_min_ma, chart.age_max_ma]);

  if (!n) {
    return (
      <div className="text-xs text-slate-500 p-3" data-testid={`${testIdPrefix}-empty`}>
        No well has two dated surfaces yet. Give the tops ages in the Tops view (and a hiatus end for unconformities) to build the Wheeler chart.
        {chart.skipped.length > 0 && <ul className="mt-1">{chart.skipped.map((s) => <li key={s.id}>{s.name}: {s.reason}</li>)}</ul>}
      </div>
    );
  }

  const label = (c) => {
    if (c.kind === 'hiatus') return 'hiatus';
    if (c.tract) return `${displayLabel(c.tract, scheme, { kind: 'tract', short: true }).label}${c.certain ? '' : ' ?'}`;
    return c.label;
  };

  return (
    <div data-testid={`${testIdPrefix}-chart`} data-cell-count={chart.wells.reduce((s, w) => s + w.cells.length, 0)} data-age-max={chart.age_max_ma} className="overflow-x-auto">
      <svg width={width} height={height} className="block">
        <defs>
          <pattern id={`${testIdPrefix}-hatch`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#94a3b8" strokeWidth="1.5" />
          </pattern>
        </defs>
        {/* ICS stages behind the columns */}
        {stages.map((u) => {
          const y0 = yOf(Math.max(u.top_ma, chart.age_min_ma)); const y1 = yOf(Math.min(u.base_ma, chart.age_max_ma));
          return (
            <g key={u.name}>
              <rect x={AXIS_W} y={y0} width={plotW} height={Math.max(0, y1 - y0)} fill="#1e293b" opacity="0.35" stroke="#334155" strokeWidth="0.5" />
              {y1 - y0 > 11 && <text x={AXIS_W + plotW - 3} y={y0 + 9} fontSize="8" fill="#64748b" textAnchor="end">{u.name}</text>}
            </g>
          );
        })}
        {/* age axis */}
        <line x1={AXIS_W} y1={HEAD_H} x2={AXIS_W} y2={HEAD_H + plotH} stroke="#475569" />
        {chart.boundaries.map((b) => (
          <g key={b}>
            <line x1={AXIS_W - 4} y1={yOf(b)} x2={AXIS_W} y2={yOf(b)} stroke="#94a3b8" />
            <text x={AXIS_W - 6} y={yOf(b) + 3} fontSize="9" fill="#cbd5e1" textAnchor="end">{b}</text>
          </g>
        ))}
        <text x={AXIS_W - 6} y={HEAD_H - 8} fontSize="9" fill="#94a3b8" textAnchor="end">Ma</text>
        {/* wells */}
        {chart.wells.map((w, i) => {
          const x0 = AXIS_W + i * colW + 6; const cw = colW - 12;
          // Stratigraphy T1 (ST-T1-004): the part of the chart this well has no
          // dated record for reads "undated", distinct from a hiatus
          const wTop = Math.min(...w.cells.map((c) => c.from_ma));
          const wBase = Math.max(...w.cells.map((c) => c.to_ma));
          const gaps = [[chart.age_min_ma, wTop], [wBase, chart.age_max_ma]].filter(([a, b]) => b - a > 1e-9);
          return (
            <g key={w.id} data-testid={`${testIdPrefix}-well-${w.name}`}>
              <text x={x0 + cw / 2} y={HEAD_H - 8} fontSize="10" fontWeight="bold" fill="#e2e8f0" textAnchor="middle">{w.name}</text>
              {gaps.map(([a, b]) => (
                <g key={`undated-${a}`} data-testid={`${testIdPrefix}-undated-${w.name}`}>
                  <rect x={x0} y={yOf(a)} width={cw} height={Math.max(1, yOf(b) - yOf(a))} fill="none" stroke="#475569" strokeDasharray="3 3" strokeWidth="0.8" />
                  {yOf(b) - yOf(a) > 12 && <text x={x0 + cw / 2} y={(yOf(a) + yOf(b)) / 2 + 3} fontSize="9" fill="#64748b" textAnchor="middle">undated</text>}
                </g>
              ))}
              {w.cells.map((c, k) => {
                const y0 = yOf(c.from_ma); const y1 = yOf(c.to_ma);
                const fill = c.kind === 'hiatus' ? `url(#${testIdPrefix}-hatch)` : (c.tract ? TRACT_COLOUR[c.tract] : '#475569');
                return (
                  <g key={`${c.kind}-${c.from_ma}-${k}`} data-testid={`${testIdPrefix}-cell-${w.name}-${k}`} data-kind={c.kind} data-tract={c.tract || ''} data-from={c.from_ma} data-to={c.to_ma}>
                    <rect x={x0} y={y0} width={cw} height={Math.max(1, y1 - y0)} fill={fill} opacity={c.kind === 'hiatus' ? 1 : (c.certain ? 0.85 : 0.5)} stroke="#0f172a" strokeWidth="0.5">
                      <title>{`${w.name}: ${c.label}, ${c.from_ma} to ${c.to_ma} Ma${c.kind === 'deposition' ? `, ${c.top_md_m} to ${c.base_md_m} m` : ''}`}</title>
                    </rect>
                    {y1 - y0 > 12 && <text x={x0 + cw / 2} y={(y0 + y1) / 2 + 3} fontSize="9" fill={c.kind === 'hiatus' || !c.tract ? '#e2e8f0' : '#0f172a'} textAnchor="middle">{label(c)}</text>}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      {/* legend of the tracts on the chart (T1 ST-T1-004) */}
      {(() => {
        const tracts = [...new Set(chart.wells.flatMap((w) => w.cells.map((c) => c.tract).filter(Boolean)))];
        return (
          <div className="flex flex-wrap items-center gap-3 px-2 py-1 text-[11px] text-slate-300" data-testid={`${testIdPrefix}-legend`}>
            {tracts.map((t) => (
              <span key={t} className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded-sm" style={{ background: TRACT_COLOUR[t] }} />
                {displayLabel(t, scheme, { kind: 'tract' }).label}
              </span>
            ))}
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#475569' }} />interval with no tract</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm border border-slate-500" style={{ backgroundImage: 'repeating-linear-gradient(45deg,#94a3b8 0 1px,transparent 1px 4px)' }} />hiatus</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm border border-dashed border-slate-500" />undated</span>
          </div>
        );
      })()}
      {chart.skipped.length > 0 && (
        <div className="text-[11px] text-amber-300 px-2" data-testid={`${testIdPrefix}-skipped`}>
          Not placed: {chart.skipped.map((s) => `${s.name} (${s.reason})`).join('; ')}
        </div>
      )}
    </div>
  );
}
