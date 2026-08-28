// Equal-aspect plan view (WD2): custom SVG on the chart standard. A
// map view must never stretch north against east, so this draws its
// own frame instead of Recharts. Renders the wellpath, slots, lease
// lines, and targets with their true geometry (point, circle, ellipse,
// polygon), all in wellhead-relative coordinates in the caller's unit.

import React, { useMemo, useRef, useState, useEffect } from 'react';
import { CHART_COLORS } from '@/utils/chartTheme';
import ChartLogo from '@/components/charts/ChartLogo';
import { extentOf } from '../services/extent';

const PAD = 42;

function niceStep(span) {
  const raw = span / 6;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / mag;
  const step = n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10;
  return step * mag;
}

const PlanViewChart = ({
  rows = [], targets = [], slots = [], leaseLines = [], unit = 'm',
  extraPaths = [], ellipses = [], title = 'Plan view',
}) => {
  const holder = useRef(null);
  const [size, setSize] = useState({ w: 640, h: 420 });

  useEffect(() => {
    const el = holder.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => {
      setSize({ w: Math.max(240, el.clientWidth), h: Math.max(200, el.clientHeight) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const frame = useMemo(() => {
    const xs = [0];
    const ys = [0];
    rows.forEach((r) => { xs.push(r.e); ys.push(r.n); });
    targets.forEach((t) => {
      xs.push(t.e); ys.push(t.n);
      const r = t.geometry?.radius_m || t.geometry?.semi_major_m || 0;
      if (r) { xs.push(t.e + r, t.e - r); ys.push(t.n + r, t.n - r); }
      (t.geometry?.points || []).forEach(([px, py]) => { xs.push(px); ys.push(py); });
    });
    slots.forEach((s) => { xs.push(s.e); ys.push(s.n); });
    leaseLines.forEach((l) => (l.points || []).forEach(([px, py]) => { xs.push(px); ys.push(py); }));
    extraPaths.forEach((p) => p.points.forEach(([px, py]) => { xs.push(px); ys.push(py); }));
    ellipses.forEach((el) => {
      xs.push(el.e + el.semiMajor, el.e - el.semiMajor);
      ys.push(el.n + el.semiMajor, el.n - el.semiMajor);
    });
    const ex = extentOf(xs);
    const ey = extentOf(ys);
    let minX = ex.min;
    let maxX = ex.max;
    let minY = ey.min;
    let maxY = ey.max;
    const spanX = Math.max(maxX - minX, 10);
    const spanY = Math.max(maxY - minY, 10);
    minX -= spanX * 0.08; maxX += spanX * 0.08;
    minY -= spanY * 0.08; maxY += spanY * 0.08;
    // Equal aspect: expand the smaller span to match scale.
    const availW = size.w - 2 * PAD;
    const availH = size.h - 2 * PAD;
    const scale = Math.min(availW / (maxX - minX), availH / (maxY - minY));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const halfW = availW / scale / 2;
    const halfH = availH / scale / 2;
    return {
      minX: cx - halfW, maxX: cx + halfW, minY: cy - halfH, maxY: cy + halfH, scale,
    };
  }, [rows, targets, slots, leaseLines, extraPaths, ellipses, size]);

  const X = (e) => PAD + (e - frame.minX) * frame.scale;
  const Y = (n) => size.h - PAD - (n - frame.minY) * frame.scale;

  const gridLines = useMemo(() => {
    const step = niceStep(frame.maxX - frame.minX);
    const lines = [];
    for (let v = Math.ceil(frame.minX / step) * step; v <= frame.maxX; v += step) {
      lines.push({ kind: 'v', v });
    }
    for (let v = Math.ceil(frame.minY / step) * step; v <= frame.maxY; v += step) {
      lines.push({ kind: 'h', v });
    }
    return { step, lines };
  }, [frame]);

  const pathD = rows.length
    ? `M ${rows.map((r) => `${X(r.e).toFixed(1)} ${Y(r.n).toFixed(1)}`).join(' L ')}`
    : null;

  const targetShape = (t) => {
    const g = t.geometry || {};
    const common = { fill: (t.color || '#d97706') + '33', stroke: t.color || '#b45309', strokeWidth: 1.5 };
    if (t.kind === 'circle' && g.radius_m) {
      return <circle cx={X(t.e)} cy={Y(t.n)} r={g.radius_m * frame.scale} {...common} />;
    }
    if (t.kind === 'ellipse' && g.semi_major_m) {
      return (
        <ellipse
          cx={X(t.e)} cy={Y(t.n)}
          rx={g.semi_major_m * frame.scale}
          ry={(g.semi_minor_m || g.semi_major_m) * frame.scale}
          transform={`rotate(${g.rotation_deg || 0} ${X(t.e)} ${Y(t.n)})`}
          {...common}
        />
      );
    }
    if (t.kind === 'polygon' && g.points?.length >= 3) {
      const pts = g.points.map(([px, py]) => `${X(px).toFixed(1)},${Y(py).toFixed(1)}`).join(' ');
      return <polygon points={pts} {...common} />;
    }
    return null;
  };

  return (
    <div ref={holder} className="relative h-full w-full bg-white" data-testid="plan-view-chart">
      <div className="px-3 pt-2 text-[11px] font-semibold text-slate-700">
        {title} (N vs E, {unit}; grid {gridLines.step} {unit})
      </div>
      <svg width={size.w} height={size.h} className="absolute inset-0">
        {gridLines.lines.map((l, i) => (l.kind === 'v'
          ? <line key={i} x1={X(l.v)} y1={PAD} x2={X(l.v)} y2={size.h - PAD} stroke={CHART_COLORS.grid} strokeWidth={1} />
          : <line key={i} x1={PAD} y1={Y(l.v)} x2={size.w - PAD} y2={Y(l.v)} stroke={CHART_COLORS.grid} strokeWidth={1} />))}
        <rect x={PAD} y={PAD} width={size.w - 2 * PAD} height={size.h - 2 * PAD} fill="none" stroke={CHART_COLORS.axisLine} strokeWidth={1} />

        {gridLines.lines.filter((l) => l.kind === 'v').map((l, i) => (
          <text key={`xt${i}`} x={X(l.v)} y={size.h - PAD + 14} textAnchor="middle" fontSize={9} fill={CHART_COLORS.axisText}>{l.v.toFixed(0)}</text>
        ))}
        {gridLines.lines.filter((l) => l.kind === 'h').map((l, i) => (
          <text key={`yt${i}`} x={PAD - 6} y={Y(l.v) + 3} textAnchor="end" fontSize={9} fill={CHART_COLORS.axisText}>{l.v.toFixed(0)}</text>
        ))}
        <text x={size.w / 2} y={size.h - 8} textAnchor="middle" fontSize={10} fill={CHART_COLORS.axisLabel}>East ({unit})</text>
        <text x={12} y={size.h / 2} textAnchor="middle" fontSize={10} fill={CHART_COLORS.axisLabel} transform={`rotate(-90 12 ${size.h / 2})`}>North ({unit})</text>

        {/* north arrow */}
        <g transform={`translate(${size.w - PAD - 16}, ${PAD + 22})`}>
          <line x1={0} y1={12} x2={0} y2={-10} stroke={CHART_COLORS.axisText} strokeWidth={1.5} />
          <polygon points="0,-14 -4,-6 4,-6" fill={CHART_COLORS.axisText} />
          <text x={0} y={24} textAnchor="middle" fontSize={9} fill={CHART_COLORS.axisText}>N</text>
        </g>

        {/* lease lines */}
        {leaseLines.map((l, i) => (l.points?.length >= 2 ? (
          <polyline key={`lease${i}`}
            points={l.points.map(([px, py]) => `${X(px).toFixed(1)},${Y(py).toFixed(1)}`).join(' ')}
            fill="none" stroke={l.kind === 'hard' ? '#b91c1c' : '#7c3aed'} strokeWidth={1.5} strokeDasharray="6 4" />
        ) : null))}

        {/* slots */}
        {slots.map((s, i) => (
          <g key={`slot${i}`}>
            <rect x={X(s.e) - 3} y={Y(s.n) - 3} width={6} height={6} fill="none" stroke="#0f766e" strokeWidth={1.5} />
            <text x={X(s.e) + 6} y={Y(s.n) - 4} fontSize={8} fill="#0f766e">{s.name}</text>
          </g>
        ))}

        {/* offset/extra paths */}
        {extraPaths.map((p, i) => (
          <polyline key={`extra${i}`}
            points={p.points.map(([px, py]) => `${X(px).toFixed(1)},${Y(py).toFixed(1)}`).join(' ')}
            fill="none" stroke={p.color || '#64748b'} strokeWidth={1.5} strokeDasharray={p.dash || ''} />
        ))}

        {/* targets */}
        {targets.map((t) => (
          <g key={t.id}>
            {targetShape(t)}
            <circle cx={X(t.e)} cy={Y(t.n)} r={3} fill={t.color || '#b45309'} />
            <text x={X(t.e) + 6} y={Y(t.n) + 3} fontSize={9} fill="#78350f">{t.name}</text>
          </g>
        ))}

        {/* EOU ellipses (uncertainty; major axis at its compass bearing —
            SVG rotate is screen-clockwise with +x = east, so bearing-90) */}
        {ellipses.map((el, i) => (
          <ellipse key={`eou${i}`}
            cx={X(el.e)} cy={Y(el.n)}
            rx={Math.max(1, el.semiMajor * frame.scale)}
            ry={Math.max(1, el.semiMinor * frame.scale)}
            transform={`rotate(${(el.azimuthDeg || 0) - 90} ${X(el.e)} ${Y(el.n)})`}
            fill="#0ea5e922" stroke="#0284c7" strokeWidth={1} strokeDasharray="3 2" />
        ))}

        {/* wellpath */}
        {pathD && <path d={pathD} fill="none" stroke="#166534" strokeWidth={2} />}
        {rows.length > 0 && (
          <>
            <circle cx={X(rows[0].e)} cy={Y(rows[0].n)} r={4} fill="#166534" />
            <circle cx={X(rows[rows.length - 1].e)} cy={Y(rows[rows.length - 1].n)} r={3.5} fill="none" stroke="#166534" strokeWidth={2} />
          </>
        )}
      </svg>
      <ChartLogo style={{ height: 40 }} />
    </div>
  );
};

export default PlanViewChart;
