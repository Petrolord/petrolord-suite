// Section view (TVD down vs vertical section) as an SVG on the chart
// standard (white surface + ChartLogo watermark). It replaced the
// Recharts panel, which fitted VS and TVD independently and so drew a
// gentle 3 deg/30 m build as a sharp corner (tester case Darm PlanB,
// about 10:1 distortion). Default is true scale (equal length per pixel
// on both axes); the exaggeration picker stretches one axis and the
// factor is printed inside the plot so screenshots carry it.
//
// Rows: {md, inc, azi, tvd, vs, dls30m, dls100ft} in the caller's unit.
// Overlays: [{name, rows:[{vs,tvd}], color, dash}] in the same frame.
// Targets: [{id, name, vs, tvd}] already projected onto the VS azimuth.

import React, { useMemo, useRef, useState, useEffect } from 'react';
import { CHART_COLORS } from '@/utils/chartTheme';
import ChartLogo from '@/components/charts/ChartLogo';
import DlsLegend from './DlsLegend';
import {
  EXAGGERATION_OPTIONS, DEFAULT_EXAGGERATION, exaggerationOption, exaggerationLabel,
  fitAspectFrame, boxOf, niceStep, dlsRuns,
} from '../services/sectionScale';

const M = { l: 50, r: 14, t: 10, b: 32 };
const PATH_COLOR = '#166534';

const pts = (list, X, Y) => list.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(' ');

