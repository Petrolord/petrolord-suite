// The inventory, its audit status, and the intensity (DS9).
import React from 'react';
import { AlertTriangle, CheckCircle2, FileWarning } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell as BarCell } from 'recharts';
import ChartFrame from '@/components/charts/ChartFrame';
import { CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE } from '@/utils/chartTheme';
import { useCarbonAbatement } from '@/contexts/CarbonAbatementContext';

const fmt = (v, dp = 1) => (Number.isFinite(v)
  ? v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })
  : 'not available');

const Stat = ({ label, value, hint }) => (
  <div className="rounded border border-slate-800 bg-slate-900/60 p-3">
    <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
    <p className="text-lg font-semibold text-white">{value}</p>
    {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
  </div>
);

const InventoryResults = () => {
  const { inventory, intensity, combustion, flare } = useCarbonAbatement();
  const tick = { fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize };

  const chartRows = inventory.lines
    .filter((l) => Number.isFinite(l.tCo2e) && l.tCo2e > 0)
    .map((l) => ({ label: l.label, tCo2e: l.tCo2e }))
    .sort((a, b) => b.tCo2e - a.tCo2e);

  return (
    <div className="space-y-5">
      <div className={`rounded-lg border p-4 flex items-start gap-3 ${
        inventory.reportable
          ? 'border-emerald-800/60 bg-emerald-950/30'
          : 'border-amber-800/60 bg-amber-950/30'}`}
      >
        {inventory.reportable
          ? <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
          : <FileWarning className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />}
        <div>
          <p className="font-semibold text-white">
            {inventory.reportable
              ? `Computed and reportable: ${fmt(inventory.totalTonnes, 0)} tCO2e`
              : `Computed but NOT reportable: ${fmt(inventory.totalTonnes, 0)} tCO2e`}
          </p>
          <p className="text-sm text-slate-300 mt-1">
            {inventory.reportable
              ? `On ${inventory.gwpSetLabel}. Every factor carries a source and a version.`
              : `Because ${inventory.notReportableBecause.join('; ')}. The arithmetic is complete; it is not something to file.`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Scope 1" value={`${fmt(inventory.scope1Tonnes, 0)} t`} hint="direct" />
        <Stat label="Scope 2" value={`${fmt(inventory.scope2Tonnes, 0)} t`} hint="purchased energy" />
        <Stat label="Total" value={`${fmt(inventory.totalTonnes, 0)} t`} />
        <Stat label="Potentials" value={inventory.gwpSetLabel || 'not declared'} />
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white mb-1">Where the emissions are</h3>
        <p className="text-[11px] text-slate-500 mb-2">
          {combustion.error ? '' : combustion.method}
          {' '}
          Factors are reserved for the things that really are empirical.
        </p>
        <ChartFrame height={280} exportFilename="emissions-by-source">
          <BarChart data={chartRows} layout="vertical" margin={{ top: 12, right: 24, left: 120, bottom: 24 }}>
            <CartesianGrid {...GRID_STYLE} />
            <XAxis type="number" stroke={CHART_COLORS.axisLine} tick={tick}
              label={{ value: 'tCO2e/yr', position: 'insideBottom', offset: -12, fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }} />
            <YAxis type="category" dataKey="label" stroke={CHART_COLORS.axisLine} tick={tick} width={115} />
            <Tooltip {...TOOLTIP_STYLE} formatter={(v) => `${fmt(v, 0)} t`} />
            <Bar dataKey="tCO2e" name="tCO2e">
              {chartRows.map((r) => (
                <BarCell key={r.label} fill={r.label.includes('CH4') ? '#dc2626' : '#0891b2'} />
              ))}
            </Bar>
          </BarChart>
        </ChartFrame>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white mb-1">The inventory</h3>
        <div className="overflow-x-auto rounded border border-slate-800">
          <table className="w-full text-xs">
            <thead className="bg-slate-900/80 text-slate-400">
              <tr>
                <th className="text-left px-2 py-1.5">Source</th>
                <th className="text-right px-2 py-1.5">Scope</th>
                <th className="text-left px-2 py-1.5">Gas</th>
                <th className="text-right px-2 py-1.5">GWP</th>
                <th className="text-right px-2 py-1.5">tCO2e</th>
                <th className="text-left px-2 py-1.5">Provenance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {inventory.lines.map((l) => (
                <tr key={l.label} className={l.blockedBy || !l.provenanceComplete ? 'bg-amber-950/20' : ''}>
                  <td className="px-2 py-1 text-slate-200">{l.label}</td>
                  <td className="px-2 py-1 text-right text-slate-400">{l.scope}</td>
                  <td className="px-2 py-1 text-slate-400">{l.gas}</td>
                  <td className="px-2 py-1 text-right text-slate-400">{l.gwp === null ? '-' : l.gwp}</td>
                  <td className="px-2 py-1 text-right text-white">
                    {l.blockedBy ? l.blockedBy : fmt(l.tCo2e, 0)}
                  </td>
                  <td className="px-2 py-1 text-slate-400">
                    {l.provenanceComplete ? l.source : `missing ${l.missingProvenance.join(' and ')}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {inventory.blockedLines.length > 0 && (
          <p className="text-[11px] text-amber-300 mt-2 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            A blocked line is left out of the total rather than counted as zero, because those are
            different statements.
          </p>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white mb-1">Carbon intensity</h3>
        {intensity.error ? (
          <div className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-100">{intensity.error}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Stat label="Scope 1" value={fmt(intensity.scope1Intensity, 4)} hint={intensity.unit} />
              <Stat label="Scope 2" value={fmt(intensity.scope2Intensity, 4)} hint={intensity.unit} />
              <Stat label="Total" value={fmt(intensity.totalIntensity, 4)} hint={intensity.unit} />
            </div>
            <p className="text-[11px] text-slate-500 mt-2">{intensity.comparabilityNote}</p>
          </>
        )}
      </div>

      <p className="text-[11px] text-amber-200/90 border border-amber-900/50 bg-amber-950/20 rounded p-2">
        {inventory.disclaimer}
      </p>
      {flare.error && (
        <p className="text-[11px] text-slate-500">{`Flaring: ${flare.error}`}</p>
      )}
    </div>
  );
};

export default InventoryResults;
