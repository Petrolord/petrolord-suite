// The strip log drawing (upgrades U2-001 and U2-006): an SVG of tracks side
// by side on one depth scale that runs down the page, on the Suite chart
// standard (white chartTheme, ChartLogo). Tracks are plain data built by
// services/stripLog.js; nothing here computes a value. Every track and
// series carries data attributes so a browser test can check geometry.

import React from 'react';
import ChartLogo from '@/components/charts/ChartLogo';
import { CHART_COLORS, CHART_TYPOGRAPHY } from '@/utils/chartTheme';
import { depthScale, valueScale, depthTicks, curvePath } from './geometry';

const HEAD = 54;
const fmtTick = (v) => (Math.abs(v) >= 100 || Number.isInteger(v) ? String(Math.round(v)) : String(Number(v.toPrecision(3))));

export default function StripLog({ topM, baseM, heightPx, tracks, markers = [], depthUnit = 'm', toDisplay = (m) => m, title = '', testId = 'ws-striplog' }) {
  const ds = depthScale(topM, baseM, heightPx);
  const { ticks } = depthTicks(toDisplay(topM), toDisplay(baseM), heightPx);
  const fromDisplay = (v) => topM + ((v - toDisplay(topM)) / (toDisplay(baseM) - toDisplay(topM))) * (baseM - topM);
  let x = 0;
  const placed = tracks.map((t) => { const p = { ...t, x0: x }; x += t.width; return p; });
  const width = x;
  const labelTrack = placed.find((t) => t.type === 'markers') || null;
  // marker lines start after the depth track so they never strike through a depth label
  const markerX0 = placed.length && placed[0].type === 'depth' ? placed[0].width : 0;
  const font = { fontFamily: CHART_TYPOGRAPHY.fontFamily, fontSize: CHART_TYPOGRAPHY.annotationFontSize, fill: CHART_COLORS.axisText };
  return (
    <div className="relative inline-block bg-white rounded-lg border border-slate-300 p-2" data-canvas="chart" data-testid={testId} data-top-m={topM} data-base-m={baseM} data-height={heightPx} data-tracks={tracks.map((t) => t.id).join(',')}>
      <svg width={width} height={HEAD + heightPx + 4} viewBox={`0 0 ${width} ${HEAD + heightPx + 4}`} role="img" aria-label={title || 'Strip log'} style={{ background: CHART_COLORS.background, display: 'block' }}>
        {placed.map((t) => (
          <g key={t.id} transform={`translate(${t.x0},0)`} data-testid={`${testId}-track-${t.id}`} data-track={t.id} data-x0={t.x0} data-width={t.width}>
            <rect x={0} y={0} width={t.width} height={HEAD} fill="#f8fafc" stroke={CHART_COLORS.axisLine} />
            <text x={t.width / 2} y={13} textAnchor="middle" style={{ ...font, fontSize: CHART_TYPOGRAPHY.axisFontSize, fill: CHART_COLORS.axisLabel, fontWeight: 600 }}>{t.title}</text>
            {t.unit ? <text x={t.width / 2} y={25} textAnchor="middle" style={font}>{t.unit}</text> : null}
            {t.type === 'curve' && t.scale ? (
              <>
                <text x={3} y={HEAD - 5} style={font}>{fmtTick(t.scale.min)}</text>
                <text x={t.width - 3} y={HEAD - 5} textAnchor="end" style={font}>{fmtTick(t.scale.max)}</text>
                {(t.series || []).map((s, i) => (
                  <g key={s.id}>
                    <line x1={6 + i * (t.width / Math.max(1, t.series.length))} x2={22 + i * (t.width / Math.max(1, t.series.length))} y1={36} y2={36} stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? '4 3' : undefined} />
                    <text x={25 + i * (t.width / Math.max(1, t.series.length))} y={39} style={{ ...font, fontSize: 9 }}>{s.label}</text>
                  </g>
                ))}
              </>
            ) : null}
            <g transform={`translate(0,${HEAD})`}>
              <rect x={0} y={0} width={t.width} height={heightPx} fill={CHART_COLORS.plotArea} stroke={CHART_COLORS.axisLine} />
              {ticks.map((v) => { const y = ds.y(fromDisplay(v)); return <line key={v} x1={0} x2={t.width} y1={y} y2={y} stroke={CHART_COLORS.grid} strokeWidth={1} />; })}
              {t.type === 'depth' && ticks.map((v) => { const y = ds.y(fromDisplay(v)); return <text key={v} x={t.width - 4} y={Math.min(heightPx - 2, y + 3)} textAnchor="end" style={font} data-depth-tick={v} data-y={y.toFixed(1)}>{fmtTick(v)}</text>; })}
              {t.type === 'curve' && t.scale ? <CurveBody t={t} ds={ds} /> : null}
              {t.type === 'lith' && (t.intervals || []).map((iv) => {
                const y0 = Math.max(0, ds.y(iv.topM)); const y1 = Math.min(heightPx, ds.y(iv.baseM));
                if (!(y1 > y0)) return null;
                return (
                  <g key={iv.id} data-lith={iv.code} data-y0={y0.toFixed(1)} data-y1={y1.toFixed(1)}>
                    {(iv.parts || [{ color: iv.color, fraction: 1 }]).reduce((acc, part, i) => { const w = part.fraction * t.width; acc.nodes.push(<rect key={i} x={acc.x} y={y0} width={w} height={y1 - y0} fill={part.color} stroke="#475569" strokeWidth={0.3}><title>{iv.label}</title></rect>); acc.x += w; return acc; }, { x: 0, nodes: [] }).nodes}
                  </g>
                );
              })}
              {t.type === 'text' && (t.items || []).map((it) => {
                const y = ds.y(it.mdM);
                if (!(y >= 0 && y <= heightPx)) return null;
                return <text key={it.id} x={4} y={Math.min(heightPx - 2, y + 9)} style={{ ...font, fill: it.color || CHART_COLORS.axisText }} data-item={it.id} data-y={y.toFixed(1)}>{it.text.length > t.maxChars ? `${it.text.slice(0, t.maxChars - 1)}.` : it.text}<title>{it.text}</title></text>;
              })}
            </g>
          </g>
        ))}
        <g transform={`translate(0,${HEAD})`}>
          {markers.map((m) => {
            const y = ds.y(m.mdM);
            if (!(y >= 0 && y <= heightPx)) return null;
            return (
              <g key={m.id} data-testid={`${testId}-marker-${m.id}`} data-marker={m.kind} data-y={y.toFixed(1)}>
                <line x1={markerX0} x2={width} y1={y} y2={y} stroke={m.color} strokeWidth={1.2} strokeDasharray={m.dashed ? '6 4' : undefined} />
                {labelTrack
                  ? <text x={labelTrack.x0 + 4} y={Math.max(9, y - 2)} style={{ ...font, fill: m.color, fontWeight: 600 }}>{m.label}</text>
                  : <text x={width - 4} y={y - 2} textAnchor="end" style={{ ...font, fill: m.color, fontWeight: 600 }}>{m.label}</text>}
              </g>
            );
          })}
        </g>
      </svg>
      <div className="text-[10px] text-slate-600 mt-1" data-testid={`${testId}-caption`}>{title} Depth in {depthUnit} MD below KB, increasing downward.</div>
      <ChartLogo />
    </div>
  );
}

