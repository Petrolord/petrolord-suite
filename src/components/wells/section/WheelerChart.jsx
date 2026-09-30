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
import { withSectionTracts } from '@/lib/stratigraphy/sequenceTracts';
import ChartLogo from '@/components/charts/ChartLogo';
import { CHART_COLORS } from '@/utils/chartTheme';
import { columnLayout, spacingProblem } from './sectionFrame';

const TRACT_COLOUR = Object.fromEntries(SYSTEMS_TRACTS.map((t) => [t.code, t.colour]));
const AXIS_W = 56;
const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);
const HEAD_H = 28;

/**
 * @param {Object} p
 * @param {Array<{id, name, position?, surfaces: Array<{name, md_m, age_ma, hiatus_to_ma?, surface_type?}>}>} p.wells
 * @param {'catuneanu'|'exxon'} p.scheme
 * @param {number} [p.width]
 * @param {number} [p.height]
 * @param {boolean} [p.showStages] draw ICS stage bands behind the columns
 * @param {string} [p.testIdPrefix]
 * @param {?Object<string, Array>} [p.tractRows] STRAT-U1-001: the tract intervals the section fills per well (recorded or implied); cells take the tract that holds them
 * @param {'equal'|'proportional'|'line'} [p.spacing] STRAT-U2-001: columns at equal spacing, by the wellhead distance
 *   (the wells carry surface_x/y, crs, xy_unit; the kit's CRS-aware distances) or along the drawn section line (p.alongM)
 * @param {?Object<string, number>} [p.alongM] well id -> metres along the section line (spacing 'line')
 */