const SectionViewChart = ({
  rows = [], unit = 'm', vsAzimuthDeg, overlays = [], targets = [], name = 'Plan',
  exaggeration, onExaggerationChange, dlsScale = null, title,
}) => {
  const holder = useRef(null);
  const [size, setSize] = useState({ w: 640, h: 420 });
  const [innerEx, setInnerEx] = useState(DEFAULT_EXAGGERATION);
  const [hover, setHover] = useState(null);
  const exId = exaggeration ?? innerEx;
  const setEx = onExaggerationChange || setInnerEx;
  const ratio = exaggerationOption(exId).ratio;

  useEffect(() => {
    const el = holder.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => {
      setSize({ w: Math.max(240, el.clientWidth), h: Math.max(180, el.clientHeight) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const plotW = size.w - M.l - M.r;
  const plotH = size.h - M.t - M.b;

  const frame = useMemo(() => {
    const box = boxOf([
      [[0, 0]],
      rows.map((r) => [r.vs, r.tvd]),
      ...overlays.map((o) => (o.rows || []).map((r) => [r.vs, r.tvd])),
      targets.map((t) => [t.vs, t.tvd]),
    ]);
    return fitAspectFrame(box, { w: plotW, h: plotH }, ratio);
  }, [rows, overlays, targets, plotW, plotH, ratio]);

  const X = (vs) => M.l + (vs - frame.minX) * frame.sx;
  const Y = (tvd) => M.t + (tvd - frame.minY) * frame.sy;

  const grid = useMemo(() => {
    let sx = niceStep(frame.maxX - frame.minX, Math.max(2, plotW / 90));
    let sy = niceStep(frame.maxY - frame.minY, Math.max(2, plotH / 55));
    // True scale: square grid cells, so the eye can check the geometry.
    if (Math.abs(ratio - 1) < 1e-9) { sx = Math.max(sx, sy); sy = sx; }
    const xs = [];
    const ys = [];
    for (let v = Math.ceil(frame.minX / sx) * sx; v <= frame.maxX + 1e-9 && xs.length < 200; v += sx) xs.push(v);
    for (let v = Math.ceil(frame.minY / sy) * sy; v <= frame.maxY + 1e-9 && ys.length < 200; v += sy) ys.push(v);
    return { sx, sy, xs, ys };
  }, [frame, plotW, plotH, ratio]);

  const runs = useMemo(() => (dlsScale
    ? dlsRuns(rows, (r) => [r.vs, r.tvd], (r) => r[dlsScale.key], dlsScale)
    : null), [rows, dlsScale]);

  const onMove = (ev) => {
    if (!rows.length) return;
    const rect = ev.currentTarget.getBoundingClientRect();
    const px = ev.clientX - rect.left;
    const py = ev.clientY - rect.top;
    let best = null;
    let bestD = Infinity;
    for (let i = 0; i < rows.length; i++) {
      const dx = X(rows[i].vs) - px;
      const dy = Y(rows[i].tvd) - py;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = rows[i]; }
    }
    setHover(bestD < 40 * 40 ? best : null);
  };

  const scaleText = `${exaggerationLabel(ratio)}  |  grid ${grid.sx === grid.sy ? `${grid.sx} ${unit}` : `${grid.sx} x ${grid.sy} ${unit}`}`;
  const dlsKey = dlsScale?.key || (unit === 'ft' ? 'dls100ft' : 'dls30m');
  const clipId = useMemo(() => `sv-clip-${Math.random().toString(36).slice(2, 9)}`, []);

  return (
    <div className="relative flex h-full min-h-0 w-full min-w-0 flex-col bg-white" data-testid="section-view-chart">
      <div className="flex items-center gap-2 px-3 pt-2">
        <div className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-700">
          {title || `Section view (TVD vs VS at ${Number.isFinite(vsAzimuthDeg) ? vsAzimuthDeg.toFixed(1) : '--'}°, ${unit})`}
        </div>
        <label className="flex items-center gap-1 text-[10px] text-slate-500">
          Scale
          <select
            value={exId}
            onChange={(e) => setEx(e.target.value)}
            className="h-5 rounded border border-slate-300 bg-white px-1 text-[10px] text-slate-700"
            data-testid="section-exaggeration"
            title="True scale draws VS and TVD at the same length per pixel. VS stretches the section sideways (useful for a deep near-vertical well); TVD stretches depth.">
            {EXAGGERATION_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.short}</option>)}
          </select>
        </label>
      </div>
      <div ref={holder} className="relative min-h-0 flex-1">
        <svg width={size.w} height={size.h} className="absolute inset-0"
          onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          <defs>
            <clipPath id={clipId}><rect x={M.l} y={M.t} width={plotW} height={plotH} /></clipPath>
          </defs>
          {grid.xs.map((v) => (
            <line key={`gx${v}`} x1={X(v)} y1={M.t} x2={X(v)} y2={M.t + plotH} stroke={CHART_COLORS.grid} strokeWidth={1} />
          ))}
          {grid.ys.map((v) => (
            <line key={`gy${v}`} x1={M.l} y1={Y(v)} x2={M.l + plotW} y2={Y(v)} stroke={CHART_COLORS.grid} strokeWidth={1} />
          ))}
          <rect x={M.l} y={M.t} width={plotW} height={plotH} fill="none" stroke={CHART_COLORS.axisLine} strokeWidth={1} />
          {grid.xs.map((v) => (
            <text key={`tx${v}`} x={X(v)} y={M.t + plotH + 12} textAnchor="middle" fontSize={9} fill={CHART_COLORS.axisText}>{v.toFixed(0)}</text>
          ))}
          {grid.ys.map((v) => (
            <text key={`ty${v}`} x={M.l - 5} y={Y(v) + 3} textAnchor="end" fontSize={9} fill={CHART_COLORS.axisText}>{v.toFixed(0)}</text>
          ))}
          <text x={M.l + plotW / 2} y={size.h - 4} textAnchor="middle" fontSize={10} fill={CHART_COLORS.axisLabel}>Vertical section ({unit})</text>
          <text x={11} y={M.t + plotH / 2} textAnchor="middle" fontSize={10} fill={CHART_COLORS.axisLabel}
            transform={`rotate(-90 11 ${M.t + plotH / 2})`}>TVD ({unit})</text>

          <g clipPath={`url(#${clipId})`}>
            {overlays.map((o) => ((o.rows || []).length >= 2 ? (
              <polyline key={`ov-${o.name}`} points={pts(o.rows.map((r) => [r.vs, r.tvd]), X, Y)}
                fill="none" stroke={o.color || '#b91c1c'} strokeWidth={o.width || 1.5}
                strokeDasharray={o.dash ?? '5 3'} />
            ) : null))}
            {overlays.filter((o) => o.label && (o.rows || []).length).map((o) => {
              const last = o.rows[o.rows.length - 1];
              return (
                <text key={`ovl-${o.name}`} x={X(last.vs) + 4} y={Y(last.tvd) + 3} fontSize={9} fill="#334155">{o.label}</text>
              );
            })}

            {runs
              ? runs.map((run, i) => (
                <polyline key={`run${i}`} points={pts(run.points, X, Y)} fill="none"
                  stroke={run.color} strokeWidth={run.over ? 4.5 : 2.5}
                  strokeLinecap="round" strokeLinejoin="round" />
              ))
              : rows.length >= 2 && (
                <polyline points={pts(rows.map((r) => [r.vs, r.tvd]), X, Y)} fill="none"
                  stroke={PATH_COLOR} strokeWidth={2} strokeLinejoin="round" />
              )}

            {targets.map((t) => (Number.isFinite(t.vs) && Number.isFinite(t.tvd) ? (
              <g key={t.id}>
                <circle cx={X(t.vs)} cy={Y(t.tvd)} r={4} fill="#d97706" stroke="#92400e" />
                <text x={X(t.vs) + 6} y={Y(t.tvd) + 3} fontSize={9} fill="#92400e">{t.name}</text>
              </g>
            ) : null))}

            {hover && (
              <circle cx={X(hover.vs)} cy={Y(hover.tvd)} r={4} fill="none" stroke="#0f172a" strokeWidth={1.5} />
            )}
          </g>

          {/* scale note: inside the plot so a screenshot carries it */}
          <g data-testid="section-scale-note">
            <rect x={M.l + 4} y={M.t + 4} width={Math.min(plotW - 8, scaleText.length * 5.3 + 10)} height={15}
              fill="#ffffff" fillOpacity={0.9} stroke={CHART_COLORS.grid} />
            <text x={M.l + 9} y={M.t + 14.5} fontSize={9.5} fontWeight={600} fill={CHART_COLORS.axisLabel}>{scaleText}</text>
          </g>
        </svg>

        {(overlays.some((o) => o.name) || dlsScale) && (
          <div className="pointer-events-none absolute flex flex-col items-end gap-1" style={{ right: M.r + 4, top: M.t + 4 }}>
            {overlays.some((o) => o.name && !o.hideInLegend) && (
              <div className="rounded border border-slate-200 bg-white/95 px-2 py-1 text-[9px] text-slate-700 shadow-sm" data-testid="section-legend">
                <div className="flex items-center gap-1.5">
                  <svg width="18" height="6" aria-hidden="true"><line x1="1" y1="3" x2="17" y2="3" stroke={PATH_COLOR} strokeWidth={2} /></svg>
                  {name}
                </div>
                {overlays.filter((o) => o.name && !o.hideInLegend).map((o) => (
                  <div key={o.name} className="flex items-center gap-1.5">
                    <svg width="18" height="6" aria-hidden="true">
                      <line x1="1" y1="3" x2="17" y2="3" stroke={o.color || '#b91c1c'} strokeWidth={1.5} strokeDasharray={o.dash ?? '5 3'} />
                    </svg>
                    {o.name}
                  </div>
                ))}
              </div>
            )}
            <DlsLegend scale={dlsScale} />
          </div>
        )}

        {hover && (
          <div className="pointer-events-none absolute rounded border border-slate-300 bg-white px-2 py-1 text-[10px] text-slate-800 shadow"
            style={{ left: Math.min(X(hover.vs) + 10, size.w - 150), top: Math.max(4, Y(hover.tvd) - 40) }}
            data-testid="section-hover">
            <div>MD {hover.md?.toFixed(1)} {unit}</div>
            <div>TVD {hover.tvd.toFixed(1)} | VS {hover.vs.toFixed(1)}</div>
            <div>Inc {Number.isFinite(hover.inc) ? hover.inc.toFixed(2) : '--'}° | DLS {Number.isFinite(hover[dlsKey]) ? hover[dlsKey].toFixed(2) : '--'}</div>
          </div>
        )}
        <ChartLogo style={{ height: 40 }} />
      </div>
    </div>
  );
};

export default SectionViewChart;
