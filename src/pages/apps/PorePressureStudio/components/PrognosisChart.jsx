// Pressure-vs-depth prognosis chart (white chartTheme + ChartLogo —
// the Suite chart standard). Depth increases downward; overburden,
// hydrostatic, pore pressure and fracture pressure in the display unit, the
// drilling window between PP and FG shaded, with
// manual calibration points (RFT/MDT) as dots. Recharts vertical
// layout: the numeric Y axis carries depth, each Line carries one
// pressure series.

import React, { useMemo } from 'react';
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
import { CHART_COLORS, CHART_TYPOGRAPHY, CHART_MARGINS } from '@/utils/chartTheme';
import {
  DEFAULT_UNITS, depthToDisplay, pressureToDisplay, pressureFromDisplay, pressureDigits, pressureLabel, emwReferenceDepthM, emwDatumLabel, isEmw,
} from '../services/units';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { thinIndices } from '../services/thin';

const SERIES = [
  { key: 'obg', name: 'Overburden', color: '#31363b' },
  { key: 'ph', name: 'Hydrostatic', color: '#2a9d8f' },
  { key: 'pp', name: 'Pore pressure', color: '#c1121f' },
  { key: 'fg', name: 'Fracture pressure', color: '#456990' },
];

export default function PrognosisChart({
  profile, zBmlM, calibration, units = DEFAULT_UNITS, params = null, casing = null,
}) {
  const pU = units.pressure;
  const zU = units.depth;
  const data = useMemo(() => {
    if (!profile) return [];
    const conv = (pa, zM) => { const v = pressureToDisplay(pa, pU, emwReferenceDepthM(zM, params)); return Number.isFinite(v) ? v : null; };
    const thinned = thinIndices(zBmlM.length);
    const rows = thinned.map((i) => {
      const z = zBmlM[i];
      return {
        z: depthToDisplay(z, zU),
        obg: conv(profile.overburdenPa[i], z),
        ph: conv(profile.hydrostaticPa[i], z),
        pp: conv(profile.porePressurePa[i], z),
        fg: conv(profile.fracPressurePa[i], z),
      };
    });
    // drilling window band between PP and FG (T1-E1)
    rows.forEach((r) => { if (r.pp != null && r.fg != null) r.win = [r.pp, r.fg]; });
    // U2-003: the planned mud (PP + trip margin) and the design fracture
    // line (FG - kick margin) below the conductor cut-off, in the display unit
    if (casing) {
      const fromPpg = (ppg, zM) => conv(pressureFromDisplay(ppg, 'ppg', emwReferenceDepthM(zM, params)), zM);
      const zLast = casing.zBmlM[casing.zBmlM.length - 1];
      rows.forEach((r, k) => {
        const zM = zBmlM[thinned[k]];
        if (!(zM >= casing.fromBmlM) || zM > zLast) return;
        const a = casing.at(zM);
        r.mw = fromPpg(a.mudPpg, zM);
        r.dfg = fromPpg(a.designFgPpg, zM);
      });
    }
    for (const c of calibration || []) {
      if (Number.isFinite(c.z) && Number.isFinite(c.pMpa)) {
        rows.push({ z: depthToDisplay(c.z, zU), cal: conv(c.pMpa * 1e6, c.z) });
      }
    }
    rows.sort((a, b) => a.z - b.z);
    return rows;
  }, [profile, zBmlM, calibration, pU, zU, params, casing]);
  const digits = pressureDigits(pU);
  const hasCal = data.some((r) => r.cal != null);

  if (!profile) return null;

  return (
    <div className="w-full h-full min-h-[360px] bg-white rounded-lg border border-slate-300 flex flex-col p-4 relative" data-canvas="chart" data-testid="pp-prognosis-chart" data-rows={data.length} data-seats={casing ? casing.seats.length : 0}>
      <h3 className="text-center text-sm font-semibold" style={{ color: CHART_COLORS.axisLabel }}>
        Pressure prognosis
      </h3>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} layout="vertical" margin={CHART_MARGINS.standard}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
            <XAxis
              type="number"
              domain={['auto', 'auto']}
              stroke={CHART_COLORS.axisLine}
              tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
              label={{ value: isEmw(pU) ? `${pressureLabel(pU)} below ${emwDatumLabel(params)}` : pressureLabel(pU), position: 'bottom', fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }}
            />
            {/* a vertical-layout numeric Y axis already runs top-down; the old
                `reversed` drew depth increasing upward (T1-001) */}
            <YAxis
              type="number"
              dataKey="z"
              domain={['auto', 'auto']}
              stroke={CHART_COLORS.axisLine}
              tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
              label={{ value: `Depth (${zU} below mudline)`, angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }}
            />
            <Tooltip
              contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, borderColor: CHART_COLORS.tooltipBorder, color: CHART_COLORS.tooltipText }}
              formatter={(v) => (Number.isFinite(v) ? `${v.toFixed(digits)} ${pU}` : EMPTY_VALUE)}
              labelFormatter={(v) => `${Number.isFinite(v) ? v.toFixed(zU === 'ft' ? 0 : 1) : v} ${zU} bml`}
            />
            <Legend verticalAlign="top" wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText }} />
            <Area dataKey="win" name="Drilling window (PP to FG)" stroke="none" fill="#22c55e" fillOpacity={0.12}
              connectNulls isAnimationActive={false} legendType="rect" />
            {SERIES.map((s) => (
              <Line
                key={s.key}
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                dot={false}
                strokeWidth={s.key === 'pp' ? 2 : 1.5}
                connectNulls
                isAnimationActive={false}
              />
            ))}
            {casing && <Line dataKey="mw" name="Mud weight (PP + trip margin)" stroke="#7c3aed" strokeWidth={1.5}
              strokeDasharray="4 2" dot={false} connectNulls isAnimationActive={false} />}
            {casing && <Line dataKey="dfg" name="Design FG (FG - kick margin)" stroke="#456990" strokeWidth={1.2}
              strokeDasharray="2 3" dot={false} connectNulls isAnimationActive={false} />}
            {casing && casing.seats.map((s, k) => (
              <ReferenceLine key={`seat-${k}`} y={depthToDisplay(s.zBmlM, zU)} stroke="#334155" strokeWidth={1.5}
                ifOverflow="extendDomain" label={{ value: `Shoe ${k + 1}`, position: 'insideTopRight', fill: '#334155', fontSize: 10 }} />
            ))}
            {/* a Scatter does not plot in a vertical-layout chart: a dot-only Line
                does (T1-002); no legend entry without points */}
            {hasCal && <Line dataKey="cal" name="Calibration" stroke="none" legendType="circle"
              dot={{ r: 4, fill: '#e76f51', stroke: '#9a3412' }} activeDot={false} isAnimationActive={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <ChartLogo />
    </div>
  );
}
