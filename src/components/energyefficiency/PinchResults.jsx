// Pinch targets, composite curves and the grand composite (DS8).
import React from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useEnergyEfficiency } from '@/contexts/EnergyEfficiencyContext';

const fmt = (v, dp = 1) => (Number.isFinite(v)
  ? v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })
  : 'n/a');

const Stat = ({ label, value, hint }) => (
  <div className="rounded border border-slate-800 bg-slate-900/60 p-3">
    <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
    <p className="text-lg font-semibold text-white">{value}</p>
    {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
  </div>
);

const PinchResults = () => {
  const { pinch, composites } = useEnergyEfficiency();
  const tick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };

  if (pinch.error) {
    return (
      <div className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
        <p className="text-sm text-amber-100">{pinch.error}</p>
      </div>
    );
  }

  // The cold composite is shifted right by the cold utility so the two
  // curves sit in the same enthalpy frame, which is what makes the overlap
  // the recoverable heat.
  const hot = composites.hot.points.map((p) => ({
    enthalpy: p.enthalpyKW + pinch.coldUtilityKW, hotC: p.temperatureC,
  }));
  const cold = composites.cold.points.map((p) => ({
    enthalpy: p.enthalpyKW, coldC: p.temperatureC,
  }));
  const curves = [...hot, ...cold].sort((a, b) => a.enthalpy - b.enthalpy);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Hot utility" value={`${fmt(pinch.hotUtilityKW)} kW`} hint="the minimum, at this approach" />
        <Stat label="Cold utility" value={`${fmt(pinch.coldUtilityKW)} kW`} />
        <Stat label="Heat recovered" value={`${fmt(pinch.heatRecoveredKW)} kW`} />
        <Stat label="Pinch"
          value={pinch.pinchHotC === null ? 'none' : `${fmt(pinch.pinchHotC, 0)} / ${fmt(pinch.pinchColdC, 0)} C`}
          hint={pinch.thresholdProblem ? 'threshold problem' : 'hot side / cold side'} />
      </div>

      <p className="text-[11px] text-slate-500">
        {pinch.crossPinchNote}
        {pinch.thresholdProblem && ' This stream set is a threshold problem: one of the utilities is zero, so there is no pinch constraining the design.'}
      </p>

      <div>
        <h3 className="text-sm font-semibold text-white mb-1">Composite curves</h3>
        <p className="text-[11px] text-slate-500 mb-2">
          The cold composite is shifted right by the cold utility so the two sit in one enthalpy
          frame. Where they overlap is heat the process can recover from itself; the tails are the
          utilities, and the closest vertical approach between them is the pinch.
        </p>
        <ChartFrame height={300} exportFilename="composite-curves">
          <LineChart data={curves} margin={{ top: 12, right: 24, left: 16, bottom: 32 }}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis dataKey="enthalpy" type="number" stroke={CHART_COLORS.axisLine} tick={tick}
              label={{ value: 'enthalpy (kW)', position: 'insideBottom', offset: -20, fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
            <YAxis stroke={CHART_COLORS.axisLine} tick={tick}
              label={{ value: 'temperature (C)', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
            <Tooltip {...TOOLTIP_STYLE} formatter={(v) => `${fmt(v)} C`} />
            <Legend verticalAlign="top" wrapperStyle={{ fontSize: '12px' }} />
            <Line type="monotone" dataKey="hotC" name="Hot composite" stroke="#dc2626" strokeWidth={2} dot={{ r: 2 }} connectNulls />
            <Line type="monotone" dataKey="coldC" name="Cold composite" stroke="#0891b2" strokeWidth={2} dot={{ r: 2 }} connectNulls />
          </LineChart>
        </ChartFrame>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white mb-1">Grand composite</h3>
        <p className="text-[11px] text-slate-500 mb-2">
          The heat cascade against shifted temperature. It touches zero at the pinch, which is
          exactly why the pinch is a constraint: no heat can flow through that point.
        </p>
        <ChartFrame height={280} exportFilename="grand-composite">
          <LineChart data={pinch.grandComposite} margin={{ top: 12, right: 24, left: 16, bottom: 32 }}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis dataKey="heatFlowKW" type="number" stroke={CHART_COLORS.axisLine} tick={tick}
              label={{ value: 'net heat flow (kW)', position: 'insideBottom', offset: -20, fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
            <YAxis dataKey="shiftedC" stroke={CHART_COLORS.axisLine} tick={tick}
              label={{ value: 'shifted temperature (C)', angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
            <Tooltip {...TOOLTIP_STYLE} />
            <ReferenceLine x={0} stroke="#f59e0b" strokeDasharray="4 4" />
            <Line type="monotone" dataKey="shiftedC" name="Cascade" stroke="#7c3aed" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ChartFrame>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white mb-1">The problem table</h3>
        <div className="overflow-x-auto rounded border border-slate-800">
          <table className="w-full text-xs">
            <thead className="bg-slate-900/80 text-slate-400">
              <tr>
                <th className="text-right px-2 py-1.5">Top (shifted C)</th>
                <th className="text-right px-2 py-1.5">Bottom</th>
                <th className="text-right px-2 py-1.5">CP hot</th>
                <th className="text-right px-2 py-1.5">CP cold</th>
                <th className="text-right px-2 py-1.5">Surplus (kW)</th>
                <th className="text-right px-2 py-1.5">Cascade (kW)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {pinch.intervals.map((iv) => (
                <tr key={`${iv.topShiftedC}-${iv.bottomShiftedC}`}
                  className={Math.abs(iv.cascadeKW) < 1e-6 ? 'bg-amber-950/25' : ''}>
                  <td className="px-2 py-1 text-right text-slate-300">{fmt(iv.topShiftedC, 1)}</td>
                  <td className="px-2 py-1 text-right text-slate-300">{fmt(iv.bottomShiftedC, 1)}</td>
                  <td className="px-2 py-1 text-right text-slate-400">{fmt(iv.cpHotKWperK, 2)}</td>
                  <td className="px-2 py-1 text-right text-slate-400">{fmt(iv.cpColdKWperK, 2)}</td>
                  <td className="px-2 py-1 text-right text-slate-300">{fmt(iv.surplusKW, 1)}</td>
                  <td className="px-2 py-1 text-right text-white">{fmt(iv.cascadeKW, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-500 mt-1">
          {`Energy balance closes to ${fmt(pinch.balanceCheck, 3)} kW: hot utility plus hot streams equals cold utility plus cold streams.`}
        </p>
      </div>
    </div>
  );
};

export default PinchResults;
