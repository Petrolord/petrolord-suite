// Main panel, Sizing tab: the selected bore's answer, then the same
// line swept across every schedule bore so choosing a size is reading
// a table rather than trusting one number.
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
} from 'recharts';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useLineSizing } from '@/contexts/LineSizingContext';
import { fmt, Stat, ErrorNote } from './fields';

const patternLabel = {
  segregated: 'Segregated', intermittent: 'Intermittent (slugging risk)',
  distributed: 'Distributed', transition: 'Transition', static: 'Static',
};

const ResultCards = () => {
  const { sizing, bore } = useLineSizing();
  if (bore.error) return <ErrorNote>{bore.error}</ErrorNote>;
  if (sizing.error) return <ErrorNote>{sizing.error}</ErrorNote>;

  if (sizing.mode === 'liquid') {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Pressure drop" value={fmt(sizing.dpTotalPsi, 1)} unit="psi" />
        <Stat label="Velocity" value={fmt(sizing.vFtS, 2)} unit="ft/s"
          accent={sizing.vFtS > sizing.maxVFtS ? 'text-amber-400' : 'text-slate-100'}
          hint={`limit ${fmt(sizing.maxVFtS, 0)} ft/s`} />
        <Stat label="Friction factor" value={fmt(sizing.f, 4)} hint={sizing.regime} />
        <Stat label="RP 14E status" value={sizing.exceeded ? 'EXCEEDED' : 'OK'}
          accent={sizing.exceeded ? 'text-red-400' : 'text-emerald-400'}
          hint={`erosional ${fmt(sizing.erosionalFtS, 1)} ft/s`} />
      </div>
    );
  }
  if (sizing.mode === 'gas') {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Outlet pressure" value={fmt(sizing.p2Psia, 1)} unit="psia" />
        <Stat label="Pressure drop" value={fmt(sizing.dpPsi, 1)} unit="psi" />
        <Stat label="Gradient" value={fmt(sizing.gradientPsiPerFt * 1000, 2)} unit="psi/1000 ft" />
        <Stat label="z used" value={fmt(sizing.zAvg, 3)} hint={sizing.zNote} />
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Stat label="Pressure drop" value={fmt(sizing.dpTotalPsi, 1)} unit="psi" />
      <Stat label="Flow pattern" value={patternLabel[sizing.pattern] || sizing.pattern}
        accent={sizing.pattern === 'intermittent' ? 'text-amber-400' : 'text-slate-100'} />
      <Stat label="Liquid holdup" value={fmt(sizing.holdup, 3)}
        hint={`no-slip ${fmt(sizing.lambdaL, 3)}`} />
      <Stat label="RP 14E status" value={sizing.exceeded ? 'EXCEEDED' : 'OK'}
        accent={sizing.exceeded ? 'text-red-400' : 'text-emerald-400'}
        hint={`mixture ${fmt(sizing.vm, 1)} of ${fmt(sizing.erosionalFtS, 1)} ft/s`} />
    </div>
  );
};

const SweepChart = () => {
  const { sweep } = useLineSizing();
  if (sweep.error) return null;
  const data = sweep.rows.map((r) => ({
    name: `${r.nps}" s${r.schedule}`,
    dp: Number.isFinite(r.dpPsi) ? r.dpPsi : null,
    v: Number.isFinite(r.vFtS) ? r.vFtS : null,
    pass: r.pass,
  }));
  const tick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };
  return (
    <ChartFrame height={280} exportFilename="line-sizing-sweep">
      <ComposedChart data={data} margin={{ top: 8, right: 40, bottom: 24, left: 8 }}>
        <CartesianGrid {...GRID_STYLE} />
        <XAxis dataKey="name" stroke={CHART_COLORS.axisLine} tick={{ ...tick, fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={54} />
        <YAxis yAxisId="dp" stroke={CHART_COLORS.axisLine} tick={tick}
          label={{ value: 'dP (psi)', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
        <YAxis yAxisId="v" orientation="right" stroke={CHART_COLORS.axisLine} tick={tick}
          label={{ value: 'velocity (ft/s)', angle: 90, position: 'insideRight', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
        <Tooltip {...TOOLTIP_STYLE} formatter={(v, n) => [fmt(v, 2), n]} />
        <Legend verticalAlign="top" />
        <Bar yAxisId="dp" dataKey="dp" name="Pressure drop (psi)">
          {data.map((d) => (
            <Cell key={d.name} fill={d.pass ? '#059669' : '#d97706'} />
          ))}
        </Bar>
        <Line yAxisId="v" dataKey="v" name="Velocity (ft/s)" stroke="#2563eb" dot={false} strokeWidth={2} />
      </ComposedChart>
    </ChartFrame>
  );
};

const SweepTable = () => {
  const { sweep } = useLineSizing();
  if (sweep.error) return <ErrorNote>{sweep.error}</ErrorNote>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
            <th className="py-2 pr-3">Size</th>
            <th className="py-2 pr-3">Bore (in)</th>
            <th className="py-2 pr-3">dP (psi)</th>
            <th className="py-2 pr-3">Velocity (ft/s)</th>
            <th className="py-2 pr-3">Erosional (ft/s)</th>
            <th className="py-2">Verdict</th>
          </tr>
        </thead>
        <tbody>
          {sweep.rows.map((r) => (
            <tr key={r.label} className={`border-b border-slate-800/60 ${sweep.recommended?.label === r.label ? 'bg-emerald-900/20' : ''}`}>
              <td className="py-1.5 pr-3 text-slate-300">{r.label}</td>
              <td className="py-1.5 pr-3 tabular-nums">{fmt(r.idIn, 3)}</td>
              <td className="py-1.5 pr-3 tabular-nums">{Number.isFinite(r.dpPsi) ? fmt(r.dpPsi, 1) : r.note || '--'}</td>
              <td className="py-1.5 pr-3 tabular-nums">{fmt(r.vFtS, 2)}</td>
              <td className="py-1.5 pr-3 tabular-nums">{fmt(r.erosionalFtS, 1)}</td>
              <td className={`py-1.5 font-semibold ${r.pass ? 'text-emerald-400' : 'text-amber-400'}`}>
                {r.pass ? (sweep.recommended?.label === r.label ? 'RECOMMENDED' : 'passes') : 'fails'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-slate-600 mt-2">
        The recommendation is the smallest bore that passes every stated limit. It is a
        hydraulic recommendation only; wall thickness is its own check on the Wall tab.
      </p>
    </div>
  );
};

const SizingPanel = () => (
  <div className="space-y-4">
    <Card className="bg-slate-900/60 border-slate-800">
      <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Selected line</CardTitle></CardHeader>
      <CardContent><ResultCards /></CardContent>
    </Card>
    <Card className="bg-slate-900/60 border-slate-800">
      <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Every schedule bore, same line</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <SweepChart />
        <SweepTable />
      </CardContent>
    </Card>
  </div>
);

export default SizingPanel;