function CurveBody({ t, ds }) {
  const vs = valueScale(t.scale, t.width);
  const grid = [];
  if (t.scale.log) {
    for (let d = Math.log10(t.scale.min); d < Math.log10(t.scale.max); d += 1) for (let k = 1; k < 10; k += 1) { const v = k * 10 ** d; const x = vs.x(v); if (x > 0 && x < t.width) grid.push({ x, major: k === 1 }); }
  } else for (let k = 1; k < 4; k += 1) grid.push({ x: (k / 4) * t.width, major: k === 2 });
  return (
    <>
      {grid.map((g, i) => <line key={i} x1={g.x} x2={g.x} y1={0} y2={ds.heightPx} stroke={CHART_COLORS.grid} strokeWidth={g.major ? 1 : 0.5} />)}
      {(t.series || []).map((s) => (
        <g key={s.id} data-testid={`ws-striplog-series-${t.id}-${s.id}`} data-series={s.id} data-points={s.points.length}>
          {!s.markerOnly && <path d={curvePath(s.points, ds, vs, { gapM: s.gapM })} fill="none" stroke={s.color} strokeWidth={s.dashed ? 1.2 : 1.5} strokeDasharray={s.dashed ? '4 3' : undefined} />}
          {(s.markers || s.markerOnly) && s.points.map((p, i) => {
            const x = vs.x(p.v); const y = ds.y(p.mdM);
            if (!Number.isFinite(x) || !(y >= 0 && y <= ds.heightPx)) return null;
            return <circle key={i} cx={Math.max(0, Math.min(t.width, x))} cy={y} r={p.flag ? 3 : 2} fill={p.flag ? '#dc2626' : s.color} data-flag={p.flag ? 'yes' : 'no'} data-x={x.toFixed(1)} data-y={y.toFixed(1)} />;
          })}
        </g>
      ))}
    </>
  );
}
