// Pressure-vs-depth prognosis chart (white chartTheme + ChartLogo —
// the Suite chart standard). Depth increases downward; overburden,
// hydrostatic, pore pressure and fracture pressure in MPa, with
// manual calibration points (RFT/MDT) as dots. Recharts vertical
// layout: the numeric Y axis carries depth, each Line carries one
// pressure series.

import React, { useMemo } from 'react';
import {
  ComposedChart, Line, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import ChartLogo from '@/components/charts/ChartLogo';
import { CHART_COLORS, CHART_TYPOGRAPHY, CHART_MARGINS } from '@/utils/chartTheme';

const MPA = 1e6;

const SERIES = [
  { key: 'obg', name: 'Overburden', color: '#31363b' },
  { key: 'ph', name: 'Hydrostatic', color: '#2a9d8f' },
  { key: 'pp', name: 'Pore pressure', color: '#c1121f' },
  { key: 'fg', name: 'Fracture pressure', color: '#456990' },
];

export default function PrognosisChart({ profile, zBmlM, calibration }) {
  const data = useMemo(() => {
    if (!profile) return [];
    const rows = zBmlM.map((z, i) => ({
      z,
      obg: profile.overburdenPa[i] / MPA,
      ph: profile.hydrostaticPa[i] / MPA,
      pp: profile.porePressurePa[i] / MPA,
      fg: profile.fracPressurePa[i] / MPA,
    }));
    for (const c of calibration || []) {
      if (Number.isFinite(c.z) && Number.isFinite(c.pMpa)) {
        rows.push({ z: c.z, cal: c.pMpa });
      }
    }
    rows.sort((a, b) => a.z - b.z);
    return rows;
  }, [profile, zBmlM, calibration]);

  if (!profile) return null;

  return (
    <div className="w-full h-full min-h-[360px] bg-white rounded-lg border border-slate-300 flex flex-col p-4 relative" data-testid="pp-prognosis-chart">
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
              label={{ value: 'Pressure (MPa)', position: 'bottom', fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }}
            />
            <YAxis
              type="number"
              dataKey="z"
              reversed
              domain={['auto', 'auto']}
              stroke={CHART_COLORS.axisLine}
              tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
              label={{ value: 'Depth (m below mudline)', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisLabel, fontSize: CHART_TYPOGRAPHY.labelFontSize }}
            />
            <Tooltip contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, borderColor: CHART_COLORS.tooltipBorder, color: CHART_COLORS.tooltipText }} />
            <Legend verticalAlign="top" wrapperStyle={{ fontSize: CHART_TYPOGRAPHY.legendFontSize, color: CHART_COLORS.legendText }} />
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
            <Scatter dataKey="cal" name="Calibration" fill="#e76f51" isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <ChartLogo />
    </div>
  );
}
