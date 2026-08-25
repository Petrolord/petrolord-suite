// Traveling-cylinder plot (WD4): the driller's collision-avoidance
// polar view. The reference well is the centre; each offset well walks
// outward as a trace of (traveling-cylinder azimuth, centre-to-centre
// distance) sampled at the reference stations. Azimuth is
// highside-referenced by default (0° = highside toolface) or
// north-referenced. Custom equal-aspect SVG on the chart standard —
// Recharts has no polar frame worth bending.

import React, { useMemo, useRef, useState, useEffect } from 'react';
import { CHART_COLORS } from '@/utils/chartTheme';
import ChartLogo from '@/components/charts/ChartLogo';

const SERIES_COLORS = ['#1d4ed8', '#b45309', '#0f766e', '#7c3aed', '#be185d', '#4d7c0f', '#b91c1c', '#0369a1'];
const PAD = 34;

function niceStep(span) {
  const raw = span / 4;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / mag;
  const step = n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10;
  return step * mag;
}

/**
 * results: [{id, label, clearance}] — uses toolfaceBearingDeg
 * (highside) or travCylAziDeg (north) + distanceCC per reference
 * station. maxRadius (metres) clips the view to the neighbourhood.
 */
const TravelingCylinderChart = ({
  results = [], referenceFrame = 'highside', maxRadius = null, unit = 'm',
  metersToUser = (v) => v,
}) => {
  const holder = useRef(null);
  const [size, setSize] = useState({ w: 480, h: 420 });

  useEffect(() => {
    const el = holder.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => {
      setSize({ w: Math.max(240, el.clientWidth), h: Math.max(220, el.clientHeight) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const series = useMemo(() => results.map((r, i) => ({
    id: r.id,
    label: r.label,
    color: SERIES_COLORS[i % SERIES_COLORS.length],
    points: r.clearance.md.map((md, j) => ({
      md,
      azi: referenceFrame === 'north'
        ? r.clearance.travCylAziDeg[j]
        : r.clearance.toolfaceBearingDeg[j],
      radius: metersToUser(r.clearance.distanceCC[j]),
      sf: r.clearance.sf[j],
    })),
  })), [results, referenceFrame, metersToUser]);

  const rMax = useMemo(() => {
    if (Number.isFinite(maxRadius)) return metersToUser(maxRadius);
    let m = 0;
    series.forEach((s) => s.points.forEach((p) => { m = Math.max(m, p.radius); }));
    return m > 0 ? m * 1.08 : 100;
  }, [series, maxRadius, metersToUser]);

  const cx = size.w / 2;
  const cy = (size.h - 14) / 2 + 8;
  const rScale = (Math.min(size.w, size.h - 22) / 2 - PAD) / rMax;
  const px = (azi, r) => cx + Math.sin(azi * Math.PI / 180) * r * rScale;
  const py = (azi, r) => cy - Math.cos(azi * Math.PI / 180) * r * rScale;

  const ringStep = niceStep(rMax);
  const rings = [];
  for (let r = ringStep; r <= rMax + 1e-9; r += ringStep) rings.push(r);

  const zeroLabel = referenceFrame === 'north' ? 'N' : 'HS';

  return (
    <div ref={holder} className="relative h-full w-full bg-white" data-testid="traveling-cylinder-chart">
      <div className="px-3 pt-2 text-[11px] font-semibold text-slate-700">
        Traveling cylinder ({referenceFrame === 'north' ? 'north' : 'highside'} reference, rings {ringStep} {unit})
      </div>
      <svg width={size.w} height={size.h} className="absolute inset-0">
        {rings.map((r) => (
          <circle key={r} cx={cx} cy={cy} r={r * rScale} fill="none"
            stroke={CHART_COLORS.grid} strokeWidth={1} />
        ))}
        {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((a) => (
          <g key={a}>
            <line x1={cx} y1={cy} x2={px(a, rMax)} y2={py(a, rMax)}
              stroke={CHART_COLORS.grid} strokeWidth={a % 90 === 0 ? 1.2 : 0.6} />
            <text x={px(a, rMax * 1.06)} y={py(a, rMax * 1.06) + 3} textAnchor="middle"
              fontSize={9} fill={CHART_COLORS.axisText}>
              {a === 0 ? zeroLabel : a}
            </text>
          </g>
        ))}
        {rings.map((r) => (
          <text key={`rl${r}`} x={cx + 3} y={cy - r * rScale - 2} fontSize={8}
            fill={CHART_COLORS.axisText}>{r.toFixed(0)}</text>
        ))}

        {/* reference well at the centre */}
        <circle cx={cx} cy={cy} r={4} fill="#166534" />

        {series.map((s) => (
          <g key={s.id}>
            <polyline
              points={s.points.map((p) => `${px(p.azi, Math.min(p.radius, rMax)).toFixed(1)},${py(p.azi, Math.min(p.radius, rMax)).toFixed(1)}`).join(' ')}
              fill="none" stroke={s.color} strokeWidth={1.6} />
            {s.points.filter((p) => p.sf < 1.5 && p.radius <= rMax).map((p, j) => (
              <circle key={j} cx={px(p.azi, p.radius)} cy={py(p.azi, p.radius)} r={2.5}
                fill={p.sf < 1.0 ? '#b91c1c' : '#d97706'} />
            ))}
          </g>
        ))}
      </svg>
      {/* legend */}
      <div className="absolute bottom-1 left-2 right-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[9px] text-slate-600">
        {series.map((s) => (
          <span key={s.id} className="inline-flex items-center gap-1">
            <span className="inline-block h-0.5 w-4" style={{ background: s.color }} /> {s.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-[#d97706]" /> SF&lt;1.5</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-[#b91c1c]" /> SF&lt;1.0</span>
      </div>
      <ChartLogo style={{ height: 40 }} />
    </div>
  );
};

export default TravelingCylinderChart;