export default function WheelerChart({ wells, tractRows = null, scheme = 'catuneanu', width = 720, height = 420, showStages = true, testIdPrefix = 'wheeler', spacing = 'equal', alongM = null }) {
  const chart = useMemo(() => {
    const c = wheelerChart(wells || []);
    return tractRows ? withSectionTracts(c, tractRows) : c;
  }, [wells, tractRows]);
  const n = chart.wells.length;
  const plotW = Math.max(60, width - AXIS_W - 8);
  const plotH = Math.max(60, height - HEAD_H - 24);
  // STRAT-U2-001: the columns of the wells the chart places, spaced as the
  // section is (the kit's columnLayout: equal, by distance, along the line);
  // distances run between the placed wells, so an undated well in between
  // does not hold a gap open
  const layout = useMemo(() => {
    const byId = new Map((wells || []).map((w) => [w.id, w]));
    const placed = chart.wells.map((w) => ({ ...(byId.get(w.id) || {}), id: w.id, name: w.name }));
    let note = null;
    let distances = null;
    if (spacing === 'line') {
      const ok = alongM && placed.every((w) => Number.isFinite(alongM[w.id]));
      if (ok) distances = placed.slice(1).map((w, i) => Math.abs(alongM[w.id] - alongM[placed[i].id]));
      else if (placed.length > 1) note = 'the Wheeler wells are not the wells of the drawn line';
    } else if (spacing === 'proportional') {
      note = spacingProblem(placed);
    }
    const mode = note || spacing === 'equal' ? 'equal' : 'proportional';
    // narrower columns than the log section (half the equal width, 120 px at most) leave room
    // for the distances to show before two close wells have to be pushed apart
    const colW = Math.max(28, Math.min((plotW / Math.max(1, placed.length)) * 0.5, 120));
    const cols = columnLayout(placed, { mode, plotLeft: AXIS_W, plotW, minColPx: 28, colW, distances });
    return { cols, note, mode };
  }, [chart.wells, wells, spacing, alongM, plotW]);
  const span = Math.max(1e-6, chart.age_max_ma - chart.age_min_ma);
  const yOf = (ma) => HEAD_H + ((ma - chart.age_min_ma) / span) * plotH;
  const stages = useMemo(() => (showStages && n ? unitsBetween(chart.age_min_ma, chart.age_max_ma, 'age') : []), [showStages, n, chart.age_min_ma, chart.age_max_ma]);

  if (!n) {
    return (
      <div className="text-xs text-pl-muted p-3" data-testid={`${testIdPrefix}-empty`}>
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
    // STRAT-U1-013 (2026-09-30): the house chart standard, white chart paper
    // and the Petrolord watermark, in both themes (it was a dark canvas)
    <div data-testid={`${testIdPrefix}-chart`} data-spacing={layout.mode} data-col-x={layout.cols.map((c) => Math.round(c.x0 + c.w / 2)).join(',')} data-cell-count={chart.wells.reduce((s, w) => s + w.cells.length, 0)} data-age-max={chart.age_max_ma} data-canvas="chart" className="relative overflow-x-auto rounded border border-slate-200 bg-white pb-10">
      <svg width={width} height={height} className="block" xmlns="http://www.w3.org/2000/svg" fontFamily="sans-serif">
        <rect x="0" y="0" width={width} height={height} fill={CHART_COLORS.background} />
        <defs>
          <pattern id={`${testIdPrefix}-hatch`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#64748b" strokeWidth="1.2" />
          </pattern>
        </defs>
        {/* ICS stages behind the columns */}
        {stages.map((u) => {
          const y0 = yOf(Math.max(u.top_ma, chart.age_min_ma)); const y1 = yOf(Math.min(u.base_ma, chart.age_max_ma));
          return (
            <g key={u.name}>
              <rect x={AXIS_W} y={y0} width={plotW} height={Math.max(0, y1 - y0)} fill="#f1f5f9" stroke="#e2e8f0" strokeWidth="0.5" />
              {y1 - y0 > 11 && <text x={AXIS_W + plotW - 3} y={y0 + 9} fontSize="8" fill="#64748b" textAnchor="end">{u.name}</text>}
            </g>
          );
        })}
        {/* age axis */}
        <line x1={AXIS_W} y1={HEAD_H} x2={AXIS_W} y2={HEAD_H + plotH} stroke={CHART_COLORS.axisLine} />
        {chart.boundaries.map((b) => (
          <g key={b}>
            <line x1={AXIS_W - 4} y1={yOf(b)} x2={AXIS_W} y2={yOf(b)} stroke={CHART_COLORS.axisLine} />
            <text x={AXIS_W - 6} y={yOf(b) + 3} fontSize="9" fill={CHART_COLORS.axisText} textAnchor="end">{b}</text>
          </g>
        ))}
        <text x={AXIS_W - 6} y={HEAD_H - 8} fontSize="9" fill={CHART_COLORS.axisLabel} textAnchor="end">Ma</text>
        {/* wells */}
        {chart.wells.map((w, i) => {
          const box = layout.cols[i];
          const inset = layout.mode === 'equal' ? 6 : 2;
          const x0 = box.x0 + inset; const cw = Math.max(8, box.w - 2 * inset);
          // Stratigraphy T1 (ST-T1-004): the part of the chart this well has no
          // dated record for reads "undated", distinct from a hiatus
          const wTop = Math.min(...w.cells.map((c) => c.from_ma));
          const wBase = Math.max(...w.cells.map((c) => c.to_ma));
          const gaps = [[chart.age_min_ma, wTop], [wBase, chart.age_max_ma]].filter(([a, b]) => b - a > 1e-9);
          return (
            <g key={w.id} data-testid={`${testIdPrefix}-well-${w.name}`}>
              <text x={x0 + cw / 2} y={HEAD_H - 8} fontSize="10" fontWeight="bold" fill={CHART_COLORS.axisLabel} textAnchor="middle">{w.name}</text>
              {gaps.map(([a, b]) => (
                <g key={`undated-${a}`} data-testid={`${testIdPrefix}-undated-${w.name}`}>
                  <rect x={x0} y={yOf(a)} width={cw} height={Math.max(1, yOf(b) - yOf(a))} fill="none" stroke="#94a3b8" strokeDasharray="3 3" strokeWidth="0.8" />
                  {yOf(b) - yOf(a) > 12 && <text x={x0 + cw / 2} y={(yOf(a) + yOf(b)) / 2 + 3} fontSize="9" fill="#64748b" textAnchor="middle">undated</text>}
                </g>
              ))}
              {w.cells.map((c, k) => {
                const y0 = yOf(c.from_ma); const y1 = yOf(c.to_ma);
                const fill = c.kind === 'hiatus' ? `url(#${testIdPrefix}-hatch)` : (c.tract ? TRACT_COLOUR[c.tract] : '#cbd5e1');
                return (
                  <g key={`${c.kind}-${c.from_ma}-${k}`} data-testid={`${testIdPrefix}-cell-${w.name}-${k}`} data-kind={c.kind} data-tract={c.tract || ''} data-from={c.from_ma} data-to={c.to_ma}>
                    <rect x={x0} y={y0} width={cw} height={Math.max(1, y1 - y0)} fill={fill} opacity={c.kind === 'hiatus' ? 1 : (c.certain ? 0.85 : 0.5)} stroke="#475569" strokeWidth="0.5">
                      <title>{`${w.name}: ${c.label}, ${c.from_ma} to ${c.to_ma} Ma${c.kind === 'deposition' ? `, ${c.top_md_m} to ${c.base_md_m} m` : ''}`}</title>
                    </rect>
                    {y1 - y0 > 12 && <text x={x0 + cw / 2} y={(y0 + y1) / 2 + 3} fontSize="9" fill="#0f172a" textAnchor="middle">{label(c)}</text>}
                  </g>
                );
              })}
            </g>
          );
        })}
        {/* STRAT-U2-001: the distance each gap stands for, as the section prints it */}
        {layout.mode !== 'equal' && layout.cols.slice(0, -1).map((c, i) => (Number.isFinite(c.distM) || (spacing === 'line' && alongM) ? (
          <text key={`d${i}`} data-testid={`${testIdPrefix}-gap-${i}`} x={(c.x0 + c.w + layout.cols[i + 1].x0) / 2} y={height - 6} fontSize="8" fill="#64748b" textAnchor="middle">
            {fmtDist(spacing === 'line' && alongM ? Math.abs(alongM[chart.wells[i + 1].id] - alongM[chart.wells[i].id]) : c.distM)}
          </text>
        ) : null))}
      </svg>
      {/* legend of the tracts on the chart (T1 ST-T1-004) */}
      {(() => {
        const tracts = [...new Set(chart.wells.flatMap((w) => w.cells.map((c) => c.tract).filter(Boolean)))];
        return (
          <div className="flex flex-wrap items-center gap-3 px-2 py-1 text-[11px] text-slate-700" data-testid={`${testIdPrefix}-legend`}>
            {tracts.map((t) => (
              <span key={t} className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded-sm" style={{ background: TRACT_COLOUR[t] }} />
                {displayLabel(t, scheme, { kind: 'tract' }).label}
              </span>
            ))}
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#cbd5e1' }} />interval with no tract</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm border border-slate-400" style={{ backgroundImage: 'repeating-linear-gradient(45deg,#64748b 0 1px,transparent 1px 4px)' }} />hiatus</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm border border-dashed border-slate-400" />undated</span>
          </div>
        );
      })()}
      {layout.note && (
        <div className="text-[11px] text-amber-700 px-2" data-testid={`${testIdPrefix}-spacing-note`}>Spacing by distance is off: {layout.note}. The columns are equal.</div>
      )}
      {chart.skipped.length > 0 && (
        <div className="text-[11px] text-amber-700 px-2" data-testid={`${testIdPrefix}-skipped`}>
          Not placed: {chart.skipped.map((s) => `${s.name} (${s.reason})`).join('; ')}
        </div>
      )}
      <ChartLogo style={{ height: '28px' }} />
    </div>
  );
}
