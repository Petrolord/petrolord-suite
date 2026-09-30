// Surfaces along a section line (Mapping U2-013): the white Petrolord
// chart template (chartTheme + ChartLogo), distance along the line in
// kilometres, the surfaces in the display unit with depth downward, wells
// near the line as labelled verticals, and the vertical exaggeration the
// box draws at stated under it (PL6: a section is true scale or says its
// exaggeration).

import React, { useEffect, useRef, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Legend,
} from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, PINNED_TOOLTIP_PROPS, LEGEND_PROPS,
} from '@/utils/chartTheme';
import { verticalExaggeration } from '../services/sectionLine';

const AXIS = { fontSize: CHART_TYPOGRAPHY.axisFontSize, fill: CHART_COLORS.axisText };
const PALETTE = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#dc2626', '#0891b2'];

/**
 * @param {{profile:object, toDisp:(m:number)=>number, unit:string, depthPositive:boolean}} p
 */
export default function SectionChart({ profile, toDisp, unit, depthPositive }) {
  const ref = useRef(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    read();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  if (!profile) return null;
  const data = profile.rows.map((r) => {
    const o = { km: Number((r.distM / 1000).toFixed(3)) };
    profile.series.forEach((s) => { o[s.key] = r[s.key] == null ? null : Number(toDisp(r[s.key]).toFixed(1)); });
    return o;
  });
  let lo = Infinity; let hi = -Infinity; let loM = Infinity; let hiM = -Infinity;
  profile.rows.forEach((r) => profile.series.forEach((s) => {
    const v = r[s.key]; if (v == null) return;
    const d = toDisp(v); lo = Math.min(lo, d); hi = Math.max(hi, d); loM = Math.min(loM, v); hiM = Math.max(hiM, v);
  }));
  const ve = Number.isFinite(loM) ? verticalExaggeration({ lengthM: profile.lengthM, zRangeM: Math.max(hiM - loM, 1), widthPx: Math.max(box.w - 70, 1), heightPx: Math.max(box.h - 70, 1) }) : null;
  return (
    <div>
      <div ref={ref} className="relative h-64 bg-white rounded border border-slate-200" data-canvas="chart" data-testid="map-section-chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 22, right: 8, left: 2, bottom: 4 }}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis dataKey="km" type="number" domain={[0, 'dataMax']} tick={AXIS} tickCount={5}
              label={{ value: 'Distance along the line (km)', position: 'insideBottom', offset: -2, style: AXIS }} height={34} />
            <YAxis tick={AXIS} width={44} tickCount={5} domain={Number.isFinite(lo) ? [Math.floor(lo), Math.ceil(hi)] : ['auto', 'auto']}
              reversed={depthPositive}
              label={{ value: depthPositive ? `Depth (${unit})` : `Elevation (${unit})`, position: 'top', offset: 10, dx: 20, style: AXIS }} />
            <Tooltip {...PINNED_TOOLTIP_PROPS} labelFormatter={(v) => `${v} km`} formatter={(v, name) => [v == null ? 'n/a' : `${v} ${unit}`, name]} />
            <Legend {...LEGEND_PROPS} height={22} />
            {profile.series.map((s, i) => (
              <Line key={s.key} dataKey={s.key} name={s.name} stroke={PALETTE[i % PALETTE.length]} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
            ))}
            {profile.wells.map((w) => (
              <ReferenceLine key={w.name} x={Number((w.alongM / 1000).toFixed(3))} stroke="#475569" strokeDasharray="3 3"
                label={{ value: w.name, position: 'insideTopRight', style: { ...AXIS, fill: '#334155' } }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
        <ChartLogo style={{ height: '20px', top: 4, bottom: 'auto', right: 12 }} />
      </div>
      <p className="text-[10px] text-pl-muted mt-1" data-testid="map-section-note">
        {`Section ${(profile.lengthM / 1000).toFixed(2)} km long; ${profile.wells.length} well${profile.wells.length === 1 ? '' : 's'} within 500 m posted. `}
        {ve ? `Vertical exaggeration about ${ve >= 10 ? Math.round(ve) : ve.toFixed(1)}x at this size.` : ''}
        {profile.series.filter((s) => !s.live).map((s) => ` ${s.name} does not reach the line.`).join('')}
      </p>
    </div>
  );
}
